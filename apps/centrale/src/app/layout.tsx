import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Centrale APSIG",
  description: "Centrale CODE-SECOURS : réception et traitement des alertes.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
