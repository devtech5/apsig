"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LIBELLES_ETAT_ABONNEMENT,
  LIBELLES_MOYEN_PAIEMENT,
  LIBELLES_ROLE_MEMBRE,
  LIBELLES_STATUT_SUPPORT,
  ROLES_MEMBRE,
  SUPPORTS,
  TYPES_SUPPORT,
} from "@apsig/domain";
import { AVEC_PORTEUR, COULEUR_ETAT, COULEUR_SUPPORT, date, fcfa, type Contact, type Foyer, type Membre, type Referentiel } from "@/lib/abonnements";
import type { Position } from "@/lib/api";
import { ChampsSouscription, ChoixAdresse, lireSouscription } from "./ChampsAbonnement";
import { Bloc, BOUTON, BOUTON_DISCRET, BOUTON_SECONDAIRE, CHAMP, Champ, valeur } from "./Formulaire";
import { Icone } from "./Icone";

// Envoie une modification ; vrai si elle a réussi (la fiche est alors déjà à jour).
export type Agir = (chemin: string, corps?: unknown, methode?: "POST" | "PATCH" | "DELETE") => Promise<boolean>;

export function FicheFoyer({ f, referentiel, agir, envoi }: { f: Foyer; referentiel: Referentiel; agir: Agir; envoi: boolean }) {
  const [edition, setEdition] = useState(false);
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mr-auto">
          <Link href="/abonnements" className="text-sm text-brand underline">
            ← Abonnements
          </Link>
          <h1 className="mt-1 text-xl font-black">
            {f.libelle}
            {f.numero != null && <span className="ml-2 font-mono text-sm font-semibold text-attenue">n° {f.numero}</span>}
          </h1>
          <p className="text-sm text-attenue">
            {f.quartier.nom}, {f.ville.nom}
            {f.adresse && ` · ${f.adresse}`}
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
            <span className={`rounded px-2 py-0.5 ${f.adresseVerifiee ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>
              {f.adresseVerifiee ? "Adresse vérifiée à la pose" : "Adresse à vérifier à la pose"}
            </span>
            {!f.position && <span className="rounded bg-danger-fond px-2 py-0.5 text-danger">Pas de point sur la carte</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEdition((e) => !e)} className={BOUTON_SECONDAIRE}>
            {edition ? "Fermer" : "Modifier l'adresse"}
          </button>
          <Link href={`/abonnements/${f.id}/impression`} className={`${BOUTON} flex items-center gap-1.5`}>
            <Icone nom="imprimante" className="size-4" /> Imprimer les QR
          </Link>
        </div>
      </header>

      {edition && <EditionAdresse f={f} referentiel={referentiel} agir={agir} envoi={envoi} fermer={() => setEdition(false)} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <BlocAbonnement f={f} referentiel={referentiel} agir={agir} envoi={envoi} />
        <BlocSupports f={f} agir={agir} envoi={envoi} />
        <BlocMembres f={f} agir={agir} envoi={envoi} />
        <BlocContacts f={f} agir={agir} envoi={envoi} />
      </div>
    </div>
  );
}

type PropsBloc = { f: Foyer; agir: Agir; envoi: boolean };

function EditionAdresse({ f, referentiel, agir, envoi, fermer }: PropsBloc & { referentiel: Referentiel; fermer: () => void }) {
  const [quartierId, setQuartierId] = useState(f.quartier.id);
  const [position, setPosition] = useState<Position | null>(f.position);
  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    if (await agir(`/abonnements/foyers/${f.id}`, { libelle: valeur(d, "libelle"), adresse: valeur(d, "adresse"), quartierId, position }, "PATCH")) fermer();
  }
  return (
    <form onSubmit={enregistrer}>
      <Bloc titre="Adresse du foyer">
        <div className="grid gap-3">
          <Champ libelle="Libellé">
            <input name="libelle" defaultValue={f.libelle} required maxLength={120} className={CHAMP} />
          </Champ>
          <ChoixAdresse referentiel={referentiel} quartierId={quartierId} onQuartier={setQuartierId} position={position} onPosition={setPosition} />
          <Champ libelle="Indications pour les secours">
            <textarea name="adresse" defaultValue={f.adresse ?? ""} maxLength={300} rows={2} className={CHAMP} />
          </Champ>
          {f.adresseVerifiee && <p className="text-xs text-alerte-encre">Déplacer le point ou changer de quartier remet l'adresse « à vérifier ».</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={fermer} className={BOUTON_DISCRET}>
              Annuler
            </button>
            <button disabled={envoi || !quartierId} className={BOUTON}>
              Enregistrer
            </button>
          </div>
        </div>
      </Bloc>
    </form>
  );
}

function BlocAbonnement({ f, referentiel, agir, envoi }: PropsBloc & { referentiel: Referentiel }) {
  const [souscription, setSouscription] = useState(false);
  async function souscrire(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await agir(`/abonnements/foyers/${f.id}/abonnements`, lireSouscription(new FormData(e.currentTarget)))) setSouscription(false);
  }
  return (
    <Bloc
      titre="Abonnement"
      action={
        <button onClick={() => setSouscription((s) => !s)} className={BOUTON_SECONDAIRE}>
          {souscription ? "Fermer" : f.abonnements.length ? "Renouveler" : "Souscrire"}
        </button>
      }
    >
      {souscription && (
        <form onSubmit={souscrire} className="mb-4 grid gap-3 rounded-xl border border-ligne p-3">
          <ChampsSouscription formules={referentiel.formules} />
          <p className="text-xs text-attenue">Une période encore en cours n'est pas perdue : la nouvelle commence à sa fin.</p>
          <div className="flex justify-end">
            <button disabled={envoi} className={BOUTON}>
              Enregistrer
            </button>
          </div>
        </form>
      )}
      {f.abonnements.length === 0 && <p className="text-sm text-danger">Aucun abonnement : les alertes sont traitées quand même, mais signalées.</p>}
      <ul className="grid gap-2 text-sm">
        {f.abonnements.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${COULEUR_ETAT[a.etat]}`}>{LIBELLES_ETAT_ABONNEMENT[a.etat]}</span>
            <span className="font-semibold">{a.formule.nom}</span>
            <span className="text-attenue">
              du {date(a.debut)} au {date(a.fin)}
            </span>
            {(a.etat === "ACTIF" || a.etat === "ESSAI" || a.etat === "A_VENIR") && (
              <button
                disabled={envoi}
                onClick={() => confirm(`Résilier « ${a.formule.nom} » ? La période s'arrête aujourd'hui.`) && void agir(`/abonnements/abonnements/${a.id}/resilier`, {})}
                className="ml-auto text-xs text-danger underline disabled:opacity-60"
              >
                Résilier
              </button>
            )}
          </li>
        ))}
      </ul>
      {f.paiements.length > 0 && (
        <div className="mt-3 border-t border-ligne pt-2">
          <h3 className="mb-1 text-xs font-semibold text-attenue">Paiements</h3>
          <ul className="grid gap-0.5 text-xs">
            {f.paiements.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>
                  {date(p.creeLe)} · {LIBELLES_MOYEN_PAIEMENT[p.operateur]}
                  {p.reference && <span className="font-mono text-attenue"> · {p.reference}</span>}
                </span>
                <span className="font-semibold">{fcfa(p.montantFcfa)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bloc>
  );
}

function BlocSupports({ f, agir, envoi }: PropsBloc) {
  const [ajout, setAjout] = useState(false);
  const [type, setType] = useState<(typeof TYPES_SUPPORT)[number]>("BRACELET");
  const porteurs = f.membres;

  async function ajouter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const membreId = valeur(d, "membreId");
    const vehicule = valeur(d, "vehicule");
    if (await agir(`/abonnements/foyers/${f.id}/supports`, { type, ...(membreId && { membreId }), ...(vehicule && { vehicule }) })) setAjout(false);
  }
  const statut = (id: string, s: "ACTIF" | "SUSPENDU" | "PERDU") => void agir(`/abonnements/supports/${id}/statut`, { statut: s });

  return (
    <Bloc
      titre={`Supports (${f.supports.length})`}
      action={
        <button onClick={() => setAjout((a) => !a)} className={BOUTON_SECONDAIRE}>
          {ajout ? "Fermer" : "Ajouter"}
        </button>
      }
    >
      {ajout && (
        <form onSubmit={ajouter} className="mb-4 grid gap-3 rounded-xl border border-ligne p-3 sm:grid-cols-2">
          <Champ libelle="Type">
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={CHAMP}>
              {TYPES_SUPPORT.map((t) => (
                <option key={t} value={t}>
                  {SUPPORTS[t].libelle}
                </option>
              ))}
            </select>
          </Champ>
          {AVEC_PORTEUR.has(type) && (
            <Champ libelle="Porteur">
              <select name="membreId" className={CHAMP}>
                <option value="">Non précisé</option>
                {porteurs.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.prenom} {m.nom}
                  </option>
                ))}
              </select>
            </Champ>
          )}
          {type === "CARTE_VEHICULE" && (
            <Champ libelle="Immatriculation">
              <input name="vehicule" required minLength={2} maxLength={20} className={CHAMP} />
            </Champ>
          )}
          <div className="flex items-end justify-end sm:col-span-2">
            <button disabled={envoi} className={BOUTON}>
              Créer le support
            </button>
          </div>
        </form>
      )}
      {f.supports.length === 0 && <p className="text-sm text-attenue">Aucun support : souscrivez une formule ou ajoutez-en un.</p>}
      <ul className="grid gap-3">
        {f.supports.map((s) => (
          <li key={s.id} className="grid gap-1.5 rounded-xl bg-fond p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold">{s.code}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${COULEUR_SUPPORT[s.statut]}`}>{LIBELLES_STATUT_SUPPORT[s.statut]}</span>
              <span className="ml-auto font-mono text-xs text-attenue" title="Code court pour l'alerte par SMS ou USSD">
                code court {s.codeCourt}
              </span>
            </div>
            <p className="text-attenue">
              {s.libelle}
              {s.vehicule && ` · ${s.vehicule}`}
              {s.poseLe ? ` · posé le ${date(s.poseLe)}` : ""}
            </p>
            {AVEC_PORTEUR.has(s.type) && (
              <label className="flex items-center gap-2 text-xs">
                Porteur
                <select
                  value={s.porteur?.id ?? ""}
                  disabled={envoi}
                  onChange={(e) => void agir(`/abonnements/supports/${s.id}`, { membreId: e.target.value || null }, "PATCH")}
                  className="rounded border border-ligne bg-white px-2 py-1"
                >
                  <option value="">Non précisé</option>
                  {porteurs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.prenom} {m.nom}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-1.5 text-xs">
              {s.statut === "ACTIF" && (
                <>
                  <button disabled={envoi} onClick={() => statut(s.id, "SUSPENDU")} className="rounded border border-ligne bg-white px-2 py-1 font-semibold">
                    Suspendre
                  </button>
                  <button
                    disabled={envoi}
                    onClick={() => confirm(`Déclarer ${s.code} perdu ou volé ? Son QR ne déclenchera plus d'alerte.`) && statut(s.id, "PERDU")}
                    className="rounded border border-ligne bg-white px-2 py-1 font-semibold text-danger"
                  >
                    Perdu ou volé
                  </button>
                </>
              )}
              {s.statut === "SUSPENDU" && (
                <button disabled={envoi} onClick={() => statut(s.id, "ACTIF")} className="rounded border border-ligne bg-white px-2 py-1 font-semibold">
                  Réactiver
                </button>
              )}
              <button
                disabled={envoi}
                onClick={() =>
                  confirm(`Remplacer le QR de ${s.code} ? L'ancien QR ne fonctionnera plus : il faudra imprimer et poser le nouveau.`) &&
                  void agir(`/abonnements/supports/${s.id}/remplacer`, {})
                }
                className={`rounded border px-2 py-1 font-semibold ${s.statut === "PERDU" ? "border-brand bg-brand text-white" : "border-ligne bg-white"}`}
              >
                Nouveau QR
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Bloc>
  );
}

