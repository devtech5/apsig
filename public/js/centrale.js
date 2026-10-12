/* global L */
import {
  api, esc, icon, fmtTime, fmtTimeSec, fmtDate, fmtDateShort, chrono, toast, storage, speak, logout,
  TYPE_META, STATUS_META, OPEN_STATUSES, CALLBACK_META, TRUST_META, SOURCE_LABEL,
} from './common.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
$$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

const prefs = storage('local');
const state = {
  me: null,
  alerts: new Map(),
  units: [],
  plates: [],
  stats: null,
  messages: [],
  config: null,
  selectedId: null,
  filter: 'open',
  view: 'supervision',
  history: [],
};
let soundOn = prefs.get('cs-sound') ?? true;

const isOpen = (a) => OPEN_STATUSES.includes(a.status);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const etaMinutes = (km) => Math.max(3, Math.round((km / 22) * 60) + 2);
const rank = () => state.me?.rank ?? 0;
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const trustBadge = (t, withScore = true) => (t ? `<span class="badge badge--${TRUST_META[t.level].cls}" title="${TRUST_META[t.level].label}">${icon('shieldCheck')}${withScore ? `${t.score}` : TRUST_META[t.level].label}</span>` : '');

// --- Carte ------------------------------------------------------------------
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
function baseLayers(target) {
  L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: 'Fond de carte © Esri', maxZoom: 16 }).addTo(target);
  L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: 'shadowPane' }).addTo(target);
}
const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([5.345, -4.005], 12);
baseLayers(map);
const platesLayer = L.layerGroup().addTo(map);
const routesLayer = L.layerGroup().addTo(map);
const unitsLayer = L.layerGroup().addTo(map);
const witnessLayer = L.layerGroup().addTo(map);
const alertsLayer = L.layerGroup().addTo(map);
const unitMarkers = new Map();
const alertMarkers = new Map();

function renderPlates() {
  platesLayer.clearLayers();
  for (const p of state.plates) {
    L.circleMarker([p.lat, p.lng], {
      radius: p.showcase ? 5 : 3.5, weight: p.showcase ? 1.5 : 0, color: '#fff',
      fillColor: p.status !== 'active' ? '#6b7a90' : p.pass === 'rouge' ? '#ef4b63' : '#4f86e8', fillOpacity: 0.8,
    }).bindTooltip(`<b>${esc(p.code)}</b><br>${esc(p.label)}${p.status !== 'active' ? '<br><i>Désactivée</i>' : ''}`, { direction: 'top' }).addTo(platesLayer);
  }
}

function unitIconHTML(u) {
  const cls = u.gps ? 'unit-marker--gps' : u.moving ? 'unit-marker--moving' : u.status !== 'disponible' ? 'unit-marker--busy' : '';
  return `<div class="unit-marker ${cls} ${u.kind === 'intervention' ? 'unit-marker--intervention' : ''}">${icon(u.gps ? 'locate' : 'car')}${esc(u.name)}</div>`;
}

function renderUnits() {
  for (const u of state.units) {
    const html = unitIconHTML(u);
    let m = unitMarkers.get(u.id);
    if (!m) {
      m = L.marker([u.lat, u.lng], { icon: L.divIcon({ className: 'unit-icon', html, iconSize: [0, 0] }), zIndexOffset: 500 }).addTo(unitsLayer);
      m._html = html;
      unitMarkers.set(u.id, m);
    } else {
      m.setLatLng([u.lat, u.lng]);
      if (m._html !== html) { m.setIcon(L.divIcon({ className: 'unit-icon', html, iconSize: [0, 0] })); m._html = html; }
    }
    m.bindTooltip(`<b>Unité ${esc(u.name)}</b> · ${u.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}<br>${esc(u.leader)}<br>${u.status === 'disponible' ? 'Disponible' : `En mission (${esc(u.alertId)})`}${u.gps ? '<br>GPS réel (application terrain)' : ''}`, { direction: 'top', offset: [0, -10] });
  }
  renderRoutes();
}

function renderRoutes() {
  routesLayer.clearLayers();
  for (const a of state.alerts.values()) {
    if (a.status !== 'en_route' || !a.unitId) continue;
    const u = state.units.find((x) => x.id === a.unitId);
    if (u) L.polyline([[u.lat, u.lng], [a.lat, a.lng]], { color: '#6ea2ff', weight: 3, dashArray: '6 8', opacity: 0.9 }).addTo(routesLayer);
  }
}

