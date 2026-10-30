"use client";

import { useState } from "react";
import { LIBELLES_MOYEN_PAIEMENT, MOYENS_PAIEMENT, SUPPORTS } from "@apsig/domain";
import type { Formule, Referentiel } from "@/lib/abonnements";
import { fcfa } from "@/lib/abonnements";
import type { Position } from "@/lib/api";
import { Carte } from "./Carte";
import { CHAMP, Champ, valeur } from "./Formulaire";

// Ville, quartier et point sur la carte. Le point exact sera confirmé sur place par l'agent de pose.
export function ChoixAdresse({
  referentiel,
  quartierId,
  onQuartier,
  position,
  onPosition,
}: {
  referentiel: Referentiel;
  quartierId: string;
  onQuartier: (id: string) => void;
  position: Position | null;
  onPosition: (p: Position | null) => void;
}) {
  const villeDuQuartier = referentiel.villes.find((v) => v.quartiers.some((q) => q.id === quartierId));
  const [villeId, setVilleId] = useState(villeDuQuartier?.id ?? referentiel.villes[0]?.id ?? "");
  const ville = referentiel.villes.find((v) => v.id === villeId);
  const quartier = ville?.quartiers.find((q) => q.id === quartierId);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Ville">
          <select
            value={villeId}
            onChange={(e) => {
              setVilleId(e.target.value);
              onQuartier("");
            }}
            className={CHAMP}
          >
            {referentiel.villes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Quartier">
          <select value={quartierId} onChange={(e) => onQuartier(e.target.value)} required className={CHAMP}>
            <option value="">Choisir…</option>
            {ville?.quartiers.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nom}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <div className="relative overflow-hidden rounded-xl ring-1 ring-ligne">
        <Carte
          className="h-72"
          points={position ? [{ ...position, libelle: "Adresse du foyer" }] : []}
          centre={quartier ?? null}
          onPlacer={onPosition}
        />
        <p className="pointer-events-none absolute top-2 left-2 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-semibold shadow">
          {position ? "Cliquez ailleurs pour déplacer le point" : "Cliquez sur la maison pour la placer (facultatif)"}
        </p>
        {position && (
          <button type="button" onClick={() => onPosition(null)} className="absolute bottom-2 left-2 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-danger shadow">
            Retirer le point
          </button>
        )}
      </div>
    </div>
  );
}

// Formule, durée et encaissement. `lireSouscription` relit ces champs dans le FormData du formulaire parent.
export function ChampsSouscription({ formules, facultative = false }: { formules: Formule[]; facultative?: boolean }) {
  const [formuleId, setFormuleId] = useState(facultative ? "" : (formules[0]?.id ?? ""));
  const [paye, setPaye] = useState(true);
  const formule = formules.find((f) => f.id === formuleId);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Champ libelle="Formule">
          <select name="formuleId" value={formuleId} onChange={(e) => setFormuleId(e.target.value)} required={!facultative} className={CHAMP}>
            {facultative && <option value="">Pas d'abonnement pour l'instant</option>}
            {formules.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom} · {fcfa(f.prixFcfa)}
              </option>
            ))}
          </select>
        </Champ>
        {formule && (
          <Champ libelle="Durée (mois)">
            <input key={formule.id} name="mois" type="number" min={1} max={36} defaultValue={Math.max(1, formule.moisInclus)} required className={CHAMP} />
          </Champ>
        )}
      </div>
      {formule && (
        <>
          <p className="text-xs text-attenue">
            Fournit : {formule.composition.map((c) => `${c.quantite} ${SUPPORTS[c.type].libelle.toLowerCase()}`).join(", ")} (seuls les supports manquants sont créés).
            {formule.prixMensuelFcfa != null && ` Puis ${fcfa(formule.prixMensuelFcfa)} par mois.`}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="essai" /> Période d'essai
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={paye} onChange={(e) => setPaye(e.target.checked)} /> Paiement reçu
            </label>
          </div>
          {paye && (
            <div className="grid gap-3 rounded-xl bg-fond p-3 sm:grid-cols-2">
              <Champ libelle="Montant (FCFA)">
                <input key={formule.id} name="montantFcfa" type="number" min={0} step={100} defaultValue={formule.prixFcfa} required className={CHAMP} />
              </Champ>
              <Champ libelle="Moyen de paiement">
                <select name="operateur" defaultValue="ORANGE_MONEY" className={CHAMP}>
                  {MOYENS_PAIEMENT.map((m) => (
                    <option key={m} value={m}>
                      {LIBELLES_MOYEN_PAIEMENT[m]}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ libelle="Référence de la transaction" aide="Facultatif ; évite d'enregistrer deux fois le même paiement">
                <input name="reference" maxLength={64} className={CHAMP} />
              </Champ>
              <Champ libelle="Téléphone du payeur">
                <input name="telephonePayeur" type="tel" className={CHAMP} />
              </Champ>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function lireSouscription(f: FormData) {
  const formuleId = valeur(f, "formuleId");
  if (!formuleId) return undefined;
  const montant = valeur(f, "montantFcfa");
  return {
    formuleId,
    mois: Number(f.get("mois")),
    essai: f.get("essai") === "on",
    ...(montant !== null && {
      paiement: {
        montantFcfa: Number(montant),
        operateur: String(f.get("operateur")),
        ...(valeur(f, "reference") && { reference: valeur(f, "reference") }),
        ...(valeur(f, "telephonePayeur") && { telephone: valeur(f, "telephonePayeur") }),
      },
    }),
  };
}
