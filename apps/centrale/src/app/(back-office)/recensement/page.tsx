"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CIBLES,
  FORFAIT_UNIQUE,
  LIBELLES_CIBLE_DETAILLES,
  LIBELLES_MOYEN_PAIEMENT,
  MENSUALITES_FCFA,
  MOYENS_PAIEMENT,
  type Cible,
  type MoyenPaiement,
} from "@apsig/domain";
import { BOUTON, CHAMP, Champ, Erreur } from "@/components/Formulaire";
import { Icone } from "@/components/Icone";
import { appelApi } from "@/lib/api";
import { dateHeure } from "@/lib/format";

type Ville = { id: string; nom: string; communes: { id: string; nom: string }[]; quartiers: { id: string; nom: string; communeId: string | null }[] };
type Recense = {
  id: string;
  code: string | null;
  client: string;
  telephone: string | null;
  lieu: string;
  cible: Cible | null;
  paye: boolean;
  posee: boolean;
  creeLe: string;
};

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} F`;
const PRIX = fcfa(FORFAIT_UNIQUE.abonnementFcfa);
// Espèces en premier : c'est le cas le plus courant sur le terrain.
const MOYENS = ["ESPECES", ...MOYENS_PAIEMENT.filter((m) => m !== "ESPECES")] as MoyenPaiement[];

function Puces<T extends string>({ nom, options, valeur, onChange }: { nom: string; options: { code: T; libelle: string }[]; valeur: T | null; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={nom} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.code}
          type="button"
          role="radio"
          aria-checked={o.code === valeur}
          onClick={() => onChange(o.code)}
          className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold ${o.code === valeur ? "border-brand bg-brand-clair text-brand" : "border-ligne bg-white"}`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

