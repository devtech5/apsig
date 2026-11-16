import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@apsig/db";
import { CIBLES, cleLieu, COMMUNES_CI, FORFAIT_UNIQUE, MOYENS_PAIEMENT, urlAlerte, VILLES_CI, type Cible, type Role } from "@apsig/domain";
import { AbonnementsModule } from "../abonnements/abonnements.module.ts";
import { AbonnementsService } from "../abonnements/abonnements.service.ts";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { config } from "../config.ts";
import { quartierDe } from "../lieux/lieux.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

const texte = (max: number) => z.string().trim().min(1).max(max);
const telephone = z.string().trim().regex(/^\+?[0-9 .-]{8,20}$/, "Numéro de téléphone invalide");

const recensement = z
  .object({
    cible: z.enum(CIBLES),
    // Entreprise et autres organisations : numéro du registre du commerce (RCCM).
    rccm: z.string().trim().max(40).optional().transform((v) => (v ? v.toUpperCase() : null)),
    prenom: texte(60),
    nom: texte(60),
    telephone,
    telephone2: z.union([z.literal(""), telephone]).optional().transform((v) => (v ? v : null)),
    // Lieu par son nom, choisi dans la liste ou saisi : une ville, une commune ou un quartier absent du référentiel y est ajouté.
    lieu: z
      .object({
        ville: texte(80),
        commune: z.string().trim().max(80).optional().nullable().transform((v) => (v ? v : null)),
        quartier: texte(80),
      })
      .optional(),
    // Ancienne forme (application mobile non mise à jour) : quartier déjà connu.
    quartierId: z.string().min(1).optional(),
    // Adresse ou repère, le plus précis possible : c'est ce qui guide l'agent au second passage.
    adresse: z.string().trim().min(5, "Adresse ou repère trop court : soyez le plus précis possible").max(300),
    // Encaissement de l'offre de lancement au moment du recensement.
    paiement: z
      .object({
        operateur: z.enum(MOYENS_PAIEMENT),
        // Montant encaissé : 10 000 F (forfait soldé) ou moins (acompte / avance). Absent : 10 000 F.
        montantFcfa: z.number().int().min(100).max(FORFAIT_UNIQUE.abonnementFcfa).optional(),
        reference: z.string().trim().min(3).max(64).optional(),
        telephone: telephone.optional(),
      })
      .nullable(),
  })
  .refine((d) => d.cible !== "ENTREPRISE" || d.rccm, { message: "Numéro du registre du commerce requis pour une entreprise", path: ["rccm"] })
  .refine((d) => d.lieu || d.quartierId, { message: "Ville et quartier requis", path: ["lieu"] });

// Inscription en deux temps. 1. Recensement : l'agent enregistre le client (identité, RCCM pour une entreprise, lieu,
// encaissement) ; le foyer est créé avec son code Code-Secours, celui de la plaque (DAL-LOBIA-053), et ses QR.
// 2. Pose : l'agent saisit le code de la plaque, relève le GPS et photographie la plaque et la remise des QR (PoseService).
@Injectable()
export class RecensementService {
  constructor(
    private readonly db: PrismaService,
    private readonly abonnements: AbonnementsService,
  ) {}

  // Listes de l'agent : toutes les villes de Côte d'Ivoire (liste de départ et référentiel APSIG), leurs communes
  // et leurs quartiers déjà connus. Les noms suffisent : un lieu absent est ajouté au recensement.
  async referentiel() {
    const villes = await this.db.ville.findMany({ include: { communes: true, quartiers: { include: { commune: true } } } });
    const parCle = new Map(villes.map((v) => [cleLieu(v.nom), v]));
    const noms = [...new Set([...VILLES_CI, ...villes.map((v) => v.nom)].map((n) => parCle.get(cleLieu(n))?.nom ?? n))];
    const tri = (a: string, b: string) => a.localeCompare(b, "fr");
    return noms.sort(tri).map((nom) => {
      const v = parCle.get(cleLieu(nom));
      const communes = new Map((COMMUNES_CI[nom] ?? []).map((c) => [cleLieu(c), c]));
      for (const c of v?.communes ?? []) communes.set(cleLieu(c.nom), c.nom);
      return {
        nom,
        communes: [...communes.values()].sort(tri),
        quartiers: (v?.quartiers ?? []).map((q) => ({ nom: q.nom, commune: q.commune?.nom ?? null })).sort((a, b) => tri(a.nom, b.nom)),
      };
    });
  }

