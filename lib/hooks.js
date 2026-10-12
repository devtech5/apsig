'use client';

import { useEffect, useRef, useState } from 'react';
import { live, unlockAudio } from './common';

// Abonnement temps réel : les gestionnaires peuvent changer à chaque rendu sans rouvrir la connexion.
export function useLive(url, handlers, { onOpen, onError, enabled = true } = {}) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const cbs = useRef({ onOpen, onError });
  cbs.current = { onOpen, onError };
  useEffect(() => {
    if (!url || !enabled) return undefined;
    const conn = live(url, ref, { onOpen: () => cbs.current.onOpen?.(), onError: () => cbs.current.onError?.() });
    return () => conn.close();
  }, [url, enabled]);
}

// Horloge partagée pour les chronomètres (re-rendu toutes les `ms`).
// Vaut 0 au premier rendu (identique serveur / navigateur, pas d'écart d'hydratation).
export function useNow(ms = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useClickOutside(onOutside) {
  const ref = useRef(null);
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) cb.current(); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, []);
  return ref;
}

// Débloque l'audio (sirène, sonnerie) au premier geste de l'utilisateur.
export function useAudioUnlock() {
  useEffect(() => {
    document.addEventListener('pointerdown', unlockAudio, { capture: true });
    return () => document.removeEventListener('pointerdown', unlockAudio, { capture: true });
  }, []);
}
