import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { siteDe } from "@/lib/site";

// Application installable (PWA). Une seule application sert trois sites : le nom affiché sous l'icône suit le domaine.
const NOMS = {
  terrain: { name: "APSIG Terrain · recensement et pose", short_name: "APSIG Terrain" },
  centrale: { name: "Centrale APSIG", short_name: "Centrale" },
  base: { name: "QG APSIG", short_name: "QG APSIG" },
  tout: { name: "APSIG", short_name: "APSIG" },
} as const;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const hote = (await headers()).get("host") ?? "";
  const noms = NOMS[siteDe(hote)];
  return {
    id: "/",
    ...noms,
    description: "Espace des équipes APSIG : recensement des clients, pose des plaques, suivi de l'équipe.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1e3a6e",
    theme_color: "#1e3a6e",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
