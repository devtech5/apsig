import { useState } from "react";
import { LIBELLES_RAPPEL, LIBELLES_STATUT, REPARTITION, type StatutAlerte, type StatutRappel } from "@apsig/domain";
import type { AlerteDetail, MembreEquipe } from "@/lib/api";
import { dateHeure, duree, heure, lienCarte } from "@/lib/format";
import { Carte } from "./Carte";
import { Icone, STYLE_URGENCE } from "./Icone";

const ACTIONS: Record<StatutAlerte, string> = {
  NOUVELLE: "",
  PRISE_EN_CHARGE: "Prendre en charge",
  EN_ROUTE: "Unité en route",
  SUR_PLACE: "Unité sur place",
  CLOTUREE: "Clôturer",
  ANNULEE: "Annuler l'alerte",
};

// Résultat de l'appel au titulaire (libellés complets dans LIBELLES_RAPPEL).
const RAPPELS: [StatutRappel, string][] = [
  ["CONFIRME", "Urgence confirmée"],
  ["EN_SECURITE", "En sécurité"],
  ["INJOIGNABLE", "Injoignable"],
  ["FAUSSE_ALERTE", "Fausse alerte"],
];

const NIVEAU_FIABILITE = {
  ELEVEE: { texte: "Fiabilité élevée", classe: "bg-succes-fond text-succes" },
  MOYENNE: { texte: "Fiabilité moyenne", classe: "bg-alerte-fond text-alerte-encre" },
  FAIBLE: { texte: "Fiabilité faible", classe: "bg-danger-fond text-danger" },
};

type Props = {
  a: AlerteDetail;
  maintenant: number;
  // Envoie une action à l'API ; rejette avec le message à afficher.
  agir: (chemin: string, corps: unknown) => Promise<void>;
  onChoisir: (numero: string) => void;
  // Présent pour la supervision : cibles de la réattribution.
  equipe?: MembreEquipe[] | undefined;
};

