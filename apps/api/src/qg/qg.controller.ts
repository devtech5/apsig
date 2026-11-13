import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { TypePartenaire } from "@apsig/db";
import { COMMISSION_PLAQUE_FCFA, FORFAIT_UNIQUE, STATUTS_UNITE, TYPES_SUPPORT, TYPES_UNITE } from "@apsig/domain";
import { AdministrationModule } from "../administration/administration.module.ts";
import { AdministrationService } from "../administration/administration.service.ts";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

// QG (base.apsig.online) : pilotage du projet. Finance, forfaits et abonnements, prestataires et intervenants.

const JOUR = 86_400_000;
const debutMois = (d: Date, decalage = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + decalage, 1));

// ─── Finance ────────────────────────────────────────────────────────────────

@Injectable()
export class FinanceService {
  constructor(private readonly db: PrismaService) {}

  async tableau() {
    const maintenant = new Date();
    const depuis = debutMois(maintenant, -5);
    const [paiements, parMoyen, recents, sansAbonnement, recenseurs, poseurs, abonnementsEnCours] = await Promise.all([
      this.db.paiement.findMany({ where: { statut: "REUSSI", payeLe: { gte: depuis } }, select: { montantFcfa: true, payeLe: true } }),
      this.db.paiement.groupBy({ by: ["operateur"], where: { statut: "REUSSI" }, _sum: { montantFcfa: true }, _count: true }),
      this.db.paiement.findMany({
        where: { statut: "REUSSI" },
        orderBy: { payeLe: "desc" },
        take: 50,
        include: { foyer: { select: { id: true, libelle: true } }, abonnement: { select: { id: true } } },
      }),
      // Clients pas encore soldés : acompte versé ou rien encaissé.
      this.db.foyer.findMany({
        where: { abonnements: { none: {} }, recenseParId: { not: null } },
        orderBy: { creeLe: "asc" },
        take: 300,
        include: {
          membres: { where: { role: "TITULAIRE" }, take: 1 },
          paiements: { where: { statut: "REUSSI" }, select: { montantFcfa: true } },
          supports: { where: { type: "PORTAIL" }, select: { code: true }, take: 1 },
          recensePar: { select: { nom: true } },
        },
      }),
      this.db.utilisateur.findMany({ where: { role: "RECENSEUR" }, select: { id: true, nom: true, actif: true } }),
      this.db.utilisateur.findMany({ where: { role: "AGENT" }, select: { id: true, nom: true, actif: true } }),
      this.db.abonnement.findMany({
        where: { statut: { in: ["ACTIF", "ESSAI"] }, fin: { gt: maintenant } },
        select: { formule: { select: { prixMensuelFcfa: true } } },
      }),
    ]);
    const [posees, poses] = await Promise.all([
      this.db.foyer.groupBy({
        by: ["recenseParId"],
        where: { recenseParId: { in: recenseurs.map((r) => r.id) }, supports: { some: { type: "PORTAIL", pose: { isNot: null } } } },
        _count: true,
      }),
      this.db.pose.groupBy({ by: ["agentId"], where: { agentId: { in: poseurs.map((p) => p.id) }, support: { type: "PORTAIL" } }, _count: true }),
    ]);

    const parMois = Array.from({ length: 6 }, (_, i) => {
      const debut = debutMois(maintenant, i - 5);
      const fin = debutMois(maintenant, i - 4);
      return {
        mois: debut.toISOString().slice(0, 7),
        montantFcfa: paiements.filter((p) => p.payeLe && p.payeLe >= debut && p.payeLe < fin).reduce((t, p) => t + p.montantFcfa, 0),
      };
    });
    const nbPosees = new Map(posees.map((p) => [p.recenseParId, p._count]));
    const nbPoses = new Map(poses.map((p) => [p.agentId, p._count]));
    const nonSoldes = sansAbonnement.map((f) => {
      const encaisse = f.paiements.reduce((t, p) => t + p.montantFcfa, 0);
      const t = f.membres[0];
      return {
        foyerId: f.id,
        code: f.supports[0]?.code ?? null,
        client: t ? `${t.prenom} ${t.nom}` : f.libelle,
        telephone: t?.telephone ?? null,
        recenseur: f.recensePar?.nom ?? null,
        encaisseFcfa: encaisse,
        resteFcfa: Math.max(0, FORFAIT_UNIQUE.abonnementFcfa - encaisse),
        depuisJours: Math.floor((maintenant.getTime() - f.creeLe.getTime()) / JOUR),
      };
    });

    return {
      totaux: {
        encaisseFcfa: parMoyen.reduce((t, m) => t + (m._sum.montantFcfa ?? 0), 0),
        ceMoisFcfa: parMois[5]!.montantFcfa,
        resteAEncaisserFcfa: nonSoldes.reduce((t, f) => t + f.resteFcfa, 0),
        // Mensualités attendues chaque mois des abonnements en cours.
        mensualitesFcfa: abonnementsEnCours.reduce((t, a) => t + (a.formule.prixMensuelFcfa ?? 0), 0),
        abonnementsEnCours: abonnementsEnCours.length,
      },
      parMois,
      parMoyen: parMoyen.map((m) => ({ operateur: m.operateur, montantFcfa: m._sum.montantFcfa ?? 0, nombre: m._count })).sort((a, b) => b.montantFcfa - a.montantFcfa),
      nonSoldes,
      // Commission du recenseur : 1 000 F par plaque posée chez un de ses clients. Poseurs : nombre de poses (tarif à fixer).
      commissions: {
        tarifPlaqueFcfa: COMMISSION_PLAQUE_FCFA,
        recenseurs: recenseurs
          .map((r) => ({ id: r.id, nom: r.nom, actif: r.actif, plaquesPosees: nbPosees.get(r.id) ?? 0, montantFcfa: (nbPosees.get(r.id) ?? 0) * COMMISSION_PLAQUE_FCFA }))
          .sort((a, b) => b.plaquesPosees - a.plaquesPosees),
        poseurs: poseurs.map((p) => ({ id: p.id, nom: p.nom, actif: p.actif, poses: nbPoses.get(p.id) ?? 0 })).sort((a, b) => b.poses - a.poses),
      },
      recents: recents.map((p) => ({
        id: p.id,
        le: p.payeLe ?? p.creeLe,
        montantFcfa: p.montantFcfa,
        operateur: p.operateur,
        reference: p.refFournisseur,
        foyer: p.foyer,
        // Sans abonnement rattaché : acompte versé au recensement.
        nature: p.abonnement ? "abonnement" : "acompte",
      })),
    };
  }
}

