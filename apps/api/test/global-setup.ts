// Prépare la base de test : création si besoin, puis application des migrations.
import { execSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL!;
  const nom = new URL(testUrl).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(nom)) throw new Error(`Nom de base de test invalide : ${nom}`);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const existe = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [nom]);
  if (!existe.rowCount) await admin.query(`CREATE DATABASE "${nom}"`);
  await admin.end();

  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, "../../../packages/db"),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
}
