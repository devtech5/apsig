import { BadRequestException, Body, Controller, Get, Injectable, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CIBLES, FORFAIT_UNIQUE, MOYENS_PAIEMENT, urlAlerte, type Cible } from "@apsig/domain";
import { AbonnementsModule } from "../abonnements/abonnements.module.ts";
import { AbonnementsService } from "../abonnements/abonnements.service.ts";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { config } from "../config.ts";
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
    quartierId: z.string().min(1),
    // Adresse ou repère, le plus précis possible : c'est ce qui guide l'agent au second passage.
    adresse: z.string().trim().min(5, "Adresse ou repère trop court : soyez le plus précis possible").max(300),
    // Encaissement de l'offre de lancement au moment du recensement.
    paiement: z
      .object({
        operateur: z.enum(MOYENS_PAIEMENT),
        reference: z.string().trim().min(3).max(64).optional(),
        telephone: telephone.optional(),
      })
      .nullable(),
  })
  .refine((d) => d.cible !== "ENTREPRISE" || d.rccm, { message: "Numéro du registre du commerce requis pour une entreprise", path: ["rccm"] });

// Inscription en deux temps. 1. Recensement : l'agent enregistre le client (identité, RCCM pour une entreprise, lieu,
// encaissement) ; le foyer est créé avec son code Code-Secours, celui de la plaque (DAL-LOBIA-053), et ses QR.
// 2. Pose : l'agent saisit le code de la plaque, relève le GPS et photographie la plaque et la remise des QR (PoseService).
@Injectable()
export class RecensementService {
  constructor(
    private readonly db: PrismaService,
    private readonly abonnements: AbonnementsService,
  ) {}

  // Villes, communes et quartiers du référentiel APSIG, pour les listes de l'agent.
  async referentiel() {
    const villes = await this.db.ville.findMany({
      orderBy: { nom: "asc" },
      include: { communes: { orderBy: { nom: "asc" } }, quartiers: { orderBy: { nom: "asc" } } },
    });
    return villes.map((v) => ({
      id: v.id,
      nom: v.nom,
      communes: v.communes.map((c) => ({ id: c.id, nom: c.nom })),
      quartiers: v.quartiers.map((q) => ({ id: q.id, nom: q.nom, communeId: q.communeId })),
    }));
  }

  async recenser(d: z.infer<typeof recensement>, u: UtilisateurConnecte) {
    const formule = await this.db.formule.findUnique({ where: { code: `UNIQUE_${d.cible}` } });
    if (!formule?.actif) throw new BadRequestException("Forfait introuvable : prévenir la centrale");
    const donnees = {
      libelle: `${d.prenom} ${d.nom}`,
      adresse: d.adresse,
      quartierId: d.quartierId,
      titulaire: { prenom: d.prenom, nom: d.nom, telephone: d.telephone },
    };
    const opts = { recensement: true, rccm: d.rccm, telephone2: d.telephone2 };
    let foyer;
    if (d.paiement) {
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
      // Non payé : le client est réservé, sa plaque et son QR intérieur existent déjà ; l'abonnement sera ouvert à l'encaissement.
      const cree = await this.abonnements.creerFoyer(donnees, u, opts);
      for (const [type] of FORFAIT_UNIQUE.supports) await this.abonnements.ajouterSupport(cree.id, { type }, u);
      foyer = await this.abonnements.detail(cree.id);
    }
    return this.resume(foyer.id);
  }

  // Derniers clients recensés par l'agent, avec leur état : payé, plaque posée.
  async mesRecensements(u: UtilisateurConnecte) {
    const foyers = await this.db.foyer.findMany({ where: { recenseParId: u.id }, orderBy: { creeLe: "desc" }, take: 50, select: { id: true } });
    return Promise.all(foyers.map((f) => this.resume(f.id)));
  }

  private async resume(id: string) {
    const f = await this.db.foyer.findUniqueOrThrow({
      where: { id },
      include: {
        quartier: { include: { ville: true, commune: true } },
        membres: { where: { role: "TITULAIRE" }, take: 1 },
        supports: { where: { type: { in: ["PORTAIL", "INTERIEUR"] } }, include: { pose: true }, orderBy: { creeLe: "asc" } },
        paiements: { where: { statut: "REUSSI" }, select: { id: true }, take: 1 },
        abonnements: { orderBy: { fin: "desc" }, take: 1, include: { formule: true } },
      },
    });
    const t = f.membres[0];
    const plaque = f.supports.find((s) => s.type === "PORTAIL");
    const interieur = f.supports.find((s) => s.type === "INTERIEUR");
    const cible = f.abonnements[0]?.formule.code.replace(/^UNIQUE_/, "") as Cible | undefined;
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
      paye: f.paiements.length > 0,
      posee: Boolean(plaque?.pose),
      creeLe: f.creeLe,
    };
  }
}

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
  mesRecensements(@Utilisateur() u: UtilisateurConnecte) {
    return this.service.mesRecensements(u);
  }

  @Post("recensements")
  recenser(@Body(new ZodPipe(recensement)) body: z.infer<typeof recensement>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.recenser(body, u);
  }
}

@Module({ imports: [AbonnementsModule], controllers: [RecensementController], providers: [RecensementService] })
export class RecensementModule {}
