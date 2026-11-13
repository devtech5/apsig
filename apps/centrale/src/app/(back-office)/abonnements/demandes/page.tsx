"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LIBELLES_CIBLE_DETAILLES, MENSUALITES_FCFA, type Cible } from "@apsig/domain";
import { Erreur } from "@/components/Formulaire";
import { Icone } from "@/components/Icone";
import { appelApi } from "@/lib/api";
import { dateHeure } from "@/lib/format";

type Demande = {
  id: string;
  creeLe: string;
  statut: "NOUVELLE" | "TRAITEE";
  cible: string;
  prenom: string;
  nom: string;
  telephone: string;
  email: string | null;
  ville: string;
  quartier: string;
  adresse: string | null;
  message: string | null;
  traiteeLe: string | null;
};

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} F`;

// Demandes déposées sur code-secours.apsig.online : le conseiller rappelle, crée le foyer, puis marque la demande traitée.
export default function PageDemandes() {
  const [statut, setStatut] = useState<"NOUVELLE" | "TRAITEE">("NOUVELLE");
  const [donnees, setDonnees] = useState<{ demandes: Demande[]; nouvelles: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(() => {
    appelApi<{ demandes: Demande[]; nouvelles: number }>(`/abonnements/demandes?statut=${statut}`)
      .then((r) => {
        setDonnees(r);
        setErreur(null);
      })
      .catch((e: Error) => setErreur(e.message));
  }, [statut]);

  useEffect(() => {
    setDonnees(null);
    charger();
  }, [charger]);

  async function basculer(d: Demande) {
    setEnCours(d.id);
    try {
      await appelApi(`/abonnements/demandes/${d.id}/traiter`, { traitee: d.statut === "NOUVELLE" });
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(null);
    }
  }

  const onglet = (s: "NOUVELLE" | "TRAITEE", libelle: string) => (
    <button
      type="button"
      onClick={() => setStatut(s)}
      aria-pressed={statut === s}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${statut === s ? "bg-brand text-white" : "bg-white text-attenue hover:text-encre"}`}
    >
      {libelle}
    </button>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/abonnements" className="text-sm font-semibold text-attenue hover:text-encre">
          ← Abonnements
        </Link>
        <h1 className="mr-auto text-xl font-black">Demandes d'inscription en ligne</h1>
        {onglet("NOUVELLE", `À rappeler${donnees ? ` (${donnees.nouvelles})` : ""}`)}
        {onglet("TRAITEE", "Traitées")}
      </div>

      <Erreur message={erreur} />
      {!donnees && !erreur && <p className="text-attenue">Chargement…</p>}
      {donnees?.demandes.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-attenue">{statut === "NOUVELLE" ? "Aucune demande à rappeler." : "Aucune demande traitée."}</p>
      )}

      <ul className="grid gap-2">
        {donnees?.demandes.map((d) => {
          const cible = d.cible as Cible;
          return (
            <li key={d.id} className="grid gap-3 rounded-xl bg-white px-4 py-3 shadow-sm sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="grid gap-1">
                <p>
                  <span className="font-bold">
                    {d.prenom} {d.nom}
                  </span>
                  <span className="ml-2 text-xs text-attenue">reçue le {dateHeure(d.creeLe)}</span>
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <a href={`tel:${d.telephone.replace(/[ .-]/g, "")}`} className="flex items-center gap-1 font-mono font-semibold text-brand">
                    <Icone nom="telephone" className="size-4" />
                    {d.telephone}
                  </a>
                  {d.email && (
                    <a href={`mailto:${d.email}`} className="text-attenue hover:text-encre">
                      {d.email}
                    </a>
                  )}
                </p>
                <p className="text-sm text-attenue">
                  {d.quartier}, {d.ville}
                  {d.adresse && ` · ${d.adresse}`}
                </p>
                <p className="text-xs">
                  <span className="rounded bg-fond px-2 py-0.5 font-semibold">
                    {LIBELLES_CIBLE_DETAILLES[cible] ?? d.cible}
                    {MENSUALITES_FCFA[cible] != null && ` · ${fcfa(MENSUALITES_FCFA[cible])}/mois`}
                  </span>
                </p>
                {d.message && <p className="rounded-lg bg-fond px-3 py-2 text-sm whitespace-pre-line">{d.message}</p>}
                {d.traiteeLe && <p className="text-xs text-attenue">Traitée le {dateHeure(d.traiteeLe)}</p>}
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
                {d.statut === "NOUVELLE" && (
                  <Link href="/abonnements/nouveau" className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white">
                    <Icone nom="plus" className="size-4" /> Créer le foyer
                  </Link>
                )}
                <button
                  type="button"
                  disabled={enCours === d.id}
                  onClick={() => basculer(d)}
                  className="rounded-lg border border-ligne px-3 py-2 text-sm font-semibold hover:bg-fond disabled:opacity-60"
                >
                  {d.statut === "NOUVELLE" ? "Marquer traitée" : "Remettre à rappeler"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
