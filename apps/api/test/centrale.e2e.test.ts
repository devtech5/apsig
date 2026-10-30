import "reflect-metadata";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { genererJeton } from "@apsig/domain";
import type { RoleUtilisateur } from "@apsig/db";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { DEUX_FACTEURS_REQUIS } from "../src/auth/auth.module.ts";
import { definirMotDePasse } from "../src/auth/comptes.ts";
import { config } from "../src/config.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { RepartitionService } from "../src/repartition/repartition.service.ts";
import { codeTotp, creerFoyer, preparerReferentiel, viderFile } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;
let repartition: RepartitionService;
let quartierId: string;

type Resume = { numero: string; statut: string; priorite: string; attribueeA: { id: string; nom: string } | null; accepteeLe: string | null };

const dans = (s: number) => new Date(Date.now() + s * 1000);

// Session ouverte comme le ferait le navigateur de la centrale (même origine).
async function connecter(role: RoleUtilisateur, opts: { actif?: boolean } = {}) {
  const email = `${role.toLowerCase()}-${genererJeton(6).toLowerCase()}@apsig.test`;
  const { utilisateur, motDePasse } = await definirMotDePasse(db, { email, nom: `${role} ${genererJeton(4)}`, role });
  if (opts.actif === false) await db.utilisateur.update({ where: { id: utilisateur.id }, data: { actif: false } });
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post("/api/auth/sign-in/email").set("Origin", config.centraleUrl).send({ email, password: motDePasse });
  return { agent, utilisateur, motDePasse, connexion: r };
}

const cookies = (r: request.Response) => ([] as string[]).concat(r.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");

async function attendre(condition: () => boolean, delaiMs = 5000) {
  const fin = Date.now() + delaiMs;
  while (!condition()) {
    if (Date.now() > fin) throw new Error("Délai dépassé");
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function enService(role: RoleUtilisateur = "OPERATEUR") {
  const op = await connecter(role);
  await op.agent.post("/centrale/presence").send({ presence: "EN_SERVICE" }).expect(200);
  return op;
}

async function declencher(type = "AGRESSION", opts: Parameters<typeof creerFoyer>[2] = {}) {
  const { jetons } = await creerFoyer(db, quartierId, opts);
  const r = await request(app.getHttpServer()).post("/public/alertes").send({ jeton: jetons.PORTAIL, type }).expect(201);
  return r.body as { numero: string; cleTemoin: string };
}

const alerte = (numero: string) =>
  db.alerte.findUniqueOrThrow({ where: { numero }, include: { attribueeA: true, evenements: { orderBy: { le: "asc" } }, messages: true } });

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configurerApp(module.createNestApplication<NestExpressApplication>());
  // À l'écoute d'un vrai port pour le flux d'événements (SSE).
  await app.listen(0);
  db = app.get(PrismaService);
  repartition = app.get(RepartitionService);
  quartierId = await preparerReferentiel(db);
});

// Chaque test part d'une file vide, sans opérateur en service et hors mode crise.
beforeEach(async () => {
  await viderFile(db);
  await repartition.tick();
});

afterAll(async () => {
  if (db) await viderFile(db);
  await app?.close();
});

describe("Accès au back-office", () => {
  it("refuse une requête sans session", async () => {
    await request(app.getHttpServer()).get("/centrale/alertes").expect(401);
  });

  it("refuse un mauvais mot de passe", async () => {
    const { utilisateur } = await connecter("OPERATEUR");
    await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("Origin", config.centraleUrl)
      .send({ email: utilisateur.email, password: "mauvais-mot-de-passe" })
      .expect(401);
  });

  it("n'ouvre pas d'inscription publique", async () => {
    const r = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .set("Origin", config.centraleUrl)
      .send({ email: "intrus@exemple.ci", password: "un-mot-de-passe-long", name: "Intrus" });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await db.utilisateur.findUnique({ where: { email: "intrus@exemple.ci" } })).toBeNull();
  });

  it("refuse la connexion d'un compte désactivé", async () => {
    const { connexion } = await connecter("OPERATEUR", { actif: false });
    expect(connexion.status).toBe(403);
  });

  it("refuse un agent de pose", async () => {
    const { agent, connexion } = await connecter("AGENT");
    expect(connexion.status).toBe(200);
    await agent.get("/compte").expect(403);
    await agent.get("/centrale/alertes").expect(403);
  });

  it("ouvre à chaque rôle ses espaces, et seulement eux", async () => {
    const op = await connecter("OPERATEUR");
    expect((await op.agent.get("/compte").expect(200)).body).toMatchObject({ id: op.utilisateur.id, role: "OPERATEUR", espaces: ["centrale"] });

    const conseiller = await connecter("CONSEILLER");
    expect((await conseiller.agent.get("/compte").expect(200)).body.espaces).toEqual(["abonnements"]);
    await conseiller.agent.get("/centrale/alertes").expect(403);

    const superadmin = await connecter("SUPERADMIN");
    expect((await superadmin.agent.get("/compte").expect(200)).body.espaces).toEqual(["centrale", "supervision", "abonnements", "administration"]);
  });
});

