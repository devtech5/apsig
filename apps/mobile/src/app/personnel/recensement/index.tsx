import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { QrCode } from "@/components/QrCode";
import { Bouton, Carte, Ecran, Erreur, Icone, styles as ui, Texte } from "@/components/ui";
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
  encaisseFcfa: number;
  resteFcfa: number;
  posee: boolean;
  recenseur: string | null;
  creeLe: string;
};

const DELAI_RECHERCHE_MS = 300;
const TAILLE_QR = 140;

// Étape 1 de l'inscription : les clients recensés par l'agent, avec leur code Code-Secours.
export default function Recensements() {
  const { session, fermer } = useSession();
  // Le recenseur n'a que cet écran : il s'y déconnecte. Les autres reviennent à leur accueil.
  const seulEspace = session?.type === "personnel" && !session.compte.espaces.includes("pose");
  // Chef d'équipe : la liste couvre ses recenseurs, on affiche qui a recensé.
  const equipe = session?.type === "personnel" && session.compte.role !== "RECENSEUR";
  const [liste, setListe] = useState<Recense[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [version, setVersion] = useState(0);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  useEffect(() => {
    let annule = false;
    const t = setTimeout(() => {
      const recherche = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      void appelPersonnel<Recense[]>(`/pose/recensements${recherche}`).then(
        (r) => {
          if (annule) return;
          setListe(r);
          setErreur(null);
        },
        (e: Error) => !annule && setErreur(e.message),
      );
    }, DELAI_RECHERCHE_MS);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [q, version]);

  return (
    <Ecran>
      <Bouton grand icone="account-plus" libelle="Recenser un client" onPress={() => router.push("/personnel/recensement/nouveau")} />
      <Texte attenue>Le code Code-Secours et les QR sont générés à la validation : notez le code au client. La plaque qui le porte sera posée lors du second passage.</Texte>
      <Erreur message={erreur} />
      {liste && (
        <Carte>
          <Text style={styles.titre}>
            {equipe ? "Clients de l'équipe" : "Mes clients recensés"} ({liste.length})
          </Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Nom, code de plaque, téléphone…"
            autoCapitalize="none"
            autoCorrect={false}
            style={ui.champ}
            accessibilityLabel="Rechercher un client"
          />
          {liste.length === 0 && <Texte attenue>{q.trim() ? "Aucun client ne correspond à cette recherche." : "Aucun client recensé pour l'instant."}</Texte>}
          {liste.map((r) => (
            <LigneClient key={r.id} r={r} equipe={equipe} />
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

// Un client : son code de plaque (matricule), son état, et ses QR (plaque et intérieur) à montrer ou faire imprimer.
function LigneClient({ r, equipe }: { r: Recense; equipe: boolean }) {
  const [qr, setQr] = useState(false);
  return (
    <View style={styles.ligne}>
      <Icone nom={r.posee ? "check-circle" : "home-clock"} couleur={r.posee ? COULEURS.succes : COULEURS.brand} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.code}>{r.code ?? "Code en attente"}</Text>
        <Texte gras>{r.client}</Texte>
        <Texte attenue>
          {r.lieu}
          {r.telephone ? ` · ${r.telephone}` : ""}
          {r.telephone2 ? ` / ${r.telephone2}` : ""}
          {r.rccm ? ` · RCCM ${r.rccm}` : ""}
          {equipe && r.recenseur ? ` · recensé par ${r.recenseur}` : ""}
        </Texte>
        <View style={styles.etiquettes}>
          <Text style={[styles.etiquette, r.paye ? styles.ok : styles.attente]}>{r.paye ? "Payé" : r.encaisseFcfa > 0 ? `Acompte · reste ${r.resteFcfa.toLocaleString("fr-FR")} F` : "Non payé"}</Text>
          <Text style={[styles.etiquette, r.posee ? styles.ok : styles.attente]}>{r.posee ? "Plaque posée" : "Plaque à poser"}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: qr }} onPress={() => setQr((o) => !o)} style={styles.lienQr} hitSlop={8}>
          <Icone nom="qrcode" taille={20} couleur={COULEURS.brand} />
          <Text style={styles.lienQrTexte}>{qr ? "Masquer les QR" : "Voir les QR"}</Text>
        </Pressable>
        {qr && (
          <View style={styles.qrs}>
            {r.qr.plaque && r.code && (
              <View style={styles.qr}>
                <QrCode valeur={r.qr.plaque} taille={TAILLE_QR} />
                <Texte gras>Plaque</Texte>
                <Texte attenue>{r.code}</Texte>
              </View>
            )}
            {r.qr.interieur && (
              <View style={styles.qr}>
                <QrCode valeur={r.qr.interieur.url} taille={TAILLE_QR} />
                <Texte gras>Intérieur</Texte>
                <Texte attenue>{r.qr.interieur.code}</Texte>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
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
  lienQr: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6, minHeight: 44 },
  lienQrTexte: { fontSize: 15, fontWeight: "800", color: COULEURS.brand },
  qrs: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  qr: { alignItems: "center", gap: 2 },
});
