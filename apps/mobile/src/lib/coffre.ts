import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Jetons gardés dans le trousseau du téléphone (Keychain, Keystore) ; dans le navigateur
// (aperçu de développement uniquement), dans le stockage local.
const web = Platform.OS === "web";

export const coffre = {
  lire: (cle: string) => (web ? Promise.resolve(globalThis.localStorage?.getItem(cle) ?? null) : SecureStore.getItemAsync(cle)),
  ecrire: (cle: string, valeur: string) => (web ? Promise.resolve(globalThis.localStorage?.setItem(cle, valeur)) : SecureStore.setItemAsync(cle, valeur)),
  effacer: (cle: string) => (web ? Promise.resolve(globalThis.localStorage?.removeItem(cle)) : SecureStore.deleteItemAsync(cle)),
};

export const CLES = { abonne: "apsig.abonne", appareil: "apsig.appareil" } as const;
