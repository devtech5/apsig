"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import {
  CIBLES,
  cleLieu,
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

// Listes de l'API : toutes les villes de Côte d'Ivoire, leurs communes et leurs quartiers connus (par nom).
type Ville = { nom: string; communes: string[]; quartiers: { nom: string; commune: string | null }[] };
type Recense = {
  id: string;
  code: string | null;
  qr: { plaque: string | null; interieur: { code: string; url: string } | null };
  rccm: string | null;
  client: string;
  telephone: string | null;
  telephone2: string | null;
  lieu: string;
  cible: Cible | null;
  paye: boolean;
  encaisseFcfa: number;
  resteFcfa: number;
  posee: boolean;
  creeLe: string;
};

const cle = (s: string) => cleLieu(s);
const etatPaiement = (r: { paye: boolean; encaisseFcfa: number; resteFcfa: number }) =>
  r.paye ? "Payé" : r.encaisseFcfa > 0 ? `Acompte ${fcfa(r.encaisseFcfa)} · reste ${fcfa(r.resteFcfa)}` : "Non payé";
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
            {fait.paye ? `${PRIX} encaissés` : etatPaiement(fait)}
          </p>
          <p className="text-sm text-attenue">Notez ce code au client. Il sera gravé sur sa plaque, posée lors du second passage avec relevé GPS.</p>
        </section>
        <QrGeneres recense={fait} />
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
            Offre de lancement : {PRIX}, premier mois compris. Le code Code-Secours et les QR sont générés à la validation ; la plaque est posée au second passage (
            <Link href="/pose" className="font-semibold text-brand underline">
              pose de plaque
            </Link>
            ).
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
                  {r.telephone && ` · ${r.telephone}`}
                  {r.telephone2 && ` / ${r.telephone2}`}
                  {r.rccm && ` · RCCM ${r.rccm}`} · {dateHeure(r.creeLe)}
                </p>
                <p className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className={`rounded px-2 py-0.5 ${r.paye ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>{etatPaiement(r)}</span>
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
  const [ville, setVille] = useState("");
  const [commune, setCommune] = useState("");
  const [quartier, setQuartier] = useState("");
  const [encaissement, setEncaissement] = useState<"total" | "acompte" | "aucun">("total");
  const [moyen, setMoyen] = useState<MoyenPaiement>("ESPECES");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Ville choisie dans la liste, ou saisie (elle sera ajoutée) ; ses communes et quartiers connus servent de suggestions.
  const villeConnue = villes.find((v) => cle(v.nom) === cle(ville));
  const communes = villeConnue?.communes ?? [];
  const quartiers = (villeConnue?.quartiers ?? []).filter((q) => !commune.trim() || !q.commune || cle(q.commune) === cle(commune));
  const nouveau = (valeur: string, liste: string[]) => valeur.trim() !== "" && !liste.some((n) => cle(n) === cle(valeur));

  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (envoi) return;
    if (!ville.trim() || !quartier.trim()) return setErreur("Indiquez la ville et le quartier du client");
    const f = new FormData(e.currentTarget);
    const texte = (n: string) => String(f.get(n) ?? "").trim();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelApi<Recense>("/pose/recensements", {
        cible,
        ...(cible === "ENTREPRISE" && { rccm: texte("rccm") }),
        prenom: texte("prenom"),
        nom: texte("nom"),
        telephone: texte("telephone"),
        telephone2: texte("telephone2"),
        lieu: { ville: ville.trim(), commune: commune.trim() || null, quartier: quartier.trim() },
        adresse: texte("adresse"),
        paiement:
          encaissement === "aucun"
            ? null
            : {
                operateur: moyen,
                ...(encaissement === "acompte" && { montantFcfa: Number(texte("montant")) }),
                ...(texte("reference") && { reference: texte("reference") }),
              },
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
        <div className="grid gap-1 text-sm font-semibold">
          Type de client
          <Puces nom="Type de client" options={CIBLES.map((c) => ({ code: c, libelle: LIBELLES_CIBLE_DETAILLES[c] }))} valeur={cible} onChange={setCible} />
          <span className="text-xs font-normal text-attenue">
            {PRIX} à l'inscription (premier mois compris), puis {fcfa(MENSUALITES_FCFA[cible])}/mois. Code Code-Secours généré automatiquement à la validation.
          </span>
        </div>
        {cible === "ENTREPRISE" && (
          <Champ libelle="Numéro du registre du commerce (RCCM)">
            <input name="rccm" required maxLength={40} autoComplete="off" placeholder="CI-ABJ-2026-B-12345" className={`${CHAMP} uppercase`} />
          </Champ>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Prénoms">
            <input name="prenom" required maxLength={60} autoComplete="off" className={CHAMP} />
          </Champ>
          <Champ libelle="Nom">
            <input name="nom" required maxLength={60} autoComplete="off" className={CHAMP} />
          </Champ>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Téléphone 1">
            <input name="telephone" type="tel" inputMode="tel" required pattern="\+?[0-9 .\-]{8,20}" title="8 à 20 chiffres" placeholder="07 00 00 00 00" className={CHAMP} />
          </Champ>
          <Champ libelle="Téléphone 2 (facultatif)">
            <input name="telephone2" type="tel" inputMode="tel" pattern="\+?[0-9 .\-]{8,20}" title="8 à 20 chiffres" className={CHAMP} />
          </Champ>
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Lieu</h2>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Ville" aide={nouveau(ville, villes.map((v) => v.nom)) ? "Ville absente de la liste : elle sera ajoutée." : undefined}>
            <input
              list="villes-ci"
              value={ville}
              onChange={(e) => {
                setVille(e.target.value);
                setCommune("");
                setQuartier("");
              }}
              required
              maxLength={80}
              autoComplete="off"
              placeholder="Choisir ou saisir"
              className={CHAMP}
            />
            <datalist id="villes-ci">
              {villes.map((v) => (
                <option key={v.nom} value={v.nom} />
              ))}
            </datalist>
          </Champ>
          <Champ libelle={communes.length ? "Commune" : "Commune (facultatif)"} aide={nouveau(commune, communes) ? "Commune absente : elle sera ajoutée." : undefined}>
            <input
              list="communes-ville"
              value={commune}
              onChange={(e) => {
                setCommune(e.target.value);
                setQuartier("");
              }}
              required={communes.length > 0}
              maxLength={80}
              autoComplete="off"
              placeholder={communes.length ? "Choisir ou saisir" : "—"}
              className={CHAMP}
            />
            <datalist id="communes-ville">
              {communes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Champ>
        </div>
        <Champ libelle="Quartier" aide={nouveau(quartier, quartiers.map((q) => q.nom)) ? "Quartier absent de la liste : il sera ajouté." : undefined}>
          <input
            list="quartiers-ville"
            value={quartier}
            onChange={(e) => setQuartier(e.target.value)}
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Choisir ou saisir"
            className={CHAMP}
          />
          <datalist id="quartiers-ville">
            {quartiers.map((q) => (
              <option key={`${q.commune}-${q.nom}`} value={q.nom} />
            ))}
          </datalist>
        </Champ>
        <Champ libelle="Adresse ou repère" aide="Soyez le plus précis possible : c'est ce qui permet de retrouver la maison pour poser la plaque.">
          <textarea name="adresse" required minLength={5} maxLength={300} rows={2} placeholder="Villa 453, portail bleu, 2e rue après la pharmacie du marché…" className={CHAMP} />
        </Champ>
      </section>

      <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Encaissement · {PRIX}</h2>
        <Puces
          nom="Encaissement"
          options={[
            { code: "total", libelle: `Payé (${PRIX})` },
            { code: "acompte", libelle: "Acompte / avance" },
            { code: "aucun", libelle: "Pas encore payé" },
          ]}
          valeur={encaissement}
          onChange={setEncaissement}
        />
        {encaissement === "acompte" && (
          <Champ libelle="Montant versé (F CFA)" aide={`Le solde sera à payer avant l'ouverture de l'abonnement (total ${PRIX}).`}>
            <input name="montant" type="number" inputMode="numeric" required min={100} max={FORFAIT_UNIQUE.abonnementFcfa - 1} step={100} placeholder="5000" className={CHAMP} />
          </Champ>
        )}
        {encaissement !== "aucun" && (
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

// QR générés dès la validation : plaque du portail et QR intérieur, à imprimer avant la pose.
function QrGeneres({ recense }: { recense: Recense }) {
  const [images, setImages] = useState<{ code: string; libelle: string; src: string }[]>([]);
  useEffect(() => {
    const liste = [
      recense.qr.plaque && recense.code ? { code: recense.code, libelle: "Plaque du portail", url: recense.qr.plaque } : null,
      recense.qr.interieur ? { code: recense.qr.interieur.code, libelle: "QR intérieur", url: recense.qr.interieur.url } : null,
    ].filter((x) => x !== null);
    void Promise.all(liste.map(async (q) => ({ code: q.code, libelle: q.libelle, src: await QRCode.toDataURL(q.url, { errorCorrectionLevel: "H", margin: 1, width: 400 }) }))).then(setImages);
  }, [recense]);
  if (images.length === 0) return null;
  return (
    <section className="grid grid-cols-2 gap-3">
      {images.map((q) => (
        <figure key={q.code} className="grid justify-items-center gap-1 rounded-2xl bg-white p-3 text-center shadow-sm">
          <img src={q.src} alt={`QR ${q.libelle} ${q.code}`} className="aspect-square w-full max-w-48" />
          <figcaption className="text-xs">
            <span className="block font-bold">{q.libelle}</span>
            <span className="font-mono">{q.code}</span>
          </figcaption>
        </figure>
      ))}
    </section>
  );
}