describe("Double authentification", () => {
  beforeAll(() => {
    config.deuxFacteursObligatoire = true;
  });
  afterAll(() => {
    config.deuxFacteursObligatoire = false;
  });

  it("s'active avec une application d'authentification, puis le code est demandé à chaque connexion", async () => {
    const { agent, utilisateur, motDePasse } = await connecter("OPERATEUR");
    expect((await agent.get("/compte").expect(200)).body).toMatchObject({ deuxFacteurs: false, deuxFacteursRequis: true });
    expect((await agent.get("/centrale/alertes").expect(403)).body.message).toBe(DEUX_FACTEURS_REQUIS);

    const activation = await agent.post("/api/auth/two-factor/enable").set("Origin", config.centraleUrl).send({ password: motDePasse }).expect(200);
    expect(activation.body.backupCodes).toHaveLength(8);
    const uri = new URL(activation.body.totpURI);
    expect(decodeURIComponent(uri.pathname)).toContain("APSIG Centrale");
    const secret = uri.searchParams.get("secret")!;
    const faux = await agent.post("/api/auth/two-factor/verify-totp").set("Origin", config.centraleUrl).send({ code: codeTotp(secret, Date.now() - 3_600_000) });
    expect(faux.status).toBeGreaterThanOrEqual(400);
    await agent.post("/api/auth/two-factor/verify-totp").set("Origin", config.centraleUrl).send({ code: codeTotp(secret) }).expect(200);
    await agent.get("/centrale/alertes").expect(200);

    // Nouvelle connexion : le mot de passe seul n'ouvre pas de session.
    const autre = request.agent(app.getHttpServer());
    const r = await autre.post("/api/auth/sign-in/email").set("Origin", config.centraleUrl).send({ email: utilisateur.email, password: motDePasse }).expect(200);
    expect(r.body.twoFactorRedirect).toBe(true);
    await autre.get("/compte").expect(401);
    await autre.post("/api/auth/two-factor/verify-totp").set("Origin", config.centraleUrl).send({ code: codeTotp(secret) }).expect(200);
    expect((await autre.get("/compte").expect(200)).body).toMatchObject({ deuxFacteurs: true, deuxFacteursRequis: false });
  });

  it("un nouveau mot de passe remet la double authentification à zéro (téléphone perdu)", async () => {
    const { agent, utilisateur, motDePasse } = await connecter("SUPERVISEUR");
    const activation = await agent.post("/api/auth/two-factor/enable").set("Origin", config.centraleUrl).send({ password: motDePasse }).expect(200);
    const secret = new URL(activation.body.totpURI).searchParams.get("secret")!;
    await agent.post("/api/auth/two-factor/verify-totp").set("Origin", config.centraleUrl).send({ code: codeTotp(secret) }).expect(200);

    await definirMotDePasse(db, { email: utilisateur.email });
    const apres = await db.utilisateur.findUniqueOrThrow({ where: { id: utilisateur.id }, include: { secondsFacteurs: true } });
    expect(apres).toMatchObject({ deuxFacteurs: false, secondsFacteurs: [] });
  });
});

