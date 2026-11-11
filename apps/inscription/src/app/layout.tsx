import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inscription — Code-Secours CI",
  description: "Inscrivez votre foyer ou votre entreprise à CODE-SECOURS CI : un conseiller APSIG vous rappelle.",
  icons: { icon: "/favicon.svg" },
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
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
