import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { genererJeton } from "@apsig/domain";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { connecter, creerFoyer, preparerReferentiel, viderFile } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;
let quartierId: string;

const api = () => request(app.getHttpServer());
const PORTE = { lat: 5.3601, lng: -3.9712 };

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

describe("Pose des supports", () => {
  it("le GPS relevé devant le QR devient l'adresse vérifiée du foyer", async () => {
    const { foyer, jetons } = await creerFoyer(db, quartierId);
    await db.foyer.update({ where: { id: foyer.id }, data: { adresseVerifiee: false } });
    const { agent, utilisateur } = await connecter(app, db, "AGENT");

    const tournee = await agent.get("/pose/a-poser").expect(200);
    expect(tournee.body.some((s: { foyer: { libelle: string } | null }) => s.foyer?.libelle === foyer.libelle)).toBe(true);

    const avant = await agent.get(`/pose/supports/${jetons.PORTAIL}`).expect(200);
    expect(avant.body).toMatchObject({ fixe: true, pose: null, foyer: { adresseVerifiee: false } });

    await agent.post(`/pose/supports/${jetons.PORTAIL}`).send({ position: { ...PORTE, precisionM: 120 } }).expect(422);
    const pose = await agent.post(`/pose/supports/${jetons.PORTAIL}`).send({ position: { ...PORTE, precisionM: 8 } }).expect(201);
    expect(pose.body).toMatchObject({ pose: { agent: utilisateur.nom, precisionM: 8 }, foyer: { adresseVerifiee: true, position: PORTE } });
    expect(await db.foyer.findUniqueOrThrow({ where: { id: foyer.id } })).toMatchObject({ ...PORTE, adresseVerifiee: true });
    expect(await db.audit.count({ where: { action: "support.poser", cible: foyer.id } })).toBe(1);

    // Un bracelet se remet à son porteur : la position ne touche pas l'adresse du foyer.
    await agent.post(`/pose/supports/${jetons.BRACELET}`).send({ position: { lat: 5.1, lng: -4.1, precisionM: 900 } }).expect(201);
    expect(await db.foyer.findUniqueOrThrow({ where: { id: foyer.id } })).toMatchObject(PORTE);
  });

  it("refuse un QR inconnu ou remplacé, et les comptes hors pose", async () => {
    const { agent } = await connecter(app, db, "AGENT");
    await agent.get(`/pose/supports/${genererJeton()}`).expect(404);
    const op = await connecter(app, db, "OPERATEUR");
    await op.agent.get("/pose/a-poser").expect(403);
  });
});

