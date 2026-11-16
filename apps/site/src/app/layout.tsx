import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Titres : grotesque à caractère, lisible et chaleureuse ; texte : sans-serif nette pour les petits écrans.
const affiche = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-affiche", display: "swap" });
const texte = Instrument_Sans({ subsets: ["latin"], variable: "--font-texte", display: "swap" });

const DESCRIPTION =
  "CODE-SECOURS CI par APSIG : un QR code sur votre portail, dans la maison ou au poignet de votre enfant. Un témoin le scanne, la centrale APSIG prévient votre famille et les secours, 24h/24.";

export const metadata: Metadata = {
  metadataBase: new URL("https://apsig.online"),
  title: "APSIG · CODE-SECOURS CI — une alerte, la bonne personne prévenue",
  description: DESCRIPTION,
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    locale: "fr_CI",
    siteName: "APSIG",
    title: "CODE-SECOURS CI — une alerte, la bonne personne prévenue",
    description: DESCRIPTION,
    images: [{ url: "/icone-512.png", width: 512, height: 512, alt: "Bouclier APSIG" }],
  },
};

export const viewport: Viewport = { themeColor: "#12285a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${affiche.variable} ${texte.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
