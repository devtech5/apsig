import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Bouton, Carte, Ecran, Erreur, Icone, Texte, styles as ui } from "@/components/ui";
import { confirmer } from "@/lib/confirmer";
import { appelPersonnel } from "@/lib/personnel";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

// Clients à équiper dans les zones du poseur (communes ou villes entières).
type APoser = {
  zones: { ville: string; commune: string | null }[];
  clients: {
    code: string;
    client: string;
    telephone: string | null;
    foyer: { adresse: string | null; quartier: string; commune: string | null; ville: string };
    recenseur: string | null;
    paye: boolean;
  }[];
};

// Tournée de l'agent de pose : il scanne le QR une fois fixé, le GPS relevé vérifie l'adresse du foyer.
export default function Pose() {
  const { fermer } = useSession();
  const [liste, setListe] = useState<APoser | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useFocusEffect(
    useCallback(() => {
      void appelPersonnel<APoser>("/pose/a-poser").then(setListe, (e: Error) => setErreur(e.message));
    }, []),
  );

  return (
    <Ecran>
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
          <Text style={styles.titre}>Clients à équiper ({liste.clients.length})</Text>
          {liste.zones.length > 0 && (
            <Texte attenue>Vos zones : {liste.zones.map((z) => (z.commune ? `${z.commune} (${z.ville})` : z.ville)).join(", ")}</Texte>
          )}
          {liste.clients.length === 0 && <Texte attenue>Aucune plaque à poser dans vos zones pour l'instant.</Texte>}
          {liste.clients.map((c) => (
            <Pressable
              key={c.code}
              onPress={() => router.push({ pathname: "/personnel/pose/plaque/[code]", params: { code: c.code } })}
              style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: COULEURS.brandClair }]}
              accessibilityRole="button"
            >
              <Icone nom={c.paye ? "check-circle" : "alert-circle"} couleur={c.paye ? COULEURS.succes : COULEURS.alerteEncre} />
              <View style={{ flex: 1, gap: 2 }}>
                <Texte gras>{c.code}</Texte>
                <Texte>
                  {c.client}
                  {c.telephone ? ` · ${c.telephone}` : ""}
                </Texte>
                <Texte attenue>
                  {[c.foyer.quartier, c.foyer.commune, c.foyer.ville].filter(Boolean).join(", ")}
                  {c.foyer.adresse ? ` · ${c.foyer.adresse}` : ""}
                </Texte>
                {c.recenseur && <Texte attenue>Recensé par {c.recenseur}</Texte>}
              </View>
              <Icone nom="chevron-right" couleur={COULEURS.attenue} />
            </Pressable>
          ))}
        </Carte>
      )}
      <Bouton secondaire couleur={COULEURS.attenue} icone="logout" libelle="Se déconnecter" onPress={() => confirmer("Se déconnecter ?", "Il faudra saisir à nouveau votre identifiant et votre mot de passe.", () => void fermer().then(() => router.replace("/")))} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 17, fontWeight: "800", color: COULEURS.encre },
  ligne: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6, borderTopWidth: 1, borderTopColor: COULEURS.ligne },
});
