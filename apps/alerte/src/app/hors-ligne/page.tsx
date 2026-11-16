import type { Metadata } from "next";
import { Cadre, NumerosPublics } from "@/components/Cadre";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Pas de connexion · Code-Secours CI" };

// Affichée par le service worker quand le téléphone n'a pas de réseau : les numéros publics restent appelables.
export default function HorsLigne() {
  return (
    <Cadre>
      <section className="grid justify-items-center gap-3 rounded-3xl bg-white px-6 py-10 text-center shadow-lg">
        <span className="grid size-14 place-items-center rounded-2xl bg-alerte-fond text-alerte-encre">
          <Icone nom="alerte" className="size-7" />
        </span>
        <h1 className="text-xl font-extrabold">Pas de connexion internet</h1>
        <p className="text-attenue">L'alerte ne peut pas partir sans réseau. Appelez directement les secours, ou réessayez dès que le réseau revient.</p>
        <a href="/" className="rounded-xl bg-brand px-5 py-3 font-bold text-white">
          Réessayer
        </a>
      </section>
      <NumerosPublics titre="Appelez directement les secours" />
    </Cadre>
  );
}
