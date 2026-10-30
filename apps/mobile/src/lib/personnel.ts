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

export type Espace = "centrale" | "supervision" | "abonnements" | "administration" | "pose" | "terrain";
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
