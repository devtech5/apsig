"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { FORFAIT_UNIQUE, LIBELLES_CIBLE_DETAILLES, type Cible } from "@apsig/domain";
import { CHAMP, Erreur } from "@/components/Formulaire";
import { appelApi } from "@/lib/api";
import { dateHeure } from "@/lib/format";

// Client recensé (GET /pose/recensements) : son code de plaque (matricule) et ses QR existent dès la validation.
export type Recense = {
  id: string;
  code: string | null;
  qr: { plaque: string | null; interieur: { code: string; url: string } | null };
  rccm: string | null;
  client: string;
  telephone: string | null;
  telephone2: string | null;
  lieu: string;
  cible: Cible | null;
  paye: boolean;
  encaisseFcfa: number;
  resteFcfa: number;
  posee: boolean;
  recenseur: string | null;
  creeLe: string;
};

const DELAI_RECHERCHE_MS = 250;
const TAILLE_QR_LISTE = 160;
const TAILLE_QR_IMPRESSION = 400;

export const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} F`;
export const PRIX = fcfa(FORFAIT_UNIQUE.abonnementFcfa);
export const etatPaiement = (r: Pick<Recense, "paye" | "encaisseFcfa" | "resteFcfa">) =>
  r.paye ? "Payé" : r.encaisseFcfa > 0 ? `Acompte ${fcfa(r.encaisseFcfa)} · reste ${fcfa(r.resteFcfa)}` : "Non payé";

type QrAffiche = { code: string; libelle: string; src: string };

function useQr(recense: Recense, largeur: number) {
  const [images, setImages] = useState<QrAffiche[]>([]);
  useEffect(() => {
    let annule = false;
    const liste = [
      recense.qr.plaque && recense.code ? { code: recense.code, libelle: "Plaque du portail", url: recense.qr.plaque } : null,
      recense.qr.interieur ? { code: recense.qr.interieur.code, libelle: "QR intérieur", url: recense.qr.interieur.url } : null,
    ].filter((x) => x !== null);
    void Promise.all(
      liste.map(async (q) => ({ code: q.code, libelle: q.libelle, src: await QRCode.toDataURL(q.url, { errorCorrectionLevel: "H", margin: 1, width: largeur }) })),
    ).then((r) => !annule && setImages(r));
    return () => {
      annule = true;
    };
  }, [recense, largeur]);
  return images;
}

// QR de la plaque du portail et du QR intérieur, avec leur code, à imprimer ou à montrer avant la pose.
export function QrGeneres({ recense, largeur = TAILLE_QR_IMPRESSION }: { recense: Recense; largeur?: number }) {
  const images = useQr(recense, largeur);
  if (images.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {images.map((q) => (
        <figure key={q.code} className="grid justify-items-center gap-1 rounded-2xl bg-white p-3 text-center ring-1 ring-ligne">
          <img src={q.src} alt={`QR ${q.libelle} ${q.code}`} className="aspect-square w-full max-w-48" />
          <figcaption className="text-xs">
            <span className="block font-bold">{q.libelle}</span>
            <span className="font-mono">{q.code}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Etiquette({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`rounded px-2 py-0.5 ${ok ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>{children}</span>;
}

function LigneClient({ r, montrerRecenseur }: { r: Recense; montrerRecenseur: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <li className="grid gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="grid gap-1">
        <p className="font-mono text-lg font-black tracking-wide break-all text-brand select-all">{r.code ?? "Code en attente"}</p>
        <p className="font-bold">{r.client}</p>
        <p className="text-sm text-attenue">
          {r.lieu}
          {r.telephone && ` · ${r.telephone}`}
          {r.telephone2 && ` / ${r.telephone2}`}
          {r.rccm && ` · RCCM ${r.rccm}`} · {dateHeure(r.creeLe)}
          {montrerRecenseur && r.recenseur && ` · recensé par ${r.recenseur}`}
        </p>
        <p className="flex flex-wrap gap-2 text-xs font-bold">
          <Etiquette ok={r.paye}>{etatPaiement(r)}</Etiquette>
          <Etiquette ok={r.posee}>{r.posee ? "Plaque posée" : "Plaque à poser"}</Etiquette>
          {r.cible && <span className="rounded bg-fond px-2 py-0.5 text-encre">{LIBELLES_CIBLE_DETAILLES[r.cible]}</span>}
        </p>
      </div>
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="justify-self-start rounded-lg border border-brand px-3 py-1.5 text-sm font-bold text-brand hover:bg-brand-clair"
      >
        {ouvert ? "Masquer les QR" : "Voir les QR"}
      </button>
      {ouvert && <QrGeneres recense={r} largeur={TAILLE_QR_LISTE * 2} />}
    </li>
  );
}

// Liste des clients recensés avec leur code de plaque et leurs QR : le recenseur voit ses clients, le chef d'équipe
// ceux de son équipe, le QG tous (l'API filtre). Recherche par nom, code de plaque ou téléphone.
export function ClientsRecenses({ titre, version = 0, montrerRecenseur = false }: { titre: string; version?: number; montrerRecenseur?: boolean }) {
  const [q, setQ] = useState("");
  const [liste, setListe] = useState<Recense[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    const t = setTimeout(() => {
      appelApi<Recense[]>(`/pose/recensements${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`).then(
        (r) => {
          if (annule) return;
          setListe(r);
          setErreur(null);
        },
        (e: Error) => !annule && setErreur(e.message),
      );
    }, DELAI_RECHERCHE_MS);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [q, version]);

  return (
    <section className="grid gap-2" aria-label={titre}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-bold">
          {titre}
          {liste && ` (${liste.length})`}
        </h2>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, code de plaque, téléphone…"
          aria-label="Rechercher un client recensé"
          className={`${CHAMP} sm:max-w-xs`}
        />
      </div>
      <Erreur message={erreur} />
      {!liste && !erreur && <p className="text-attenue">Chargement…</p>}
      {liste?.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-attenue">{q.trim() ? "Aucun client ne correspond à cette recherche." : "Aucun client recensé pour l'instant."}</p>
      )}
      <ul className="grid gap-2">
        {liste?.map((r) => (
          <LigneClient key={r.id} r={r} montrerRecenseur={montrerRecenseur} />
        ))}
      </ul>
    </section>
  );
}
