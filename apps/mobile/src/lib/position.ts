import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Location from "expo-location";
import type { Position, ProblemePosition } from "./types";

export type PositionPrecise = Position & { precisionM: number };

// « impossible » : le téléphone ne sait pas se localiser ; rien à débloquer côté abonné.
export type EtatPosition = "demande" | "ok" | "refusee" | "indisponible" | "impossible";

export const PROBLEME_DE: Record<EtatPosition, ProblemePosition | null> = {
  demande: null,
  ok: null,
  refusee: "REFUSEE",
  indisponible: "INDISPONIBLE",
  impossible: "INDISPONIBLE",
};

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
export function distanceM(a: Position, b: Position) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nouvel envoi à la centrale seulement si l'abonné a bougé ou si la mesure est nettement plus précise.
const DEPLACEMENT_M = 25;
const INTERVALLE_MIN_MS = 15_000;
export function vautLaPeine(avant: { position: PositionPrecise; le: number } | null, p: PositionPrecise, maintenant: number) {
  if (!avant) return true;
  if (maintenant - avant.le < INTERVALLE_MIN_MS) return false;
  return distanceM(avant.position, p) >= DEPLACEMENT_M || p.precisionM < avant.position.precisionM / 2;
}

// Position du téléphone, suivie tant que `actif`. La sécurité prime : on redemande dès que possible
// (au retour des réglages, toutes les 30 s sans signal), mais jamais en contournant le choix de l'abonné.
export function usePosition(actif: boolean) {
  const [etat, setEtat] = useState<EtatPosition>("demande");
  const [position, setPosition] = useState<PositionPrecise | null>(null);
  const suivi = useRef<Location.LocationSubscription | null>(null);
  const enCours = useRef(false);

  const arreter = useCallback(() => {
    suivi.current?.remove();
    suivi.current = null;
  }, []);

  const demarrer = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted" && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        arreter();
        setEtat("refusee");
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        // Android propose d'allumer la localisation dans une fenêtre du système, sans quitter l'application.
        if (Platform.OS === "android") await Location.enableNetworkProviderAsync().catch(() => undefined);
        if (!(await Location.hasServicesEnabledAsync())) {
          setEtat((e) => (e === "ok" ? e : "indisponible"));
          return;
        }
      }
      if (suivi.current) return;
      suivi.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 5 }, (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy ?? 100 });
        setEtat("ok");
      });
    } catch {
      setEtat((e) => (e === "ok" ? e : "impossible"));
    } finally {
      enCours.current = false;
    }
  }, [arreter]);

  useEffect(() => {
    if (!actif) return;
    void demarrer();
    return arreter;
  }, [actif, demarrer, arreter]);

  useEffect(() => {
    if (!actif || etat !== "indisponible") return;
    const t = setInterval(() => void demarrer(), 30_000);
    return () => clearInterval(t);
  }, [actif, etat, demarrer]);

  // Retour dans l'application (après les réglages) : la localisation a peut-être été autorisée.
  useEffect(() => {
    if (!actif) return;
    const s = AppState.addEventListener("change", (e) => {
      if (e === "active") void demarrer();
    });
    return () => s.remove();
  }, [actif, demarrer]);

  return { etat, position, reessayer: demarrer, ouvrirReglages: () => void Linking.openSettings() };
}
