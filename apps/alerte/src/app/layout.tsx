import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code-Secours CI",
  description: "Page d'alerte APSIG : un appui suffit pour prévenir la centrale.",
  icons: { icon: "/favicon.svg" },
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
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
