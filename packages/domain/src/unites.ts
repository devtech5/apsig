// Valeurs alignées sur les enums TypeUnite et StatutUnite de @apsig/db.
export const TYPES_UNITE = ["PATROUILLE", "INTERVENTION", "INFIRMIER", "AMBULANCE"] as const;
export type TypeUnite = (typeof TYPES_UNITE)[number];
export const STATUTS_UNITE = ["DISPONIBLE", "EN_MISSION", "HORS_SERVICE"] as const;
export type StatutUnite = (typeof STATUTS_UNITE)[number];

export const LIBELLES_TYPE_UNITE: Record<TypeUnite, string> = {
  PATROUILLE: "Patrouille",
  INTERVENTION: "Équipe d'intervention",
  INFIRMIER: "Infirmier motorisé",
  AMBULANCE: "Ambulance",
};

export const LIBELLES_STATUT_UNITE: Record<StatutUnite, string> = {
  DISPONIBLE: "Disponible",
  EN_MISSION: "En mission",
  HORS_SERVICE: "Hors service",
};

// Étapes qu'une unité signale depuis l'application ; la clôture reste à la centrale.
export const ETAPES_MISSION = ["EN_ROUTE", "SUR_PLACE", "TERMINEE"] as const;
export type EtapeMission = (typeof ETAPES_MISSION)[number];

// Position de l'unité : au-delà de ce délai, la centrale l'affiche comme ancienne.
export const POSITION_UNITE_RECENTE_MS = 5 * 60_000;
