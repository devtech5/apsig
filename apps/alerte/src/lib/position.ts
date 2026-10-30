import { distanceM, type ProblemePosition } from "@apsig/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Position } from "./api";

export type PositionPrecise = Position & { precisionM: number };

// « impossible » : navigateur sans localisation ou page hors HTTPS ; rien à débloquer côté témoin.
export type EtatPosition = "demande" | "ok" | "refusee" | "indisponible" | "impossible";

export const PROBLEME_DE: Record<EtatPosition, ProblemePosition | null> = {
  demande: null,
  ok: null,
  refusee: "REFUSEE",
  indisponible: "INDISPONIBLE",
  impossible: "INDISPONIBLE",
};

// Nouvel envoi à la centrale seulement si le témoin a bougé ou si la mesure est nettement plus précise.
const DEPLACEMENT_M = 25;
const INTERVALLE_MIN_MS = 15_000;
export function vautLaPeine(avant: { position: PositionPrecise; le: number } | null, p: PositionPrecise, maintenant: number) {
  if (!avant) return true;
  if (maintenant - avant.le < INTERVALLE_MIN_MS) return false;
  return distanceM(avant.position, p) >= DEPLACEMENT_M || p.precisionM < avant.position.precisionM / 2;
}

// Position du téléphone, demandée dès l'ouverture de la page et suivie tant que `actif`.
// La sécurité prime : on redemande dès que possible, mais jamais en contournant le choix du navigateur.
export function usePositionTemoin(actif: boolean) {
  const [etat, setEtat] = useState<EtatPosition>("demande");
  const [position, setPosition] = useState<PositionPrecise | null>(null);
  const suivi = useRef<number | null>(null);

  const arreter = useCallback(() => {
    if (suivi.current != null) navigator.geolocation.clearWatch(suivi.current);
    suivi.current = null;
  }, []);

  const demarrer = useCallback(() => {
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setEtat("impossible");
      return;
    }
    arreter();
    setEtat((e) => (e === "refusee" || e === "impossible" ? "demande" : e));
    suivi.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy });
        setEtat("ok");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          arreter();
          setEtat("refusee");
        } else {
          // GPS coupé ou pas encore de signal : le suivi continue, une position peut encore arriver.
          setEtat((e) => (e === "ok" ? e : "indisponible"));
        }
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
  }, [arreter]);

  useEffect(() => {
    if (!actif) return;
    demarrer();
    return arreter;
  }, [actif, demarrer, arreter]);

  // Sans signal : nouvel essai régulier, le témoin a peut-être rallumé la localisation.
  useEffect(() => {
    if (!actif || etat !== "indisponible") return;
    const t = setInterval(demarrer, 30_000);
    return () => clearInterval(t);
  }, [actif, etat, demarrer]);

  // Autorisation rendue dans les réglages du navigateur : le suivi reprend sans autre geste.
  useEffect(() => {
    if (!actif || !navigator.permissions?.query) return;
    let fini = false;
    let statut: PermissionStatus | null = null;
    const auChangement = () => {
      if (statut?.state === "granted") demarrer();
    };
    navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        if (fini) return;
        statut = s;
        s.addEventListener("change", auChangement);
      })
      .catch(() => undefined);
    return () => {
      fini = true;
      statut?.removeEventListener("change", auChangement);
    };
  }, [actif, demarrer]);

  return { etat, position, reessayer: demarrer };
}
