"use client";

import { useEffect } from "react";
import { siteDe } from "@/lib/site";

// PWA sur l'espace terrain (op.<domaine>) seulement : chefs d'équipe, recenseurs et poseurs l'installent sur leur
// téléphone. La centrale et le QG n'enregistrent pas de service worker.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || siteDe(location.hostname) !== "terrain") return;
    // Facultatif : sans service worker, l'espace fonctionne normalement (seul le repli hors ligne manque).
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
