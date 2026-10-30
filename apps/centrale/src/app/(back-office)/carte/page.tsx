"use client";

import { useRouter } from "next/navigation";
import { LIBELLES_STATUT } from "@apsig/domain";
import { Carte } from "@/components/Carte";
import { useCentrale } from "@/components/Centrale";
import { STYLE_URGENCE } from "@/components/Icone";
import { duree, useMaintenant } from "@/lib/format";

// Vue d'ensemble des alertes en cours : où sont les incidents, lesquels n'ont pas de position.
export default function PageCarte() {
  const router = useRouter();
  const maintenant = useMaintenant();
  const centrale = useCentrale();
  if (!centrale) return <p className="p-6 text-attenue">Carte réservée à la centrale.</p>;
  const { file } = centrale;
  if (!file) return <p className="p-6 text-attenue">Chargement…</p>;

  const alertes = [...file.mesAlertes, ...file.aPrendre.alertes, ...(file.autres ?? [])];
  const situees = alertes.filter((a) => a.position);
  const ouvrir = (numero: string) => router.push(`/?alerte=${numero}`);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_20rem]">
      <Carte
        className="h-[calc(100dvh-8rem)] min-h-96 overflow-hidden rounded-2xl shadow-sm"
        onChoisir={ouvrir}
        points={situees.map((a) => ({
          ...a.position!,
          type: a.type,
          numero: a.numero,
          libelle: `${a.numero} · ${a.urgence} · ${LIBELLES_STATUT[a.statut]}${a.attribueeA ? ` · ${a.attribueeA.nom}` : ""}`,
        }))}
      />
      <aside className="grid content-start gap-2">
        <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">
          {alertes.length} alerte{alertes.length > 1 ? "s" : ""} en cours · {alertes.length - situees.length} sans position
        </h2>
        {alertes.map((a) => (
          <button key={a.numero} onClick={() => ouvrir(a.numero)} className="grid gap-0.5 rounded-xl bg-white px-3 py-2 text-left text-sm shadow-sm hover:ring-2 hover:ring-ligne">
            <span className={`flex justify-between gap-2 font-bold ${STYLE_URGENCE[a.type].texte}`}>
              {a.urgence}
              <span className="font-mono text-xs text-encre tabular-nums">{duree(a.creeLe, maintenant)}</span>
            </span>
            <span className="text-xs text-attenue">
              {a.numero} · {a.lieu ?? a.support.libelle} {!a.position && "· position inconnue"}
            </span>
          </button>
        ))}
      </aside>
    </div>
  );
}
