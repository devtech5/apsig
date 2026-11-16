import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// En développement, un seul .env à la racine du monorepo ; en production, les variables du système.
const envFile = path.resolve(process.cwd(), "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config: NextConfig = {
  // Adresse de l'API appelée par le navigateur du témoin (intégrée au build).
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" },
  // Image Docker légère : serveur autonome, dépendances du monorepo tracées depuis la racine.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Le jeton du QR ne doit fuiter vers aucun autre site.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Caméra : uniquement pour le scanner de la page d'accueil.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
        ],
      },
      // Service worker de la PWA : toujours relu, pour qu'une nouvelle version s'applique sans attendre.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default config;
