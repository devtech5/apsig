import { existsSync } from "node:fs";
import path from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const envFile = path.resolve(import.meta.dirname, "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL manquant (voir .env.example)");

export default defineConfig({
  // SWC émet les métadonnées de décorateurs nécessaires à l'injection de NestJS.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    globalSetup: ["test/global-setup.ts"],
    // La double authentification n'est exigée que dans les tests qui la vérifient.
    env: { DATABASE_URL: testDatabaseUrl, RATE_LIMIT_ALERTES: "1000", CENTRALE_2FA: "facultatif", EXPO_PUSH: "inactif" },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
