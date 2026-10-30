// Valeurs alignées sur les enums RoleMembre, Operateur, StatutSupport et StatutAbonnement de @apsig/db.

export const ROLES_MEMBRE = ["TITULAIRE", "CONJOINT", "ENFANT", "PARENT", "AUTRE"] as const;
export type RoleMembre = (typeof ROLES_MEMBRE)[number];
export const LIBELLES_ROLE_MEMBRE: Record<RoleMembre, string> = {
  TITULAIRE: "Titulaire",
  CONJOINT: "Conjoint(e)",
  ENFANT: "Enfant",
  PARENT: "Parent",
  AUTRE: "Autre",
};

export const MOYENS_PAIEMENT = ["ORANGE_MONEY", "MTN_MOMO", "MOOV_MONEY", "WAVE", "ESPECES"] as const;
export type MoyenPaiement = (typeof MOYENS_PAIEMENT)[number];
export const LIBELLES_MOYEN_PAIEMENT: Record<MoyenPaiement, string> = {
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  WAVE: "Wave",
  ESPECES: "Espèces",
};

export const STATUTS_SUPPORT = ["STOCK", "ACTIF", "SUSPENDU", "PERDU"] as const;
export type StatutSupport = (typeof STATUTS_SUPPORT)[number];
export const LIBELLES_STATUT_SUPPORT: Record<StatutSupport, string> = {
  STOCK: "En stock",
  ACTIF: "Actif",
  SUSPENDU: "Suspendu",
  PERDU: "Perdu",
};

// État affiché : un abonnement « actif » dont la fin est passée est expiré, même si personne ne l'a encore marqué.
export type EtatAbonnement = "ESSAI" | "ACTIF" | "A_VENIR" | "EXPIRE" | "RESILIE";
export const LIBELLES_ETAT_ABONNEMENT: Record<EtatAbonnement, string> = {
  ESSAI: "Essai",
  ACTIF: "Actif",
  A_VENIR: "À venir",
  EXPIRE: "Expiré",
  RESILIE: "Résilié",
};

export function etatAbonnement(a: { statut: "ESSAI" | "ACTIF" | "EXPIRE" | "RESILIE"; debut: Date; fin: Date }, maintenant: Date): EtatAbonnement {
  if (a.statut === "RESILIE" || a.statut === "EXPIRE") return a.statut;
  if (a.fin <= maintenant) return "EXPIRE";
  if (a.debut > maintenant) return "A_VENIR";
  return a.statut;
}

// Fin de période : même jour, `mois` plus tard (le 31 janvier + 1 mois donne le 28 ou 29 février).
export function ajouterMois(d: Date, mois: number): Date {
  const r = new Date(d);
  const jour = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + mois);
  const dernier = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(jour, dernier));
  return r;
}