describe("Temps réel", () => {
  it("pousse un événement dès qu'une alerte arrive", async () => {
    const { connexion } = await connecter("OPERATEUR");
    const { port } = app.getHttpServer().address() as AddressInfo;
    let recu = "";
    const flux = http.get({ port, path: "/centrale/flux", headers: { cookie: cookies(connexion) } }, (res) => {
      expect(res.headers["content-type"]).toContain("text/event-stream");
      res.setEncoding("utf8");
      res.on("data", (morceau: string) => (recu += morceau));
    });
    flux.on("error", () => undefined); // fermeture volontaire en fin de test
    try {
      await attendre(() => recu.includes('"type":"battement"'));
      await declencher();
      await attendre(() => recu.includes('"type":"alertes"'));
    } finally {
      flux.destroy();
    }
  });
});

describe("Traitement d'une alerte", () => {
  it("sans opérateur en service, l'alerte attend en file commune, triée par urgence", async () => {
    const { agent } = await connecter("OPERATEUR");
    const medical = await declencher("MEDICAL");
    const agression = await declencher("AGRESSION");
    const r = await agent.get("/centrale/alertes").expect(200);
    expect(r.body.presence).toBe("HORS_SERVICE");
    expect(r.body.mesAlertes).toEqual([]);
    expect(r.body.aPrendre.alertes.map((a: Resume) => a.numero)).toEqual([agression.numero, medical.numero]);
    expect(r.body.aPrendre.alertes[0]).toMatchObject({ priorite: "CRITIQUE", lieu: "Centre, Ville de test", operateur: null, attribueeA: null });
    expect(r.body).not.toHaveProperty("equipe");
  });

  it("donne à l'opérateur la fiche complète, données de santé comprises", async () => {
    const { agent } = await connecter("OPERATEUR");
    const { numero } = await declencher("MEDICAL");
    const r = await agent.get(`/centrale/alertes/${numero}`).expect(200);
    expect(r.body.foyer.membres[0]).toMatchObject({ prenom: "Awa", infosMedicales: "Diabétique" });
    expect(r.body.foyer.contacts[0]).toMatchObject({ relation: "Sœur" });
    expect(r.body.fiabilite.raisons.length).toBeGreaterThan(0);
    expect(r.body).toMatchObject({ peutAgir: true, peutPrendre: true, statutsPossibles: ["PRISE_EN_CHARGE", "CLOTUREE", "ANNULEE"] });
    expect(r.body.messages.length).toBeGreaterThan(0);
  });

  it("suit le cycle prise en charge → sur place → clôture, journalisé et audité", async () => {
    const { agent, utilisateur } = await connecter("OPERATEUR");
    const { numero } = await declencher("AGRESSION");

    const pris = await agent.post(`/centrale/alertes/${numero}/prendre`).expect(200);
    expect(pris.body).toMatchObject({ statut: "PRISE_EN_CHARGE", operateur: utilisateur.nom, attribueeA: { id: utilisateur.id }, peutPrendre: false });
    expect(pris.body.priseEnChargeLe).toBeTruthy();
    expect(pris.body.journal.at(-1)).toMatchObject({ nature: "operateur", texte: "Prise en charge", auteur: utilisateur.nom });

    await agent.post(`/centrale/alertes/${numero}/statut`).send({ statut: "NOUVELLE" }).expect(409);
    const surPlace = await agent.post(`/centrale/alertes/${numero}/statut`).send({ statut: "SUR_PLACE" }).expect(200);
    expect(surPlace.body.surPlaceLe).toBeTruthy();

    await agent.post(`/centrale/alertes/${numero}/statut`).send({ statut: "CLOTUREE" }).expect(400);
    const close = await agent.post(`/centrale/alertes/${numero}/statut`).send({ statut: "CLOTUREE", issue: "Intrus parti, aucun blessé" }).expect(200);
    expect(close.body).toMatchObject({ statut: "CLOTUREE", issue: "Intrus parti, aucun blessé", statutsPossibles: [] });

    const file = await agent.get("/centrale/alertes").expect(200);
    expect(file.body.mesAlertes).toEqual([]);
    expect(file.body.recentes.some((a: Resume) => a.numero === numero)).toBe(true);
    const audit = await db.audit.findMany({ where: { cible: numero, action: "alerte.statut" } });
    expect(audit).toHaveLength(3);
    expect(audit.every((a) => a.auteurId === utilisateur.id)).toBe(true);
  });

  it("note le rappel du titulaire et recalcule la fiabilité", async () => {
    const { agent } = await connecter("OPERATEUR");
    const { numero } = await declencher("AGRESSION");
    const avant = await agent.get(`/centrale/alertes/${numero}`).expect(200);
    const apres = await agent.post(`/centrale/alertes/${numero}/rappel`).send({ rappel: "FAUSSE_ALERTE" }).expect(200);
    expect(apres.body.rappel).toBe("FAUSSE_ALERTE");
    expect(apres.body.scoreFiabilite).toBeLessThan(avant.body.scoreFiabilite);
    await agent.post(`/centrale/alertes/${numero}/rappel`).send({ rappel: "INCONNU" }).expect(400);
  });

  it("ajoute une note signée au journal", async () => {
    const { agent, utilisateur } = await connecter("SUPERVISEUR");
    const { numero } = await declencher("INCENDIE");
    const r = await agent.post(`/centrale/alertes/${numero}/notes`).send({ texte: "  Voisin joint, fumée visible  " }).expect(200);
    expect(r.body.journal.at(-1)).toMatchObject({ texte: "Voisin joint, fumée visible", auteur: utilisateur.nom });
    await agent.post(`/centrale/alertes/${numero}/notes`).send({ texte: "   " }).expect(400);
  });

  it("répond 404 pour une alerte inconnue", async () => {
    const { agent } = await connecter("OPERATEUR");
    await agent.get("/centrale/alertes/ALR-999999").expect(404);
  });
});

