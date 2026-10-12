import { randomBytes } from 'node:crypto';
import { buildSeed } from './seed.js';

// Règles de routage par type d'urgence. Numéros d'urgence réels de Côte d'Ivoire (affichage uniquement en démo).
export const TYPES = {
  agression: { label: 'Agression / Intrusion', priority: 'critique', service: { actor: 'Police secours', target: '170' } },
  medical: { label: 'Maladie / Accident', priority: 'haute', service: { actor: 'SAMU', target: '185' } },
  incendie: { label: 'Incendie', priority: 'critique', service: { actor: 'Sapeurs-pompiers (GSPM)', target: '180' } },
};

const OPEN = new Set(['nouvelle', 'prise_en_charge', 'en_route', 'sur_place']);
const OPERATOR = 'Opérateur 01';

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Estimation réaliste affichée (trafic urbain ~22 km/h) ; le déplacement à l'écran est accéléré pour la démo.
const etaMinutes = (km) => Math.max(3, Math.round((km / 22) * 60) + 2);

export function createStore({ emit }) {
  let state;

  const plateByToken = (token) => state.plates.find((p) => p.token === token);
  const unitById = (id) => state.units.find((u) => u.id === id);
  const alertById = (id) => state.alerts.find((a) => a.id === id);

  function buildNotified(alert, plate, at) {
    const rule = TYPES[alert.type];
    const list = [{ actor: 'Centrale APSIG', role: 'apsig', channel: 'Console', target: 'Opérateur de permanence', status: 'délivré', at }];
    if (alert.pass === 'rouge' && alert.type === 'agression') {
      list.push({ actor: "Équipe d'intervention armée", role: 'apsig', channel: 'Radio', target: 'Rouge 1 · Rouge 2', status: 'envoyé', at });
    }
    list.push({ actor: rule.service.actor, role: 'service', channel: 'Appel + SMS', target: rule.service.target, status: 'envoyé', at });
    list.push({ actor: `Titulaire — ${plate.owner.name}`, role: 'famille', channel: 'SMS', target: plate.owner.phone, status: 'envoyé', at });
    for (const c of plate.contacts) list.push({ actor: `${c.relation} — ${c.name}`, role: 'famille', channel: 'SMS', target: c.phone, status: 'envoyé', at });
    if (plate.community) list.push({ actor: plate.community.name, role: 'communaute', channel: 'WhatsApp', target: plate.community.phone, status: 'envoyé', at });
    return list.map((n, i) => ({ id: i + 1, ...n }));
  }

  // Reconstitue timeline et notifications des alertes issues du jeu de données.
  function hydrate(a) {
    const plate = plateByToken(a.plateToken);
    a.notified = buildNotified(a, plate, a.createdAt).map((n) => ({ ...n, status: 'délivré' }));
    const unit = a.unitId ? unitById(a.unitId) : null;
    const t = [{ at: a.createdAt, kind: 'reporter', text: `Alerte « ${TYPES[a.type].label} » déclenchée par scan QR` }];
    t.push({ at: a.createdAt + 1200, kind: 'system', text: `Routage automatique : ${a.notified.length} destinataires notifiés` });
    if (a.status === 'annulee') {
      t.push({ at: a.closedAt, kind: 'reporter', text: 'Alerte annulée par le témoin' });
    } else {
      if (a.ackAt) t.push({ at: a.ackAt, kind: 'operator', text: `Prise en charge par ${OPERATOR}` });
      if (unit) t.push({ at: a.ackAt + 20000, kind: 'operator', text: `Unité ${unit.name} affectée (${unit.leader})` });
      if (a.onSiteAt) t.push({ at: a.onSiteAt, kind: 'unit', text: `Unité ${unit.name} sur place (position GPS)` });
      if (a.closedAt) t.push({ at: a.closedAt, kind: 'operator', text: `Clôture : ${a.outcome}` });
    }
    a.timeline = t;
  }

  function reset() {
    for (const a of state?.alerts ?? []) for (const timer of a._timers ?? []) clearTimeout(timer);
    state = buildSeed(Date.now());
    for (const a of state.alerts) hydrate(a);
  }

  function opsAlert(a) {
    const { reporterKey, _timers, ...rest } = a;
    const plate = plateByToken(a.plateToken);
    const unit = a.unitId ? unitById(a.unitId) : null;
    return {
      ...rest,
      typeLabel: TYPES[a.type].label,
      plate: plate && { code: plate.code, label: plate.label, kind: plate.kind, owner: plate.owner, contacts: plate.contacts, community: plate.community },
      unit: unit && { id: unit.id, name: unit.name, kind: unit.kind, leader: unit.leader, phone: unit.phone },
    };
  }

  function publicAlert(a) {
    const unit = a.unitId ? unitById(a.unitId) : null;
    let eta = null;
    if (unit && a.status === 'en_route') {
      const remaining = unit.mission ? Math.max(0, 1 - (Date.now() - unit.mission.startedAt) / unit.mission.duration) : 1;
      eta = Math.max(1, Math.round(etaMinutes(distanceKm(unit, a)) * Math.max(remaining, 0.15)));
    }
    return {
      id: a.id, code: a.code, type: a.type, typeLabel: TYPES[a.type].label, status: a.status,
      createdAt: a.createdAt, ackAt: a.ackAt, onSiteAt: a.onSiteAt, closedAt: a.closedAt,
      commune: a.commune, quartier: a.quartier,
      unit: unit && OPEN.has(a.status) ? { name: unit.name, kind: unit.kind } : null,
      eta,
      notifiedCount: a.notified.length,
    };
  }

  const changed = (a) => emit('alert', a);
  const log = (a, kind, text) => { a.timeline.push({ at: Date.now(), kind, text }); };

  function createAlert({ token, type, source = 'qr' }) {
    const plate = plateByToken(token);
    if (!plate) throw httpError(404, 'Plaque inconnue');
    if (plate.status !== 'active') throw httpError(403, 'Plaque désactivée');
    if (!TYPES[type]) throw httpError(400, "Type d'urgence invalide");

    // Anti-doublon : un même type déjà ouvert sur la même plaque depuis < 10 min est réutilisé.
    const dup = state.alerts.find((a) => a.plateToken === token && a.type === type && OPEN.has(a.status) && Date.now() - a.createdAt < 600000);
    if (dup) {
      log(dup, 'reporter', 'Nouveau déclenchement sur la même plaque (regroupé)');
      changed(dup);
      return { alert: dup, duplicate: true };
    }

    const now = Date.now();
    state.seq += 1;
    const alert = {
      id: `ALR-${String(state.seq).padStart(5, '0')}`,
      plateToken: plate.token, code: plate.code, pass: plate.pass, type,
      priority: TYPES[type].priority,
      commune: plate.commune, quartier: plate.quartier, lat: plate.lat, lng: plate.lng,
      source, status: 'nouvelle', createdAt: now, ackAt: null, onSiteAt: null, closedAt: null,
      unitId: null, outcome: null, notified: [], timeline: [],
      reporterKey: randomBytes(12).toString('hex'),
      _timers: [],
    };
    alert.notified = buildNotified(alert, plate, now);
    log(alert, 'reporter', `Alerte « ${TYPES[type].label} » déclenchée ${source === 'demo' ? '(simulation console)' : 'par scan QR'}`);
    log(alert, 'system', `Adresse identifiée : ${plate.code} — ${plate.quartier}, ${plate.commune}`);
    log(alert, 'system', `Routage automatique : ${alert.notified.length} destinataires notifiés`);
    state.alerts.push(alert);
    emit('alert:new', alert);

    // Accusés de réception simulés des SMS / appels.
    for (const n of alert.notified) {
      if (n.status === 'délivré') continue;
      const timer = setTimeout(() => {
        n.status = n.role === 'service' ? 'transmis' : 'délivré';
        n.at = Date.now();
        changed(alert);
      }, 900 + Math.random() * 2600);
      alert._timers.push(timer);
    }
    return { alert, duplicate: false };
  }

  function ensureOpen(a) {
    if (!a) throw httpError(404, 'Alerte introuvable');
    if (!OPEN.has(a.status)) throw httpError(409, 'Alerte déjà clôturée');
  }

  function ack(id) {
    const a = alertById(id);
    ensureOpen(a);
    if (a.status === 'nouvelle') {
      a.status = 'prise_en_charge';
      a.ackAt = Date.now();
      log(a, 'operator', `Prise en charge par ${OPERATOR}`);
      changed(a);
    }
    return a;
  }

  function freeUnit(a) {
    const unit = a.unitId ? unitById(a.unitId) : null;
    if (unit && unit.alertId === a.id) {
      unit.status = 'disponible';
      unit.alertId = null;
      unit.mission = null;
      emit('units');
    }
  }

  function assign(id, unitId) {
    const a = alertById(id);
    ensureOpen(a);
    const unit = unitById(unitId);
    if (!unit) throw httpError(404, 'Unité introuvable');
    if (unit.status !== 'disponible' && unit.alertId !== a.id) throw httpError(409, `Unité ${unit.name} déjà en mission`);
    if (a.status === 'nouvelle') ack(id);
    if (a.unitId && a.unitId !== unitId) freeUnit(a);

    const km = distanceKm(unit, a);
    a.unitId = unit.id;
    a.status = 'en_route';
    unit.status = 'en_mission';
    unit.alertId = a.id;
    unit.mission = { alertId: a.id, from: { lat: unit.lat, lng: unit.lng }, to: { lat: a.lat, lng: a.lng }, startedAt: Date.now(), duration: Math.min(45000, Math.max(18000, km * 7000)) };
    log(a, 'operator', `Unité ${unit.name} affectée (${unit.leader}) — ${km.toFixed(1)} km, ETA ~${etaMinutes(km)} min`);
    log(a, 'system', 'SMS au titulaire : « Une équipe APSIG est en route »');
    changed(a);
    emit('units');
    return a;
  }

  function markOnSite(a, auto = false) {
    if (a.status !== 'en_route' && a.status !== 'prise_en_charge') return;
    const unit = a.unitId ? unitById(a.unitId) : null;
    a.status = 'sur_place';
    a.onSiteAt = Date.now();
    if (unit) {
      unit.mission = null;
      unit.lat = a.lat + 0.0004; unit.lng = a.lng + 0.0004;
    }
    log(a, 'unit', `Unité ${unit?.name ?? ''} sur place${auto ? ' (position GPS)' : ' (confirmé par opérateur)'}`);
    changed(a);
    emit('units');
  }

  function onSite(id) {
    const a = alertById(id);
    ensureOpen(a);
    if (!a.unitId) throw httpError(409, "Aucune unité affectée");
    markOnSite(a);
    return a;
  }

  function close(id, outcome) {
    const a = alertById(id);
    ensureOpen(a);
    a.status = 'cloturee';
    a.closedAt = Date.now();
    a.outcome = String(outcome || 'Intervention terminée').slice(0, 200);
    if (!a.ackAt) a.ackAt = a.closedAt;
    log(a, 'operator', `Clôture : ${a.outcome}`);
    freeUnit(a);
    changed(a);
    return a;
  }

  function cancelByReporter(id, key) {
    const a = alertById(id);
    if (!a || !key || a.reporterKey !== key) throw httpError(403, 'Annulation non autorisée');
    ensureOpen(a);
    a.status = 'annulee';
    a.closedAt = Date.now();
    a.outcome = 'Annulée par le témoin';
    log(a, 'reporter', 'Alerte annulée par le témoin depuis la page SOS');
    freeUnit(a);
    changed(a);
    return a;
  }

  function logCall(id, target) {
    const a = alertById(id);
    if (!a) throw httpError(404, 'Alerte introuvable');
    log(a, 'operator', `Appel sortant vers ${String(target).slice(0, 120)}`);
    changed(a);
    return a;
  }

  function addNote(id, text) {
    const a = alertById(id);
    if (!a) throw httpError(404, 'Alerte introuvable');
    const clean = String(text || '').trim().slice(0, 500);
    if (!clean) throw httpError(400, 'Note vide');
    log(a, 'operator', `Note : ${clean}`);
    changed(a);
    return a;
  }

  function stats() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = state.alerts.filter((a) => a.createdAt >= start.getTime());
    const acked = today.filter((a) => a.ackAt);
    const avgAck = acked.length ? acked.reduce((s, a) => s + (a.ackAt - a.createdAt), 0) / acked.length : 0;
    const arrived = today.filter((a) => a.onSiteAt);
    const avgArrival = arrived.length ? arrived.reduce((s, a) => s + (a.onSiteAt - a.createdAt), 0) / arrived.length : 0;
    return {
      alertsToday: today.length,
      ongoing: state.alerts.filter((a) => OPEN.has(a.status)).length,
      activePlates: state.plates.filter((p) => p.status === 'active').length,
      unitsAvailable: state.units.filter((u) => u.status === 'disponible').length,
      unitsTotal: state.units.length,
      avgAckSeconds: Math.round(avgAck / 1000),
      avgArrivalMinutes: Math.round(avgArrival / 60000),
      byType: Object.fromEntries(Object.keys(TYPES).map((t) => [t, today.filter((a) => a.type === t).length])),
    };
  }

  // Déplacement simulé des unités vers leur intervention.
  function tick() {
    let moved = false;
    const now = Date.now();
    for (const u of state.units) {
      if (!u.mission) continue;
      const p = Math.min(1, (now - u.mission.startedAt) / u.mission.duration);
      const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      u.lat = u.mission.from.lat + (u.mission.to.lat - u.mission.from.lat) * ease;
      u.lng = u.mission.from.lng + (u.mission.to.lng - u.mission.from.lng) * ease;
      moved = true;
      if (p >= 1) {
        const a = alertById(u.mission.alertId);
        u.mission = null;
        if (a && a.status === 'en_route') markOnSite(a, true);
      }
    }
    if (moved) emit('units');
  }

  function simulate(type) {
    const types = Object.keys(TYPES);
    const t = TYPES[type] ? type : types[Math.floor(Math.random() * types.length)];
    const candidates = state.plates.filter((p) => p.showcase && !state.alerts.some((a) => a.plateToken === p.token && OPEN.has(a.status)));
    const plate = candidates[Math.floor(Math.random() * candidates.length)] ?? state.plates[0];
    return createAlert({ token: plate.token, type: t, source: 'demo' }).alert;
  }

  reset();

  return {
    reset,
    tick,
    simulate,
    createAlert,
    ack,
    assign,
    onSite,
    close,
    cancelByReporter,
    logCall,
    addNote,
    stats,
    opsAlert,
    publicAlert,
    get plates() { return state.plates; },
    get units() { return state.units; },
    get alerts() { return state.alerts; },
    plateByToken,
    alertById,
    publicPlate: (p) => ({ token: p.token, code: p.code, pass: p.pass, kind: p.kind, commune: p.commune, quartier: p.quartier, lat: p.lat, lng: p.lng, verified: true }),
    publicUnit: (u) => ({ id: u.id, name: u.name, kind: u.kind, leader: u.leader, phone: u.phone, lat: u.lat, lng: u.lng, status: u.status, alertId: u.alertId, moving: !!u.mission }),
  };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
