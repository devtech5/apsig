import { existsSync } from "node:fs";
import path from "node:path";

// En développement, un seul .env à la racine du monorepo ; en production, les variables du système.
const envFile = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const liste = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  publicAlertUrl: process.env.PUBLIC_ALERT_URL ?? "http://localhost:3001",
  corsOrigins: liste(process.env.CORS_ORIGINS ?? process.env.PUBLIC_ALERT_URL ?? "http://localhost:3001"),
  // Derrière le proxy d'un hébergeur : IP du visiteur lue dans X-Forwarded-For.
  trustProxy: process.env.TRUST_PROXY === "1",
  // Déclenchements d'alerte max par minute et par IP.
  limiteAlertesParMinute: Number(process.env.RATE_LIMIT_ALERTES ?? 6),
  // Adresse de la centrale : les cookies de session sont posés sur ce domaine (l'API y est relayée).
  centraleUrl: process.env.CENTRALE_URL ?? "http://localhost:3002",
  // Clé de signature des sessions, obligatoire en production.
  authSecret: process.env.BETTER_AUTH_SECRET,
  // Double authentification (application TOTP) exigée pour tout le back-office, sauf CENTRALE_2FA=facultatif.
  deuxFacteursObligatoire: process.env.CENTRALE_2FA !== "facultatif",
};