// Inscription en deux temps, étape 1 : l'agent recense le client ; le code Code-Secours (code de la plaque) est créé
// aussitôt. Étape 2 : la plaque est posée et scannée, le GPS devient l'adresse vérifiée.
export default function PageRecensement() {
  const [villes, setVilles] = useState<Ville[] | null>(null);
  const [liste, setListe] = useState<Recense[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState(false);
  const [fait, setFait] = useState<Recense | null>(null);

  const charger = useCallback(() => {
    appelApi<Recense[]>("/pose/recensements").then(setListe, (e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    charger();
    appelApi<Ville[]>("/pose/referentiel").then(setVilles, (e: Error) => setErreur(e.message));
  }, [charger]);

  if (fait) {
    return (
      <div className="mx-auto grid max-w-xl gap-4 p-4">
        <section className="grid justify-items-center gap-2 rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-attenue">Code Code-Secours du client</p>
          <p className="font-mono text-3xl font-black tracking-wider text-brand select-all">{fait.code ?? "—"}</p>
          <p className="font-bold">{fait.client}</p>
          <p className="text-sm text-attenue">{fait.lieu}</p>
          <p className={`rounded-lg px-3 py-1 text-sm font-bold ${fait.paye ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>
            {fait.paye ? `${PRIX} encaissés` : "Paiement à encaisser"}
          </p>
          <p className="text-sm text-attenue">Notez ce code au client. Il sera gravé sur sa plaque, posée lors du second passage avec relevé GPS.</p>
        </section>
        <button type="button" className={`${BOUTON} py-3`} onClick={() => { setFait(null); setFormulaire(true); }}>
          Recenser un autre client
        </button>
        <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-attenue hover:bg-white" onClick={() => setFait(null)}>
          Voir mes clients recensés
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-xl gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-black">Recensement</h1>
        {!formulaire && (
          <button type="button" onClick={() => setFormulaire(true)} className={`${BOUTON} flex items-center gap-1.5`}>
            <Icone nom="plus" className="size-4" /> Nouveau client
          </button>
        )}
      </div>
      <Erreur message={erreur} />

      {formulaire ? (
        villes ? (
          <Fiche
            villes={villes}
            onAnnuler={() => setFormulaire(false)}
            onFait={(r) => {
              setFormulaire(false);
              setFait(r);
              charger();
            }}
          />
        ) : (
          <p className="text-attenue">Chargement…</p>
        )
      ) : (
        <section className="grid gap-2">
          <p className="text-sm text-attenue">
            Offre de lancement : {PRIX}, premier mois compris. Le code Code-Secours est créé à l'enregistrement ; la plaque qui le porte est posée au second passage.
          </p>
          {!liste && !erreur && <p className="text-attenue">Chargement…</p>}
          {liste?.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-attenue">Aucun client recensé pour l'instant.</p>}
          <ul className="grid gap-2">
            {liste?.map((r) => (
              <li key={r.id} className="grid gap-1 rounded-xl bg-white px-4 py-3 shadow-sm">
                <p className="font-mono text-lg font-black tracking-wide text-brand">{r.code ?? "Code en attente"}</p>
                <p className="font-bold">{r.client}</p>
                <p className="text-sm text-attenue">
                  {r.lieu}
                  {r.telephone && ` · ${r.telephone}`} · {dateHeure(r.creeLe)}
                </p>
                <p className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className={`rounded px-2 py-0.5 ${r.paye ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>{r.paye ? "Payé" : "Non payé"}</span>
                  <span className={`rounded px-2 py-0.5 ${r.posee ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>{r.posee ? "Plaque posée" : "Plaque à poser"}</span>
                  {r.cible && <span className="rounded bg-fond px-2 py-0.5 text-encre">{LIBELLES_CIBLE_DETAILLES[r.cible]}</span>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Fiche({ villes, onAnnuler, onFait }: { villes: Ville[]; onAnnuler: () => void; onFait: (r: Recense) => void }) {
  const [cible, setCible] = useState<Cible>("PARTICULIER");
  const [villeId, setVilleId] = useState<string | null>(villes.length === 1 ? villes[0]!.id : null);
  const [communeId, setCommuneId] = useState<string | null>(null);
  const [quartierId, setQuartierId] = useState<string | null>(null);
  const [paye, setPaye] = useState(true);
  const [moyen, setMoyen] = useState<MoyenPaiement>("ESPECES");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ville = villes.find((v) => v.id === villeId);
  const avecCommunes = Boolean(ville?.communes.length);
  const quartiers = ville?.quartiers.filter((q) => !avecCommunes || q.communeId === communeId) ?? [];

  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (envoi) return;
    if (!quartierId) return setErreur("Choisissez la ville et le quartier du client");
    const f = new FormData(e.currentTarget);
    const texte = (n: string) => String(f.get(n) ?? "").trim();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelApi<Recense>("/pose/recensements", {
        cible,
        prenom: texte("prenom"),
        nom: texte("nom"),
        telephone: texte("telephone"),
        quartierId,
        adresse: texte("adresse"),
        paiement: paye ? { operateur: moyen, ...(texte("reference") && { reference: texte("reference") }) } : null,
      });
      onFait(r);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="grid gap-4">
      <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Client</h2>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Prénom">
            <input name="prenom" required maxLength={60} autoComplete="off" className={CHAMP} />
          </Champ>
          <Champ libelle="Nom">
            <input name="nom" required maxLength={60} autoComplete="off" className={CHAMP} />
          </Champ>
        </div>
        <Champ libelle="Téléphone">
          <input name="telephone" type="tel" inputMode="tel" required pattern="\+?[0-9 .\-]{8,20}" title="8 à 20 chiffres" placeholder="07 00 00 00 00" className={CHAMP} />
        </Champ>
        <div className="grid gap-1 text-sm font-semibold">
          Type de client
          <Puces nom="Type de client" options={CIBLES.map((c) => ({ code: c, libelle: LIBELLES_CIBLE_DETAILLES[c] }))} valeur={cible} onChange={setCible} />
          <span className="text-xs font-normal text-attenue">
            {PRIX} à l'inscription (premier mois compris), puis {fcfa(MENSUALITES_FCFA[cible])}/mois.
          </span>
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Lieu</h2>
        <div className="grid gap-1 text-sm font-semibold">
          Ville
          <Puces
            nom="Ville"
            options={villes.map((v) => ({ code: v.id, libelle: v.nom }))}
            valeur={villeId}
            onChange={(v) => {
              setVilleId(v);
              setCommuneId(null);
              setQuartierId(null);
            }}
          />
        </div>
        {avecCommunes && (
          <div className="grid gap-1 text-sm font-semibold">
            Commune
            <Puces
              nom="Commune"
              options={ville!.communes.map((c) => ({ code: c.id, libelle: c.nom }))}
              valeur={communeId}
              onChange={(c) => {
                setCommuneId(c);
                setQuartierId(null);
              }}
            />
          </div>
        )}
        {ville && (!avecCommunes || communeId) && (
          <div className="grid gap-1 text-sm font-semibold">
            Quartier
            {quartiers.length === 0 ? (
              <span className="text-sm font-normal text-attenue">Aucun quartier enregistré ici : demandez à la centrale de l'ajouter.</span>
            ) : (
              <Puces nom="Quartier" options={quartiers.map((q) => ({ code: q.id, libelle: q.nom }))} valeur={quartierId} onChange={setQuartierId} />
            )}
          </div>
        )}
        <Champ libelle="Repère (facultatif)">
          <input name="adresse" maxLength={300} placeholder="Villa 453, près de la pharmacie…" className={CHAMP} />
        </Champ>
      </section>

      <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Encaissement · {PRIX}</h2>
        <Puces
          nom="Encaissement"
          options={[
            { code: "oui", libelle: "Payé" },
            { code: "non", libelle: "Pas encore payé" },
          ]}
          valeur={paye ? "oui" : "non"}
          onChange={(v) => setPaye(v === "oui")}
        />
        {paye && (
          <>
            <Puces nom="Moyen de paiement" options={MOYENS.map((m) => ({ code: m, libelle: LIBELLES_MOYEN_PAIEMENT[m] }))} valeur={moyen} onChange={setMoyen} />
            {moyen !== "ESPECES" && (
              <Champ libelle="Référence de la transaction">
                <input name="reference" required minLength={3} maxLength={64} autoComplete="off" className={CHAMP} />
              </Champ>
            )}
          </>
        )}
      </section>

      <Erreur message={erreur} />
      <div className="flex gap-2">
        <button type="submit" disabled={envoi} className={`${BOUTON} flex-1 py-3 text-base`}>
          {envoi ? "Enregistrement…" : "Enregistrer le client"}
        </button>
        <button type="button" onClick={onAnnuler} className="rounded-lg px-4 py-3 text-sm font-semibold text-attenue hover:bg-white">
          Annuler
        </button>
      </div>
    </form>
  );
}
