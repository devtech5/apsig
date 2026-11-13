"use client";

import { useCallback, useEffect, useState } from "react";
import { cleLieu, LIBELLES_ROLE, type Role } from "@apsig/domain";
import { ListeSaisie } from "@/components/ListeSaisie";
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
  zones: Zone[];
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
type Zone = { ville: string; commune: string | null };
type Ville = { nom: string; communes: string[] };

// Équipe terrain : le chef d'équipe inscrit ses recenseurs et suit leur travail ; l'administration voit tout le terrain.
export default function PageEquipe() {
  const { compte } = useSession();
  const [tableau, setTableau] = useState<Tableau | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const admin = compte.espaces.includes("administration");

  const [villes, setVilles] = useState<Ville[]>([]);
  const charger = useCallback(() => {
    appelApi<Tableau>("/equipe").then(setTableau, (e: Error) => setErreur(e.message));
  }, []);
  useEffect(() => {
    appelApi<Ville[]>("/pose/referentiel").then(setVilles, () => undefined);
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
      appelApi<{ compte: { identifiant: string }; motDePasse: string }>("/equipe/membres", { nom: valeur(d, "nom"), telephone: valeur(d, "telephone"), role: d.get("role") }),
    );
    if (r) {
      setSecret({ pour: r.compte.identifiant, motDePasse: r.motDePasse });
      form.reset();
      charger();
    }
  }

  const actionsDe = (m: Membre) => (
    m.gerable && (
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
    )
  );

  const recenseurs = tableau?.membres.filter((m) => m.role === "RECENSEUR") ?? [];
  const poseurs = tableau?.membres.filter((m) => m.role === "AGENT") ?? [];
  const chefs = tableau?.membres.filter((m) => m.role === "CHEF_EQUIPE") ?? [];
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

      <Bloc titre="Inscrire un membre de l'équipe">
        <form onSubmit={creer} className="grid gap-3 sm:grid-cols-[1fr_1fr_11rem_auto] sm:items-end">
          <Champ libelle="Nom et prénoms">
            <input name="nom" required minLength={2} maxLength={80} className={CHAMP} />
          </Champ>
          <Champ libelle="Téléphone (identifiant de connexion)">
            <input name="telephone" type="tel" inputMode="tel" required pattern="\+?[0-9 .\-]{10,20}" placeholder="07 00 00 00 00" className={CHAMP} />
          </Champ>
          <Champ libelle="Rôle">
            <select name="role" defaultValue="RECENSEUR" className={CHAMP}>
              <option value="RECENSEUR">Recenseur</option>
              <option value="AGENT">Poseur de plaques</option>
            </select>
          </Champ>
          <button disabled={envoi} className={BOUTON}>
            Créer le compte
          </button>
        </form>
        <p className="mt-2 text-xs text-attenue">
          Le recenseur inscrit les clients (étape 1) et ne voit que les siens. Le poseur pose les plaques (étape 2) chez les clients de ses communes : attribuez-lui
          ses zones ci-dessous. Tous deux se connectent sur code-secours.apsig.online avec leur téléphone.
          {admin && " Pour rattacher un membre à un chef d'équipe, utilisez la page Personnel du QG."}
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
                      <Identite m={m} admin={admin} />
                    </td>
                    <td className="py-2 text-right font-mono">{m.recenses}</td>
                    <td className="py-2 text-right font-mono">{m.payes}</td>
                    <td className="py-2 text-right font-mono font-bold">{m.plaquesPosees}</td>
                    <td className="py-2 text-right">{actionsDe(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloc>
      )}

      {tableau && (
        <Bloc titre={`Poseurs de plaques (${poseurs.length})`}>
          {poseurs.length === 0 && <p className="text-sm text-attenue">Aucun poseur pour l&apos;instant.</p>}
          <ul className="grid gap-3">
            {poseurs.map((m) => (
              <li key={m.id} className={`grid gap-2 border-t border-ligne pt-3 ${m.actif ? "" : "text-attenue"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Identite m={m} admin={admin} />
                  <span className="text-sm">
                    <strong className="font-mono">{m.posesEffectuees}</strong> plaque{m.posesEffectuees > 1 ? "s" : ""} posée{m.posesEffectuees > 1 ? "s" : ""}
                  </span>
                  {actionsDe(m)}
                </div>
                <Zones
                  membre={m}
                  villes={villes}
                  modifiable={m.gerable && m.actif}
                  onEnregistrer={(z) => executer(() => appelApi<Tableau>(`/equipe/membres/${m.id}/zones`, { zones: z }, "PUT")).then((t) => t && setTableau(t))}
                />
              </li>
            ))}
          </ul>
        </Bloc>
      )}

      {admin && chefs.length > 0 && (
        <Bloc titre={`Chefs d'équipe (${chefs.length})`}>
          <ul className="grid gap-1 text-sm">
            {chefs.map((m) => (
              <li key={m.id} className={`flex flex-wrap justify-between gap-2 border-t border-ligne py-1.5 ${m.actif ? "" : "text-attenue"}`}>
                <span>
                  <span className="font-semibold">{m.nom}</span> · {LIBELLES_ROLE[m.role]}
                </span>
                <span className="text-attenue">{m.recenses} clients recensés</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-attenue">Les chefs d&apos;équipe se créent depuis la page Personnel du QG (e-mail et double authentification).</p>
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

function Identite({ m, admin }: { m: Membre; admin: boolean }) {
  return (
    <span>
      <span className="font-semibold">{m.nom}</span>
      {!m.actif && <span className="ml-1 text-xs">(désactivé)</span>}
      <span className="block font-mono text-xs text-attenue">{m.identifiant}</span>
      {admin && m.chef && <span className="block text-xs text-attenue">Équipe de {m.chef}</span>}
    </span>
  );
}

// Zones du poseur : communes (ou villes entières). Il ne voit que les clients à équiper dans ces zones.
function Zones({ membre, villes, modifiable, onEnregistrer }: { membre: Membre; villes: Ville[]; modifiable: boolean; onEnregistrer: (z: Zone[]) => Promise<unknown> }) {
  const [zones, setZones] = useState<Zone[]>(membre.zones);
  const [ville, setVille] = useState("");
  const [commune, setCommune] = useState("");
  const [edition, setEdition] = useState(false);
  useEffect(() => setZones(membre.zones), [membre.zones]);
  const communes = villes.find((v) => cleLieu(v.nom) === cleLieu(ville))?.communes ?? [];
  const libelle = (z: Zone) => (z.commune ? `${z.commune} (${z.ville})` : `${z.ville}, toute la ville`);

  return (
    <div className="grid gap-2 rounded-xl bg-fond p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Zones :</span>
        {zones.length === 0 && <span className="text-danger">aucune, le poseur ne voit aucun client</span>}
        {zones.map((z) => (
          <span key={libelle(z)} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 ring-1 ring-ligne">
            {libelle(z)}
            {edition && (
              <button type="button" aria-label={`Retirer ${libelle(z)}`} onClick={() => setZones((l) => l.filter((x) => x !== z))} className="text-attenue hover:text-danger">
                ×
              </button>
            )}
          </span>
        ))}
        {modifiable && !edition && (
          <button type="button" onClick={() => setEdition(true)} className={BOUTON_DISCRET}>
            Modifier les zones
          </button>
        )}
      </div>
      {edition && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <ListeSaisie libelle="Ville" valeur={ville} options={villes.map((v) => v.nom)} onChange={(v) => { setVille(v); setCommune(""); }} ajout="elle sera ajoutée" />
          <ListeSaisie
            libelle={communes.length ? "Commune" : "Commune (vide : toute la ville)"}
            valeur={commune}
            options={communes}
            onChange={setCommune}
            placeholder={communes.length ? "Choisir" : "Toute la ville"}
            ajout="elle sera ajoutée"
          />
          <button
            type="button"
            disabled={!ville.trim() || (communes.length > 0 && !commune.trim())}
            onClick={() => {
              const z = { ville: ville.trim(), commune: commune.trim() || null };
              if (!zones.some((x) => libelle(x) === libelle(z))) setZones((l) => [...l, z]);
              setCommune("");
            }}
            className={BOUTON_DISCRET}
          >
            Ajouter
          </button>
          <button type="button" onClick={() => void onEnregistrer(zones).then(() => setEdition(false))} className={BOUTON}>
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}
