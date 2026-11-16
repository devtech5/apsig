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

type Tableau = {
  indicateurs: Record<string, number>;
  parMois: { mois: string; abonnementsFcfa: number; acomptesFcfa: number }[];
  aSurveiller: { acomptesAnciens: number; expirentBientot: number; posesEnRetard: number; elements: { nature: string; foyerId: string }[] };
  derniersEncaissements: { foyer: { id: string }; montantFcfa: number; nature: string }[];
  terrain: { id: string; nom: string; recensesMois: number; posesMois: number }[];
};

const JOUR = 86_400_000;
const tel = (prefixe: string) => `+225 ${prefixe} ${Date.now().toString().slice(-8)}`;
const client = (telephone: string) => ({
  cible: "FAMILLE",
  prenom: "Akissi",
  nom: "Yao",
  telephone,
  telephone2: "",
  quartierId,
  adresse: "Villa 4, portail vert, face à la pharmacie",
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

describe("Tableau de bord du QG", () => {
  it("indicateurs du mois, encaissements par nature, points à surveiller et équipe terrain", async () => {
    const { agent: admin } = await connecter(app, db, "ADMIN");
    const avant = (await admin.get("/finance/tableau-de-bord").expect(200)).body as Tableau;
    expect(avant.parMois).toHaveLength(6);

    // Un client soldé (abonnement ouvert) et un client avec acompte, recensés par le même chef d'équipe.
    const { agent: chef, utilisateur: chefU } = await connecter(app, db, "CHEF_EQUIPE");
    const solde = await chef.post("/pose/recensements").send({ ...client(tel("07")), paiement: { operateur: "ESPECES" } }).expect(201);
    const acompte = await chef.post("/pose/recensements").send({ ...client(tel("05")), paiement: { operateur: "ESPECES", montantFcfa: 4_000 } }).expect(201);
    // Recensé il y a 40 jours sans rien régler : acompte ancien et pose en retard.
    const ancien = await chef.post("/pose/recensements").send({ ...client(tel("01")), paiement: null }).expect(201);
    const ilYa40j = new Date(Date.now() - 40 * JOUR);
    await db.foyer.update({ where: { id: ancien.body.id }, data: { creeLe: ilYa40j } });
    await db.support.updateMany({ where: { foyerId: ancien.body.id }, data: { creeLe: ilYa40j } });

    const apres = (await admin.get("/finance/tableau-de-bord").expect(200)).body as Tableau;
    const delta = (cle: string) => apres.indicateurs[cle]! - avant.indicateurs[cle]!;
    expect(delta("encaisseMoisFcfa")).toBe(14_000);
    expect(delta("encaisseJourFcfa")).toBe(14_000);
    expect(delta("abonnesActifs")).toBe(1);
    expect(delta("nouveauxAbonnesMois")).toBe(1);
    expect(delta("clientsNonSoldes")).toBe(2);
    expect(delta("resteAEncaisserFcfa")).toBe(6_000 + 10_000);
    expect(delta("recensesMois")).toBe(2);
    expect(delta("aPoser")).toBe(3);
    expect(delta("aPoserDepuis7j")).toBe(1);

    const mois = (t: Tableau) => t.parMois[5]!;
    expect(mois(apres).abonnementsFcfa - mois(avant).abonnementsFcfa).toBe(10_000);
    expect(mois(apres).acomptesFcfa - mois(avant).acomptesFcfa).toBe(4_000);

    expect(apres.aSurveiller.acomptesAnciens - avant.aSurveiller.acomptesAnciens).toBe(1);
    expect(apres.aSurveiller.posesEnRetard - avant.aSurveiller.posesEnRetard).toBe(1);
    // Liste courte (8 au plus) où chaque nature a sa part : soldes anciens et poses en retard y figurent.
    const natures = apres.aSurveiller.elements.map((e) => e.nature);
    expect(natures.length).toBeLessThanOrEqual(8);
    expect(natures).toEqual(expect.arrayContaining(["solde", "pose"]));

    const recents = apres.derniersEncaissements.slice(0, 2);
    expect(recents.map((e) => e.foyer.id).sort()).toEqual([solde.body.id, acompte.body.id].sort());
    expect(recents.find((e) => e.foyer.id === acompte.body.id)).toMatchObject({ montantFcfa: 4_000, nature: "acompte" });

    // Les plus actifs du mois d'abord (6 au plus) ; la base de test garde les comptes des exécutions précédentes,
    // le chef n'apparaît donc que s'il fait partie des plus actifs.
    const totaux = apres.terrain.map((m) => m.recensesMois + m.posesMois);
    expect(apres.terrain.length).toBeLessThanOrEqual(6);
    expect(totaux).toEqual([...totaux].sort((a, b) => b - a));
    const debutMois = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    for (const m of apres.terrain) {
      expect(m.recensesMois).toBe(await db.foyer.count({ where: { recenseParId: m.id, creeLe: { gte: debutMois } } }));
    }
    const duChef = apres.terrain.find((m) => m.id === chefU.id);
    if (duChef) expect(duChef).toMatchObject({ recensesMois: 2, posesMois: 0 });
    else expect(Math.min(...totaux)).toBeGreaterThanOrEqual(2);
  });

  it("réservé au QG : refusé au conseiller et sans session", async () => {
    await request(app.getHttpServer()).get("/finance/tableau-de-bord").expect(401);
    const { agent } = await connecter(app, db, "CONSEILLER");
    await agent.get("/finance/tableau-de-bord").expect(403);
  });
});
