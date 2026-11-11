import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// En développement, un seul .env à la racine du monorepo ; en production, les variables du système.
const envFile = path.resolve(process.cwd(), "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config: NextConfig = {
  // Adresse de l'API appelée par le navigateur du visiteur (intégrée au build).
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
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default config;
