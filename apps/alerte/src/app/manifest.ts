import type { MetadataRoute } from "next";

// Application installable (PWA) : la page d'alerte s'ouvre en plein écran depuis l'écran d'accueil du téléphone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Code-Secours CI · APSIG",
    short_name: "Code-Secours",
    description: "Alerte APSIG : scannez le QR d'une plaque et prévenez la centrale en un appui.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1e3a6e",
    theme_color: "#1e3a6e",
    categories: ["medical", "utilities"],
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
