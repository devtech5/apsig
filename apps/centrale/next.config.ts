import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// En développement, un seul .env à la racine du monorepo ; en production, les variables du système.
const envFile = path.resolve(process.cwd(), "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Adresse de l'API vue par le serveur de la centrale (intégrée au build : la changer impose de reconstruire).
const API_URL = (process.env.CENTRALE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// Routes du back-office exposées par l'API, une par espace (cf. apps/api).
const ROUTES_API = ["compte", "centrale", "supervision", "abonnements", "administration"];

const config: NextConfig = {
  // Image Docker légère : serveur autonome, dépendances du monorepo tracées depuis la racine.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  // L'API est relayée sur le domaine de la centrale : le cookie de session reste « même origine », sans CORS.
  async rewrites() {
    return [
      { source: "/api/auth/:chemin*", destination: `${API_URL}/api/auth/:chemin*` },
      ...ROUTES_API.map((r) => ({ source: `/api/${r}/:chemin*`, destination: `${API_URL}/${r}/:chemin*` })),
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Données personnelles et de santé : la centrale ne s'affiche jamais dans un cadre tiers.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default config;
