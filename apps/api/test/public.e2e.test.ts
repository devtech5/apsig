import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { genererJeton, type TypeSupport } from "@apsig/domain";
import { AppModule } from "../src/app.module.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";

let app: INestApplication;
let db: PrismaService;
let api: ReturnType<typeof request>;
let quartierId: string;
const ADRESSE = { lat: 6.8905, lng: -6.4425 };
const JOUR = 86_400_000;

async function creerFoyer(opts: { abonnement?: "actif" | "expire" | "aucun"; intervention?: boolean } = {}) {
  const formule = await db.formule.upsert({
    where: { code: opts.intervention ? "TEST_SECU" : "TEST_FAMILLE" },
    update: {},
    create: { code: opts.intervention ? "TEST_SECU" : "TEST_FAMILLE", nom: "Formule de test", prixFcfa: 1000, intervention: !!opts.intervention },
  });
  const now = Date.now();
  const abonnement = opts.abonnement ?? "actif";
  const foyer = await db.foyer.create({
    data: {
      libelle: "Foyer de test",
      quartierId,
      ...ADRESSE,
      adresseVerifiee: true,
      cleClient: genererJeton(24),
      membres: { create: [{ role: "TITULAIRE", prenom: "Awa", nom: "Testeur", telephone: "+225 07 99 99 99 01" }] },
      contacts: { create: [{ nom: "Proche Testeur", relation: "Sœur", telephone: "+225 07 99 99 99 02" }] },
      ...(abonnement !== "aucun" && {
        abonnements: {
          create: {
            formuleId: formule.id,
            statut: abonnement === "actif" ? "ACTIF" : "EXPIRE",
            debut: new Date(now - 90 * JOUR),
            fin: new Date(abonnement === "actif" ? now + 30 * JOUR : now - JOUR),
          },
        },
      }),
    },
  });
  const jetons = {} as Record<TypeSupport, string>;
  for (const type of ["PORTAIL", "INTERIEUR", "BRACELET"] as const) {
    const s = await db.support.create({
      data: { type, code: `TST-${genererJeton(8)}`, jeton: genererJeton(), codeCourt: genererJeton(8), statut: "ACTIF", foyerId: foyer.id },
    });
    jetons[type] = s.jeton;
  }
  return { foyer, jetons };
}

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  await app.init();
  db = app.get(PrismaService);
  api = request(app.getHttpServer());

  const ville = await db.ville.upsert({ where: { code: "TST" }, update: {}, create: { code: "TST", nom: "Ville de test" } });
  const quartier = await db.quartier.upsert({
    where: { villeId_code: { villeId: ville.id, code: "CENTRE" } },
    update: {},
    create: { code: "CENTRE", nom: "Centre", villeId: ville.id, ...ADRESSE },
  });
  quartierId = quartier.id;
  if ((await db.partenaire.count({ where: { type: "POLICE" } })) === 0) {
    await db.partenaire.createMany({
      data: [
        { type: "POLICE", nom: "Police test", telephone: "111" },
        { type: "GSPM", nom: "GSPM test", telephone: "180" },
        { type: "SAMU", nom: "SAMU test", telephone: "185" },
      ],
    });
  }
});

afterAll(async () => {
  await app?.close();
});

describe("Santé", () => {
  it("répond et joint la base", async () => {
    const r = await api.get("/sante").expect(200);
    expect(r.body).toMatchObject({ statut: "ok", base: "ok" });
  });
});

describe("Scan d'un support", () => {
  it("QR portail : menu extérieur et quartier, sans aucun nom de personne", async () => {
    const { jetons } = await creerFoyer();
    const r = await api.get(`/public/supports/${jetons.PORTAIL}`).expect(200);
    expect(r.body.urgences.map((u: { type: string }) => u.type)).toEqual(["AGRESSION", "INCENDIE", "MEDICAL", "AUTRE"]);
    expect(r.body.lieu).toMatchObject({ quartier: "Centre", adresseVerifiee: true });
    expect(JSON.stringify(r.body)).not.toContain("Testeur");
  });

  it("bracelet : « enfant égaré » en premier, pas de lieu affiché", async () => {
    const { jetons } = await creerFoyer();
    const r = await api.get(`/public/supports/${jetons.BRACELET}`).expect(200);
    expect(r.body.urgences[0].type).toBe("EGARE");
    expect(r.body.lieu).toBeNull();
  });

  it("QR inconnu : 404 ; QR remplacé : 410", async () => {
    await api.get("/public/supports/inexistant123").expect(404);
    const { jetons } = await creerFoyer();
    const s = await db.support.findUniqueOrThrow({ where: { jeton: jetons.PORTAIL } });
    const nouveau = genererJeton();
    await db.$transaction([
      db.support.update({ where: { id: s.id }, data: { jeton: nouveau } }),
      db.jetonRevoque.create({ data: { jeton: jetons.PORTAIL, supportId: s.id } }),
    ]);
    const r = await api.get(`/public/supports/${jetons.PORTAIL}`).expect(410);
    expect(r.body.message).toContain("appelez directement les secours");
  });
});

