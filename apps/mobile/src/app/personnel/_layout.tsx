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
      <Stack.Screen name="pose/index" options={{ title: "Pose des QR" }} />
      <Stack.Screen name="pose/[jeton]" options={{ title: "Poser le QR" }} />
      <Stack.Screen name="terrain/index" options={{ title: "Mon unité" }} />
      <Stack.Screen name="terrain/[numero]" options={{ title: "Mission" }} />
    </Stack>
  );
}
