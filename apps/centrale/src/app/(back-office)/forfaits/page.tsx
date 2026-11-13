"use client";

import { useEffect, useState } from "react";
import { SUPPORTS, type TypeSupport } from "@apsig/domain";
import { Bloc, BOUTON, BOUTON_DISCRET, CHAMP, Champ, Erreur, valeur } from "@/components/Formulaire";
import { appelApi } from "@/lib/api";

type Formule = {
  id: string;
  code: string;
  nom: string;
  prixFcfa: number;
  prixMensuelFcfa: number | null;
  moisInclus: number;
  actif: boolean;
  composition: { type: TypeSupport; quantite: number }[];
  abonnementsEnCours: number;
};

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} F`;
const nombre = (f: FormData, nom: string) => {
  const v = valeur(f, nom);
  return v == null ? null : Number(v);
};

// QG : forfaits vendus (prix d'entrée, mensualité, supports), création, retrait de la vente et migration des abonnés.
export default function PageForfaits() {
  const [formules, setFormules] = useState<Formule[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);

  useEffect(() => {
    appelApi<Formule[]>("/forfaits").then(setFormules, (e: Error) => setErreur(e.message));
  }, []);

  async function executer(action: () => Promise<Formule[]>, message?: string) {
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setFormules(await action());
      if (message) setInfo(message);
      return true;
    } catch (e) {
      setErreur((e as Error).message);
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  async function creer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const ok = await executer(
      () =>
        appelApi<Formule[]>("/forfaits", {
          code: valeur(d, "code"),
          nom: valeur(d, "nom"),
          prixFcfa: nombre(d, "prix"),
          prixMensuelFcfa: nombre(d, "mensuel"),
          moisInclus: nombre(d, "mois") ?? 0,
        }),
      "Forfait créé.",
    );
    if (ok) form.reset();
  }

  async function migrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const de = formules?.find((f) => f.id === d.get("de"));
    const vers = formules?.find((f) => f.id === d.get("vers"));
    if (!de || !vers) return;
    if (!confirm(`Passer les ${de.abonnementsEnCours} abonnement(s) en cours de « ${de.nom} » sur « ${vers.nom} » ? La mensualité suivra le nouveau forfait.`)) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelApi<{ migres: number; formules: Formule[] }>("/forfaits/migrer", { de: de.id, vers: vers.id });
      setFormules(r.formules);
      setInfo(`${r.migres} abonnement(s) migré(s) vers « ${vers.nom} ».`);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <h1 className="text-xl font-black">Forfaits et abonnements</h1>
      <Erreur message={erreur} />
      {info && <p role="status" className="rounded-xl bg-succes-fond px-4 py-3 text-sm font-semibold text-succes">{info}</p>}
      {!formules && !erreur && <p className="text-attenue">Chargement…</p>}

      {formules && (
        <Bloc titre={`Forfaits (${formules.length})`}>
          <ul className="grid gap-2">
            {formules.map((f) => (
              <li key={f.id} className={`grid gap-2 rounded-xl bg-fond p-3 text-sm ${f.actif ? "" : "opacity-70"}`}>
                {edition === f.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void executer(
                        () =>
                          appelApi<Formule[]>(
                            `/forfaits/${f.id}`,
                            { nom: valeur(d, "nom"), prixFcfa: nombre(d, "prix"), prixMensuelFcfa: nombre(d, "mensuel"), moisInclus: nombre(d, "mois") ?? 0 },
                            "PATCH",
                          ),
                        "Forfait modifié : les nouveaux prix valent pour les prochaines souscriptions.",
                      ).then((ok) => ok && setEdition(null));
                    }}
                    className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_6rem_auto] sm:items-end"
                  >
                    <Champ libelle="Nom">
                      <input name="nom" defaultValue={f.nom} required className={CHAMP} />
                    </Champ>
                    <Champ libelle="Entrée (F)">
                      <input name="prix" type="number" min={0} step={100} defaultValue={f.prixFcfa} required className={CHAMP} />
                    </Champ>
                    <Champ libelle="Mensualité (F)">
                      <input name="mensuel" type="number" min={0} step={100} defaultValue={f.prixMensuelFcfa ?? ""} className={CHAMP} />
                    </Champ>
                    <Champ libelle="Mois inclus">
                      <input name="mois" type="number" min={0} max={24} defaultValue={f.moisInclus} className={CHAMP} />
                    </Champ>
                    <span className="flex gap-1">
                      <button disabled={envoi} className={BOUTON}>
                        Enregistrer
                      </button>
                      <button type="button" onClick={() => setEdition(null)} className={BOUTON_DISCRET}>
                        Annuler
                      </button>
                    </span>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="font-bold">{f.nom}</span>
                      <span className="ml-2 font-mono text-xs text-attenue">{f.code}</span>
                      {!f.actif && <span className="ml-2 rounded bg-alerte-fond px-1.5 py-0.5 text-xs font-bold text-alerte-encre">retiré de la vente</span>}
                      <span className="block text-attenue">
                        {fcfa(f.prixFcfa)} à l&apos;entrée{f.moisInclus > 0 && `, ${f.moisInclus} mois compris`}
                        {f.prixMensuelFcfa != null && ` · ${fcfa(f.prixMensuelFcfa)}/mois`} ·{" "}
                        {f.composition.map((c) => `${c.quantite} ${SUPPORTS[c.type].libelle.toLowerCase()}`).join(", ")}
                      </span>
                      <span className="block text-xs text-attenue">
                        {f.abonnementsEnCours} abonnement{f.abonnementsEnCours > 1 ? "s" : ""} en cours
                      </span>
                    </span>
                    <span className="flex gap-1">
                      <button disabled={envoi} onClick={() => setEdition(f.id)} className={BOUTON_DISCRET}>
                        Modifier
                      </button>
                      <button
                        disabled={envoi}
                        onClick={() => void executer(() => appelApi<Formule[]>(`/forfaits/${f.id}`, { actif: !f.actif }, "PATCH"))}
                        className={BOUTON_DISCRET}
                      >
                        {f.actif ? "Retirer de la vente" : "Remettre en vente"}
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Bloc>
      )}

      {formules && (
        <Bloc titre="Migrer des abonnements">
          <form onSubmit={migrer} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Champ libelle="Forfait de départ">
              <select name="de" required className={CHAMP}>
                {formules
                  .filter((f) => f.abonnementsEnCours > 0)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom} ({f.abonnementsEnCours})
                    </option>
                  ))}
              </select>
            </Champ>
            <Champ libelle="Forfait d'arrivée">
              <select name="vers" required className={CHAMP}>
                {formules
                  .filter((f) => f.actif)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
              </select>
            </Champ>
            <button disabled={envoi || !formules.some((f) => f.abonnementsEnCours > 0)} className={BOUTON}>
              Migrer
            </button>
          </form>
          <p className="mt-2 text-xs text-attenue">Les abonnements en cours changent de forfait sans changer de période ; la mensualité suivra le nouveau forfait.</p>
        </Bloc>
      )}

      <Bloc titre="Nouveau forfait ou option">
        <form onSubmit={creer} className="grid gap-3 sm:grid-cols-[10rem_2fr_1fr_1fr_6rem_auto] sm:items-end">
          <Champ libelle="Code">
            <input name="code" required pattern="[A-Za-z0-9_]{3,40}" placeholder="OPTION_BRACELET" className={`${CHAMP} uppercase`} />
          </Champ>
          <Champ libelle="Nom">
            <input name="nom" required minLength={2} maxLength={80} className={CHAMP} />
          </Champ>
          <Champ libelle="Entrée (F)">
            <input name="prix" type="number" min={0} step={100} required className={CHAMP} />
          </Champ>
          <Champ libelle="Mensualité (F)">
            <input name="mensuel" type="number" min={0} step={100} className={CHAMP} />
          </Champ>
          <Champ libelle="Mois inclus">
            <input name="mois" type="number" min={0} max={24} defaultValue={0} className={CHAMP} />
          </Champ>
          <button disabled={envoi} className={BOUTON}>
            Créer
          </button>
        </form>
        <p className="mt-2 text-xs text-attenue">Fournit par défaut une plaque de portail et un QR intérieur.</p>
      </Bloc>
    </div>
  );
}
