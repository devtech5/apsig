import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.ts";
import { configurerApp } from "../src/app.setup.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { connecter, creerFoyer, preparerReferentiel, viderFile } from "./outils.ts";

let app: NestExpressApplication;
let db: PrismaService;
let quartierId: string;

const api = () => request(app.getHttpServer());
const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
const jetonPush = (n: string) => `ExponentPushToken[test-${n}-xxxxxxxxxx]`;

// Foyer de test, code remis par un conseiller au titulaire, application activée.
async function abonne(opts: { telephone?: string } = {}) {
  const { foyer, jetons } = await creerFoyer(db, quartierId);
  const titulaire = await db.membre.findFirstOrThrow({ where: { foyerId: foyer.id, role: "TITULAIRE" } });
  const conseiller = await connecter(app, db, "CONSEILLER");
  const { body: code } = await conseiller.agent.post(`/abonnements/membres/${titulaire.id}/code-application`).expect(201);
  const r = await api().post("/client/activation").send({ telephone: opts.telephone ?? "07 99 99 99 01", code: code.code, appareil: "Téléphone de test" }).expect(200);
  return { foyer, jetons, titulaire, conseiller, jeton: r.body.jeton as string, code: code.code as string };
}

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

describe("Activation de l'application", () => {
  it("le code remis par le conseiller relie l'application au membre, une seule fois", async () => {
    const { jeton, code } = await abonne({ telephone: "+225 07.99.99.99.01" });
    expect(jeton).toMatch(/^[A-Za-z0-9]{40}$/);
    const moi = await api().get("/client/moi").set(avec(jeton)).expect(200);
    expect(moi.body.moi).toMatchObject({ prenom: "Awa", nom: "Testeur" });
    expect(moi.body.urgences.map((u: { type: string }) => u.type)).toContain("MEDICAL");
    // Les données de santé ne quittent pas la centrale.
    expect(JSON.stringify(moi.body)).not.toContain("Diabétique");
    await api().post("/client/activation").send({ telephone: "0799999901", code }).expect(401);
  });

  it("numéro ou code faux : même refus ; le code est brûlé après 5 essais", async () => {
    const { foyer } = await creerFoyer(db, quartierId);
    const titulaire = await db.membre.update({ where: { id: (await db.membre.findFirstOrThrow({ where: { foyerId: foyer.id } })).id }, data: { telephone: "07 11 22 33 44" } });
    const conseiller = await connecter(app, db, "CONSEILLER");
    const { body } = await conseiller.agent.post(`/abonnements/membres/${titulaire.id}/code-application`).expect(201);
    const faux = body.code === "00000000" ? "11111111" : "00000000";
    await api().post("/client/activation").send({ telephone: "0700000000", code: body.code }).expect(401);
    for (let i = 0; i < 5; i++) await api().post("/client/activation").send({ telephone: "0711223344", code: faux }).expect(401);
    await api().post("/client/activation").send({ telephone: "0711223344", code: body.code }).expect(401);
  });

  it("le conseiller voit l'application du membre et peut la déconnecter", async () => {
    const { foyer, titulaire, conseiller, jeton } = await abonne();
    const detail = await conseiller.agent.get(`/abonnements/foyers/${foyer.id}`).expect(200);
    const membre = detail.body.membres.find((m: { id: string }) => m.id === titulaire.id);
    expect(membre.applications).toHaveLength(1);
    expect(membre.applications[0].appareil).toBe("Téléphone de test");
    // Le téléphone de l'abonné n'est pas un QR à imprimer.
    expect(detail.body.supports.every((s: { type: string }) => s.type !== "APPLI")).toBe(true);
    await conseiller.agent.delete(`/abonnements/applications/${membre.applications[0].id}`).expect(200);
    await api().get("/client/moi").set(avec(jeton)).expect(401);
  });

  it("sans jeton valide : 401", async () => {
    await api().get("/client/moi").expect(401);
    await api().get("/client/moi").set(avec("x".repeat(40))).expect(401);
  });
});

