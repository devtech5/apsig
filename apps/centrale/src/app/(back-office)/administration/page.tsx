"use client";

import { useCallback, useEffect, useState } from "react";
import { LIBELLES_ROLE, LIBELLES_STATUT_UNITE, LIBELLES_TYPE_UNITE, peutGererRole, ROLES, TYPES_UNITE, type Role, type StatutUnite } from "@apsig/domain";
import { Bloc, BOUTON, BOUTON_DISCRET, CHAMP, Champ, Erreur, valeur } from "@/components/Formulaire";
import { useSession } from "@/components/Session";
import { appelApi } from "@/lib/api";
import { dateHeure } from "@/lib/format";

type CompteAdmin = {
  id: string;
  nom: string;
  email: string;
  role: Role;
  actif: boolean;
  deuxFacteurs: boolean;
  presence: "EN_SERVICE" | "PAUSE" | "HORS_SERVICE";
  enLigne: boolean;
  vuLe: string | null;
  creeLe: string;
  gerable: boolean;
  unite: { id: string; nom: string } | null;
};
type UniteAdmin = { id: string; nom: string; type: string; libelleType: string; statut: StatutUnite; agents: { id: string; nom: string; actif: boolean }[] };
type Journal = { total: number; page: number; parPage: number; entrees: { id: string; le: string; action: string; cible: string; details: unknown; auteur: string | null }[] };

// Mot de passe à remettre en main propre : affiché une seule fois, jamais stocké en clair.
type Secret = { pour: string; motDePasse: string };

const FAMILLES_AUDIT: [string, string][] = [
  ["", "Toutes les actions"],
  ["compte.", "Comptes"],
  ["alerte.", "Alertes"],
  ["operateur.", "Présence des opérateurs"],
  ["repartition.", "Mode crise"],
  ["foyer.", "Foyers"],
  ["abonnement.", "Abonnements"],
  ["support.", "Supports (QR)"],
  ["membre.", "Membres"],
  ["contact.", "Contacts"],
];

