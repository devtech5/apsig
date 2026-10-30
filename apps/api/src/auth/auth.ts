import { randomBytes } from "node:crypto";
import { Logger } from "@nestjs/common";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { PrismaClient } from "@apsig/db";
import { config } from "../config.ts";

const HEURE_S = 3600;

// Sans clé configurée en production, l'API démarre quand même (les alertes passent avant tout) :
// une clé aléatoire est tirée, et les opérateurs devront se reconnecter à chaque redémarrage.
function cle() {
  if (config.authSecret) return config.authSecret;
  if (process.env.NODE_ENV !== "production") return "secret-de-developpement-a-ne-jamais-utiliser-en-production";
  Logger.error("BETTER_AUTH_SECRET manquant : sessions de la centrale perdues à chaque redémarrage", "Auth");
  return randomBytes(32).toString("base64");
}

export function creerAuth(db: PrismaClient) {
  // Sans elle, toute connexion depuis la centrale est refusée (« Invalid origin »).
  if (process.env.NODE_ENV === "production" && !process.env.CENTRALE_URL) {
    Logger.error("CENTRALE_URL manquant : connexions à la centrale refusées", "Auth");
  }
  return betterAuth({
    database: prismaAdapter(db, { provider: "postgresql" }),
    secret: cle(),
    // La centrale relaie /api/auth vers l'API : pour le navigateur, tout est sur le domaine de la centrale.
    baseURL: config.centraleUrl,
    basePath: "/api/auth",
    // apsig:// : l'application mobile (agents de pose, intervenants), qui garde sa session dans le trousseau du téléphone.
    trustedOrigins: [config.centraleUrl, "apsig://", ...(process.env.NODE_ENV === "production" ? [] : config.corsOrigins)],
    // Pas d'inscription publique : les comptes sont créés par la commande creer-compte.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    // Une session couvre une garde de 12 h, prolongée tant que l'opérateur est actif.
    session: { modelName: "session", expiresIn: 12 * HEURE_S, updateAge: HEURE_S },
    user: {
      modelName: "utilisateur",
      fields: { name: "nom", emailVerified: "emailVerifie", createdAt: "creeLe", updatedAt: "modifieLe" },
      additionalFields: {
        role: { type: "string", input: false },
        actif: { type: "boolean", input: false },
      },
    },
    account: { modelName: "compte" },
    verification: { modelName: "verification" },
    // Code à 6 chiffres d'une application d'authentification, demandé après le mot de passe.
    plugins: [
      expo(),
      twoFactor({
        issuer: "APSIG Centrale",
        twoFactorTable: "secondFacteur",
        schema: { user: { fields: { twoFactorEnabled: "deuxFacteurs" } } },
        backupCodeOptions: { amount: 8 },
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const u = await db.utilisateur.findUnique({ where: { id: session.userId }, select: { actif: true } });
            if (!u?.actif) throw new APIError("FORBIDDEN", { message: "Ce compte est désactivé" });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof creerAuth>;
