"use client";

import { useState } from "react";
import { fcfa, fcfaCourt, libelleMois } from "@/lib/qg";

export type MoisEncaissements = { mois: string; abonnementsFcfa: number; acomptesFcfa: number };

const SERIES = [
  { cle: "abonnementsFcfa", libelle: "Abonnements soldés", couleur: "bg-serie-abonnement" },
  { cle: "acomptesFcfa", libelle: "Acomptes", couleur: "bg-serie-acompte" },
] as const;
const NB_GRADUATIONS = 4;

// Graduation « ronde » au-dessus du plus haut mois (1, 2, 2,5 ou 5 × 10^n).
function maximumAxe(valeur: number) {
  if (valeur <= 0) return 10_000;
  const puissance = 10 ** Math.floor(Math.log10(valeur));
  const pas = [1, 2, 2.5, 5, 10].find((p) => p * puissance >= valeur)!;
  return pas * puissance;
}

// Encaissements des six derniers mois : barres empilées (abonnements soldés + acomptes), un seul axe en FCFA.
export function GraphiqueEncaissements({ mois }: { mois: MoisEncaissements[] }) {
  const [survole, setSurvole] = useState<string | null>(null);
  const total = (m: MoisEncaissements) => m.abonnementsFcfa + m.acomptesFcfa;
  const max = maximumAxe(Math.max(0, ...mois.map(total)));
  const graduations = Array.from({ length: NB_GRADUATIONS + 1 }, (_, i) => (max * (NB_GRADUATIONS - i)) / NB_GRADUATIONS);
  const vide = mois.every((m) => total(m) === 0);

  return (
    <figure className="grid gap-3">
      <div className="relative grid grid-cols-[3.5rem_1fr] gap-2">
        <div className="flex h-56 flex-col justify-between text-right text-xs text-attenue" aria-hidden="true">
          {graduations.map((g) => (
            <span key={g} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {fcfaCourt(g)}
            </span>
          ))}
        </div>
        <div className="relative h-56">
          {graduations.map((g, i) => (
            <div key={g} className={`absolute inset-x-0 border-t ${i === NB_GRADUATIONS ? "border-attenue/40" : "border-dashed border-ligne"}`} style={{ top: `${(i / NB_GRADUATIONS) * 100}%` }} />
          ))}
          {vide && <p className="absolute inset-0 grid place-items-center text-sm text-attenue">Aucun encaissement sur la période</p>}
          <ul className="absolute inset-0 grid grid-cols-6 gap-3 px-2 sm:gap-6">
            {mois.map((m) => (
              <li
                key={m.mois}
                tabIndex={0}
                onMouseEnter={() => setSurvole(m.mois)}
                onMouseLeave={() => setSurvole(null)}
                onFocus={() => setSurvole(m.mois)}
                onBlur={() => setSurvole(null)}
                aria-label={`${libelleMois(m.mois)} : ${fcfa(total(m))} dont ${fcfa(m.acomptesFcfa)} d'acomptes`}
                className="relative flex flex-col justify-end rounded-md outline-none hover:bg-fond/70 focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="mx-auto flex w-full max-w-10 flex-col-reverse gap-0.5">
                  {SERIES.map((s) =>
                    m[s.cle] > 0 ? <div key={s.cle} className={`${s.couleur} w-full last:rounded-t`} style={{ height: `${(m[s.cle] / max) * 14}rem` }} /> : null,
                  )}
                </div>
                {survole === m.mois && <Infobulle m={m} />}
              </li>
            ))}
          </ul>
        </div>
        <span />
        <div className="grid grid-cols-6 gap-3 px-2 text-center text-xs text-attenue sm:gap-6">
          {mois.map((m) => (
            <span key={m.mois}>{libelleMois(m.mois)}</span>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-attenue">
        {SERIES.map((s) => (
          <span key={s.cle} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${s.couleur}`} aria-hidden="true" />
            {s.libelle}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Infobulle({ m }: { m: MoisEncaissements }) {
  return (
    <div role="tooltip" className="absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg bg-encre px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-1 font-bold">{libelleMois(m.mois, true)}</p>
      {SERIES.map((s) => (
        <p key={s.cle} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${s.couleur}`} aria-hidden="true" />
          <span className="flex-1">{s.libelle}</span>
          <span className="font-mono">{fcfa(m[s.cle])}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between border-t border-white/20 pt-1 font-bold">
        <span>Total</span>
        <span className="font-mono">{fcfa(m.abonnementsFcfa + m.acomptesFcfa)}</span>
      </p>
    </div>
  );
}
