import { Alert, Platform } from "react-native";

// Boîte de confirmation du système (dans l'aperçu web, celle du navigateur).
export function confirmer(titre: string, message: string, action: () => void, libelle = "Confirmer") {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${titre}\n\n${message}`)) action();
    return;
  }
  Alert.alert(titre, message, [
    { text: "Annuler", style: "cancel" },
    { text: libelle, style: "destructive", onPress: action },
  ]);
}
