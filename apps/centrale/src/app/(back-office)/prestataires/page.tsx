"use client";

import { useEffect, useState } from "react";
import { LIBELLES_STATUT_UNITE, LIBELLES_TYPE_UNITE, STATUTS_UNITE, TYPES_UNITE, type StatutUnite, type TypeUnite } from "@apsig/domain";
import { Bloc, BOUTON, BOUTON_DISCRET, CHAMP, Champ, Erreur, valeur } from "@/components/Formulaire";
import { appelApi } from "@/lib/api";

const TYPES_PARTENAIRE = {
  POLICE: "Police",
  GSPM: "Sapeurs-pompiers (GSPM)",
  SAMU: "SAMU",
  AMBULANCE_PRIVEE: "Ambulance privée",
  INFIRMIER: "Infirmier à domicile",
  SECURITE_PRIVEE: "Sécurité privée",
} as const;
type TypePartenaire = keyof typeof TYPES_PARTENAIRE;

type Prestataires = {
  partenaires: { id: string; type: TypePartenaire; nom: string; telephone: string; villeCode: string | null; actif: boolean; unites: number }[];
  villes: { code: string; nom: string }[];
  unites: { id: string; nom: string; type: TypeUnite; libelleType: string; statut: StatutUnite; agents: { id: string; nom: string; actif: boolean }[] }[];
  intervenants: { id: string; nom: string; actif: boolean; unite: string | null }[];
};

// QG : prestataires (services publics et privés appelés par la centrale) et intervenants (unités terrain et leurs membres).
export default function PagePrestataires() {
  const [p, setP] = useState<Prestataires | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    appelApi<Prestataires>("/prestataires").then(setP, (e: Error) => setErreur(e.message));
  }, []);

  async function executer(action: () => Promise<Prestataires>) {
    setEnvoi(true);
    setErreur(null);
    try {
      setP(await action());
      return true;
    } catch (e) {
      setErreur((e as Error).message);
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  const villeDe = (code: string | null) => (code ? (p?.villes.find((v) => v.code === code)?.nom ?? code) : "National");

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <h1 className="text-xl font-black">Prestataires et intervenants</h1>
      <Erreur message={erreur} />
      {!p && !erreur && <p className="text-attenue">Chargement…</p>}
      {p && (
        <>
          <Bloc titre={`Prestataires (${p.partenaires.length})`}>
            <ul className="grid gap-1 text-sm">
              {p.partenaires.map((x) => (
                <li key={x.id} className={`flex flex-wrap items-center justify-between gap-2 border-t border-ligne py-1.5 ${x.actif ? "" : "text-attenue"}`}>
                  <span>
                    <span className="font-semibold">{x.nom}</span>
                    <span className="text-attenue">
                      {" "}
                      · {TYPES_PARTENAIRE[x.type]} · {villeDe(x.villeCode)}
                      {x.unites > 0 && ` · ${x.unites} unité${x.unites > 1 ? "s" : ""}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <a href={`tel:${x.telephone.replace(/[ .-]/g, "")}`} className="font-mono text-brand">
                      {x.telephone}
                    </a>
                    <button
                      disabled={envoi}
                      onClick={() => void executer(() => appelApi<Prestataires>(`/prestataires/partenaires/${x.id}`, { actif: !x.actif }, "PATCH"))}
                      className={BOUTON_DISCRET}
                    >
                      {x.actif ? "Désactiver" : "Réactiver"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const d = new FormData(form);
                void executer(() =>
                  appelApi<Prestataires>("/prestataires/partenaires", { type: d.get("type"), nom: valeur(d, "nom"), telephone: valeur(d, "telephone"), villeCode: valeur(d, "ville") }),
                ).then((ok) => ok && form.reset());
              }}
              className="mt-3 grid gap-3 border-t border-ligne pt-3 sm:grid-cols-[12rem_1fr_10rem_10rem_auto] sm:items-end"
            >
              <Champ libelle="Type">
                <select name="type" className={CHAMP}>
                  {Object.entries(TYPES_PARTENAIRE).map(([code, libelle]) => (
                    <option key={code} value={code}>
                      {libelle}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ libelle="Nom">
                <input name="nom" required minLength={2} maxLength={80} className={CHAMP} />
              </Champ>
              <Champ libelle="Téléphone">
                <input name="telephone" type="tel" required className={CHAMP} />
              </Champ>
              <Champ libelle="Ville desservie">
                <select name="ville" defaultValue="" className={CHAMP}>
                  <option value="">National</option>
                  {p.villes.map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.nom}
                    </option>
                  ))}
                </select>
              </Champ>
              <button disabled={envoi} className={BOUTON}>
                Ajouter
              </button>
            </form>
          </Bloc>

          <Bloc titre={`Unités d'intervention (${p.unites.length})`}>
            <ul className="grid gap-1 text-sm">
              {p.unites.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-ligne py-1.5">
                  <span>
                    <span className="font-semibold">{u.nom}</span>
                    <span className="text-attenue">
                      {" "}
                      · {u.libelleType} · {u.agents.filter((a) => a.actif).map((a) => a.nom).join(", ") || "aucun intervenant"}
                    </span>
                  </span>
                  <select
                    value={u.statut}
                    disabled={envoi}
                    onChange={(e) => void executer(() => appelApi<Prestataires>(`/prestataires/unites/${u.id}`, { statut: e.target.value }, "PATCH"))}
                    className="rounded border border-ligne bg-white px-2 py-1"
                    aria-label={`Statut de ${u.nom}`}
                  >
                    {STATUTS_UNITE.map((s) => (
                      <option key={s} value={s}>
                        {LIBELLES_STATUT_UNITE[s]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const d = new FormData(form);
                void executer(() => appelApi<Prestataires>("/prestataires/unites", { nom: valeur(d, "nom"), type: d.get("type") })).then((ok) => ok && form.reset());
              }}
              className="mt-3 grid gap-3 border-t border-ligne pt-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
            >
              <Champ libelle="Nom de l'unité">
                <input name="nom" required minLength={2} maxLength={60} className={CHAMP} />
              </Champ>
              <Champ libelle="Type">
                <select name="type" className={CHAMP}>
                  {TYPES_UNITE.map((t) => (
                    <option key={t} value={t}>
                      {LIBELLES_TYPE_UNITE[t]}
                    </option>
                  ))}
                </select>
              </Champ>
              <button disabled={envoi} className={BOUTON}>
                Ajouter
              </button>
            </form>
          </Bloc>

          <Bloc titre={`Intervenants (${p.intervenants.length})`}>
            {p.intervenants.length === 0 && <p className="text-sm text-attenue">Aucun intervenant.</p>}
            <ul className="grid gap-1 text-sm">
              {p.intervenants.map((i) => (
                <li key={i.id} className={`flex justify-between border-t border-ligne py-1.5 ${i.actif ? "" : "text-attenue"}`}>
                  <span className="font-semibold">{i.nom}</span>
                  <span className="text-attenue">{i.unite ?? "sans unité"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-attenue">Les comptes d&apos;intervenants se créent dans Personnel (rôle « Intervenant »), avec leur unité.</p>
          </Bloc>
        </>
      )}
    </div>
  );
}
