import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Bouton, Carte, Chargement, Ecran, Erreur, Icone, Texte, type NomIcone } from "@/components/ui";
import { confirmer } from "@/lib/confirmer";
import { appelPersonnel } from "@/lib/personnel";
import { itineraire, type Mission } from "@/lib/terrain";
import { COULEURS, URGENCE_VISUEL } from "@/lib/theme";
import { LIBELLES_STATUT, STATUTS_OUVERTS } from "@/lib/types";

const RAFRAICHIR_MS = 10_000;
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function MissionTerrain() {
  const { numero } = useLocalSearchParams<{ numero: string }>();
  const [m, setM] = useState<Mission | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      setM(await appelPersonnel<Mission>(`/terrain/missions/${numero}`));
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [numero]);

  useEffect(() => {
    void charger();
    const t = setInterval(() => void charger(), RAFRAICHIR_MS);
    return () => clearInterval(t);
  }, [charger]);

  async function etape(e: "EN_ROUTE" | "SUR_PLACE" | "TERMINEE") {
    setEnvoi(true);
    setErreur(null);
    try {
      setM(await appelPersonnel<Mission>(`/terrain/missions/${numero}/etape`, { corps: { etape: e } }));
    } catch (x) {
      setErreur((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!m) return erreur ? <Ecran><Erreur message={erreur} /></Ecran> : <Chargement />;
  const v = URGENCE_VISUEL[m.type];
  const ouverte = STATUTS_OUVERTS.includes(m.statut) && !m.termineeLe;
  // Le point d'intervention : adresse du foyer (QR fixe) ou dernière position du témoin.
  const cible = m.position ?? m.temoin.position;
  return (
    <Ecran>
      <Stack.Screen options={{ title: m.numero }} />
      <View style={[styles.bandeau, { backgroundColor: v.couleur }]}>
        <Icone nom={v.icone as NomIcone} taille={40} couleur={COULEURS.blanc} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bandeauTitre}>{m.urgence}</Text>
          <Text style={styles.bandeauTexte}>
            Alerte de {heure(m.creeLe)} · {LIBELLES_STATUT[m.statut]}
          </Text>
        </View>
      </View>

      <Carte>
        {m.lieu ? (
          <>
            <Texte gras>{m.lieu.libelle}</Texte>
            <Texte>
              {m.lieu.quartier}, {m.lieu.ville}
              {m.lieu.adresse ? ` · ${m.lieu.adresse}` : ""}
            </Texte>
            <Texte attenue>{m.lieu.adresseVerifiee ? "Adresse vérifiée à la pose du QR" : "Adresse non vérifiée"}</Texte>
          </>
        ) : (
          <Texte gras>
            {m.support.libelle} {m.support.code} : position du témoin
          </Texte>
        )}
        {m.personne && (
          <Texte>
            Personne concernée : {m.personne.prenom} {m.personne.nom}
            {m.personne.anneeNaissance ? `, née ou né en ${m.personne.anneeNaissance}` : ""}
          </Texte>
        )}
        {cible ? (
          <Bouton icone="navigation-variant" libelle="Itinéraire" onPress={() => itineraire(cible)} />
        ) : (
          <Texte style={{ color: COULEURS.danger, fontWeight: "700" }}>Position inconnue : la centrale vous guide par téléphone.</Texte>
        )}
        {m.temoin.telephone && <Bouton secondaire icone="phone" libelle={`Appeler ${m.temoin.telephone}`} onPress={() => void Linking.openURL(`tel:${m.temoin.telephone!.replace(/[^\d+]/g, "")}`)} />}
      </Carte>

      <Erreur message={erreur} />
      {ouverte ? (
        <View style={{ gap: 10 }}>
          {(m.statut === "NOUVELLE" || m.statut === "PRISE_EN_CHARGE") && <Bouton grand icone="car-emergency" couleur={COULEURS.brand} libelle="En route" chargement={envoi} onPress={() => void etape("EN_ROUTE")} />}
          {m.statut !== "SUR_PLACE" && <Bouton grand icone="map-marker-check" couleur={COULEURS.danger} libelle="Sur place" chargement={envoi} onPress={() => void etape("SUR_PLACE")} />}
          {m.statut === "SUR_PLACE" && (
            <Bouton
              grand
              icone="flag-checkered"
              couleur={COULEURS.succes}
              libelle="Mission terminée"
              chargement={envoi}
              onPress={() => confirmer("Mission terminée ?", "L'unité redevient disponible ; la centrale clôture l'alerte.", () => void etape("TERMINEE"), "Terminer")}
            />
          )}
        </View>
      ) : (
        <Carte style={{ backgroundColor: COULEURS.succesFond }}>
          <Texte gras>{m.termineeLe ? `Mission terminée à ${heure(m.termineeLe)}.` : LIBELLES_STATUT[m.statut]}</Texte>
        </Carte>
      )}

      <Carte>
        <Texte gras>Fil de l'alerte</Texte>
        {m.journal.map((j) => (
          <Texte key={j.le + j.texte} attenue>
            {heure(j.le)} · {j.texte}
          </Texte>
        ))}
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  bandeau: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, padding: 16 },
  bandeauTitre: { color: COULEURS.blanc, fontSize: 20, fontWeight: "900" },
  bandeauTexte: { color: COULEURS.blanc, fontSize: 15 },
});
