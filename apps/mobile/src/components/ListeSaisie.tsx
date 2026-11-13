import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icone, styles as ui } from "@/components/ui";
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
  const [filtrer, setFiltrer] = useState(false);
  const recherche = cle(valeur);
  // Liste complète à l'ouverture ; filtrée seulement quand on tape.
  const proposes = filtrer && recherche ? options.filter((o) => cle(o).includes(recherche)) : options;
  const nouveau = valeur.trim() !== "" && !options.some((o) => cle(o) === recherche);

  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={ui.libelle}>{libelle}</Text>
      <View>
      <TextInput
        value={valeur}
        onChangeText={(t) => {
          onChange(t);
          setFiltrer(true);
          setOuvert(true);
        }}
        onFocus={() => {
          setFiltrer(false);
          setOuvert(true);
        }}
        // Fermée en quittant le champ ; le délai laisse passer le toucher sur une option.
        onBlur={() => setTimeout(() => setOuvert(false), 200)}
        placeholder={placeholder}
        placeholderTextColor={COULEURS.attenue}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={80}
        style={[ui.champ, { fontSize: 17, paddingRight: 40 }]}
        accessibilityLabel={libelle}
      />
      <Pressable
        onPress={() => {
          setFiltrer(false);
          setOuvert((o) => !o);
        }}
        style={styles.fleche}
        accessibilityRole="button"
        accessibilityLabel={`Afficher la liste : ${libelle}`}
      >
        <Icone nom={ouvert ? "chevron-up" : "chevron-down"} couleur={COULEURS.attenue} />
      </Pressable>
      </View>
      {ouvert && proposes.length > 0 && (
        <ScrollView style={styles.liste} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {proposes.map((o) => (
            <Pressable
              key={o}
              onPress={() => {
                onChange(o);
                setOuvert(false);
                setFiltrer(false);
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: COULEURS.brandClair }]}
              accessibilityRole="button"
            >
              <Text style={styles.optionTexte}>{o}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {nouveau && <Text style={styles.aide}>Absent de la liste : {ajout}.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  liste: { maxHeight: 260, borderWidth: 1, borderColor: COULEURS.ligne, borderRadius: 12, backgroundColor: COULEURS.blanc },
  fleche: { position: "absolute", right: 4, top: 0, bottom: 0, width: 40, alignItems: "center", justifyContent: "center" },
  option: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COULEURS.ligne },
  optionTexte: { fontSize: 16, color: COULEURS.encre },
  aide: { fontSize: 13, color: COULEURS.attenue },
});
