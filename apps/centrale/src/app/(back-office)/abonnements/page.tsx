"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIBELLES_ETAT_ABONNEMENT } from "@apsig/domain";
import { CHAMP, Erreur } from "@/components/Formulaire";
import { Icone } from "@/components/Icone";
import { COULEUR_ETAT, date, type FoyerResume } from "@/lib/abonnements";
import { appelApi } from "@/lib/api";

// Foyers abonnés : recherche par nom, téléphone, code imprimé, code court ou numéro de foyer.
export default function PageAbonnements() {
  const [q, setQ] = useState("");
  const [foyers, setFoyers] = useState<FoyerResume[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    const t = setTimeout(() => {
      appelApi<FoyerResume[]>(`/abonnements/foyers?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (annule) return;
          setFoyers(r);
          setErreur(null);
        })
        .catch((e: Error) => !annule && setErreur(e.message));
    }, 250);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-black">Abonnements</h1>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, téléphone, code QR, n° de foyer…"
          aria-label="Rechercher un foyer"
          className={`${CHAMP} max-w-xs`}
        />
        <Link href="/abonnements/nouveau" className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
          <Icone nom="plus" className="size-4" /> Nouveau foyer
        </Link>
      </div>

      <Erreur message={erreur} />
      {!foyers && !erreur && <p className="text-attenue">Chargement…</p>}
      {foyers?.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-attenue">Aucun foyer {q ? "ne correspond à cette recherche" : "pour l'instant"}.</p>}

      <ul className="grid gap-2">
        {foyers?.map((f) => (
          <li key={f.id}>
            <Link href={`/abonnements/${f.id}`} className="grid gap-1 rounded-xl bg-white px-4 py-3 shadow-sm hover:ring-2 hover:ring-ligne sm:grid-cols-[1fr_auto] sm:items-center">
              <span>
                <span className="font-bold">{f.libelle}</span>
                {f.numero != null && <span className="ml-2 font-mono text-xs text-attenue">n° {f.numero}</span>}
                <span className="block text-sm text-attenue">
                  {f.lieu}
                  {f.titulaire && ` · ${f.titulaire.prenom} ${f.titulaire.nom}`}
                  {f.titulaire?.telephone && ` · ${f.titulaire.telephone}`}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-attenue">
                  {f.supports} support{f.supports > 1 ? "s" : ""}
                </span>
                {f.abonnement ? (
                  <span className={`rounded px-2 py-0.5 font-semibold ${COULEUR_ETAT[f.abonnement.etat]}`}>
                    {f.abonnement.formule} · {LIBELLES_ETAT_ABONNEMENT[f.abonnement.etat].toLowerCase()} · fin {date(f.abonnement.fin)}
                  </span>
                ) : (
                  <span className="rounded bg-fond px-2 py-0.5 font-semibold text-attenue">Sans abonnement</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
