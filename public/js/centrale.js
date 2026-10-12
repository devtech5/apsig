/* global L */
import { api, esc, icon, fmtTime, fmtTimeSec, fmtDate, fmtDateShort, chrono, toast, storage, TYPE_META, STATUS_META, OPEN_STATUSES } from './common.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
$$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

const prefs = storage('local');
const state = {
  alerts: new Map(),
  units: [],
  plates: [],
  stats: null,
  selectedId: null,
  filter: 'open',
  view: 'supervision',
};
let soundOn = prefs.get('cs-sound') ?? true;

const isOpen = (a) => OPEN_STATUSES.includes(a.status);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const etaMinutes = (km) => Math.max(3, Math.round((km / 22) * 60) + 2);
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// --- Carte ------------------------------------------------------------------
const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([5.345, -4.005], 12);
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: 'Fond de carte © Esri', maxZoom: 16 }).addTo(map);
L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: 'shadowPane' }).addTo(map);
const platesLayer = L.layerGroup().addTo(map);
const routesLayer = L.layerGroup().addTo(map);
const unitsLayer = L.layerGroup().addTo(map);
const alertsLayer = L.layerGroup().addTo(map);
const unitMarkers = new Map();
const alertMarkers = new Map();

function renderPlates() {
  platesLayer.clearLayers();
  for (const p of state.plates) {
    L.circleMarker([p.lat, p.lng], {
      radius: p.showcase ? 5 : 3.5, weight: p.showcase ? 1.5 : 0, color: '#fff',
      fillColor: p.pass === 'rouge' ? '#ef4b63' : '#4f86e8', fillOpacity: 0.8,
    }).bindTooltip(`<b>${esc(p.code)}</b><br>${esc(p.label)}`, { direction: 'top' }).addTo(platesLayer);
  }
}

function unitIconHTML(u) {
  const cls = u.moving ? 'unit-marker--moving' : u.status !== 'disponible' ? 'unit-marker--busy' : '';
  return `<div class="unit-marker ${cls} ${u.kind === 'intervention' ? 'unit-marker--intervention' : ''}">${icon('car')}${esc(u.name)}</div>`;
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
    m.bindTooltip(`<b>Unité ${esc(u.name)}</b> · ${u.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}<br>${esc(u.leader)}<br>${u.status === 'disponible' ? 'Disponible' : `En mission (${esc(u.alertId)})`}`, { direction: 'top', offset: [0, -10] });
  }
  renderRoutes();
}

function renderRoutes() {
  routesLayer.clearLayers();
  for (const a of state.alerts.values()) {
    if (a.status !== 'en_route' || !a.unitId) continue;
    const u = state.units.find((x) => x.id === a.unitId);
    if (!u) continue;
    L.polyline([[u.lat, u.lng], [a.lat, a.lng]], { color: '#6ea2ff', weight: 3, dashArray: '6 8', opacity: 0.9 }).addTo(routesLayer);
  }
}

