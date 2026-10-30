import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Bouton, Ecran, Erreur, Icone, NumerosSecours, Texte } from "@/components/ui";
import { jetonDuQr } from "@/lib/qr";
import { COULEURS } from "@/lib/theme";

// Scanner : un témoin (sans compte) ou un agent de pose (?mode=pose).
export default function Scanner() {
  const { mode } = useLocalSearchParams<{ mode?: "pose" }>();
  const [permission, demander] = useCameraPermissions();
  const [erreur, setErreur] = useState<string | null>(null);
  const lu = useRef(false);

  function scanne(texte: string) {
    if (lu.current) return;
    const jeton = jetonDuQr(texte);
    if (!jeton) {
      setErreur("Ce QR code n'est pas un QR APSIG.");
      return;
    }
    lu.current = true;
    if (mode === "pose") router.replace({ pathname: "/personnel/pose/[jeton]", params: { jeton } });
    else router.replace({ pathname: "/temoin/[jeton]", params: { jeton } });
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!permission.granted) {
    return (
      <Ecran>
        <Icone nom="camera-off" taille={56} couleur={COULEURS.brand} />
        <Texte gras>La caméra sert à lire le QR code APSIG.</Texte>
        <Bouton grand icone="camera" libelle="Autoriser la caméra" onPress={() => void demander()} />
        {!permission.canAskAgain && <Texte attenue>La caméra est bloquée : autorisez-la dans les réglages du téléphone, rubrique APSIG.</Texte>}
        {mode !== "pose" && <NumerosSecours />}
      </Ecran>
    );
  }

  return (
    <View style={styles.plein}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => scanne(data)} />
      <View style={styles.viseur} pointerEvents="none" />
      <View style={styles.bas}>
        <Text style={styles.consigne}>Visez le QR code APSIG</Text>
        <Erreur message={erreur} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plein: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  viseur: { width: 260, height: 260, borderRadius: 24, borderWidth: 4, borderColor: COULEURS.blanc },
  bas: { position: "absolute", left: 16, right: 16, bottom: 48, gap: 12 },
  consigne: { color: COULEURS.blanc, fontSize: 20, fontWeight: "800", textAlign: "center" },
});
