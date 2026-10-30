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
let formuleId: string;

type Foyer = {
  id: string;
  numero: number;
  adresseVerifiee: boolean;
  membres: { id: string; role: string; prenom: string; infosMedicalesRenseignees: boolean }[];
  contacts: { id: string; nom: string; consentiLe: string | null }[];
  supports: { id: string; type: string; code: string; codeCourt: string; statut: string; url: string; porteur: { id: string } | null }[];
  abonnements: { id: string; etat: string; debut: string; fin: string }[];
  paiements: { montantFcfa: number; operateur: string }[];
};

const titulaire = { prenom: "Mariam", nom: "Koné", telephone: "+225 07 11 22 33 44" };
const jeton = (url: string) => url.split("/s/")[1]!;

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configurerApp(module.createNestApplication<NestExpressApplication>());
  await app.init();
  db = app.get(PrismaService);
  quartierId = await preparerReferentiel(db);
  const formule = await db.formule.upsert({
    where: { code: "TEST_DUO" },
    update: {},
    create: { code: "TEST_DUO", nom: "Formule de test duo", prixFcfa: 9000, composition: { create: [{ type: "PORTAIL", quantite: 1 }, { type: "BRACELET", quantite: 1 }] } },
  });
  formuleId = formule.id;
});

afterAll(async () => {
  await app?.close();
});

async function nouveauFoyer(agent: Awaited<ReturnType<typeof connecter>>["agent"]) {
  const r = await agent
    .post("/abonnements/foyers")
    .send({ libelle: "Villa 12, Centre", quartierId, position: { lat: 6.9, lng: -6.44 }, titulaire, souscription: { formuleId, mois: 3, paiement: { montantFcfa: 9000, operateur: "WAVE" } } })
    .expect(201);
  return r.body as Foyer;
}

