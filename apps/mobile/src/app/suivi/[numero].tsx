import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { AideLocalisation } from "@/components/AideLocalisation";
import { EtatLocalisation } from "@/components/Urgences";
import { Bouton, Carte, Chargement, Ecran, Erreur, Icone, NumerosSecours, Texte, type NomIcone } from "@/components/ui";
import { appel, ErreurApi } from "@/lib/api";
import { confirmer } from "@/lib/confirmer";
import { PROBLEME_DE, usePosition, vautLaPeine, type PositionPrecise } from "@/lib/position";
import { useSession } from "@/lib/session";
import { COULEURS, URGENCE_VISUEL } from "@/lib/theme";
import { LIBELLES_STATUT, STATUTS_OUVERTS, type AlerteFoyer, type ProblemePosition, type StatutAlerte, type SuiviAlerte } from "@/lib/types";
import { parler } from "@/lib/voix";

const RAFRAICHIR_MS = 5_000;
const ETAPES: { statut: StatutAlerte; icone: NomIcone; date: "creeLe" | "priseEnChargeLe" | "surPlaceLe" | null }[] = [
  { statut: "NOUVELLE", icone: "bell-ring", date: "creeLe" },
  { statut: "PRISE_EN_CHARGE", icone: "headset", date: "priseEnChargeLe" },
  { statut: "EN_ROUTE", icone: "ambulance", date: null },
  { statut: "SUR_PLACE", icone: "map-marker-check", date: "surPlaceLe" },
];
const RANG: Record<StatutAlerte, number> = { NOUVELLE: 0, PRISE_EN_CHARGE: 1, EN_ROUTE: 2, SUR_PLACE: 3, CLOTUREE: 4, ANNULEE: 4 };
const heure = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");

type Alerte = SuiviAlerte & Partial<Pick<AlerteFoyer, "support" | "concerne" | "parMoi">>;

