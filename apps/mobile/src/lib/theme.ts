import type { TypeUrgence } from "./types";

// Mêmes couleurs que la page d'alerte et la centrale.
export const COULEURS = {
  brand: "#1e3a6e",
  brandClair: "#dbe6f7",
  fond: "#eef2f7",
  encre: "#0f1b33",
  attenue: "#5a6680",
  ligne: "#d5dce8",
  blanc: "#ffffff",
  danger: "#c81e1e",
  dangerFond: "#fde8e8",
  succes: "#15803d",
  succesFond: "#dcfce7",
  alerteFond: "#fef3c7",
  alerteEncre: "#854d0e",
} as const;

// Une couleur et un pictogramme par urgence : on reconnaît le bouton sans savoir lire.
export const URGENCE_VISUEL: Record<TypeUrgence, { couleur: string; icone: string; court: string }> = {
  AGRESSION: { couleur: "#c81e1e", icone: "shield-alert", court: "Agression · Vol" },
  MEDICAL: { couleur: "#c2410c", icone: "heart-pulse", court: "Malaise · Accident" },
  INCENDIE: { couleur: "#1d4ed8", icone: "fire", court: "Incendie" },
  EGARE: { couleur: "#7e22ce", icone: "account-search", court: "Enfant égaré" },
  SOINS: { couleur: "#15803d", icone: "medical-bag", court: "Infirmier" },
  AUTRE: { couleur: "#475569", icone: "phone-in-talk", court: "Autre" },
};

export const ESPACE = 16;
export const RAYON = 16;
