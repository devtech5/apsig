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

// L'API vérifie le format de la data URL, pas l'image elle-même : un contenu factice suffit.
const PHOTO = `data:image/jpeg;base64,${Buffer.from("photo de test").toString("base64")}`;
const tel = (prefixe: string) => `+225 ${prefixe} ${Date.now().toString().slice(-8)}`;
const client = (telephone: string) => ({
  cible: "FAMILLE",
  prenom: "Adjoua",
  nom: "Kouamé",
  telephone,
  telephone2: "",
  quartierId,
  adresse: "Villa 12, portail bleu, derrière l'école",
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

describe("Inscription en deux temps", () => {
  it("étape 1 puis étape 2 : recensement payé, puis pose par code plaque avec GPS à 5 m et photos", async () => {
    const { agent } = await connecter(app, db, "CHEF_EQUIPE");
    const ref = await agent.get("/pose/referentiel").expect(200);
    expect(ref.body.find((v: { nom: string }) => v.nom === "Ville de test").quartiers).toContainEqual({ nom: "Centre", commune: null });

    const r = await agent
      .post("/pose/recensements")
      .send({ ...client(tel("07")), telephone2: "05 44 33 22 11", paiement: { operateur: "ESPECES" } })
      .expect(201);
    expect(r.body).toMatchObject({ client: "Adjoua Kouamé", cible: "FAMILLE", paye: true, posee: false, telephone2: "05 44 33 22 11" });
    expect(r.body.code).toMatch(/^TST-CENTRE-\d{3}$/);
    expect(r.body.qr.plaque).toContain("/s/");
    expect(r.body.qr.interieur.url).toContain("/s/");

    const foyer = await db.foyer.findUniqueOrThrow({ where: { id: r.body.id }, include: { paiements: true, abonnements: { include: { formule: true } } } });
    expect(foyer).toMatchObject({ lat: null, adresseVerifiee: false });
    expect(foyer.paiements.map((p) => p.montantFcfa)).toEqual([10_000]);
    expect(foyer.abonnements[0]?.formule.code).toBe("UNIQUE_FAMILLE");

    // Étape 2 : plaque cherchée par son code (casse et espaces indifférents).
    const plaque = await agent.get(`/pose/plaques/${encodeURIComponent(r.body.code.toLowerCase())}`).expect(200);
    expect(plaque.body).toMatchObject({ code: r.body.code, titulaire: { prenom: "Adjoua" }, precisionRequiseM: 5, pose: null });

    const corps = { representant: { prenom: "Yao", nom: "Kouamé" }, photos: { plaque: PHOTO, remise: PHOTO } };
    await agent.post(`/pose/plaques/${r.body.code}`).send({ ...corps, position: { ...ADRESSE, precisionM: 8 } }).expect(422);
    await agent.post(`/pose/plaques/${r.body.code}`).send({ ...corps, photos: { plaque: "pas une photo", remise: PHOTO }, position: { ...ADRESSE, precisionM: 3 } }).expect(400);
    const fin = await agent.post(`/pose/plaques/${r.body.code}`).send({ ...corps, position: { ...ADRESSE, precisionM: 3 } }).expect(201);
    expect(fin.body).toMatchObject({ code: r.body.code, foyer: { adresseVerifiee: true } });

    const pose = await db.pose.findFirstOrThrow({ where: { support: { code: r.body.code } }, include: { photos: true } });
    expect(pose).toMatchObject({ representantPrenom: "Yao", representantNom: "Kouamé", precisionM: 3 });
    expect(pose.photos.map((p) => p.nature).sort()).toEqual(["PLAQUE", "REMISE"]);
    expect(await db.support.count({ where: { foyerId: r.body.id, type: "INTERIEUR", statut: "ACTIF" } })).toBe(1);
    expect((await agent.get("/pose/recensements").expect(200)).body.find((x: { id: string }) => x.id === r.body.id)).toMatchObject({ posee: true });

    // Les preuves sont visibles par le conseiller dans la fiche du foyer.
    const { agent: conseiller } = await connecter(app, db, "CONSEILLER");
    const detail = await conseiller.get(`/abonnements/foyers/${r.body.id}`).expect(200);
    const portail = detail.body.supports.find((s: { type: string }) => s.type === "PORTAIL");
    expect(portail.pose).toMatchObject({ representant: "Yao Kouamé", photos: expect.arrayContaining(["PLAQUE", "REMISE"]) });
    const image = await conseiller.get(`/abonnements/poses/${portail.pose.id}/photos/PLAQUE`).expect(200);
    expect(image.headers["content-type"]).toContain("image/jpeg");
  });

  it("entreprise : numéro du registre du commerce obligatoire ; adresse trop vague refusée", async () => {
    const { agent } = await connecter(app, db, "CHEF_EQUIPE");
    const entreprise = { ...client(tel("01")), cible: "ENTREPRISE", paiement: null };
    const sansRccm = await agent.post("/pose/recensements").send(entreprise).expect(400);
    expect(sansRccm.body.erreurs.map((e: { champ: string }) => e.champ)).toContain("rccm");
    const r = await agent.post("/pose/recensements").send({ ...entreprise, rccm: "ci-abj-2026-b-12345" }).expect(201);
    // Le type de client est conservé au recensement, même sans paiement.
    expect(r.body).toMatchObject({ rccm: "CI-ABJ-2026-B-12345", paye: false, cible: "ENTREPRISE" });
    expect(r.body.code).toMatch(/^TST-CENTRE-\d{3}$/);
    await agent.post("/pose/recensements").send({ ...client(tel("05")), adresse: "ici", paiement: null }).expect(400);
  });

  it("lieu donné par son nom : ville, commune et quartier absents sont ajoutés au référentiel, puis réutilisés", async () => {
    const { agent } = await connecter(app, db, "CHEF_EQUIPE");
    const suffixe = Date.now().toString().slice(-6);
    const lieu = { ville: `Ville test ${suffixe}`, commune: `Commune ${suffixe}`, quartier: `Quartier ${suffixe}` };
    const r = await agent.post("/pose/recensements").send({ ...client(tel("07")), quartierId: undefined, lieu, paiement: null }).expect(201);
    const foyer = await db.foyer.findUniqueOrThrow({ where: { id: r.body.id }, include: { quartier: { include: { ville: true, commune: true } } } });
    expect(foyer.quartier).toMatchObject({ nom: lieu.quartier, lat: null, ville: { nom: lieu.ville }, commune: { nom: lieu.commune } });
    expect(r.body.code).toMatch(new RegExp(`^${foyer.quartier.ville.code}-${foyer.quartier.commune!.code}-${foyer.quartier.code}-\\d{3}$`));

    // Même lieu écrit autrement : rien n'est recréé.
    const autre = { ville: lieu.ville.toUpperCase(), commune: lieu.commune.toLowerCase(), quartier: ` ${lieu.quartier} ` };
    const r2 = await agent.post("/pose/recensements").send({ ...client(tel("05")), quartierId: undefined, lieu: autre, paiement: null }).expect(201);
    expect((await db.foyer.findUniqueOrThrow({ where: { id: r2.body.id } })).quartierId).toBe(foyer.quartierId);

    const ref = await agent.get("/pose/referentiel").expect(200);
    expect(ref.body.find((v: { nom: string }) => v.nom === "Abidjan").communes).toContain("Yopougon");
    expect(ref.body.find((v: { nom: string }) => v.nom === lieu.ville)).toMatchObject({ communes: [lieu.commune], quartiers: [{ nom: lieu.quartier, commune: lieu.commune }] });
  });

  it("acompte : encaissé sans ouvrir l'abonnement, reste à payer affiché", async () => {
    const { agent } = await connecter(app, db, "CHEF_EQUIPE");
    const r = await agent.post("/pose/recensements").send({ ...client(tel("07")), paiement: { operateur: "ESPECES", montantFcfa: 4_000 } }).expect(201);
    expect(r.body).toMatchObject({ paye: false, encaisseFcfa: 4_000, resteFcfa: 6_000, cible: "FAMILLE" });
    const foyer = await db.foyer.findUniqueOrThrow({ where: { id: r.body.id }, include: { abonnements: true, paiements: true } });
    expect(foyer.abonnements).toHaveLength(0);
    expect(foyer.paiements.map((p) => p.montantFcfa)).toEqual([4_000]);
    await agent.post("/pose/recensements").send({ ...client(tel("01")), paiement: { operateur: "ESPECES", montantFcfa: 12_000 } }).expect(400);
  });

  it("réservé à l'espace Pose ; code de plaque inconnu : 404", async () => {
    await request(app.getHttpServer()).get("/pose/referentiel").expect(401);
    const { agent: operateur } = await connecter(app, db, "OPERATEUR");
    await operateur.post("/pose/recensements").send({ ...client(tel("07")), paiement: null }).expect(403);
    const { agent } = await connecter(app, db, "CHEF_EQUIPE");
    await agent.get("/pose/plaques/XXX-INCONNU-999").expect(404);
  });
});