function renderAlertMarkers() {
  const visible = new Set([...state.alerts.values()].filter(isOpen).map((a) => a.id));
  if (state.selectedId) visible.add(state.selectedId);
  for (const [id, m] of alertMarkers) {
    if (!visible.has(id)) { alertsLayer.removeLayer(m); alertMarkers.delete(id); }
  }
  for (const id of visible) {
    const a = state.alerts.get(id);
    if (!a) continue;
    const html = `<div class="alert-marker alert-marker--${a.type} ${isOpen(a) ? '' : 'is-closed'}"><span class="alert-marker__core">${icon(TYPE_META[a.type].icon)}</span></div>`;
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
}

// --- KPI ------------------------------------------------------------------
function renderKpis(stats) {
  const prev = state.stats;
  state.stats = stats;
  const tiles = [
    { key: 'alertsToday', cls: 'red', icon: 'bell', value: stats.alertsToday, label: 'Alertes du jour' },
    { key: 'ongoing', cls: 'amber', icon: 'radio', value: stats.ongoing, label: 'Interventions en cours' },
    { key: 'activePlates', cls: 'green', icon: 'qr', value: stats.activePlates, label: 'Plaques actives' },
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
      return an - bn || b.createdAt - a.createdAt;
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
    return `<li><button type="button" class="q-item q-item--${a.type} ${a.id === state.selectedId ? 'is-selected' : ''} ${a.status === 'nouvelle' ? 'is-new' : ''} ${isOpen(a) ? '' : 'is-closed'}" data-id="${a.id}">
      <span class="q-item__icon">${icon(TYPE_META[a.type].icon)}</span>
      <span class="q-item__main">
        <span class="q-item__top"><strong>${esc(TYPE_META[a.type].label)}</strong><span class="q-item__time" ${isOpen(a) ? `data-since="${a.createdAt}"` : ''}>${isOpen(a) ? chrono(Date.now() - a.createdAt) : fmtTime(a.createdAt)}</span></span>
        <span class="q-item__code">${esc(a.code)}</span>
        <span class="q-item__loc">${esc(a.quartier)}, ${esc(a.commune)}</span>
        <span class="q-item__bottom"><span class="status status--${st.cls}">${st.label}</span>${a.pass === 'rouge' ? '<span class="badge badge--rouge">Premium</span>' : ''}${a.unit ? `<span>${icon('car')} ${esc(a.unit.name)}</span>` : ''}</span>
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
const CHANNEL_ICON = { Console: 'monitor', Radio: 'radio', 'Appel + SMS': 'phone', SMS: 'message', WhatsApp: 'message' };

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
      <div><div class="d-head__kicker">${a.priority === 'critique' ? 'Alerte critique' : 'Alerte prioritaire'} · ${esc(a.id)}${a.source === 'demo' ? ' · simulation' : ''}</div><h2>${esc(meta.label)}</h2></div>
      <div class="d-head__timer mono">${open ? `<span data-since="${a.createdAt}">${chrono(Date.now() - a.createdAt)}</span><small>écoulé</small>` : `${chrono((a.closedAt ?? a.createdAt) - a.createdAt)}<small>durée totale</small>`}</div>
    </div>
    <div class="d-body">
      <div class="d-grid">
        <div><label>Code</label><span class="mono strong">${esc(a.code)}</span></div>
        <div><label>Déclenchée</label>${fmtTimeSec(a.createdAt)}<br><small>${fmtDate(a.createdAt)}</small></div>
        <div><label>Adresse</label>${esc(plate.label ?? '')}<br><small>${esc(a.quartier)}, ${esc(a.commune)}</small></div>
        <div><label>Pass</label><span class="badge badge--${a.pass}">${a.pass === 'rouge' ? 'Rouge Premium' : 'Bleu'}</span><br><small>${a.pass === 'rouge' ? 'Intervention armée incluse' : 'SOS Secours'}</small></div>
        <div><label>Titulaire</label>${esc(plate.owner?.name ?? '')}<br><small class="mono">${esc(plate.owner?.phone ?? '')}</small></div>
        <div><label>Statut</label><span class="status status--${st.cls}">${st.label}</span></div>
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
        <div class="d-unit">${icon('car')}<div><strong>Unité ${esc(unit.name)}</strong> · ${unit.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}<small>${esc(unit.leader)} · <span class="mono">${esc(unit.phone)}</span></small>
        ${a.status === 'en_route' ? `<small>À ${km.toFixed(1)} km · arrivée estimée ~${etaMinutes(km)} min</small>` : ''}</div></div>
      </section>` : ''}

      <section class="d-section"><h3>${icon('users')}Acteurs notifiés (${a.notified.length})</h3>
        <ul class="notif">${a.notified.map((n) => `<li>${icon(CHANNEL_ICON[n.channel] ?? 'message')}<span>${esc(n.actor)}<small>${esc(n.channel)} · <span class="mono">${esc(n.target)}</span></small></span><span class="ns ${n.status === 'envoyé' ? '' : 'ns--ok'}">${esc(n.status)}</span></li>`).join('')}</ul>
      </section>

      <section class="d-section"><h3>${icon('history')}Journal horodaté</h3>
        <ol class="timeline">${[...a.timeline].reverse().map((t) => `<li class="k-${t.kind}"><time>${fmtTimeSec(t.at)}</time><span>${esc(t.text)}</span></li>`).join('')}</ol>
      </section>
    </div>`;
  el.scrollTop = scrollTop;
}

$('#detail').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  const a = state.alerts.get(state.selectedId);
  if (!btn || !a) return;
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
      ${icon('car')}
      <span><strong>Unité ${esc(u.name)}</strong> · ${u.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}${rec && u.id === rec.id ? ' <span class="badge badge--success">Recommandée</span>' : ''}
        <small>${esc(u.leader)} · ${busy ? `En mission (${esc(u.alertId)})` : u.alertId === a.id ? 'Déjà affectée' : 'Disponible'}</small></span>
      <span class="eta">${u.km.toFixed(1)} km<small>~${etaMinutes(u.km)} min</small></span>
    </button></li>`;
  }).join('');
  openModal(`Affecter une unité · ${esc(a.code)}`, `
    <p class="muted" style="margin-top:0">${needArmed ? 'Pass Rouge + agression : une équipe d\'intervention armée est recommandée.' : 'Unités triées par distance. La plus proche disponible est recommandée.'}</p>
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

// --- Bandeau critique & son -----------------------------------------------
function updateCritical() {
  const pending = [...state.alerts.values()].filter((a) => a.status === 'nouvelle').sort((a, b) => b.createdAt - a.createdAt);
  const el = $('#critical');
  document.title = pending.length ? `(${pending.length}) NOUVELLE ALERTE — APSIG` : 'Centrale de sécurité — APSIG';
  if (!pending.length) { el.hidden = true; return; }
  const a = pending[0];
  el.hidden = false;
  el.innerHTML = `
    <span class="critical__icon">${icon(TYPE_META[a.type].icon)}</span>
    <div><strong>${a.priority === 'critique' ? 'ALERTE CRITIQUE' : 'NOUVELLE ALERTE'} — ${esc(TYPE_META[a.type].label)}</strong><br>
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

function siren() {
  if (!soundOn || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.connect(gain).connect(audioCtx.destination);
  for (let i = 0; i < 8; i++) osc.frequency.setValueAtTime(i % 2 ? 640 : 920, t0 + i * 0.22);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
  gain.gain.setValueAtTime(0.35, t0 + 1.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.78);
  osc.start(t0);
  osc.stop(t0 + 1.8);
}

function renderSound() {
  const b = $('#sound');
  b.innerHTML = icon(soundOn ? 'volume' : 'volumeOff');
  b.setAttribute('aria-pressed', String(soundOn));
  b.title = soundOn ? 'Alerte sonore activée' : 'Alerte sonore coupée';
}
$('#sound').addEventListener('click', () => {
  soundOn = !soundOn;
  prefs.set('cs-sound', soundOn);
  renderSound();
  if (soundOn) setTimeout(siren, 50);
});

// --- Simulation --------------------------------------------------------------
const simBtn = $('#sim-btn');
const simMenu = $('#sim-menu');
simBtn.addEventListener('click', () => {
  simMenu.hidden = !simMenu.hidden;
  simBtn.setAttribute('aria-expanded', String(!simMenu.hidden));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.sim')) { simMenu.hidden = true; simBtn.setAttribute('aria-expanded', 'false'); }
});
simMenu.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sim]');
  if (!b) return;
  simMenu.hidden = true;
  if (b.dataset.sim === 'reset') {
    if (!confirm('Réinitialiser toutes les données de démonstration ?')) return;
    await api('/api/ops/reset', { method: 'POST' }).catch((err) => toast(err.message, 'error'));
    return;
  }
  await api('/api/ops/simulate', { method: 'POST', body: { type: b.dataset.sim } }).catch((err) => toast(err.message, 'error'));
});

