import type { EtatAbonnement, MoyenPaiement, RoleMembre, StatutSupport, TypeSupport } from "@apsig/domain";
import type { Position } from "./api";

// Formes renvoyées par apps/api (cf. AbonnementsService).
export type Formule = {
  id: string;
  code: string;
  nom: string;
  prixFcfa: number;
  prixMensuelFcfa: number | null;
  moisInclus: number;
  intervention: boolean;
  composition: { type: TypeSupport; quantite: number }[];
};

export type Referentiel = {
  villes: { id: string; code: string; nom: string; quartiers: (Position & { id: string; nom: string })[] }[];
  formules: Formule[];
};

export type FoyerResume = {
  id: string;
  numero: number | null;
  libelle: string;
  lieu: string;
  titulaire: { prenom: string; nom: string; telephone: string | null } | null;
  abonnement: { formule: string; etat: EtatAbonnement; fin: string } | null;
  supports: number;
};

export type Membre = {
  id: string;
  role: RoleMembre;
  prenom: string;
  nom: string;
  telephone: string | null;
  anneeNaissance: number | null;
  infosMedicalesRenseignees: boolean;
};

export type Contact = { id: string; nom: string; relation: string; telephone: string; ordre: number; consentiLe: string | null };

export type Support = {
  id: string;
  type: TypeSupport;
  libelle: string;
  code: string;
  codeCourt: string;
  statut: StatutSupport;
  porteur: { id: string; prenom: string; nom: string } | null;
  vehicule: string | null;
  url: string;
  poseLe: string | null;
  creeLe: string;
};

export type Foyer = {
  id: string;
  numero: number | null;
  libelle: string;
  adresse: string | null;
  quartier: { id: string; nom: string };
  ville: { id: string; code: string; nom: string };
  position: Position | null;
  adresseVerifiee: boolean;
  creeLe: string;
  membres: Membre[];
  contacts: Contact[];
  supports: Support[];
  abonnements: { id: string; formule: { id: string; code: string; nom: string }; etat: EtatAbonnement; debut: string; fin: string }[];
  paiements: { id: string; montantFcfa: number; operateur: MoyenPaiement; statut: string; reference: string | null; creeLe: string }[];
};

export const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

export const date = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Abidjan" });

export const COULEUR_ETAT: Record<EtatAbonnement, string> = {
  ACTIF: "bg-succes-fond text-succes",
  ESSAI: "bg-brand-clair text-brand",
  A_VENIR: "bg-brand-clair text-brand",
  EXPIRE: "bg-danger-fond text-danger",
  RESILIE: "bg-fond text-attenue",
};

export const COULEUR_SUPPORT: Record<StatutSupport, string> = {
  ACTIF: "bg-succes-fond text-succes",
  STOCK: "bg-fond text-attenue",
  SUSPENDU: "bg-alerte-fond text-alerte-encre",
  PERDU: "bg-danger-fond text-danger",
};

// Supports portés par une personne (le porteur est affiché à la centrale pendant une alerte).
export const AVEC_PORTEUR: ReadonlySet<TypeSupport> = new Set(["BRACELET", "CARTE_VOYAGEUR"]);
