import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Prisma } from "@apsig/db";
import {
  ACTIVATION,
  estImprime,
  etatAbonnement,
  genererJeton,
  LIBELLES_ROLE_MEMBRE,
  menuPour,
  normaliserTelephone,
  SUPPORTS,
  type ProblemePosition,
  type TypeUrgence,
} from "@apsig/domain";
import { AbonnementsService, empreinte } from "../abonnements/abonnements.service.ts";
import { AlertesService, type PositionTemoin } from "../alertes/alertes.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import type { AbonneConnecte } from "./client.guard.ts";

const JOUR_MS = 86_400_000;
const HISTORIQUE_JOURS = 30;
// Même réponse pour un numéro inconnu et un code faux : on ne révèle pas qui est abonné.
const REFUS = "Numéro ou code incorrect. Vérifiez le code remis par APSIG, ou demandez-en un nouveau.";

const inclusAlerte = {
  support: { include: { membre: true } },
  principale: { select: { statut: true, priseEnChargeLe: true, surPlaceLe: true, clotureLe: true } },
} satisfies Prisma.AlerteInclude;
type AlerteFoyer = Prisma.AlerteGetPayload<{ include: typeof inclusAlerte }>;

const memeEmpreinte = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Espace abonné de l'application mobile : SOS avec la position du téléphone, alertes du foyer, foyer en lecture.
@Injectable()
export class ClientService {
  constructor(
    private readonly db: PrismaService,
    private readonly alertes: AlertesService,
    private readonly abonnements: AbonnementsService,
  ) {}

  async activer(d: { telephone: string; code: string; appareil?: string | undefined }) {
    const numero = normaliserTelephone(d.telephone);
    const maintenant = new Date();
    // Peu de codes en cours à un instant donné : le numéro saisi est comparé après normalisation.
    const enCours = await this.db.codeActivation.findMany({
      where: { utiliseLe: null, expireLe: { gt: maintenant }, essais: { lt: ACTIVATION.essais } },
      include: { membre: true },
    });
    const code = enCours.find((c) => c.membre.telephone && normaliserTelephone(c.membre.telephone) === numero);
    if (!code) throw new UnauthorizedException(REFUS);
    if (!memeEmpreinte(code.codeHash, empreinte(d.code.trim()))) {
      await this.db.codeActivation.update({ where: { id: code.id }, data: { essais: { increment: 1 } } });
      throw new UnauthorizedException(REFUS);
    }
    const jeton = genererJeton(40);
    await this.db.$transaction(async (tx) => {
      await tx.codeActivation.update({ where: { id: code.id }, data: { utiliseLe: maintenant } });
      const acces = await tx.accesClient.create({ data: { membreId: code.membreId, jetonHash: empreinte(jeton), appareil: d.appareil ?? null } });
      await this.abonnements.supportApplication(tx, code.membreId);
      await tx.audit.create({ data: { action: "client.activer", cible: code.membre.foyerId, details: { membreId: code.membreId, accesId: acces.id } } });
    });
    return { jeton, prenom: code.membre.prenom };
  }