describe("Déclenchement d'une alerte", () => {
  it("crée l'alerte, calcule la fiabilité et met en file les messages", async () => {
    const { jetons } = await creerFoyer();
    const r = await api
      .post("/public/alertes")
      .send({ jeton: jetons.PORTAIL, type: "AGRESSION", appareilId: `appareil-${genererJeton(10)}`, position: { ...ADRESSE, precisionM: 12 } })
      .expect(201);
    expect(r.body).toMatchObject({ type: "AGRESSION", statut: "NOUVELLE", doublon: false, positionPartagee: true, peutAnnuler: true });
    expect(r.body.numero).toMatch(/^ALR-\d{6}$/);
    expect(r.body.cleTemoin).toHaveLength(24);

    const a = await db.alerte.findUniqueOrThrow({ where: { numero: r.body.numero }, include: { messages: true, evenements: true } });
    expect(a.scoreFiabilite).toBe(85);
    expect(a.priorite).toBe("CRITIQUE");
    expect(a.messages.map((m) => m.nomDestinataire)).toEqual(
      expect.arrayContaining(["Police test", "Titulaire — Awa Testeur", "Sœur — Proche Testeur"]),
    );
    expect(a.messages.every((m) => m.statut === "EN_FILE")).toBe(true);
    expect(a.evenements.map((e) => e.texte).join(" | ")).toContain("Adresse identifiée");
  });

  it("regroupe un second déclenchement de la même urgence", async () => {
    const { jetons } = await creerFoyer();
    const premier = await api.post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "INCENDIE" }).expect(201);
    const second = await api.post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "INCENDIE" }).expect(201);
    expect(second.body).toMatchObject({ numero: premier.body.numero, doublon: true });
    const a = await db.alerte.findUniqueOrThrow({ where: { numero: premier.body.numero } });
    expect(a.redeclenchements).toBe(1);
  });

  it("même appareil sur plusieurs supports en 24 h : fiabilité réduite, alerte acceptée", async () => {
    const appareilId = `appareil-${genererJeton(10)}`;
    const premier = await creerFoyer();
    const second = await creerFoyer();
    const position = { ...ADRESSE, precisionM: 12 };
    await api.post("/public/alertes").send({ jeton: premier.jetons.PORTAIL, type: "INCENDIE", appareilId, position }).expect(201);
    const r = await api.post("/public/alertes").send({ jeton: second.jetons.PORTAIL, type: "INCENDIE", appareilId, position }).expect(201);
    const a = await db.alerte.findUniqueOrThrow({ where: { numero: r.body.numero } });
    expect(a.scoreFiabilite).toBe(80);
  });

  it("abonnement expiré : l'alerte est quand même traitée", async () => {
    const { jetons } = await creerFoyer({ abonnement: "expire" });
    const r = await api.post("/public/alertes").send({ jeton: jetons.INTERIEUR, type: "MEDICAL" }).expect(201);
    const a = await db.alerte.findUniqueOrThrow({ where: { numero: r.body.numero } });
    expect(a.abonnementExpire).toBe(true);
    expect(a.scoreFiabilite).toBe(70); // bonus QR intérieur
  });

  it("formule Sécurité + : l'intervention APSIG est signalée sur agression", async () => {
    const { jetons } = await creerFoyer({ intervention: true });
    const r = await api.post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "AGRESSION" }).expect(201);
    const a = await db.alerte.findUniqueOrThrow({ where: { numero: r.body.numero }, include: { evenements: true } });
    expect(a.intervention).toBe(true);
    expect(a.evenements.some((e) => e.texte.includes("équipe d'intervention APSIG"))).toBe(true);
  });

  it("refuse un type d'urgence inconnu", async () => {
    const { jetons } = await creerFoyer();
    const r = await api.post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "INONDATION" }).expect(400);
    expect(r.body.erreurs[0].champ).toBe("type");
  });
});

describe("Suivi par le témoin", () => {
  it("support mobile : la position partagée devient la position d'intervention", async () => {
    const { jetons } = await creerFoyer();
    const r = await api.post("/public/alertes").send({ jeton: jetons.BRACELET, type: "EGARE" }).expect(201);
    const { numero, cleTemoin } = r.body;
    expect((await db.alerte.findUniqueOrThrow({ where: { numero } })).lat).toBeNull();

    const marche = { lat: 6.8801, lng: -6.4489, precisionM: 20 };
    const p = await api.post(`/public/alertes/${numero}/position`).send({ cle: cleTemoin, position: marche }).expect(200);
    expect(p.body.positionPartagee).toBe(true);
    const a = await db.alerte.findUniqueOrThrow({ where: { numero } });
    expect(a).toMatchObject({ lat: marche.lat, lng: marche.lng, scoreFiabilite: 75 });
  });

  it("consultation et annulation protégées par la clé du témoin", async () => {
    const { jetons } = await creerFoyer();
    const r = await api.post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "AUTRE" }).expect(201);
    const { numero, cleTemoin } = r.body;

    await api.get(`/public/alertes/${numero}`).query({ cle: "mauvaise-cle" }).expect(403);
    const vue = await api.get(`/public/alertes/${numero}`).query({ cle: cleTemoin }).expect(200);
    expect(vue.body).not.toHaveProperty("cleTemoin");

    await api.post(`/public/alertes/${numero}/annuler`).send({ cle: "mauvaise-cle" }).expect(403);
    const annulee = await api.post(`/public/alertes/${numero}/annuler`).send({ cle: cleTemoin }).expect(200);
    expect(annulee.body).toMatchObject({ statut: "ANNULEE", peutAnnuler: false });
    await api.post(`/public/alertes/${numero}/annuler`).send({ cle: cleTemoin }).expect(409);
  });
});