describe("SOS depuis l'application", () => {
  it("crée une alerte identifiée, positionnée, que l'abonné suit et annule avec sa clé", async () => {
    const { jeton } = await abonne();
    const position = { lat: 5.3364, lng: -4.0267, precisionM: 12 };
    const r = await api().post("/client/sos").set(avec(jeton)).send({ type: "MEDICAL", position }).expect(201);
    expect(r.body).toMatchObject({ statut: "NOUVELLE", positionPartagee: true, doublon: false });

    const a = await db.alerte.findUniqueOrThrow({ where: { numero: r.body.numero }, include: { support: true, evenements: true } });
    expect(a).toMatchObject({ source: "APPLI", temoinTelephone: "+225 07 99 99 99 01", lat: position.lat, lng: position.lng });
    expect(a.support).toMatchObject({ type: "APPLI", statut: "ACTIF" });
    expect(a.support.code).toMatch(/^APP-\d{4}-01$/);
    expect(a.evenements.map((e) => e.texte).join("\n")).toContain("déclenchée depuis l'application par Awa Testeur");

    const liste = await api().get("/client/alertes").set(avec(jeton)).expect(200);
    expect(liste.body[0]).toMatchObject({ numero: r.body.numero, parMoi: true, cleTemoin: r.body.cleTemoin });

    // Position et annulation : mêmes routes que le témoin d'un QR.
    await api().post(`/public/alertes/${r.body.numero}/position`).send({ cle: r.body.cleTemoin, position: { lat: 5.337, lng: -4.0267 } }).expect(200);
    await api().post(`/public/alertes/${r.body.numero}/annuler`).send({ cle: r.body.cleTemoin }).expect(200);
  });

  it("le reste du foyer est notifié : QR scanné par un témoin, SOS d'un proche", async () => {
    const { foyer, jetons, jeton, conseiller } = await abonne();
    await api().put("/client/notifications").set(avec(jeton)).send({ jetonPush: jetonPush("titulaire") }).expect(200);

    // Un témoin scanne le QR du portail : le titulaire reçoit une notification.
    const scan = await api().post("/public/alertes").send({ jeton: jetons.PORTAIL, type: "INCENDIE" }).expect(201);
    const pushs = await db.message.findMany({ where: { alerte: { numero: scan.body.numero }, canal: "PUSH" } });
    expect(pushs).toHaveLength(1);
    expect(pushs[0]).toMatchObject({ destinataire: jetonPush("titulaire"), statut: "EN_FILE" });
    expect(pushs[0]!.texte).toContain("Alerte sur le QR");

    // Le conjoint active aussi l'application et déclenche : le titulaire est notifié, pas lui-même.
    const conjoint = await db.membre.create({ data: { foyerId: foyer.id, role: "CONJOINT", prenom: "Koffi", nom: "Testeur", telephone: "07 99 99 99 03" } });
    const { body: code } = await conseiller.agent.post(`/abonnements/membres/${conjoint.id}/code-application`).expect(201);
    const { body: acces } = await api().post("/client/activation").send({ telephone: "0799999903", code: code.code }).expect(200);
    await api().put("/client/notifications").set(avec(acces.jeton)).send({ jetonPush: jetonPush("conjoint") }).expect(200);
    const sos = await api().post("/client/sos").set(avec(acces.jeton)).send({ type: "AGRESSION", problemePosition: "REFUSEE" }).expect(201);
    const pushsSos = await db.message.findMany({ where: { alerte: { numero: sos.body.numero }, canal: "PUSH" } });
    expect(pushsSos.map((m) => m.destinataire)).toEqual([jetonPush("titulaire")]);
    expect(pushsSos[0]!.texte).toContain("Koffi Testeur a déclenché une alerte");

    // L'avancement est annoncé à tout le foyer, y compris à celui qui a déclenché.
    const op = await connecter(app, db, "OPERATEUR");
    await op.agent.post(`/centrale/alertes/${sos.body.numero}/prendre`).expect(200);
    const suivi = await db.message.findMany({ where: { alerte: { numero: sos.body.numero }, canal: "PUSH", texte: { contains: "opérateur APSIG" } } });
    expect(suivi.map((m) => m.destinataire).sort()).toEqual([jetonPush("conjoint"), jetonPush("titulaire")]);

    // Le titulaire suit l'alerte du conjoint sans pouvoir l'annuler.
    const vue = await api().get(`/client/alertes/${sos.body.numero}`).set(avec(jeton)).expect(200);
    expect(vue.body).toMatchObject({ parMoi: false, statut: "PRISE_EN_CHARGE" });
    expect(vue.body.cleTemoin).toBeUndefined();
  });

  it("un abonné ne voit pas les alertes d'un autre foyer", async () => {
    const autre = await abonne();
    const { jeton } = await abonne();
    const r = await api().post("/client/sos").set(avec(autre.jeton)).send({ type: "AUTRE" }).expect(201);
    await api().get(`/client/alertes/${r.body.numero}`).set(avec(jeton)).expect(403);
  });
});