function BlocMembres({ f, agir, envoi }: PropsBloc) {
  const [edite, setEdite] = useState<string | null>(null);
  return (
    <Bloc
      titre={`Membres (${f.membres.length})`}
      action={
        <button onClick={() => setEdite(edite === "nouveau" ? null : "nouveau")} className={BOUTON_SECONDAIRE}>
          {edite === "nouveau" ? "Fermer" : "Ajouter"}
        </button>
      }
    >
      {edite === "nouveau" && <FormMembre foyerId={f.id} agir={agir} envoi={envoi} fermer={() => setEdite(null)} />}
      <ul className="grid gap-2 text-sm">
        {f.membres.map((m) =>
          edite === m.id ? (
            <li key={m.id}>
              <FormMembre foyerId={f.id} membre={m} agir={agir} envoi={envoi} fermer={() => setEdite(null)} />
            </li>
          ) : (
            <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">
                {m.prenom} {m.nom}
              </span>
              <span className="text-attenue">
                {LIBELLES_ROLE_MEMBRE[m.role]}
                {m.anneeNaissance && ` · né(e) en ${m.anneeNaissance}`}
                {m.telephone && ` · ${m.telephone}`}
              </span>
              {m.infosMedicalesRenseignees && <span className="rounded bg-danger-fond px-1.5 py-0.5 text-xs font-semibold text-danger">Santé renseignée</span>}
              <span className="ml-auto flex gap-1">
                <button onClick={() => setEdite(m.id)} className="text-xs text-brand underline">
                  Modifier
                </button>
                {m.role !== "TITULAIRE" && (
                  <button
                    disabled={envoi}
                    onClick={() => confirm(`Retirer ${m.prenom} ${m.nom} du foyer ?`) && void agir(`/abonnements/membres/${m.id}`, undefined, "DELETE")}
                    className="text-xs text-danger underline"
                  >
                    Retirer
                  </button>
                )}
              </span>
            </li>
          ),
        )}
      </ul>
    </Bloc>
  );
}

