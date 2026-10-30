import { distanceM, type Position } from "./geo.ts";
import type { Priorite, TypeUrgence } from "./urgences.ts";

// Répartition des alertes entre opérateurs (valeurs validées le 30/10/2026, réglables ici).
export const REPARTITION = {
  delaiAcceptationS: 30, // sinon l'alerte passe à l'opérateur suivant
  capaciteOperateur: 3, // alertes ouvertes au-delà desquelles l'opérateur ne reçoit plus rien
  signeDeVieS: 60, // centrale fermée ou réseau coupé : l'opérateur passe hors service
  inactiviteMin: 10, // alerte acceptée sans aucune action : signalée au superviseur
  // Mode crise : attribution suspendue, chaque opérateur prend « la suivante » dans la file triée.
  crise: { alertesParOperateur: 3, attenteMaxS: 120 },
} as const;

// Regroupement par incident : un incendie ou une agression scannés par plusieurs voisins = un seul dossier.
// Pas de regroupement médical : deux malaises voisins sont deux urgences distinctes.
export const INCIDENT = {
  rayonM: 300,
  fenetreMs: 15 * 60_000,
  types: ["INCENDIE", "AGRESSION"] as readonly TypeUrgence[],
} as const;

export type Candidat = { id: string; charge: number; derniereAttributionLe: Date | null };

// L'opérateur le moins chargé ; à charge égale, celui qui attend une alerte depuis le plus longtemps.
export function choisirOperateur<T extends Candidat>(candidats: readonly T[], capacite: number = REPARTITION.capaciteOperateur): T | undefined {
  return candidats
    .filter((c) => c.charge < capacite)
    .sort((a, b) => a.charge - b.charge || (a.derniereAttributionLe?.getTime() ?? 0) - (b.derniereAttributionLe?.getTime() ?? 0))[0];
}

const POIDS_PRIORITE: Record<Priorite, number> = { CRITIQUE: 3000, HAUTE: 2000, NORMALE: 1000 };

// Ordre de la file commune : la priorité d'abord, toujours ; à priorité égale, fiabilité (0-100),
// attente (10 points par minute, plafonnés à 30 min) et témoins rattachés (plafonnés à 20).
export function scoreTriage(
  a: { priorite: Priorite; scoreFiabilite: number; creeLe: Date; rattachees?: number },
  maintenant = new Date(),
): number {
  const attenteMin = Math.max(0, (maintenant.getTime() - a.creeLe.getTime()) / 60_000);
  return POIDS_PRIORITE[a.priorite] + a.scoreFiabilite + Math.min(300, Math.round(attenteMin * 10)) + 5 * Math.min(20, a.rattachees ?? 0);
}

export type EtatFile = { enAttente: number; operateursEnService: number; plusLongueAttenteS: number };

// Entrée en crise : trop d'alertes en attente par opérateur, ou une alerte qui attend trop longtemps.
// Sortie seulement quand la file est redescendue à une alerte par opérateur (évite les allers-retours).
export function estEnCrise(e: EtatFile, dejaEnCrise = false): boolean {
  const operateurs = Math.max(1, e.operateursEnService);
  const tropLongue = e.enAttente > 0 && e.plusLongueAttenteS > REPARTITION.crise.attenteMaxS;
  if (dejaEnCrise) return e.enAttente > operateurs || tropLongue;
  return e.enAttente > REPARTITION.crise.alertesParOperateur * operateurs || tropLongue;
}

type AlerteVoisine = { type: TypeUrgence; creeLe: Date; lat: number | null; lng: number | null };

// Alerte principale ouverte la plus proche, du même type, dans le rayon et la fenêtre de l'incident.
export function trouverIncident<T extends AlerteVoisine>(
  ouvertes: readonly T[],
  nouvelle: { type: TypeUrgence; position: Position | null },
  maintenant = new Date(),
): (T & { distanceM: number }) | undefined {
  const position = nouvelle.position;
  if (!position || !INCIDENT.types.includes(nouvelle.type)) return undefined;
  return ouvertes
    .filter((a) => a.type === nouvelle.type && a.lat != null && a.lng != null && maintenant.getTime() - a.creeLe.getTime() < INCIDENT.fenetreMs)
    .map((a) => ({ ...a, distanceM: distanceM(position, { lat: a.lat!, lng: a.lng! }) }))
    .filter((a) => a.distanceM <= INCIDENT.rayonM)
    .sort((a, b) => a.distanceM - b.distanceM)[0];
}
