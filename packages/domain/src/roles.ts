import { normaliserTelephone } from "./abonnements.ts";

// Rôles des comptes APSIG et espaces du back-office auxquels chacun donne accès.
export const ROLES = ["RECENSEUR", "AGENT", "INTERVENANT", "CONSEILLER", "OPERATEUR", "CHEF_EQUIPE", "SUPERVISEUR", "ADMIN", "SUPERADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Terrain (inscription en deux temps) : le recenseur inscrit les clients (étape 1), le poseur pose les plaques (étape 2),
// le chef d'équipe suit ses recenseurs et crée leurs comptes.
export const LIBELLES_ROLE: Record<Role, string> = {
  RECENSEUR: "Recenseur (terrain)",
  AGENT: "Poseur de plaques",
  INTERVENANT: "Intervenant (unité terrain)",
  CONSEILLER: "Conseiller abonnements",
  OPERATEUR: "Opérateur",
  CHEF_EQUIPE: "Chef d'équipe terrain",
  SUPERVISEUR: "Superviseur",
  ADMIN: "Administrateur",
  SUPERADMIN: "Super-administrateur",
};

// centrale : traiter les alertes ; supervision : équipe, réattribution, historique, statistiques ;
// abonnements : foyers, supports et QR codes ; administration : comptes et journal d'audit.
// recensement : inscrire un client (étape 1) ; pose : poser la plaque et conclure l'inscription (étape 2) ;
// equipe : suivi des recenseurs et création de leurs comptes ; terrain : missions des unités (application mobile).
export const ESPACES = {
  centrale: ["OPERATEUR", "SUPERVISEUR", "ADMIN", "SUPERADMIN"],
  supervision: ["SUPERVISEUR", "ADMIN", "SUPERADMIN"],
  abonnements: ["CONSEILLER", "ADMIN", "SUPERADMIN"],
  administration: ["ADMIN", "SUPERADMIN"],
  recensement: ["RECENSEUR", "AGENT", "CHEF_EQUIPE", "CONSEILLER", "ADMIN", "SUPERADMIN"],
  pose: ["AGENT", "CHEF_EQUIPE", "CONSEILLER", "ADMIN", "SUPERADMIN"],
  equipe: ["CHEF_EQUIPE", "ADMIN", "SUPERADMIN"],
  terrain: ["INTERVENANT"],
} as const satisfies Record<string, readonly Role[]>;
export type Espace = keyof typeof ESPACES;

export const ESPACES_WEB = ["centrale", "supervision", "abonnements", "administration", "recensement", "pose", "equipe"] as const satisfies readonly Espace[];
export const ESPACES_MOBILE = ["recensement", "pose", "terrain"] as const satisfies readonly Espace[];

export const LIBELLES_ESPACE: Record<Espace, string> = {
  centrale: "Centrale",
  supervision: "Supervision",
  abonnements: "Abonnements",
  administration: "Administration",
  recensement: "Recensement",
  pose: "Pose des plaques",
  equipe: "Équipe terrain",
  terrain: "Missions terrain",
};

export const aAcces = (role: Role, espace: Espace) => (ESPACES[espace] as readonly Role[]).includes(role);

// Le recenseur, mandataire indépendant sans e-mail, se connecte avec son téléphone et un mot de passe, sans application
// d'authentification : ses droits se limitent à inscrire des clients et à voir les siens.
export const ROLES_SANS_DEUX_FACTEURS: readonly Role[] = ["RECENSEUR"];
export const deuxFacteursExige = (role: Role) => !ROLES_SANS_DEUX_FACTEURS.includes(role);

// Un administrateur gère les comptes de rang inférieur ; seul le super-administrateur gère les administrateurs.
const RANG: Record<Role, number> = { RECENSEUR: 0, AGENT: 0, INTERVENANT: 0, CONSEILLER: 0, OPERATEUR: 0, CHEF_EQUIPE: 1, SUPERVISEUR: 1, ADMIN: 2, SUPERADMIN: 3 };
export const peutGererRole = (acteur: Role, cible: Role) =>
  aAcces(acteur, "administration") && (acteur === "SUPERADMIN" || RANG[cible] < RANG[acteur]);

// Le chef d'équipe crée et gère les comptes de ses recenseurs (et seulement eux).
export const ROLES_EQUIPE: readonly Role[] = ["RECENSEUR"];

// Identifiant de connexion d'un compte au téléphone : Better Auth se connecte par e-mail, on en dérive un du numéro.
// « 07 08 09 10 11 » et « +225 0708091011 » donnent tous deux 2250708091011@terrain.apsig.ci.
export const DOMAINE_TERRAIN = "terrain.apsig.ci";
export const emailTerrain = (telephone: string) => {
  const n = normaliserTelephone(telephone);
  return /^\d{10}$/.test(n) ? `225${n}@${DOMAINE_TERRAIN}` : null;
};
export const estEmailTerrain = (email: string) => email.endsWith(`@${DOMAINE_TERRAIN}`);
// « 2250708091011@terrain.apsig.ci » → « 07 08 09 10 11 », pour l'affichage.
export const telephoneDeEmail = (email: string) => {
  const n = email.split("@")[0]!.slice(3);
  return n.replace(/(\d{2})(?=\d)/g, "$1 ");
};
