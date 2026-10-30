"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIBELLES_RAPPEL, LIBELLES_ROLE, LIBELLES_STATUT, STATUTS_ALERTE, TYPES_URGENCE, URGENCES, type StatutAlerte, type StatutRappel, type TypeUrgence } from "@apsig/domain";
import { useCentrale } from "@/components/Centrale";
import { Bloc, BOUTON_DISCRET, CHAMP, Erreur } from "@/components/Formulaire";
import { STYLE_URGENCE } from "@/components/Icone";
import { appelApi } from "@/lib/api";
import { dateHeure } from "@/lib/format";

type Delais = { nombre: number; mediane: number | null; p90: number | null };
type Statistiques = {
  du: string;
  au: string;
  alertes: number;
  incidents: number;
  enCours: number;
  annuleesParTemoin: number;
  faussesAlertes: number;
  parType: Record<TypeUrgence, number>;
  delais: { priseEnCharge: Delais; surPlace: Delais };
  operateurs: { id: string; nom: string; traitees: number; medianePriseEnChargeS: number | null }[];
  parJour: { jour: string; nombre: number }[];
};
type LigneHistorique = {
  numero: string;
  type: TypeUrgence;
  urgence: string;
  statut: StatutAlerte;
  creeLe: string;
  lieu: string | null;
  support: { libelle: string; code: string };
  operateur: string | null;
  rattachee: boolean;
  rappel: StatutRappel;
  issue: string | null;
  delaiPriseEnChargeS: number | null;
  delaiSurPlaceS: number | null;
};
type Historique = { total: number; page: number; parPage: number; alertes: LigneHistorique[] };

const JOUR_MS = 86_400_000;
const jourIso = (d: Date) => d.toISOString().slice(0, 10);
const ilYA = (jours: number) => jourIso(new Date(Date.now() - jours * JOUR_MS));

// « 42 s », « 3 min 05 s », « 1 h 12 min »
function delai(s: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

const requete = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]]))).toString();

