import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Bouton, Carte, Ecran, Erreur, Icone, Texte } from "@/components/ui";
import { confirmer } from "@/lib/confirmer";
import { appelPersonnel } from "@/lib/personnel";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

type APoser = { code: string; libelle: string; foyer: { libelle: string; adresse: string | null; quartier: string; ville: string } | null };

// Tournée de l'agent de pose : il scanne le QR une fois fixé, le GPS relevé vérifie l'adresse du foyer.
export default function Pose() {
  const { fermer } = useSession();
  const [liste, setListe] = useState<APoser[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void appelPersonnel<APoser[]>("/pose/a-poser").then(setListe, (e: Error) => setErreur(e.message));
    }, []),
  );

  return (
    <Ecran>
      <Bouton grand icone="qrcode-scan" libelle="Scanner le QR posé" onPress={() => router.push({ pathname: "/scanner", params: { mode: "pose" } })} />
      <Texte attenue>Fixez le QR, placez-vous devant, puis scannez-le : la position relevée devient l'adresse vérifiée du foyer.</Texte>
      <Erreur message={erreur} />
      {liste && (
        <Carte>
          <Text style={styles.titre}>À poser ({liste.length})</Text>
          {liste.length === 0 && <Texte attenue>Aucun QR en attente de pose.</Texte>}
          {liste.map((s) => (
            <View key={s.code} style={styles.ligne}>
              <Icone nom="qrcode" couleur={COULEURS.brand} />
              <View style={{ flex: 1 }}>
                <Texte gras>
                  {s.code} · {s.libelle}
                </Texte>
                {s.foyer && (
                  <Texte attenue>
                    {s.foyer.libelle} — {s.foyer.quartier}, {s.foyer.ville}
                    {s.foyer.adresse ? ` · ${s.foyer.adresse}` : ""}
                  </Texte>
                )}
              </View>
            </View>
          ))}
        </Carte>
      )}
      <Bouton secondaire couleur={COULEURS.attenue} icone="logout" libelle="Se déconnecter" onPress={() => confirmer("Se déconnecter ?", "Il faudra saisir à nouveau mot de passe et code.", () => void fermer().then(() => router.replace("/")))} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 17, fontWeight: "800", color: COULEURS.encre },
  ligne: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6, borderTopWidth: 1, borderTopColor: COULEURS.ligne },
});
