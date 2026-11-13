import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { connecter } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;

const demande = {
  cible: "FAMILLE",
  prenom: "Awa",
  nom: "Traoré",
  telephone: "+225 07 44 55 66 77",
  email: "",
  ville: "Daloa",
  quartier: "Lobia",
  consentement: true,
};

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configurerApp(module.createNestApplication<NestExpressApplication>());
  await app.init();
  db = app.get(PrismaService);
});

afterAll(async () => {
  await app?.close();
});

describe("Inscriptions en ligne", () => {
  it("enregistre une demande complète", async () => {
    const telephone = `+225 07 ${Date.now().toString().slice(-8)}`;
    await request(app.getHttpServer()).post("/public/inscriptions").send({ ...demande, telephone }).expect(201, { recue: true });
    const d = await db.demandeInscription.findFirstOrThrow({ where: { telephone } });
    expect(d).toMatchObject({ statut: "NOUVELLE", cible: "FAMILLE", email: null, adresse: null });
  });

  it("refuse une demande sans consentement", async () => {
    const r = await request(app.getHttpServer()).post("/public/inscriptions").send({ ...demande, consentement: false }).expect(400);
    expect(r.body.erreurs.map((e: { champ: string }) => e.champ)).toContain("consentement");
  });

  it("champ piège rempli : même réponse, rien n'est enregistré", async () => {
    const telephone = `+225 05 ${Date.now().toString().slice(-8)}`;
    await request(app.getHttpServer()).post("/public/inscriptions").send({ ...demande, telephone, site: "spam" }).expect(201, { recue: true });
    expect(await db.demandeInscription.count({ where: { telephone } })).toBe(0);
  });
});

describe("Demandes dans l'espace Abonnements", () => {
  it("le conseiller liste, traite puis rouvre une demande ; chaque geste est audité", async () => {
    const d = await db.demandeInscription.create({ data: { cible: "PARTICULIER", prenom: "Koffi", nom: "Yao", telephone: "+225 01 02 03 04 05", ville: "Daloa", quartier: "Tazibouo" } });
    const { agent } = await connecter(app, db, "CONSEILLER");

    const nouvelles = await agent.get("/abonnements/demandes").expect(200);
    expect(nouvelles.body.demandes.map((x: { id: string }) => x.id)).toContain(d.id);
    expect(nouvelles.body.nouvelles).toBeGreaterThanOrEqual(1);

    const traitee = await agent.post(`/abonnements/demandes/${d.id}/traiter`).send({ traitee: true }).expect(200);
    expect(traitee.body).toMatchObject({ statut: "TRAITEE" });
    expect(traitee.body.traiteeLe).not.toBeNull();
    const historique = await agent.get("/abonnements/demandes?statut=TRAITEE").expect(200);
    expect(historique.body.demandes.map((x: { id: string }) => x.id)).toContain(d.id);

    await agent.post(`/abonnements/demandes/${d.id}/traiter`).send({ traitee: false }).expect(200);
    expect(await db.demandeInscription.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ statut: "NOUVELLE", traiteeLe: null });
    expect(await db.audit.count({ where: { cible: d.id, action: { in: ["demande.traiter", "demande.rouvrir"] } } })).toBe(2);
  });

  it("réservé à l'espace Abonnements ; demande inconnue : 404", async () => {
    const { agent: operateur } = await connecter(app, db, "OPERATEUR");
    await operateur.get("/abonnements/demandes").expect(403);
    await request(app.getHttpServer()).get("/abonnements/demandes").expect(401);
    const { agent } = await connecter(app, db, "CONSEILLER");
    await agent.post("/abonnements/demandes/inexistante/traiter").send({ traitee: true }).expect(404);
  });
});
