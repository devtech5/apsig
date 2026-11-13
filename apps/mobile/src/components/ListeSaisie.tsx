import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { styles as ui } from "@/components/ui";
import { COULEURS } from "@/lib/theme";

// Même clé que @apsig/domain (cleLieu) : accents, casse et tirets ne comptent pas.
export const cle = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

// Liste déroulante avec saisie libre : on tape, les noms connus s'affichent ; un nom absent est gardé tel quel
// et sera ajouté au référentiel par l'API.
export function ListeSaisie({
  libelle,
  valeur,
  options,
  onChange,
  placeholder = "Choisir ou saisir",
  ajout = "il sera ajouté",
}: {
  libelle: string;
  valeur: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  ajout?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const recherche = cle(valeur);
  const proposes = options.filter((o) => !recherche || cle(o).includes(recherche)).slice(0, 8);
  const nouveau = valeur.trim() !== "" && !options.some((o) => cle(o) === recherche);

  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={ui.libelle}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={(t) => {
          onChange(t);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        placeholder={placeholder}
        placeholderTextColor={COULEURS.attenue}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={80}
        style={[ui.champ, { fontSize: 17 }]}
        accessibilityLabel={libelle}
      />
      {ouvert && proposes.length > 0 && (
        <View style={styles.liste}>
          {proposes.map((o) => (
            <Pressable
              key={o}
              onPress={() => {
                onChange(o);
                setOuvert(false);
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: COULEURS.brandClair }]}
              accessibilityRole="button"
            >
              <Text style={styles.optionTexte}>{o}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {nouveau && <Text style={styles.aide}>Absent de la liste : {ajout}.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  liste: { borderWidth: 1, borderColor: COULEURS.ligne, borderRadius: 12, backgroundColor: COULEURS.blanc, overflow: "hidden" },
  option: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COULEURS.ligne },
  optionTexte: { fontSize: 16, color: COULEURS.encre },
  aide: { fontSize: 13, color: COULEURS.attenue },
});