export default function PageAdministration() {
  const { compte } = useSession();
  const [comptes, setComptes] = useState<CompteAdmin[] | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const rolesPermis = ROLES.filter((r) => peutGererRole(compte.role, r));

  const [unites, setUnites] = useState<UniteAdmin[] | null>(null);
  const charger = useCallback(() => appelApi<CompteAdmin[]>("/administration/comptes").then(setComptes, (e: Error) => setErreur(e.message)), []);
  const chargerUnites = useCallback(() => appelApi<UniteAdmin[]>("/administration/unites").then(setUnites, (e: Error) => setErreur(e.message)), []);
  useEffect(() => {
    void charger();
    void chargerUnites();
  }, [charger, chargerUnites]);

  async function executer<T>(action: () => Promise<T>) {
    setEnvoi(true);
    setErreur(null);
    try {
      return await action();
    } catch (e) {
      setErreur((e as Error).message);
      return null;
    } finally {
      setEnvoi(false);
    }
  }

  async function creer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const r = await executer(() =>
      appelApi<{ compte: { email: string }; motDePasse: string }>("/administration/comptes", { nom: valeur(d, "nom"), email: valeur(d, "email"), role: d.get("role") }),
    );
    if (r) {
      setSecret({ pour: r.compte.email, motDePasse: r.motDePasse });
      form.reset();
      void charger();
    }
  }

  const modifier = (c: CompteAdmin, corps: Partial<Pick<CompteAdmin, "role" | "actif">> & { uniteId?: string | null }) =>
    executer(async () => {
      setComptes(await appelApi<CompteAdmin[]>(`/administration/comptes/${c.id}`, corps, "PATCH"));
      if (corps.uniteId !== undefined) void chargerUnites();
    });

  async function creerUnite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const r = await executer(() => appelApi<UniteAdmin[]>("/administration/unites", { nom: valeur(d, "nom"), type: d.get("type") }));
    if (r) {
      setUnites(r);
      form.reset();
    }
  }

  const modifierUnite = (u: UniteAdmin, corps: { statut: StatutUnite }) =>
    executer(async () => setUnites(await appelApi<UniteAdmin[]>(`/administration/unites/${u.id}`, corps, "PATCH")));

  async function reinitialiser(c: CompteAdmin) {
    if (!confirm(`Réinitialiser le mot de passe de ${c.nom} ? Ses sessions seront fermées et la double authentification sera à refaire.`)) return;
    const r = await executer(() => appelApi<{ motDePasse: string }>(`/administration/comptes/${c.id}/reinitialiser`, {}));
    if (r) {
      setSecret({ pour: c.email, motDePasse: r.motDePasse });
      void charger();
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4">
      <h1 className="text-xl font-black">Administration</h1>
      <Erreur message={erreur} />
      {secret && (
        <div role="status" className="grid gap-2 rounded-2xl border-2 border-brand bg-brand-clair p-4">
          <p className="text-sm">
            Mot de passe de <strong>{secret.pour}</strong>, à remettre en main propre. Il ne sera plus affiché ; la personne activera sa double authentification à la
            première connexion.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-white px-3 py-2 font-mono text-lg font-bold tracking-wider select-all">{secret.motDePasse}</code>
            <button onClick={() => void navigator.clipboard?.writeText(secret.motDePasse)} className={BOUTON_DISCRET}>
              Copier
            </button>
            <button onClick={() => setSecret(null)} className={`${BOUTON_DISCRET} ml-auto`}>
              C'est noté, masquer
            </button>
          </div>
        </div>
      )}

      <Bloc titre="Nouveau compte">
        <form onSubmit={creer} className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end">
          <Champ libelle="Nom">
            <input name="nom" required minLength={2} maxLength={80} className={CHAMP} />
          </Champ>
          <Champ libelle="E-mail">
            <input name="email" type="email" required maxLength={120} className={CHAMP} />
          </Champ>
          <Champ libelle="Rôle">
            <select name="role" defaultValue="OPERATEUR" className={CHAMP}>
              {rolesPermis.map((r) => (
                <option key={r} value={r}>
                  {LIBELLES_ROLE[r]}
                </option>
              ))}
            </select>
          </Champ>
          <button disabled={envoi} className={BOUTON}>
            Créer
          </button>
        </form>
      </Bloc>

      <Bloc titre={`Comptes${comptes ? ` (${comptes.length})` : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="text-left text-xs text-attenue">
              <tr>
                <th className="py-1.5 font-semibold">Compte</th>
                <th className="py-1.5 font-semibold">Rôle</th>
                <th className="py-1.5 font-semibold">Sécurité</th>
                <th className="py-1.5 font-semibold">Activité</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {comptes?.map((c) => (
                <tr key={c.id} className={`border-t border-ligne align-middle ${c.actif ? "" : "text-attenue"}`}>
                  <td className="py-2">
                    <span className="font-semibold">{c.nom}</span>
                    {c.id === compte.id && <span className="ml-1 text-xs text-attenue">(vous)</span>}
                    <span className="block text-xs text-attenue">{c.email}</span>
                  </td>
                  <td className="py-2">
                    {c.gerable && c.actif ? (
                      <select
                        value={c.role}
                        disabled={envoi}
                        onChange={(e) => void modifier(c, { role: e.target.value as Role })}
                        className="rounded border border-ligne bg-white px-2 py-1"
                        aria-label={`Rôle de ${c.nom}`}
                      >
                        {rolesPermis.map((r) => (
                          <option key={r} value={r}>
                            {LIBELLES_ROLE[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      LIBELLES_ROLE[c.role]
                    )}
                    {c.role === "INTERVENANT" &&
                      (c.gerable && c.actif ? (
                        <select
                          value={c.unite?.id ?? ""}
                          disabled={envoi}
                          onChange={(e) => void modifier(c, { uniteId: e.target.value || null })}
                          className="mt-1 block rounded border border-ligne bg-white px-2 py-1 text-xs"
                          aria-label={`Unité de ${c.nom}`}
                        >
                          <option value="">Sans unité</option>
                          {unites?.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nom}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="block text-xs text-attenue">{c.unite?.nom ?? "Sans unité"}</span>
                      ))}
                  </td>
                  <td className="py-2 text-xs">
                    {!c.actif ? (
                      <span className="rounded bg-fond px-1.5 py-0.5 font-semibold">Désactivé</span>
                    ) : c.deuxFacteurs ? (
                      <span className="rounded bg-succes-fond px-1.5 py-0.5 font-semibold text-succes">2FA active</span>
                    ) : (
                      <span className="rounded bg-alerte-fond px-1.5 py-0.5 font-semibold text-alerte-encre">2FA à activer</span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-attenue">
                    {c.enLigne ? <span className="font-semibold text-succes">En ligne</span> : c.vuLe ? `Vu le ${dateHeure(c.vuLe)}` : "Jamais connecté à la centrale"}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {c.gerable && (
                      <>
                        {c.actif && (
                          <button disabled={envoi} onClick={() => void reinitialiser(c)} className="mr-2 text-xs text-brand underline">
                            Réinitialiser
                          </button>
                        )}
                        <button
                          disabled={envoi}
                          onClick={() => (c.actif ? confirm(`Désactiver le compte de ${c.nom} ? Ses sessions seront fermées.`) : true) && void modifier(c, { actif: !c.actif })}
                          className={`text-xs underline ${c.actif ? "text-danger" : "text-brand"}`}
                        >
                          {c.actif ? "Désactiver" : "Réactiver"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>

      <Bloc titre={`Unités terrain${unites ? ` (${unites.length})` : ""}`}>
        <form onSubmit={creerUnite} className="mb-3 grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <Champ libelle="Nom de l'unité">
            <input name="nom" required minLength={2} maxLength={60} placeholder="Patrouille Cocody 1" className={CHAMP} />
          </Champ>
          <Champ libelle="Type">
            <select name="type" defaultValue={TYPES_UNITE[0]} className={CHAMP}>
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
        <p className="mb-2 text-xs text-attenue">Les intervenants rattachés à une unité reçoivent ses missions sur l'application mobile APSIG.</p>
        <ul className="grid gap-1 text-sm">
          {unites?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ligne py-2">
              <span className="font-semibold">{u.nom}</span>
              <span className="text-xs text-attenue">{u.libelleType}</span>
              <span className="text-xs text-attenue">
                {u.agents.filter((a) => a.actif).map((a) => a.nom).join(", ") || "Aucun intervenant"}
              </span>
              <select
                value={u.statut}
                disabled={envoi || u.statut === "EN_MISSION"}
                onChange={(e) => void modifierUnite(u, { statut: e.target.value as StatutUnite })}
                className="ml-auto rounded border border-ligne bg-white px-2 py-1 text-xs"
                aria-label={`Statut de ${u.nom}`}
              >
                {(Object.keys(LIBELLES_STATUT_UNITE) as StatutUnite[]).map((s) => (
                  <option key={s} value={s} disabled={s === "EN_MISSION" && u.statut !== "EN_MISSION"}>
                    {LIBELLES_STATUT_UNITE[s]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        {unites?.length === 0 && <p className="text-sm text-attenue">Aucune unité.</p>}
      </Bloc>

      <JournalAudit />
    </div>
  );
}

function JournalAudit() {
  const [famille, setFamille] = useState("");
  const [page, setPage] = useState(1);
  const [j, setJ] = useState<Journal | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelApi<Journal>(`/administration/journal?page=${page}${famille ? `&action=${encodeURIComponent(famille)}` : ""}`).then(setJ, (e: Error) => setErreur(e.message));
  }, [famille, page]);

  const pages = j ? Math.max(1, Math.ceil(j.total / j.parPage)) : 1;
  return (
    <Bloc
      titre="Journal d'audit"
      action={
        <select
          value={famille}
          onChange={(e) => {
            setFamille(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-ligne px-2 py-1 text-sm"
          aria-label="Type d'action"
        >
          {FAMILLES_AUDIT.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      }
    >
      <Erreur message={erreur} />
      <ol className="grid gap-1 text-sm">
        {j?.entrees.map((e) => (
          <li key={e.id} className="grid gap-x-3 border-b border-ligne py-1.5 last:border-0 sm:grid-cols-[8rem_10rem_1fr]">
            <span className="font-mono text-xs text-attenue">{dateHeure(e.le)}</span>
            <span className="font-semibold">{e.action}</span>
            <span>
              {e.cible}
              <span className="text-attenue"> · {e.auteur ?? "système"}</span>
              {e.details != null && Object.keys(e.details as object).length > 0 && (
                <span className="block truncate font-mono text-xs text-attenue" title={JSON.stringify(e.details)}>
                  {JSON.stringify(e.details)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {j?.total === 0 && <p className="text-sm text-attenue">Aucune entrée.</p>}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={BOUTON_DISCRET}>
            ← Plus récentes
          </button>
          <span className="text-attenue">
            Page {page} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={BOUTON_DISCRET}>
            Plus anciennes →
          </button>
        </div>
      )}
    </Bloc>
  );
}
