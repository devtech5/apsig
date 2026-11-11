"use client";

import { useState } from "react";
import { CIBLES, FORFAIT_UNIQUE, LIBELLES_CIBLE_DETAILLES, MENSUALITES_FCFA, type Cible } from "@apsig/domain";
import { deposerDemande, type Demande } from "@/lib/api";

const LIBELLES_SUPPORT: Record<string, string> = {
  PORTAIL: "plaque portail",
  INTERIEUR: "QR intérieur",
  BRACELET: "bracelet",
  CARTE_VOYAGEUR: "carte voyageur",
};

const francs = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} F`;

const champ = "w-full rounded-xl border border-ligne bg-white px-3 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand-clair";
const etiquette = "grid gap-1 text-sm font-semibold";

const VIDE: Demande = {
  cible: "PARTICULIER",
  prenom: "",
  nom: "",
  telephone: "",
  email: "",
  ville: "",
  quartier: "",
  adresse: "",
  message: "",
  consentement: false,
  site: "",
};

export function FormulaireInscription() {
  const [d, setD] = useState<Demande>(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState(false);

  const maj = <K extends keyof Demande>(cle: K, valeur: Demande[K]) => setD((a) => ({ ...a, [cle]: valeur }));
  const mensualite = MENSUALITES_FCFA[d.cible as Cible];
  const kit = FORFAIT_UNIQUE.supports.map(([t]) => LIBELLES_SUPPORT[t] ?? t).join(" et ");

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

  if (envoyee) {
    return (
      <section role="status" className="grid justify-items-center gap-3 rounded-3xl bg-white px-6 py-10 text-center shadow-lg">
        <span className="grid size-14 place-items-center rounded-2xl bg-succes-fond text-2xl text-succes">✓</span>
        <h1 className="text-xl font-extrabold">Demande reçue</h1>
        <p className="text-attenue">
          Merci {d.prenom}. Un conseiller APSIG vous rappelle au {d.telephone} pour finaliser votre inscription. Aucun paiement n'est demandé en ligne.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={soumettre} className="grid gap-5 rounded-3xl bg-white p-5 shadow-lg" noValidate={false}>
      <div>
        <h1 className="text-xl font-extrabold">Inscrivez-vous à CODE-SECOURS</h1>
        <p className="mt-1 text-sm text-attenue">Laissez vos coordonnées : un conseiller vous rappelle. Aucun paiement en ligne.</p>
      </div>

      <section aria-label="Forfait" className="grid gap-1 rounded-xl border-2 border-brand bg-brand-clair/40 px-3 py-3">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-extrabold">Forfait unique</span>
          <span className="text-lg font-extrabold">{francs(FORFAIT_UNIQUE.abonnementFcfa)}</span>
        </p>
        <p className="text-xs text-attenue">Comprend : {kit}, premier mois compris. Payé en une seule fois, non remboursable.</p>
        <p className="text-xs text-attenue">Des options pourront être ajoutées plus tard.</p>
      </section>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Vous êtes</legend>
        {CIBLES.map((c) => {
          const choisi = d.cible === c;
          return (
            <label key={c} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-3 ${choisi ? "border-brand bg-brand-clair/40" : "border-ligne"}`}>
              <input type="radio" name="cible" value={c} checked={choisi} onChange={() => maj("cible", c)} className="size-4 shrink-0 accent-brand" />
              <span className="font-semibold">{LIBELLES_CIBLE_DETAILLES[c]}</span>
              <span className="ml-auto shrink-0 text-sm font-semibold">{francs(MENSUALITES_FCFA[c])}/mois</span>
            </label>
          );
        })}
      </fieldset>

      <p className="rounded-xl bg-fond px-3 py-2 text-sm">
        <strong>{francs(FORFAIT_UNIQUE.abonnementFcfa)}</strong> à l'inscription, puis <strong>{francs(mensualite)}/mois</strong> dès le deuxième mois.
      </p>

      <div className="grid grid-cols-2 gap-3">
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

      <label className={etiquette}>
        E-mail <span className="font-normal text-attenue">(facultatif)</span>
        <input type="email" autoComplete="email" maxLength={120} value={d.email} onChange={(e) => maj("email", e.target.value)} className={champ} />
      </label>

      <div className="grid grid-cols-2 gap-3">
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
        Adresse ou repère <span className="font-normal text-attenue">(facultatif)</span>
        <input maxLength={300} value={d.adresse} onChange={(e) => maj("adresse", e.target.value)} className={champ} />
      </label>

      <label className={etiquette}>
        Message <span className="font-normal text-attenue">(facultatif)</span>
        <textarea maxLength={500} rows={3} value={d.message} onChange={(e) => maj("message", e.target.value)} className={champ} />
      </label>

      {/* Champ piège : invisible et hors parcours clavier, seuls les robots le remplissent. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Ne pas remplir
          <input tabIndex={-1} autoComplete="off" value={d.site} onChange={(e) => maj("site", e.target.value)} />
        </label>
      </div>

      <label className="flex items-start gap-3 text-sm">
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
        className="rounded-2xl bg-brand px-4 py-4 text-base font-extrabold text-white active:opacity-90 disabled:opacity-60"
      >
        {envoi ? "Envoi…" : "Envoyer ma demande"}
      </button>
    </form>
  );
}
