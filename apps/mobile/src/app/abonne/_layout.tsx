import { Redirect, Tabs } from "expo-router";
import { Icone } from "@/components/ui";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

export default function EspaceAbonne() {
  const { session } = useSession();
  // Trousseau en cours de lecture : on attend avant de rediriger (lien direct, notification).
  if (!session) return null;
  if (session.type !== "abonne") return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COULEURS.brand },
        headerTintColor: COULEURS.blanc,
        headerTitleStyle: { fontWeight: "800" },
        tabBarActiveTintColor: COULEURS.danger,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "700" },
        tabBarStyle: { height: 64, paddingBottom: 8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "SOS", tabBarIcon: ({ color }) => <Icone nom="alarm-light" couleur={color} taille={28} /> }} />
      <Tabs.Screen name="alertes" options={{ title: "Alertes du foyer", tabBarLabel: "Alertes", tabBarIcon: ({ color }) => <Icone nom="bell-ring" couleur={color} taille={26} /> }} />
      <Tabs.Screen name="foyer" options={{ title: "Mon foyer", tabBarIcon: ({ color }) => <Icone nom="home-heart" couleur={color} taille={26} /> }} />
    </Tabs>
  );
}
