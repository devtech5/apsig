import { useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Bouton, Icone, Texte } from "@/components/ui";
import { COULEURS } from "@/lib/theme";

// Taille de photo visée : assez pour lire la plaque, assez légère pour le réseau mobile (l'API accepte 3 Mo par photo).
const LARGEUR_MAX = 1600;

// Choisit, parmi les tailles proposées par la caméra (« 1920x1080 »…), la plus grande qui reste sous LARGEUR_MAX.
function tailleAdaptee(tailles: string[]) {
  const lues = tailles
    .map((t) => ({ t, l: Math.max(...t.split("x").map(Number)) }))
    .filter((x) => Number.isFinite(x.l))
    .sort((a, b) => b.l - a.l);
  return (lues.find((x) => x.l <= LARGEUR_MAX) ?? lues[lues.length - 1])?.t;
}

// Photo prise avec l'appareil du téléphone, renvoyée en data URL JPEG pour l'API.
export function PrisePhoto({ libelle, valeur, onChange }: { libelle: string; valeur: string | null; onChange: (v: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [permission, demander] = useCameraPermissions();
  const [taille, setTaille] = useState<string | undefined>();
  const [prise, setPrise] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const camera = useRef<CameraView>(null);

  async function ouvrir() {
    setErreur(null);
    if (!permission?.granted) {
      const r = await demander();
      if (!r.granted) return setErreur("Autorisez la caméra dans les réglages du téléphone, rubrique APSIG.");
    }
    setOuvert(true);
  }

  async function declencher() {
    if (!camera.current || prise) return;
    setPrise(true);
    try {
      const p = await camera.current.takePictureAsync({ quality: 0.5, base64: true });
      if (!p?.base64) throw new Error();
      onChange(`data:image/jpeg;base64,${p.base64}`);
      setOuvert(false);
    } catch {
      setErreur("Photo impossible : réessayez.");
    } finally {
      setPrise(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.libelle}>{libelle}</Text>
      {valeur && <Image source={{ uri: valeur }} style={styles.apercu} resizeMode="cover" accessibilityLabel={libelle} />}
      <Bouton secondaire icone={valeur ? "camera-retake" : "camera"} libelle={valeur ? "Reprendre la photo" : "Prendre la photo"} onPress={() => void ouvrir()} />
      {erreur && <Texte attenue>{erreur}</Texte>}
      <Modal visible={ouvert} animationType="slide" onRequestClose={() => setOuvert(false)}>
        <View style={styles.ecran}>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            pictureSize={taille}
            onCameraReady={() => {
              void camera.current
                ?.getAvailablePictureSizesAsync()
                .then((t) => setTaille(tailleAdaptee(t)))
                .catch(() => undefined);
            }}
          />
          <View style={styles.barre}>
            <Pressable onPress={() => setOuvert(false)} style={styles.rond} accessibilityRole="button" accessibilityLabel="Fermer">
              <Icone nom="close" couleur={COULEURS.blanc} taille={28} />
            </Pressable>
            <Pressable onPress={() => void declencher()} disabled={prise} style={[styles.declencheur, prise && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Prendre la photo" />
            <View style={styles.rond} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  libelle: { fontSize: 15, fontWeight: "700", color: COULEURS.encre },
  apercu: { width: "100%", height: 200, borderRadius: 12, backgroundColor: COULEURS.ligne },
  ecran: { flex: 1, backgroundColor: "#000" },
  barre: { position: "absolute", left: 0, right: 0, bottom: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  rond: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  declencheur: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: COULEURS.blanc, backgroundColor: "rgba(255,255,255,0.3)" },
});
