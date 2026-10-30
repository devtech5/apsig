import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, type ColorValue, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SECOURS } from "@/lib/api";
import { COULEURS, ESPACE, RAYON } from "@/lib/theme";

export type NomIcone = ComponentProps<typeof MaterialCommunityIcons>["name"];
// Les onglets passent un ColorValue de React Native ; en pratique une chaîne, que les icônes acceptent.
type CouleurIcone = ComponentProps<typeof MaterialCommunityIcons>["color"];

export function Icone({ nom, taille = 24, couleur = COULEURS.encre }: { nom: NomIcone; taille?: number; couleur?: ColorValue }) {
  return <MaterialCommunityIcons name={nom} size={taille} color={couleur as CouleurIcone} />;
}

export function Ecran({ children, defiler = true, style }: { children: ReactNode; defiler?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={styles.ecran} edges={["bottom", "left", "right"]}>
      {defiler ? (
        <ScrollView contentContainerStyle={[styles.contenu, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.contenu, { flex: 1 }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Titre({ children }: { children: ReactNode }) {
  return <Text style={styles.titre}>{children}</Text>;
}

export function Texte({ children, attenue, gras, style }: { children: ReactNode; attenue?: boolean; gras?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.texte, attenue && { color: COULEURS.attenue }, gras && { fontWeight: "700" }, style]}>{children}</Text>;
}

export function Carte({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.carte, style]}>{children}</View>;
}

type PropsBouton = {
  libelle: string;
  onPress: () => void;
  icone?: NomIcone;
  couleur?: string;
  secondaire?: boolean;
  desactive?: boolean;
  chargement?: boolean;
  grand?: boolean;
};

export function Bouton({ libelle, onPress, icone, couleur = COULEURS.brand, secondaire, desactive, chargement, grand }: PropsBouton) {
  const texte = secondaire ? couleur : COULEURS.blanc;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      disabled={desactive || chargement}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bouton,
        grand && styles.boutonGrand,
        secondaire ? { backgroundColor: COULEURS.blanc, borderColor: couleur, borderWidth: 2 } : { backgroundColor: couleur },
        (desactive || chargement) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {chargement ? <ActivityIndicator color={texte} /> : icone && <Icone nom={icone} taille={grand ? 30 : 22} couleur={texte} />}
      <Text style={[styles.boutonTexte, grand && { fontSize: 20 }, { color: texte }]}>{libelle}</Text>
    </Pressable>
  );
}

export function Erreur({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.erreur}>
      <Icone nom="alert-circle" couleur={COULEURS.danger} />
      <Text style={styles.erreurTexte}>{message}</Text>
    </View>
  );
}

export function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <View style={styles.chargement}>
      <ActivityIndicator size="large" color={COULEURS.brand} />
      <Texte attenue>{texte}</Texte>
    </View>
  );
}

// Toujours visible : sans internet ou sans abonnement, les secours publics restent joignables.
export function NumerosSecours({ titre = "Sans internet, appelez directement" }: { titre?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Texte attenue>{titre}</Texte>
      <View style={styles.secours}>
        {SECOURS.map((s) => (
          <Pressable key={s.numero} accessibilityRole="button" accessibilityLabel={`Appeler ${s.nom}, ${s.numero}`} onPress={() => void Linking.openURL(`tel:${s.numero}`)} style={styles.secoursBouton}>
            <Icone nom="phone" taille={20} couleur={COULEURS.danger} />
            <Text style={styles.secoursNumero}>{s.numero}</Text>
            <Text style={styles.secoursNom}>{s.nom}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: COULEURS.fond },
  contenu: { padding: ESPACE, gap: ESPACE, paddingBottom: ESPACE * 2 },
  titre: { fontSize: 24, fontWeight: "900", color: COULEURS.encre },
  texte: { fontSize: 16, lineHeight: 22, color: COULEURS.encre },
  carte: { backgroundColor: COULEURS.blanc, borderRadius: RAYON, padding: ESPACE, gap: 8 },
  bouton: { minHeight: 52, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  boutonGrand: { minHeight: 72, borderRadius: RAYON },
  boutonTexte: { fontSize: 17, fontWeight: "800" },
  erreur: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: COULEURS.dangerFond, borderRadius: 12, padding: 12 },
  erreurTexte: { flex: 1, color: COULEURS.danger, fontSize: 15, fontWeight: "600" },
  chargement: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: ESPACE * 2 },
  secours: { flexDirection: "row", gap: 8 },
  secoursBouton: { flex: 1, alignItems: "center", backgroundColor: COULEURS.blanc, borderRadius: 14, paddingVertical: 10, borderWidth: 2, borderColor: COULEURS.dangerFond },
  secoursNumero: { fontSize: 22, fontWeight: "900", color: COULEURS.danger },
  secoursNom: { fontSize: 13, color: COULEURS.attenue, fontWeight: "600" },
  champ: { minHeight: 56, borderRadius: 14, borderWidth: 2, borderColor: COULEURS.ligne, backgroundColor: COULEURS.blanc, paddingHorizontal: 16, fontSize: 20, color: COULEURS.encre },
  libelle: { fontSize: 15, fontWeight: "700", color: COULEURS.encre },
});
