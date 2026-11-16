import type { MoyenPaiement, Role } from "@apsig/domain";

// Tableau de bord du QG, tel que renvoyé par GET /finance/tableau-de-bord (apps/api/src/qg/tableau-de-bord.ts).
export type TableauDeBordQg = {
  indicateurs: {
    encaisseMoisFcfa: number;
    encaisseJourFcfa: number;
    abonnesActifs: number;
    nouveauxAbonnesMois: number;
    clientsNonSoldes: number;
    resteAEncaisserFcfa: number;
    mensualitesFcfa: number;
    recensesMois: number;
    posesMois: number;
    aPoser: number;
    aPoserDepuis7j: number;
  };
  parMois: { mois: string; abonnementsFcfa: number; acomptesFcfa: number }[];
  aSurveiller: {
    acomptesAnciens: number;
    expirentBientot: number;
    posesEnRetard: number;
    elements: { nature: "solde" | "expiration" | "pose"; foyerId: string; client: string; detail: string }[];
  };
  derniersEncaissements: { id: string; le: string; montantFcfa: number; operateur: MoyenPaiement; foyer: { id: string; libelle: string }; nature: "abonnement" | "acompte" }[];
  terrain: { id: string; nom: string; role: Role; recensesMois: number; posesMois: number }[];
};

const FUSEAU = "Africa/Abidjan";
const ESPACE_INSECABLE = " ";

export const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/\s/g, ESPACE_INSECABLE)} F`;

// Graduations de l'axe : « 0 », « 25 k », « 1,5 M ».
export function fcfaCourt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return String(n);
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// « 2026-11 » : « nov. » sur l'axe, « novembre 2026 » dans l'infobulle.
export function libelleMois(mois: string, long = false) {
  const i = Number(mois.slice(5, 7)) - 1;
  return long ? `${MOIS_LONGS[i]} ${mois.slice(0, 4)}` : MOIS_COURTS[i]!;
}

// « Vendredi 13 novembre 2026 ».
export function dateDuJour(maintenant = new Date()) {
  const texte = maintenant.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: FUSEAU });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: FUSEAU });

export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;
