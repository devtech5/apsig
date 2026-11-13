import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_URL, appel } from "./api";

// Comptes du personnel APSIG (agents de pose, intervenants des unités) : mêmes comptes et même double
// authentification que la centrale. La session est gardée dans le trousseau du téléphone.
export const auth = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  plugins: [expoClient({ scheme: "apsig", storagePrefix: "apsig", storage: SecureStore }), twoFactorClient()],
});

export type Espace = "centrale" | "supervision" | "abonnements" | "administration" | "recensement" | "pose" | "equipe" | "terrain";
export type ComptePersonnel = { id: string; nom: string; email: string; role: string; espaces: Espace[]; deuxFacteursRequis: boolean };

// Appel de l'API avec la session du personnel.
export async function appelPersonnel<T>(chemin: string, options: Parameters<typeof appel>[1] = {}) {
  const cookie = await auth.getCookie();
  return appel<T>(chemin, { ...options, entetes: { ...options.entetes, ...(cookie && { Cookie: cookie }) } });
}

export async function comptePersonnel(): Promise<ComptePersonnel | null> {
  if (!(await auth.getCookie())) return null;
  return appelPersonnel<ComptePersonnel>("/compte");
}

export async function deconnecterPersonnel() {
  await auth.signOut();
}

// Recenseurs : connexion par téléphone. Même règle que @apsig/domain (emailTerrain) : « 07 08 09 10 11 » ou
// « +225 0708091011 » donnent 2250708091011@terrain.apsig.ci, l'identifiant de leur compte.
export function identifiantConnexion(saisie: string): string | null {
  const s = saisie.trim();
  if (s.includes("@")) return s.toLowerCase();
  const national = s.replace(/\D/g, "").replace(/^(00)?225(?=\d{10}$)/, "");
  return /^\d{10}$/.test(national) ? `225${national}@terrain.apsig.ci` : null;
}
