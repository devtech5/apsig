import { useState } from "react";
import { router } from "expo-router";
import { Text, TextInput, View } from "react-native";
import * as Device from "expo-device";
import { Bouton, Carte, Ecran, Erreur, styles, Texte } from "@/components/ui";
import { appel } from "@/lib/api";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";
import { parler } from "@/lib/voix";

const AIDE =
  "Tapez votre numéro de téléphone, puis le code à 8 chiffres que vous a remis APSIG. Touchez ensuite le bouton Activer.";

export default function Activation() {
  const { ouvrirAbonne } = useSession();
  const [telephone, setTelephone] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function activer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const appareil = [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || undefined;
      const r = await appel<{ jeton: string; prenom: string }>("/client/activation", { corps: { telephone, code, ...(appareil && { appareil }) } });
      await ouvrirAbonne(r.jeton, r.prenom);
      router.replace("/abonne");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Ecran>
      <Carte>
        <Texte>Votre conseiller APSIG vous a remis un code à 8 chiffres. Il relie ce téléphone à votre foyer.</Texte>
        <Bouton secondaire icone="volume-high" libelle="Écouter" onPress={() => parler(AIDE)} />
      </Carte>
      <View style={{ gap: 6 }}>
        <Text style={styles.libelle}>Votre numéro de téléphone</Text>
        <TextInput
          value={telephone}
          onChangeText={setTelephone}
          placeholder="07 00 00 00 00"
          placeholderTextColor={COULEURS.attenue}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          style={styles.champ}
          accessibilityLabel="Votre numéro de téléphone"
        />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.libelle}>Code APSIG (8 chiffres)</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 8))}
          placeholder="12345678"
          placeholderTextColor={COULEURS.attenue}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          style={[styles.champ, { letterSpacing: 6, fontWeight: "800" }]}
          accessibilityLabel="Code APSIG à 8 chiffres"
        />
      </View>
      <Erreur message={erreur} />
      <Bouton grand icone="check-circle" libelle="Activer" chargement={envoi} desactive={code.length !== 8 || telephone.replace(/\D/g, "").length < 8} onPress={() => void activer()} />
      <Texte attenue style={{ textAlign: "center" }}>
        Pas de code ? Demandez-le à votre conseiller APSIG.
      </Texte>
    </Ecran>
  );
}
