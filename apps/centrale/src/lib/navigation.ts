import type { Espace } from "@apsig/domain";
import type { NomIcone } from "@/components/Icone";
import { espaceSurSite, siteCourant } from "./site";

// Pages de chaque site (lib/site.ts) : la centrale (alertes), le terrain (recensement, pose), le QG (pilotage).
// Le groupe range les pages dans la barre latérale du QG ; l'ordre fixe la page d'accueil de chaque compte.
export type LienNavigation = { href: string; libelle: string; icone: NomIcone; espace: Espace; groupe: string };

export const NAVIGATION: LienNavigation[] = [
  { href: "/", libelle: "Alertes", icone: "file", espace: "centrale", groupe: "Centrale" },
  { href: "/carte", libelle: "Carte", icone: "carte", espace: "centrale", groupe: "Centrale" },
  { href: "/supervision", libelle: "Supervision", icone: "equipe", espace: "supervision", groupe: "Centrale" },
  { href: "/recensement", libelle: "Recensement", icone: "plus", espace: "recensement", groupe: "Terrain" },
  { href: "/pose", libelle: "Pose de plaque", icone: "repere", espace: "pose", groupe: "Terrain" },
  { href: "/equipe", libelle: "Équipe terrain", icone: "equipe", espace: "equipe", groupe: "Terrain" },
  { href: "/tableau-de-bord", libelle: "Tableau de bord", icone: "tableau", espace: "finance", groupe: "Pilotage" },
  { href: "/finance", libelle: "Finance", icone: "portefeuille", espace: "finance", groupe: "Pilotage" },
  { href: "/abonnements", libelle: "Abonnements", icone: "maison", espace: "abonnements", groupe: "Clients" },
  { href: "/clients", libelle: "Clients recensés", icone: "equipe", espace: "abonnements", groupe: "Clients" },
  { href: "/forfaits", libelle: "Forfaits", icone: "lien", espace: "forfaits", groupe: "Offre" },
  { href: "/prestataires", libelle: "Prestataires", icone: "bouclier", espace: "prestataires", groupe: "Offre" },
  { href: "/administration", libelle: "Personnel", icone: "reglages", espace: "administration", groupe: "Administration" },
];

export const liensDe = (espaces: Espace[]) => NAVIGATION.filter((n) => espaces.includes(n.espace) && espaceSurSite(n.espace, siteCourant()));

// Page d'accueil de chaque compte sur ce site : la première de ses espaces.
export const accueilDe = (espaces: Espace[]) => liensDe(espaces)[0]?.href ?? "/securite";

export const estActif = (href: string, chemin: string) => (href === "/" ? chemin === "/" : chemin === href || chemin.startsWith(`${href}/`));

// Page du site courant correspondant au chemin (la plus longue correspondance), pour refuser celles d'un autre site.
export const pageDe = (chemin: string) => NAVIGATION.filter((n) => estActif(n.href, chemin)).sort((a, b) => b.href.length - a.href.length)[0];

// Liens regroupés dans l'ordre d'apparition des groupes.
export function parGroupe(liens: LienNavigation[]) {
  const groupes = new Map<string, LienNavigation[]>();
  for (const l of liens) groupes.set(l.groupe, [...(groupes.get(l.groupe) ?? []), l]);
  return [...groupes.entries()].map(([groupe, items]) => ({ groupe, liens: items }));
}
