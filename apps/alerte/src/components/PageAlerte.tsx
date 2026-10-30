"use client";

import type { StatutAlerte, TypeUrgence } from "@apsig/domain";
import type { ProblemePosition } from "@apsig/domain";
import { useEffect, useRef, useState } from "react";
import { appelApi, ErreurApi, type AlertePublique, type SupportPublic } from "@/lib/api";
import { PROBLEME_DE, usePositionTemoin, vautLaPeine, type EtatPosition, type PositionPrecise } from "@/lib/position";
import { CONSEILS, STYLE_URGENCE } from "@/lib/urgences";
import { AideLocalisation } from "./AideLocalisation";
import { Cadre, NumerosPublics } from "./Cadre";
import { Icone } from "./Icone";

type Suivi = { numero: string; cle: string };

const INTERVALLE_SUIVI_MS = 10_000;
const TERMINES: StatutAlerte[] = ["CLOTUREE", "ANNULEE"];
const RANG: Record<StatutAlerte, number> = { NOUVELLE: 1, PRISE_EN_CHARGE: 2, EN_ROUTE: 3, SUR_PLACE: 4, CLOTUREE: 4, ANNULEE: 0 };

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const vibrer = (motif: number | number[]) => navigator.vibrate?.(motif);

// Le stockage peut être indisponible (navigation privée, réglages) : la page doit fonctionner sans.
function lire<T>(zone: "local" | "session", cle: string): T | null {
  try {
    const v = (zone === "local" ? localStorage : sessionStorage).getItem(cle);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function ecrire(zone: "local" | "session", cle: string, valeur: unknown) {
  try {
    const s = zone === "local" ? localStorage : sessionStorage;
    if (valeur === null) s.removeItem(cle);
    else s.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* sans stockage, le suivi ne survit simplement pas au rechargement */
  }
}

// Identifiant pseudonyme aléatoire de l'appareil (aide la centrale à repérer les abus, aucune donnée personnelle).
function appareilId(): string | undefined {
  const existant = lire<string>("local", "apsig-appareil");
  if (existant) return existant;
  if (!globalThis.crypto?.getRandomValues) return undefined;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const id = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => alphabet[b % alphabet.length]).join("");
  ecrire("local", "apsig-appareil", id);
  return id;
}

export function PageAlerte({ jeton, support }: { jeton: string; support: SupportPublic }) {
  const cleSession = `apsig-alerte-${jeton}`;
  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [alerte, setAlerte] = useState<AlertePublique | null>(null);
  const [envoi, setEnvoi] = useState<TypeUrgence | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [trompe, setTrompe] = useState(false);
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const [annulation, setAnnulation] = useState(false);

  const termine = alerte != null && TERMINES.includes(alerte.statut);
  // Position demandée dès l'ouverture de la page, suivie jusqu'à la fin de l'alerte.
  const localisation = usePositionTemoin(!termine);
  const derniereEnvoyee = useRef<{ position: PositionPrecise; le: number } | null>(null);
  const problemeSignale = useRef<ProblemePosition | null>(null);

  // Reprise du suivi si la page est rechargée pendant une alerte.
  useEffect(() => {
    const enregistre = lire<Suivi>("session", cleSession);
    if (!enregistre) return;
    appelApi<AlertePublique>(`/public/alertes/${encodeURIComponent(enregistre.numero)}?cle=${encodeURIComponent(enregistre.cle)}`)
      .then((a) => {
        setSuivi(enregistre);
        setAlerte(a);
      })
      .catch(() => ecrire("session", cleSession, null));
  }, [cleSession]);

  // Suivi de l'alerte tant qu'elle est ouverte (relevé régulier, et dès que la page redevient visible).
  useEffect(() => {
    if (!suivi || termine) return;
    let actif = true;
    const relever = () =>
      appelApi<AlertePublique>(`/public/alertes/${encodeURIComponent(suivi.numero)}?cle=${encodeURIComponent(suivi.cle)}`)
        .then((a) => {
          if (!actif) return;
          setAlerte((avant) => {
            if (avant && avant.statut !== a.statut) vibrer([40, 60, 40]);
            return a;
          });
        })
        .catch(() => {
          /* réseau instable : on réessaie au prochain relevé */
        });
    const minuterie = setInterval(relever, INTERVALLE_SUIVI_MS);
    const auRetour = () => document.visibilityState === "visible" && relever();
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      actif = false;
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [suivi, termine]);

  // Position en direct vers la centrale tant que l'alerte est ouverte (le témoin peut se déplacer).
  const position = localisation.position;
  useEffect(() => {
    if (!suivi || termine || !position) return;
    const avant = derniereEnvoyee.current;
    if (!vautLaPeine(avant, position, Date.now())) return;
    derniereEnvoyee.current = { position, le: Date.now() };
    appelApi<AlertePublique>(`/public/alertes/${encodeURIComponent(suivi.numero)}/position`, {
      methode: "POST",
      corps: { cle: suivi.cle, position },
    })
      .then(setAlerte)
      .catch(() => {
        derniereEnvoyee.current = avant; // renvoyée à la prochaine mesure
      });
  }, [suivi, termine, position]);

  // Refus ou GPS coupé : la centrale le sait tout de suite et rappelle le témoin.
  const etatPosition = localisation.etat;
  useEffect(() => {
    if (etatPosition === "ok") problemeSignale.current = null;
    const probleme = PROBLEME_DE[etatPosition];
    if (!suivi || termine || !probleme || problemeSignale.current === probleme) return;
    problemeSignale.current = probleme;
    appelApi<AlertePublique>(`/public/alertes/${encodeURIComponent(suivi.numero)}/position/probleme`, {
      methode: "POST",
      corps: { cle: suivi.cle, probleme },
    })
      .then(setAlerte)
      .catch(() => {
        problemeSignale.current = null;
      });
  }, [suivi, termine, etatPosition]);

  async function declencher(type: TypeUrgence) {
    setEnvoi(type);
    setErreur(null);
    setInfo(null);
    setTrompe(false);
    vibrer(60);
    // L'alerte n'attend jamais la position : elle part avec ce qui est connu à cet instant.
    const position = localisation.position ?? undefined;
    const probleme = position ? undefined : (PROBLEME_DE[localisation.etat] ?? undefined);
    try {
      const r = await appelApi<AlertePublique & { cleTemoin: string; doublon: boolean }>("/public/alertes", {
        methode: "POST",
        corps: { jeton, type, appareilId: appareilId(), position, problemePosition: probleme },
      });
      const s = { numero: r.numero, cle: r.cleTemoin };
      derniereEnvoyee.current = position && !r.doublon ? { position, le: Date.now() } : null;
      problemeSignale.current = probleme && !r.doublon ? probleme : null;
      setSuivi(s);
      setAlerte(r);
      ecrire("session", cleSession, s);
      if (r.doublon) setInfo("Une alerte identique était déjà en cours : la centrale a été relancée.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErreur(`${e instanceof ErreurApi ? e.message : "Envoi impossible"}. Réessayez ou appelez directement les secours ci-dessous.`);
    } finally {
      setEnvoi(null);
    }
  }

  async function annuler() {
    if (!suivi) return;
    setAnnulation(true);
    try {
      const a = await appelApi<AlertePublique>(`/public/alertes/${encodeURIComponent(suivi.numero)}/annuler`, {
        methode: "POST",
        corps: { cle: suivi.cle },
      });
      setAlerte(a);
      setConfirmerAnnulation(false);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : "Annulation impossible");
      setConfirmerAnnulation(false);
    } finally {
      setAnnulation(false);
    }
  }

  function recommencer() {
    ecrire("session", cleSession, null);
    setSuivi(null);
    setAlerte(null);
    derniereEnvoyee.current = null;
    problemeSignale.current = null;
    setInfo(null);
    setErreur(null);
  }

  if (!alerte) {
    return (
      <Cadre>
        <CarteSupport support={support} />

        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight uppercase">Quelle est l'urgence ?</h1>
          <p className="mt-1 text-sm text-attenue">Un seul appui : la centrale APSIG est alertée immédiatement.</p>
        </div>

        {erreur && <Bandeau ton="erreur">{erreur}</Bandeau>}

        <div className="grid gap-3">
          {support.urgences.map((u) => {
            const style = STYLE_URGENCE[u.type];
            return (
              <button
                key={u.type}
                type="button"
                disabled={envoi != null}
                onClick={() => declencher(u.type)}
                className={`flex min-h-24 items-center gap-4 rounded-2xl px-4 py-4 text-left text-white shadow-lg transition active:scale-[.98] disabled:opacity-60 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand ${style.fond} ${envoi === u.type ? "pulsation !opacity-100" : ""}`}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/20">
                  {envoi === u.type ? <Rotation /> : <Icone nom={style.icone} className="size-7" />}
                </span>
                <span className="flex-1">
                  <strong className="block text-lg leading-tight font-black uppercase">{u.bouton}</strong>
                  <span className="mt-1 block text-sm font-semibold text-white/90">
                    {envoi === u.type ? "Envoi à la centrale…" : u.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {trompe ? (
          <Bandeau ton="info">Aucune alerte n'a été envoyée. Vous pouvez fermer cette page.</Bandeau>
        ) : (
          <button
            type="button"
            onClick={() => setTrompe(true)}
            className="min-h-14 rounded-2xl bg-slate-300 font-bold text-slate-700 active:bg-slate-400"
          >
            Je me suis trompé — Annuler
          </button>
        )}

        <EtatLocalisation etat={localisation.etat} precisionM={localisation.position?.precisionM} onReessayer={localisation.reessayer} />
        <NumerosPublics />
      </Cadre>
    );
  }

  const annulee = alerte.statut === "ANNULEE";
  const cloturee = alerte.statut === "CLOTUREE";
  const rang = RANG[alerte.statut];
  const etapes = [
    { titre: "Alerte reçue par la centrale", detail: heure(alerte.creeLe) },
    { titre: "Prise en charge par un opérateur", detail: alerte.priseEnChargeLe ? heure(alerte.priseEnChargeLe) : "En attente…" },
    { titre: "Équipe en route", detail: "" },
    { titre: "Équipe sur place", detail: alerte.surPlaceLe ? heure(alerte.surPlaceLe) : "" },
  ];

  return (
    <Cadre>
      <section
        className={`grid justify-items-center rounded-3xl px-5 pt-7 pb-6 text-center text-white shadow-lg ${annulee ? "bg-slate-600" : cloturee ? "bg-succes" : STYLE_URGENCE[alerte.type].fond}`}
      >
        <span className={`grid size-16 place-items-center rounded-full bg-white/20 ${termine ? "" : "pulsation"}`}>
          <Icone nom={annulee ? "croixFermer" : "coche"} className="size-8" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">
          {annulee ? "Alerte annulée" : cloturee ? "Intervention terminée" : "Alerte transmise"}
        </h1>
        <p className="mt-1 font-semibold text-white/90">{alerte.urgence}</p>
        <p className="mt-3 rounded-lg bg-white/15 px-3 py-1 font-mono text-sm font-bold">{alerte.numero}</p>
        <p className="mt-2 text-xs text-white/75">{support.code} · {heure(alerte.creeLe)}</p>
      </section>

      {info && <Bandeau ton="info">{info}</Bandeau>}
      {erreur && <Bandeau ton="erreur">{erreur}</Bandeau>}

      {/* Sans position, l'aide passe avant tout le reste : c'est ce qui permet aux secours de venir. */}
      {!termine && (localisation.etat === "refusee" || localisation.etat === "indisponible" || localisation.etat === "impossible") ? (
        <AideLocalisation probleme={localisation.etat} onReessayer={localisation.reessayer} />
      ) : (
        !termine && <EtatLocalisation etat={localisation.etat} precisionM={localisation.position?.precisionM} enDirect />
      )}

      {!annulee && (
        <ol aria-label="Suivi de l'alerte" className="grid rounded-2xl border border-ligne bg-white p-4">
          {etapes.map((e, i) => {
            const fait = i < rang;
            const enCours = i === rang && !termine;
            return (
              <li key={e.titre} className="relative flex gap-3 pb-4 last:pb-0">
                {i < etapes.length - 1 && (
                  <span aria-hidden="true" className={`absolute top-8 bottom-0 left-[15px] w-0.5 ${fait ? "bg-succes" : "bg-ligne"}`} />
                )}
                <span
                  className={`relative grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${fait ? "bg-succes text-white" : enCours ? "bg-brand text-white ring-4 ring-brand/20" : "bg-fond text-attenue"}`}
                >
                  {fait ? <Icone nom="coche" className="size-4" /> : i + 1}
                </span>
                <span className="pt-1">
                  <strong className={`block text-[15px] ${fait || enCours ? "text-encre" : "text-attenue"}`}>{e.titre}</strong>
                  {e.detail && (fait || enCours) && <small className="text-[13px] text-attenue">{e.detail}</small>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {!termine && (
        <section className="rounded-2xl border border-amber-300 bg-alerte-fond p-4">
          <h2 className="font-bold">En attendant les secours</h2>
          <ul className="mt-3 grid gap-2">
            {CONSEILS[alerte.type].map((c) => (
              <li key={c} className="flex gap-2 text-[15px]">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-alerte-encre" />
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      {termine ? (
        <button type="button" onClick={recommencer} className="min-h-14 rounded-2xl bg-brand font-bold text-white">
          Revenir au menu d'urgence
        </button>
      ) : alerte.peutAnnuler && (
        confirmerAnnulation ? (
          <div className="grid gap-2 rounded-2xl border border-ligne bg-white p-4">
            <p className="text-sm font-semibold">Confirmer l'annulation ? La centrale sera informée qu'il s'agit d'une erreur.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmerAnnulation(false)} className="min-h-12 rounded-xl bg-fond font-bold">
                Non, garder
              </button>
              <button type="button" onClick={annuler} disabled={annulation} className="min-h-12 rounded-xl bg-slate-700 font-bold text-white disabled:opacity-60">
                {annulation ? "Annulation…" : "Oui, annuler"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmerAnnulation(true)}
            className="min-h-14 rounded-2xl bg-slate-300 font-bold text-slate-700 active:bg-slate-400"
          >
            Je me suis trompé — Annuler
          </button>
        )
      )}

      <NumerosPublics />
    </Cadre>
  );
}

// Ligne d'état de la position : sur le menu (avant l'envoi) et pendant l'alerte quand tout va bien.
function EtatLocalisation({
  etat,
  precisionM,
  enDirect = false,
  onReessayer,
}: {
  etat: EtatPosition;
  precisionM?: number | undefined;
  enDirect?: boolean;
  onReessayer?: () => void;
}) {
  if (etat === "ok") {
    const precision = precisionM != null ? ` (± ${Math.round(precisionM)} m)` : "";
    return (
      <Bandeau ton="succes">
        <span className="flex items-center gap-2">
          <Icone nom="repere" className="size-5 shrink-0" />
          {enDirect ? `Votre position est suivie en direct par la centrale${precision}.` : `Position trouvée${precision} : elle partira avec l'alerte.`}
        </span>
      </Bandeau>
    );
  }
  if (etat === "demande") {
    return (
      <Bandeau ton="neutre">
        <span className="flex items-center gap-2">
          <Icone nom="repere" className="size-5 shrink-0 animate-pulse text-brand" />
          {enDirect ? "Recherche de votre position…" : "Touchez « Autoriser » si le téléphone demande votre position : elle guide les secours."}
        </span>
      </Bandeau>
    );
  }
  // Avant l'envoi : rappel discret, l'aide complète s'affiche une fois l'alerte partie.
  return (
    <Bandeau ton="attention">
      <span className="flex items-center gap-2">
        <Icone nom="repereBarre" className="size-5 shrink-0" />
        <span>
          {etat === "refusee" ? "Position bloquée" : "Position introuvable"} : l'alerte partira quand même.
          {onReessayer && etat !== "impossible" && (
            <button type="button" onClick={onReessayer} className="ml-1 font-bold underline">
              Réessayer
            </button>
          )}
        </span>
      </span>
    </Bandeau>
  );
}

function CarteSupport({ support }: { support: SupportPublic }) {
  return (
    <section aria-label="Support scanné" className="rounded-2xl bg-brand-clair p-4 shadow-lg ring-1 ring-brand/10">
      <p className="font-mono text-xl leading-tight font-extrabold break-all text-brand">{support.code}</p>
      {support.lieu ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-encre">
          <span>{support.lieu.quartier}, {support.lieu.ville}</span>
          {support.lieu.adresseVerifiee && (
            <span className="inline-flex items-center gap-1 font-semibold text-succes">
              <Icone nom="coche" className="size-4" />
              Adresse vérifiée
            </span>
          )}
        </p>
      ) : (
        <p className="mt-1 text-sm text-encre">{support.libelle}</p>
      )}
    </section>
  );
}

const TONS = {
  erreur: "bg-red-50 text-red-800 ring-red-200",
  attention: "bg-alerte-fond text-alerte-encre ring-amber-200",
  succes: "bg-succes-fond text-succes ring-green-200",
  info: "bg-brand-clair text-brand ring-brand/15",
  neutre: "bg-white text-attenue ring-ligne",
} as const;

function Bandeau({ ton, children }: { ton: keyof typeof TONS; children: React.ReactNode }) {
  return (
    <div role={ton === "erreur" ? "alert" : "status"} className={`rounded-xl px-3 py-2.5 text-sm font-medium ring-1 ${TONS[ton]}`}>
      {children}
    </div>
  );
}

function Rotation() {
  return <span aria-hidden="true" className="size-6 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />;
}
