"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIBELLES_MOYEN_PAIEMENT, type MoyenPaiement } from "@apsig/domain";
import { Bloc, Erreur } from "@/components/Formulaire";
import { appelApi } from "@/lib/api";
import { dateHeure } from "@/lib/format";

type Finance = {
  totaux: { encaisseFcfa: number; ceMoisFcfa: number; resteAEncaisserFcfa: number; mensualitesFcfa: number; abonnementsEnCours: number };
  parMois: { mois: string; montantFcfa: number }[];
  parMoyen: { operateur: MoyenPaiement; montantFcfa: number; nombre: number }[];
  nonSoldes: { foyerId: string; code: string | null; client: string; telephone: string | null; recenseur: string | null; encaisseFcfa: number; resteFcfa: number; depuisJours: number }[];
  commissions: {
    tarifPlaqueFcfa: number;
    recenseurs: { id: string; nom: string; actif: boolean; plaquesPosees: number; montantFcfa: number }[];
    poseurs: { id: string; nom: string; actif: boolean; poses: number }[];
  };
  recents: { id: string; le: string; montantFcfa: number; operateur: MoyenPaiement; reference: string | null; foyer: { id: string; libelle: string }; nature: "abonnement" | "acompte" }[];
};

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} F`;
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const libelleMois = (m: string) => `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function Chiffre({ libelle, valeur, aide }: { libelle: string; valeur: string; aide?: string }) {
  return (
    <div className="grid gap-0.5 rounded-2xl bg-white p-4 shadow-sm">
      <span className="text-xs font-bold tracking-wide text-attenue uppercase">{libelle}</span>
      <span className="font-mono text-2xl font-black">{valeur}</span>
      {aide && <span className="text-xs text-attenue">{aide}</span>}
    </div>
  );
}

