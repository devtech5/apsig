"use client";

import { useEffect } from "react";

// PWA sur l'adresse de la page d'alerte (code-secours.<domaine>) seulement : apsig.online, qui la sert encore pour
// les premiers QR, deviendra le site officiel et ne doit pas garder ce service worker.
const hoteAutorise = (hote: string) => hote.startsWith("code-secours.") || hote === "localhost";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !hoteAutorise(location.hostname)) return;
    // Facultatif : sans service worker, la page fonctionne normalement (seul le repli hors ligne manque).
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
