import * as Speech from "expo-speech";

// Consignes lues à voix haute : beaucoup d'abonnés lisent mal ou pas du tout.
export function parler(texte: string) {
  Speech.stop();
  Speech.speak(texte, { language: "fr-FR", rate: 0.9 });
}

export const taire = () => void Speech.stop();
