import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Bouton, Carte, Ecran, Erreur, Icone, Texte, styles as ui } from "@/components/ui";
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
  const [code, setCode] = useState("");

  useFocusEffect(
    useCallback(() => {
      void appelPersonnel<APoser[]>("/pose/a-poser").then(setListe, (e: Error) => setErreur(e.message));
    }, []),
  );

  return (
    <Ecran>
      <Bouton grand icone="account-plus" couleur={COULEURS.succes} libelle="Recensement des clients" onPress={() => router.push("/personnel/recensement")} />
      <Carte>
        <Text style={styles.titre}>Pose de plaque</Text>
        <Texte attenue>Saisissez le code gravé sur la plaque (ou scannez son QR) : la pose conclut l'inscription du client.</Texte>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="DAL-LOBIA-053"
          placeholderTextColor={COULEURS.attenue}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[ui.champ, { fontSize: 20, fontWeight: "800", letterSpacing: 1 }]}
          accessibilityLabel="Code de la plaque"
        />
        <Bouton
          icone="magnify"
          libelle="Chercher la plaque"
          desactive={code.trim().length < 5}
          onPress={() => router.push({ pathname: "/personnel/pose/plaque/[code]", params: { code: code.trim().replace(/\s+/g, "") } })}
        />
        <Bouton secondaire icone="qrcode-scan" libelle="Scanner le QR de la plaque" onPress={() => router.push({ pathname: "/scanner", params: { mode: "pose" } })} />
      </Carte>
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
