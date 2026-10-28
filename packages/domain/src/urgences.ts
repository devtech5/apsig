import type { TypeSupport } from "./supports.ts";

// Valeurs alignées sur les enums TypeUrgence, Priorite et TypePartenaire de @apsig/db.
export const TYPES_URGENCE = ["AGRESSION", "MEDICAL", "INCENDIE", "EGARE", "SOINS", "AUTRE"] as const;
export type TypeUrgence = (typeof TYPES_URGENCE)[number];
export type Priorite = "CRITIQUE" | "HAUTE" | "NORMALE";
export type Destinataire =
  | "POLICE" | "GSPM" | "SAMU" | "AMBULANCE_PRIVEE" | "INFIRMIER" | "SECURITE_PRIVEE"
  | "INTERVENTION_APSIG" | "TITULAIRE" | "FAMILLE" | "VOISINAGE";

type Urgence = { bouton: string; description: string; priorite: Priorite; destinataires: Destinataire[]; urgenceVitale: boolean };

// Liste fusionnée : schéma fonctionnel + maquette V8 (cf. docs/CADRAGE.md §3).
export const URGENCES: Record<TypeUrgence, Urgence> = {
  AGRESSION: {
    bouton: "SOS Agression / Vol / Intrusion",
    description: "Alerte la Police et la société de sécurité.",
    priorite: "CRITIQUE",
    destinataires: ["POLICE", "SECURITE_PRIVEE", "TITULAIRE", "FAMILLE"],
    urgenceVitale: true,
  },
  MEDICAL: {
    bouton: "SOS Malaise / Maladie / Accident",
    description: "Alerte le GSPM, le SAMU et l'ambulance privée.",
    priorite: "HAUTE",
    destinataires: ["GSPM", "SAMU", "AMBULANCE_PRIVEE", "TITULAIRE", "FAMILLE"],
    urgenceVitale: true,
  },
  INCENDIE: {
    bouton: "SOS Incendie",
    description: "Alerte le GSPM.",
    priorite: "CRITIQUE",
    destinataires: ["GSPM", "TITULAIRE", "FAMILLE", "VOISINAGE"],
    urgenceVitale: true,
  },
  EGARE: {
    bouton: "SOS Enfant / Personne égarée",
    description: "Prévient immédiatement la famille.",
    priorite: "HAUTE",
    destinataires: ["TITULAIRE", "FAMILLE"],
    urgenceVitale: false,
  },
  SOINS: {
    bouton: "Infirmier / Soins à domicile",
    description: "Infirmier motorisé 24h/24, livraison de médicaments.",
    priorite: "NORMALE",
    destinataires: ["INFIRMIER", "TITULAIRE"],
    urgenceVitale: false,
  },
  AUTRE: {
    bouton: "Autre situation",
    description: "La centrale APSIG vous rappelle.",
    priorite: "NORMALE",
    destinataires: ["TITULAIRE"],
    urgenceVitale: false,
  },
};

// Urgences proposées selon le support scanné, dans l'ordre d'affichage.
export const MENUS: Record<TypeSupport, TypeUrgence[]> = {
  PORTAIL: ["AGRESSION", "INCENDIE", "MEDICAL", "AUTRE"],
  INTERIEUR: ["MEDICAL", "SOINS", "INCENDIE", "AGRESSION"],
  BRACELET: ["EGARE", "MEDICAL", "AUTRE"],
  CARTE_VOYAGEUR: ["MEDICAL", "AGRESSION", "EGARE", "AUTRE"],
  CARTE_VEHICULE: ["MEDICAL", "AGRESSION", "AUTRE"],
};

// Formule « Sécurité + » : l'équipe d'intervention APSIG est engagée en premier sur une agression.
export function destinatairesPour(type: TypeUrgence, opts: { intervention?: boolean } = {}): Destinataire[] {
  const base = URGENCES[type].destinataires;
  return opts.intervention && type === "AGRESSION" ? ["INTERVENTION_APSIG", ...base] : [...base];
}

export const menuPour =(support: TypeSupport) => MENUS[support].map((type) => ({ type, ...URGENCES[type] }));

// Une urgence reçue hors du menu (USSD, ancienne page) reste acceptée : on ne refuse jamais une alerte.
export const estTypeUrgence = (v: unknown): v is TypeUrgence => TYPES_URGENCE.includes(v as TypeUrgence);
