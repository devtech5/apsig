"use client";

import { useState } from "react";
import { CIBLES, LIBELLES_CIBLE, MENSUALITES_FCFA, type Cible } from "@apsig/domain";
import { deposerDemande, type Demande } from "./demande";
import { Icone } from "./Icone";
import { francs } from "./Offre";

const VIDE: Demande = { cible: "FAMILLE", prenom: "", nom: "", telephone: "", email: "", ville: "", quartier: "", adresse: "", message: "", consentement: false, site: "" };

const champ =
  "w-full rounded-xl border border-ligne bg-white px-3.5 py-3 text-base outline-none transition placeholder:text-attenue/60 focus:border-brand focus:ring-4 focus:ring-brand-clair";
const etiquette = "grid gap-1.5 text-sm font-semibold";

// Demande de rappel : enregistrée par l'API (POST /public/inscriptions), un conseiller rappelle. Aucun paiement en ligne.
export function Rappel() {
  const [d, setD] = useState<Demande>(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState(false);
  const maj = <K extends keyof Demande>(cle: K, valeur: Demande[K]) => setD((a) => ({ ...a, [cle]: valeur }));

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    const message = await deposerDemande(d);
    setEnvoi(false);
    if (message) setErreur(message);
    else setEnvoyee(true);
  }

  return (
    <section id="rappel" aria-labelledby="titre-rappel" className="trame scroll-mt-20 bg-marine text-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-bold tracking-[0.2em] text-orange uppercase">Inscription</p>
          <h2 id="titre-rappel" className="mt-3 font-titre text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            Un conseiller vous rappelle.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/75">
            Laissez vos coordonnées. Un conseiller APSIG vous explique le service, puis un agent passe chez vous pour l'inscription et la pose de la
            plaque.
          </p>
          <ul className="mt-8 grid gap-3 text-white/85">
            {["Aucun paiement en ligne", "Paiement en espèces ou Mobile Money, à l'inscription", "Vos informations servent seulement à vous rappeler"].map((l) => (
              <li key={l} className="flex items-start gap-3">
                <Icone nom="check" className="mt-0.5 size-5 shrink-0 text-vert" /> {l}
              </li>
            ))}
          </ul>
        </div>

        {envoyee ? (
          <div role="status" className="grid content-center justify-items-center gap-4 rounded-3xl bg-white p-10 text-center text-encre shadow-2xl">
            <span className="grid size-16 place-items-center rounded-2xl bg-succes-fond text-succes">
              <Icone nom="check" className="size-8" />
            </span>
            <h3 className="font-titre text-2xl font-extrabold">Demande reçue</h3>
            <p className="max-w-sm text-attenue">
              Merci {d.prenom}. Un conseiller APSIG vous rappelle au {d.telephone} pour finaliser votre inscription.
            </p>
          </div>
        ) : (
          <form onSubmit={soumettre} className="grid gap-5 rounded-3xl bg-white p-6 text-encre shadow-2xl sm:p-8">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold">Vous êtes</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {CIBLES.map((c: Cible) => {
                  const choisi = d.cible === c;
                  return (
                    <label
                      key={c}
                      className={`grid cursor-pointer gap-0.5 rounded-xl border-2 px-3 py-2.5 transition ${choisi ? "border-brand bg-brand-clair/50" : "border-ligne hover:border-brand/40"}`}
                    >
                      <input type="radio" name="cible" value={c} checked={choisi} onChange={() => maj("cible", c)} className="sr-only" />
                      <span className="font-bold">{LIBELLES_CIBLE[c]}</span>
                      <span className="text-xs text-attenue">{francs(MENSUALITES_FCFA[c])}/mois</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={etiquette}>
                Prénom
                <input required maxLength={60} autoComplete="given-name" value={d.prenom} onChange={(e) => maj("prenom", e.target.value)} className={champ} />
              </label>
              <label className={etiquette}>
                Nom
                <input required maxLength={60} autoComplete="family-name" value={d.nom} onChange={(e) => maj("nom", e.target.value)} className={champ} />
              </label>
            </div>
            <label className={etiquette}>
              Téléphone
              <input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                pattern="\+?[0-9 .\-]{8,20}"
                title="Numéro de téléphone, 8 à 20 chiffres"
                placeholder="07 00 00 00 00"
                value={d.telephone}
                onChange={(e) => maj("telephone", e.target.value)}
                className={champ}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={etiquette}>
                Ville
                <input required maxLength={80} placeholder="Daloa, Abidjan…" value={d.ville} onChange={(e) => maj("ville", e.target.value)} className={champ} />
              </label>
              <label className={etiquette}>
                Quartier
                <input required maxLength={80} value={d.quartier} onChange={(e) => maj("quartier", e.target.value)} className={champ} />
              </label>
            </div>
            <label className={etiquette}>
              Message <span className="font-normal text-attenue">(facultatif)</span>
              <textarea maxLength={500} rows={2} value={d.message} onChange={(e) => maj("message", e.target.value)} className={champ} />
            </label>

            {/* Champ piège : invisible et hors parcours clavier, seuls les robots le remplissent. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Ne pas remplir
                <input tabIndex={-1} autoComplete="off" value={d.site} onChange={(e) => maj("site", e.target.value)} />
              </label>
            </div>

            <label className="flex items-start gap-3 text-sm text-attenue">
              <input
                required
                type="checkbox"
                checked={d.consentement}
                onChange={(e) => maj("consentement", e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-brand"
              />
              J'accepte qu'APSIG me rappelle au numéro indiqué et conserve ces informations pour traiter ma demande.
            </label>

            {erreur && (
              <p role="alert" className="rounded-xl bg-erreur-fond px-3 py-2 text-sm font-semibold text-erreur">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={envoi}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-signal px-6 py-4 text-base font-extrabold text-white shadow-[0_14px_30px_-12px_rgb(200_16_46_/_0.9)] transition hover:bg-[#a90d26] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
            >
              {envoi ? "Envoi…" : "Être rappelé"} {!envoi && <Icone nom="telephone" className="size-4" />}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
