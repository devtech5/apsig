"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CIBLES, cleLieu, FORFAIT_UNIQUE, LIBELLES_CIBLE_DETAILLES, LIBELLES_MOYEN_PAIEMENT, MENSUALITES_FCFA, MOYENS_PAIEMENT, type Cible, type MoyenPaiement } from "@apsig/domain";
import { ClientsRecenses, etatPaiement, fcfa, PRIX, QrGeneres, type Recense } from "@/components/ClientsRecenses";
import { BOUTON, CHAMP, Champ, Erreur } from "@/components/Formulaire";
import { Icone } from "@/components/Icone";
import { ListeSaisie } from "@/components/ListeSaisie";
import { useSession } from "@/components/Session";
import { appelApi } from "@/lib/api";

// Listes de l'API : toutes les villes de Côte d'Ivoire, leurs communes et leurs quartiers connus (par nom).
type Ville = { nom: string; communes: string[]; quartiers: { nom: string; commune: string | null }[] };

const cle = (s: string) => cleLieu(s);
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
  const { compte } = useSession();
  const [villes, setVilles] = useState<Ville[] | null>(null);
  const [version, setVersion] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState(false);
  const [fait, setFait] = useState<Recense | null>(null);
  // Chef d'équipe et QG : la liste couvre plusieurs recenseurs, on affiche qui a recensé.
  const equipe = compte.role !== "RECENSEUR";
  const charger = () => setVersion((v) => v + 1);

  useEffect(() => {
    appelApi<Ville[]>("/pose/referentiel").then(setVilles, (e: Error) => setErreur(e.message));
  }, []);

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
          Voir les clients recensés
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
        <>
          <p className="text-sm text-attenue">
            Offre de lancement : {PRIX}, premier mois compris. Le code Code-Secours et les QR sont générés à la validation ; la plaque est posée au second passage (
            <Link href="/pose" className="font-semibold text-brand underline">
              pose de plaque
            </Link>
            ).
          </p>
          <ClientsRecenses titre={equipe ? "Clients recensés par l'équipe" : "Mes clients recensés"} version={version} montrerRecenseur={equipe} />
        </>
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
          <ListeSaisie
            libelle="Ville"
            valeur={ville}
            options={villes.map((v) => v.nom)}
            onChange={(v) => {
              setVille(v);
              setCommune("");
              setQuartier("");
            }}
            requis
            ajout="elle sera ajoutée"
          />
          <ListeSaisie
            libelle={communes.length ? "Commune" : "Commune (facultatif)"}
            valeur={commune}
            options={communes}
            onChange={(c) => {
              setCommune(c);
              setQuartier("");
            }}
            requis={communes.length > 0}
            placeholder={communes.length ? "Choisir ou saisir" : "Saisir si besoin"}
            ajout="elle sera ajoutée"
          />
        </div>
        <ListeSaisie libelle="Quartier" valeur={quartier} options={quartiers.map((q) => q.nom)} onChange={setQuartier} requis />
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
