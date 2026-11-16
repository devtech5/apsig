import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code-Secours CI",
  description: "Page d'alerte APSIG : un appui suffit pour prévenir la centrale.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  // Installée sur l'écran d'accueil (PWA, cf. app/manifest.ts) : plein écran, barre d'état aux couleurs APSIG.
  appleWebApp: { capable: true, title: "Code-Secours", statusBarStyle: "black-translucent" },
  // Les pages d'alerte portent un jeton : elles ne doivent pas être indexées.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1e3a6e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
