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
import { connecter } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;

const telephone = () => `07${Date.now().toString().slice(-8)}`;

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configurerApp(module.createNestApplication<NestExpressApplication>());
  await app.init();
  db = app.get(PrismaService);
});

afterAll(async () => {
  await app?.close();
});

async function seConnecter(email: string, password: string) {
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post("/api/auth/sign-in/email").set("Origin", config.centraleUrl).send({ email, password });
  return { agent, statut: r.status };
}

describe("Mot de passe provisoire", () => {
  it("l'administrateur choisit le mot de passe provisoire ; la personne doit le remplacer avant tout accès", async () => {
    const { agent: admin } = await connecter(app, db, "ADMIN");
    const email = `conseiller-${genererJeton(6).toLowerCase()}@apsig.test`;
    await admin.post("/administration/comptes").send({ nom: "Yao Conseiller", email, role: "CONSEILLER", motDePasse: "court" }).expect(400);
    const cree = await admin.post("/administration/comptes").send({ nom: "Yao Conseiller", email, role: "CONSEILLER", motDePasse: "Bienvenue26" }).expect(201);
    expect(cree.body.motDePasse).toBe("Bienvenue26");

    const { agent, statut } = await seConnecter(email, "Bienvenue26");
    expect(statut).toBe(200);
    expect((await agent.get("/compte").expect(200)).body).toMatchObject({ role: "CONSEILLER", motDePasseProvisoire: true });
    const bloque = await agent.get("/abonnements/foyers").expect(403);
    expect(bloque.body.message).toBe("Mot de passe provisoire à remplacer avant d'accéder au back-office");

    await agent.post("/compte/mot-de-passe").send({ actuel: "Mauvais-mot-2026", nouveau: "Mon-nouveau-secret-2026" }).expect(400);
    await agent.post("/compte/mot-de-passe").send({ actuel: "Bienvenue26", nouveau: "trop-court" }).expect(400);
    await agent.post("/compte/mot-de-passe").send({ actuel: "Bienvenue26", nouveau: "Bienvenue26" }).expect(400);
    await agent.post("/compte/mot-de-passe").send({ actuel: "Bienvenue26", nouveau: "Mon-nouveau-secret-2026" }).expect(200);

    expect((await agent.get("/compte").expect(200)).body).toMatchObject({ motDePasseProvisoire: false });
    await agent.get("/abonnements/foyers").expect(200);
    expect(await db.audit.count({ where: { action: "compte.mot_de_passe", cible: email } })).toBe(1);

    expect((await seConnecter(email, "Bienvenue26")).statut).toBe(401);
    expect((await seConnecter(email, "Mon-nouveau-secret-2026")).statut).toBe(200);
  });

  it("sans mot de passe choisi, un mot de passe provisoire est généré ; la réinitialisation le rend provisoire de nouveau", async () => {
    const { agent: admin } = await connecter(app, db, "SUPERADMIN");
    const email = `admin-${genererJeton(6).toLowerCase()}@apsig.test`;
    const cree = await admin.post("/administration/comptes").send({ nom: "Awa Admin", email, role: "ADMIN" }).expect(201);
    expect(cree.body.motDePasse).toHaveLength(16);
    const u = await db.utilisateur.findUniqueOrThrow({ where: { email } });
    expect(u.motDePasseProvisoire).toBe(true);

    await db.utilisateur.update({ where: { id: u.id }, data: { motDePasseProvisoire: false } });
    const r = await admin.post(`/administration/comptes/${u.id}/reinitialiser`).send({}).expect(200);
    expect(r.body.motDePasse).toHaveLength(16);
    expect((await db.utilisateur.findUniqueOrThrow({ where: { id: u.id } })).motDePasseProvisoire).toBe(true);
  });

  it("le chef d'équipe donne un mot de passe provisoire au recenseur, qui le remplace sur son téléphone", async () => {
    const { agent: chef } = await connecter(app, db, "CHEF_EQUIPE");
    const tel = telephone();
    await chef.post("/equipe/membres").send({ nom: "Koffi Recenseur", telephone: tel, role: "RECENSEUR", motDePasse: "Terrain-07" }).expect(201);

    const { agent, statut } = await seConnecter(`225${tel}@terrain.apsig.ci`, "Terrain-07");
    expect(statut).toBe(200);
    expect((await agent.get("/compte").expect(200)).body).toMatchObject({ role: "RECENSEUR", motDePasseProvisoire: true });
    await agent.get("/pose/recensements").expect(403);
    await agent.post("/compte/mot-de-passe").send({ actuel: "Terrain-07", nouveau: "Koffi-recense-2026" }).expect(200);
    await agent.get("/pose/recensements").expect(200);
  });

  it("le changement exige une session", async () => {
    await request(app.getHttpServer()).post("/compte/mot-de-passe").send({ actuel: "x", nouveau: "y" }).expect(401);
  });
});
