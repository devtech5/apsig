import path from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Un seul .env à la racine du monorepo
config({ path: path.resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