export function FicheAlerte({ a, maintenant, agir, onChoisir, equipe }: Props) {
  const style = STYLE_URGENCE[a.type];
  const ouverte = a.statut !== "CLOTUREE" && a.statut !== "ANNULEE";
  // Accepter fait passer une nouvelle alerte en « prise en charge » : le bouton de statut ferait doublon.
  const statuts = a.peutPrendre ? a.statutsPossibles.filter((s) => s !== "PRISE_EN_CHARGE") : a.statutsPossibles;
  const reste = a.peutPrendre && a.attribueeLe
    ? Math.max(0, REPARTITION.delaiAcceptationS - Math.floor((maintenant - new Date(a.attribueeLe).getTime()) / 1000))
    : null;
  const [cloture, setCloture] = useState<StatutAlerte | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(chemin: string, corps: unknown) {
    setEnvoi(true);
    setErreur(null);
    try {
      await agir(`/centrale/alertes/${a.numero}${chemin}`, corps);
      return true;
    } catch (e) {
      setErreur((e as Error).message);
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  function changerStatut(statut: StatutAlerte) {
    if (statut === "CLOTUREE" || statut === "ANNULEE") setCloture(statut);
    else void envoyer("/statut", { statut });
  }

  async function confirmerCloture(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const issue = String(new FormData(e.currentTarget).get("issue") ?? "").trim();
    if (cloture && (await envoyer("/statut", { statut: cloture, issue }))) setCloture(null);
  }

  async function ajouterNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const texte = String(new FormData(form).get("texte") ?? "").trim();
    if (texte && (await envoyer("/notes", { texte }))) form.reset();
  }

  return (
    <article className="grid content-start gap-4">
      <header className={`grid gap-2 rounded-2xl p-5 text-white ${style.fond}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xl font-black">
            <Icone nom={style.icone} className="size-6" />
            {a.urgence}
          </h2>
          <span className="font-mono text-2xl font-black tabular-nums">{ouverte ? duree(a.creeLe, maintenant) : LIBELLES_STATUT[a.statut]}</span>
        </div>
        <p className="text-sm text-white/85">
          {a.numero} · déclenchée à {heure(a.creeLe)} · priorité {a.priorite.toLowerCase()} · {LIBELLES_STATUT[a.statut]}
          {a.operateur && ` par ${a.operateur}`}
          {a.attribueeA && a.attribueeA.nom !== a.operateur && ` · attribuée à ${a.attribueeA.nom}`}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          {a.redeclenchements > 0 && <Pastille>{a.redeclenchements + 1} déclenchements regroupés</Pastille>}
          {a.temoinsRattaches.length > 0 && <Pastille>{a.temoinsRattaches.length + 1} témoins du même incident</Pastille>}
          {a.intervention && <Pastille>Formule Sécurité + : intervention APSIG</Pastille>}
          {a.abonnementExpire && <Pastille>Abonnement expiré : alerte traitée quand même</Pastille>}
          {a.signaleeLe && <Pastille>Signalée au superviseur à {heure(a.signaleeLe)}</Pastille>}
        </div>
      </header>

      {erreur && <p role="alert" className="rounded-xl bg-danger-fond px-4 py-3 text-sm font-semibold text-danger">{erreur}</p>}

      {a.principale && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-alerte-fond px-4 py-3 text-sm text-alerte-encre">
          <Icone nom="lien" className="size-4" />
          <span>
            Témoin supplémentaire de l'incident{" "}
            <button onClick={() => onChoisir(a.principale!.numero)} className="font-bold underline">
              {a.principale.numero}
            </button>{" "}
            ({LIBELLES_STATUT[a.principale.statut].toLowerCase()}) : l'incident se traite sur l'alerte principale.
          </span>
          {a.peutAgir && ouverte && (
            <button
              disabled={envoi}
              onClick={() => void envoyer("/detacher", {})}
              className="ml-auto rounded-lg border border-alerte-encre px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Ce n'est pas le même incident
            </button>
          )}
        </div>
      )}

      {!a.peutAgir && ouverte && (
        <p className="rounded-xl bg-fond px-4 py-3 text-sm text-attenue">
          Lecture seule : alerte {a.attribueeA ? `traitée par ${a.attribueeA.nom}` : "réattribuée"}.
        </p>
      )}

      {a.peutPrendre && (
        <button
          disabled={envoi}
          onClick={() => void envoyer("/prendre", {})}
          className="clignote-doux flex items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-4 text-lg font-black text-white shadow disabled:opacity-60"
        >
          Accepter l'alerte
          {reste !== null && <span className="rounded bg-white/20 px-2 py-0.5 font-mono text-base tabular-nums">{reste} s</span>}
        </button>
      )}

      {/* La carte d'abord, en grand : c'est ce qui guide les secours. */}
      {a.position || a.temoin ? (
        <section aria-label="Localisation" className="relative overflow-hidden rounded-2xl bg-white shadow-sm">
          <Carte
            className="h-[55vh] min-h-80"
            points={[
              ...(a.position ? [{ ...a.position, type: a.type, libelle: `Intervention · ${a.numero}` }] : []),
              ...(a.temoin ? [{ ...a.temoin, temoin: true, libelle: "Témoin" }] : []),
              ...a.temoinsRattaches.flatMap((t) => (t.temoin ? [{ ...t.temoin, temoin: true, libelle: `Témoin ${t.numero}` }] : [])),
            ]}
          />
          <p className="pointer-events-none absolute top-3 left-3 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-semibold shadow">
            {a.foyer ? `${a.foyer.libelle} · ${a.foyer.quartier}, ${a.foyer.ville}` : `${a.support.libelle} ${a.support.code}`}
            {a.temoin?.precisionM != null && <span className="font-normal text-attenue"> · témoin à ± {Math.round(a.temoin.precisionM)} m</span>}
          </p>
        </section>
      ) : (
        ouverte && (
          <p className="flex items-center gap-2 rounded-2xl bg-danger-fond px-4 py-6 text-base font-bold text-danger">
            <Icone nom="repere" className="size-6" />
            Position inconnue : rappeler le témoin pour le localiser.
          </p>
        )
      )}

      {equipe && ouverte && !a.principale && <Reattribution a={a} equipe={equipe} envoi={envoi} envoyer={envoyer} />}

      {a.peutAgir && ouverte && !a.principale && (
        <Bloc titre="Actions">
          <div className="flex flex-wrap gap-2">
            {statuts.map((s) => (
              <button
                key={s}
                disabled={envoi}
                onClick={() => changerStatut(s)}
                className={`rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60 ${
                  s === "PRISE_EN_CHARGE" ? "bg-brand text-white" : s === "ANNULEE" ? "border border-ligne bg-white text-attenue" : "border border-brand bg-white text-brand"
                }`}
              >
                {ACTIONS[s]}
              </button>
            ))}
          </div>
          {cloture && (
            <form onSubmit={confirmerCloture} className="mt-3 grid gap-2">
              <label className="grid gap-1 text-sm font-semibold">
                {cloture === "CLOTUREE" ? "Issue de l'intervention" : "Motif de l'annulation"}
                <textarea name="issue" required maxLength={500} rows={2} autoFocus className="rounded-lg border border-ligne px-3 py-2 font-normal" />
              </label>
              <div className="flex gap-2">
                <button disabled={envoi} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                  Confirmer : {LIBELLES_STATUT[cloture].toLowerCase()}
                </button>
                <button type="button" onClick={() => setCloture(null)} className="rounded-lg px-4 py-2 text-sm text-attenue">
                  Retour
                </button>
              </div>
            </form>
          )}
          <div className="mt-4 border-t border-ligne pt-3">
            <p className="text-sm">
              <span className="font-semibold">Rappel du titulaire :</span> {LIBELLES_RAPPEL[a.rappel]}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RAPPELS.map(([r, libelle]) => (
                <button
                  key={r}
                  disabled={envoi || r === a.rappel}
                  onClick={() => void envoyer("/rappel", { rappel: r })}
                  className="rounded-lg border border-ligne bg-white px-3 py-1.5 text-xs font-semibold disabled:bg-brand-clair disabled:text-brand"
                >
                  {libelle}
                </button>
              ))}
            </div>
          </div>
        </Bloc>
      )}

      {!ouverte && a.issue && (
        <Bloc titre="Issue">
          <p className="text-sm">{a.issue}</p>
          {a.clotureLe && <p className="mt-1 text-xs text-attenue">{LIBELLES_STATUT[a.statut]} le {dateHeure(a.clotureLe)}</p>}
        </Bloc>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Bloc titre="Lieu">
          <dl className="grid gap-1 text-sm">
            <Ligne terme="Support">{a.support.libelle} · <span className="font-mono">{a.support.code}</span></Ligne>
            {a.foyer && (
              <>
                <Ligne terme="Foyer">{a.foyer.libelle}</Ligne>
                {a.foyer.adresse && <Ligne terme="Adresse">{a.foyer.adresse}</Ligne>}
                <Ligne terme="Quartier">
                  {a.foyer.quartier}, {a.foyer.ville} {a.foyer.adresseVerifiee ? "(adresse vérifiée)" : "(adresse non vérifiée)"}
                </Ligne>
              </>
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {a.position ? (
              <a href={lienCarte(a.position)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-brand underline">
                <Icone nom="repere" className="size-4" /> Position d'intervention
              </a>
            ) : (
              <span className="text-danger">Position inconnue : à obtenir auprès du témoin</span>
            )}
            {a.temoin && (
              <a href={lienCarte(a.temoin)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand underline">
                <Icone nom="repere" className="size-4" /> Témoin
                {a.temoin.precisionM != null && ` (± ${Math.round(a.temoin.precisionM)} m)`}
              </a>
            )}
          </div>
        </Bloc>

        <Bloc titre="Fiabilité">
          <p className="flex items-center gap-2 text-sm">
            <span className={`rounded px-2 py-0.5 font-bold ${NIVEAU_FIABILITE[a.fiabilite.niveau].classe}`}>
              {NIVEAU_FIABILITE[a.fiabilite.niveau].texte}
            </span>
            <span className="font-mono font-bold">{a.fiabilite.score}/100</span>
          </p>
          <ul className="mt-2 grid gap-0.5 text-sm">
            {a.fiabilite.raisons.map((r) => (
              <li key={r.texte} className="flex gap-2">
                <span className={`w-9 shrink-0 text-right font-mono ${r.delta < 0 ? "text-danger" : "text-succes"}`}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
                {r.texte}
              </li>
            ))}
          </ul>
        </Bloc>
      </div>

      {a.temoinsRattaches.length > 0 && (
        <Bloc titre={`Autres témoins du même incident (${a.temoinsRattaches.length})`}>
          <p className="mb-2 text-xs text-attenue">
            Même urgence signalée à proximité : secours prévenus une seule fois, ces alertes suivent celle-ci et se clôturent avec elle.
          </p>
          <ul className="grid gap-1 text-sm">
            {a.temoinsRattaches.map((t) => (
              <li key={t.numero}>
                <button onClick={() => onChoisir(t.numero)} className="flex w-full justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-fond">
                  <span>
                    <span className="font-mono text-xs text-attenue">{t.numero}</span> {t.support.libelle} {t.support.code}
                  </span>
                  <span className="text-xs text-attenue">
                    {heure(t.creeLe)} · {LIBELLES_STATUT[t.statut]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Bloc>
      )}

      {(a.foyer || a.porteur) && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Bloc titre={a.porteur ? "Porteur du support" : "Membres du foyer"}>
            <ul className="grid gap-2 text-sm">
              {a.porteur && <Personne p={a.porteur} />}
              {!a.porteur && a.foyer?.membres.map((m) => <Personne key={`${m.prenom}-${m.nom}`} p={m} />)}
            </ul>
            {a.foyer?.abonnement && (
              <p className="mt-3 border-t border-ligne pt-2 text-xs text-attenue">
                {a.foyer.abonnement.formule} · {a.foyer.abonnement.statut.toLowerCase()} jusqu'au {dateHeure(a.foyer.abonnement.fin)}
              </p>
            )}
          </Bloc>
          {a.foyer && (
            <Bloc titre="Contacts d'urgence">
              {a.foyer.contacts.length === 0 && <p className="text-sm text-attenue">Aucun contact enregistré</p>}
              <ul className="grid gap-2 text-sm">
                {a.foyer.contacts.map((c) => (
                  <li key={c.telephone} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{c.nom}</span> <span className="text-attenue">({c.relation})</span>
                    </span>
                    <Telephone numero={c.telephone} />
                  </li>
                ))}
              </ul>
            </Bloc>
          )}
        </div>
      )}

      <Bloc titre="Journal">
        <ol className="grid gap-1.5 text-sm">
          {a.journal.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-16 shrink-0 font-mono text-xs leading-5 text-attenue">{heure(e.le)}</span>
              <span>
                {e.texte}
                {e.auteur && <span className="text-attenue"> · {e.auteur}</span>}
              </span>
            </li>
          ))}
        </ol>
        <form onSubmit={ajouterNote} className="mt-3 flex gap-2">
          <input name="texte" maxLength={1000} placeholder="Ajouter une note au journal" className="min-w-0 flex-1 rounded-lg border border-ligne px-3 py-2 text-sm" />
          <button disabled={envoi} className="rounded-lg border border-brand px-3 py-2 text-sm font-bold text-brand disabled:opacity-60">
            Noter
          </button>
        </form>
      </Bloc>

      {a.messages.length > 0 && (
        <Bloc titre={`Messages (${a.messages.length})`}>
          <p className="mb-2 text-xs text-attenue">L'envoi automatique des SMS n'est pas encore branché : ces messages sont en file.</p>
          <ul className="grid gap-2 text-sm">
            {a.messages.map((m, i) => (
              <li key={i} className="rounded-lg bg-fond px-3 py-2">
                <p className="flex justify-between gap-2 text-xs text-attenue">
                  <span>
                    {m.canal} → {m.nomDestinataire ?? m.destinataire} ({m.destinataire})
                  </span>
                  <span>{m.statut.replace("_", " ").toLowerCase()}</span>
                </p>
                <p>{m.texte}</p>
              </li>
            ))}
          </ul>
        </Bloc>
      )}
    </article>
  );
}

// Superviseur : confier l'alerte à un opérateur précis, ou la remettre en répartition automatique.
function Reattribution({
  a,
  equipe,
  envoi,
  envoyer,
}: {
  a: AlerteDetail;
  equipe: MembreEquipe[];
  envoi: boolean;
  envoyer: (chemin: string, corps: unknown) => Promise<boolean>;
}) {
  const disponibles = equipe.filter((m) => m.id !== a.attribueeA?.id && m.presence !== "HORS_SERVICE");
  function reattribuer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cible = String(new FormData(e.currentTarget).get("cible") ?? "");
    void envoyer("/reattribuer", cible ? { operateurId: cible } : {});
  }
  return (
    <form onSubmit={reattribuer} className="flex flex-wrap items-center gap-2 rounded-xl border border-ligne bg-white px-4 py-3 text-sm">
      <span className="font-semibold">Supervision :</span>
      <span className="text-attenue">{a.attribueeA ? `chez ${a.attribueeA.nom}${a.accepteeLe ? "" : " (pas encore acceptée)"}` : "en file commune"}</span>
      <select name="cible" className="ml-auto rounded-lg border border-ligne px-2 py-1.5" defaultValue="">
        <option value="">Répartition automatique</option>
        {disponibles.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nom} · {m.charge} en cours{m.presence === "PAUSE" ? " · en pause" : ""}
          </option>
        ))}
      </select>
      <button disabled={envoi} className="rounded-lg border border-brand px-3 py-1.5 font-bold text-brand disabled:opacity-60">
        Réattribuer
      </button>
    </form>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-bold tracking-wide text-attenue uppercase">{titre}</h3>
      {children}
    </section>
  );
}

function Ligne({ terme, children }: { terme: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-attenue">{terme}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Pastille({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white/20 px-2 py-0.5">{children}</span>;
}

function Telephone({ numero }: { numero: string }) {
  return (
    <a href={`tel:${numero.replace(/\s/g, "")}`} className="flex shrink-0 items-center gap-1 font-mono text-brand">
      <Icone nom="telephone" className="size-3.5" />
      {numero}
    </a>
  );
}

type PersonneFiche = { prenom: string; nom: string; anneeNaissance: number | null; infosMedicales: string | null; role?: string; telephone?: string | null };

function Personne({ p }: { p: PersonneFiche }) {
  return (
    <li className="grid gap-0.5">
      <span className="flex items-center justify-between gap-2">
        <span>
          <span className="font-semibold">
            {p.prenom} {p.nom}
          </span>
          {p.role && <span className="text-attenue"> · {p.role.toLowerCase()}</span>}
          {p.anneeNaissance && <span className="text-attenue"> · né(e) en {p.anneeNaissance}</span>}
        </span>
        {p.telephone && <Telephone numero={p.telephone} />}
      </span>
      {p.infosMedicales && (
        <span className="rounded bg-danger-fond px-2 py-1 text-xs font-semibold text-danger">Santé : {p.infosMedicales}</span>
      )}
    </li>
  );
}
