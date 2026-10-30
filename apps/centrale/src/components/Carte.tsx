"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as CarteMapLibre, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { TypeUrgence } from "@apsig/domain";

export type PointCarte = { lat: number; lng: number; libelle: string; type?: TypeUrgence; temoin?: boolean; numero?: string };

// Fond de carte OpenStreetMap servi par OpenFreeMap (gratuit, sans clé).
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DALOA: [number, number] = [-6.45, 6.877];
// Mêmes couleurs que les boutons d'urgence (globals.css).
const COULEURS: Record<TypeUrgence, string> = {
  AGRESSION: "#c81e1e",
  MEDICAL: "#c2410c",
  INCENDIE: "#1d4ed8",
  EGARE: "#7e22ce",
  SOINS: "#15803d",
  AUTRE: "#475569",
};

type Props = { points: PointCarte[]; className?: string; onChoisir?: (numero: string) => void };

export function Carte({ points, className, onChoisir }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const reperes = useRef<Marker[]>([]);
  const [prete, setPrete] = useState(false);
  const [erreur, setErreur] = useState(false);
  const choisir = useRef(onChoisir);
  choisir.current = onChoisir;

  useEffect(() => {
    let annule = false;
    // MapLibre a besoin du navigateur (WebGL) : chargé à la demande, jamais côté serveur.
    void import("maplibre-gl").then(({ Map, NavigationControl, setWorkerUrl }) => {
      if (annule || !conteneur.current) return;
      // Copié par scripts/worker-carte.mjs.
      setWorkerUrl("/maplibre-gl-worker.js");
      try {
        const m = new Map({ container: conteneur.current, style: STYLE, center: DALOA, zoom: 12, attributionControl: { compact: true } });
        m.addControl(new NavigationControl({ showCompass: false }), "top-right");
        carte.current = m;
        setPrete(true);
      } catch {
        setErreur(true);
      }
    });
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
    };
  }, []);

  const signature = JSON.stringify(points);
  useEffect(() => {
    const m = carte.current;
    if (!prete || !m) return;
    let annule = false;
    void import("maplibre-gl").then(({ LngLatBounds, Marker, Popup }) => {
      if (annule) return;
      for (const r of reperes.current) r.remove();
      reperes.current = points.map((p) => {
        const repere = new Marker({ color: p.temoin ? "#5a6680" : p.type ? COULEURS[p.type] : "#1e3a6e", scale: p.temoin ? 0.6 : 0.9 })
          .setLngLat([p.lng, p.lat])
          .setPopup(new Popup({ offset: 20, closeButton: false }).setText(p.libelle))
          .addTo(m);
        if (p.numero) {
          const numero = p.numero;
          repere.getElement().addEventListener("click", () => choisir.current?.(numero));
        }
        return repere;
      });
      if (points.length === 1) m.jumpTo({ center: [points[0]!.lng, points[0]!.lat], zoom: 16 });
      else if (points.length > 1) {
        const cadre = new LngLatBounds();
        for (const p of points) cadre.extend([p.lng, p.lat]);
        m.fitBounds(cadre, { padding: 48, maxZoom: 16, duration: 0 });
      }
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la signature résume les points
  }, [prete, signature]);

  if (erreur) return <p className="rounded-xl bg-fond p-4 text-sm text-attenue">Carte indisponible sur ce poste (WebGL désactivé).</p>;
  return <div ref={conteneur} className={className} role="region" aria-label="Carte" />;
}
