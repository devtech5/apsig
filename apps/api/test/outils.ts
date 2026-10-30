// Données de test partagées par les suites e2e.
import { createHmac } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { RoleUtilisateur } from "@apsig/db";
import { genererJeton, STATUTS_OUVERTS, type TypeSupport } from "@apsig/domain";
import { definirMotDePasse } from "../src/auth/comptes.ts";
import { config } from "../src/config.ts";
import type { PrismaService } from "../src/prisma/prisma.service.ts";

export const ADRESSE = { lat: 6.8905, lng: -6.4425 };
const JOUR = 86_400_000;

// Chaque foyer a sa propre adresse, à plus d'un kilomètre des autres : deux alertes de test ne sont
// regroupées en un même incident que si le test le demande (option position).
let foyers = 0;
const adresseSuivante = () => {
  const n = foyers++;
  return { lat: ADRESSE.lat + 0.01 * (n % 50), lng: ADRESSE.lng + 0.01 * Math.floor(n / 50) };
};

// Code TOTP (RFC 6238 : HMAC-SHA1, 30 s, 6 chiffres), comme l'afficherait l'application d'authentification.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function codeTotp(secretBase32: string, maintenant = Date.now()) {
  const bits = [...secretBase32.replace(/=+$/, "").toUpperCase()].map((c) => BASE32.indexOf(c).toString(2).padStart(5, "0")).join("");
  const cle = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(maintenant / 30_000)));
  const h = createHmac("sha1", cle).update(compteur).digest();
  const decalage = h[h.length - 1]! & 15;
  return ((h.readUInt32BE(decalage) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

// Compte du back-office et session ouverte comme le ferait le navigateur de la centrale (même origine).
export async function connecter(app: INestApplication, db: PrismaService, role: RoleUtilisateur, opts: { actif?: boolean } = {}) {
  const email = `${role.toLowerCase()}-${genererJeton(6).toLowerCase()}@apsig.test`;
  const { utilisateur, motDePasse } = await definirMotDePasse(db, { email, nom: `${role} ${genererJeton(4)}`, role });
  if (opts.actif === false) await db.utilisateur.update({ where: { id: utilisateur.id }, data: { actif: false } });
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post("/api/auth/sign-in/email").set("Origin", config.centraleUrl).send({ email, password: motDePasse });
  return { agent, utilisateur, motDePasse, connexion: r };
}

// La base de test est conservée d'une exécution à l'autre : chaque suite repart d'une file vide.
export async function viderFile(db: PrismaService) {
  await db.alerte.updateMany({
    where: { statut: { in: [...STATUTS_OUVERTS] } },
    data: { statut: "ANNULEE", clotureLe: new Date(), issue: "Nettoyage des tests" },
  });
  await db.utilisateur.updateMany({ where: { presence: { not: "HORS_SERVICE" } }, data: { presence: "HORS_SERVICE" } });
}

export async function preparerReferentiel(db: PrismaService) {
  const ville = await db.ville.upsert({ where: { code: "TST" }, update: {}, create: { code: "TST", nom: "Ville de test" } });
  const quartier = await db.quartier.upsert({
    where: { villeId_code: { villeId: ville.id, code: "CENTRE" } },
    update: {},
    create: { code: "CENTRE", nom: "Centre", villeId: ville.id, ...ADRESSE },
  });
  if ((await db.partenaire.count({ where: { type: "POLICE" } })) === 0) {
    await db.partenaire.createMany({
      data: [
        { type: "POLICE", nom: "Police test", telephone: "111" },
        { type: "GSPM", nom: "GSPM test", telephone: "180" },
        { type: "SAMU", nom: "SAMU test", telephone: "185" },
      ],
    });
  }
  return quartier.id;
}

export async function creerFoyer(
  db: PrismaService,
  quartierId: string,
  opts: { abonnement?: "actif" | "expire" | "aucun"; intervention?: boolean; position?: { lat: number; lng: number } } = {},
) {
  const position = opts.position ?? adresseSuivante();
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
      ...position,
      adresseVerifiee: true,
      cleClient: genererJeton(24),
      membres: { create: [{ role: "TITULAIRE", prenom: "Awa", nom: "Testeur", telephone: "+225 07 99 99 99 01", infosMedicales: "Diabétique" }] },
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
  return { foyer, jetons, position };
}
