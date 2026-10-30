import type { Espace, Priorite, ProblemePosition, Role, StatutAlerte, StatutRappel, TypeSupport, TypeUrgence } from "@apsig/domain";

// Formes renvoyées par apps/api (cf. auth.module.ts et CentraleService).
export type Compte = {
  id: string;
  nom: string;
  email: string;
  role: Role;
  espaces: Espace[];
  deuxFacteurs: boolean;
  deuxFacteursRequis: boolean;
};

export type Presence = "EN_SERVICE" | "PAUSE" | "HORS_SERVICE";

export type AlerteResume = {
  numero: string;
  type: TypeUrgence;
  urgence: string;
  priorite: Priorite;
  statut: StatutAlerte;
  creeLe: string;
  clotureLe: string | null;
  support: { type: TypeSupport; libelle: string; code: string };
  lieu: string | null;
  position: Position | null;
  // Localisation refusée ou impossible chez le témoin : à rappeler.
  problemePosition: ProblemePosition | null;
  scoreFiabilite: number;
  rappel: StatutRappel;
  niveauEscalade: number;
  redeclenchements: number;
  abonnementExpire: boolean;
  intervention: boolean;
  operateur: string | null;
  attribueeA: { id: string; nom: string } | null;
  attribueeLe: string | null;
  accepteeLe: string | null;
  signaleeLe: string | null;
  temoinsRattaches: number;
};

export type MembreEquipe = {
  id: string;
  nom: string;
  role: Role;
  presence: Presence;
  presenceLe: string | null;
  vuLe: string | null;
  enLigne: boolean;
  charge: number;
};

export type FileCentrale = {
  presence: Presence;
  crise: { actif: boolean; depuis: string | null; enAttente: number; operateursEnService: number; plusLongueAttenteS: number };
  mesAlertes: AlerteResume[];
  aPrendre: { total: number; alertes: AlerteResume[] };
  // Réservés à la supervision.
  autres?: AlerteResume[];
  equipe?: MembreEquipe[];
  recentes: AlerteResume[];
};

type Personne = { prenom: string; nom: string; anneeNaissance: number | null; infosMedicales: string | null };
export type Position = { lat: number; lng: number };

export type AlerteDetail = AlerteResume & {
  source: string;
  priseEnChargeLe: string | null;
  surPlaceLe: string | null;
  issue: string | null;
  temoin: (Position & { precisionM: number | null; le: string | null }) | null;
  porteur: Personne | null;
  foyer: {
    libelle: string;
    adresse: string | null;
    quartier: string;
    ville: string;
    adresseVerifiee: boolean;
    abonnement: { formule: string; statut: string; fin: string } | null;
    membres: (Personne & { role: string; telephone: string | null })[];
    contacts: { nom: string; relation: string; telephone: string }[];
  } | null;
  fiabilite: { score: number; niveau: "ELEVEE" | "MOYENNE" | "FAIBLE"; raisons: { delta: number; texte: string }[] };
  principale: { numero: string; statut: StatutAlerte } | null;
  temoinsRattaches: {
    numero: string;
    statut: StatutAlerte;
    creeLe: string;
    support: { type: TypeSupport; libelle: string; code: string };
    temoin: Position | null;
  }[];
  journal: { le: string; nature: string; texte: string; auteur: string | null }[];
  messages: { canal: string; destinataire: string; nomDestinataire: string | null; texte: string; statut: string; creeLe: string }[];
  peutAgir: boolean;
  peutPrendre: boolean;
  statutsPossibles: StatutAlerte[];
};

export class ErreurApi extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

// /api/* est relayé vers l'API par next.config.ts (même origine : cookies de session first-party).
export async function appelApi<T>(chemin: string, corps?: unknown, methode?: "POST" | "PATCH" | "DELETE"): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode ?? (corps === undefined ? "GET" : "POST"),
      headers: corps === undefined ? undefined : { "Content-Type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      cache: "no-store",
    });
  } catch {
    throw new ErreurApi("Connexion au serveur impossible", 0);
  }
  const donnees = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const message = typeof donnees?.message === "string" ? donnees.message : null;
    throw new ErreurApi(message ?? `Erreur ${reponse.status}`, reponse.status);
  }
  return donnees as T;
}
