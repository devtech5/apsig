"use client";

import { useEffect, useState } from "react";
import type { NomIcone } from "@/lib/urgences";
import { Icone } from "./Icone";

type Probleme = "refusee" | "indisponible" | "impossible";

// Pensé pour tous, y compris ceux qui ne lisent pas : pictogrammes, gros bouton, consignes lues à voix haute.
const AIDES: Record<Probleme, { titre: string; etapes: [NomIcone, string][]; voix: string }> = {
  refusee: {
    titre: "Montrez aux secours où vous êtes",
    etapes: [
      ["cadenas", "Touchez le cadenas (ou « aA ») à côté de l'adresse, en haut de l'écran"],
      ["repere", "Touchez « Position », puis « Autoriser »"],
      ["doigt", "Revenez ici et touchez le grand bouton bleu"],
    ],
    voix:
      "Les secours ont besoin de savoir où vous êtes. Touchez le petit cadenas en haut de l'écran, à côté de l'adresse. " +
      "Touchez Position, puis Autoriser. Ensuite, touchez le grand bouton bleu : Partager ma position.",
  },
  indisponible: {
    titre: "Allumez la localisation du téléphone",
    etapes: [
      ["doigt", "Glissez le doigt du haut de l'écran vers le bas"],
      ["repere", "Touchez l'icône « Localisation » pour l'allumer"],
      ["actualiser", "Revenez ici et touchez le grand bouton bleu"],
    ],
    voix:
      "Les secours ont besoin de savoir où vous êtes. Glissez le doigt du haut de l'écran vers le bas, " +
      "puis touchez l'icône Localisation pour l'allumer. Ensuite, touchez le grand bouton bleu : Partager ma position.",
  },
  impossible: {
    titre: "Position impossible à envoyer",
    etapes: [["telephone", "La centrale va vous appeler pour savoir où vous êtes. Gardez votre téléphone près de vous."]],
    voix: "Votre position ne peut pas être envoyée depuis ce téléphone. La centrale va vous appeler. Gardez votre téléphone près de vous.",
  },
};

function parler(texte: string) {
  const synthese = globalThis.speechSynthesis;
  if (!synthese) return;
  synthese.cancel();
  const phrase = new SpeechSynthesisUtterance(texte);
  phrase.lang = "fr-FR";
  phrase.rate = 0.9;
  const voix = synthese.getVoices().find((v) => v.lang.toLowerCase().startsWith("fr"));
  if (voix) phrase.voice = voix;
  synthese.speak(phrase);
}

export function AideLocalisation({ probleme, onReessayer }: { probleme: Probleme; onReessayer: () => void }) {
  const aide = AIDES[probleme];
  const [essais, setEssais] = useState(0);
  const [voixDisponible, setVoixDisponible] = useState(false);

  // Consignes lues dès l'affichage (le témoin vient de toucher l'écran : le navigateur l'autorise).
  useEffect(() => {
    setVoixDisponible("speechSynthesis" in globalThis);
    parler(AIDES[probleme].voix);
    return () => globalThis.speechSynthesis?.cancel();
  }, [probleme]);

  function reessayer() {
    setEssais((n) => n + 1);
    onReessayer();
  }

  return (
    <section aria-labelledby="aide-localisation" className="grid gap-4 rounded-3xl border-4 border-red-600 bg-white p-5 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="pulsation-rouge grid size-14 shrink-0 place-items-center rounded-full bg-red-600 text-white">
          <Icone nom="repereBarre" className="size-8" />
        </span>
        <h2 id="aide-localisation" className="text-xl leading-tight font-black">{aide.titre}</h2>
      </div>

      <ol className="grid gap-3">
        {aide.etapes.map(([icone, texte], i) => (
          <li key={texte} className="flex items-center gap-3">
            {aide.etapes.length > 1 && (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-black text-white">{i + 1}</span>
            )}
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-clair text-brand">
              <Icone nom={icone} className="size-7" />
            </span>
            <span className="text-[15px] font-semibold">{texte}</span>
          </li>
        ))}
      </ol>

      {probleme !== "impossible" && (
        <>
          {essais > 0 && (
            <p role="status" className="rounded-xl bg-alerte-fond px-3 py-2 text-sm font-bold text-alerte-encre">
              {probleme === "refusee"
                ? "Toujours bloquée : touchez d'abord le cadenas en haut de l'écran."
                : "Pas encore de signal : vérifiez que la localisation est allumée."}
            </p>
          )}
          <button
            type="button"
            onClick={reessayer}
            className="flex min-h-18 items-center justify-center gap-3 rounded-2xl bg-brand px-4 text-lg font-black text-white uppercase shadow-lg active:scale-[.98]"
          >
            <Icone nom="repere" className="size-7" />
            Partager ma position
          </button>
        </>
      )}

      {voixDisponible && (
        <button
          type="button"
          onClick={() => parler(aide.voix)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fond font-bold text-brand"
        >
          <Icone nom="hautParleur" className="size-6" />
          Écouter les explications
        </button>
      )}

      {probleme !== "impossible" && (
        <p className="text-center text-sm text-attenue">Sinon, la centrale va vous appeler pour savoir où vous êtes.</p>
      )}
    </section>
  );
}
