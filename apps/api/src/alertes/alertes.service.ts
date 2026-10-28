import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Alerte, Prisma, TypePartenaire } from "@apsig/db";
import {
  calculerFiabilite,
  destinatairesPour,
  estFixe,
  estOuverte,
  FENETRE_DOUBLON_MS,
  genererJeton,
  menuPour,
  numeroAlerte,
  STATUTS_OUVERTS,
  SUPPORTS,
  temoinPeutAnnuler,
  transition,
  trouverDoublon,
  URGENCES,
  type Destinataire,
  type SourceAlerte,
  type TypeUrgence,
} from "@apsig/domain";
import { PrismaService, type Tx } from "../prisma/prisma.service.ts";

export type PositionTemoin = { lat: number; lng: number; precisionM?: number | undefined };

const JOUR_MS = 86_400_000;
const PARTENAIRES = new Set<Destinataire>(["POLICE", "GSPM", "SAMU", "AMBULANCE_PRIVEE", "INFIRMIER", "SECURITE_PRIVEE"]);

const inclusSupport = {
  foyer: {
    include: {
      quartier: { include: { ville: true } },
      membres: true,
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

@Injectable()
export class AlertesService {
  constructor(private readonly db: PrismaService) {}

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

  async creer(input: { jeton: string; type: TypeUrgence; appareilId?: string | undefined; position?: PositionTemoin | undefined }, source: SourceAlerte = "QR") {
    return this.db.$transaction(async (tx) => {
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

      const alerte = await tx.alerte.create({
        data: {
          numero: numeroAlerte(await this.prochainNumero(tx)),
          type: input.type,
          priorite: URGENCES[input.type].priorite,
          source,
          supportId: support.id,
          foyerId: foyer?.id ?? null,
          lat: reference?.lat ?? null,
          lng: reference?.lng ?? null,
          appareilId: input.appareilId ?? null,
          temoinLat: input.position?.lat ?? null,
          temoinLng: input.position?.lng ?? null,
          temoinPrecisionM: input.position?.precisionM ?? null,
          cleTemoin: genererJeton(24),
          scoreFiabilite: 0, // calculé juste après, avec le contexte complet
          abonnementExpire: !abonnement,
          intervention,
        },
      });

      const urgence = URGENCES[input.type].bouton;
      await this.evenement(tx, alerte.id, "temoin", `Alerte « ${urgence} » déclenchée par scan QR — ${SUPPORTS[support.type].libelle} ${support.code}`);
      if (fixe && foyer) {
        await this.evenement(tx, alerte.id, "systeme", `Adresse identifiée : ${support.code} — ${foyer.quartier.nom}, ${foyer.quartier.ville.nom}${foyer.adresseVerifiee ? " (vérifiée)" : ""}`);
      } else if (!fixe) {
        await this.evenement(tx, alerte.id, "systeme", input.position ? "Support mobile : position du témoin reçue" : "Support mobile : position du témoin non partagée, à obtenir en rappelant le témoin");
      }
      if (!abonnement) await this.evenement(tx, alerte.id, "systeme", "Abonnement expiré ou absent : alerte traitée quand même (l'urgence prime)");
      if (intervention && input.type === "AGRESSION") await this.evenement(tx, alerte.id, "systeme", "Formule Sécurité + : équipe d'intervention APSIG à engager en priorité");

      const messages = this.messages(support, alerte, await this.partenaires(tx, input.type, intervention, foyer?.quartier.ville.code));
      if (messages.length) await tx.message.createMany({ data: messages });
      await this.evenement(tx, alerte.id, "systeme", `Routage : ${messages.length} message(s) en file d'envoi`);

      return { alerte: await this.rafraichirFiabilite(tx, alerte.id), doublon: false };
    });
  }

  async consulter(numero: string, cle: string | undefined) {
    return this.alerteDuTemoin(this.db, numero, cle);
  }

  async partagerPosition(numero: string, cle: string, position: PositionTemoin) {
    return this.db.$transaction(async (tx) => {
      const a = await this.alerteDuTemoin(tx, numero, cle);
      if (!estOuverte(a.statut)) throw new ConflictException("Alerte déjà clôturée");
      const support = await tx.support.findUniqueOrThrow({ where: { id: a.supportId } });
      await tx.alerte.update({
        where: { id: a.id },
        data: {
          temoinLat: position.lat,
          temoinLng: position.lng,
          temoinPrecisionM: position.precisionM ?? null,
          // Support mobile : la position du témoin devient la position d'intervention.
          ...(!estFixe(support.type) && { lat: position.lat, lng: position.lng }),
        },
      });
      const precision = position.precisionM != null ? ` (précision ${Math.round(position.precisionM)} m)` : "";
      await this.evenement(tx, a.id, "temoin", `Position du témoin reçue${precision}`);
      return this.rafraichirFiabilite(tx, a.id);
    });
  }

  async annuler(numero: string, cle: string) {
    return this.db.$transaction(async (tx) => {
      const a = await this.alerteDuTemoin(tx, numero, cle);
      if (!temoinPeutAnnuler(a.statut)) throw new ConflictException("Cette alerte ne peut plus être annulée");
      await this.evenement(tx, a.id, "temoin", "Alerte annulée par le témoin");
      return tx.alerte.update({
        where: { id: a.id },
        data: { statut: transition(a.statut, "ANNULEE"), clotureLe: new Date(), issue: "Annulée par le témoin" },
      });
    });
  }

  // Ce que le témoin peut voir de son alerte (aucune donnée sur le foyer).
  vuePublique(a: Alerte) {
    return {
      numero: a.numero,
      type: a.type,
      urgence: URGENCES[a.type].bouton,
      statut: a.statut,
      creeLe: a.creeLe,
      priseEnChargeLe: a.priseEnChargeLe,
      surPlaceLe: a.surPlaceLe,
      clotureLe: a.clotureLe,
      positionPartagee: a.temoinLat != null,
      peutAnnuler: temoinPeutAnnuler(a.statut),
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
    const a = await db.alerte.findUnique({ where: { numero } });
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

  private messages(
    support: SupportComplet,
    alerte: Alerte,
    p: Awaited<ReturnType<AlertesService["partenaires"]>>,
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

  private async rafraichirFiabilite(tx: Tx, alerteId: string) {
    const a = await tx.alerte.findUniqueOrThrow({
      where: { id: alerteId },
      include: { support: { include: { foyer: true } }, appareil: true, _count: { select: { medias: true } } },
    });
    const foyer = a.support.foyer;
    const autres = a.appareilId
      ? await tx.alerte.count({
          where: { appareilId: a.appareilId, id: { not: a.id }, supportId: { not: a.supportId }, creeLe: { gte: new Date(a.creeLe.getTime() - JOUR_MS) } },
        })
      : 0;
    const { score } = calculerFiabilite({
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
    return tx.alerte.update({ where: { id: a.id }, data: { scoreFiabilite: score } });
  }
}
