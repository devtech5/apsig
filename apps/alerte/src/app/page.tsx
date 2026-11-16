import type { Metadata } from "next";
import { headers } from "next/headers";
import { Cadre, NumerosPublics } from "@/components/Cadre";
import { ScannerQr } from "@/components/ScannerQr";
import { Landing } from "@/components/site/Landing";

// Une même application, deux accueils selon le domaine :
// - apsig.online (et www.) : le site officiel APSIG, landing page de CODE-SECOURS CI ;
// - code-secours.apsig.online : le scanner de QR du témoin.
// Les pages /s/<jeton> répondent sur les deux : les premiers QR imprimés portent apsig.online.
const HOTES_SITE_OFFICIEL = (process.env.HOTES_SITE_OFFICIEL ?? "apsig.online,www.apsig.online,site.localhost")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

async function estSiteOfficiel() {
  const hote = ((await headers()).get("host") ?? "").split(":")[0]!.toLowerCase();
  return HOTES_SITE_OFFICIEL.includes(hote);
}

const DESCRIPTION =
  "CODE-SECOURS CI par APSIG : un QR code sur votre portail, dans la maison ou au poignet de votre enfant. Un témoin le scanne, la centrale APSIG prévient votre famille et les secours, 24h/24.";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await estSiteOfficiel())) return {};
  return {
    title: "APSIG · CODE-SECOURS CI — une alerte, la bonne personne prévenue",
    description: DESCRIPTION,
    // Contrairement aux pages d'alerte (jetons), le site officiel doit être trouvé par les moteurs de recherche.
    robots: { index: true, follow: true },
    alternates: { canonical: "https://apsig.online" },
    openGraph: {
      type: "website",
      locale: "fr_CI",
      url: "https://apsig.online",
      siteName: "APSIG",
      title: "CODE-SECOURS CI — une alerte, la bonne personne prévenue",
      description: DESCRIPTION,
      images: [{ url: "https://apsig.online/icone-512.png", width: 512, height: 512, alt: "Bouclier APSIG" }],
    },
  };
}

export default async function Accueil() {
  if (await estSiteOfficiel()) return <Landing />;
  return (
    <Cadre>
      <ScannerQr />
      <NumerosPublics />
    </Cadre>
  );
}