// QG : encaissements, soldes à recouvrer, mensualités attendues et commissions du terrain.
export default function PageFinance() {
  const [f, setF] = useState<Finance | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelApi<Finance>("/finance").then(setF, (e: Error) => setErreur(e.message));
  }, []);

  const max = Math.max(1, ...(f?.parMois.map((m) => m.montantFcfa) ?? []));
  const totalCommissions = f?.commissions.recenseurs.reduce((t, r) => t + r.montantFcfa, 0) ?? 0;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <h1 className="text-xl font-black">Finance</h1>
      <Erreur message={erreur} />
      {!f && !erreur && <p className="text-attenue">Chargement…</p>}
      {f && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Chiffre libelle="Encaissé (total)" valeur={fcfa(f.totaux.encaisseFcfa)} />
            <Chiffre libelle="Ce mois-ci" valeur={fcfa(f.totaux.ceMoisFcfa)} />
            <Chiffre libelle="Reste à encaisser" valeur={fcfa(f.totaux.resteAEncaisserFcfa)} aide={`${f.nonSoldes.length} client${f.nonSoldes.length > 1 ? "s" : ""} pas encore soldé${f.nonSoldes.length > 1 ? "s" : ""}`} />
            <Chiffre libelle="Mensualités attendues" valeur={`${fcfa(f.totaux.mensualitesFcfa)}/mois`} aide={`${f.totaux.abonnementsEnCours} abonnement${f.totaux.abonnementsEnCours > 1 ? "s" : ""} en cours`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bloc titre="Encaissements des 6 derniers mois">
              <ul className="grid gap-2 text-sm">
                {f.parMois.map((m) => (
                  <li key={m.mois} className="grid grid-cols-[5rem_1fr_6rem] items-center gap-2">
                    <span className="text-attenue">{libelleMois(m.mois)}</span>
                    <span className="h-3 rounded bg-fond">
                      <span className="block h-3 rounded bg-brand" style={{ width: `${(m.montantFcfa / max) * 100}%` }} />
                    </span>
                    <span className="text-right font-mono">{fcfa(m.montantFcfa)}</span>
                  </li>
                ))}
              </ul>
            </Bloc>
            <Bloc titre="Par moyen de paiement">
              {f.parMoyen.length === 0 && <p className="text-sm text-attenue">Aucun encaissement pour l&apos;instant.</p>}
              <ul className="grid gap-1 text-sm">
                {f.parMoyen.map((m) => (
                  <li key={m.operateur} className="flex justify-between border-t border-ligne py-1.5">
                    <span>
                      {LIBELLES_MOYEN_PAIEMENT[m.operateur]} <span className="text-attenue">· {m.nombre}</span>
                    </span>
                    <span className="font-mono">{fcfa(m.montantFcfa)}</span>
                  </li>
                ))}
              </ul>
            </Bloc>
          </div>

          <Bloc titre={`Commissions des recenseurs · ${fcfa(f.commissions.tarifPlaqueFcfa)} par plaque posée · total ${fcfa(totalCommissions)}`}>
            {f.commissions.recenseurs.length === 0 && <p className="text-sm text-attenue">Aucun recenseur pour l&apos;instant.</p>}
            <ul className="grid gap-1 text-sm">
              {f.commissions.recenseurs.map((r) => (
                <li key={r.id} className={`flex justify-between border-t border-ligne py-1.5 ${r.actif ? "" : "text-attenue"}`}>
                  <span>
                    {r.nom} <span className="text-attenue">· {r.plaquesPosees} plaque{r.plaquesPosees > 1 ? "s" : ""} posée{r.plaquesPosees > 1 ? "s" : ""}</span>
                  </span>
                  <span className="font-mono font-bold">{fcfa(r.montantFcfa)}</span>
                </li>
              ))}
            </ul>
            {f.commissions.poseurs.length > 0 && (
              <p className="mt-3 text-xs text-attenue">
                Poseurs (tarif à fixer) : {f.commissions.poseurs.map((p) => `${p.nom} ${p.poses} pose${p.poses > 1 ? "s" : ""}`).join(" · ")}
              </p>
            )}
          </Bloc>

          <Bloc titre={`Clients pas encore soldés (${f.nonSoldes.length})`}>
            {f.nonSoldes.length === 0 && <p className="text-sm text-attenue">Tous les clients recensés sont soldés.</p>}
            <ul className="grid gap-1 text-sm">
              {f.nonSoldes.map((c) => (
                <li key={c.foyerId} className="grid gap-1 border-t border-ligne py-1.5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <span>
                    <Link href={`/abonnements/${c.foyerId}`} className="font-semibold text-brand hover:underline">
                      {c.client}
                    </Link>
                    {c.code && <span className="ml-2 font-mono text-xs text-attenue">{c.code}</span>}
                    <span className="block text-xs text-attenue">
                      {c.telephone ?? "—"} · recensé par {c.recenseur ?? "—"} il y a {c.depuisJours} j
                    </span>
                  </span>
                  <span className="text-right">
                    {c.encaisseFcfa > 0 && <span className="mr-2 text-xs text-attenue">acompte {fcfa(c.encaisseFcfa)}</span>}
                    <span className="font-mono font-bold text-alerte-encre">reste {fcfa(c.resteFcfa)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Bloc>

          <Bloc titre="Derniers encaissements">
            <ul className="grid gap-1 text-sm">
              {f.recents.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 border-t border-ligne py-1.5">
                  <span>
                    <Link href={`/abonnements/${p.foyer.id}`} className="text-brand hover:underline">
                      {p.foyer.libelle}
                    </Link>
                    <span className="text-attenue">
                      {" "}
                      · {LIBELLES_MOYEN_PAIEMENT[p.operateur]}
                      {p.reference && ` · ${p.reference}`} · {dateHeure(p.le)}
                    </span>
                  </span>
                  <span className="font-mono">
                    {fcfa(p.montantFcfa)}
                    {p.nature === "acompte" && <span className="ml-1 text-xs text-attenue">(acompte)</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Bloc>
        </>
      )}
    </div>
  );
}
