import { useEffect, useState } from "react";
import { LIBELLES_STATUT_UNITE } from "@apsig/domain";
import { appelApi, type AlerteDetail, type UniteCentrale } from "@/lib/api";
import { duree } from "@/lib/format";

// Unité terrain engagée sur l'alerte : ses agents reçoivent la mission sur l'application mobile.
export function UniteTerrain({ a, maintenant, envoi, envoyer }: { a: AlerteDetail; maintenant: number; envoi: boolean; envoyer: (chemin: string, corps: unknown) => Promise<boolean> }) {
  const [unites, setUnites] = useState<UniteCentrale[] | null>(null);
  const [choix, setChoix] = useState("");

  useEffect(() => {
    void appelApi<UniteCentrale[]>("/centrale/unites").then(setUnites, () => setUnites([]));
  }, [a.unite?.id]);

  const u = a.unite;
  const disponibles = unites?.filter((x) => x.statut === "DISPONIBLE" && x.id !== u?.id) ?? [];
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-xs font-bold tracking-wide text-attenue uppercase">Unité terrain</h2>
      {u ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold">{u.nom}</span>
          <span className="rounded bg-brand-clair px-1.5 py-0.5 text-xs font-semibold text-brand">{LIBELLES_STATUT_UNITE[u.statut]}</span>
          {u.termineeLe ? (
            <span className="rounded bg-succes-fond px-1.5 py-0.5 text-xs font-semibold text-succes">Mission terminée : clôturez l'alerte</span>
          ) : (
            u.engageeLe && <span className="text-attenue">engagée il y a {duree(u.engageeLe, maintenant)}</span>
          )}
          {u.position?.le && <span className="text-attenue">· position il y a {duree(u.position.le, maintenant)}</span>}
          <button disabled={envoi} onClick={() => confirm(`Retirer ${u.nom} de l'alerte ?`) && void envoyer("/unite", { uniteId: null })} className="ml-auto text-xs text-danger underline">
            Retirer
          </button>
        </div>
      ) : (
        <p className="text-sm text-attenue">Aucune unité engagée.</p>
      )}
      {!u?.termineeLe && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (choix) void envoyer("/unite", { uniteId: choix }).then((ok) => ok && setChoix(""));
          }}
          className="mt-3 flex flex-wrap gap-2"
        >
          <select value={choix} onChange={(e) => setChoix(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-ligne px-2 py-1.5 text-sm" aria-label="Unité à engager">
            <option value="">{unites === null ? "Chargement…" : disponibles.length ? (u ? "Remplacer par…" : "Choisir une unité disponible") : "Aucune unité disponible"}</option>
            {disponibles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom} · {x.libelleType}
                {x.agents.length ? ` (${x.agents.join(", ")})` : ""}
              </option>
            ))}
          </select>
          <button disabled={envoi || !choix} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">
            Engager
          </button>
        </form>
      )}
    </section>
  );
}
