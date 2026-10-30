import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Alerte, Prisma, TypePartenaire } from "@apsig/db";
import {
  calculerFiabilite,
  destinatairesPour,
  distanceM,
  estFixe,
  estOuverte,
  FENETRE_DOUBLON_MS,
  formatDistance,
  genererJeton,
  menuPour,
  numeroAlerte,
  STATUTS_OUVERTS,
  SUPPORTS,
  INCIDENT,
  temoinPeutAnnuler,
  transition,
  trouverDoublon,
  trouverIncident,
  URGENCES,
  type Destinataire,
  type ProblemePosition,
  type SourceAlerte,
  type StatutAlerte,
  type TypeUrgence,
} from "@apsig/domain";
import { FluxService } from "../flux/flux.module.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { PrismaService, type Tx } from "../prisma/prisma.service.ts";
import { RepartitionService } from "../repartition/repartition.service.ts";

export type PositionTemoin = { lat: number; lng: number; precisionM?: number | undefined };
// Abonné qui déclenche depuis l'application : la centrale sait qui rappeler.
export type DeclencheurAppli = { membreId: string; nom: string; telephone: string | null };

const JOUR_MS = 86_400_000;
// Le témoin est suivi en continu : seul un vrai déplacement est inscrit au fil de l'alerte.
const DEPLACEMENT_SIGNALE_M = 50;
const PROBLEMES: Record<ProblemePosition, string> = {
  REFUSEE: "Le témoin a refusé la localisation : le rappeler pour savoir où il se trouve",
  INDISPONIBLE: "Localisation impossible sur le téléphone du témoin (GPS coupé ou sans signal) : le rappeler",
};
const PARTENAIRES = new Set<Destinataire>(["POLICE", "GSPM", "SAMU", "AMBULANCE_PRIVEE", "INFIRMIER", "SECURITE_PRIVEE"]);

const inclusSupport = {
  foyer: {
    include: {
      quartier: { include: { ville: true } },
      membres: { include: { acces: { select: { jetonPush: true, revoqueLe: true } } } },
      contacts: { orderBy: { ordre: "asc" } },
      abonnements: { include: { formule: true } },
    },
  },
} satisfies Prisma.SupportInclude;
type SupportComplet = Prisma.SupportGetPayload<{ include: typeof inclusSupport }>;

const heure = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