// Santé : saisie à l'aveugle. L'espace abonnements sait seulement si quelque chose est renseigné ;
// le texte n'est lu qu'à la centrale, pendant une alerte.
function FormMembre({ foyerId, membre, agir, envoi, fermer }: { foyerId: string; membre?: Membre; agir: Agir; envoi: boolean; fermer: () => void }) {
  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const sante = valeur(d, "infosMedicales");
    const annee = valeur(d, "anneeNaissance");
    const corps = {
      ...(membre?.role !== "TITULAIRE" && { role: d.get("role") }),
      prenom: valeur(d, "prenom"),
      nom: valeur(d, "nom"),
      telephone: valeur(d, "telephone") ?? "",
      anneeNaissance: annee ? Number(annee) : null,
      ...(sante ? { infosMedicales: sante } : d.get("effacerSante") === "on" ? { infosMedicales: "" } : {}),
    };
    const ok = membre ? await agir(`/abonnements/membres/${membre.id}`, corps, "PATCH") : await agir(`/abonnements/foyers/${foyerId}/membres`, corps);
    if (ok) fermer();
  }
  return (
    <form onSubmit={enregistrer} className="mb-3 grid gap-3 rounded-xl border border-ligne p-3 sm:grid-cols-2">
      {membre?.role !== "TITULAIRE" && (
        <Champ libelle="Rôle">
          <select name="role" defaultValue={membre?.role ?? "ENFANT"} className={CHAMP}>
            {ROLES_MEMBRE.filter((r) => r !== "TITULAIRE").map((r) => (
              <option key={r} value={r}>
                {LIBELLES_ROLE_MEMBRE[r]}
              </option>
            ))}
          </select>
        </Champ>
      )}
      <Champ libelle="Année de naissance">
        <input name="anneeNaissance" type="number" min={1900} max={new Date().getFullYear()} defaultValue={membre?.anneeNaissance ?? ""} className={CHAMP} />
      </Champ>
      <Champ libelle="Prénom">
        <input name="prenom" required maxLength={60} defaultValue={membre?.prenom} className={CHAMP} />
      </Champ>
      <Champ libelle="Nom">
        <input name="nom" required maxLength={60} defaultValue={membre?.nom} className={CHAMP} />
      </Champ>
      <Champ libelle="Téléphone">
        <input name="telephone" type="tel" required={membre?.role === "TITULAIRE"} defaultValue={membre?.telephone ?? ""} className={CHAMP} />
      </Champ>
      <Champ
        libelle="Santé (allergies, traitements, maladies)"
        aide={membre?.infosMedicalesRenseignees ? "Déjà renseignée, non affichée : laisser vide pour la conserver, écrire pour la remplacer." : "Lue uniquement par la centrale pendant une alerte."}
        className="sm:col-span-2"
      >
        <textarea name="infosMedicales" maxLength={1000} rows={2} autoComplete="off" className={CHAMP} />
      </Champ>
      {membre?.infosMedicalesRenseignees && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="effacerSante" /> Effacer les informations de santé
        </label>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={fermer} className={BOUTON_DISCRET}>
          Annuler
        </button>
        <button disabled={envoi} className={BOUTON}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function BlocContacts({ f, agir, envoi }: PropsBloc) {
  const [edite, setEdite] = useState<string | null>(null);
  return (
    <Bloc
      titre={`Contacts d'urgence (${f.contacts.length})`}
      action={
        <button onClick={() => setEdite(edite === "nouveau" ? null : "nouveau")} className={BOUTON_SECONDAIRE}>
          {edite === "nouveau" ? "Fermer" : "Ajouter"}
        </button>
      }
    >
      {edite === "nouveau" && <FormContact foyerId={f.id} agir={agir} envoi={envoi} fermer={() => setEdite(null)} />}
      {f.contacts.length === 0 && edite !== "nouveau" && <p className="text-sm text-danger">Aucun contact : la famille ne pourra pas être prévenue.</p>}
      <ul className="grid gap-2 text-sm">
        {f.contacts.map((c) =>
          edite === c.id ? (
            <li key={c.id}>
              <FormContact foyerId={f.id} contact={c} agir={agir} envoi={envoi} fermer={() => setEdite(null)} />
            </li>
          ) : (
            <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs text-attenue">{c.ordre}.</span>
              <span className="font-semibold">{c.nom}</span>
              <span className="text-attenue">
                {c.relation} · {c.telephone}
              </span>
              {!c.consentiLe && <span className="rounded bg-alerte-fond px-1.5 py-0.5 text-xs font-semibold text-alerte-encre">Accord à recueillir</span>}
              <span className="ml-auto flex gap-1">
                <button onClick={() => setEdite(c.id)} className="text-xs text-brand underline">
                  Modifier
                </button>
                <button
                  disabled={envoi}
                  onClick={() => confirm(`Retirer ${c.nom} des contacts ?`) && void agir(`/abonnements/contacts/${c.id}`, undefined, "DELETE")}
                  className="text-xs text-danger underline"
                >
                  Retirer
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
    </Bloc>
  );
}

function FormContact({ foyerId, contact, agir, envoi, fermer }: { foyerId: string; contact?: Contact; agir: Agir; envoi: boolean; fermer: () => void }) {
  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const consenti = d.get("consenti") === "on";
    const corps = {
      nom: valeur(d, "nom"),
      relation: valeur(d, "relation"),
      telephone: valeur(d, "telephone"),
      ordre: Number(d.get("ordre")),
      // La date de l'accord ne change que si l'accord change.
      ...((!contact || consenti !== !!contact.consentiLe) && { consenti }),
    };
    const ok = contact ? await agir(`/abonnements/contacts/${contact.id}`, corps, "PATCH") : await agir(`/abonnements/foyers/${foyerId}/contacts`, corps);
    if (ok) fermer();
  }
  return (
    <form onSubmit={enregistrer} className="mb-3 grid gap-3 rounded-xl border border-ligne p-3 sm:grid-cols-2">
      <Champ libelle="Nom">
        <input name="nom" required maxLength={80} defaultValue={contact?.nom} className={CHAMP} />
      </Champ>
      <Champ libelle="Lien avec le foyer">
        <input name="relation" required maxLength={40} placeholder="Sœur, voisin, collègue…" defaultValue={contact?.relation} className={CHAMP} />
      </Champ>
      <Champ libelle="Téléphone">
        <input name="telephone" type="tel" required defaultValue={contact?.telephone} className={CHAMP} />
      </Champ>
      <Champ libelle="Ordre d'appel">
        <input name="ordre" type="number" min={1} max={9} defaultValue={contact?.ordre ?? 1} className={CHAMP} />
      </Champ>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="consenti" defaultChecked={!!contact?.consentiLe} /> Ce proche accepte d'être appelé en cas d'alerte
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={fermer} className={BOUTON_DISCRET}>
          Annuler
        </button>
        <button disabled={envoi} className={BOUTON}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}
