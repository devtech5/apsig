import { Pressable, StyleSheet, Text, View } from "react-native";
import type { EtatPosition } from "@/lib/position";
import { COULEURS, URGENCE_VISUEL } from "@/lib/theme";
import type { Urgence } from "@/lib/types";
import { parler } from "@/lib/voix";
import { Icone, type NomIcone } from "./ui";

// Gros boutons colorés avec pictogramme ; le haut-parleur lit le bouton à voix haute avant de choisir.
export function ListeUrgences({ urgences, onChoisir, desactive }: { urgences: Urgence[]; onChoisir: (u: Urgence) => void; desactive?: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      {urgences.map((u) => {
        const v = URGENCE_VISUEL[u.type];
        return (
          <View key={u.type} style={styles.ligne}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${u.bouton}. ${u.description}`}
              disabled={desactive}
              onPress={() => onChoisir(u)}
              style={({ pressed }) => [styles.bouton, { backgroundColor: v.couleur }, pressed && { transform: [{ scale: 0.98 }] }, desactive && { opacity: 0.5 }]}
            >
              <Icone nom={v.icone as NomIcone} taille={40} couleur={COULEURS.blanc} />
              <View style={{ flex: 1 }}>
                <Text style={styles.titre}>{v.court}</Text>
                <Text style={styles.description}>{u.description}</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Écouter : ${u.bouton}`} onPress={() => parler(`${u.bouton}. ${u.description}`)} style={styles.ecouter}>
              <Icone nom="volume-high" taille={26} couleur={COULEURS.brand} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const ETATS: Record<EtatPosition, { texte: string; couleur: string; fond: string; icone: string }> = {
  demande: { texte: "Recherche de votre position…", couleur: COULEURS.attenue, fond: COULEURS.blanc, icone: "crosshairs" },
  ok: { texte: "Position prête à être envoyée", couleur: COULEURS.succes, fond: COULEURS.succesFond, icone: "crosshairs-gps" },
  refusee: { texte: "Position bloquée", couleur: COULEURS.danger, fond: COULEURS.dangerFond, icone: "map-marker-off" },
  indisponible: { texte: "Localisation éteinte ou sans signal", couleur: COULEURS.alerteEncre, fond: COULEURS.alerteFond, icone: "map-marker-question" },
  impossible: { texte: "Position impossible sur ce téléphone", couleur: COULEURS.danger, fond: COULEURS.dangerFond, icone: "map-marker-off" },
};

export function EtatLocalisation({ etat, precisionM }: { etat: EtatPosition; precisionM?: number | undefined }) {
  const e = ETATS[etat];
  return (
    <View style={[styles.etat, { backgroundColor: e.fond }]}>
      <Icone nom={e.icone as NomIcone} taille={20} couleur={e.couleur} />
      <Text style={{ color: e.couleur, fontWeight: "700", flex: 1 }}>
        {e.texte}
        {etat === "ok" && precisionM != null && ` (à ${Math.round(precisionM)} m près)`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  bouton: { flex: 1, minHeight: 84, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  titre: { color: COULEURS.blanc, fontSize: 21, fontWeight: "900" },
  description: { color: COULEURS.blanc, fontSize: 14, opacity: 0.92 },
  ecouter: { width: 56, borderRadius: 18, backgroundColor: COULEURS.blanc, alignItems: "center", justifyContent: "center" },
  etat: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
});