function renderWitness() {
  witnessLayer.clearLayers();
  const a = state.alerts.get(state.selectedId);
  const loc = a?.witness?.location;
  if (!loc) return;
  L.polyline([[loc.lat, loc.lng], [a.lat, a.lng]], { color: '#c7d2e6', weight: 2, dashArray: '2 6' }).addTo(witnessLayer);
  if (loc.accuracy) L.circle([loc.lat, loc.lng], { radius: loc.accuracy, color: '#c7d2e6', weight: 1, fillOpacity: 0.08 }).addTo(witnessLayer);
  L.circleMarker([loc.lat, loc.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#b388ff', fillOpacity: 1 })
    .bindTooltip(`Témoin · ${fmtDist(loc.distanceM)} de la plaque (±${loc.accuracy} m)`, { direction: 'top' }).addTo(witnessLayer);
}

function renderAlertMarkers() {
  const visible = new Set([...state.alerts.values()].filter(isOpen).map((a) => a.id));
  if (state.selectedId && state.alerts.has(state.selectedId)) visible.add(state.selectedId);
  for (const [id, m] of alertMarkers) {
    if (!visible.has(id)) { alertsLayer.removeLayer(m); alertMarkers.delete(id); }
  }
  for (const id of visible) {
    const a = state.alerts.get(id);
    const html = `<div class="alert-marker alert-marker--${a.type} ${isOpen(a) ? '' : 'is-closed'} ${a.escalation?.level ? 'is-escalated' : ''}"><span class="alert-marker__core">${icon(TYPE_META[a.type].icon)}</span></div>`;
    let m = alertMarkers.get(id);
    if (!m) {
      m = L.marker([a.lat, a.lng], { icon: L.divIcon({ className: 'alert-icon', html, iconSize: [0, 0] }), zIndexOffset: 1000 }).addTo(alertsLayer);
      m.on('click', () => select(id));
      m._html = html;
      alertMarkers.set(id, m);
    } else if (m._html !== html) {
      m.setIcon(L.divIcon({ className: 'alert-icon', html, iconSize: [0, 0] }));
      m._html = html;
    }
    m.bindTooltip(`<b>${esc(TYPE_META[a.type].label)}</b><br>${esc(a.code)}`, { direction: 'top', offset: [0, -14] });
  }
  renderRoutes();
  renderWitness();
}

// --- KPI ------------------------------------------------------------------
function renderKpis(stats) {
  const prev = state.stats;
  state.stats = stats;
  const tiles = [
    { key: 'alertsToday', cls: 'red', icon: 'bell', value: stats.alertsToday, label: 'Alertes du jour' },
    { key: 'ongoing', cls: 'amber', icon: 'radio', value: `${stats.ongoing}${stats.escalatedOpen ? `<small class="kpi__warn"> · ${stats.escalatedOpen} escaladée(s)</small>` : ''}`, label: 'Interventions en cours' },
    { key: 'activePlates', cls: 'green', icon: 'qr', value: `${stats.activePlates}${stats.expiredPlates ? `<small> · ${stats.expiredPlates} expirées</small>` : ''}`, label: 'Plaques actives' },
    { key: 'unitsAvailable', cls: 'blue', icon: 'car', value: `${stats.unitsAvailable}<small>/${stats.unitsTotal}</small>`, label: 'Unités disponibles' },
    { key: 'avgAckSeconds', cls: '', icon: 'clock', value: `${stats.avgAckSeconds}<small> s</small>`, label: 'Prise en charge moyenne' },
    { key: 'avgArrivalMinutes', cls: '', icon: 'navigation', value: `${stats.avgArrivalMinutes}<small> min</small>`, label: 'Arrivée moyenne sur place' },
  ];
  $('#kpis').innerHTML = tiles.map((t) => `
    <div class="kpi ${t.cls ? `kpi--${t.cls}` : ''} ${prev && prev[t.key] !== stats[t.key] ? 'bump' : ''}">
      <div class="kpi__icon">${icon(t.icon)}</div>
      <div><div class="kpi__value">${t.value}</div><div class="kpi__label">${t.label}</div></div>
    </div>`).join('');
}

// --- File des alertes ------------------------------------------------------
function queueAlerts() {
  const all = [...state.alerts.values()];
  if (state.filter === 'open') {
    return all.filter(isOpen).sort((a, b) => {
      const an = a.status === 'nouvelle' ? 0 : 1;
      const bn = b.status === 'nouvelle' ? 0 : 1;
      return an - bn || (b.escalation?.level ?? 0) - (a.escalation?.level ?? 0) || b.createdAt - a.createdAt;
    });
  }
  const from = startOfToday();
  return all.filter((a) => a.createdAt >= from).sort((a, b) => b.createdAt - a.createdAt);
}

function renderQueue() {
  const list = queueAlerts();
  const all = [...state.alerts.values()];
  $('#count-open').textContent = all.filter(isOpen).length;
  $('#count-today').textContent = all.filter((a) => a.createdAt >= startOfToday()).length;
  const ul = $('#queue');
  const scroll = ul.scrollTop;
  ul.innerHTML = list.length ? list.map((a) => {
    const st = STATUS_META[a.status];
    const esc8 = a.escalation?.level && a.status === 'nouvelle' ? `<span class="badge badge--agression">${icon('alert')}Escalade N${a.escalation.level}</span>` : '';
    return `<li><button type="button" class="q-item q-item--${a.type} ${a.id === state.selectedId ? 'is-selected' : ''} ${a.status === 'nouvelle' ? 'is-new' : ''} ${isOpen(a) ? '' : 'is-closed'}" data-id="${a.id}">
      <span class="q-item__icon">${icon(TYPE_META[a.type].icon)}</span>
      <span class="q-item__main">
        <span class="q-item__top"><strong>${esc(TYPE_META[a.type].label)}</strong><span class="q-item__time" ${isOpen(a) ? `data-since="${a.createdAt}"` : ''}>${isOpen(a) ? chrono(Date.now() - a.createdAt) : fmtTime(a.createdAt)}</span></span>
        <span class="q-item__code">${esc(a.code)}${a.source !== 'qr' ? ` <small class="q-item__src">${esc(SOURCE_LABEL[a.source])}</small>` : ''}</span>
        <span class="q-item__loc">${esc(a.quartier)}, ${esc(a.commune)}</span>
        <span class="q-item__bottom"><span class="status status--${st.cls}">${st.label}</span>${esc8}${trustBadge(a.trust)}${a.pass === 'rouge' ? '<span class="badge badge--rouge">Premium</span>' : ''}${a.unit ? `<span>${icon('car')} ${esc(a.unit.name)}</span>` : ''}</span>
      </span>
    </button></li>`;
  }).join('') : `<li class="queue__empty">${state.filter === 'open' ? 'Aucune alerte en cours.<br>Situation calme.' : "Aucune alerte aujourd'hui."}</li>`;
  ul.scrollTop = scroll;
}

$('#queue').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-id]');
  if (btn) select(btn.dataset.id, { fly: true });
});
$$('.seg [data-filter]').forEach((b) => b.addEventListener('click', () => {
  state.filter = b.dataset.filter;
  $$('.seg [data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderQueue();
}));

// --- Détail ------------------------------------------------------------------
const CHANNEL_ICON = { Console: 'monitor', Radio: 'radio', 'Appel + SMS': 'phone', SMS: 'message', WhatsApp: 'message', 'Appel vocal': 'phone' };

function stepsHTML(a) {
  const assignedAt = a.timeline.find((e) => /affectée/.test(e.text))?.at;
  const steps = [
    { label: 'Reçue', at: a.createdAt },
    { label: 'Prise en charge', at: a.ackAt },
    { label: 'En route', at: assignedAt },
    { label: 'Sur place', at: a.onSiteAt },
    { label: a.status === 'annulee' ? 'Annulée' : 'Clôturée', at: a.closedAt },
  ];
  const done = { nouvelle: 1, prise_en_charge: 2, en_route: 3, sur_place: 4, cloturee: 5, annulee: 5 }[a.status];
  return steps.map((s, i) => {
    const cls = i < done ? 'is-done' : i === done ? 'is-current' : '';
    return `<li class="${cls}">${s.label}${s.at && i < done ? `<time>${fmtTime(s.at)}</time>` : '<time>&nbsp;</time>'}</li>`;
  }).join('');
}

function primaryAction(a) {
  switch (a.status) {
    case 'nouvelle': return `<button type="button" class="btn btn--danger d-primary" data-act="ack">${icon('check')}Prendre en charge</button>`;
    case 'prise_en_charge': return `<button type="button" class="btn btn--primary d-primary" data-act="assign">${icon('car')}Affecter une unité</button>`;
    case 'en_route': return `<button type="button" class="btn btn--primary d-primary" data-act="onsite">${icon('pin')}Confirmer l'arrivée sur place</button>`;
    case 'sur_place': return `<button type="button" class="btn btn--success d-primary" data-act="close">${icon('flag')}Clôturer l'intervention</button>`;
    default: return '';
  }
}

function trustHTML(a) {
  if (!a.trust) return '';
  const meta = TRUST_META[a.trust.level];
  return `<section class="d-section"><h3>${icon('shieldCheck')}Fiabilité de l'alerte</h3>
    <div class="trust trust--${a.trust.level}">
      <div class="trust__score"><strong>${a.trust.score}</strong><small>/100</small></div>
      <div class="trust__bar"><span style="width:${a.trust.score}%"></span></div>
      <span class="badge badge--${meta.cls}">${meta.label}</span>
    </div>
    <ul class="trust__reasons">${a.trust.reasons.map((r) => `<li class="${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}"><span class="mono">${r.delta > 0 ? '+' : ''}${r.delta || '·'}</span>${esc(r.text)}</li>`).join('')}</ul>
  </section>`;
}

function callbackHTML(a) {
  const cb = a.callback ?? { status: 'en_attente' };
  const meta = CALLBACK_META[cb.status];
  const open = isOpen(a);
  return `<section class="d-section"><h3>${icon('phone')}Rappel automatique du titulaire</h3>
    <div class="cb"><span class="badge ${meta.cls ? `badge--${meta.cls}` : ''}">${meta.short}</span>${cb.status !== 'en_attente' && cb.at ? `<small class="muted">${fmtTime(cb.at)}${cb.by ? ` · ${esc(cb.by)}` : ''}</small>` : '<small class="muted">Appel vocal automatique envoyé</small>'}</div>
    ${open ? `<div class="cb__actions">
      <button type="button" class="btn btn--sm" data-cb="confirme">Urgence confirmée</button>
      <button type="button" class="btn btn--sm" data-cb="en_securite">En sécurité</button>
      <button type="button" class="btn btn--sm" data-cb="injoignable">Injoignable</button>
      <button type="button" class="btn btn--sm" data-cb="fausse_alerte">Fausse alerte</button>
    </div>` : ''}
  </section>`;
}

function witnessHTML(a) {
  const loc = a.witness?.location;
  const dev = a.device;
  const media = a.media ?? [];
  if (!loc && !dev && !media.length && !a.msisdn) return '';
  const mediaHTML = media.map((m) => {
    if (m.kind === 'photo') return `<a class="media-thumb" href="${esc(m.url)}" target="_blank" rel="noopener"><img src="${esc(m.url)}" alt="Photo du témoin"></a>`;
    if (m.kind === 'audio') return `<audio class="media-audio" controls preload="none" src="${esc(m.url)}"></audio>`;
    return `<blockquote class="media-text">« ${esc(m.text)} »<small>${fmtTime(m.at)}</small></blockquote>`;
  }).join('');
  return `<section class="d-section"><h3>${icon('user')}Témoin</h3>
    <div class="witness">
      ${loc ? `<div>${icon('locate')}Position partagée : <strong>${fmtDist(loc.distanceM)}</strong> de la plaque <small class="muted">(±${loc.accuracy} m)</small></div>` : a.source === 'qr' ? `<div class="muted">${icon('locate')}Position non partagée</div>` : ''}
      ${a.msisdn ? `<div>${icon('phone')}Numéro identifié : <span class="mono">${esc(a.msisdn)}</span></div>` : ''}
      ${dev ? `<div class="witness__device">${icon('smartphone')}Appareil <span class="mono">${esc(dev.id)}</span> · ${dev.last24h} alerte(s) / 24 h sur ${dev.plates24h} plaque(s)
        ${dev.blocked ? '<span class="badge badge--agression">Bloqué</span>' : ''}
        ${rank() >= 2 ? `<button type="button" class="btn btn--sm" data-device="${esc(dev.id)}" data-block="${dev.blocked ? '0' : '1'}">${icon('ban')}${dev.blocked ? 'Débloquer' : 'Bloquer'}</button>` : ''}</div>` : ''}
    </div>
    ${mediaHTML ? `<div class="media">${mediaHTML}</div>` : ''}
  </section>`;
}

function renderDetail() {
  const el = $('#detail');
  const a = state.alerts.get(state.selectedId);
  if (!a) {
    el.innerHTML = `<div class="detail__empty">${icon('bell')}<p><strong>Aucune alerte sélectionnée</strong><br>Choisissez une alerte dans la file ou sur la carte.</p></div>`;
    return;
  }
  const meta = TYPE_META[a.type];
  const open = isOpen(a);
  const st = STATUS_META[a.status];
  const plate = a.plate ?? {};
  const unit = a.unit;
  const unitLive = unit && state.units.find((u) => u.id === unit.id);
  const km = unitLive ? distanceKm(unitLive, a) : 0;
  const scrollTop = el.scrollTop;

  el.innerHTML = `
    <div class="d-head d-head--${a.type}">
      <div class="d-head__icon">${icon(meta.icon)}</div>
      <div><div class="d-head__kicker">${a.priority === 'critique' ? 'Alerte critique' : 'Alerte prioritaire'} · ${esc(a.id)} · ${esc(SOURCE_LABEL[a.source] ?? '')}</div><h2>${esc(meta.label)}</h2></div>
      <div class="d-head__timer mono">${open ? `<span data-since="${a.createdAt}">${chrono(Date.now() - a.createdAt)}</span><small>écoulé</small>` : `${chrono((a.closedAt ?? a.createdAt) - a.createdAt)}<small>durée totale</small>`}</div>
    </div>
    ${a.escalation?.level && a.status === 'nouvelle' ? `<div class="d-escalation">${icon('alert')}Escalade niveau ${a.escalation.level} — ${a.escalation.level === 1 ? 'superviseur alerté' : 'responsable de la centrale appelé'}</div>` : ''}
    ${a.subscriptionExpired ? `<div class="d-warning">${icon('wallet')}Abonnement expiré — alerte traitée quand même (l'urgence prime).</div>` : ''}
    <div class="d-body">
      <div class="d-grid">
        <div><label>Code</label><span class="mono strong">${esc(a.code)}</span>${plate.shortCode ? `<br><small class="mono">USSD *789*${esc(plate.shortCode)}#</small>` : ''}</div>
        <div><label>Déclenchée</label>${fmtTimeSec(a.createdAt)}<br><small>${fmtDate(a.createdAt)}</small></div>
        <div><label>Adresse</label>${esc(plate.label ?? '')}<br><small>${esc(a.quartier)}, ${esc(a.commune)}</small></div>
        <div><label>Pass</label><span class="badge badge--${a.pass}">${a.pass === 'rouge' ? 'Rouge Premium' : 'Bleu'}</span><br><small>${a.pass === 'rouge' ? 'Intervention armée incluse' : 'SOS Secours'}</small></div>
        <div><label>Titulaire</label>${esc(plate.owner?.name ?? '')}<br><small class="mono">${esc(plate.owner?.phone ?? '')}</small></div>
        <div><label>Statut</label><span class="status status--${st.cls}">${st.label}</span>${a.trust ? `<br>${trustBadge(a.trust, false)}` : ''}</div>
      </div>

      ${open ? `<div class="d-actions">
        ${primaryAction(a)}
        <button type="button" class="btn" data-act="call">${icon('phone')}Appeler</button>
        <button type="button" class="btn" data-act="assign">${icon('car')}${a.unitId ? 'Réaffecter' : 'Affecter'}</button>
        <button type="button" class="btn" data-act="note">${icon('edit')}Note</button>
        <button type="button" class="btn" data-act="close">${icon('flag')}Clôturer</button>
      </div>` : `<div class="d-outcome"><small class="muted">${a.status === 'annulee' ? 'Annulation' : 'Issue de l\'intervention'}</small><strong>${esc(a.outcome ?? '')}</strong></div>`}

      <ol class="d-steps" aria-label="Progression">${stepsHTML(a)}</ol>

      ${unit ? `<section class="d-section"><h3>${icon('car')}Unité affectée</h3>
        <div class="d-unit">${icon(unitLive?.gps ? 'locate' : 'car')}<div><strong>Unité ${esc(unit.name)}</strong> · ${unit.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}${unitLive?.gps ? ' · <span class="badge badge--success">GPS réel</span>' : ''}<small>${esc(unit.leader)} · <span class="mono">${esc(unit.phone)}</span></small>
        ${a.status === 'en_route' ? `<small>À ${km.toFixed(1)} km · arrivée estimée ~${etaMinutes(km)} min${a.unitAckAt ? ' · mission acceptée sur le terrain' : ''}</small>` : ''}</div></div>
      </section>` : ''}

      ${callbackHTML(a)}
      ${trustHTML(a)}
      ${witnessHTML(a)}

      <section class="d-section"><h3>${icon('users')}Acteurs notifiés (${a.notified.length})</h3>
        <ul class="notif">${a.notified.map((n) => `<li>${icon(CHANNEL_ICON[n.channel] ?? 'message')}<span>${esc(n.actor)}<small>${esc(n.channel)} · <span class="mono">${esc(n.target)}</span></small></span><span class="ns ${n.status === 'envoyé' ? '' : 'ns--ok'}">${esc(n.status)}</span></li>`).join('')}</ul>
      </section>

      <section class="d-section"><h3>${icon('history')}Journal horodaté</h3>
        <ol class="timeline">${[...a.timeline].reverse().map((t) => `<li class="k-${t.kind}"><time>${fmtTimeSec(t.at)}</time><span>${esc(t.text)}</span></li>`).join('')}</ol>
      </section>
    </div>`;
  el.scrollTop = scrollTop;
}

$('#detail').addEventListener('click', async (e) => {
  const a = state.alerts.get(state.selectedId);
  if (!a) return;
  const cb = e.target.closest('[data-cb]');
  if (cb) return run(a.id, 'callback', { status: cb.dataset.cb });
  const dev = e.target.closest('[data-device]');
  if (dev) return openBlock(dev.dataset.device, dev.dataset.block === '1');
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'ack') return run(a.id, 'ack');
  if (act === 'onsite') return run(a.id, 'onsite');
  if (act === 'assign') return openAssign(a);
  if (act === 'call') return openCall(a);
  if (act === 'note') return openNote(a);
  if (act === 'close') return openClose(a);
});

function select(id, { fly = false } = {}) {
  state.selectedId = id;
  const a = state.alerts.get(id);
  renderQueue();
  renderDetail();
  renderAlertMarkers();
  if (a && fly) map.flyTo([a.lat, a.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
}

// --- Actions opérateur ----------------------------------------------------
async function run(id, action, body = {}) {
  try {
    const { alert } = await api(`/api/ops/alerts/${id}/${action}`, { method: 'POST', body });
    upsert(alert);
    return alert;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

const modal = $('#modal');
function openModal(title, body, foot = '') {
  modal.innerHTML = `
    <div class="modal__head"><h3>${title}</h3><button type="button" class="btn btn--sm btn--ghost" data-close aria-label="Fermer">${icon('x')}</button></div>
    <div class="modal__body">${body}</div>
    ${foot ? `<div class="modal__foot">${foot}</div>` : ''}`;
  if (!modal.open) modal.showModal();
}
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-close]')) modal.close();
});

function openAssign(a) {
  const needArmed = a.pass === 'rouge' && a.type === 'agression';
  const units = state.units.map((u) => ({ ...u, km: distanceKm(u, a) })).sort((x, y) => x.km - y.km);
  const rec = units.find((u) => u.status === 'disponible' && (needArmed ? u.kind === 'intervention' : u.kind === 'patrouille')) ?? units.find((u) => u.status === 'disponible');
  const items = units.map((u) => {
    const busy = u.status !== 'disponible' && u.alertId !== a.id;
    return `<li><button type="button" data-unit="${u.id}" ${busy ? 'disabled' : ''} class="${rec && u.id === rec.id ? 'rec' : ''}">
      ${icon(u.gps ? 'locate' : 'car')}
      <span><strong>Unité ${esc(u.name)}</strong> · ${u.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}${rec && u.id === rec.id ? ' <span class="badge badge--success">Recommandée</span>' : ''}${u.gps ? ' <span class="badge">GPS réel</span>' : ''}
        <small>${esc(u.leader)} · ${busy ? `En mission (${esc(u.alertId)})` : u.alertId === a.id ? 'Déjà affectée' : 'Disponible'}</small></span>
      <span class="eta">${u.km.toFixed(1)} km<small>~${etaMinutes(u.km)} min</small></span>
    </button></li>`;
  }).join('');
  openModal(`Affecter une unité · ${esc(a.code)}`, `
    <p class="muted" style="margin-top:0">${needArmed ? 'Pass Rouge + agression : une équipe d\'intervention armée est recommandée.' : 'Unités triées par distance. La plus proche disponible est recommandée.'} La mission s'affiche aussitôt sur l'application terrain de l'unité.</p>
    <ul class="pick">${items}</ul>`);
  $$('[data-unit]', modal).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const res = await run(a.id, 'assign', { unitId: b.dataset.unit });
    if (res) { modal.close(); toast(`Unité ${res.unit.name} en route`, 'success'); }
  }));
}

function openCall(a) {
  const p = a.plate ?? {};
  const targets = [];
  if (p.owner) targets.push({ icon: 'user', name: p.owner.name, sub: 'Titulaire de la plaque', phone: p.owner.phone });
  for (const c of p.contacts ?? []) targets.push({ icon: 'users', name: c.name, sub: c.relation, phone: c.phone });
  if (a.msisdn) targets.push({ icon: 'smartphone', name: 'Témoin (USSD/SMS)', sub: 'Numéro identifié', phone: a.msisdn });
  if (p.community) targets.push({ icon: 'home', name: p.community.name, sub: 'Responsable communautaire', phone: p.community.phone });
  if (a.unit) targets.push({ icon: 'radio', name: `Unité ${a.unit.name}`, sub: a.unit.leader, phone: a.unit.phone });
  const svc = a.notified.find((n) => n.role === 'service');
  if (svc) targets.push({ icon: 'shield', name: svc.actor, sub: 'Service public compétent', phone: svc.target });
  openModal('Appeler', `<ul class="pick">${targets.map((t, i) => `<li><button type="button" data-target="${i}">${icon(t.icon)}<span><strong>${esc(t.name)}</strong><small>${esc(t.sub)}</small></span><span class="eta">${esc(t.phone)}</span></button></li>`).join('')}</ul>`);
  $$('[data-target]', modal).forEach((b) => b.addEventListener('click', () => {
    const t = targets[Number(b.dataset.target)];
    const started = Date.now();
    openModal('Appel en cours', `<div class="calling"><div class="calling__ring">${icon('phone')}</div><strong>${esc(t.name)}</strong><span class="mono muted">${esc(t.phone)}</span><p class="muted">Appel simulé (prototype)</p></div>`,
      `<button type="button" class="btn btn--danger" id="hangup">${icon('phone')}Raccrocher</button>`);
    $('#hangup', modal).addEventListener('click', async () => {
      const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
      await run(a.id, 'call', { target: `${t.name} (${t.phone}) — ${secs} s` });
      modal.close();
    });
  }));
}

function openNote(a) {
  openModal(`Ajouter une note · ${esc(a.id)}`, `<div class="form-row"><label for="note-text">Note opérateur</label><textarea id="note-text" rows="4" maxlength="500" placeholder="Ex. : le témoin signale deux individus en moto rouge…"></textarea></div>`,
    `<button type="button" class="btn" data-close>Annuler</button><button type="button" class="btn btn--primary" id="note-save">Enregistrer</button>`);
  $('#note-text', modal).focus();
  $('#note-save', modal).addEventListener('click', async () => {
    const text = $('#note-text', modal).value.trim();
    if (!text) return;
    if (await run(a.id, 'note', { text })) modal.close();
  });
}

const OUTCOMES = {
  agression: ['Intrusion repoussée, auteurs en fuite', 'Individu interpellé et remis à la police', 'Agression évitée, victime rassurée'],
  medical: ['Victime évacuée par le SAMU', 'Premiers secours prodigués, état stable', 'Transport vers clinique par la famille'],
  incendie: ['Départ de feu maîtrisé', 'Incendie éteint par le GSPM', 'Fumée sans feu, installation sécurisée'],
};
function openClose(a) {
  const options = [...OUTCOMES[a.type], 'Fausse alerte / malveillance', 'Transféré aux services publics'];
  openModal(`Clôturer · ${esc(a.id)}`, `
    <div class="form-row"><label for="close-outcome">Issue de l'intervention</label><select id="close-outcome">${options.map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>
    <div class="form-row"><label for="close-note">Commentaire (facultatif)</label><textarea id="close-note" rows="3" maxlength="160"></textarea></div>`,
    `<button type="button" class="btn" data-close>Annuler</button><button type="button" class="btn btn--success" id="close-save">${icon('flag')}Clôturer</button>`);
  $('#close-save', modal).addEventListener('click', async () => {
    const note = $('#close-note', modal).value.trim();
    const outcome = $('#close-outcome', modal).value + (note ? ` — ${note}` : '');
    if (await run(a.id, 'close', { outcome })) { modal.close(); toast('Intervention clôturée', 'success'); }
  });
}

function openBlock(deviceId, block) {
  openModal(`${block ? 'Bloquer' : 'Débloquer'} l'appareil ${esc(deviceId)}`, `
    <p class="muted" style="margin-top:0">${block ? 'Les alertes de cet appareil resteront reçues (une urgence n\'est jamais rejetée) mais leur fiabilité sera abaissée et les déclenchements limités à un toutes les 10 minutes.' : 'L\'appareil retrouvera un fonctionnement normal.'}</p>
    <div class="form-row"><label for="block-note">Motif</label><textarea id="block-note" rows="2" maxlength="200" placeholder="Ex. : fausses alertes répétées sur plusieurs plaques"></textarea></div>`,
    `<button type="button" class="btn" data-close>Annuler</button><button type="button" class="btn ${block ? 'btn--danger' : 'btn--primary'}" id="block-save">${icon('ban')}${block ? 'Bloquer' : 'Débloquer'}</button>`);
  $('#block-save', modal).addEventListener('click', async () => {
    try {
      await api(`/api/ops/devices/${encodeURIComponent(deviceId)}/block`, { method: 'POST', body: { blocked: block, note: $('#block-note', modal).value } });
      modal.close();
      toast(block ? 'Appareil bloqué' : 'Appareil débloqué', 'success');
      if (state.view === 'securite') renderSecurity();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// --- Bandeau critique, son & voix ---------------------------------------------
function updateCritical() {
  const pending = [...state.alerts.values()].filter((a) => a.status === 'nouvelle').sort((a, b) => (b.escalation?.level ?? 0) - (a.escalation?.level ?? 0) || b.createdAt - a.createdAt);
  const el = $('#critical');
  document.title = pending.length ? `(${pending.length}) NOUVELLE ALERTE — APSIG` : 'Centrale de sécurité — APSIG';
  if (!pending.length) { el.hidden = true; return; }
  const a = pending[0];
  el.hidden = false;
  el.classList.toggle('critical--escalated', !!a.escalation?.level);
  el.innerHTML = `
    <span class="critical__icon">${icon(TYPE_META[a.type].icon)}</span>
    <div><strong>${a.escalation?.level ? `ESCALADE N${a.escalation.level} — ` : ''}${a.priority === 'critique' ? 'ALERTE CRITIQUE' : 'NOUVELLE ALERTE'} — ${esc(TYPE_META[a.type].label)}</strong><br>
    <span class="mono">${esc(a.code)}</span> · ${esc(a.quartier)}, ${esc(a.commune)} · ${fmtTimeSec(a.createdAt)}${pending.length > 1 ? ` · +${pending.length - 1} autre(s)` : ''}</div>
    <button type="button" class="btn" id="crit-ack">${icon('check')}Prendre en charge</button>`;
  $('#crit-ack').addEventListener('click', async () => {
    select(a.id, { fly: true });
    await run(a.id, 'ack');
  });
}

let audioCtx = null;
document.addEventListener('pointerdown', () => {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    else if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* audio indisponible */ }
}, { capture: true });

function siren(urgent = false) {
  if (!soundOn || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.connect(gain).connect(audioCtx.destination);
  const n = urgent ? 12 : 8;
  for (let i = 0; i < n; i++) osc.frequency.setValueAtTime(i % 2 ? 640 : 920, t0 + i * (urgent ? 0.15 : 0.22));
  const end = n * (urgent ? 0.15 : 0.22);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
  gain.gain.setValueAtTime(0.35, t0 + end - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
  osc.start(t0);
  osc.stop(t0 + end + 0.02);
}

function announce(text, delay = 1900) {
  if (!soundOn) return;
  setTimeout(() => speak(text, 'fr-FR'), delay);
}
const spokenType = { agression: 'Agression', medical: 'Malaise ou accident', incendie: 'Incendie' };

function renderSound() {
  const b = $('#sound');
  b.innerHTML = icon(soundOn ? 'volume' : 'volumeOff');
  b.setAttribute('aria-pressed', String(soundOn));
  b.title = soundOn ? 'Sirène et annonce vocale activées' : 'Son coupé';
}
$('#sound').addEventListener('click', () => {
  soundOn = !soundOn;
  prefs.set('cs-sound', soundOn);
  renderSound();
  if (soundOn) { setTimeout(siren, 50); announce('Annonces vocales activées.', 400); }
});

// --- Menus ---------------------------------------------------------------------
function toggleMenu(btn, menu) {
  const open = menu.hidden;
  $$('.menu').forEach((m) => { m.hidden = true; });
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}
$('#sim-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('#sim-btn'), $('#sim-menu')); });
$('#user-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('#user-btn'), $('#user-dropdown')); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu')) $$('.menu').forEach((m) => { m.hidden = true; });
});
$('#logout').addEventListener('click', logout);
$('#sim-menu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sim]');
  if (!b) return;
  $('#sim-menu').hidden = true;
  if (b.dataset.sim === 'reset') {
    if (!confirm('Réinitialiser toutes les données de démonstration ?')) return;
    await api('/api/ops/reset', { method: 'POST' }).catch((err) => toast(err.message, 'error'));
    return;
  }
  await api('/api/ops/simulate', { method: 'POST', body: { type: b.dataset.sim } }).catch((err) => toast(err.message, 'error'));
});

// --- QR public plein écran -------------------------------------------------------
function renderQrOverlay() {
  const showcase = state.plates.filter((p) => p.showcase && p.status === 'active');
  const sel = $('#qr-plate');
  const current = sel.value || prefs.get('cs-qr-plate') || showcase[0]?.token;
  sel.innerHTML = showcase.map((p) => `<option value="${esc(p.token)}" ${p.token === current ? 'selected' : ''}>${esc(p.code)} — ${p.pass === 'rouge' ? 'Pass Rouge' : 'Pass Bleu'}</option>`).join('');
  const plate = showcase.find((p) => p.token === sel.value) ?? showcase[0];
  if (!plate) return;
  const base = state.config?.baseUrl ?? location.origin;
  $('#qr-img').src = `/qr/${plate.token}.svg?b=${encodeURIComponent(base)}`;
  $('#qr-url').textContent = `${base}/s/${plate.token}`;
  $('#qr-ussd').textContent = `*789*${plate.shortCode}#`;
  $('#qr-net').textContent = state.config?.tunnelUrl ? 'Accessible depuis n\'importe quel réseau (tunnel HTTPS actif).' : 'Le téléphone doit être sur le même Wi-Fi que cet ordinateur (ou lancez « npm run demo » pour le tunnel HTTPS).';
}
$('#qr-btn').addEventListener('click', () => { renderQrOverlay(); $('#qr-overlay').hidden = false; });
$('#qr-close').addEventListener('click', () => { $('#qr-overlay').hidden = true; });
$('#qr-plate').addEventListener('change', () => { prefs.set('cs-qr-plate', $('#qr-plate').value); renderQrOverlay(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#qr-overlay').hidden = true; });

// --- Historique ---------------------------------------------------------------
async function loadHistory() {
  const days = Number($('#h-period').value);
  $('#csv-link').href = `/api/ops/alerts.csv?days=${Math.max(days, 1)}`;
  try {
    const { alerts } = await api(`/api/ops/alerts?days=${days}`);
    state.history = alerts;
    renderHistory();
  } catch (err) { toast(err.message, 'error'); }
}

function renderHistory() {
  const q = $('#h-q').value.trim().toLowerCase();
  const type = $('#h-type').value;
  const status = $('#h-status').value;
  const source = $('#h-source').value;
  const commune = $('#h-commune').value;
  const from = $('#h-period').value === '1' ? startOfToday() : 0;
  const rows = state.history.filter((a) => a.createdAt >= from
    && (!type || a.type === type)
    && (!status || (status === 'open' ? isOpen(a) : status === 'fausse' ? a.outcome?.startsWith('Fausse') : a.status === status))
    && (!source || a.source === source)
    && (!commune || a.commune === commune)
    && (!q || [a.id, a.code, a.quartier, a.commune, a.outcome, a.unit?.name].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt);

  const by = (t) => rows.filter((a) => a.type === t).length;
  const acked = rows.filter((a) => a.ackAt && a.status !== 'annulee');
  const avgAck = acked.length ? Math.round(acked.reduce((s, a) => s + (a.ackAt - a.createdAt), 0) / acked.length / 1000) : 0;
  $('#h-summary').innerHTML = `
    <span class="badge">${rows.length} alertes</span>
    <span class="badge badge--agression">${by('agression')} agressions</span>
    <span class="badge badge--medical">${by('medical')} médicales</span>
    <span class="badge badge--incendie">${by('incendie')} incendies</span>
    <span class="badge badge--warning">${rows.filter((a) => a.outcome?.startsWith('Fausse')).length} fausses alertes</span>
    <span class="badge badge--success">Prise en charge moyenne : ${avgAck} s</span>`;

  $('#h-rows').innerHTML = rows.slice(0, 500).map((a) => {
    const st = STATUS_META[a.status];
    return `<tr data-id="${a.id}">
      <td class="mono">${esc(a.id)}</td>
      <td class="mono">${fmtDate(a.createdAt)} ${fmtTime(a.createdAt)}</td>
      <td>${esc(SOURCE_LABEL[a.source] ?? a.source)}</td>
      <td class="mono">${esc(a.code)} ${a.pass === 'rouge' ? '<span class="badge badge--rouge">R</span>' : ''}</td>
      <td>${esc(a.quartier)}, ${esc(a.commune)}</td>
      <td><span class="badge badge--${a.type}">${TYPE_META[a.type].short}</span></td>
      <td>${a.unit ? esc(a.unit.name) : '—'}</td>
      <td class="mono">${a.ackAt ? `${Math.round((a.ackAt - a.createdAt) / 1000)} s` : '—'}${a.escalation?.level ? ` <span class="badge badge--agression">N${a.escalation.level}</span>` : ''}</td>
      <td class="mono">${a.onSiteAt ? `${Math.round((a.onSiteAt - a.createdAt) / 60000)} min` : '—'}</td>
      <td>${trustBadge(a.trust)}</td>
      <td><span class="status status--${st.cls}">${st.label}</span></td>
      <td class="issue">${esc(a.outcome ?? '')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="12" class="muted" style="text-align:center;padding:24px">Aucune alerte pour ces filtres.</td></tr>';
}
['#h-q', '#h-type', '#h-status', '#h-source', '#h-commune'].forEach((s) => $(s).addEventListener('input', renderHistory));
$('#h-period').addEventListener('change', loadHistory);
$('#h-rows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const id = tr.dataset.id;
  if (!state.alerts.has(id)) {
    try { state.alerts.set(id, (await api(`/api/ops/alert/${id}`)).alert); } catch (err) { return toast(err.message, 'error'); }
  }
  switchView('supervision');
  select(id, { fly: true });
});

// --- Rapports ---------------------------------------------------------------------
let reportMap = null;
let reportLayer = null;
async function renderReports() {
  const days = Number($('#r-days').value);
  let r;
  try { r = await api(`/api/ops/reports?days=${days}`); } catch (err) { return toast(err.message, 'error'); }
  const t = r.totals;
  const kpi = (label, value, cls = '') => `<div class="r-kpi ${cls}"><strong>${value}</strong><span>${label}</span></div>`;
  $('#r-kpis').innerHTML = [
    kpi('Alertes', t.alerts),
    kpi('Agressions', t.byType.agression, 'r-kpi--agression'),
    kpi('Malaises / accidents', t.byType.medical, 'r-kpi--medical'),
    kpi('Incendies', t.byType.incendie, 'r-kpi--incendie'),
    kpi('Prise en charge moy.', `${t.avgAckSeconds} s`),
    kpi('Arrivée moy.', `${t.avgArrivalMinutes} min`),
    kpi('Fausses alertes', `${t.falseAlerts} <small>(${t.alerts ? Math.round((t.falseAlerts / t.alerts) * 100) : 0} %)</small>`),
    kpi('Escalades', t.escalated),
    kpi('Via USSD / SMS', t.bySource.ussd + t.bySource.sms),
    kpi('Encaissements', `${r.revenue.toLocaleString('fr-FR')} <small>FCFA</small>`),
  ].join('');

  const max = Math.max(1, ...r.byDay.map((d) => d.total));
  $('#r-days-chart').style.gridTemplateColumns = `repeat(${r.byDay.length}, 1fr)`;
  $('#r-days-chart').innerHTML = r.byDay.map((d, i) => `
    <div class="h-bar" title="${fmtDate(d.date)} : ${d.agression} agressions · ${d.medical} médicales · ${d.incendie} incendies">
      <div class="h-bar__stack" style="height:${Math.round((d.total / max) * 100)}%">
        <i class="agression" style="flex:${d.agression}"></i><i class="medical" style="flex:${d.medical}"></i><i class="incendie" style="flex:${d.incendie}"></i>
      </div>
      <div>${r.byDay.length <= 10 || i % 5 === 0 || i === r.byDay.length - 1 ? `<span class="h-bar__total">${d.total}</span><br>${fmtDateShort(d.date)}` : '&nbsp;'}</div>
    </div>`).join('');

  const hmax = Math.max(1, ...r.byHour);
  $('#r-hours').innerHTML = r.byHour.map((n, h) => `<div class="r-hour" title="${h} h : ${n} alertes"><i style="height:${Math.round((n / hmax) * 100)}%"></i><span>${h % 3 === 0 ? h : ''}</span></div>`).join('');

  $('#r-communes').innerHTML = r.byCommune.map((c) => `<tr><td>${esc(c.key)}</td><td><strong>${c.total}</strong></td><td>${c.agression}</td><td>${c.medical}</td><td>${c.incendie}</td><td class="mono">${c.avgArrivalMinutes} min</td></tr>`).join('');
  $('#r-top').innerHTML = r.byQuartier.slice(0, 8).map((q) => `<li><span>${esc(q.quartier)} <small class="muted">${esc(q.commune)}</small></span><strong>${q.total}</strong></li>`).join('');

  if (!reportMap) {
    reportMap = L.map('r-map', { zoomControl: false, attributionControl: true, preferCanvas: true }).setView([5.34, -4.0], 11);
    baseLayers(reportMap);
    reportLayer = L.layerGroup().addTo(reportMap);
  }
  setTimeout(() => reportMap.invalidateSize(), 0);
  reportLayer.clearLayers();
  const qmax = Math.max(1, ...r.byQuartier.map((q) => q.total));
  for (const q of r.byQuartier) {
    const k = q.total / qmax;
    L.circle([q.lat, q.lng], { radius: 250 + k * 1100, stroke: false, fillColor: k > 0.66 ? '#ff4d4f' : k > 0.33 ? '#ff9f1c' : '#ffd166', fillOpacity: 0.25 + k * 0.4 })
      .bindTooltip(`<b>${esc(q.quartier)}</b> (${esc(q.commune)})<br>${q.total} alertes`, { direction: 'top' }).addTo(reportLayer);
  }
}
$('#r-days').addEventListener('change', renderReports);
$('#r-print').addEventListener('click', () => { document.body.classList.add('print-report'); window.print(); document.body.classList.remove('print-report'); });

// --- Messages ----------------------------------------------------------------------
function renderMessages() {
  const channel = $('#m-channel').value;
  const list = state.messages.filter((m) => !channel || m.channel === channel);
  $('#m-rows').innerHTML = list.slice(0, 300).map((m) => `<tr>
    <td class="mono">${fmtTimeSec(m.at)}</td>
    <td><span class="badge">${icon(CHANNEL_ICON[m.channel] ?? 'message')}${esc(m.channel)}</span></td>
    <td>${esc(m.toName)}<br><small class="mono muted">${esc(m.to)}</small></td>
    <td class="msg-text">${esc(m.text)}</td>
    <td class="mono">${m.alertId ? esc(m.alertId) : '—'}</td>
    <td><span class="ns ${m.status === 'envoyé' ? '' : m.status === 'échec' ? 'ns--ko' : 'ns--ok'}">${esc(m.status)}</span></td>
  </tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">Aucun message pour le moment. Déclenchez une alerte pour voir la messagerie s\'animer.</td></tr>';
}
$('#m-channel').addEventListener('change', renderMessages);

// --- Sécurité ------------------------------------------------------------------------
async function renderSecurity() {
  try {
    const [{ devices }, { audit }] = await Promise.all([api('/api/ops/devices'), api('/api/ops/audit')]);
    $('#s-devices').innerHTML = devices.slice(0, 60).map((d) => `<tr class="${d.plates24h >= 3 ? 'row-warn' : ''}">
      <td class="mono">${esc(d.id)}</td><td>${d.last24h}</td><td>${d.plates24h}${d.plates24h >= 3 ? ' <span class="badge badge--agression">suspect</span>' : ''}</td><td>${d.total}</td>
      <td class="mono">${fmtDate(d.lastAt)} ${fmtTime(d.lastAt)}</td>
      <td>${d.blocked ? `<span class="badge badge--agression">Bloqué</span><br><small class="muted">${esc(d.blockedBy ?? '')}</small>` : '<span class="badge">Normal</span>'}</td>
      <td><button type="button" class="btn btn--sm" data-device="${esc(d.id)}" data-block="${d.blocked ? '0' : '1'}">${d.blocked ? 'Débloquer' : 'Bloquer'}</button></td>
    </tr>`).join('');
    $('#s-audit').innerHTML = audit.map((x) => `<tr><td class="mono">${fmtDate(x.at)} ${fmtTimeSec(x.at)}</td><td>${esc(x.userName)}</td><td class="mono">${esc(x.action)}</td><td class="mono">${esc(x.target)}</td><td class="muted">${esc(x.details)}</td></tr>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}
$('#s-devices').addEventListener('click', (e) => {
  const b = e.target.closest('[data-device]');
  if (b) openBlock(b.dataset.device, b.dataset.block === '1');
});
$('#backup-btn').addEventListener('click', async () => {
  try { const { file } = await api('/api/ops/backup', { method: 'POST' }); toast(`Sauvegarde créée : ${file}`, 'success'); renderSecurity(); } catch (err) { toast(err.message, 'error'); }
});

// --- Vues -------------------------------------------------------------------------------
function switchView(view) {
  state.view = view;
  $$('.ops-tabs [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  for (const v of ['supervision', 'historique', 'rapports', 'messages', 'securite']) $(`#view-${v}`).hidden = v !== view;
  $('#kpis').hidden = view !== 'supervision';
  if (view === 'supervision') setTimeout(() => map.invalidateSize(), 0);
  if (view === 'historique') loadHistory();
  if (view === 'rapports') renderReports();
  if (view === 'messages') renderMessages();
  if (view === 'securite') renderSecurity();
}
$$('.ops-tabs [data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

// --- Données & temps réel -----------------------------------------------------------
let historyTimer = null;
function upsert(alert, isNew = false) {
  const prev = state.alerts.get(alert.id);
  state.alerts.set(alert.id, alert);
  if (isNew) {
    siren();
    announce(`${alert.priority === 'critique' ? 'Alerte critique' : 'Nouvelle alerte'}. ${spokenType[alert.type]}. ${alert.quartier}, ${alert.commune}.${alert.pass === 'rouge' ? ' Pass Rouge Premium.' : ''}`);
    const current = state.alerts.get(state.selectedId);
    if (!current || current.status !== 'nouvelle') select(alert.id, { fly: true });
  } else if (prev && (alert.escalation?.level ?? 0) > (prev.escalation?.level ?? 0)) {
    siren(true);
    announce(`Escalade niveau ${alert.escalation.level}. Alerte ${spokenType[alert.type]} à ${alert.quartier} non prise en charge.`, 2000);
  }
  renderQueue();
  renderAlertMarkers();
  if (alert.id === state.selectedId) renderDetail();
  updateCritical();
  if (state.view === 'historique') {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(loadHistory, 600);
  }
}

function applyRoleVisibility() {
  $$('[data-min-rank]').forEach((el) => { el.hidden = rank() < Number(el.dataset.minRank); });
  const me = state.me;
  $('#user-name').textContent = me.name;
  $('#user-role').textContent = me.roleLabel;
  $('#user-avatar').textContent = me.name.replace(/[^A-Za-zÀ-ÿ ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

async function bootstrap() {
  const data = await api('/api/ops/bootstrap');
  state.me = data.me;
  state.config = data.config;
  state.alerts = new Map(data.alerts.map((a) => [a.id, a]));
  state.units = data.units;
  state.plates = data.plates;
  state.messages = data.messages;
  if (state.selectedId && !state.alerts.has(state.selectedId)) state.selectedId = null;
  applyRoleVisibility();
  $('#m-driver').textContent = '';
  const communes = [...new Set(data.plates.map((p) => p.commune))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('#h-commune').innerHTML = '<option value="">Toutes communes</option>' + communes.map((c) => `<option>${esc(c)}</option>`).join('');
  unitMarkers.forEach((m) => unitsLayer.removeLayer(m));
  unitMarkers.clear();
  alertMarkers.forEach((m) => alertsLayer.removeLayer(m));
  alertMarkers.clear();
  state.stats = null;
  renderKpis(data.stats);
  if (!state.selectedId) map.fitBounds(L.latLngBounds(data.plates.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
  renderPlates();
  renderUnits();
  renderAlertMarkers();
  renderQueue();
  renderDetail();
  updateCritical();
  if (state.view !== 'supervision') switchView(state.view);
}

function setLive(on) {
  const el = $('#live');
  el.classList.toggle('is-off', !on);
  el.textContent = on ? 'En direct' : 'Reconnexion…';
}

function connect() {
  const es = new EventSource('/api/ops/events');
  let lost = false;
  es.addEventListener('open', () => {
    setLive(true);
    if (lost) { lost = false; bootstrap().catch(() => {}); }
  });
  es.addEventListener('error', () => {
    setLive(false);
    lost = true;
    // Session expirée : retour à la connexion.
    api('/api/auth/me').catch(() => { location.href = '/connexion?next=/centrale'; });
  });
  es.addEventListener('alert:new', (e) => upsert(JSON.parse(e.data), true));
  es.addEventListener('alert', (e) => upsert(JSON.parse(e.data)));
  es.addEventListener('stats', (e) => renderKpis(JSON.parse(e.data)));
  es.addEventListener('units', (e) => {
    const sel = state.alerts.get(state.selectedId);
    const gpsBefore = sel?.unitId && state.units.find((u) => u.id === sel.unitId)?.gps;
    state.units = JSON.parse(e.data);
    renderUnits();
    if (sel?.unitId && state.units.find((u) => u.id === sel.unitId)?.gps !== gpsBefore) renderDetail();
  });
  es.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    const i = state.messages.findIndex((x) => x.id === m.id);
    if (i >= 0) state.messages[i] = m; else state.messages.unshift(m);
    state.messages = state.messages.slice(0, 500);
    if (state.view === 'messages') renderMessages();
  });
  es.addEventListener('plate', (e) => {
    const p = JSON.parse(e.data);
    const i = state.plates.findIndex((x) => x.id === p.id);
    if (i >= 0) Object.assign(state.plates[i], p); else state.plates.push(p);
  });
  es.addEventListener('payment', (e) => {
    const p = JSON.parse(e.data);
    if (p.status === 'réussi') toast(`Paiement reçu : ${p.amount.toLocaleString('fr-FR')} FCFA (${p.operator}) — ${p.code}`, 'success');
  });
  es.addEventListener('device', () => { if (state.view === 'securite') renderSecurity(); });
  es.addEventListener('audit', () => { if (state.view === 'securite') renderSecurity(); });
  es.addEventListener('config', (e) => {
    state.config = JSON.parse(e.data);
    if (!$('#qr-overlay').hidden) renderQrOverlay();
    if (state.config.tunnelUrl) toast(`Tunnel HTTPS actif : ${state.config.tunnelUrl}`, 'success');
  });
  es.addEventListener('reset', () => { state.selectedId = null; bootstrap().then(() => toast('Démo réinitialisée', 'success')); });
}

// Horloge et chronomètres.
setInterval(() => {
  const now = Date.now();
  $('#clock').textContent = new Date(now).toLocaleTimeString('fr-FR');
  $$('[data-since]').forEach((el) => { el.textContent = chrono(now - Number(el.dataset.since)); });
}, 1000);

renderSound();
bootstrap().then(connect).catch((err) => {
  if (/Connexion requise|Droits/.test(err.message)) location.href = '/connexion?next=/centrale';
  else toast(`Chargement impossible : ${err.message}`, 'error');
});
