import { useEffect, useState } from "react";

const FUSEAU = "Africa/Abidjan";

export const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: FUSEAU });

export const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSEAU });

// « 4 min 07 s », « 1 h 12 min » : temps écoulé depuis le déclenchement.
export function duree(depuis: string, maintenant: number) {
  const s = Math.max(0, Math.floor((maintenant - new Date(depuis).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

// Horloge partagée par les compteurs, rafraîchie chaque seconde.
export function useMaintenant() {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return maintenant;
}

export const lienCarte = (p: { lat: number; lng: number }) =>
  `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`;
