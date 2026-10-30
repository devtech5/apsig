import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { genererJeton } from "@apsig/domain";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { config } from "../src/config.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { connecter as connecterCompte, creerFoyer, preparerReferentiel, viderFile } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;
let quartierId: string;

const connecter = (role: Parameters<typeof connecterCompte>[2]) => connecterCompte(app, db, role);
const seConnecter = (email: string, password: string) =>
  request(app.getHttpServer()).post("/api/auth/sign-in/email").set("Origin", config.centraleUrl).send({ email, password });
const email = () => `nouveau-${genererJeton(6).toLowerCase()}@apsig.test`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configurerApp(module.createNestApplication<NestExpressApplication>());
  await app.init();
  db = app.get(PrismaService);
  quartierId = await preparerReferentiel(db);
});

afterAll(async () => {
  if (db) await viderFile(db);
  await app?.close();
});

describe("Accès par espace", () => {
  it("supervision pour les superviseurs, administration pour les administrateurs", async () => {
    const op = await connecter("OPERATEUR");
    await op.agent.get("/supervision/statistiques").expect(403);
    await op.agent.get("/administration/comptes").expect(403);
    const sup = await connecter("SUPERVISEUR");
    await sup.agent.get("/supervision/statistiques").expect(200);
    await sup.agent.get("/administration/comptes").expect(403);
    const admin = await connecter("ADMIN");
    await admin.agent.get("/supervision/historique").expect(200);
    await admin.agent.get("/administration/comptes").expect(200);
  });
});

describe("Comptes", () => {
  it("un administrateur crée un opérateur, qui se connecte avec le mot de passe remis", async () => {
    const { agent } = await connecter("ADMIN");
    const adresse = email();
    const r = await agent.post("/administration/comptes").send({ nom: "Yao Opérateur", email: adresse, role: "OPERATEUR" }).expect(201);
    expect(r.body.motDePasse).toMatch(/^[A-Za-z0-9]{16}$/);
    await seConnecter(adresse, r.body.motDePasse).expect(200);
    await agent.post("/administration/comptes").send({ nom: "Doublon", email: adresse.toUpperCase(), role: "OPERATEUR" }).expect(409);
  });

  it("chacun ne gère que les rôles inférieurs au sien", async () => {
    const admin = await connecter("ADMIN");
    await admin.agent.post("/administration/comptes").send({ nom: "Autre admin", email: email(), role: "ADMIN" }).expect(403);
    await admin.agent.post("/administration/comptes").send({ nom: "Super", email: email(), role: "SUPERADMIN" }).expect(403);

    const autreAdmin = await connecter("ADMIN");
    await admin.agent.patch(`/administration/comptes/${autreAdmin.utilisateur.id}`).send({ actif: false }).expect(403);
    await admin.agent.patch(`/administration/comptes/${admin.utilisateur.id}`).send({ role: "SUPERADMIN" }).expect(403);

    const op = await connecter("OPERATEUR");
    await admin.agent.patch(`/administration/comptes/${op.utilisateur.id}`).send({ role: "ADMIN" }).expect(403);
    await admin.agent.patch(`/administration/comptes/${op.utilisateur.id}`).send({ role: "SUPERVISEUR" }).expect(200);

    const liste = await admin.agent.get("/administration/comptes").expect(200);
    const parId = new Map((liste.body as { id: string; gerable: boolean }[]).map((c) => [c.id, c.gerable]));
    expect(parId.get(op.utilisateur.id)).toBe(true);
    expect(parId.get(autreAdmin.utilisateur.id)).toBe(false);
    expect(parId.get(admin.utilisateur.id)).toBe(false);

    const superadmin = await connecter("SUPERADMIN");
    await superadmin.agent.post("/administration/comptes").send({ nom: "Admin régional", email: email(), role: "ADMIN" }).expect(201);
  });

  it("désactiver un opérateur en service ferme ses sessions et le sort de la répartition", async () => {
    const admin = await connecter("ADMIN");
    const op = await connecter("OPERATEUR");
    await op.agent.post("/centrale/presence").send({ presence: "EN_SERVICE" }).expect(200);
    await admin.agent.patch(`/administration/comptes/${op.utilisateur.id}`).send({ actif: false }).expect(200);
    await op.agent.get("/centrale/alertes").expect(401);
    const u = await db.utilisateur.findUniqueOrThrow({ where: { id: op.utilisateur.id } });
    expect(u).toMatchObject({ actif: false, presence: "HORS_SERVICE" });
    await admin.agent.post(`/administration/comptes/${op.utilisateur.id}/reinitialiser`).expect(409);
  });

  it("réinitialisation : nouveau mot de passe, double authentification à refaire", async () => {
    const admin = await connecter("ADMIN");
    const op = await connecter("OPERATEUR");
    await db.utilisateur.update({ where: { id: op.utilisateur.id }, data: { deuxFacteurs: true } });
    const r = await admin.agent.post(`/administration/comptes/${op.utilisateur.id}/reinitialiser`).expect(200);
    await seConnecter(op.utilisateur.email, op.motDePasse).expect(401);
    await seConnecter(op.utilisateur.email, r.body.motDePasse).expect(200);
    expect((await db.utilisateur.findUniqueOrThrow({ where: { id: op.utilisateur.id } })).deuxFacteurs).toBe(false);
  });

  it("le journal d'audit trace qui a fait quoi", async () => {
    const admin = await connecter("ADMIN");
    const adresse = email();
    await admin.agent.post("/administration/comptes").send({ nom: "Tracé", email: adresse, role: "CONSEILLER" }).expect(201);
    const r = await admin.agent.get("/administration/journal").query({ action: "compte." }).expect(200);
    const entree = (r.body.entrees as { action: string; cible: string; auteur: string }[]).find((e) => e.cible === adresse);
    expect(entree).toMatchObject({ action: "compte.creer", auteur: admin.utilisateur.nom });
  });
});

