import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Bouton, Ecran, Icone, NumerosSecours, Texte } from "@/components/ui";
import { COULEURS } from "@/lib/theme";

export default function Bienvenue() {
  return (
    <Ecran style={{ paddingTop: 64 }}>
      <View style={styles.marque}>
        <View style={styles.logo}>
          <Icone nom="shield-home" taille={48} couleur={COULEURS.blanc} />
        </View>
        <Text style={styles.nom}>APSIG</Text>
        <Text style={styles.slogan}>CODE-SECOURS CI</Text>
      </View>
      <Texte style={{ textAlign: "center" }}>Un geste pour prévenir la centrale APSIG, votre famille et les secours.</Texte>

      <Bouton grand icone="key-variant" libelle="J'ai un code APSIG" onPress={() => router.push("/activation")} />
      <Bouton grand icone="qrcode-scan" couleur={COULEURS.danger} libelle="Scanner un QR code" onPress={() => router.push("/scanner")} />
      <Texte attenue style={{ textAlign: "center" }}>
        Témoin d'une urgence devant un QR APSIG ? Scannez-le : pas besoin de compte.
      </Texte>

      <NumerosSecours titre="Urgence sans internet : appelez directement" />

      <Bouton secondaire icone="badge-account" libelle="Personnel APSIG" onPress={() => router.push("/connexion")} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  marque: { alignItems: "center", gap: 6 },
  logo: { width: 88, height: 88, borderRadius: 24, backgroundColor: COULEURS.brand, alignItems: "center", justifyContent: "center" },
  nom: { fontSize: 34, fontWeight: "900", color: COULEURS.brand, letterSpacing: 2 },
  slogan: { fontSize: 14, fontWeight: "800", color: COULEURS.danger, letterSpacing: 3 },
});
