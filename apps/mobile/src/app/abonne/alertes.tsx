import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Chargement, Erreur, Icone, Texte, type NomIcone } from "@/components/ui";
import { useAbonne } from "@/lib/session";
import { COULEURS, ESPACE, URGENCE_VISUEL } from "@/lib/theme";
import { LIBELLES_STATUT, STATUTS_OUVERTS, type AlerteFoyer } from "@/lib/types";

const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Alertes du foyer sur 30 jours : QR scannés par un témoin, bracelets, SOS des membres.
export default function AlertesFoyer() {
  const { appeler } = useAbonne();
  const [alertes, setAlertes] = useState<AlerteFoyer[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    try {
      setAlertes(await appeler<AlerteFoyer[]>("/client/alertes"));
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [appeler]);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  if (!alertes && !erreur) return <Chargement />;
  return (
    <ScrollView
      style={{ backgroundColor: COULEURS.fond }}
      contentContainerStyle={{ padding: ESPACE, gap: 10 }}
      refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={() => (setRafraichit(true), void charger().finally(() => setRafraichit(false)))} />}
    >
      <Erreur message={erreur} />
      {alertes?.length === 0 && <Texte attenue>Aucune alerte depuis 30 jours. Vous serez prévenu ici dès qu'un QR de votre foyer est scanné.</Texte>}
      {alertes?.map((a) => {
        const v = URGENCE_VISUEL[a.type];
        const ouverte = STATUTS_OUVERTS.includes(a.statut);
        return (
          <Pressable
            key={a.numero}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/suivi/[numero]", params: { numero: a.numero, ...(a.cleTemoin && { cle: a.cleTemoin }) } })}
            style={[styles.ligne, ouverte && { borderColor: v.couleur }]}
          >
            <View style={[styles.icone, { backgroundColor: ouverte ? v.couleur : COULEURS.ligne }]}>
              <Icone nom={v.icone as NomIcone} taille={26} couleur={COULEURS.blanc} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>
                {v.court}
                {a.concerne ? ` · ${a.concerne}` : ""}
              </Text>
              <Text style={styles.detail}>
                {a.parMoi ? "Depuis votre téléphone" : `${a.support.libelle} ${a.support.code}`} · {quand(a.creeLe)}
              </Text>
              <Text style={[styles.statut, { color: ouverte ? COULEURS.danger : COULEURS.attenue }]}>{LIBELLES_STATUT[a.statut]}</Text>
            </View>
            <Icone nom="chevron-right" couleur={COULEURS.attenue} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COULEURS.blanc, borderRadius: 16, padding: 12, borderWidth: 2, borderColor: "transparent" },
  icone: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  titre: { fontSize: 17, fontWeight: "800", color: COULEURS.encre },
  detail: { fontSize: 14, color: COULEURS.attenue },
  statut: { fontSize: 14, fontWeight: "700", marginTop: 2 },
});
