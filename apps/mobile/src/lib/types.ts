// Réponses de l'API, vues par l'application. Le paquet @apsig/domain n'est pas importé ici :
// il dépend de modules Node.js absents du téléphone.

export type TypeUrgence = "AGRESSION" | "MEDICAL" | "INCENDIE" | "EGARE" | "SOINS" | "AUTRE";
export type StatutAlerte = "NOUVELLE" | "PRISE_EN_CHARGE" | "EN_ROUTE" | "SUR_PLACE" | "CLOTUREE" | "ANNULEE";
export type ProblemePosition = "REFUSEE" | "INDISPONIBLE";

export const STATUTS_OUVERTS: StatutAlerte[] = ["NOUVELLE", "PRISE_EN_CHARGE", "EN_ROUTE", "SUR_PLACE"];

export const LIBELLES_STATUT: Record<StatutAlerte, string> = {
  NOUVELLE: "Alerte reçue par la centrale",
  PRISE_EN_CHARGE: "Un opérateur s'en occupe",
  EN_ROUTE: "Les secours sont en route",
  SUR_PLACE: "Les secours sont sur place",
  CLOTUREE: "Alerte terminée",
  ANNULEE: "Alerte annulée",
};

export type Urgence = { type: TypeUrgence; bouton: string; description: string };

// Ce que voit le témoin (ou l'abonné) de son alerte.
export type SuiviAlerte = {
  numero: string;
  type: TypeUrgence;
  urgence: string;
  statut: StatutAlerte;
  creeLe: string;
  priseEnChargeLe: string | null;
  surPlaceLe: string | null;
  clotureLe: string | null;
  positionPartagee: boolean;
  peutAnnuler: boolean;
};

export type AlerteFoyer = SuiviAlerte & {
  support: { type: string; libelle: string; code: string };
  concerne: string | null;
  parMoi: boolean;
  cleTemoin?: string;
};

export type EspaceAbonne = {
  moi: { prenom: string; nom: string; telephone: string | null };
  foyer: { libelle: string; adresse: string | null; quartier: string; ville: string; adresseVerifiee: boolean };
  membres: { id: string; prenom: string; nom: string; role: string; moi: boolean }[];
  contacts: { nom: string; relation: string; telephone: string }[];
  supports: { type: string; libelle: string; code: string; statut: string; porteur: string | null }[];
  abonnement: { formule: string; etat: "ESSAI" | "ACTIF" | "A_VENIR" | "EXPIRE" | "RESILIE"; fin: string } | null;
  urgences: Urgence[];
};

// Page d'alerte publique : ce que montre un QR scanné.
export type SupportPublic = {
  type: string;
  libelle: string;
  code: string;
  lieu: { quartier: string; ville: string; adresseVerifiee: boolean } | null;
  urgences: Urgence[];
};

export type Position = { lat: number; lng: number; precisionM?: number };

// Menu de l'application (même ordre que l'API), affiché tout de suite, avant toute réponse du serveur.
export const URGENCES_APPLI: Urgence[] = [
  { type: "AGRESSION", bouton: "SOS Agression / Vol / Intrusion", description: "Alerte la Police et la société de sécurité." },
  { type: "MEDICAL", bouton: "SOS Malaise / Maladie / Accident", description: "Alerte le GSPM, le SAMU et l'ambulance privée." },
  { type: "INCENDIE", bouton: "SOS Incendie", description: "Alerte le GSPM." },
  { type: "EGARE", bouton: "SOS Enfant / Personne égarée", description: "Prévient immédiatement la famille." },
  { type: "SOINS", bouton: "Infirmier / Soins à domicile", description: "Infirmier motorisé 24h/24, livraison de médicaments." },
  { type: "AUTRE", bouton: "Autre situation", description: "La centrale APSIG vous rappelle." },
];