describe("Répartition entre opérateurs", () => {
  it("attribue chaque nouvelle alerte à l'opérateur en service le moins chargé", async () => {
    const a = await enService();
    const b = await enService();
    const premiere = await declencher();
    const seconde = await declencher();
    const attribues = [(await alerte(premiere.numero)).attribueeAId, (await alerte(seconde.numero)).attribueeAId];
    expect(attribues.sort()).toEqual([a.utilisateur.id, b.utilisateur.id].sort());

    const proprietaire = attribues[0] === a.utilisateur.id ? a : b;
    const file = await proprietaire.agent.get("/centrale/alertes").expect(200);
    expect(file.body.presence).toBe("EN_SERVICE");
    expect(file.body.mesAlertes).toHaveLength(1);
    expect(file.body.mesAlertes[0]).toMatchObject({ accepteeLe: null, attribueeA: { id: proprietaire.utilisateur.id } });
    expect(file.body.aPrendre.total).toBe(0);
  });

  it("un opérateur ne voit ni ne traite l'alerte d'un autre ; le superviseur, si", async () => {
    const a = await enService();
    const { numero } = await declencher();
    const b = await connecter("OPERATEUR");
    await b.agent.get(`/centrale/alertes/${numero}`).expect(403);
    await b.agent.post(`/centrale/alertes/${numero}/prendre`).expect(403);
    await b.agent.post(`/centrale/alertes/${numero}/statut`).send({ statut: "PRISE_EN_CHARGE" }).expect(403);

    const sup = await connecter("SUPERVISEUR");
    const vue = await sup.agent.get("/centrale/alertes").expect(200);
    expect(vue.body.autres.map((x: Resume) => x.numero)).toContain(numero);
    expect(vue.body.equipe.find((m: { id: string }) => m.id === a.utilisateur.id)).toMatchObject({ presence: "EN_SERVICE", enLigne: true, charge: 1 });
    await sup.agent.get(`/centrale/alertes/${numero}`).expect(200);
  });

  it("réattribue d'elle-même une alerte non acceptée en 30 s", async () => {
    const a = await enService();
    const { numero } = await declencher();
    const b = await enService();
    expect((await alerte(numero)).attribueeAId).toBe(a.utilisateur.id);

    await repartition.tick(dans(20));
    expect((await alerte(numero)).attribueeAId).toBe(a.utilisateur.id);
    await repartition.tick(dans(31));
    const apres = await alerte(numero);
    expect(apres.attribueeAId).toBe(b.utilisateur.id);
    expect(apres.evenements.map((e) => e.texte)).toContain(`Non acceptée en 30 s par ${a.utilisateur.nom}`);
  });

  it("sans autre opérateur, garde l'alerte et la signale une seule fois au superviseur", async () => {
    const a = await enService();
    const { numero } = await declencher();
    await repartition.tick(dans(31));
    await repartition.tick(dans(40));
    const apres = await alerte(numero);
    expect(apres.attribueeAId).toBe(a.utilisateur.id);
    expect(apres.relanceLe).toBeTruthy();
    expect(apres.evenements.filter((e) => e.texte.includes("signalée au superviseur"))).toHaveLength(1);
  });

  it("une alerte acceptée reste à son opérateur", async () => {
    const a = await enService();
    const { numero } = await declencher();
    await enService();
    await a.agent.post(`/centrale/alertes/${numero}/prendre`).expect(200);
    await repartition.tick(dans(31));
    expect((await alerte(numero)).attribueeAId).toBe(a.utilisateur.id);
  });

  it("la pause rend les alertes non acceptées ; sans signe de vie, l'opérateur passe hors service", async () => {
    const a = await enService();
    const enPause = await declencher();
    const b = await enService();
    await a.agent.post("/centrale/presence").send({ presence: "PAUSE" }).expect(200);
    expect((await alerte(enPause.numero)).attribueeAId).toBe(b.utilisateur.id);

    const c = await enService();
    const silencieux = await declencher();
    const proprietaire = (await alerte(silencieux.numero)).attribueeAId;
    const autre = proprietaire === b.utilisateur.id ? c : b;
    await db.utilisateur.update({ where: { id: proprietaire! }, data: { vuLe: new Date(Date.now() - 2 * 60_000) } });
    await repartition.tick();
    expect((await db.utilisateur.findUniqueOrThrow({ where: { id: proprietaire! } })).presence).toBe("HORS_SERVICE");
    expect((await alerte(silencieux.numero)).attribueeAId).toBe(autre.utilisateur.id);
  });

  it("distribue la file commune dès qu'un opérateur prend son service", async () => {
    const alertes = [await declencher("MEDICAL"), await declencher("AGRESSION")];
    const a = await enService();
    await repartition.tick();
    for (const { numero } of alertes) expect((await alerte(numero)).attribueeAId).toBe(a.utilisateur.id);
  });

  it("n'attribue pas plus de 3 alertes à la fois à un opérateur", async () => {
    const a = await enService();
    const alertes = [];
    for (let i = 0; i < 4; i++) alertes.push(await declencher("MEDICAL"));
    const attribuees = await Promise.all(alertes.map(({ numero }) => alerte(numero)));
    expect(attribuees.filter((x) => x.attribueeAId === a.utilisateur.id)).toHaveLength(3);
    expect(attribuees[3]).toMatchObject({ attribueeAId: null });
    expect(attribuees[3]?.evenements.map((e) => e.texte)).toContain("Aucun opérateur disponible : alerte en file commune");
  });

  it("le superviseur réattribue ; un opérateur ne le peut pas", async () => {
    const a = await enService();
    const { numero } = await declencher();
    const b = await enService();
    await a.agent.post(`/centrale/alertes/${numero}/reattribuer`).send({ operateurId: b.utilisateur.id }).expect(403);

    const sup = await connecter("SUPERVISEUR");
    const r = await sup.agent.post(`/centrale/alertes/${numero}/reattribuer`).send({ operateurId: b.utilisateur.id }).expect(200);
    expect(r.body).toMatchObject({ attribueeA: { id: b.utilisateur.id }, accepteeLe: null });
    expect(await db.audit.count({ where: { cible: numero, action: "alerte.reattribution" } })).toBe(1);
  });
});