@Controller("finance")
@UseGuards(BackOfficeGuard)
@EspaceRequis("finance")
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get()
  tableau() {
    return this.service.tableau();
  }
}

// ─── Forfaits et abonnements ────────────────────────────────────────────────

const codeFormule = z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{3,40}$/, "Code : lettres, chiffres et _ (3 à 40)");
const montant = z.number().int().min(0).max(10_000_000);
const formule = z.object({
  code: codeFormule,
  nom: z.string().trim().min(2).max(80),
  prixFcfa: montant,
  prixMensuelFcfa: montant.nullable(),
  moisInclus: z.number().int().min(0).max(24).default(0),
  // Supports fournis : plaque du portail et QR intérieur par défaut.
  composition: z.array(z.object({ type: z.enum(TYPES_SUPPORT), quantite: z.number().int().min(1).max(10) })).max(6).optional(),
});
const modifFormule = formule.omit({ code: true, composition: true }).partial().extend({ actif: z.boolean().optional() });
const migration = z.object({ de: z.string().min(1), vers: z.string().min(1) });

@Injectable()
export class ForfaitsService {
  constructor(private readonly db: PrismaService) {}

  async liste() {
    const maintenant = new Date();
    const formules = await this.db.formule.findMany({ orderBy: [{ actif: "desc" }, { prixFcfa: "asc" }, { prixMensuelFcfa: "asc" }, { code: "asc" }], include: { composition: true } });
    const enCours = await this.db.abonnement.groupBy({ by: ["formuleId"], where: { statut: { in: ["ACTIF", "ESSAI"] }, fin: { gt: maintenant } }, _count: true });
    const nb = new Map(enCours.map((a) => [a.formuleId, a._count]));
    return formules.map((f) => ({
      id: f.id,
      code: f.code,
      nom: f.nom,
      prixFcfa: f.prixFcfa,
      prixMensuelFcfa: f.prixMensuelFcfa,
      moisInclus: f.moisInclus,
      actif: f.actif,
      composition: f.composition.map((c) => ({ type: c.type, quantite: c.quantite })),
      abonnementsEnCours: nb.get(f.id) ?? 0,
    }));
  }