describe("Supervision", () => {
  async function alerteTraitee(priseEnChargeApresS: number) {
    const { jetons } = await creerFoyer(db, quartierId);
    const r = await request(app.getHttpServer()).post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "MEDICAL" }).expect(201);
    const a = await db.alerte.findUniqueOrThrow({ where: { numero: r.body.numero } });
    await db.alerte.update({ where: { id: a.id }, data: { statut: "PRISE_EN_CHARGE", priseEnChargeLe: new Date(a.creeLe.getTime() + priseEnChargeApresS * 1000) } });
    return a.numero;
  }

  it("historique filtré, avec les délais de chaque alerte", async () => {
    const { agent } = await connecter("SUPERVISEUR");
    const numero = await alerteTraitee(42);
    const r = await agent.get("/supervision/historique").query({ q: numero, du: aujourdhui(), au: aujourdhui() }).expect(200);
    expect(r.body.total).toBe(1);
    expect(r.body.alertes[0]).toMatchObject({ numero, type: "MEDICAL", statut: "PRISE_EN_CHARGE", delaiPriseEnChargeS: 42, delaiSurPlaceS: null });
    const autreType = await agent.get("/supervision/historique").query({ q: numero, type: "INCENDIE" }).expect(200);
    expect(autreType.body.total).toBe(0);
  });

  it("statistiques de la période : incidents, délais médians, répartition par jour", async () => {
    const { agent } = await connecter("SUPERVISEUR");
    await alerteTraitee(20);
    await alerteTraitee(60);
    const r = await agent.get("/supervision/statistiques").query({ du: aujourdhui(), au: aujourdhui() }).expect(200);
    expect(r.body.incidents).toBeGreaterThanOrEqual(2);
    expect(r.body.parType.MEDICAL).toBeGreaterThanOrEqual(2);
    expect(r.body.delais.priseEnCharge.nombre).toBeGreaterThanOrEqual(2);
    expect(r.body.delais.priseEnCharge.mediane).not.toBeNull();
    expect(r.body.parJour).toEqual([{ jour: aujourdhui(), nombre: r.body.incidents }]);
  });

  it("refuse une période incohérente", async () => {
    const { agent } = await connecter("SUPERVISEUR");
    await agent.get("/supervision/statistiques").query({ du: "2026-10-30", au: "2026-10-01" }).expect(400);
    await agent.get("/supervision/statistiques").query({ du: "30/10/2026" }).expect(400);
    await agent.get("/supervision/statistiques").query({ du: "2024-01-01", au: "2026-01-01" }).expect(400);
  });
});
