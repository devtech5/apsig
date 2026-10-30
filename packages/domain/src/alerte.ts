import type { TypeUrgence } from "./urgences.ts";

// Valeurs alignées sur l'enum StatutAlerte de @apsig/db.
export const STATUTS_ALERTE = ["NOUVELLE", "PRISE_EN_CHARGE", "EN_ROUTE", "SUR_PLACE", "CLOTUREE", "ANNULEE"] as const;
export type StatutAlerte = (typeof STATUTS_ALERTE)[number];

export const LIBELLES_STATUT: Record<StatutAlerte, string> = {
  NOUVELLE: "Nouvelle",
  PRISE_EN_CHARGE: "Prise en charge",
  EN_ROUTE: "Unité en route",
  SUR_PLACE: "Unité sur place",
  CLOTUREE: "Clôturée",
  ANNULEE: "Annulée",
};

export const STATUTS_OUVERTS: ReadonlySet<StatutAlerte> = new Set(["NOUVELLE", "PRISE_EN_CHARGE", "EN_ROUTE", "SUR_PLACE"]);
export const estOuverte = (s: StatutAlerte) => STATUTS_OUVERTS.has(s);

// Valeurs alignées sur l'enum ProblemePosition de @apsig/db : pourquoi la position du témoin manque.
export const PROBLEMES_POSITION = ["REFUSEE", "INDISPONIBLE"] as const;
export type ProblemePosition = (typeof PROBLEMES_POSITION)[number];

const TRANSITIONS: Record<StatutAlerte, StatutAlerte[]> = {
  NOUVELLE: ["PRISE_EN_CHARGE", "CLOTUREE", "ANNULEE"],
  PRISE_EN_CHARGE: ["EN_ROUTE", "SUR_PLACE", "CLOTUREE", "ANNULEE"],
  EN_ROUTE: ["SUR_PLACE", "CLOTUREE", "ANNULEE"],
  SUR_PLACE: ["CLOTUREE"],
  CLOTUREE: [],
  ANNULEE: [],
};

export const peutPasser = (de: StatutAlerte, vers: StatutAlerte) => TRANSITIONS[de].includes(vers);
export const statutsSuivants = (de: StatutAlerte): StatutAlerte[] => [...TRANSITIONS[de]];

export function transition(de: StatutAlerte, vers: StatutAlerte): StatutAlerte {
  if (!peutPasser(de, vers)) throw new Error(`Transition interdite : ${de} → ${vers}`);
  return vers;
}

// Le témoin ne peut annuler que tant qu'aucune unité n'est sur place.
export const temoinPeutAnnuler = (s: StatutAlerte) => s === "NOUVELLE" || s === "PRISE_EN_CHARGE" || s === "EN_ROUTE";

// Regroupement : même type, même support, alerte encore ouverte depuis moins de 10 min.
export const FENETRE_DOUBLON_MS = 10 * 60_000;

type AlerteResume = { supportId: string; type: TypeUrgence; statut: StatutAlerte; creeLe: Date };

export function trouverDoublon<T extends AlerteResume>(
  existantes: readonly T[],
  nouvelle: { supportId: string; type: TypeUrgence },
  maintenant = new Date(),
): T | undefined {
  return existantes.find(
    (a) =>
      a.supportId === nouvelle.supportId &&
      a.type === nouvelle.type &&
      estOuverte(a.statut) &&
      maintenant.getTime() - a.creeLe.getTime() < FENETRE_DOUBLON_MS,
  );
}

// Escalade sans prise en charge : N1 superviseur (SMS), N2 responsable (appel).
export const SEUILS_ESCALADE_S = [60, 120] as const;

export function niveauEscaladeDu(creeLe: Date, maintenant = new Date(), seuils: readonly number[] = SEUILS_ESCALADE_S): number {
  const ecoule = (maintenant.getTime() - creeLe.getTime()) / 1000;
  return seuils.filter((s) => ecoule >= s).length;
}

export const numeroAlerte = (seq: number) => `ALR-${String(seq).padStart(6, "0")}`;
