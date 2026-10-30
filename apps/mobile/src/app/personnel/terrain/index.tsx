import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EtatLocalisation } from "@/components/Urgences";
import { Bouton, Carte, Chargement, Ecran, Erreur, Icone, Texte, type NomIcone } from "@/components/ui";
import { confirmer } from "@/lib/confirmer";
import { jetonNotifications } from "@/lib/notifications";
import { appelPersonnel } from "@/lib/personnel";
import { usePosition, type PositionPrecise } from "@/lib/position";
import { useSession } from "@/lib/session";
import type { EspaceTerrain } from "@/lib/terrain";
import { COULEURS, URGENCE_VISUEL } from "@/lib/theme";
import { LIBELLES_STATUT } from "@/lib/types";

const RAFRAICHIR_MS = 15_000;
// La centrale voit l'unité sur sa carte : une position toutes les 30 s suffit à suivre un véhicule.
const POSITION_MS = 30_000;

export default function Terrain() {
  const { fermer } = useSession();
  const [e, setE] = useState<EspaceTerrain | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const enService = !!e?.unite && e.unite.statut !== "HORS_SERVICE";
  const localisation = usePosition(enService);
  const derniere = useRef(0);

  const charger = useCallback(async () => {
    try {
      setE(await appelPersonnel<EspaceTerrain>("/terrain"));
      setErreur(null);
    } catch (x) {
      setErreur((x as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
      const t = setInterval(() => void charger(), RAFRAICHIR_MS);
      return () => clearInterval(t);
    }, [charger]),
  );

  // Nouvelles missions annoncées par notification.
  useEffect(() => {
    void jetonNotifications()
      .then((jetonPush) => jetonPush && appelPersonnel("/terrain/notifications", { methode: "PUT", corps: { jetonPush } }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const p: PositionPrecise | null = localisation.position;
    if (!enService || !p || Date.now() - derniere.current < POSITION_MS) return;
    derniere.current = Date.now();
    void appelPersonnel("/terrain/position", { corps: p }).catch(() => (derniere.current = 0));
  }, [enService, localisation.position]);

  async function disponibilite(statut: "DISPONIBLE" | "HORS_SERVICE") {
    setEnvoi(true);
    try {
      setE(await appelPersonnel<EspaceTerrain>("/terrain/disponibilite", { corps: { statut } }));
    } catch (x) {
      setErreur((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!e) return erreur ? <Ecran><Erreur message={erreur} /></Ecran> : <Chargement />;
  if (!e.unite) {
    return (
      <Ecran>
        <Texte>Vous n'êtes rattaché à aucune unité. Demandez à votre administrateur APSIG de vous ajouter à la vôtre.</Texte>
        <Bouton secondaire icone="logout" libelle="Se déconnecter" onPress={() => void fermer().then(() => router.replace("/"))} />
      </Ecran>
    );
  }
  const u = e.unite;
  return (
    <Ecran>
      <Carte>
        <Text style={styles.titre}>{u.nom}</Text>
        <Texte attenue>{u.libelleType}</Texte>
        <View style={[styles.statut, { backgroundColor: u.statut === "HORS_SERVICE" ? COULEURS.ligne : u.statut === "EN_MISSION" ? COULEURS.dangerFond : COULEURS.succesFond }]}>
          <Text style={{ fontWeight: "800", color: u.statut === "HORS_SERVICE" ? COULEURS.attenue : u.statut === "EN_MISSION" ? COULEURS.danger : COULEURS.succes }}>
            {u.statut === "HORS_SERVICE" ? "Hors service" : u.statut === "EN_MISSION" ? "En mission" : "Disponible"}
          </Text>
        </View>
        {u.statut === "HORS_SERVICE" ? (
          <Bouton icone="play-circle" couleur={COULEURS.succes} libelle="Prendre mon service" chargement={envoi} onPress={() => void disponibilite("DISPONIBLE")} />
        ) : (
          u.statut === "DISPONIBLE" && <Bouton secondaire icone="pause-circle" couleur={COULEURS.attenue} libelle="Fin de service" chargement={envoi} onPress={() => void disponibilite("HORS_SERVICE")} />
        )}
      </Carte>
      {enService && <EtatLocalisation etat={localisation.etat} precisionM={localisation.position?.precisionM} />}
      <Erreur message={erreur} />

      <Text style={styles.titre}>Missions</Text>
      {e.missions.length === 0 && <Texte attenue>Aucune mission. La centrale vous en confiera une ici, avec une notification.</Texte>}
      {e.missions.map((m) => {
        const v = URGENCE_VISUEL[m.type];
        return (
          <Pressable key={m.numero} accessibilityRole="button" onPress={() => router.push({ pathname: "/personnel/terrain/[numero]", params: { numero: m.numero } })} style={[styles.mission, { borderColor: v.couleur }]}>
            <View style={[styles.icone, { backgroundColor: v.couleur }]}>
              <Icone nom={v.icone as NomIcone} taille={28} couleur={COULEURS.blanc} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.missionTitre}>
                {m.urgence} · {m.numero}
              </Text>
              <Texte attenue>{m.lieu ? `${m.lieu.quartier}, ${m.lieu.ville}` : `${m.support.libelle} ${m.support.code}`}</Texte>
              <Text style={{ color: COULEURS.danger, fontWeight: "700" }}>{LIBELLES_STATUT[m.statut]}</Text>
            </View>
            <Icone nom="chevron-right" couleur={COULEURS.attenue} />
          </Pressable>
        );
      })}
      <Bouton secondaire couleur={COULEURS.attenue} icone="logout" libelle="Se déconnecter" onPress={() => confirmer("Se déconnecter ?", "Vous ne recevrez plus les missions sur ce téléphone.", () => void fermer().then(() => router.replace("/")))} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 20, fontWeight: "900", color: COULEURS.encre },
  statut: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  mission: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COULEURS.blanc, borderRadius: 16, padding: 12, borderWidth: 2 },
  icone: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  missionTitre: { fontSize: 17, fontWeight: "800", color: COULEURS.encre },
});
