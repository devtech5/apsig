'use client';

// Cartes Leaflet de la centrale. Leaflet manipule le DOM directement : il est chargé côté client
// et piloté de façon impérative depuis des effets React.
import { useEffect, useRef } from 'react';
import { esc, fmtDist, isOpen, TYPE_META } from '@/lib/common';
import { iconHTML } from '../../ui';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
let leafletPromise = null;
const loadLeaflet = () => (leafletPromise ??= import('leaflet').then((m) => m.default ?? m));

// Fond sombre Esri ; si ses tuiles échouent (réseau filtré, panne), repli automatique sur OpenStreetMap assombri.
function baseLayers(L, target) {
  const base = L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: 'Fond de carte © Esri', maxZoom: 16 }).addTo(target);
  const ref = L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: 'shadowPane' }).addTo(target);
  let errors = 0;
  let loaded = false;
  const fallback = () => {
    if (loaded || !target.hasLayer(base)) return;
    target.removeLayer(base);
    target.removeLayer(ref);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18, className: 'tiles-dark' }).addTo(target);
  };
  base.on('tileload', () => { loaded = true; });
  base.on('tileerror', () => { errors += 1; if (errors >= 3) fallback(); });
  setTimeout(fallback, 8000); // aucune tuile après 8 s : réseau qui bloque sans erreur franche
}

function unitHTML(u) {
  const cls = u.gps ? 'unit-marker--gps' : u.moving ? 'unit-marker--moving' : u.status !== 'disponible' ? 'unit-marker--busy' : '';
  return `<div class="unit-marker ${cls} ${u.kind === 'intervention' ? 'unit-marker--intervention' : ''}">${iconHTML(u.gps ? 'locate' : 'car')}${esc(u.name)}</div>`;
}

