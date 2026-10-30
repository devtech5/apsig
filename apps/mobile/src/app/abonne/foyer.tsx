import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Bouton, Carte, Chargement, Ecran, Erreur, Icone, Texte } from "@/components/ui";
import { confirmer } from "@/lib/confirmer";
import { useAbonne, useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";
import type { EspaceAbonne } from "@/lib/types";

const ETATS = { ESSAI: "Essai", ACTIF: "Actif", A_VENIR: "À venir", EXPIRE: "Expiré", RESILIE: "Résilié" } as const;
const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

// Le foyer en lecture : les modifications passent par le conseiller APSIG (données vérifiées).
export default function Foyer() {
  const { appeler } = useAbonne();
  const { fermer } = useSession();
  const [e, setE] = useState<EspaceAbonne | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void appeler<EspaceAbonne>("/client/moi").then(setE, (x: Error) => setErreur(x.message));
    }, [appeler]),
  );

  if (!e) return erreur ? <Ecran><Erreur message={erreur} /></Ecran> : <Chargement />;
  const actif = e.abonnement && ["ESSAI", "ACTIF"].includes(e.abonnement.etat);
  return (
    <Ecran>
      <Carte>
        <Text style={styles.titre}>{e.foyer.libelle}</Text>
        <Texte attenue>
          {e.foyer.quartier}, {e.foyer.ville}
          {e.foyer.adresse ? ` · ${e.foyer.adresse}` : ""}
        </Texte>
        <Texte style={{ color: e.foyer.adresseVerifiee ? COULEURS.succes : COULEURS.alerteEncre, fontWeight: "700" }}>
          {e.foyer.adresseVerifiee ? "Adresse vérifiée par APSIG" : "Adresse à vérifier lors de la pose du QR"}
        </Texte>
      </Carte>

      {e.abonnement && (
        <Carte style={!actif && { borderWidth: 2, borderColor: COULEURS.danger }}>
          <Text style={styles.sousTitre}>Abonnement</Text>
          <Texte>
            {e.abonnement.formule} · <Text style={{ fontWeight: "800", color: actif ? COULEURS.succes : COULEURS.danger }}>{ETATS[e.abonnement.etat]}</Text>
          </Texte>
          <Texte attenue>Jusqu'au {jour(e.abonnement.fin)}</Texte>
          {!actif && <Texte>Vos alertes restent traitées. Pour renouveler, contactez votre conseiller APSIG.</Texte>}
        </Carte>
      )}

      <Carte>
        <Text style={styles.sousTitre}>Membres</Text>
        {e.membres.map((m) => (
          <View key={m.id} style={styles.ligne}>
            <Icone nom={m.moi ? "account-circle" : "account"} couleur={COULEURS.brand} />
            <Texte style={{ flex: 1 }}>
              {m.prenom} {m.nom} {m.moi && <Text style={{ color: COULEURS.attenue }}>(vous)</Text>}
            </Texte>
            <Texte attenue>{m.role}</Texte>
          </View>
        ))}
      </Carte>

      <Carte>
        <Text style={styles.sousTitre}>Proches prévenus en cas d'alerte</Text>
        {e.contacts.length === 0 && <Texte attenue>Aucun proche enregistré.</Texte>}
        {e.contacts.map((c) => (
          <Pressable key={c.telephone + c.nom} onPress={() => void Linking.openURL(`tel:${c.telephone.replace(/[^\d+]/g, "")}`)} style={styles.ligne}>
            <Icone nom="phone" couleur={COULEURS.succes} />
            <Texte style={{ flex: 1 }}>
              {c.nom} <Text style={{ color: COULEURS.attenue }}>· {c.relation}</Text>
            </Texte>
            <Texte attenue>{c.telephone}</Texte>
          </Pressable>
        ))}
      </Carte>

      <Carte>
        <Text style={styles.sousTitre}>QR codes et bracelets</Text>
        {e.supports.map((s) => (
          <View key={s.code} style={styles.ligne}>
            <Icone nom={s.type === "BRACELET" ? "watch-variant" : s.type.startsWith("CARTE") ? "card-account-details" : "qrcode"} couleur={COULEURS.brand} />
            <Texte style={{ flex: 1 }}>
              {s.libelle}
              {s.porteur ? ` · ${s.porteur}` : ""}
            </Texte>
            <Texte attenue>{s.statut === "ACTIF" ? s.code : "Suspendu"}</Texte>
          </View>
        ))}
        <Texte attenue>Un QR perdu ou abîmé ? Votre conseiller APSIG le remplace : l'ancien ne fonctionnera plus.</Texte>
      </Carte>

      <Bouton
        secondaire
        couleur={COULEURS.attenue}
        icone="logout"
        libelle="Déconnecter ce téléphone"
        onPress={() =>
          confirmer("Déconnecter ce téléphone ?", "Il ne pourra plus déclencher d'alerte ni recevoir celles du foyer. Un nouveau code APSIG sera nécessaire.", () =>
            void fermer().then(() => router.replace("/")),
          )
        }
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 22, fontWeight: "900", color: COULEURS.encre },
  sousTitre: { fontSize: 17, fontWeight: "800", color: COULEURS.encre },
  ligne: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
});