  // Ville, commune et quartier retrouvés par leur nom (sans tenir compte des accents ni de la casse), créés s'ils manquent.
  private async quartierDe(lieu: { ville: string; commune: string | null; quartier: string }, u: UtilisateurConnecte) {
    return this.db.$transaction(async (tx) => {
      const ajoutes: string[] = [];
      const { villeNom, quartierId } = await quartierDe(tx, lieu, ajoutes);
      if (ajoutes.length) await tx.audit.create({ data: { action: "lieu.ajouter", cible: villeNom, auteurId: u.id, details: { ajoutes } } });
      return quartierId;
    });
  }

  async recenser(d: z.infer<typeof recensement>, u: UtilisateurConnecte) {
    const formule = await this.db.formule.findUnique({ where: { code: `UNIQUE_${d.cible}` } });
    if (!formule?.actif) throw new BadRequestException("Forfait introuvable : prévenir la centrale");
    const quartierId = d.lieu ? await this.quartierDe(d.lieu, u) : d.quartierId!;
    const donnees = {
      libelle: `${d.prenom} ${d.nom}`,
      adresse: d.adresse,
      quartierId,
      titulaire: { prenom: d.prenom, nom: d.nom, telephone: d.telephone },
    };
    const opts = { recensement: true, rccm: d.rccm, telephone2: d.telephone2, cible: d.cible };
    const montant = d.paiement ? (d.paiement.montantFcfa ?? FORFAIT_UNIQUE.abonnementFcfa) : 0;
    let foyer;
    if (d.paiement && montant >= FORFAIT_UNIQUE.abonnementFcfa) {
      // Payé : l'abonnement démarre (premier mois compris) et la formule crée ses supports, dont la plaque.
      foyer = await this.abonnements.creerFoyer(
        {
          ...donnees,
          souscription: {
            formuleId: formule.id,
            mois: Math.max(1, formule.moisInclus),
            paiement: { montantFcfa: FORFAIT_UNIQUE.abonnementFcfa, operateur: d.paiement.operateur, reference: d.paiement.reference, telephone: d.paiement.telephone },
          },
        },
        u,
        opts,
      );
    } else {
      // Acompte ou rien encaissé : le client est réservé, sa plaque et son QR intérieur existent déjà ; l'abonnement
      // s'ouvrira quand le solde sera payé (espace Abonnements).
      if (d.paiement?.reference && (await this.db.paiement.findUnique({ where: { refFournisseur: d.paiement.reference } }))) {
        throw new ConflictException("Cette référence de paiement est déjà enregistrée");
      }
      const cree = await this.abonnements.creerFoyer(donnees, u, opts);
      for (const [type] of FORFAIT_UNIQUE.supports) await this.abonnements.ajouterSupport(cree.id, { type }, u);
      if (d.paiement) {
        await this.db.paiement.create({
          data: {
            foyerId: cree.id,
            montantFcfa: montant,
            operateur: d.paiement.operateur,
            telephone: d.paiement.telephone ?? null,
            refFournisseur: d.paiement.reference ?? null,
            statut: "REUSSI",
            payeLe: new Date(),
          },
        });
        await this.db.audit.create({ data: { action: "paiement.acompte", cible: cree.id, auteurId: u.id, details: { montantFcfa: montant, operateur: d.paiement.operateur } } });
      }
      foyer = await this.abonnements.detail(cree.id);
    }
    return this.resume(foyer.id);
  }

  // Clients recensés, du plus récent au plus ancien, avec leur code de plaque, leurs QR et leur état (payé, plaque posée).
  // Le recenseur voit ses clients, le chef d'équipe ceux de son équipe, le QG (administration, conseillers) tous.
  // Recherche facultative : nom, code de plaque ou téléphone.
  async recensements(u: UtilisateurConnecte, q?: string) {
    const foyers = await this.db.foyer.findMany({
      where: { AND: [this.portee(u), ...(q ? [rechercheClient(q)] : [])] },
      orderBy: { creeLe: "desc" },
      take: LISTE_MAX,
      include: INCLUS_RESUME,
    });
    return foyers.map((f) => this.presenter(f));
  }

  private portee(u: UtilisateurConnecte): Prisma.FoyerWhereInput {
    if (TOUS_LES_CLIENTS.includes(u.role)) return { recenseParId: { not: null } };
    if (u.role === "CHEF_EQUIPE") return { OR: [{ recenseParId: u.id }, { recensePar: { is: { chefId: u.id } } }] };
    return { recenseParId: u.id };
  }