// Carte de supervision : plaques, unités, trajets, alertes actives, position du témoin.
export function OpsMap({ plates, units, alerts, selectedId, onSelect, flyTarget, visible, fitKey }) {
  const el = useRef(null);
  const ctx = useRef(null); // { L, map, layers, unitMarkers, alertMarkers }
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const ready = useRef(false);
  const latest = useRef({});
  latest.current = { plates, units, alerts, selectedId };

  useEffect(() => {
    let disposed = false;
    loadLeaflet().then((L) => {
      if (disposed || !el.current) return;
      const map = L.map(el.current, { zoomControl: true, preferCanvas: true }).setView([5.345, -4.005], 12);
      baseLayers(L, map);
      const layers = {
        plates: L.layerGroup().addTo(map),
        routes: L.layerGroup().addTo(map),
        units: L.layerGroup().addTo(map),
        witness: L.layerGroup().addTo(map),
        alerts: L.layerGroup().addTo(map),
      };
      ctx.current = { L, map, layers, unitMarkers: new Map(), alertMarkers: new Map() };
      ready.current = true;
      drawPlates();
      drawDynamic();
      fit();
    });
    return () => {
      disposed = true;
      ctx.current?.map.remove();
      ctx.current = null;
      ready.current = false;
    };
  }, []);

  function fit() {
    const c = ctx.current;
    const ps = latest.current.plates;
    if (!c || !ps?.length) return;
    c.map.fitBounds(c.L.latLngBounds(ps.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
  }

  function drawPlates() {
    const c = ctx.current;
    if (!c) return;
    const { L, layers } = c;
    layers.plates.clearLayers();
    for (const p of latest.current.plates ?? []) {
      L.circleMarker([p.lat, p.lng], {
        radius: p.showcase ? 5 : 3.5, weight: p.showcase ? 1.5 : 0, color: '#fff',
        fillColor: p.status !== 'active' ? '#6b7a90' : p.pass === 'rouge' ? '#ef4b63' : '#4f86e8', fillOpacity: 0.8,
      }).bindTooltip(`<b>${esc(p.code)}</b><br>${esc(p.label)}${p.status !== 'active' ? '<br><i>Désactivée</i>' : ''}`, { direction: 'top' }).addTo(layers.plates);
    }
  }

  function drawDynamic() {
    const c = ctx.current;
    if (!c) return;
    const { L, layers, unitMarkers, alertMarkers } = c;
    const { units: us = [], alerts: as = [], selectedId: sel } = latest.current;
    const byId = new Map(as.map((a) => [a.id, a]));

    // Unités
    const seen = new Set();
    for (const u of us) {
      seen.add(u.id);
      const html = unitHTML(u);
      let m = unitMarkers.get(u.id);
      if (!m) {
        m = L.marker([u.lat, u.lng], { icon: L.divIcon({ className: 'unit-icon', html, iconSize: [0, 0] }), zIndexOffset: 500 }).addTo(layers.units);
        m._html = html;
        unitMarkers.set(u.id, m);
      } else {
        m.setLatLng([u.lat, u.lng]);
        if (m._html !== html) { m.setIcon(L.divIcon({ className: 'unit-icon', html, iconSize: [0, 0] })); m._html = html; }
      }
      m.bindTooltip(`<b>Unité ${esc(u.name)}</b> · ${u.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}<br>${esc(u.leader)}<br>${u.status === 'disponible' ? 'Disponible' : `En mission (${esc(u.alertId)})`}${u.gps ? '<br>GPS réel (application terrain)' : ''}`, { direction: 'top', offset: [0, -10] });
    }
    for (const [id, m] of unitMarkers) if (!seen.has(id)) { layers.units.removeLayer(m); unitMarkers.delete(id); }

    // Alertes actives (+ la sélection)
    const visibleIds = new Set(as.filter(isOpen).map((a) => a.id));
    if (sel && byId.has(sel)) visibleIds.add(sel);
    for (const [id, m] of alertMarkers) if (!visibleIds.has(id)) { layers.alerts.removeLayer(m); alertMarkers.delete(id); }
    for (const id of visibleIds) {
      const a = byId.get(id);
      const html = `<div class="alert-marker alert-marker--${a.type} ${isOpen(a) ? '' : 'is-closed'} ${a.escalation?.level ? 'is-escalated' : ''}"><span class="alert-marker__core">${iconHTML(TYPE_META[a.type].icon)}</span></div>`;
      let m = alertMarkers.get(id);
      if (!m) {
        m = L.marker([a.lat, a.lng], { icon: L.divIcon({ className: 'alert-icon', html, iconSize: [0, 0] }), zIndexOffset: 1000 }).addTo(layers.alerts);
        m.on('click', () => onSelectRef.current(id));
        m._html = html;
        alertMarkers.set(id, m);
      } else if (m._html !== html) {
        m.setIcon(L.divIcon({ className: 'alert-icon', html, iconSize: [0, 0] }));
        m._html = html;
      }
      m.bindTooltip(`<b>${esc(TYPE_META[a.type].label)}</b><br>${esc(a.code)}`, { direction: 'top', offset: [0, -14] });
    }

    // Trajets des unités en route
    layers.routes.clearLayers();
    for (const a of as) {
      if (a.status !== 'en_route' || !a.unitId) continue;
      const u = us.find((x) => x.id === a.unitId);
      if (u) L.polyline([[u.lat, u.lng], [a.lat, a.lng]], { color: '#6ea2ff', weight: 3, dashArray: '6 8', opacity: 0.9 }).addTo(layers.routes);
    }

    // Témoin de l'alerte sélectionnée
    layers.witness.clearLayers();
    const selA = byId.get(sel);
    const loc = selA?.witness?.location;
    if (loc) {
      L.polyline([[loc.lat, loc.lng], [selA.lat, selA.lng]], { color: '#c7d2e6', weight: 2, dashArray: '2 6' }).addTo(layers.witness);
      if (loc.accuracy) L.circle([loc.lat, loc.lng], { radius: loc.accuracy, color: '#c7d2e6', weight: 1, fillOpacity: 0.08 }).addTo(layers.witness);
      L.circleMarker([loc.lat, loc.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#b388ff', fillOpacity: 1 })
        .bindTooltip(`Témoin · ${fmtDist(loc.distanceM)} de la plaque (±${loc.accuracy} m)`, { direction: 'top' }).addTo(layers.witness);
    }
  }

  useEffect(() => { if (ready.current) drawPlates(); }, [plates]);
  useEffect(() => { if (ready.current) drawDynamic(); }, [units, alerts, selectedId]);
  useEffect(() => {
    if (!ready.current) return;
    // Réinitialisation (démo remise à zéro) : on repart de marqueurs neufs.
    const c = ctx.current;
    c.unitMarkers.forEach((m) => c.layers.units.removeLayer(m));
    c.unitMarkers.clear();
    c.alertMarkers.forEach((m) => c.layers.alerts.removeLayer(m));
    c.alertMarkers.clear();
    drawDynamic();
    if (!latest.current.selectedId) fit();
  }, [fitKey]);
  useEffect(() => {
    const c = ctx.current;
    if (!c || !flyTarget) return;
    c.map.flyTo([flyTarget.lat, flyTarget.lng], Math.max(c.map.getZoom(), 14), { duration: 0.8 });
  }, [flyTarget]);
  useEffect(() => {
    if (visible) setTimeout(() => ctx.current?.map.invalidateSize(), 0);
  }, [visible]);

  return <div ref={el} className="absolute inset-0" />;
}

// Carte de chaleur des rapports.
export function HeatMap({ byQuartier }) {
  const el = useRef(null);
  const ctx = useRef(null);

  useEffect(() => {
    let disposed = false;
    loadLeaflet().then((L) => {
      if (disposed || !el.current) return;
      const map = L.map(el.current, { zoomControl: false, preferCanvas: true }).setView([5.34, -4.0], 11);
      baseLayers(L, map);
      ctx.current = { L, map, layer: L.layerGroup().addTo(map) };
      draw();
    });
    return () => { disposed = true; ctx.current?.map.remove(); ctx.current = null; };
  }, []);

  function draw() {
    const c = ctx.current;
    if (!c || !byQuartier) return;
    c.map.invalidateSize();
    c.layer.clearLayers();
    const qmax = Math.max(1, ...byQuartier.map((q) => q.total));
    for (const q of byQuartier) {
      const k = q.total / qmax;
      c.L.circle([q.lat, q.lng], { radius: 250 + k * 1100, stroke: false, fillColor: k > 0.66 ? '#ff4d4f' : k > 0.33 ? '#ff9f1c' : '#ffd166', fillOpacity: 0.25 + k * 0.4 })
        .bindTooltip(`<b>${esc(q.quartier)}</b> (${esc(q.commune)})<br>${q.total} alertes`, { direction: 'top' }).addTo(c.layer);
    }
  }
  useEffect(draw, [byQuartier]);

  return <div ref={el} className="h-80 w-full overflow-hidden rounded-xl" />;
}
