import { Redirect, Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

export default function EspacePersonnel() {
  const { session } = useSession();
  if (!session) return null;
  if (session.type !== "personnel") return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COULEURS.brand },
        headerTintColor: COULEURS.blanc,
        headerTitleStyle: { fontWeight: "800" },
        contentStyle: { backgroundColor: COULEURS.fond },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: "APSIG · Personnel" }} />
      <Stack.Screen name="pose/index" options={{ title: "Pose des plaques" }} />
      <Stack.Screen name="pose/[jeton]" options={{ title: "Poser le QR" }} />
      <Stack.Screen name="pose/plaque/[code]" options={{ title: "Pose de plaque" }} />
      <Stack.Screen name="recensement/index" options={{ title: "Recensement" }} />
      <Stack.Screen name="recensement/nouveau" options={{ title: "Nouveau client" }} />
      <Stack.Screen name="terrain/index" options={{ title: "Mon unité" }} />
      <Stack.Screen name="terrain/[numero]" options={{ title: "Mission" }} />
    </Stack>
  );
}
