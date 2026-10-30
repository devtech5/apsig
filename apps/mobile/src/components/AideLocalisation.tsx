import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { COULEURS } from "@/lib/theme";
import { parler, taire } from "@/lib/voix";
import { Bouton, Icone, Texte, type NomIcone } from "./ui";

type Probleme = "refusee" | "indisponible" | "impossible";

// Pensé pour tous, y compris ceux qui ne lisent pas : pictogrammes, gros bouton, consignes lues à voix haute.
const AIDES: Record<Probleme, { titre: string; etapes: [NomIcone, string][]; voix: string; bouton?: string }> = {
  refusee: {
    titre: "Montrez aux secours où vous êtes",
    etapes: [
      ["gesture-tap", "Touchez le grand bouton bleu : les réglages s'ouvrent"],
      ["map-marker", Platform.OS === "ios" ? "Touchez « Position », puis « Lorsque l'app est active »" : "Touchez « Autorisations », « Position », puis « Autoriser »"],
      ["arrow-left-circle", "Revenez dans APSIG : la position part toute seule"],
    ],
    voix:
      "Les secours ont besoin de savoir où vous êtes. Touchez le grand bouton bleu. Dans les réglages, touchez Position, puis Autoriser. " +
      "Revenez ensuite dans l'application APSIG.",
    bouton: "Autoriser ma position",
  },
  indisponible: {
    titre: "Allumez la localisation du téléphone",
    etapes:
      Platform.OS === "ios"
        ? [
            ["cog", "Ouvrez Réglages, puis « Confidentialité », puis « Service de localisation »"],
            ["toggle-switch", "Allumez « Service de localisation »"],
            ["arrow-left-circle", "Revenez dans APSIG"],
          ]
        : [
            ["gesture-swipe-down", "Glissez le doigt du haut de l'écran vers le bas"],
            ["map-marker", "Touchez l'icône « Localisation » pour l'allumer"],
            ["arrow-left-circle", "Revenez dans APSIG"],
          ],
    voix:
      Platform.OS === "ios"
        ? "Les secours ont besoin de savoir où vous êtes. Ouvrez Réglages, Confidentialité, Service de localisation, et allumez-le. Revenez ensuite dans APSIG."
        : "Les secours ont besoin de savoir où vous êtes. Glissez le doigt du haut de l'écran vers le bas, puis touchez l'icône Localisation pour l'allumer. Revenez ensuite dans APSIG.",
    bouton: "Réessayer",
  },
  impossible: {
    titre: "Position impossible à envoyer",
    etapes: [["phone", "La centrale va vous appeler pour savoir où vous êtes. Gardez votre téléphone près de vous."]],
    voix: "Votre position ne peut pas être envoyée depuis ce téléphone. La centrale va vous appeler. Gardez votre téléphone près de vous.",
  },
};

export function AideLocalisation({ probleme, onReessayer, onReglages }: { probleme: Probleme; onReessayer: () => void; onReglages: () => void }) {
  const aide = AIDES[probleme];
  const [essais, setEssais] = useState(0);

  // Consignes lues dès l'affichage.
  useEffect(() => {
    parler(AIDES[probleme].voix);
    return taire;
  }, [probleme]);

  function agir() {
    setEssais((n) => n + 1);
    if (probleme === "refusee") onReglages();
    else onReessayer();
  }

  return (
    <View style={styles.cadre} accessibilityRole="summary">
      <View style={styles.entete}>
        <View style={styles.pastille}>
          <Icone nom="map-marker-off" taille={30} couleur={COULEURS.blanc} />
        </View>
        <Text style={styles.titre}>{aide.titre}</Text>
      </View>

      {aide.etapes.map(([icone, texte], i) => (
        <View key={texte} style={styles.etape}>
          {aide.etapes.length > 1 && <Text style={styles.numero}>{i + 1}</Text>}
          <View style={styles.icone}>
            <Icone nom={icone} taille={28} couleur={COULEURS.brand} />
          </View>
          <Text style={styles.texteEtape}>{texte}</Text>
        </View>
      ))}

      {aide.bouton && (
        <>
          {essais > 0 && (
            <Texte gras style={styles.rappel}>
              {probleme === "refusee" ? "Toujours bloquée : dans les réglages, touchez « Position » puis « Autoriser »." : "Pas encore de signal : vérifiez que la localisation est allumée."}
            </Texte>
          )}
          <Bouton grand icone="crosshairs-gps" libelle={aide.bouton} onPress={agir} />
        </>
      )}
      <Bouton secondaire icone="volume-high" libelle="Écouter les explications" onPress={() => parler(aide.voix)} />
      {aide.bouton && <Texte attenue style={{ textAlign: "center" }}>Sinon, la centrale va vous appeler pour savoir où vous êtes.</Texte>}
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { gap: 14, borderRadius: 24, borderWidth: 4, borderColor: COULEURS.danger, backgroundColor: COULEURS.blanc, padding: 18 },
  entete: { flexDirection: "row", alignItems: "center", gap: 12 },
  pastille: { width: 56, height: 56, borderRadius: 28, backgroundColor: COULEURS.danger, alignItems: "center", justifyContent: "center" },
  titre: { flex: 1, fontSize: 21, fontWeight: "900", color: COULEURS.encre },
  etape: { flexDirection: "row", alignItems: "center", gap: 10 },
  numero: { width: 30, height: 30, borderRadius: 15, backgroundColor: COULEURS.brand, color: COULEURS.blanc, textAlign: "center", lineHeight: 30, fontWeight: "900" },
  icone: { width: 48, height: 48, borderRadius: 12, backgroundColor: COULEURS.brandClair, alignItems: "center", justifyContent: "center" },
  texteEtape: { flex: 1, fontSize: 16, fontWeight: "600", color: COULEURS.encre },
  rappel: { backgroundColor: COULEURS.alerteFond, color: COULEURS.alerteEncre, borderRadius: 12, padding: 10 },
});
