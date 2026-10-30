import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EtatLocalisation, ListeUrgences } from "@/components/Urgences";
import { Ecran, Erreur, Icone, NumerosSecours, Texte } from "@/components/ui";
import { PROBLEME_DE, usePosition } from "@/lib/position";
import { useAbonne } from "@/lib/session";
import { COULEURS } from "@/lib/theme";
import { STATUTS_OUVERTS, URGENCES_APPLI, type AlerteFoyer, type EspaceAbonne, type SuiviAlerte, type Urgence } from "@/lib/types";

export default function Sos() {
  const { prenom, appeler } = useAbonne();
  // La position est demandée dès l'ouverture : elle part avec l'alerte, sans attendre.
  const localisation = usePosition(true);
  const [espace, setEspace] = useState<EspaceAbonne | null>(null);
  const [enCours, setEnCours] = useState<AlerteFoyer | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void appeler<EspaceAbonne>("/client/moi").then(setEspace, () => undefined);
      void appeler<AlerteFoyer[]>("/client/alertes").then((l) => setEnCours(l.find((a) => a.parMoi && STATUTS_OUVERTS.includes(a.statut)) ?? null), () => undefined);
    }, [appeler]),
  );

  async function declencher(u: Urgence) {
    setEnvoi(true);
    setErreur(null);
    try {
      const { position, etat } = localisation;
      const probleme = PROBLEME_DE[etat];
      const r = await appeler<SuiviAlerte & { cleTemoin: string }>("/client/sos", {
        corps: { type: u.type, ...(position ? { position } : probleme ? { problemePosition: probleme } : {}) },
      });
      router.push({ pathname: "/suivi/[numero]", params: { numero: r.numero, cle: r.cleTemoin, nouvelle: "1" } });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  const expire = espace?.abonnement && ["EXPIRE", "RESILIE"].includes(espace.abonnement.etat);
  return (
    <Ecran>
      <Text style={styles.bonjour}>Bonjour {prenom}</Text>
      {enCours && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/suivi/[numero]", params: { numero: enCours.numero, ...(enCours.cleTemoin && { cle: enCours.cleTemoin }) } })}
          style={styles.enCours}
        >
          <Icone nom="alarm-light" taille={28} couleur={COULEURS.blanc} />
          <View style={{ flex: 1 }}>
            <Text style={styles.enCoursTitre}>Alerte en cours · {enCours.numero}</Text>
            <Text style={styles.enCoursTexte}>Touchez pour la suivre</Text>
          </View>
          <Icone nom="chevron-right" taille={28} couleur={COULEURS.blanc} />
        </Pressable>
      )}
      <Texte gras>Que se passe-t-il ? Touchez le bouton : la centrale APSIG est prévenue tout de suite.</Texte>
      <EtatLocalisation etat={localisation.etat} precisionM={localisation.position?.precisionM} />
      {expire && <Texte style={styles.expire}>Votre abonnement a expiré : vos alertes sont quand même traitées. Pensez à le renouveler.</Texte>}
      <Erreur message={erreur} />
      <ListeUrgences urgences={espace?.urgences ?? URGENCES_APPLI} onChoisir={(u) => void declencher(u)} desactive={envoi} />
      <NumerosSecours />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  bonjour: { fontSize: 26, fontWeight: "900", color: COULEURS.encre },
  enCours: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COULEURS.danger, borderRadius: 18, padding: 14 },
  enCoursTitre: { color: COULEURS.blanc, fontSize: 18, fontWeight: "900" },
  enCoursTexte: { color: COULEURS.blanc, fontSize: 14 },
  expire: { backgroundColor: COULEURS.alerteFond, color: COULEURS.alerteEncre, borderRadius: 12, padding: 12, fontWeight: "600" },
});