export default function PageSupervision() {
  const [du, setDu] = useState(ilYA(6));
  const [au, setAu] = useState(ilYA(0));
  const [stats, setStats] = useState<Statistiques | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelApi<Statistiques>(`/supervision/statistiques?${requete({ du, au })}`).then(
      (s) => {
        setStats(s);
        setErreur(null);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [du, au]);

  const preset = (jours: number) => {
    setDu(ilYA(jours - 1));
    setAu(ilYA(0));
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-black">Supervision</h1>
        <div className="flex gap-1">
          {[
            [1, "Aujourd'hui"],
            [7, "7 jours"],
            [30, "30 jours"],
          ].map(([j, l]) => (
            <button key={l} onClick={() => preset(j as number)} className={BOUTON_DISCRET}>
              {l}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-xs font-semibold">
          Du
          <input type="date" value={du} max={au} onChange={(e) => e.target.value && setDu(e.target.value)} className={CHAMP} />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Au
          <input type="date" value={au} min={du} onChange={(e) => e.target.value && setAu(e.target.value)} className={CHAMP} />
        </label>
      </div>
      <Erreur message={erreur} />

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tuile titre="Incidents" valeur={String(stats.incidents)} detail={stats.alertes > stats.incidents ? `${stats.alertes} déclenchements` : undefined} />
            <Tuile titre="En cours" valeur={String(stats.enCours)} />
            <Tuile titre="Prise en charge" valeur={delai(stats.delais.priseEnCharge.mediane)} detail={`médiane · 9 sur 10 en ${delai(stats.delais.priseEnCharge.p90)}`} />
            <Tuile titre="Arrivée sur place" valeur={delai(stats.delais.surPlace.mediane)} detail={`médiane · ${stats.delais.surPlace.nombre} interventions`} />
            <Tuile titre="Fausses alertes" valeur={String(stats.faussesAlertes)} detail="confirmées au rappel" />
            <Tuile titre="Annulées" valeur={String(stats.annuleesParTemoin)} detail="par le témoin" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Equipe />
            <Bloc titre="Par type d'urgence">
              <table className="w-full text-sm">
                <tbody>
                  {TYPES_URGENCE.map((t) => (
                    <tr key={t} className="border-b border-ligne last:border-0">
                      <td className={`py-1.5 font-semibold ${STYLE_URGENCE[t].texte}`}>{URGENCES[t].bouton}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{stats.parType[t]}</td>
                      <td className="w-14 py-1.5 text-right text-xs text-attenue tabular-nums">
                        {stats.incidents ? `${Math.round((stats.parType[t] / stats.incidents) * 100)} %` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bloc>
            <Bloc titre="Par opérateur">
              {stats.operateurs.length === 0 && <p className="text-sm text-attenue">Aucune alerte prise en charge sur la période.</p>}
              <table className="w-full text-sm">
                <tbody>
                  {stats.operateurs.map((o) => (
                    <tr key={o.id} className="border-b border-ligne last:border-0">
                      <td className="py-1.5 font-semibold">{o.nom}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{o.traitees}</td>
                      <td className="py-1.5 text-right text-xs text-attenue">{delai(o.medianePriseEnChargeS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.operateurs.length > 0 && <p className="mt-2 text-xs text-attenue">Alertes traitées · délai médian de prise en charge</p>}
            </Bloc>
          </div>
        </>
      )}

      <HistoriqueAlertes du={du} au={au} />
    </div>
  );
}

function Tuile({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string | undefined }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-bold tracking-wide text-attenue uppercase">{titre}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{valeur}</p>
      {detail && <p className="text-xs text-attenue">{detail}</p>}
    </div>
  );
}

const PRESENCE = { EN_SERVICE: "En service", PAUSE: "En pause", HORS_SERVICE: "Hors service" } as const;

function Equipe() {
  const equipe = useCentrale()?.file?.equipe;
  return (
    <Bloc titre="Équipe en direct">
      {!equipe?.length && <p className="text-sm text-attenue">Aucun opérateur.</p>}
      <ul className="grid gap-1.5 text-sm">
        {equipe?.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${m.presence === "EN_SERVICE" && m.enLigne ? "bg-green-500" : m.presence === "PAUSE" ? "bg-amber-400" : "bg-ligne"}`} />
            <span className="font-semibold">{m.nom}</span>
            <span className="text-xs text-attenue">{LIBELLES_ROLE[m.role]}</span>
            <span className="ml-auto text-xs text-attenue">
              {PRESENCE[m.presence]}
              {m.presence !== "HORS_SERVICE" && !m.enLigne && " · sans signe de vie"}
              {m.charge > 0 && ` · ${m.charge} en cours`}
            </span>
          </li>
        ))}
      </ul>
    </Bloc>
  );
}

function HistoriqueAlertes({ du, au }: { du: string; au: string }) {
  const [type, setType] = useState("");
  const [statut, setStatut] = useState("");
  const [operateurId, setOperateurId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [operateurs, setOperateurs] = useState<{ id: string; nom: string }[]>([]);
  const [h, setH] = useState<Historique | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelApi<{ id: string; nom: string }[]>("/supervision/operateurs").then(setOperateurs, () => undefined);
  }, []);

  useEffect(() => setPage(1), [du, au, type, statut, operateurId, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      appelApi<Historique>(`/supervision/historique?${requete({ du, au, type, statut, operateurId, q, page })}`).then(
        (r) => {
          setH(r);
          setErreur(null);
        },
        (e: Error) => setErreur(e.message),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [du, au, type, statut, operateurId, q, page]);

  const pages = h ? Math.max(1, Math.ceil(h.total / h.parPage)) : 1;

  return (
    <Bloc titre={`Historique${h ? ` (${h.total})` : ""}`}>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° d'alerte, code QR, foyer, issue…" className={CHAMP} aria-label="Rechercher" />
        <select value={type} onChange={(e) => setType(e.target.value)} className={CHAMP} aria-label="Type">
          <option value="">Tous les types</option>
          {TYPES_URGENCE.map((t) => (
            <option key={t} value={t}>
              {URGENCES[t].bouton}
            </option>
          ))}
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} className={CHAMP} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {STATUTS_ALERTE.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_STATUT[s]}
            </option>
          ))}
        </select>
        <select value={operateurId} onChange={(e) => setOperateurId(e.target.value)} className={CHAMP} aria-label="Opérateur">
          <option value="">Tous les opérateurs</option>
          {operateurs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </select>
      </div>
      <Erreur message={erreur} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-xs text-attenue">
            <tr>
              <th className="py-1.5 font-semibold">Alerte</th>
              <th className="py-1.5 font-semibold">Lieu</th>
              <th className="py-1.5 font-semibold">Statut</th>
              <th className="py-1.5 font-semibold">Opérateur</th>
              <th className="py-1.5 text-right font-semibold">Prise en charge</th>
              <th className="py-1.5 text-right font-semibold">Sur place</th>
            </tr>
          </thead>
          <tbody>
            {h?.alertes.map((a) => (
              <tr key={a.numero} className="border-t border-ligne align-top">
                <td className="py-2">
                  <Link href={`/?alerte=${a.numero}`} className="font-semibold text-brand underline">
                    {a.numero}
                  </Link>
                  <span className={`block text-xs font-semibold ${STYLE_URGENCE[a.type].texte}`}>{a.urgence}</span>
                  <span className="block text-xs text-attenue">{dateHeure(a.creeLe)}</span>
                </td>
                <td className="py-2">
                  {a.lieu ?? "—"}
                  <span className="block font-mono text-xs text-attenue">{a.support.code}</span>
                </td>
                <td className="py-2">
                  {LIBELLES_STATUT[a.statut]}
                  {a.rattachee && <span className="block text-xs text-attenue">témoin rattaché</span>}
                  {a.rappel !== "EN_ATTENTE" && <span className="block text-xs text-attenue">{LIBELLES_RAPPEL[a.rappel]}</span>}
                  {a.issue && <span className="block max-w-56 truncate text-xs text-attenue" title={a.issue}>{a.issue}</span>}
                </td>
                <td className="py-2">{a.operateur ?? "—"}</td>
                <td className="py-2 text-right font-mono tabular-nums">{delai(a.delaiPriseEnChargeS)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{delai(a.delaiSurPlaceS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {h?.total === 0 && <p className="py-4 text-center text-sm text-attenue">Aucune alerte sur cette période avec ces filtres.</p>}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={BOUTON_DISCRET}>
            ← Précédentes
          </button>
          <span className="text-attenue">
            Page {page} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={BOUTON_DISCRET}>
            Suivantes →
          </button>
        </div>
      )}
    </Bloc>
  );
}
