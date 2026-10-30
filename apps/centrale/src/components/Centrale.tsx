"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { appelApi, ErreurApi, type FileCentrale, type Presence } from "@/lib/api";
import { useSession } from "./Session";

// Le flux temps réel (SSE) déclenche la relecture de la file ; ce rappel régulier la resynchronise
// au cas où un événement se perdrait, et prend le relais (plus souvent) si le flux est coupé.
const RESYNCHRO_MS = 15_000;
const SANS_FLUX_MS = 5_000;
// Une rafale d'événements (crise, 200 alertes) ne provoque qu'une relecture.
const REGROUPEMENT_MS = 400;
const SIRENE_MS = 4_000;

type Centrale = {
  file: FileCentrale | null;
  // Incrémenté à chaque changement signalé par le flux : la fiche ouverte se relit.
  version: number;
  enDirect: boolean;
  horsLigne: boolean;
  rafraichir: () => Promise<FileCentrale | null>;
  changerPresence: (presence: Presence) => Promise<void>;
  son: { actif: boolean; bloque: boolean; basculer: () => void; activer: () => Promise<void> };
};

const Contexte = createContext<Centrale | null>(null);

// null hors de l'espace Centrale (conseiller, administrateur sans rôle opérationnel…).
export const useCentrale = () => useContext(Contexte);

// Deux tons alternés pendant une seconde.
function sirene(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  for (let i = 0; i < 4; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 880, t + i * 0.25);
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.setValueAtTime(0, t + 1);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 1);
}

// La sirène ne sonne que pour qui doit agir : l'opérateur à qui une alerte attend d'être acceptée,
// l'opérateur en service quand la file commune se remplit, le superviseur quand personne n'est en
// service ou qu'une alerte lui est signalée.
export function doitSonner(file: FileCentrale, supervision: boolean) {
  if (file.mesAlertes.some((a) => !a.accepteeLe)) return true;
  if (file.aPrendre.total > 0 && file.presence === "EN_SERVICE") return true;
  if (!supervision) return false;
  if (file.aPrendre.total > 0 && file.crise.operateursEnService === 0) return true;
  return (file.autres ?? []).some((a) => a.signaleeLe && !a.accepteeLe);
}

export function CentraleProvider({ children }: { children: React.ReactNode }) {
  const { compte } = useSession();
  // Avant l'activation de la double authentification, seule la page Sécurité est ouverte.
  const actif = compte.espaces.includes("centrale") && !compte.deuxFacteursRequis;
  return actif ? <FileEnDirect supervision={compte.espaces.includes("supervision")}>{children}</FileEnDirect> : children;
}

function FileEnDirect({ supervision, children }: { supervision: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [file, setFile] = useState<FileCentrale | null>(null);
  const [version, setVersion] = useState(0);
  const [enDirect, setEnDirect] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [sonActif, setSonActif] = useState(true);
  const [sonBloque, setSonBloque] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const fileRef = useRef<FileCentrale | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      const f = await appelApi<FileCentrale>("/centrale/alertes");
      fileRef.current = f;
      setFile(f);
      setHorsLigne(false);
      return f;
    } catch (e) {
      if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 403)) router.replace("/connexion");
      else setHorsLigne(true);
      return null;
    }
  }, [router]);

  useEffect(() => {
    let attente: ReturnType<typeof setTimeout> | undefined;
    let dernier = Date.now();
    const planifier = () => {
      clearTimeout(attente);
      attente = setTimeout(() => {
        dernier = Date.now();
        void rafraichir();
        setVersion((v) => v + 1);
      }, REGROUPEMENT_MS);
    };
    const source = new EventSource("/api/centrale/flux");
    let direct = false;
    source.onopen = () => {
      direct = true;
      setEnDirect(true);
      planifier();
    };
    source.onmessage = (m) => {
      if ((JSON.parse(m.data) as { type: string }).type !== "battement") planifier();
    };
    // Le navigateur se reconnecte seul ; d'ici là, la file est relue plus souvent.
    source.onerror = () => {
      direct = false;
      setEnDirect(false);
    };
    void rafraichir();
    const resynchro = setInterval(() => {
      if (Date.now() - dernier < (direct ? RESYNCHRO_MS : SANS_FLUX_MS)) return;
      dernier = Date.now();
      void rafraichir();
      setVersion((v) => v + 1);
    }, 1000);
    return () => {
      source.close();
      clearTimeout(attente);
      clearInterval(resynchro);
    };
  }, [rafraichir]);

  useEffect(() => {
    if (!sonActif) return;
    const t = setInterval(() => {
      const f = fileRef.current;
      if (!f || !doitSonner(f, supervision)) return;
      audio.current ??= new AudioContext();
      // Sans geste de l'utilisateur depuis le chargement, le navigateur bloque le son.
      if (audio.current.state === "suspended") setSonBloque(true);
      else sirene(audio.current);
    }, SIRENE_MS);
    return () => clearInterval(t);
  }, [sonActif, supervision]);

  const activer = useCallback(async () => {
    audio.current ??= new AudioContext();
    await audio.current.resume();
    setSonBloque(false);
    setSonActif(true);
  }, []);

  const changerPresence = useCallback(async (presence: Presence) => {
    const f = await appelApi<FileCentrale>("/centrale/presence", { presence });
    fileRef.current = f;
    setFile(f);
    // Prendre son service est un geste : on en profite pour débloquer le son.
    if (presence === "EN_SERVICE") void activer();
  }, [activer]);

  const valeur: Centrale = {
    file,
    version,
    enDirect,
    horsLigne,
    rafraichir,
    changerPresence,
    son: { actif: sonActif, bloque: sonBloque, basculer: () => (sonActif ? setSonActif(false) : void activer()), activer },
  };
  return <Contexte value={valeur}>{children}</Contexte>;
}