  private async resume(id: string) {
    return this.presenter(await this.db.foyer.findUniqueOrThrow({ where: { id }, include: INCLUS_RESUME }));
  }

  private presenter(f: Prisma.FoyerGetPayload<{ include: typeof INCLUS_RESUME }>) {
    const t = f.membres[0];
    const plaque = f.supports.find((s) => s.type === "PORTAIL");
    const interieur = f.supports.find((s) => s.type === "INTERIEUR");
    const cible = (f.cible ?? f.abonnements[0]?.formule.code.replace(/^UNIQUE_/, "")) as Cible | undefined;
    const encaisseFcfa = f.paiements.reduce((t, p) => t + p.montantFcfa, 0);
    // Soldé : l'abonnement est ouvert. Sinon, reste à payer sur le forfait de lancement.
    const solde = f.abonnements.length > 0;
    return {
      id: f.id,
      code: plaque?.code ?? null,
      // Adresses encodées dans les QR, générés dès la validation (plaque du portail et QR intérieur).
      qr: {
        plaque: plaque ? urlAlerte(config.publicAlertUrl, plaque.jeton) : null,
        interieur: interieur ? { code: interieur.code, url: urlAlerte(config.publicAlertUrl, interieur.jeton) } : null,
      },
      rccm: f.rccm,
      client: t ? `${t.prenom} ${t.nom}` : f.libelle,
      telephone: t?.telephone ?? null,
      telephone2: t?.telephone2 ?? null,
      lieu: [f.quartier.nom, f.quartier.commune?.nom, f.quartier.ville.nom].filter(Boolean).join(", "),
      cible: cible && (CIBLES as readonly string[]).includes(cible) ? cible : null,
      paye: solde,
      encaisseFcfa,
      resteFcfa: solde ? 0 : Math.max(0, FORFAIT_UNIQUE.abonnementFcfa - encaisseFcfa),
      posee: Boolean(plaque?.pose),
      recenseur: f.recensePar?.nom ?? null,
      creeLe: f.creeLe,
    };
  }
}

const LISTE_MAX = 100;
const TOUS_LES_CLIENTS: readonly Role[] = ["CONSEILLER", "ADMIN", "SUPERADMIN"];

const INCLUS_RESUME = {
  quartier: { include: { ville: true, commune: true } },
  membres: { where: { role: "TITULAIRE" }, take: 1 },
  supports: { where: { type: { in: ["PORTAIL", "INTERIEUR"] } }, include: { pose: true }, orderBy: { creeLe: "asc" } },
  paiements: { where: { statut: "REUSSI" }, select: { montantFcfa: true } },
  abonnements: { orderBy: { fin: "desc" }, take: 1, include: { formule: true } },
  recensePar: { select: { nom: true } },
} satisfies Prisma.FoyerInclude;

// Un mot de la recherche : nom du client, code de plaque (« abj-yop-niangon-453 »), ou téléphone (au moins 4 chiffres).
function rechercheClient(q: string): Prisma.FoyerWhereInput {
  const texte = q.trim().slice(0, 80);
  const chiffres = texte.replace(/\D/g, "");
  return {
    OR: [
      { libelle: { contains: texte, mode: "insensitive" } },
      { supports: { some: { code: { contains: texte.toUpperCase().replace(/\s+/g, "") } } } },
      ...(chiffres.length >= 4 ? [{ membres: { some: { telephone: { contains: chiffres.slice(-8) } } } }] : []),
    ],
  };
}

const recherche = z.object({ q: z.string().trim().max(80).optional().transform((v) => (v ? v : undefined)) });

// Routes sous /pose (l'application mobile les appelle déjà) mais ouvertes à l'espace Recensement : le recenseur y a accès,
// pas à la pose des plaques.
@Controller("pose")
@UseGuards(BackOfficeGuard)
@EspaceRequis("recensement")
export class RecensementController {
  constructor(private readonly service: RecensementService) {}

  @Get("referentiel")
  referentiel() {
    return this.service.referentiel();
  }

  @Get("recensements")
  recensements(@Query(new ZodPipe(recherche)) { q }: z.infer<typeof recherche>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.recensements(u, q);
  }

  @Post("recensements")
  recenser(@Body(new ZodPipe(recensement)) body: z.infer<typeof recensement>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.recenser(body, u);
  }
}

@Module({ imports: [AbonnementsModule], controllers: [RecensementController], providers: [RecensementService] })
export class RecensementModule {}
