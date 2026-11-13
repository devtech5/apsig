import { BadRequestException, Body, Controller, Get, Injectable, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CIBLES, FORFAIT_UNIQUE, MOYENS_PAIEMENT, type Cible } from "@apsig/domain";
import { AbonnementsModule } from "../abonnements/abonnements.module.ts";
import { AbonnementsService } from "../abonnements/abonnements.service.ts";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

const texte = (max: number) => z.string().trim().min(1).max(max);
const telephone = z.string().trim().regex(/^\+?[0-9 .-]{8,20}$/, "Numéro de téléphone invalide");

const recensement = z.object({
  cible: z.enum(CIBLES),
  prenom: texte(60),
  nom: texte(60),
  telephone,
  quartierId: z.string().min(1),
  adresse: z.string().trim().max(300).optional().transform((v) => (v ? v : null)),
  // Encaissement de l'offre de lancement au moment du recensement.
  paiement: z
    .object({
      operateur: z.enum(MOYENS_PAIEMENT),
      reference: z.string().trim().min(3).max(64).optional(),
      telephone: telephone.optional(),
    })
    .nullable(),
});

// Inscription en deux temps. 1. Recensement : l'agent enregistre le client (nom, lieu, encaissement) ; le foyer est créé
// avec son code Code-Secours, celui de la plaque (DAL-LOBIA-053). 2. Pose : l'agent fixe la plaque et la scanne,
// le GPS relevé devient l'adresse vérifiée (PoseService).
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
        { recensement: true },
      );
    } else {
      // Non payé : le client est réservé, sa plaque et son QR intérieur existent déjà ; l'abonnement sera ouvert à l'encaissement.
      const cree = await this.abonnements.creerFoyer(donnees, u, { recensement: true });
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
        supports: { where: { type: "PORTAIL" }, include: { pose: true }, orderBy: { creeLe: "asc" }, take: 1 },
        paiements: { where: { statut: "REUSSI" }, select: { id: true }, take: 1 },
        abonnements: { orderBy: { fin: "desc" }, take: 1, include: { formule: true } },
      },
    });
    const t = f.membres[0];
    const plaque = f.supports[0];
    const cible = f.abonnements[0]?.formule.code.replace(/^UNIQUE_/, "") as Cible | undefined;
    return {
      id: f.id,
      code: plaque?.code ?? null,
      client: t ? `${t.prenom} ${t.nom}` : f.libelle,
      telephone: t?.telephone ?? null,
      lieu: [f.quartier.nom, f.quartier.commune?.nom, f.quartier.ville.nom].filter(Boolean).join(", "),
      cible: cible && (CIBLES as readonly string[]).includes(cible) ? cible : null,
      paye: f.paiements.length > 0,
      posee: Boolean(plaque?.pose),
      creeLe: f.creeLe,
    };
  }
}

@Controller("pose")
@UseGuards(BackOfficeGuard)
@EspaceRequis("pose")
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
