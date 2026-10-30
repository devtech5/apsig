"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { BOUTON, Erreur } from "@/components/Formulaire";
import { Icone } from "@/components/Icone";
import type { Foyer, Support } from "@/lib/abonnements";
import { appelApi } from "@/lib/api";

type Etiquette = Support & { qr: string };

// Planche à imprimer : une étiquette par support, à découper. Aucun nom ni adresse n'y figure :
// le QR mène à la page d'alerte, qui n'affiche que le quartier.
export default function PageImpression() {
  const { id } = useParams<{ id: string }>();
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelApi<Foyer>(`/abonnements/foyers/${id}`)
      .then(async (f) => {
        setFoyer(f);
        const actifs = f.supports.filter((s) => s.statut === "ACTIF");
        // Correction d'erreur élevée : le QR reste lisible même rayé ou sali (plaque au portail).
        setEtiquettes(await Promise.all(actifs.map(async (s) => ({ ...s, qr: await QRCode.toDataURL(s.url, { errorCorrectionLevel: "H", margin: 1, width: 600 }) }))));
        setChoisis(new Set(actifs.map((s) => s.id)));
      })
      .catch((e: Error) => setErreur(e.message));
  }, [id]);

  const basculer = (sid: string) =>
    setChoisis((c) => {
      const n = new Set(c);
      if (n.has(sid)) n.delete(sid);
      else n.add(sid);
      return n;
    });

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 print:block print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/abonnements/${id}`} className="text-sm text-brand underline">
          ← {foyer?.libelle ?? "Foyer"}
        </Link>
        <h1 className="mr-auto text-xl font-black">Impression des QR</h1>
        <button onClick={() => window.print()} disabled={choisis.size === 0} className={`${BOUTON} flex items-center gap-1.5`}>
          <Icone nom="imprimante" className="size-4" /> Imprimer ({choisis.size})
        </button>
      </div>
      <Erreur message={erreur} />

      {foyer && etiquettes.length === 0 && <p className="rounded-xl bg-white p-6 text-attenue print:hidden">Aucun support actif à imprimer.</p>}

      {etiquettes.length > 0 && (
        <fieldset className="flex flex-wrap gap-3 rounded-xl bg-white p-3 text-sm print:hidden">
          <legend className="sr-only">Supports à imprimer</legend>
          {etiquettes.map((e) => (
            <label key={e.id} className="flex items-center gap-2">
              <input type="checkbox" checked={choisis.has(e.id)} onChange={() => basculer(e.id)} />
              <span className="font-mono">{e.code}</span>
              <span className="text-attenue">{e.libelle}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(85mm,1fr))] gap-4 print:grid-cols-2 print:gap-[6mm]">
        {etiquettes
          .filter((e) => choisis.has(e.id))
          .map((e) => (
            <article key={e.id} className="grid break-inside-avoid justify-items-center gap-2 rounded-2xl border-2 border-dashed border-ligne bg-white p-4 text-center print:rounded-none">
              <header className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2 text-white print:[print-color-adjust:exact]">
                <img src="/logo-apsig.svg" alt="" className="h-7 w-6" />
                <span className="text-left leading-tight">
                  <span className="block text-lg font-black tracking-wide">CODE-SECOURS</span>
                  <span className="block text-[10px] font-semibold text-white/80">APSIG · CENTRALE 24H/24</span>
                </span>
              </header>
              <p className="text-base font-black text-red-700 uppercase print:[print-color-adjust:exact]">En cas d'urgence, scannez</p>
              <img src={e.qr} alt={`QR du support ${e.code}`} className="aspect-square w-[60mm] max-w-full" />
              <p className="font-mono text-lg font-black tracking-wide">{e.code}</p>
              <p className="text-xs text-attenue">Sans internet : Police 170 · Pompiers 180 · SAMU 185</p>
            </article>
          ))}
      </div>
    </div>
  );
}
