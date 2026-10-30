import { Redirect, router } from "expo-router";
import { Bouton, Carte, Ecran, Texte } from "@/components/ui";
import { confirmer } from "@/lib/confirmer";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

// Accueil du personnel : un bouton par espace mobile du rôle (pose, terrain).
export default function AccueilPersonnel() {
  const { session, fermer } = useSession();
  if (session?.type !== "personnel") return null;
  const { compte } = session;
  const pose = compte.espaces.includes("pose");
  const terrain = compte.espaces.includes("terrain");
  if (terrain && !pose) return <Redirect href="/personnel/terrain" />;
  if (pose && !terrain) return <Redirect href="/personnel/pose" />;
  return (
    <Ecran>
      <Carte>
        <Texte gras>{compte.nom}</Texte>
        <Texte attenue>{compte.email}</Texte>
      </Carte>
      {pose && <Bouton grand icone="qrcode-plus" libelle="Pose des QR" onPress={() => router.push("/personnel/pose")} />}
      {terrain && <Bouton grand icone="ambulance" couleur={COULEURS.danger} libelle="Mes missions" onPress={() => router.push("/personnel/terrain")} />}
      <Bouton
        secondaire
        couleur={COULEURS.attenue}
        icone="logout"
        libelle="Se déconnecter"
        onPress={() => confirmer("Se déconnecter ?", "Il faudra saisir à nouveau mot de passe et code.", () => void fermer().then(() => router.replace("/")))}
      />
    </Ecran>
  );
}