// --- Historique ---------------------------------------------------------------
function renderHistory() {
  const q = $('#h-q').value.trim().toLowerCase();
  const type = $('#h-type').value;
  const status = $('#h-status').value;
  const commune = $('#h-commune').value;
  const period = $('#h-period').value;
  const from = period === 'today' ? startOfToday() : period === '7' ? startOfToday() - 7 * 86400000 : 0;
  const rows = [...state.alerts.values()].filter((a) => a.createdAt >= from
    && (!type || a.type === type)
    && (!status || (status === 'open' ? isOpen(a) : a.status === status))
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
    <span class="badge badge--success">Prise en charge moyenne : ${avgAck} s</span>`;

  $('#h-rows').innerHTML = rows.slice(0, 400).map((a) => {
    const st = STATUS_META[a.status];
    return `<tr data-id="${a.id}">
      <td class="mono">${esc(a.id)}</td>
      <td class="mono">${fmtDate(a.createdAt)} ${fmtTime(a.createdAt)}</td>
      <td class="mono">${esc(a.code)} ${a.pass === 'rouge' ? '<span class="badge badge--rouge">R</span>' : ''}</td>
      <td>${esc(a.quartier)}, ${esc(a.commune)}</td>
      <td><span class="badge badge--${a.type}">${TYPE_META[a.type].short}</span></td>
      <td>${a.unit ? esc(a.unit.name) : '—'}</td>
      <td class="mono">${a.ackAt ? `${Math.round((a.ackAt - a.createdAt) / 1000)} s` : '—'}</td>
      <td class="mono">${a.onSiteAt ? `${Math.round((a.onSiteAt - a.createdAt) / 60000)} min` : '—'}</td>
      <td><span class="status status--${st.cls}">${st.label}</span></td>
      <td class="issue">${esc(a.outcome ?? '')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">Aucune alerte pour ces filtres.</td></tr>';

  // Graphique des 8 derniers jours (empilé par type).
  const days = Array.from({ length: 8 }, (_, i) => startOfToday() - (7 - i) * 86400000);
  const counts = days.map((d) => {
    const list = [...state.alerts.values()].filter((a) => a.createdAt >= d && a.createdAt < d + 86400000);
    return { d, total: list.length, agression: list.filter((a) => a.type === 'agression').length, medical: list.filter((a) => a.type === 'medical').length, incendie: list.filter((a) => a.type === 'incendie').length };
  });
  const max = Math.max(1, ...counts.map((c) => c.total));
  $('#h-chart').innerHTML = counts.map((c, i) => `
    <div class="h-bar" title="${c.agression} agressions · ${c.medical} médicales · ${c.incendie} incendies">
      <div class="h-bar__stack" style="height:${Math.round((c.total / max) * 100)}%">
        <i class="agression" style="flex:${c.agression}"></i><i class="medical" style="flex:${c.medical}"></i><i class="incendie" style="flex:${c.incendie}"></i>
      </div>
      <div><span class="h-bar__total">${c.total}</span><br>${i === 7 ? "Aujourd'hui" : fmtDateShort(c.d)}</div>
    </div>`).join('');
}
['#h-q', '#h-type', '#h-status', '#h-commune', '#h-period'].forEach((s) => $(s).addEventListener('input', renderHistory));
$('#h-rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  switchView('supervision');
  select(tr.dataset.id, { fly: true });
});

function switchView(view) {
  state.view = view;
  $$('.ops-tabs [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $('#view-supervision').hidden = view !== 'supervision';
  $('#view-historique').hidden = view !== 'historique';
  if (view === 'supervision') setTimeout(() => map.invalidateSize(), 0);
  else renderHistory();
}
$$('.ops-tabs [data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

// --- Données & temps réel -------------------------------------------------
let historyTimer = null;
function upsert(alert, isNew = false) {
  state.alerts.set(alert.id, alert);
  if (isNew) {
    siren();
    const current = state.alerts.get(state.selectedId);
    if (!current || current.status !== 'nouvelle') select(alert.id, { fly: true });
  }
  renderQueue();
  renderAlertMarkers();
  if (alert.id === state.selectedId) renderDetail();
  updateCritical();
  if (state.view === 'historique') { clearTimeout(historyTimer); historyTimer = setTimeout(renderHistory, 300); }
}

async function bootstrap() {
  const data = await api('/api/ops/bootstrap');
  state.alerts = new Map(data.alerts.map((a) => [a.id, a]));
  state.units = data.units;
  state.plates = data.plates;
  if (state.selectedId && !state.alerts.has(state.selectedId)) state.selectedId = null;
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
  if (state.view === 'historique') renderHistory();
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
  es.addEventListener('error', () => { setLive(false); lost = true; });
  es.addEventListener('alert:new', (e) => upsert(JSON.parse(e.data), true));
  es.addEventListener('alert', (e) => upsert(JSON.parse(e.data)));
  es.addEventListener('stats', (e) => renderKpis(JSON.parse(e.data)));
  es.addEventListener('units', (e) => { state.units = JSON.parse(e.data); renderUnits(); });
  es.addEventListener('reset', () => { state.selectedId = null; bootstrap().then(() => toast('Démo réinitialisée', 'success')); });
}

// Horloge et chronomètres.
setInterval(() => {
  const now = Date.now();
  $('#clock').textContent = new Date(now).toLocaleTimeString('fr-FR');
  $$('[data-since]').forEach((el) => { el.textContent = chrono(now - Number(el.dataset.since)); });
}, 1000);

renderSound();
bootstrap().then(connect).catch((err) => toast(`Chargement impossible : ${err.message}`, 'error'));
