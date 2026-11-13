import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Bouton, Carte, Ecran, Erreur, Icone, Texte } from "@/components/ui";
import { confirmer } from "@/lib/confirmer";
import { appelPersonnel } from "@/lib/personnel";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

export type Recense = {
  id: string;
  code: string | null;
  qr: { plaque: string | null; interieur: { code: string; url: string } | null };
  rccm: string | null;
  client: string;
  telephone: string | null;
  telephone2: string | null;
  lieu: string;
  cible: "PARTICULIER" | "FAMILLE" | "ENTREPRISE" | null;
  paye: boolean;
  posee: boolean;
  creeLe: string;
};

// Étape 1 de l'inscription : les clients recensés par l'agent, avec leur code Code-Secours.
export default function Recensements() {
  const { session, fermer } = useSession();
  // Le recenseur n'a que cet écran : il s'y déconnecte. Les autres reviennent à leur accueil.
  const seulEspace = session?.type === "personnel" && !session.compte.espaces.includes("pose");
  const [liste, setListe] = useState<Recense[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void appelPersonnel<Recense[]>("/pose/recensements").then(setListe, (e: Error) => setErreur(e.message));
    }, []),
  );

  return (
    <Ecran>
      <Bouton grand icone="account-plus" libelle="Recenser un client" onPress={() => router.push("/personnel/recensement/nouveau")} />
      <Texte attenue>Le code Code-Secours et les QR sont générés à la validation : notez le code au client. La plaque qui le porte sera posée lors du second passage.</Texte>
      <Erreur message={erreur} />
      {liste && (
        <Carte>
          <Text style={styles.titre}>Mes clients recensés ({liste.length})</Text>
          {liste.length === 0 && <Texte attenue>Aucun client recensé pour l'instant.</Texte>}
          {liste.map((r) => (
            <View key={r.id} style={styles.ligne}>
              <Icone nom={r.posee ? "check-circle" : "home-clock"} couleur={r.posee ? COULEURS.succes : COULEURS.brand} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.code}>{r.code ?? "Code en attente"}</Text>
                <Texte gras>{r.client}</Texte>
                <Texte attenue>
                  {r.lieu}
                  {r.telephone ? ` · ${r.telephone}` : ""}
                  {r.telephone2 ? ` / ${r.telephone2}` : ""}
                  {r.rccm ? ` · RCCM ${r.rccm}` : ""}
                </Texte>
                <View style={styles.etiquettes}>
                  <Text style={[styles.etiquette, r.paye ? styles.ok : styles.attente]}>{r.paye ? "Payé" : "Non payé"}</Text>
                  <Text style={[styles.etiquette, r.posee ? styles.ok : styles.attente]}>{r.posee ? "Plaque posée" : "Plaque à poser"}</Text>
                </View>
              </View>
            </View>
          ))}
        </Carte>
      )}
      {seulEspace && (
        <Bouton
          secondaire
          couleur={COULEURS.attenue}
          icone="logout"
          libelle="Se déconnecter"
          onPress={() => confirmer("Se déconnecter ?", "Il faudra saisir à nouveau votre téléphone et votre mot de passe.", () => void fermer().then(() => router.replace("/")))}
        />
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 17, fontWeight: "800", color: COULEURS.encre },
  ligne: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 8, borderTopWidth: 1, borderTopColor: COULEURS.ligne },
  code: { fontSize: 17, fontWeight: "900", color: COULEURS.brand, letterSpacing: 1 },
  etiquettes: { flexDirection: "row", gap: 6, marginTop: 2 },
  etiquette: { fontSize: 13, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  ok: { backgroundColor: COULEURS.succesFond, color: COULEURS.succes },
  attente: { backgroundColor: COULEURS.alerteFond, color: COULEURS.alerteEncre },
});
