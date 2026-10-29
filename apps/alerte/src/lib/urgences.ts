import type { TypeUrgence } from "@apsig/domain";

// Présentation des boutons (couleurs de la maquette V8) et conseils affichés en attendant les secours.
export const STYLE_URGENCE: Record<TypeUrgence, { fond: string; icone: NomIcone }> = {
  AGRESSION: { fond: "bg-agression", icone: "bouclier" },
  MEDICAL: { fond: "bg-medical", icone: "croix" },
  INCENDIE: { fond: "bg-incendie", icone: "flamme" },
  EGARE: { fond: "bg-egare", icone: "recherche" },
  SOINS: { fond: "bg-soins", icone: "stethoscope" },
  AUTRE: { fond: "bg-autre", icone: "question" },
};

export const CONSEILS: Record<TypeUrgence, string[]> = {
  AGRESSION: [
    "Mettez-vous à l'abri dans une pièce qui ferme à clé.",
    "Ne confrontez pas les agresseurs.",
    "Gardez votre téléphone sur vous, en silencieux.",
    "Si possible, retenez un signalement (tenue, véhicule, direction).",
  ],
  MEDICAL: [
    "Restez auprès de la victime et parlez-lui.",
    "Ne la déplacez pas, sauf danger immédiat.",
    "En cas de saignement, comprimez la plaie avec un linge propre.",
    "Dégagez l'accès pour les secours.",
  ],
  INCENDIE: [
    "Évacuez immédiatement les lieux, sans prendre l'ascenseur.",
    "Fermez les portes derrière vous.",
    "Baissez-vous sous la fumée.",
    "Ne revenez pas chercher d'affaires.",
  ],
  EGARE: [
    "Restez avec la personne dans un endroit sûr et visible.",
    "Rassurez-la et ne la confiez pas à un inconnu.",
    "Ne publiez pas sa photo sur les réseaux sociaux.",
    "Gardez cette page ouverte pour suivre l'alerte.",
  ],
  SOINS: [
    "Préparez les ordonnances et les médicaments en cours.",
    "Notez les symptômes et l'heure à laquelle ils sont apparus.",
    "Si l'état s'aggrave (respiration difficile, perte de connaissance), appelez le SAMU au 185.",
  ],
  AUTRE: [
    "Mettez-vous en sécurité si la situation l'exige.",
    "Gardez cette page ouverte pour suivre l'alerte.",
  ],
};

// Numéros publics en Côte d'Ivoire : le service APSIG ne les remplace pas.
export const NUMEROS_PUBLICS = [
  { numero: "170", service: "Police" },
  { numero: "180", service: "Pompiers" },
  { numero: "185", service: "SAMU" },
] as const;

export type NomIcone =
  | "bouclier" | "croix" | "flamme" | "recherche" | "stethoscope" | "question"
  | "coche" | "croixFermer" | "repere" | "telephone" | "alerte"
  | "camera" | "lampe" | "qr";