  async creer(d: z.infer<typeof formule>, u: UtilisateurConnecte) {
    if (await this.db.formule.findUnique({ where: { code: d.code } })) throw new BadRequestException("Ce code de forfait existe déjà");
    const composition = d.composition ?? [{ type: "PORTAIL" as const, quantite: 1 }, { type: "INTERIEUR" as const, quantite: 1 }];
    const f = await this.db.formule.create({
      data: { code: d.code, nom: d.nom, prixFcfa: d.prixFcfa, prixMensuelFcfa: d.prixMensuelFcfa, moisInclus: d.moisInclus, composition: { create: composition } },
    });
    await this.db.audit.create({ data: { action: "forfait.creer", cible: f.code, auteurId: u.id, details: { prixFcfa: d.prixFcfa, prixMensuelFcfa: d.prixMensuelFcfa } } });
    return this.liste();
  }

  // Les prix modifiés valent pour les prochaines souscriptions ; les abonnements en cours gardent leur période.
  async modifier(id: string, d: z.infer<typeof modifFormule>, u: UtilisateurConnecte) {
    const avant = await this.db.formule.findUnique({ where: { id } });
    if (!avant) throw new NotFoundException("Forfait introuvable");
    await this.db.formule.update({ where: { id }, data: d });
    await this.db.audit.create({
      data: { action: "forfait.modifier", cible: avant.code, auteurId: u.id, details: { avant: { prixFcfa: avant.prixFcfa, prixMensuelFcfa: avant.prixMensuelFcfa, actif: avant.actif }, apres: d } },
    });
    return this.liste();
  }

  // Migration : les abonnements en cours d'un forfait passent sur un autre (même période, nouvelle mensualité).
  async migrer(d: z.infer<typeof migration>, u: UtilisateurConnecte) {
    if (d.de === d.vers) throw new BadRequestException("Choisissez deux forfaits différents");
    const [de, vers] = await Promise.all([this.db.formule.findUnique({ where: { id: d.de } }), this.db.formule.findUnique({ where: { id: d.vers } })]);
    if (!de || !vers) throw new NotFoundException("Forfait introuvable");
    if (!vers.actif) throw new BadRequestException("Le forfait d'arrivée est retiré de la vente : réactivez-le d'abord");
    const r = await this.db.abonnement.updateMany({
      where: { formuleId: de.id, statut: { in: ["ACTIF", "ESSAI"] }, fin: { gt: new Date() } },
      data: { formuleId: vers.id },
    });
    await this.db.audit.create({ data: { action: "forfait.migrer", cible: de.code, auteurId: u.id, details: { vers: vers.code, abonnements: r.count } } });
    return { migres: r.count, formules: await this.liste() };
  }
}

@Controller("forfaits")
@UseGuards(BackOfficeGuard)
@EspaceRequis("forfaits")
export class ForfaitsController {
  constructor(private readonly service: ForfaitsService) {}

  @Get()
  liste() {
    return this.service.liste();
  }

  @Post()
  creer(@Body(new ZodPipe(formule)) body: z.infer<typeof formule>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.creer(body, u);
  }

  @Patch(":id")
  modifier(@Param("id") id: string, @Body(new ZodPipe(modifFormule)) body: z.infer<typeof modifFormule>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.modifier(id, body, u);
  }

  @Post("migrer")
  @HttpCode(200)
  migrer(@Body(new ZodPipe(migration)) body: z.infer<typeof migration>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.migrer(body, u);
  }
}

// ─── Prestataires et intervenants ───────────────────────────────────────────

