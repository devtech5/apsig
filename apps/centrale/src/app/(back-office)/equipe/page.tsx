"use client";

import { useCallback, useEffect, useState } from "react";
import { LIBELLES_ROLE, type Role } from "@apsig/domain";
import { Bloc, BOUTON, BOUTON_DISCRET, CHAMP, Champ, Erreur, valeur } from "@/components/Formulaire";
import { useSession } from "@/components/Session";
import { appelApi } from "@/lib/api";
import { dateHeure } from "@/lib/format";

type Membre = {
  id: string;
  nom: string;
  identifiant: string;
  role: Role;
  actif: boolean;
  chef: string | null;
  gerable: boolean;
  recenses: number;
  payes: number;
  plaquesPosees: number;
  posesEffectuees: number;
};
type Tableau = {
  membres: Membre[];
  recensements: { id: string; code: string | null; client: string; lieu: string; recenseur: string | null; paye: boolean; posee: boolean; creeLe: string }[];
};
type Secret = { pour: string; motDePasse: string };

// Équipe terrain : le chef d'équipe inscrit ses recenseurs et suit leur travail ; l'administration voit tout le terrain.
export default function PageEquipe() {
  const { compte } = useSession();
  const [tableau, setTableau] = useState<Tableau | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const admin = compte.espaces.includes("administration");

  const charger = useCallback(() => {
    appelApi<Tableau>("/equipe").then(setTableau, (e: Error) => setErreur(e.message));
  }, []);
  useEffect(charger, [charger]);

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
      appelApi<{ compte: { identifiant: string }; motDePasse: string }>("/equipe/recenseurs", { nom: valeur(d, "nom"), telephone: valeur(d, "telephone") }),
    );
    if (r) {
      setSecret({ pour: r.compte.identifiant, motDePasse: r.motDePasse });
      form.reset();
      charger();
    }
  }

  const recenseurs = tableau?.membres.filter((m) => m.role === "RECENSEUR") ?? [];
  const autres = tableau?.membres.filter((m) => m.role !== "RECENSEUR") ?? [];
  const totaux = recenseurs.reduce((t, m) => ({ recenses: t.recenses + m.recenses, payes: t.payes + m.payes, posees: t.posees + m.plaquesPosees }), { recenses: 0, payes: 0, posees: 0 });

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <h1 className="text-xl font-black">Équipe terrain</h1>
      <Erreur message={erreur} />

      {secret && (
        <div role="status" className="grid gap-2 rounded-2xl border-2 border-brand bg-brand-clair p-4">
          <p className="text-sm">
            Mot de passe de <strong>{secret.pour}</strong>, affiché une seule fois. Remettez-le en main propre au recenseur : il se connecte sur centrale.apsig.online avec son
            téléphone et ce mot de passe.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-white px-3 py-2 font-mono text-lg font-bold tracking-wider select-all">{secret.motDePasse}</code>
            <button onClick={() => void navigator.clipboard?.writeText(secret.motDePasse)} className={BOUTON_DISCRET}>
              Copier
            </button>
            <button onClick={() => setSecret(null)} className={BOUTON_DISCRET}>
              Fermer
            </button>
          </div>
        </div>
      )}

      <Bloc titre="Inscrire un recenseur">
        <form onSubmit={creer} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Champ libelle="Nom et prénoms">
            <input name="nom" required minLength={2} maxLength={80} className={CHAMP} />
          </Champ>
          <Champ libelle="Téléphone (identifiant de connexion)">
            <input name="telephone" type="tel" inputMode="tel" required pattern="\+?[0-9 .\-]{10,20}" placeholder="07 00 00 00 00" className={CHAMP} />
          </Champ>
          <button disabled={envoi} className={BOUTON}>
            Créer le compte
          </button>
        </form>
        <p className="mt-2 text-xs text-attenue">
          Le recenseur inscrit les clients (étape 1) et ne voit que les siens. Il n&apos;a accès ni à la pose des plaques, ni aux fiches des abonnés.
          {admin && " Pour rattacher un recenseur à un chef d'équipe, utilisez la page Administration."}
        </p>
      </Bloc>

      {tableau && (
        <Bloc titre={`Recenseurs (${recenseurs.length}) · ${totaux.recenses} clients recensés, ${totaux.payes} payés, ${totaux.posees} plaques posées`}>
          {recenseurs.length === 0 && <p className="text-sm text-attenue">Aucun recenseur pour l&apos;instant.</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-attenue">
                <tr>
                  <th className="py-1.5 font-semibold">Recenseur</th>
                  <th className="py-1.5 text-right font-semibold">Recensés</th>
                  <th className="py-1.5 text-right font-semibold">Payés</th>
                  <th className="py-1.5 text-right font-semibold" title="La commission est due à la pose validée de la plaque">
                    Plaques posées
                  </th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {recenseurs.map((m) => (
                  <tr key={m.id} className={`border-t border-ligne ${m.actif ? "" : "text-attenue"}`}>
                    <td className="py-2">
                      <span className="font-semibold">{m.nom}</span>
                      {!m.actif && <span className="ml-1 text-xs">(désactivé)</span>}
                      <span className="block font-mono text-xs text-attenue">{m.identifiant}</span>
                      {admin && m.chef && <span className="block text-xs text-attenue">Équipe de {m.chef}</span>}
                    </td>
                    <td className="py-2 text-right font-mono">{m.recenses}</td>
                    <td className="py-2 text-right font-mono">{m.payes}</td>
                    <td className="py-2 text-right font-mono font-bold">{m.plaquesPosees}</td>
                    <td className="py-2 text-right">
                      {m.gerable && (
                        <span className="flex justify-end gap-1">
                          {m.actif && (
                            <button
                              disabled={envoi}
                              className={BOUTON_DISCRET}
                              onClick={() =>
                                confirm(`Nouveau mot de passe pour ${m.nom} ? L'ancien ne fonctionnera plus.`) &&
                                void executer(() => appelApi<{ motDePasse: string }>(`/equipe/membres/${m.id}/reinitialiser`, {})).then(
                                  (r) => r && setSecret({ pour: m.identifiant, motDePasse: r.motDePasse }),
                                )
                              }
                            >
                              Nouveau mot de passe
                            </button>
                          )}
                          <button
                            disabled={envoi}
                            className={BOUTON_DISCRET}
                            onClick={() =>
                              (m.actif ? confirm(`Désactiver le compte de ${m.nom} ? Il sera déconnecté aussitôt.`) : true) &&
                              void executer(() => appelApi<Tableau>(`/equipe/membres/${m.id}`, { actif: !m.actif }, "PATCH")).then((t) => t && setTableau(t))
                            }
                          >
                            {m.actif ? "Désactiver" : "Réactiver"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloc>
      )}

      {admin && autres.length > 0 && (
        <Bloc titre="Poseurs et chefs d'équipe">
          <ul className="grid gap-1 text-sm">
            {autres.map((m) => (
              <li key={m.id} className={`flex flex-wrap justify-between gap-2 border-t border-ligne py-1.5 ${m.actif ? "" : "text-attenue"}`}>
                <span>
                  <span className="font-semibold">{m.nom}</span> · {LIBELLES_ROLE[m.role]}
                </span>
                <span className="text-attenue">
                  {m.role === "AGENT" ? `${m.posesEffectuees} plaques posées` : `${m.recenses} clients recensés`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-attenue">Ces comptes se créent depuis la page Administration (e-mail et double authentification).</p>
        </Bloc>
      )}

      {tableau && tableau.recensements.length > 0 && (
        <Bloc titre="Derniers clients recensés">
          <ul className="grid gap-1 text-sm">
            {tableau.recensements.map((r) => (
              <li key={r.id} className="grid gap-0.5 border-t border-ligne py-1.5 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-3">
                <span className="font-mono font-bold text-brand">{r.code ?? "—"}</span>
                <span>
                  {r.client} <span className="text-attenue">· {r.lieu}</span>
                  <span className="block text-xs text-attenue">
                    {r.recenseur} · {dateHeure(r.creeLe)}
                  </span>
                </span>
                <span className="flex gap-1 text-xs font-bold">
                  <span className={`rounded px-2 py-0.5 ${r.paye ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>{r.paye ? "Payé" : "Non payé"}</span>
                  <span className={`rounded px-2 py-0.5 ${r.posee ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>{r.posee ? "Posée" : "À poser"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Bloc>
      )}
    </div>
  );
}
