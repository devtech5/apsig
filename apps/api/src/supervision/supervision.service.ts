import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@apsig/db";
import { SUPPORTS, URGENCES, type StatutAlerte, type TypeUrgence } from "@apsig/domain";
import { PrismaService } from "../prisma/prisma.service.ts";

const PAR_PAGE = 50;
const JOUR_MS = 86_400_000;
// Au-delà, la période est trop longue pour un calcul à la volée : à restreindre.
const PERIODE_MAX_JOURS = 366;

export type Filtres = {
  du?: string | undefined;
  au?: string | undefined;
  type?: TypeUrgence | undefined;
  statut?: StatutAlerte | undefined;
  operateurId?: string | undefined;
  q?: string | undefined;
};

// Côte d'Ivoire : UTC toute l'année, une journée va de 00:00 à 24:00 UTC.
function periode(du: string | undefined, au: string | undefined, maintenant = new Date()) {
  const jour = (s: string) => {
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`Date invalide : ${s}`);
    return d;
  };
  const fin = au ? new Date(jour(au).getTime() + JOUR_MS) : new Date(Math.ceil(maintenant.getTime() / JOUR_MS) * JOUR_MS);
  const debut = du ? jour(du) : new Date(fin.getTime() - 7 * JOUR_MS);
  if (debut >= fin) throw new BadRequestException("La date de début doit précéder la date de fin");
  if (fin.getTime() - debut.getTime() > PERIODE_MAX_JOURS * JOUR_MS) throw new BadRequestException("Période limitée à un an");
  return { debut, fin };
}

const secondes = (de: Date, a: Date | null) => (a ? Math.round((a.getTime() - de.getTime()) / 1000) : null);

function quantile(valeurs: number[], q: number) {
  if (valeurs.length === 0) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  return tri[Math.min(tri.length - 1, Math.floor(q * tri.length))]!;
}

const resumeDelais = (valeurs: number[]) => ({ nombre: valeurs.length, mediane: quantile(valeurs, 0.5), p90: quantile(valeurs, 0.9) });

// Supervision : relire l'activité passée et mesurer les délais de la centrale.
@Injectable()
export class SupervisionService {
  constructor(private readonly db: PrismaService) {}

  async historique(f: Filtres, page: number) {
    const { debut, fin } = periode(f.du, f.au);
    const q = f.q?.trim();
    const where: Prisma.AlerteWhereInput = {
      creeLe: { gte: debut, lt: fin },
      ...(f.type && { type: f.type }),
      ...(f.statut && { statut: f.statut }),
      ...(f.operateurId && { operateurId: f.operateurId }),
      ...(q && {
        OR: [
          { numero: { contains: q, mode: "insensitive" } },
          { support: { code: { contains: q, mode: "insensitive" } } },
          { foyer: { libelle: { contains: q, mode: "insensitive" } } },
          { issue: { contains: q, mode: "insensitive" } },
        ],
      }),
    };
    const [total, alertes] = await Promise.all([
      this.db.alerte.count({ where }),
      this.db.alerte.findMany({
        where,
        orderBy: { creeLe: "desc" },
        skip: (page - 1) * PAR_PAGE,
        take: PAR_PAGE,
        include: { support: true, foyer: { include: { quartier: { include: { ville: true } } } }, operateur: { select: { nom: true } } },
      }),
    ]);
    return {
      total,
      page,
      parPage: PAR_PAGE,
      alertes: alertes.map((a) => ({
        numero: a.numero,
        type: a.type,
        urgence: URGENCES[a.type].bouton,
        statut: a.statut,
        creeLe: a.creeLe,
        lieu: a.foyer ? `${a.foyer.quartier.nom}, ${a.foyer.quartier.ville.nom}` : null,
        support: { libelle: SUPPORTS[a.support.type].libelle, code: a.support.code },
        operateur: a.operateur?.nom ?? null,
        rattachee: a.principaleId != null,
        rappel: a.rappel,
        issue: a.issue,
        delaiPriseEnChargeS: secondes(a.creeLe, a.priseEnChargeLe),
        delaiSurPlaceS: secondes(a.creeLe, a.surPlaceLe),
      })),
    };
  }

  // Chiffres de la période. Les témoins rattachés à un incident ne comptent pas comme des incidents distincts.
  async statistiques(du: string | undefined, au: string | undefined) {
    const { debut, fin } = periode(du, au);
    const alertes = await this.db.alerte.findMany({
      where: { creeLe: { gte: debut, lt: fin } },
      select: {
        type: true,
        statut: true,
        rappel: true,
        issue: true,
        principaleId: true,
        creeLe: true,
        priseEnChargeLe: true,
        surPlaceLe: true,
        operateurId: true,
        operateur: { select: { nom: true } },
      },
    });
    const incidents = alertes.filter((a) => a.principaleId == null);
    const parType = Object.fromEntries(Object.keys(URGENCES).map((t) => [t, 0])) as Record<TypeUrgence, number>;
    for (const a of incidents) parType[a.type]++;

    const priseEnCharge = incidents.flatMap((a) => secondes(a.creeLe, a.priseEnChargeLe) ?? []);
    const surPlace = incidents.flatMap((a) => secondes(a.creeLe, a.surPlaceLe) ?? []);

    const operateurs = new Map<string, { id: string; nom: string; traitees: number; delais: number[] }>();
    for (const a of incidents) {
      if (!a.operateurId || !a.operateur) continue;
      const o = operateurs.get(a.operateurId) ?? { id: a.operateurId, nom: a.operateur.nom, traitees: 0, delais: [] };
      o.traitees++;
      const d = secondes(a.creeLe, a.priseEnChargeLe);
      if (d != null) o.delais.push(d);
      operateurs.set(a.operateurId, o);
    }

    const jours = new Map<string, number>();
    for (let t = debut.getTime(); t < fin.getTime(); t += JOUR_MS) jours.set(new Date(t).toISOString().slice(0, 10), 0);
    for (const a of incidents) {
      const j = a.creeLe.toISOString().slice(0, 10);
      jours.set(j, (jours.get(j) ?? 0) + 1);
    }

    return {
      du: debut.toISOString().slice(0, 10),
      au: new Date(fin.getTime() - JOUR_MS).toISOString().slice(0, 10),
      alertes: alertes.length,
      incidents: incidents.length,
      enCours: incidents.filter((a) => a.statut !== "CLOTUREE" && a.statut !== "ANNULEE").length,
      annuleesParTemoin: incidents.filter((a) => a.issue === "Annulée par le témoin").length,
      faussesAlertes: incidents.filter((a) => a.rappel === "FAUSSE_ALERTE").length,
      parType,
      delais: { priseEnCharge: resumeDelais(priseEnCharge), surPlace: resumeDelais(surPlace) },
      operateurs: [...operateurs.values()]
        .map((o) => ({ id: o.id, nom: o.nom, traitees: o.traitees, medianePriseEnChargeS: quantile(o.delais, 0.5) }))
        .sort((a, b) => b.traitees - a.traitees),
      parJour: [...jours.entries()].map(([jour, nombre]) => ({ jour, nombre })),
    };
  }

  // Opérateurs et superviseurs, pour le filtre de l'historique.
  async operateurs() {
    return this.db.utilisateur.findMany({
      where: { role: { in: ["OPERATEUR", "SUPERVISEUR", "ADMIN", "SUPERADMIN"] } },
      orderBy: { nom: "asc" },
      select: { id: true, nom: true, actif: true },
    });
  }
}
