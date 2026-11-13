import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { config } from "../src/config.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { connecter, preparerReferentiel } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;
let quartierId: string;

// Numéro unique à chaque exécution : la base de test est conservée d'une fois sur l'autre.
const telephone = () => `07${Date.now().toString().slice(-8)}`;

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

describe("Accès terrain", () => {
  it("le chef d'équipe inscrit un recenseur, qui se connecte par téléphone sans double authentification et recense", async () => {
    const { agent: chef } = await connecter(app, db, "CHEF_EQUIPE");
    const tel = telephone();
    const cree = await chef.post("/equipe/recenseurs").send({ nom: "Koné Awa", telephone: tel }).expect(201);
    expect(cree.body.compte.identifiant).toBe(`${tel.slice(0, 2)} ${tel.slice(2, 4)} ${tel.slice(4, 6)} ${tel.slice(6, 8)} ${tel.slice(8)}`);
    await chef.post("/equipe/recenseurs").send({ nom: "Doublon", telephone: tel }).expect(409);

    // Double authentification exigée pour le personnel, pas pour le recenseur.
    const avant = config.deuxFacteursObligatoire;
    config.deuxFacteursObligatoire = true;
    try {
      const recenseur = request.agent(app.getHttpServer());
      await recenseur
        .post("/api/auth/sign-in/email")
        .set("Origin", config.centraleUrl)
        .send({ email: `225${tel}@terrain.apsig.ci`, password: cree.body.motDePasse })
        .expect(200);
      expect((await recenseur.get("/compte").expect(200)).body).toMatchObject({ role: "RECENSEUR", espaces: ["recensement"], deuxFacteursRequis: false });

      const r = await recenseur
        .post("/pose/recensements")
        .send({ cible: "PARTICULIER", prenom: "Ali", nom: "Touré", telephone: "0101010101", quartierId, adresse: "Cour commune, porte verte", paiement: null })
        .expect(201);
      // Ni la pose des plaques, ni les fiches des abonnés, ni l'équipe.
      await recenseur.get(`/pose/plaques/${r.body.code}`).expect(403);
      await recenseur.get("/abonnements/foyers").expect(403);
      await recenseur.get("/equipe").expect(403);
      expect((await recenseur.get("/pose/recensements").expect(200)).body.map((x: { id: string }) => x.id)).toEqual([r.body.id]);

      // Le poseur voit qui a recensé le client grâce au code de la plaque.
      const { agent: poseur } = await connecter(app, db, "AGENT");
      expect((await poseur.get(`/pose/plaques/${r.body.code}`).expect(200)).body.recenseur).toMatchObject({ nom: "Koné Awa" });
    } finally {
      config.deuxFacteursObligatoire = avant;
    }

    // Le chef suit son recenseur.
    const tableau = await chef.get("/equipe").expect(200);
    expect(tableau.body.membres).toEqual([expect.objectContaining({ nom: "Koné Awa", role: "RECENSEUR", recenses: 1, payes: 0, plaquesPosees: 0, gerable: true })]);
    expect(tableau.body.recensements[0]).toMatchObject({ client: "Ali Touré", recenseur: "Koné Awa" });
  });

  it("un chef d'équipe ne gère que ses recenseurs ; il les désactive et réinitialise leur mot de passe", async () => {
    const { agent: chefA } = await connecter(app, db, "CHEF_EQUIPE");
    const { agent: chefB } = await connecter(app, db, "CHEF_EQUIPE");
    const cree = await chefA.post("/equipe/recenseurs").send({ nom: "Yao Koffi", telephone: telephone() }).expect(201);
    const id = cree.body.compte.id;

    await chefB.post(`/equipe/membres/${id}/reinitialiser`).expect(403);
    await chefB.patch(`/equipe/membres/${id}`).send({ actif: false }).expect(403);
    expect((await chefB.get("/equipe").expect(200)).body.membres).toEqual([]);

    const nouveau = await chefA.post(`/equipe/membres/${id}/reinitialiser`).expect(200);
    expect(nouveau.body.motDePasse).not.toBe(cree.body.motDePasse);
    await chefA.patch(`/equipe/membres/${id}`).send({ actif: false }).expect(200);
    expect(await db.utilisateur.findUniqueOrThrow({ where: { id } })).toMatchObject({ actif: false });
    // Le chef d'équipe n'a pas accès à l'administration.
    await chefA.get("/administration/comptes").expect(403);
  });

  it("l'administration crée un recenseur par téléphone et le rattache à un chef d'équipe", async () => {
    const { agent: admin } = await connecter(app, db, "ADMIN");
    const { utilisateur: chef } = await connecter(app, db, "CHEF_EQUIPE");
    const tel = telephone();
    await admin.post("/administration/comptes").send({ nom: "Sans téléphone", role: "RECENSEUR" }).expect(400);
    const r = await admin.post("/administration/comptes").send({ nom: "Bamba Issa", telephone: tel, role: "RECENSEUR", chefId: chef.id }).expect(201);
    expect(await db.utilisateur.findUniqueOrThrow({ where: { id: r.body.compte.id } })).toMatchObject({ role: "RECENSEUR", chefId: chef.id, email: `225${tel}@terrain.apsig.ci` });
    const comptes = await admin.get("/administration/comptes").expect(200);
    expect(comptes.body.find((c: { id: string }) => c.id === r.body.compte.id)).toMatchObject({ chef: { id: chef.id }, identifiant: expect.stringMatching(/^07 /) });
  });
});
