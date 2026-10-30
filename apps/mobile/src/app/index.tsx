import { Redirect } from "expo-router";
import { Chargement } from "@/components/ui";
import { useSession } from "@/lib/session";

// Aiguillage au démarrage : l'abonné arrive directement sur ses boutons SOS.
export default function Demarrage() {
  const { session } = useSession();
  if (!session) return <Chargement texte="Ouverture d'APSIG…" />;
  if (session.type === "abonne") return <Redirect href="/abonne" />;
  if (session.type === "personnel") return <Redirect href="/personnel" />;
  return <Redirect href="/bienvenue" />;
}
