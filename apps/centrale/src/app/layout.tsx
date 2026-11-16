import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Centrale APSIG",
  description: "Centrale CODE-SECOURS : réception et traitement des alertes.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  // Installée sur l'écran d'accueil (PWA, cf. app/manifest.ts), surtout par le terrain (op.<domaine>).
  appleWebApp: { capable: true, title: "APSIG", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1e3a6e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