function memeCle(attendue: string, recue: string | undefined) {
  if (!recue) return false;
  const a = Buffer.from(attendue);
  const b = Buffer.from(recue);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Une alerte rattachée à un incident affiche au témoin l'avancement de l'incident.
type Avancement = Pick<Alerte, "statut" | "priseEnChargeLe" | "surPlaceLe" | "clotureLe">;
const avancement = (a: Alerte, principale?: Avancement | null): Avancement =>
  principale && estOuverte(a.statut) ? principale : a;

@Injectable()
export class AlertesService {
  constructor(
    private readonly db: PrismaService,
    private readonly repartition: RepartitionService,
    private readonly flux: FluxService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Page d'alerte : ce que voit le témoin après le scan ──────────────────

  async supportPublic(jeton: string) {
    const s = await this.chargerSupport(this.db, jeton);
    const foyer = estFixe(s.type) ? s.foyer : null;
    // Jamais de nom de personne : seulement le support et, s'il est fixe, le quartier.
    return {
      type: s.type,
      libelle: SUPPORTS[s.type].libelle,
      code: s.code,
      lieu: foyer
        ? { quartier: foyer.quartier.nom, ville: foyer.quartier.ville.nom, adresseVerifiee: foyer.adresseVerifiee }
        : null,
      urgences: menuPour(s.type).map(({ type, bouton, description }) => ({ type, bouton, description })),
    };
  }

  async creer(
    input: { jeton: string; type: TypeUrgence; appareilId?: string | undefined; position?: PositionTemoin | undefined; problemePosition?: ProblemePosition | undefined },
    source: SourceAlerte = "QR",
    declencheur?: DeclencheurAppli,
  ) {
    const resultat = await this.db.$transaction(async (tx) => {
      const support = await this.chargerSupport(tx, input.jeton);
      const maintenant = new Date();

      // Regroupement : même support, même urgence, encore ouverte depuis moins de 10 min.
      const recentes = await tx.alerte.findMany({
        where: {
          supportId: support.id,
          type: input.type,
          statut: { in: [...STATUTS_OUVERTS] },
          creeLe: { gte: new Date(maintenant.getTime() - FENETRE_DOUBLON_MS) },
        },
        orderBy: { creeLe: "desc" },
      });
      const doublon = trouverDoublon(recentes, { supportId: support.id, type: input.type }, maintenant);
      if (doublon) {
        const redeclenchements = doublon.redeclenchements + 1;
        await tx.alerte.update({ where: { id: doublon.id }, data: { redeclenchements } });
        await this.evenement(tx, doublon.id, "temoin", `Nouveau déclenchement sur le même support (regroupé, ${redeclenchements + 1} au total)`);
        return { alerte: await this.rafraichirFiabilite(tx, doublon.id), doublon: true };
      }

      if (input.appareilId) {
        await tx.appareil.upsert({ where: { id: input.appareilId }, update: {}, create: { id: input.appareilId } });
      }

      const foyer = support.foyer;
      const abonnement = foyer?.abonnements.find((a) => (a.statut === "ACTIF" || a.statut === "ESSAI") && a.fin > maintenant);
      const intervention = abonnement?.formule.intervention ?? false;
      const fixe = estFixe(support.type);
      const reference = fixe
        ? foyer?.lat != null && foyer.lng != null ? { lat: foyer.lat, lng: foyer.lng } : null
        : input.position ?? null;

      // Incendie ou agression voisine déjà signalée : même incident, traité par le même opérateur.
      const incident = trouverIncident(
        await tx.alerte.findMany({
          where: { type: input.type, statut: { in: [...STATUTS_OUVERTS] }, principaleId: null, creeLe: { gte: new Date(maintenant.getTime() - INCIDENT.fenetreMs) } },
        }),
        { type: input.type, position: reference },
        maintenant,
      );

      const alerte = await tx.alerte.create({
        data: {
          principaleId: incident?.id ?? null,
          numero: numeroAlerte(await this.prochainNumero(tx)),
          type: input.type,
          priorite: URGENCES[input.type].priorite,
          source,
          supportId: support.id,
          foyerId: foyer?.id ?? null,
          lat: reference?.lat ?? null,
          lng: reference?.lng ?? null,
          appareilId: input.appareilId ?? null,
          temoinTelephone: declencheur?.telephone ?? null,
          temoinLat: input.position?.lat ?? null,
          temoinLng: input.position?.lng ?? null,
          temoinPrecisionM: input.position?.precisionM ?? null,
          temoinPositionLe: input.position ? maintenant : null,
          problemePosition: input.position ? null : (input.problemePosition ?? null),
          cleTemoin: genererJeton(24),
          scoreFiabilite: 0, // calculé juste après, avec le contexte complet
          abonnementExpire: !abonnement,
          intervention,
        },
      });

      const urgence = URGENCES[input.type].bouton;
      await this.evenement(
        tx,
        alerte.id,
        "temoin",
        declencheur
          ? `Alerte « ${urgence} » déclenchée depuis l'application par ${declencheur.nom}${declencheur.telephone ? ` (${declencheur.telephone})` : ""}`
          : `Alerte « ${urgence} » déclenchée par scan QR — ${SUPPORTS[support.type].libelle} ${support.code}`,
      );
      if (fixe && foyer) {
        await this.evenement(tx, alerte.id, "systeme", `Adresse identifiée : ${support.code} — ${foyer.quartier.nom}, ${foyer.quartier.ville.nom}${foyer.adresseVerifiee ? " (vérifiée)" : ""}`);
      } else if (!fixe) {
        await this.evenement(tx, alerte.id, "systeme", input.position ? "Support mobile : position du témoin reçue" : "Support mobile : position du témoin non partagée, à obtenir en rappelant le témoin");
      }
      if (!input.position && input.problemePosition) await this.evenement(tx, alerte.id, "temoin", PROBLEMES[input.problemePosition]);
      if (!abonnement) await this.evenement(tx, alerte.id, "systeme", "Abonnement expiré ou absent : alerte traitée quand même (l'urgence prime)");
      if (intervention && input.type === "AGRESSION") await this.evenement(tx, alerte.id, "systeme", "Formule Sécurité + : équipe d'intervention APSIG à engager en priorité");

      // Les secours sont prévenus une fois par incident ; la famille de chaque support, toujours.
      const messages = this.messages(support, alerte, await this.partenaires(tx, input.type, intervention, foyer?.quartier.ville.code), !!incident);
      const notifications = foyer ? this.notifications.messagesFoyer(foyer.membres, alerte.id, this.texteFamille(support, alerte, declencheur), declencheur?.membreId) : [];
      if (messages.length + notifications.length) await tx.message.createMany({ data: [...messages, ...notifications] });
      await this.evenement(tx, alerte.id, "systeme", `Routage : ${messages.length} message(s) en file d'envoi${notifications.length ? `, ${notifications.length} notification(s) à l'application du foyer` : ""}`);

      if (incident) {
        const distance = formatDistance(incident.distanceM);
        await this.evenement(tx, alerte.id, "systeme", `Rattachée à l'incident ${incident.numero} (à ${distance})`);
        await this.evenement(tx, incident.id, "temoin", `Témoin supplémentaire : ${alerte.numero}, ${SUPPORTS[support.type].libelle} ${support.code} (à ${distance})`);
      } else {
        await this.repartition.attribuer(tx, alerte.id, maintenant);
      }

      return { alerte: await this.rafraichirFiabilite(tx, alerte.id), doublon: false };
    });
    this.flux.emettre({ type: "alertes" });
    if (!resultat.doublon) void this.notifications.envoyerEnFile(resultat.alerte.id);
    return resultat;
  }

  async consulter(numero: string, cle: string | undefined) {
    return this.alerteDuTemoin(this.db, numero, cle);
  }

  // Le témoin annule son alerte : si d'autres témoins sont rattachés, l'incident continue avec le premier d'entre eux.
  private async promouvoirRattachee(tx: Tx, principale: Alerte) {
    const [suivante, ...autres] = await tx.alerte.findMany({
      where: { principaleId: principale.id, statut: { in: [...STATUTS_OUVERTS] } },
      orderBy: { creeLe: "asc" },
    });
    if (!suivante) return;
    await tx.alerte.update({
      where: { id: suivante.id },
      data: {
        principaleId: null,
        attribueeAId: principale.attribueeAId,
        attribueeLe: principale.attribueeLe,
        accepteeLe: principale.accepteeLe,
        operateurId: principale.operateurId,
        priseEnChargeLe: principale.priseEnChargeLe,
        statut: principale.statut,
      },
    });
    if (autres.length) await tx.alerte.updateMany({ where: { id: { in: autres.map((a) => a.id) } }, data: { principaleId: suivante.id } });
    await this.evenement(tx, suivante.id, "systeme", `Devient l'alerte principale de l'incident (${principale.numero} annulée par son témoin)`);
  }

  async partagerPosition(numero: string, cle: string, position: PositionTemoin) {
    await this.db.$transaction(async (tx) => {
      const a = await this.alerteDuTemoin(tx, numero, cle);
      if (!estOuverte(a.statut)) throw new ConflictException("Alerte déjà clôturée");
      const support = await tx.support.findUniqueOrThrow({ where: { id: a.supportId } });
      await tx.alerte.update({
        where: { id: a.id },
        data: {
          temoinLat: position.lat,
          temoinLng: position.lng,
          temoinPrecisionM: position.precisionM ?? null,
          temoinPositionLe: new Date(),
          problemePosition: null,
          // Support mobile : la position du témoin devient la position d'intervention.
          ...(!estFixe(support.type) && { lat: position.lat, lng: position.lng }),
        },
      });
      const precision = position.precisionM != null ? ` (précision ${Math.round(position.precisionM)} m)` : "";
      if (a.temoinLat == null || a.temoinLng == null) {
        await this.evenement(tx, a.id, "temoin", `Position du témoin reçue${precision}`);
      } else {
        const ecart = distanceM({ lat: a.temoinLat, lng: a.temoinLng }, position);
        if (ecart >= DEPLACEMENT_SIGNALE_M) await this.evenement(tx, a.id, "temoin", `Le témoin s'est déplacé de ${formatDistance(ecart)}${precision}`);
      }
      await this.rafraichirFiabilite(tx, a.id);
    });
    this.flux.emettre({ type: "alertes", numero });
    return this.consulter(numero, cle);
  }

  // Localisation refusée ou impossible sur le téléphone du témoin : la centrale doit le rappeler.
  async signalerProblemePosition(numero: string, cle: string, probleme: ProblemePosition) {
    const nouveau = await this.db.$transaction(async (tx) => {
      const a = await this.alerteDuTemoin(tx, numero, cle);
      if (!estOuverte(a.statut)) throw new ConflictException("Alerte déjà clôturée");
      if (a.problemePosition === probleme) return false;
      await tx.alerte.update({ where: { id: a.id }, data: { problemePosition: probleme } });
      await this.evenement(tx, a.id, "temoin", PROBLEMES[probleme]);
      return true;
    });
    if (nouveau) this.flux.emettre({ type: "alertes", numero });
    return this.consulter(numero, cle);
  }

  async annuler(numero: string, cle: string) {
    await this.db.$transaction(async (tx) => {
      const a = await this.alerteDuTemoin(tx, numero, cle);
      if (!temoinPeutAnnuler(avancement(a, a.principale).statut)) throw new ConflictException("Cette alerte ne peut plus être annulée");
      await this.evenement(tx, a.id, "temoin", "Alerte annulée par le témoin");
      await tx.alerte.update({
        where: { id: a.id },
        data: { statut: transition(a.statut, "ANNULEE"), clotureLe: new Date(), issue: "Annulée par le témoin" },
      });
      if (!a.principaleId) await this.promouvoirRattachee(tx, a);
    });
    this.flux.emettre({ type: "alertes", numero });
    return this.consulter(numero, cle);
  }

  // Ce que le témoin peut voir de son alerte (aucune donnée sur le foyer).
  vuePublique(a: Alerte & { principale?: Avancement | null }) {
    const etat = avancement(a, a.principale);
    return {
      numero: a.numero,
      type: a.type,
      urgence: URGENCES[a.type].bouton,
      statut: etat.statut,
      creeLe: a.creeLe,
      priseEnChargeLe: etat.priseEnChargeLe,
      surPlaceLe: etat.surPlaceLe,
      clotureLe: etat.clotureLe,
      positionPartagee: a.temoinLat != null,
      peutAnnuler: temoinPeutAnnuler(etat.statut as StatutAlerte),
    };
  }

  // ─── Interne ───────────────────────────────────────────────────────────────

  private async chargerSupport(db: Tx | PrismaService, jeton: string): Promise<SupportComplet> {
    const support = await db.support.findUnique({ where: { jeton }, include: inclusSupport });
    if (!support) {
      if (await db.jetonRevoque.findUnique({ where: { jeton } })) {
        throw new GoneException("Ce QR code a été remplacé. En cas d'urgence, appelez directement les secours.");
      }
      throw new NotFoundException("QR code inconnu. En cas d'urgence, appelez directement les secours.");
    }
    if (support.statut !== "ACTIF") {
      throw new ForbiddenException("Ce support n'est pas actif. En cas d'urgence, appelez directement les secours.");
    }
    return support;
  }

  private async alerteDuTemoin(db: Tx | PrismaService, numero: string, cle: string | undefined) {
    const a = await db.alerte.findUnique({
      where: { numero },
      include: { principale: { select: { statut: true, priseEnChargeLe: true, surPlaceLe: true, clotureLe: true } } },
    });
    if (!a || !memeCle(a.cleTemoin, cle)) throw new ForbiddenException("Accès refusé");
    return a;
  }

  private async prochainNumero(tx: Tx) {
    const c = await tx.compteur.upsert({
      where: { nom: "alerte" },
      create: { nom: "alerte", valeur: 1 },
      update: { valeur: { increment: 1 } },
    });
    return c.valeur;
  }

  private evenement(tx: Tx, alerteId: string, nature: string, texte: string) {
    return tx.evenementAlerte.create({ data: { alerteId, nature, texte } });
  }

  private async partenaires(tx: Tx, type: TypeUrgence, intervention: boolean, villeCode: string | undefined) {
    const types = destinatairesPour(type, { intervention }).filter((d) => PARTENAIRES.has(d));
    const liste = await tx.partenaire.findMany({
      where: { actif: true, type: { in: types as TypePartenaire[] }, OR: [{ villeCode: null }, { villeCode: villeCode ?? null }] },
    });
    return { types: destinatairesPour(type, { intervention }), liste };
  }

  // Notification aux téléphones du foyer : qui est concerné et où, sans détail médical.
  private texteFamille(support: SupportComplet, alerte: Alerte, declencheur?: DeclencheurAppli) {
    const porteur = support.foyer?.membres.find((m) => m.id === support.membreId);
    const ou = declencheur
      ? `${declencheur.nom} a déclenché une alerte depuis l'application`
      : estFixe(support.type)
        ? `Alerte sur le QR ${support.code} de votre domicile`
        : `Alerte : ${SUPPORTS[support.type].libelle} ${porteur ? `de ${porteur.prenom}` : support.code}`;
    return `${ou} à ${heure(alerte.creeLe)}. La centrale APSIG est mobilisée.`;
  }

  private messages(
    support: SupportComplet,
    alerte: Alerte,
    p: Awaited<ReturnType<AlertesService["partenaires"]>>,
    rattachee = false,
  ): Prisma.MessageCreateManyInput[] {
    const urgence = URGENCES[alerte.type].bouton;
    const foyer = support.foyer;
    const lieu = estFixe(support.type) && foyer
      ? `${support.code} (${foyer.quartier.nom}, ${foyer.quartier.ville.nom})`
      : `${SUPPORTS[support.type].libelle} ${support.code}`;
    const gps = alerte.lat != null && alerte.lng != null ? ` GPS ${alerte.lat.toFixed(5)},${alerte.lng.toFixed(5)}.` : "";
    const titulaire = foyer?.membres.find((m) => m.role === "TITULAIRE");
    const base = { alerteId: alerte.id, canal: "SMS" as const, pilote: "file" };
    const out: Prisma.MessageCreateManyInput[] = [];

    for (const d of p.types) {
      if (PARTENAIRES.has(d)) {
        if (rattachee) continue;
        for (const part of p.liste.filter((x) => x.type === d)) {
          out.push({ ...base, destinataire: part.telephone, nomDestinataire: part.nom, texte: `[CODE-SECOURS] ${urgence} — ${lieu}.${gps} Réf ${alerte.numero}. Centrale APSIG.` });
        }
      } else if (d === "TITULAIRE" && titulaire?.telephone) {
        out.push({ ...base, destinataire: titulaire.telephone, nomDestinataire: `Titulaire — ${titulaire.prenom} ${titulaire.nom}`, texte: `[CODE-SECOURS] Alerte « ${urgence} » sur votre support ${support.code} à ${heure(alerte.creeLe)}. La centrale APSIG est mobilisée.` });
      } else if (d === "FAMILLE" && foyer) {
        const qui = titulaire ? `${titulaire.prenom} ${titulaire.nom}` : "votre proche";
        for (const c of foyer.contacts) {
          out.push({ ...base, destinataire: c.telephone, nomDestinataire: `${c.relation} — ${c.nom}`, texte: `[CODE-SECOURS] Alerte « ${urgence} » concernant ${qui} (${support.code}) à ${heure(alerte.creeLe)}. La centrale APSIG est mobilisée.` });
        }
      }
      // VOISINAGE et INTERVENTION_APSIG : pas encore de destinataires enregistrés (groupes de quartier, unités).
    }
    return out;
  }

  async rafraichirFiabilite(tx: Tx, alerteId: string) {
    const { score } = await this.evaluerFiabilite(tx, alerteId);
    return tx.alerte.update({ where: { id: alerteId }, data: { scoreFiabilite: score } });
  }

  // Score et raisons détaillées, affichées à l'opérateur de la centrale.
  async evaluerFiabilite(db: Tx | PrismaService, alerteId: string) {
    const a = await db.alerte.findUniqueOrThrow({
      where: { id: alerteId },
      include: { support: { include: { foyer: true } }, appareil: true, _count: { select: { medias: true } } },
    });
    const foyer = a.support.foyer;
    const autres = a.appareilId
      ? await db.alerte.count({
          where: { appareilId: a.appareilId, id: { not: a.id }, supportId: { not: a.supportId }, creeLe: { gte: new Date(a.creeLe.getTime() - JOUR_MS) } },
        })
      : 0;
    return calculerFiabilite({
      support: a.support.type,
      source: a.source,
      adresse: foyer?.lat != null && foyer.lng != null ? { lat: foyer.lat, lng: foyer.lng } : null,
      temoin: a.temoinLat != null && a.temoinLng != null ? { lat: a.temoinLat, lng: a.temoinLng, precisionM: a.temoinPrecisionM ?? undefined } : null,
      appareilBloque: a.appareil?.bloque ?? false,
      alertesAppareilAutresSupports24h: autres,
      redeclenchements: a.redeclenchements,
      medias: a._count.medias,
      rappel: a.rappel,
    });
  }
}