describe("Missions des unités terrain", () => {
  // Alerte en file commune (aucun opérateur en service), prise en charge par un opérateur.
  async function preparer() {
    await viderFile(db);
    const unite = await db.unite.create({ data: { nom: `Patrouille ${genererJeton(4)}`, type: "PATROUILLE", statut: "HORS_SERVICE" } });
    const intervenant = await connecter(app, db, "INTERVENANT");
    await db.utilisateur.update({ where: { id: intervenant.utilisateur.id }, data: { uniteId: unite.id } });
    const operateur = await connecter(app, db, "OPERATEUR");
    const { jetons } = await creerFoyer(db, quartierId);
    const { body } = await api().post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "AGRESSION" }).expect(201);
    await operateur.agent.post(`/centrale/alertes/${body.numero}/prendre`).expect(200);
    return { unite, intervenant, operateur, numero: body.numero as string };
  }

  it("l'opérateur engage une unité en service ; elle suit la mission jusqu'au bout", async () => {
    const { unite, intervenant, operateur, numero } = await preparer();

    // Hors service : la centrale ne peut pas l'engager.
    await operateur.agent.post(`/centrale/alertes/${numero}/unite`).send({ uniteId: unite.id }).expect(409);
    const service = await intervenant.agent.post("/terrain/disponibilite").send({ statut: "DISPONIBLE" }).expect(200);
    expect(service.body).toMatchObject({ unite: { id: unite.id, statut: "DISPONIBLE" }, missions: [] });

    const engagee = await operateur.agent.post(`/centrale/alertes/${numero}/unite`).send({ uniteId: unite.id }).expect(200);
    expect(engagee.body.unite).toMatchObject({ id: unite.id, statut: "EN_MISSION", termineeLe: null });

    const espace = await intervenant.agent.get("/terrain").expect(200);
    expect(espace.body.missions.map((m: { numero: string }) => m.numero)).toEqual([numero]);
    // L'unité a l'adresse et l'itinéraire, jamais les données de santé.
    const mission = await intervenant.agent.get(`/terrain/missions/${numero}`).expect(200);
    expect(mission.body.position).toBeTruthy();
    expect(JSON.stringify(mission.body)).not.toContain("Diabétique");

    await intervenant.agent.post("/terrain/disponibilite").send({ statut: "HORS_SERVICE" }).expect(409);
    await intervenant.agent.post("/terrain/position").send({ lat: 5.35, lng: -3.98, precisionM: 12 }).expect(204);

    const enRoute = await intervenant.agent.post(`/terrain/missions/${numero}/etape`).send({ etape: "EN_ROUTE" }).expect(200);
    expect(enRoute.body.statut).toBe("EN_ROUTE");
    const surPlace = await intervenant.agent.post(`/terrain/missions/${numero}/etape`).send({ etape: "SUR_PLACE" }).expect(200);
    expect(surPlace.body.statut).toBe("SUR_PLACE");
    const fin = await intervenant.agent.post(`/terrain/missions/${numero}/etape`).send({ etape: "TERMINEE" }).expect(200);
    expect(fin.body.termineeLe).toBeTruthy();
    await intervenant.agent.post(`/terrain/missions/${numero}/etape`).send({ etape: "SUR_PLACE" }).expect(409);

    const fiche = await operateur.agent.get(`/centrale/alertes/${numero}`).expect(200);
    expect(fiche.body.unite).toMatchObject({ statut: "DISPONIBLE", position: { lat: 5.35, lng: -3.98 } });
    expect(fiche.body.unite.termineeLe).toBeTruthy();
    expect(fiche.body.journal.filter((j: { nature: string }) => j.nature === "unite")).toHaveLength(3);
    expect((await intervenant.agent.get("/terrain").expect(200)).body.missions).toEqual([]);
  });

  it("une unité ne voit que ses missions ; sans unité, l'intervenant est prévenu", async () => {
    const { unite, intervenant, operateur, numero } = await preparer();
    await db.unite.update({ where: { id: unite.id }, data: { statut: "DISPONIBLE" } });
    await operateur.agent.post(`/centrale/alertes/${numero}/unite`).send({ uniteId: unite.id }).expect(200);

    const autre = await connecter(app, db, "INTERVENANT");
    expect((await autre.agent.get("/terrain").expect(200)).body).toEqual({ unite: null, missions: [] });
    await autre.agent.get(`/terrain/missions/${numero}`).expect(403);
    await autre.agent.post("/terrain/position").send({ lat: 5.3, lng: -4, precisionM: 10 }).expect(403);

    // Retirée par la centrale : la mission disparaît, l'unité redevient disponible.
    await operateur.agent.post(`/centrale/alertes/${numero}/unite`).send({ uniteId: null }).expect(200);
    expect(await db.unite.findUniqueOrThrow({ where: { id: unite.id } })).toMatchObject({ statut: "DISPONIBLE" });
    await intervenant.agent.get(`/terrain/missions/${numero}`).expect(403);
  });

  it("l'administrateur crée l'unité et y rattache l'intervenant", async () => {
    const admin = await connecter(app, db, "ADMIN");
    const nom = `Ambulance ${genererJeton(4)}`;
    const unites = await admin.agent.post("/administration/unites").send({ nom, type: "AMBULANCE" }).expect(201);
    const creee = unites.body.find((u: { nom: string }) => u.nom === nom);
    expect(creee).toMatchObject({ statut: "HORS_SERVICE", libelleType: expect.any(String), agents: [] });

    const intervenant = await connecter(app, db, "INTERVENANT");
    const comptes = await admin.agent.patch(`/administration/comptes/${intervenant.utilisateur.id}`).send({ uniteId: creee.id }).expect(200);
    expect(comptes.body.find((c: { id: string }) => c.id === intervenant.utilisateur.id).unite).toEqual({ id: creee.id, nom });
    expect((await intervenant.agent.get("/terrain").expect(200)).body.unite).toMatchObject({ id: creee.id, nom });
    await admin.agent.patch(`/administration/comptes/${intervenant.utilisateur.id}`).send({ uniteId: "inconnue" }).expect(400);
  });
});