describe("Mode crise", () => {
  it("au-delà de 3 alertes en attente par opérateur : file commune et « prendre la suivante »", async () => {
    const a = await enService();
    for (let i = 0; i < 4; i++) await declencher("MEDICAL");
    await repartition.tick();
    expect(repartition.etatCrise.actif).toBe(true);
    expect(await db.audit.count({ where: { action: "repartition.crise", le: { gte: dans(-60) } } })).toBeGreaterThan(0);

    const critique = await declencher("AGRESSION");
    expect((await alerte(critique.numero)).attribueeAId).toBeNull();
    const file = await a.agent.get("/centrale/alertes").expect(200);
    expect(file.body.crise).toMatchObject({ actif: true, operateursEnService: 1 });

    // La plus urgente d'abord, même arrivée en dernier.
    const suivante = await a.agent.post("/centrale/alertes/suivante").expect(200);
    expect(suivante.body).toMatchObject({ numero: critique.numero, statut: "PRISE_EN_CHARGE", attribueeA: { id: a.utilisateur.id } });

    await viderFile(db);
    await repartition.tick();
    expect(repartition.etatCrise.actif).toBe(false);
  });
});

describe("Regroupement par incident", () => {
  const position = { lat: 6.95, lng: -6.3 };
  const voisin = { lat: 6.951, lng: -6.3 }; // ≈ 110 m

  it("rattache le second témoin d'un même incendie : un seul opérateur, secours prévenus une fois", async () => {
    await enService();
    await enService();
    const premier = await declencher("INCENDIE", { position });
    const second = await declencher("INCENDIE", { position: voisin });
    const p = await alerte(premier.numero);
    const s = await alerte(second.numero);
    expect(s.principaleId).toBe(p.id);
    expect(p.attribueeAId).toBeTruthy();
    expect(s.attribueeAId).toBeNull();
    expect(p.messages.some((m) => m.nomDestinataire === "GSPM test")).toBe(true);
    expect(s.messages.some((m) => m.nomDestinataire === "GSPM test")).toBe(false);
    expect(s.messages.some((m) => m.nomDestinataire?.startsWith("Sœur"))).toBe(true);

    const sup = await connecter("SUPERVISEUR");
    const fiche = await sup.agent.get(`/centrale/alertes/${premier.numero}`).expect(200);
    expect(fiche.body.temoinsRattaches.map((t: { numero: string }) => t.numero)).toEqual([second.numero]);
    const rattachee = await sup.agent.get(`/centrale/alertes/${second.numero}`).expect(200);
    expect(rattachee.body).toMatchObject({ principale: { numero: premier.numero }, statutsPossibles: [], peutPrendre: false });
    await sup.agent.post(`/centrale/alertes/${second.numero}/statut`).send({ statut: "PRISE_EN_CHARGE" }).expect(409);

    // Le témoin rattaché suit l'avancement de l'incident.
    await sup.agent.post(`/centrale/alertes/${premier.numero}/statut`).send({ statut: "PRISE_EN_CHARGE" }).expect(200);
    const vue = await request(app.getHttpServer()).get(`/public/alertes/${second.numero}`).query({ cle: second.cleTemoin }).expect(200);
    expect(vue.body.statut).toBe("PRISE_EN_CHARGE");

    // Clore l'incident clôt ses témoins.
    await sup.agent.post(`/centrale/alertes/${premier.numero}/statut`).send({ statut: "CLOTUREE", issue: "Feu maîtrisé par le GSPM" }).expect(200);
    expect(await alerte(second.numero)).toMatchObject({ statut: "CLOTUREE", issue: `Incident ${premier.numero} : Feu maîtrisé par le GSPM` });
  });

  it("ne regroupe ni une urgence médicale voisine, ni un incendie lointain", async () => {
    await declencher("MEDICAL", { position });
    const medical = await declencher("MEDICAL", { position: voisin });
    await declencher("INCENDIE", { position });
    const loin = await declencher("INCENDIE", { position: { lat: 6.96, lng: -6.3 } });
    expect((await alerte(medical.numero)).principaleId).toBeNull();
    expect((await alerte(loin.numero)).principaleId).toBeNull();
  });

  it("détache un témoin rattaché à tort, qui repart en répartition", async () => {
    await declencher("AGRESSION", { position });
    const second = await declencher("AGRESSION", { position: voisin });
    const b = await enService();
    const sup = await connecter("SUPERVISEUR");
    const r = await sup.agent.post(`/centrale/alertes/${second.numero}/detacher`).expect(200);
    expect(r.body).toMatchObject({ principale: null, attribueeA: { id: b.utilisateur.id } });
  });

  it("si le premier témoin annule, le suivant devient l'alerte principale", async () => {
    const premier = await declencher("INCENDIE", { position });
    const second = await declencher("INCENDIE", { position: voisin });
    await request(app.getHttpServer()).post(`/public/alertes/${premier.numero}/annuler`).send({ cle: premier.cleTemoin }).expect(200);
    const s = await alerte(second.numero);
    expect(s).toMatchObject({ principaleId: null, statut: "NOUVELLE" });
    expect(s.evenements.at(-1)?.texte).toContain("Devient l'alerte principale");
  });
});
