import type { TypeSupport } from "./supports.ts";

// Tarif de lancement (11/11/2026) : un forfait unique, même prix d'entrée pour tous ; seule la mensualité dépend du client.
// « abonnement » : montant payé à l'entrée, en une seule fois, non remboursable ; « mensualité » : montant payé chaque mois.
// Les options s'ajouteront plus tard, en supplément du forfait.
export const CIBLES = ["PARTICULIER", "FAMILLE", "ENTREPRISE"] as const;
export type Cible = (typeof CIBLES)[number];

// ENTREPRISE couvre aussi les autres organisations (ONG, mutuelles…).
export const LIBELLES_CIBLE: Record<Cible, string> = { PARTICULIER: "Particulier", FAMILLE: "Famille", ENTREPRISE: "Entreprise" };
export const LIBELLES_CIBLE_DETAILLES: Record<Cible, string> = { ...LIBELLES_CIBLE, ENTREPRISE: "Entreprise et autres (ONG, mutuelle…)" };

export const MENSUALITES_FCFA: Record<Cible, number> = { PARTICULIER: 2_000, FAMILLE: 5_000, ENTREPRISE: 10_000 };

// Le premier mois est compris dans l'abonnement. Provisoire : les supports fournis restent à confirmer (CADRAGE §7).
export const FORFAIT_UNIQUE = {
  abonnementFcfa: 10_000,
  moisInclus: 1,
  supports: [["PORTAIL", 1], ["INTERIEUR", 1]] as readonly (readonly [TypeSupport, number])[],
} as const;

// Les trois formules vendues. Le code est la clé de la table Formule.
export const FORMULES = CIBLES.map((cible) => ({
  code: `UNIQUE_${cible}`,
  nom: `Forfait unique — ${LIBELLES_CIBLE[cible]}`,
  cible,
  abonnementFcfa: FORFAIT_UNIQUE.abonnementFcfa,
  mensualiteFcfa: MENSUALITES_FCFA[cible],
  moisInclus: FORFAIT_UNIQUE.moisInclus,
  supports: FORFAIT_UNIQUE.supports,
}));

// Formules retirées de la vente, conservées pour les abonnements qui y renvoient :
// celles d'avant la grille, puis la grille Bronze / Gold / Premium du matin du 11/11/2026.
export const FORMULES_RETIREES = [
  "ENFANT", "MAISON", "FAMILLE", "SECURITE_PLUS",
  ...["BRONZE", "GOLD", "PREMIUM"].flatMap((forfait) => CIBLES.map((cible) => `${forfait}_${cible}`)),
] as const;
