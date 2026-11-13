import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { ADRESSE, connecter, preparerReferentiel } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;
let quartierId: string;

const client = (telephone: string) => ({ cible: "FAMILLE", prenom: "Adjoua", nom: "Kouamé", telephone, quartierId, adresse: "" });

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configurerApp(module.createNestApplication<NestExpressApplication>());
  await app.init();
  db = app.get(PrismaService);
  quartierId = await preparerReferentiel(db);
});

afterAll(async () => {
  await app?.close();
});

describe("Inscription en deux temps : recensement puis pose", () => {
  it("l'agent recense un client payé : code plaque, forfait unique et 10 000 F encaissés, sans GPS", async () => {
    const { agent } = await connecter(app, db, "AGENT");
    const ref = await agent.get("/pose/referentiel").expect(200);
    expect(ref.body.some((v: { quartiers: { id: string }[] }) => v.quartiers.some((q) => q.id === quartierId))).toBe(true);

    const r = await agent
      .post("/pose/recensements")
      .send({ ...client(`+225 07 ${Date.now().toString().slice(-8)}`), paiement: { operateur: "ESPECES" } })
      .expect(201);
    expect(r.body).toMatchObject({ client: "Adjoua Kouamé", cible: "FAMILLE", paye: true, posee: false });
    expect(r.body.code).toMatch(/^TST-CENTRE-\d{3}$/);

    const foyer = await db.foyer.findUniqueOrThrow({ where: { id: r.body.id }, include: { paiements: true, abonnements: { include: { formule: true } }, supports: true } });
    expect(foyer).toMatchObject({ lat: null, adresseVerifiee: false });
    expect(foyer.paiements.map((p) => p.montantFcfa)).toEqual([10_000]);
    expect(foyer.abonnements[0]?.formule.code).toBe("UNIQUE_FAMILLE");
    expect(foyer.supports.map((s) => s.type).sort()).toEqual(["INTERIEUR", "PORTAIL"]);

    const mes = await agent.get("/pose/recensements").expect(200);
    expect(mes.body[0]).toMatchObject({ id: r.body.id, code: r.body.code });

    // Second passage : la plaque est posée, le GPS relevé devient l'adresse vérifiée.
    const plaque = foyer.supports.find((s) => s.type === "PORTAIL")!;
    await agent.post(`/pose/supports/${plaque.jeton}`).send({ position: { ...ADRESSE, precisionM: 8 } }).expect(201);
    const apres = await agent.get("/pose/recensements").expect(200);
    expect(apres.body[0]).toMatchObject({ id: r.body.id, posee: true });
    expect(await db.foyer.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ adresseVerifiee: true, lat: ADRESSE.lat });
  });

  it("client pas encore payé : réservé avec son code, sans abonnement ni paiement", async () => {
    const { agent } = await connecter(app, db, "AGENT");
    const r = await agent.post("/pose/recensements").send({ ...client(`+225 05 ${Date.now().toString().slice(-8)}`), paiement: null }).expect(201);
    expect(r.body).toMatchObject({ paye: false, cible: null });
    expect(r.body.code).toMatch(/^TST-CENTRE-\d{3}$/);
    const foyer = await db.foyer.findUniqueOrThrow({ where: { id: r.body.id }, include: { paiements: true, abonnements: true } });
    expect(foyer.paiements).toHaveLength(0);
    expect(foyer.abonnements).toHaveLength(0);
  });

  it("réservé à l'espace Pose", async () => {
    await request(app.getHttpServer()).get("/pose/referentiel").expect(401);
    const { agent: operateur } = await connecter(app, db, "OPERATEUR");
    await operateur.post("/pose/recensements").send({ ...client("+225 07 00 00 00 01"), paiement: null }).expect(403);
  });
});
