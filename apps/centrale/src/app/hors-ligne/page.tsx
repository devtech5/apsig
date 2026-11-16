import type { Metadata } from "next";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Pas de connexion · APSIG" };

// Affichée par le service worker de l'espace terrain quand le téléphone n'a pas de réseau.
export default function HorsLigne() {
  return (
    <main className="grid min-h-dvh place-items-center bg-brand p-4">
      <section className="grid w-full max-w-sm justify-items-center gap-3 rounded-2xl bg-white px-6 py-8 text-center shadow-lg">
        <img src="/logo-apsig.svg" alt="" width={36} height={40} className="h-10 w-9" />
        <span className="grid size-12 place-items-center rounded-xl bg-alerte-fond text-alerte-encre">
          <Icone nom="alerte" className="size-6" />
        </span>
        <h1 className="text-lg font-black">Pas de connexion internet</h1>
        <p className="text-sm text-attenue">
          Cette page a besoin du réseau. Rapprochez-vous d'une zone couverte, puis réessayez : rien n'est enregistré tant que l'envoi n'a pas été confirmé.
        </p>
        <a href="/" className="rounded-lg bg-brand px-5 py-2.5 font-bold text-white">
          Réessayer
        </a>
      </section>
    </main>
  );
}
