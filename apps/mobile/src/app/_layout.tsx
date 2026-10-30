import { useEffect } from "react";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

// Toucher une notification ouvre l'alerte : son suivi pour le foyer, la mission pour une unité.
function OuvertureNotifications() {
  const { session } = useSession();
  const type = session?.type;
  useEffect(() => {
    if (type !== "abonne" && type !== "personnel") return;
    const ouvrir = (r: Notifications.NotificationResponse | null) => {
      const numero = (r?.notification.request.content.data as { numero?: string } | undefined)?.numero;
      if (!numero) return;
      if (type === "personnel") router.push({ pathname: "/personnel/terrain/[numero]", params: { numero } });
      else router.push({ pathname: "/suivi/[numero]", params: { numero } });
    };
    void Notifications.getLastNotificationResponseAsync().then(ouvrir).catch(() => undefined);
    const s = Notifications.addNotificationResponseReceivedListener(ouvrir);
    return () => s.remove();
  }, [type]);
  return null;
}

export default function Racine() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <OuvertureNotifications />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: COULEURS.brand },
            headerTintColor: COULEURS.blanc,
            headerTitleStyle: { fontWeight: "800" },
            contentStyle: { backgroundColor: COULEURS.fond },
            headerBackButtonDisplayMode: "minimal",
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="bienvenue" options={{ headerShown: false }} />
          <Stack.Screen name="activation" options={{ title: "Activer l'application" }} />
          <Stack.Screen name="connexion" options={{ title: "Personnel APSIG" }} />
          <Stack.Screen name="scanner" options={{ title: "Scanner un QR code" }} />
          <Stack.Screen name="temoin/[jeton]" options={{ title: "Alerte APSIG" }} />
          <Stack.Screen name="suivi/[numero]" options={{ title: "Suivi de l'alerte" }} />
          <Stack.Screen name="abonne" options={{ headerShown: false }} />
          <Stack.Screen name="personnel" options={{ headerShown: false }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