const TYPES_PARTENAIRE = Object.values(TypePartenaire) as [TypePartenaire, ...TypePartenaire[]];
const partenaire = z.object({
  type: z.enum(TYPES_PARTENAIRE),
  nom: z.string().trim().min(2).max(80),
  telephone: z.string().trim().regex(/^\+?[0-9 .-]{3,20}$/, "Numéro invalide"),
  // Code de la ville desservie (DAL, ABJ…) ; vide : national.
  villeCode: z.string().trim().toUpperCase().max(10).nullable().optional().transform((v) => (v ? v : null)),
});
const modifPartenaire = partenaire.partial().extend({ actif: z.boolean().optional() });
const unite = z.object({ nom: z.string().trim().min(2).max(60), type: z.enum(TYPES_UNITE), statut: z.enum(STATUTS_UNITE).optional() });

@Injectable()
export class PrestatairesService {
  constructor(
    private readonly db: PrismaService,
    private readonly administration: AdministrationService,
  ) {}

  async tableau() {
    const [partenaires, villes, unites, intervenants] = await Promise.all([
      this.db.partenaire.findMany({ orderBy: [{ actif: "desc" }, { type: "asc" }, { nom: "asc" }], include: { _count: { select: { unites: true } } } }),
      this.db.ville.findMany({ select: { code: true, nom: true }, orderBy: { nom: "asc" } }),
      this.administration.unites(),
      this.db.utilisateur.findMany({ where: { role: "INTERVENANT" }, select: { id: true, nom: true, actif: true, unite: { select: { nom: true } } }, orderBy: { nom: "asc" } }),
    ]);
    return {
      partenaires: partenaires.map((p) => ({ id: p.id, type: p.type, nom: p.nom, telephone: p.telephone, villeCode: p.villeCode, actif: p.actif, unites: p._count.unites })),
      villes,
      unites,
      intervenants: intervenants.map((i) => ({ id: i.id, nom: i.nom, actif: i.actif, unite: i.unite?.nom ?? null })),
    };
  }

  async creerPartenaire(d: z.infer<typeof partenaire>, u: UtilisateurConnecte) {
    const p = await this.db.partenaire.create({ data: d });
    await this.db.audit.create({ data: { action: "partenaire.creer", cible: p.nom, auteurId: u.id, details: { type: p.type } } });
    return this.tableau();
  }

  async modifierPartenaire(id: string, d: z.infer<typeof modifPartenaire>, u: UtilisateurConnecte) {
    const p = await this.db.partenaire.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Prestataire introuvable");
    await this.db.partenaire.update({ where: { id }, data: d });
    await this.db.audit.create({ data: { action: "partenaire.modifier", cible: p.nom, auteurId: u.id, details: d } });
    return this.tableau();
  }

  async creerUnite(d: z.infer<typeof unite>, u: UtilisateurConnecte) {
    await this.administration.creerUnite(d, u);
    return this.tableau();
  }

  async modifierUnite(id: string, d: Partial<z.infer<typeof unite>>, u: UtilisateurConnecte) {
    await this.administration.modifierUnite(id, d, u);
    return this.tableau();
  }
}

@Controller("prestataires")
@UseGuards(BackOfficeGuard)
@EspaceRequis("prestataires")
export class PrestatairesController {
  constructor(private readonly service: PrestatairesService) {}

  @Get()
  tableau() {
    return this.service.tableau();
  }

  @Post("partenaires")
  creerPartenaire(@Body(new ZodPipe(partenaire)) body: z.infer<typeof partenaire>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.creerPartenaire(body, u);
  }

  @Patch("partenaires/:id")
  modifierPartenaire(@Param("id") id: string, @Body(new ZodPipe(modifPartenaire)) body: z.infer<typeof modifPartenaire>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.modifierPartenaire(id, body, u);
  }

  @Post("unites")
  creerUnite(@Body(new ZodPipe(unite)) body: z.infer<typeof unite>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.creerUnite(body, u);
  }

  @Patch("unites/:id")
  modifierUnite(@Param("id") id: string, @Body(new ZodPipe(unite.partial())) body: Partial<z.infer<typeof unite>>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.modifierUnite(id, body, u);
  }
}

@Module({
  imports: [AdministrationModule],
  controllers: [FinanceController, ForfaitsController, PrestatairesController],
  providers: [FinanceService, ForfaitsService, PrestatairesService],
})
export class QgModule {}
