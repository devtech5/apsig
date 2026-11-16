import { EnTete } from "@/components/EnTete";
import { Etapes, Scenarios } from "@/components/Fonctionnement";
import { Hero } from "@/components/Hero";
import { Centrale, Garanties, Tarifs } from "@/components/Offre";
import { PiedDePage } from "@/components/PiedDePage";
import { Questions } from "@/components/Questions";
import { Rappel } from "@/components/Rappel";
import { Supports } from "@/components/Supports";

// Site officiel APSIG (apsig.online) : présentation de CODE-SECOURS CI et demande de rappel.
export default function Accueil() {
  return (
    <>
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
    </>
  );
}
