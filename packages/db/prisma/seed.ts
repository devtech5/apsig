// Données de démonstration — toutes les personnes et numéros privés sont FICTIFS.
// Coordonnées des quartiers de Daloa approximatives, à corriger sur le terrain.
import path from "node:path";
import { codeSupport, genererJeton, urlAlerte, type TypeSupport } from "@apsig/domain";
import { createPrismaClient } from "../src/index.ts";

process.loadEnvFile(path.resolve(import.meta.dirname, "../../../.env"));
const prisma = createPrismaClient();

const QUARTIERS_DALOA = [
  { code: "LOBIA", nom: "Lobia", lat: 6.8905, lng: -6.4425 },
  { code: "TAZIBOUO", nom: "Tazibouo", lat: 6.8985, lng: -6.4285 },
  { code: "ORLY", nom: "Orly", lat: 6.8655, lng: -6.4545 },
  { code: "KENNEDY", nom: "Kennedy", lat: 6.8795, lng: -6.4615 },
  { code: "MARAIS", nom: "Marais", lat: 6.8715, lng: -6.4435 },
  { code: "COMMERCE", nom: "Commerce", lat: 6.8775, lng: -6.4505 },
];

async function main() {
  // Référentiel
  const daloa = await prisma.ville.upsert({ where: { code: "DAL" }, update: {}, create: { code: "DAL", nom: "Daloa" } });
  for (const q of QUARTIERS_DALOA) {
    await prisma.quartier.upsert({
      where: { villeId_code: { villeId: daloa.id, code: q.code } },
      update: {},
      create: { ...q, villeId: daloa.id },
    });
  }
  const abidjan = await prisma.ville.upsert({ where: { code: "ABJ" }, update: {}, create: { code: "ABJ", nom: "Abidjan" } });
  const yop = await prisma.commune.upsert({
    where: { villeId_code: { villeId: abidjan.id, code: "YOP" } },
    update: {},
    create: { code: "YOP", nom: "Yopougon", villeId: abidjan.id },
  });
  await prisma.quartier.upsert({
    where: { villeId_code: { villeId: abidjan.id, code: "NIANGON" } },
    update: {},
    create: { code: "NIANGON", nom: "Niangon", villeId: abidjan.id, communeId: yop.id, lat: 5.3335, lng: -4.0935 },
  });

  // Formules (prix d'achat de l'affiche ; abonnements mensuels à fixer)
  const formules = [
    { code: "ENFANT", nom: "Formule Enfant", prixFcfa: 3000, moisInclus: 0, composition: [["BRACELET", 1]] },
    { code: "MAISON", nom: "Formule Maison", prixFcfa: 7500, moisInclus: 0, composition: [["PORTAIL", 1]] },
    { code: "FAMILLE", nom: "Formule Famille complète", prixFcfa: 15000, moisInclus: 2, composition: [["PORTAIL", 1], ["INTERIEUR", 1], ["BRACELET", 1], ["CARTE_VOYAGEUR", 1]] },
    // Prix non fixé : désactivée tant que le tarif n'est pas décidé.
    { code: "SECURITE_PLUS", nom: "Formule Sécurité +", prixFcfa: 0, moisInclus: 0, intervention: true, actif: false, composition: [["PORTAIL", 1], ["INTERIEUR", 1]] },
  ] as const;
  for (const { composition, ...f } of formules) {
    await prisma.formule.upsert({
      where: { code: f.code },
      update: {},
      create: { ...f, composition: { create: composition.map(([type, quantite]) => ({ type, quantite })) } },
    });
  }

  // Partenaires (numéros publics ; partenaires privés fictifs)
  if ((await prisma.partenaire.count()) === 0) {
    await prisma.partenaire.createMany({
      data: [
        { type: "POLICE", nom: "Police secours", telephone: "111" },
        { type: "GSPM", nom: "Sapeurs-pompiers (GSPM)", telephone: "180" },
        { type: "SAMU", nom: "SAMU", telephone: "185" },
        { type: "AMBULANCE_PRIVEE", nom: "Ambulance partenaire (fictive)", telephone: "+225 07 00 00 00 01", villeCode: "DAL" },
        { type: "INFIRMIER", nom: "IDE motorisé (fictif)", telephone: "+225 07 00 00 00 02", villeCode: "DAL" },
      ],
    });
  }

  // Utilisateurs de démonstration (l'authentification arrive avec Better Auth)
  for (const u of [
    { email: "admin@apsig.test", nom: "Admin Démo", role: "ADMIN" },
    { email: "operateur@apsig.test", nom: "Opératrice Démo", role: "OPERATEUR" },
    { email: "agent@apsig.test", nom: "Agent Pose Démo", role: "AGENT" },
  ] as const) {
    await prisma.utilisateur.upsert({ where: { email: u.email }, update: {}, create: u });
  }

  // Foyer fictif équipé de la Formule Famille
  const existant = await prisma.support.findUnique({ where: { code: "DAL-LOBIA-053" } });
  if (!existant) {
    const lobia = await prisma.quartier.findUniqueOrThrow({ where: { villeId_code: { villeId: daloa.id, code: "LOBIA" } } });
    const famille = await prisma.formule.findUniqueOrThrow({ where: { code: "FAMILLE" } });
    const now = new Date();
    const foyer = await prisma.foyer.create({
      data: {
        libelle: "Villa 53, Lobia (fictive)",
        quartierId: lobia.id,
        lat: lobia.lat,
        lng: lobia.lng,
        adresseVerifiee: true,
        cleClient: genererJeton(24),
        membres: {
          create: [
            { role: "TITULAIRE", prenom: "Aya", nom: "Kouassi", telephone: "+225 07 11 11 11 11" },
            { role: "ENFANT", prenom: "Koffi", nom: "Kouassi", anneeNaissance: 2017 },
          ],
        },
        contacts: { create: [{ nom: "Yao Kouassi", relation: "Frère", telephone: "+225 07 22 22 22 22", consentiLe: now }] },
        abonnements: {
          create: { formuleId: famille.id, statut: "ACTIF", debut: now, fin: new Date(now.getTime() + 60 * 86_400_000) },
        },
      },
      include: { membres: true },
    });
    const enfant = foyer.membres.find((m) => m.role === "ENFANT")!;
    const supports: { type: TypeSupport; code: string; membreId?: string }[] = [
      { type: "PORTAIL", code: codeSupport("PORTAIL", { ville: "DAL", quartier: "LOBIA", numero: 53 }) },
      { type: "INTERIEUR", code: codeSupport("INTERIEUR", { numero: 53 }) },
      { type: "BRACELET", code: codeSupport("BRACELET", { numero: 53, rang: 1 }), membreId: enfant.id },
      { type: "CARTE_VOYAGEUR", code: codeSupport("CARTE_VOYAGEUR", { numero: 53 }) },
    ];
    let codeCourt = 20053;
    for (const s of supports) {
      await prisma.support.create({
        data: { ...s, jeton: genererJeton(), codeCourt: String(codeCourt++), statut: "ACTIF", foyerId: foyer.id },
      });
    }
  }

  const base = process.env.PUBLIC_ALERT_URL ?? "http://localhost:3001";
  console.log("\nSupports de démonstration :");
  for (const s of await prisma.support.findMany({ orderBy: { codeCourt: "asc" } })) {
    console.log(`  ${s.code.padEnd(16)} ${s.type.padEnd(15)} ${urlAlerte(base, s.jeton)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
