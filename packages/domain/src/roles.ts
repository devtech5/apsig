// Rôles des comptes APSIG et espaces du back-office auxquels chacun donne accès.
export const ROLES = ["AGENT", "INTERVENANT", "CONSEILLER", "OPERATEUR", "SUPERVISEUR", "ADMIN", "SUPERADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const LIBELLES_ROLE: Record<Role, string> = {
  AGENT: "Agent de pose",
  INTERVENANT: "Intervenant (unité terrain)",
  CONSEILLER: "Conseiller abonnements",
  OPERATEUR: "Opérateur",
  SUPERVISEUR: "Superviseur",
  ADMIN: "Administrateur",
  SUPERADMIN: "Super-administrateur",
};

// centrale : traiter les alertes ; supervision : équipe, réattribution, historique, statistiques ;
// abonnements : foyers, supports et QR codes ; administration : comptes et journal d'audit.
// pose et terrain sont les espaces de l'application mobile : pose des supports, missions des unités.
export const ESPACES = {
  centrale: ["OPERATEUR", "SUPERVISEUR", "ADMIN", "SUPERADMIN"],
  supervision: ["SUPERVISEUR", "ADMIN", "SUPERADMIN"],
  abonnements: ["CONSEILLER", "ADMIN", "SUPERADMIN"],
  administration: ["ADMIN", "SUPERADMIN"],
  pose: ["AGENT", "CONSEILLER", "ADMIN", "SUPERADMIN"],
  terrain: ["INTERVENANT"],
} as const satisfies Record<string, readonly Role[]>;
export type Espace = keyof typeof ESPACES;

export const ESPACES_WEB = ["centrale", "supervision", "abonnements", "administration"] as const satisfies readonly Espace[];
export const ESPACES_MOBILE = ["pose", "terrain"] as const satisfies readonly Espace[];

export const LIBELLES_ESPACE: Record<Espace, string> = {
  centrale: "Centrale",
  supervision: "Supervision",
  abonnements: "Abonnements",
  administration: "Administration",
  pose: "Pose des supports",
  terrain: "Missions terrain",
};

export const aAcces = (role: Role, espace: Espace) => (ESPACES[espace] as readonly Role[]).includes(role);

// Un administrateur gère les comptes de rang inférieur ; seul le super-administrateur gère les administrateurs.
const RANG: Record<Role, number> = { AGENT: 0, INTERVENANT: 0, CONSEILLER: 0, OPERATEUR: 0, SUPERVISEUR: 1, ADMIN: 2, SUPERADMIN: 3 };
export const peutGererRole = (acteur: Role, cible: Role) =>
  aAcces(acteur, "administration") && (acteur === "SUPERADMIN" || RANG[cible] < RANG[acteur]);