  async moi(a: AbonneConnecte) {
    const f = await this.db.foyer.findUniqueOrThrow({
      where: { id: a.foyerId },
      include: {
        quartier: { include: { ville: true } },
        membres: { orderBy: { prenom: "asc" } },
        contacts: { orderBy: { ordre: "asc" } },
        supports: { where: { statut: { not: "PERDU" } }, include: { membre: true }, orderBy: { creeLe: "asc" } },
        abonnements: { orderBy: { debut: "desc" }, include: { formule: true } },
      },
    });
    const maintenant = new Date();
    const abonnement = f.abonnements.find((x) => ["ESSAI", "ACTIF"].includes(etatAbonnement(x, maintenant))) ?? f.abonnements[0];
    return {
      moi: { prenom: a.prenom, nom: a.nom, telephone: a.telephone },
      foyer: { libelle: f.libelle, adresse: f.adresse, quartier: f.quartier.nom, ville: f.quartier.ville.nom, adresseVerifiee: f.adresseVerifiee },
      // Les données de santé ne quittent jamais la centrale, même vers l'application du foyer.
      membres: f.membres.map((m) => ({ id: m.id, prenom: m.prenom, nom: m.nom, role: LIBELLES_ROLE_MEMBRE[m.role], moi: m.id === a.membreId })),
      contacts: f.contacts.map((c) => ({ nom: c.nom, relation: c.relation, telephone: c.telephone })),
      supports: f.supports
        .filter((s) => estImprime(s.type))
        .map((s) => ({ type: s.type, libelle: SUPPORTS[s.type].libelle, code: s.code, statut: s.statut, porteur: s.membre?.prenom ?? null })),
      abonnement: abonnement ? { formule: abonnement.formule.nom, etat: etatAbonnement(abonnement, maintenant), fin: abonnement.fin } : null,
      urgences: menuPour("APPLI").map(({ type, bouton, description }) => ({ type, bouton, description })),
    };
  }

  // SOS depuis l'application : le téléphone de l'abonné sert de support, sa position de position d'intervention.
  async sos(a: AbonneConnecte, d: { type: TypeUrgence; position?: PositionTemoin | undefined; problemePosition?: ProblemePosition | undefined }) {
    const support = await this.db.$transaction((tx) => this.abonnements.supportApplication(tx, a.membreId));
    const { alerte, doublon } = await this.alertes.creer(
      { jeton: support.jeton, type: d.type, position: d.position, problemePosition: d.problemePosition },
      "APPLI",
      { membreId: a.membreId, nom: `${a.prenom} ${a.nom}`, telephone: a.telephone },
    );
    return { ...this.alertes.vuePublique(alerte), cleTemoin: alerte.cleTemoin, doublon };
  }

  // Alertes du foyer sur 30 jours : QR scannés par un témoin, bracelets, SOS des membres.
  async alertesFoyer(a: AbonneConnecte) {
    const alertes = await this.db.alerte.findMany({
      where: { foyerId: a.foyerId, creeLe: { gte: new Date(Date.now() - HISTORIQUE_JOURS * JOUR_MS) } },
      include: inclusAlerte,
      orderBy: { creeLe: "desc" },
      take: 20,
    });
    return alertes.map((x) => this.vueFoyer(x, a));
  }

  async alerteFoyer(a: AbonneConnecte, numero: string) {
    const x = await this.db.alerte.findUnique({
      where: { numero },
      include: inclusAlerte,
    });
    if (!x || x.foyerId !== a.foyerId) throw new ForbiddenException("Cette alerte ne concerne pas votre foyer");
    return this.vueFoyer(x, a);
  }

  async notifications(a: AbonneConnecte, jetonPush: string | null) {
    // Un même téléphone peut avoir été relié à un autre membre auparavant : il ne notifie plus que celui-ci.
    if (jetonPush) await this.db.accesClient.updateMany({ where: { jetonPush, id: { not: a.accesId } }, data: { jetonPush: null } });
    await this.db.accesClient.update({ where: { id: a.accesId }, data: { jetonPush } });
    return { notifications: !!jetonPush };
  }

  async deconnecter(a: AbonneConnecte) {
    await this.db.accesClient.update({ where: { id: a.accesId }, data: { revoqueLe: new Date(), jetonPush: null } });
  }

  private vueFoyer(x: AlerteFoyer, a: AbonneConnecte) {
    const parMoi = x.source === "APPLI" && x.support.membreId === a.membreId;
    return {
      ...this.alertes.vuePublique(x),
      support: { type: x.support.type, libelle: SUPPORTS[x.support.type].libelle, code: x.support.code },
      concerne: x.support.membre?.prenom ?? null,
      parMoi,
      // Seul l'abonné qui a déclenché peut partager sa position ou annuler, comme le témoin d'un QR.
      ...(parMoi && { cleTemoin: x.cleTemoin }),
    };
  }
}