describe("Espace abonnements", () => {
  it("réservé aux conseillers et à l'administration", async () => {
    await request(app.getHttpServer()).get("/abonnements/foyers").expect(401);
    const op = await connecter(app, db, "OPERATEUR");
    await op.agent.get("/abonnements/foyers").expect(403);
    const conseiller = await connecter(app, db, "CONSEILLER");
    await conseiller.agent.get("/abonnements/referentiel").expect(200);
    // Et l'inverse : un conseiller n'entre pas dans la centrale.
    await conseiller.agent.get("/centrale/alertes").expect(403);
  });

  it("crée un foyer avec son abonnement et les supports de la formule, prêts à imprimer", async () => {
    const { agent } = await connecter(app, db, "CONSEILLER");
    const f = await nouveauFoyer(agent);
    expect(f.numero).toBeGreaterThan(0);
    expect(f.membres).toMatchObject([{ role: "TITULAIRE", prenom: "Mariam" }]);
    expect(f.abonnements).toHaveLength(1);
    expect(f.abonnements[0]!.etat).toBe("ACTIF");
    expect(f.paiements).toMatchObject([{ montantFcfa: 9000, operateur: "WAVE" }]);
    expect(f.supports.map((s) => s.type).sort()).toEqual(["BRACELET", "PORTAIL"]);
    const n = String(f.numero);
    expect(f.supports.find((s) => s.type === "PORTAIL")!.code).toBe(`TST-CENTRE-${n.padStart(3, "0")}`);
    expect(f.supports.find((s) => s.type === "BRACELET")!.code).toBe(`ENF-${n.padStart(4, "0")}-01`);
    for (const s of f.supports) expect(s.codeCourt).toMatch(/^\d{5,}$/);

    // Le QR imprimé fonctionne aussitôt.
    const portail = f.supports.find((s) => s.type === "PORTAIL")!;
    const page = await request(app.getHttpServer()).get(`/public/supports/${jeton(portail.url)}`).expect(200);
    expect(page.body.code).toBe(portail.code);
  });

  it("renouvellement anticipé : la nouvelle période suit la période en cours, sans refaire les supports", async () => {
    const { agent } = await connecter(app, db, "CONSEILLER");
    const f = await nouveauFoyer(agent);
    const r = await agent.post(`/abonnements/foyers/${f.id}/abonnements`).send({ formuleId, mois: 12 }).expect(201);
    const apres = r.body as Foyer;
    const [nouveau, ancien] = apres.abonnements;
    expect(nouveau!.etat).toBe("A_VENIR");
    expect(nouveau!.debut).toBe(ancien!.fin);
    expect(apres.supports).toHaveLength(2);

    const resilie = await agent.post(`/abonnements/abonnements/${nouveau!.id}/resilier`).expect(200);
    expect((resilie.body as Foyer).abonnements[0]!.etat).toBe("RESILIE");
  });

  it("santé : saisie par le conseiller sans jamais être relue dans l'espace abonnements", async () => {
    const { agent } = await connecter(app, db, "CONSEILLER");
    const f = await nouveauFoyer(agent);
    const r = await agent
      .post(`/abonnements/foyers/${f.id}/membres`)
      .send({ role: "ENFANT", prenom: "Ali", nom: "Koné", anneeNaissance: 2018, infosMedicales: "Asthme, Ventoline dans le sac" })
      .expect(201);
    const enfant = (r.body as Foyer).membres.find((m) => m.prenom === "Ali")!;
    expect(enfant.infosMedicalesRenseignees).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain("Ventoline");
    expect((await db.membre.findUniqueOrThrow({ where: { id: enfant.id } })).infosMedicales).toBe("Asthme, Ventoline dans le sac");

    await agent.post(`/abonnements/foyers/${f.id}/membres`).send({ role: "TITULAIRE", prenom: "X", nom: "Y" }).expect(409);
    await agent.delete(`/abonnements/membres/${f.membres[0]!.id}`).expect(409);
    const sans = await agent.patch(`/abonnements/membres/${enfant.id}`).send({ infosMedicales: "" }).expect(200);
    expect((sans.body as Foyer).membres.find((m) => m.id === enfant.id)!.infosMedicalesRenseignees).toBe(false);
  });

  it("contacts d'urgence : ajout avec consentement, modification, suppression", async () => {
    const { agent } = await connecter(app, db, "CONSEILLER");
    const f = await nouveauFoyer(agent);
    const r = await agent.post(`/abonnements/foyers/${f.id}/contacts`).send({ nom: "Fatou Koné", relation: "Sœur", telephone: "+225 05 44 33 22 11", consenti: true }).expect(201);
    const c = (r.body as Foyer).contacts[0]!;
    expect(c.consentiLe).not.toBeNull();
    await agent.post(`/abonnements/foyers/${f.id}/contacts`).send({ nom: "Sans numéro", relation: "Ami", telephone: "abc" }).expect(400);
    await agent.patch(`/abonnements/contacts/${c.id}`).send({ relation: "Grande sœur" }).expect(200);
    const vide = await agent.delete(`/abonnements/contacts/${c.id}`).expect(200);
    expect((vide.body as Foyer).contacts).toHaveLength(0);
  });

  it("support perdu puis remplacé : l'ancien QR est refusé, le nouveau fonctionne", async () => {
    const { agent } = await connecter(app, db, "CONSEILLER");
    const f = await nouveauFoyer(agent);
    const bracelet = f.supports.find((s) => s.type === "BRACELET")!;
    const ancien = jeton(bracelet.url);

    await agent.post(`/abonnements/supports/${bracelet.id}/statut`).send({ statut: "PERDU" }).expect(200);
    await request(app.getHttpServer()).get(`/public/supports/${ancien}`).expect(403);

    const r = await agent.post(`/abonnements/supports/${bracelet.id}/remplacer`).expect(200);
    const remplace = (r.body as Foyer).supports.find((s) => s.id === bracelet.id)!;
    expect(remplace).toMatchObject({ code: bracelet.code, statut: "ACTIF" });
    expect(jeton(remplace.url)).not.toBe(ancien);
    await request(app.getHttpServer()).get(`/public/supports/${ancien}`).expect(410);
    await request(app.getHttpServer()).get(`/public/supports/${jeton(remplace.url)}`).expect(200);
  });

  it("second bracelet porté par un enfant du foyer ; adresse déplacée au bureau : à revérifier", async () => {
    const { agent } = await connecter(app, db, "CONSEILLER");
    const f = await nouveauFoyer(agent);
    const avecEnfant = (await agent.post(`/abonnements/foyers/${f.id}/membres`).send({ role: "ENFANT", prenom: "Ina", nom: "Koné" }).expect(201)).body as Foyer;
    const ina = avecEnfant.membres.find((m) => m.prenom === "Ina")!;
    const r = await agent.post(`/abonnements/foyers/${f.id}/supports`).send({ type: "BRACELET", membreId: ina.id }).expect(201);
    const bracelets = (r.body as Foyer).supports.filter((s) => s.type === "BRACELET");
    expect(bracelets.map((s) => s.code)).toEqual([`ENF-${String(f.numero).padStart(4, "0")}-01`, `ENF-${String(f.numero).padStart(4, "0")}-02`]);
    expect(bracelets[1]!.porteur?.id).toBe(ina.id);

    await db.foyer.update({ where: { id: f.id }, data: { adresseVerifiee: true } });
    const deplace = await agent.patch(`/abonnements/foyers/${f.id}`).send({ position: { lat: 6.91, lng: -6.44 } }).expect(200);
    expect((deplace.body as Foyer).adresseVerifiee).toBe(false);
  });

  it("recherche par nom, téléphone, code imprimé et code court", async () => {
    const { agent } = await connecter(app, db, "CONSEILLER");
    const f = await nouveauFoyer(agent);
    const portail = f.supports.find((s) => s.type === "PORTAIL")!;
    for (const q of [portail.code.toLowerCase(), portail.codeCourt, String(f.numero)]) {
      const r = await agent.get("/abonnements/foyers").query({ q }).expect(200);
      expect((r.body as { id: string }[]).map((x) => x.id)).toContain(f.id);
    }
    const parNom = await agent.get("/abonnements/foyers").query({ q: "koné" }).expect(200);
    expect(parNom.body.length).toBeGreaterThan(0);
  });
});
