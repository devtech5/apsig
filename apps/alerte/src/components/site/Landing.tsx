import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Etapes, Scenarios } from "./Fonctionnement";
import { EnTete } from "./EnTete";
import { Hero } from "./Hero";
import { Centrale, Garanties, Tarifs } from "./Offre";
import { PiedDePage } from "./PiedDePage";
import { Questions } from "./Questions";
import { Rappel } from "./Rappel";
import { Supports } from "./Supports";

// Titres : grotesque à caractère ; texte : sans-serif nette. Chargées seulement pour la landing page.
const affiche = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-affiche", display: "swap" });
const texte = Instrument_Sans({ subsets: ["latin"], variable: "--font-texte", display: "swap" });

// Site officiel APSIG (apsig.online) : présentation de CODE-SECOURS CI et demande de rappel.
export function Landing() {
  return (
    <div className={`${affiche.variable} ${texte.variable} bg-ivoire font-corps text-encre`}>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-encre">
        Aller au contenu
      </a>
      <EnTete />
      <main id="contenu">
        <Hero />
        <Scenarios />
        <Etapes />
        <Supports />
        <Centrale />
        <Tarifs />
        <Garanties />
        <Questions />
        <Rappel />
      </main>
      <PiedDePage />
    </div>
  );
}
