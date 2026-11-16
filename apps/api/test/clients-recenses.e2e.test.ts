import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { connecter, preparerReferentiel } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;
let quartierId: string;

type Recense = { id: string; code: string; client: string; recenseur: string | null; qr: { plaque: string; interieur: { code: string; url: string } } };

const tel = (prefixe: string) => `+225 ${prefixe} ${Date.now().toString().slice(-8)}`;
const client = (prenom: string, telephone: string) => ({
  cible: "PARTICULIER",
  prenom,
  nom: "Koffi",
  telephone,
  telephone2: "",
  quartierId,
  adresse: "Cour commune, porte rouge, près du marché",
  paiement: null,
});

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

describe("Clients recensés : code de la plaque et QR dès le recensement", () => {
  it("le recenseur voit ses clients, le chef ceux de son équipe, le QG tous ; chacun avec son code et ses QR", async () => {
    const chef = await connecter(app, db, "CHEF_EQUIPE");
    const recenseur = await connecter(app, db, "RECENSEUR");
    const autre = await connecter(app, db, "RECENSEUR");
    await db.utilisateur.update({ where: { id: recenseur.utilisateur.id }, data: { chefId: chef.utilisateur.id } });

    const sien = (await recenseur.agent.post("/pose/recensements").send(client("Aya", tel("07"))).expect(201)).body as Recense;
    const ailleurs = (await autre.agent.post("/pose/recensements").send(client("Ama", tel("05"))).expect(201)).body as Recense;
    const duChef = (await chef.agent.post("/pose/recensements").send(client("Adjo", tel("01"))).expect(201)).body as Recense;

    const ids = (liste: Recense[]) => liste.map((r) => r.id);

    // Recenseur : ses clients seulement, avec le code de la plaque et les deux QR.
    const siens = (await recenseur.agent.get("/pose/recensements").expect(200)).body as Recense[];
    expect(ids(siens)).toEqual([sien.id]);
    expect(siens[0]).toMatchObject({ code: sien.code, recenseur: recenseur.utilisateur.nom, qr: { plaque: expect.stringContaining("/s/"), interieur: { url: expect.stringContaining("/s/") } } });

    // Chef d'équipe : ses propres clients et ceux de ses recenseurs, pas ceux des autres équipes.
    const equipe = ids((await chef.agent.get("/pose/recensements").expect(200)).body);
    expect(equipe).toEqual(expect.arrayContaining([sien.id, duChef.id]));
    expect(equipe).not.toContain(ailleurs.id);

    // QG : tous les clients, avec recherche par code de plaque, nom ou téléphone.
    const admin = await connecter(app, db, "ADMIN");
    const parCode = (await admin.agent.get("/pose/recensements").query({ q: ailleurs.code.toLowerCase() }).expect(200)).body as Recense[];
    expect(ids(parCode)).toEqual([ailleurs.id]);
    expect(parCode[0]!.recenseur).toBe(autre.utilisateur.nom);
    const parNom = ids((await admin.agent.get("/pose/recensements").query({ q: "Adjo Koffi" }).expect(200)).body);
    expect(parNom).toContain(duChef.id);
    // Téléphone saisi sans espaces ni indicatif.
    const telephone = (await db.membre.findFirstOrThrow({ where: { foyerId: ailleurs.id } })).telephone!;
    const parTelephone = ids((await admin.agent.get("/pose/recensements").query({ q: telephone.replace(/\D/g, "").slice(-10) }).expect(200)).body);
    expect(parTelephone).toContain(ailleurs.id);
  });

  it("refusé hors de l'espace Recensement", async () => {
    await request(app.getHttpServer()).get("/pose/recensements").expect(401);
    const { agent } = await connecter(app, db, "OPERATEUR");
    await agent.get("/pose/recensements").expect(403);
  });
});