// Suivi d'une alerte. Avec la clé (celui qui a déclenché) : la position suit le téléphone et l'annulation
// est possible. Sans clé (un autre membre du foyer, après une notification) : lecture seule.
export default function Suivi() {
  const { numero, cle, nouvelle } = useLocalSearchParams<{ numero: string; cle?: string; nouvelle?: string }>();
  const { session, expiree } = useSession();
  const [alerte, setAlerte] = useState<Alerte | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annulation, setAnnulation] = useState(false);
  const ouverte = !alerte || STATUTS_OUVERTS.includes(alerte.statut);
  const localisation = usePosition(!!cle && ouverte);
  const derniere = useRef<{ position: PositionPrecise; le: number } | null>(null);
  const problemeSignale = useRef<ProblemePosition | null>(null);

  const jeton = session?.type === "abonne" ? session.jeton : null;
  const charger = useCallback(async () => {
    try {
      const a = cle
        ? await appel<SuiviAlerte>(`/public/alertes/${numero}?cle=${encodeURIComponent(cle)}`)
        : await appel<AlerteFoyer>(`/client/alertes/${numero}`, { jeton });
      setAlerte((avant) => {
        if (avant && avant.statut !== a.statut) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        return a;
      });
      setErreur(null);
    } catch (e) {
      if (!cle && e instanceof ErreurApi && e.statut === 401) await expiree();
      setErreur((e as Error).message);
    }
  }, [numero, cle, jeton, expiree]);

  useEffect(() => {
    void charger();
    if (nouvelle) parler("Alerte envoyée. La centrale APSIG est prévenue et va vous appeler. Restez près de votre téléphone.");
  }, [charger, nouvelle]);

  useEffect(() => {
    if (!ouverte) return;
    const t = setInterval(() => void charger(), RAFRAICHIR_MS);
    return () => clearInterval(t);
  }, [ouverte, charger]);

  // Position envoyée à chaque vrai déplacement ; refus ou GPS coupé signalés pour que la centrale rappelle.
  useEffect(() => {
    if (!cle || !ouverte) return;
    const p = localisation.position;
    const maintenant = Date.now();
    if (p && vautLaPeine(derniere.current, p, maintenant)) {
      derniere.current = { position: p, le: maintenant };
      problemeSignale.current = null;
      void appel(`/public/alertes/${numero}/position`, { corps: { cle, position: p } }).catch(() => (derniere.current = null));
      return;
    }
    const probleme = PROBLEME_DE[localisation.etat];
    if (!p && probleme && problemeSignale.current !== probleme) {
      problemeSignale.current = probleme;
      void appel(`/public/alertes/${numero}/position/probleme`, { corps: { cle, probleme } }).catch(() => (problemeSignale.current = null));
    }
  }, [cle, ouverte, numero, localisation.position, localisation.etat]);

  function annuler() {
    confirmer(
      "Annuler l'alerte ?",
      "Faites-le seulement si vous vous êtes trompé ou si le danger est passé.",
      () => {
        setAnnulation(true);
        void appel<SuiviAlerte>(`/public/alertes/${numero}/annuler`, { corps: { cle } })
          .then(setAlerte, (e: Error) => setErreur(e.message))
          .finally(() => setAnnulation(false));
      },
      "Oui, annuler",
    );
  }

  if (!alerte) {
    return erreur ? (
      <Ecran>
        <Erreur message={erreur} />
        <NumerosSecours />
      </Ecran>
    ) : (
      <Chargement texte="Connexion à la centrale…" />
    );
  }

  const v = URGENCE_VISUEL[alerte.type];
  const rang = RANG[alerte.statut];
  const probleme = cle && ouverte && (localisation.etat === "refusee" || localisation.etat === "indisponible" || localisation.etat === "impossible") ? localisation.etat : null;
  return (
    <Ecran>
      <Stack.Screen options={{ title: alerte.numero }} />
      <View style={[styles.bandeau, { backgroundColor: ouverte ? v.couleur : COULEURS.attenue }]}>
        <Icone nom={v.icone as NomIcone} taille={40} couleur={COULEURS.blanc} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bandeauTitre}>{alerte.urgence}</Text>
          <Text style={styles.bandeauTexte}>
            {alerte.concerne && !alerte.parMoi ? `${alerte.concerne} · ` : ""}
            {alerte.support ? `${alerte.support.libelle} · ` : ""}à {heure(alerte.creeLe)}
          </Text>
        </View>
      </View>

      {ouverte && cle && (
        <Carte style={{ backgroundColor: COULEURS.brand }}>
          <Text style={styles.consigne}>Restez près de votre téléphone : la centrale APSIG va vous appeler.</Text>
        </Carte>
      )}

      {probleme && <AideLocalisation probleme={probleme} onReessayer={() => void localisation.reessayer()} onReglages={localisation.ouvrirReglages} />}
      {cle && ouverte && !probleme && <EtatLocalisation etat={localisation.etat} precisionM={localisation.position?.precisionM} />}

      <Carte>
        {ETAPES.map((e) => {
          const fait = rang >= RANG[e.statut] && alerte.statut !== "ANNULEE";
          return (
            <View key={e.statut} style={styles.etape}>
              <View style={[styles.pastille, { backgroundColor: fait ? COULEURS.succes : COULEURS.ligne }]}>
                <Icone nom={e.icone} taille={22} couleur={COULEURS.blanc} />
              </View>
              <Text style={[styles.etapeTexte, !fait && { color: COULEURS.attenue }]}>{LIBELLES_STATUT[e.statut]}</Text>
              {fait && e.date && <Text style={styles.heure}>{heure(alerte[e.date])}</Text>}
            </View>
          );
        })}
        {!ouverte && (
          <Texte gras style={{ marginTop: 8 }}>
            {LIBELLES_STATUT[alerte.statut]} à {heure(alerte.clotureLe)}
          </Texte>
        )}
      </Carte>

      <Erreur message={erreur} />
      {cle && alerte.peutAnnuler && <Bouton secondaire couleur={COULEURS.danger} icone="close-circle" libelle="Je me suis trompé — Annuler" chargement={annulation} onPress={annuler} />}
      <NumerosSecours titre="Danger immédiat ? Appelez aussi" />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  bandeau: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, padding: 16 },
  bandeauTitre: { color: COULEURS.blanc, fontSize: 20, fontWeight: "900" },
  bandeauTexte: { color: COULEURS.blanc, fontSize: 15, opacity: 0.95 },
  consigne: { color: COULEURS.blanc, fontSize: 18, fontWeight: "800" },
  etape: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  pastille: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  etapeTexte: { flex: 1, fontSize: 16, fontWeight: "700", color: COULEURS.encre },
  heure: { fontSize: 15, color: COULEURS.attenue, fontVariant: ["tabular-nums"] },
});
