import type { Espace } from "@apsig/domain";

// Une seule application, trois sites selon le domaine :
// - centrale.apsig.online : le personnel qui reçoit et traite les alertes ;
// - code-secours.apsig.online : le terrain (recenseurs, chefs d'équipe, poseurs de plaques) ;
// - base.apsig.online : le QG, qui pilote tout (personnel, abonnements, finance, forfaits, prestataires).
// En développement (localhost), toutes les pages sont ouvertes.
export type Site = "centrale" | "terrain" | "base" | "tout";

export function siteDe(hote: string): Site {
  if (hote.startsWith("centrale.")) return "centrale";
  if (hote.startsWith("code-secours.")) return "terrain";
  if (hote.startsWith("base.")) return "base";
  return "tout";
}

export const siteCourant = (): Site => (typeof window === "undefined" ? "tout" : siteDe(window.location.hostname));

export const NOMS_SITE: Record<Exclude<Site, "tout">, { titre: string; sousTitre: string; adresse: string }> = {
  centrale: { titre: "Centrale APSIG", sousTitre: "Réception et traitement des alertes", adresse: "https://centrale.apsig.online" },
  terrain: { titre: "Espace terrain", sousTitre: "Recensement et pose des plaques", adresse: "https://code-secours.apsig.online" },
  base: { titre: "QG APSIG", sousTitre: "Pilotage du projet", adresse: "https://base.apsig.online" },
};

// Espaces servis par chaque site : un compte n'y voit que ceux de ses espaces.
export const ESPACES_SITE: Record<Exclude<Site, "tout">, Espace[]> = {
  centrale: ["centrale", "supervision"],
  terrain: ["recensement", "pose", "equipe"],
  base: ["administration", "abonnements", "finance", "forfaits", "prestataires"],
};

// Site où se trouve chaque espace : pour envoyer un compte vers le bon domaine.
export const SITE_ESPACE = Object.fromEntries(
  Object.entries(ESPACES_SITE).flatMap(([site, espaces]) => espaces.map((e) => [e, site])),
) as Partial<Record<Espace, Exclude<Site, "tout">>>;

export const espaceSurSite = (espace: Espace, site: Site) => site === "tout" || ESPACES_SITE[site].includes(espace);
