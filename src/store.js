import { randomBytes } from 'node:crypto';
import { buildSeed, COMMUNES, TARIFFS, MOBILE_MONEY, USSD_CODE } from './seed.js';
import { computeTrust, CALLBACK_LABELS } from './trust.js';

// Règles de routage par type d'urgence. Numéros d'urgence réels de Côte d'Ivoire.
export const TYPES = {
  agression: { label: 'Agression / Intrusion', priority: 'critique', service: { actor: 'Police secours', target: '170' } },
  medical: { label: 'Maladie / Accident', priority: 'haute', service: { actor: 'SAMU', target: '185' } },
  incendie: { label: 'Incendie', priority: 'critique', service: { actor: 'Sapeurs-pompiers (GSPM)', target: '180' } },
};
export const PLATE_KINDS = ['Domicile', 'Résidence', 'Commerce', 'Bureau', 'École', 'Pharmacie', 'Entrepôt'];
const OPEN = new Set(['nouvelle', 'prise_en_charge', 'en_route', 'sur_place']);
const SCHEMA = 2;
const DAY = 86400000;
const PHONE_RE = /^\+?[0-9][0-9 ]{7,19}$/;
const SYSTEM = { name: 'Système', role: 'system' };

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Estimation réaliste affichée (trafic urbain ~22 km/h) ; le déplacement simulé est accéléré pour la démo.
export const etaMinutes = (km) => Math.max(3, Math.round((km / 22) * 60) + 2);

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const hhmm = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const ddmmyyyy = (ts) => new Date(ts).toLocaleDateString('fr-FR');
const randomToken = (len) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function createStore({ db, emit, notifier, auth, config = {} }) {
  const cfg = {
    escalation: [60, 120], // secondes sans prise en charge avant escalade N1 puis N2
    paymentDelayMs: 4000,
    baseUrl: () => 'http://localhost:3000',
    ...config,
  };
  let state;
  let lastUnitsPersist = 0;

  // --- Accès -----------------------------------------------------------------
  const plateById = (id) => state.plates.find((p) => p.id === id);
  const plateByToken = (token) => state.plates.find((p) => p.token === token);
  const plateByShortCode = (code) => state.plates.find((p) => p.shortCode === String(code));
  const plateByClientKey = (key) => state.plates.find((p) => p.clientKey === key);
  const isRevoked = (token) => state.plates.some((p) => p.tokenHistory?.some((t) => t.token === token));
  const unitById = (id) => state.units.find((u) => u.id === id);
  const alertById = (id) => state.alerts.find((a) => a.id === id);
  const subscriptionActive = (p) => p.subscription.expiresAt > Date.now();
  const actorName = (actor) => actor?.name ?? 'Système';

  const persistAlert = (a) => { if (state.alerts.includes(a)) db.put('alerts', a); };
  const persistPlate = (p) => db.put('plates', p);
  const persistUnits = () => { lastUnitsPersist = Date.now(); db.transaction(() => state.units.forEach((u) => db.put('units', u))); };
  const changed = (a) => { persistAlert(a); emit('alert', a); };
  const log = (a, kind, text) => { a.timeline.push({ at: Date.now(), kind, text }); };

  function audit(actor, action, target, details = '') {
    state.auditSeq += 1;
    const entry = { id: `AUD-${String(state.auditSeq).padStart(6, '0')}`, at: Date.now(), userId: actor?.id ?? null, userName: actorName(actor), role: actor?.role ?? 'system', action, target, details };
    state.audit.push(entry);
    if (state.audit.length > 2000) state.audit.shift();
    db.put('audit', entry);
    db.meta.set('auditSeq', state.auditSeq);
    emit('audit', entry);
    return entry;
  }

  // --- Appareils des témoins -------------------------------------------------
  function deviceContext(a) {
    const d = a.deviceId ? state.devices.get(a.deviceId) : null;
    if (!d) return { deviceBlocked: false, deviceOtherPlates24h: 0 };
    const ref = a.createdAt;
    const others = d.alerts.filter((x) => x.alertId !== a.id && x.plateId !== a.plateId && Math.abs(ref - x.at) <= DAY);
    return { deviceBlocked: d.blocked, deviceOtherPlates24h: others.length };
  }
  const refreshTrust = (a) => { a.trust = computeTrust(a, deviceContext(a)); };

  function recordDevice(a) {
    if (!a.deviceId) return;
    let d = state.devices.get(a.deviceId);
    if (!d) {
      d = { id: a.deviceId, firstSeen: a.createdAt, alerts: [], blocked: false, blockedAt: null, blockedBy: null, note: '' };
      state.devices.set(d.id, d);
    }
    d.alerts.push({ at: a.createdAt, alertId: a.id, plateId: a.plateId });
    if (d.alerts.length > 60) d.alerts.shift();
    db.put('devices', d);
  }

  function deviceSummary(d) {
    const now = Date.now();
    const recent = d.alerts.filter((x) => now - x.at <= DAY);
    return {
      id: d.id, firstSeen: d.firstSeen, blocked: d.blocked, blockedAt: d.blockedAt, blockedBy: d.blockedBy, note: d.note,
      total: d.alerts.length, last24h: recent.length, plates24h: new Set(recent.map((x) => x.plateId)).size,
      lastAt: d.alerts.at(-1)?.at ?? d.firstSeen,
    };
  }

  // --- Notifications -----------------------------------------------------------
  function buildNotified(alert, plate, at) {
    const rule = TYPES[alert.type];
    const list = [{ actor: 'Centrale APSIG', role: 'apsig', channel: 'Console', target: 'Opérateur de permanence', status: 'délivré', at }];
    if (alert.pass === 'rouge' && alert.type === 'agression') {
      list.push({ actor: "Équipe d'intervention armée", role: 'radio', channel: 'Radio', target: 'Rouge 1 · Rouge 2', status: 'envoyé', at });
    }
    list.push({ actor: rule.service.actor, role: 'service', channel: 'Appel + SMS', target: rule.service.target, status: 'envoyé', at });
    list.push({ actor: `Titulaire — ${plate.owner.name}`, role: 'titulaire', channel: 'SMS', target: plate.owner.phone, status: 'envoyé', at });
    for (const c of plate.contacts) list.push({ actor: `${c.relation} — ${c.name}`, role: 'famille', channel: 'SMS', target: c.phone, status: 'envoyé', at });
    if (plate.community) list.push({ actor: plate.community.name, role: 'communaute', channel: 'WhatsApp', target: plate.community.phone, status: 'envoyé', at });
    return list.map((n, i) => ({ id: i + 1, ...n }));
  }

  function messageFor(n, alert, plate) {
    const label = TYPES[alert.type].label;
    const where = `${plate.code} (${plate.quartier}, ${plate.commune})`;
    switch (n.role) {
      case 'radio': return `Pré-alerte ${alert.id} : agression sur Pass Rouge, ${where}. Tenez-vous prêts.`;
      case 'service': return `[CODE-SECOURS] ${label.toUpperCase()} — ${where}. GPS ${alert.lat.toFixed(5)},${alert.lng.toFixed(5)}. Réf ${alert.id}. Centrale APSIG.`;
      case 'titulaire': return `[CODE-SECOURS] Alerte « ${label} » déclenchée à votre adresse ${plate.code} à ${hhmm(alert.createdAt)}. La centrale APSIG est mobilisée. Suivi : ${cfg.baseUrl()}/client/${plate.clientKey}`;
      case 'famille': return `[CODE-SECOURS] Alerte « ${label} » à l'adresse de ${plate.owner.name} (${plate.code}) à ${hhmm(alert.createdAt)}. La centrale APSIG est mobilisée.`;
      case 'communaute': return `[CODE-SECOURS] Alerte « ${label} » dans votre quartier (${plate.code}). Restez vigilants et facilitez l'accès des secours.`;
      default: return '';
    }
  }

  function sendNotifications(alert, plate) {
    for (const n of alert.notified) {
      if (n.channel === 'Console') continue;
      const msg = notifier.send({
        alertId: alert.id, channel: n.channel, to: n.target, toName: n.actor, text: messageFor(n, alert, plate),
        onStatus: (status) => {
          if (!state.alerts.includes(alert)) return;
          n.status = status;
          n.at = Date.now();
          changed(alert);
        },
      });
      n.msgId = msg.id;
    }
    notifier.send({
      alertId: alert.id, channel: 'Appel vocal', to: plate.owner.phone, toName: `Titulaire — ${plate.owner.name}`,
      text: 'Appel automatique : « Une alerte a été déclenchée à votre adresse. Tapez 1 si vous avez besoin d\'aide, 2 si vous êtes en sécurité. »',
    });
  }

  const notifyOwner = (a, text) => {
    const plate = plateById(a.plateId);
    if (plate) notifier.send({ alertId: a.id, channel: 'SMS', to: plate.owner.phone, toName: `Titulaire — ${plate.owner.name}`, text });
  };

  // --- Données de départ -------------------------------------------------------
  function hydrate(a) {
    const plate = plateById(a.plateId);
    a.notified = buildNotified(a, plate, a.createdAt).map((n) => ({ ...n, status: n.role === 'service' ? 'transmis' : 'délivré' }));
    const unit = a.unitId ? unitById(a.unitId) : null;
    const src = a.source === 'ussd' ? `par USSD (${USSD_CODE.replace('#', `*${plate.shortCode}#`)})` : 'par scan QR';
    const t = [{ at: a.createdAt, kind: 'reporter', text: `Alerte « ${TYPES[a.type].label} » déclenchée ${src}` }];
    t.push({ at: a.createdAt + 1200, kind: 'system', text: `Routage automatique : ${a.notified.length} destinataires notifiés` });
    if (a.witness?.location) t.push({ at: a.witness.location.at, kind: 'reporter', text: `Position du témoin reçue : à ${a.witness.location.distanceM} m de la plaque` });
    if (a.status === 'annulee') {
      t.push({ at: a.closedAt, kind: 'reporter', text: 'Alerte annulée par le témoin' });
    } else {
      if (a.ackAt) t.push({ at: a.ackAt, kind: 'operator', text: 'Prise en charge par Opérateur 01 — A. Koné' });
      if (a.callback?.status && a.callback.status !== 'en_attente') t.push({ at: a.callback.at, kind: 'operator', text: `Rappel : ${CALLBACK_LABELS[a.callback.status]}` });
      if (unit) t.push({ at: a.ackAt + 20000, kind: 'operator', text: `Unité ${unit.name} affectée (${unit.leader})` });
      if (a.onSiteAt) t.push({ at: a.onSiteAt, kind: 'unit', text: `Unité ${unit.name} sur place (position GPS)` });
      if (a.closedAt) t.push({ at: a.closedAt, kind: 'operator', text: `Clôture : ${a.outcome}` });
    }
    a.timeline = t.sort((x, y) => x.at - y.at);
  }

  function seedPayments(now) {
    const list = [];
    const ops = MOBILE_MONEY;
    for (let i = 0; i < 40; i++) {
      const plate = state.plates[(i * 37) % state.plates.length];
      const months = [1, 3, 12][i % 3];
      const at = now - Math.floor(((i + 1) / 41) * 30 * DAY);
      list.push({
        id: `PAY-${String(i + 1).padStart(5, '0')}`, ref: `MM${randomToken(8).toUpperCase()}`, plateId: plate.id, code: plate.code,
        operator: ops[i % ops.length], phone: plate.owner.phone, months, amount: amountFor(plate.pass, months), currency: 'FCFA',
        status: i % 13 === 5 ? 'échec' : 'réussi', reason: i % 13 === 5 ? 'Solde insuffisant' : null, at, confirmedAt: at + 4000, via: i % 2 ? 'client' : 'backoffice', by: i % 2 ? plate.owner.name : 'Admin APSIG',
      });
    }
    return list.sort((a, b) => a.at - b.at);
  }

  function reset(actor = SYSTEM) {
    for (const a of state?.alerts ?? []) for (const timer of a._timers ?? []) clearTimeout(timer);
    for (const p of state?.payments ?? []) clearTimeout(p._timer);
    const seed = buildSeed(Date.now());
    state = { ...seed, devices: new Map(), payments: [], audit: [], auditSeq: 0, paySeq: 0 };
    for (const a of state.alerts) { hydrate(a); recordDeviceSeed(a); }
    for (const a of state.alerts) refreshTrust(a);
    state.payments = seedPayments(Date.now());
    state.paySeq = state.payments.length;
    notifier.clear();
    db.transaction(() => {
      db.replaceAll('plates', state.plates);
      db.replaceAll('units', state.units);
      db.replaceAll('alerts', state.alerts);
      db.replaceAll('devices', [...state.devices.values()]);
      db.replaceAll('payments', state.payments);
      db.replaceAll('audit', []);
      db.meta.set('alertSeq', state.alerts.length);
      db.meta.set('paySeq', state.paySeq);
      db.meta.set('auditSeq', 0);
      db.meta.set('schema', SCHEMA);
      db.meta.set('seededAt', Date.now());
    });
    state.seq = state.alerts.length;
    audit(actor, 'reset', 'démo', 'Données de démonstration réinitialisées');
  }

  function recordDeviceSeed(a) {
    if (!a.deviceId) return;
    let d = state.devices.get(a.deviceId);
    if (!d) { d = { id: a.deviceId, firstSeen: a.createdAt, alerts: [], blocked: false, blockedAt: null, blockedBy: null, note: '' }; state.devices.set(d.id, d); }
    d.alerts.push({ at: a.createdAt, alertId: a.id, plateId: a.plateId });
    if (d.alerts.length > 60) d.alerts.shift();
  }

  function load() {
    if (db.meta.get('schema') !== SCHEMA || !db.all('plates').length) return reset();
    state = {
      plates: db.all('plates'),
      units: db.all('units'),
      alerts: db.all('alerts').sort((a, b) => a.createdAt - b.createdAt),
      devices: new Map(db.all('devices').map((d) => [d.id, d])),
      payments: db.all('payments').sort((a, b) => a.at - b.at),
      audit: db.all('audit').sort((a, b) => a.at - b.at).slice(-2000),
      seq: db.meta.get('alertSeq') ?? 0,
      paySeq: db.meta.get('paySeq') ?? 0,
      auditSeq: db.meta.get('auditSeq') ?? 0,
    };
    // Un paiement resté « en attente » lors d'un arrêt du serveur est relancé.
    for (const p of state.payments) if (p.status === 'en_attente') schedulePayment(p);
  }

  // --- Vues ------------------------------------------------------------------
  function opsAlert(a) {
    const { reporterKey, _timers, ...rest } = a;
    const plate = plateById(a.plateId);
    const unit = a.unitId ? unitById(a.unitId) : null;
    const device = a.deviceId ? state.devices.get(a.deviceId) : null;
    return {
      ...rest,
      typeLabel: TYPES[a.type].label,
      plate: plate && {
        id: plate.id, code: plate.code, label: plate.label, kind: plate.kind, owner: plate.owner, contacts: plate.contacts,
        community: plate.community, shortCode: plate.shortCode, subscriptionActive: subscriptionActive(plate), subscriptionExpiresAt: plate.subscription.expiresAt,
      },
      unit: unit && { id: unit.id, name: unit.name, kind: unit.kind, leader: unit.leader, phone: unit.phone },
      device: device && deviceSummary(device),
    };
  }

  function lightAlert(a) {
    const unit = a.unitId ? unitById(a.unitId) : null;
    return {
      id: a.id, code: a.code, pass: a.pass, type: a.type, status: a.status, source: a.source, createdAt: a.createdAt, ackAt: a.ackAt, onSiteAt: a.onSiteAt,
      closedAt: a.closedAt, commune: a.commune, quartier: a.quartier, outcome: a.outcome, unit: unit && { name: unit.name },
      trust: a.trust && { score: a.trust.score, level: a.trust.level }, escalation: a.escalation, lat: a.lat, lng: a.lng,
    };
  }

  function publicAlert(a) {
    const unit = a.unitId ? unitById(a.unitId) : null;
    let eta = null;
    if (unit && a.status === 'en_route') {
      const remaining = unit.mission ? Math.max(0, 1 - (Date.now() - unit.mission.startedAt) / unit.mission.duration) : 1;
      eta = Math.max(1, Math.round(etaMinutes(distanceKm(unit, a)) * (unit.mission ? Math.max(remaining, 0.15) : 1)));
    }
    return {
      id: a.id, code: a.code, type: a.type, typeLabel: TYPES[a.type].label, status: a.status,
      createdAt: a.createdAt, ackAt: a.ackAt, onSiteAt: a.onSiteAt, closedAt: a.closedAt,
      commune: a.commune, quartier: a.quartier,
      unit: unit && OPEN.has(a.status) ? { name: unit.name, kind: unit.kind } : null,
      eta,
      notifiedCount: a.notified.length,
      witnessLocated: !!a.witness?.location,
      mediaCount: a.media?.length ?? 0,
    };
  }

  function publicPlate(p) {
    return { token: p.token, code: p.code, pass: p.pass, kind: p.kind, commune: p.commune, quartier: p.quartier, lat: p.lat, lng: p.lng, shortCode: p.shortCode, ussd: USSD_CODE.replace('#', `*${p.shortCode}#`), verified: true };
  }

  function adminPlate(p) {
    return { ...p, subscriptionActive: subscriptionActive(p), alertCount: state.alerts.filter((a) => a.plateId === p.id).length };
  }

  function clientView(p) {
    const alerts = state.alerts.filter((a) => a.plateId === p.id).slice(-30).reverse();
    const open = alerts.find((a) => OPEN.has(a.status));
    return {
      plate: {
        id: p.id, token: p.token, code: p.code, pass: p.pass, kind: p.kind, label: p.label, commune: p.commune, quartier: p.quartier,
        owner: p.owner, contacts: p.contacts, community: p.community && { name: p.community.name }, shortCode: p.shortCode,
        ussd: USSD_CODE.replace('#', `*${p.shortCode}#`), status: p.status,
        subscription: { ...p.subscription, active: subscriptionActive(p) },
      },
      openAlert: open ? publicAlert(open) : null,
      alerts: alerts.map((a) => ({ id: a.id, type: a.type, typeLabel: TYPES[a.type].label, status: a.status, createdAt: a.createdAt, closedAt: a.closedAt, outcome: a.outcome })),
      payments: state.payments.filter((x) => x.plateId === p.id).slice(-10).reverse().map(publicPayment),
      tariffs: TARIFFS,
      mobileMoney: MOBILE_MONEY,
    };
  }

  const publicPayment = ({ _timer, ...p }) => p;

  // --- Cycle de vie des alertes ------------------------------------------------
  function createAlert({ token, shortCode, type, source = 'qr', deviceId = null, msisdn = null, lang = 'fr' }) {
    const plate = token ? plateByToken(token) : plateByShortCode(shortCode);
    if (!plate) {
      if (token && isRevoked(token)) throw httpError(410, 'Ce QR code a été révoqué. En cas d\'urgence, appelez directement les secours.');
      throw httpError(404, 'Plaque inconnue');
    }
    if (plate.status !== 'active') throw httpError(403, 'Plaque désactivée. En cas d\'urgence, appelez directement les secours.');
    if (!TYPES[type]) throw httpError(400, "Type d'urgence invalide");
    const device = deviceId ? cleanText(deviceId, 40) : null;

    // Anti-doublon : un même type déjà ouvert sur la même plaque depuis < 10 min est regroupé.
    const dup = state.alerts.find((a) => a.plateId === plate.id && a.type === type && OPEN.has(a.status) && Date.now() - a.createdAt < 600000);
    if (dup) {
      dup.retriggers = (dup.retriggers ?? 0) + 1;
      log(dup, 'reporter', `Nouveau déclenchement sur la même plaque (regroupé, ${dup.retriggers + 1} au total)`);
      refreshTrust(dup);
      changed(dup);
      return { alert: dup, duplicate: true };
    }

    const now = Date.now();
    state.seq += 1;
    db.meta.set('alertSeq', state.seq);
    const alert = {
      id: `ALR-${String(state.seq).padStart(5, '0')}`,
      plateId: plate.id, code: plate.code, pass: plate.pass, type,
      priority: TYPES[type].priority,
      commune: plate.commune, quartier: plate.quartier, lat: plate.lat, lng: plate.lng,
      source, lang: lang === 'en' ? 'en' : 'fr',
      status: 'nouvelle', createdAt: now, ackAt: null, onSiteAt: null, closedAt: null,
      unitId: null, outcome: null,
      deviceId: device, msisdn: msisdn ? cleanText(msisdn, 20) : null,
      witness: {}, media: [], retriggers: 0,
      callback: { status: 'en_attente', at: now },
      escalation: { level: 0, at: null },
      subscriptionExpired: !subscriptionActive(plate),
      notified: [], timeline: [],
      reporterKey: randomBytes(12).toString('hex'),
      _timers: [],
    };
    alert.notified = buildNotified(alert, plate, now);
    const via = { qr: 'par scan QR', ussd: `par USSD depuis ${alert.msisdn ?? 'un mobile'}`, sms: `par SMS depuis ${alert.msisdn ?? 'un mobile'}`, demo: '(simulation console)' }[source] ?? '';
    log(alert, 'reporter', `Alerte « ${TYPES[type].label} » déclenchée ${via}`);
    log(alert, 'system', `Adresse identifiée : ${plate.code} — ${plate.quartier}, ${plate.commune}`);
    if (alert.subscriptionExpired) log(alert, 'system', 'Abonnement expiré : alerte traitée quand même (l\'urgence prime)');
    log(alert, 'system', `Routage automatique : ${alert.notified.length} destinataires notifiés · rappel automatique du titulaire lancé`);
    state.alerts.push(alert);
    recordDevice(alert);
    refreshTrust(alert);
    persistAlert(alert);
    emit('alert:new', alert);
    sendNotifications(alert, plate);
    return { alert, duplicate: false };
  }

  function ensureOpen(a) {
    if (!a) throw httpError(404, 'Alerte introuvable');
    if (!OPEN.has(a.status)) throw httpError(409, 'Alerte déjà clôturée');
  }
  const checkKey = (a, key) => { if (!a || !key || a.reporterKey !== key) throw httpError(403, 'Accès refusé'); };

  function ack(id, actor) {
    const a = alertById(id);
    ensureOpen(a);
    if (a.status === 'nouvelle') {
      a.status = 'prise_en_charge';
      a.ackAt = Date.now();
      log(a, 'operator', `Prise en charge par ${actorName(actor)}`);
      audit(actor, 'ack', a.id);
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
      persistUnits();
      emit('units');
    }
  }

  const gpsLive = (u) => u.gpsAt && Date.now() - u.gpsAt < 60000;

  function assign(id, unitId, actor) {
    const a = alertById(id);
    ensureOpen(a);
    const unit = unitById(unitId);
    if (!unit) throw httpError(404, 'Unité introuvable');
    if (unit.status !== 'disponible' && unit.alertId !== a.id) throw httpError(409, `Unité ${unit.name} déjà en mission`);
    if (a.status === 'nouvelle') ack(id, actor);
    if (a.unitId && a.unitId !== unitId) freeUnit(a);

    const km = distanceKm(unit, a);
    a.unitId = unit.id;
    a.status = 'en_route';
    a.unitAckAt = null;
    unit.status = 'en_mission';
    unit.alertId = a.id;
    // Sans GPS réel, le trajet est simulé (accéléré) ; avec l'application terrain, la vraie position prime.
    unit.mission = gpsLive(unit) ? null : { alertId: a.id, from: { lat: unit.lat, lng: unit.lng }, to: { lat: a.lat, lng: a.lng }, startedAt: Date.now(), duration: Math.min(45000, Math.max(18000, km * 7000)) };
    log(a, 'operator', `Unité ${unit.name} affectée par ${actorName(actor)} (${unit.leader}) — ${km.toFixed(1)} km, ETA ~${etaMinutes(km)} min`);
    log(a, 'system', `Mission transmise à l'application terrain de l'unité ${unit.name}`);
    notifyOwner(a, `[CODE-SECOURS] Une équipe APSIG (unité ${unit.name}) est en route vers ${a.code}. Arrivée estimée ~${etaMinutes(km)} min.`);
    audit(actor, 'assign', a.id, `Unité ${unit.name}`);
    changed(a);
    persistUnits();
    emit('units');
    return a;
  }

  function markOnSite(a, how) {
    if (a.status !== 'en_route' && a.status !== 'prise_en_charge') return;
    const unit = a.unitId ? unitById(a.unitId) : null;
    a.status = 'sur_place';
    a.onSiteAt = Date.now();
    if (unit) {
      unit.mission = null;
      if (!gpsLive(unit)) { unit.lat = a.lat + 0.0004; unit.lng = a.lng + 0.0004; }
    }
    const label = how === 'sim' ? '(position GPS simulée)' : how === 'gps' ? '(GPS réel de l\'application terrain)' : `(confirmé par ${how})`;
    log(a, 'unit', `Unité ${unit?.name ?? ''} sur place ${label}`);
    changed(a);
    persistUnits();
    emit('units');
  }

  function onSite(id, actor) {
    const a = alertById(id);
    ensureOpen(a);
    if (!a.unitId) throw httpError(409, 'Aucune unité affectée');
    markOnSite(a, actorName(actor));
    audit(actor, 'onsite', a.id);
    return a;
  }

  function close(id, outcome, actor) {
    const a = alertById(id);
    ensureOpen(a);
    a.status = 'cloturee';
    a.closedAt = Date.now();
    a.outcome = cleanText(outcome, 200) || 'Intervention terminée';
    if (!a.ackAt) a.ackAt = a.closedAt;
    log(a, 'operator', `Clôture par ${actorName(actor)} : ${a.outcome}`);
    if (!a.outcome.startsWith('Fausse')) notifyOwner(a, `[CODE-SECOURS] Intervention ${a.id} clôturée : ${a.outcome}. Merci de votre confiance — APSIG.`);
    audit(actor, 'close', a.id, a.outcome);
    freeUnit(a);
    changed(a);
    return a;
  }

  function cancelByReporter(id, key) {
    const a = alertById(id);
    checkKey(a, key);
    ensureOpen(a);
    a.status = 'annulee';
    a.closedAt = Date.now();
    a.outcome = 'Annulée par le témoin';
    log(a, 'reporter', 'Alerte annulée par le témoin depuis la page SOS');
    notifyOwner(a, `[CODE-SECOURS] L'alerte ${a.id} sur ${a.code} a été annulée par la personne qui l'avait déclenchée.`);
    freeUnit(a);
    changed(a);
    return a;
  }

  function unitAck(unitId, actor) {
    const unit = unitById(unitId);
    const a = unit?.alertId ? alertById(unit.alertId) : null;
    ensureOpen(a);
    if (!a.unitAckAt) {
      a.unitAckAt = Date.now();
      log(a, 'unit', `Unité ${unit.name} : mission acceptée sur l'application terrain (${actorName(actor)})`);
      changed(a);
    }
    return a;
  }

  function logCall(id, target, actor) {
    const a = alertById(id);
    if (!a) throw httpError(404, 'Alerte introuvable');
    log(a, 'operator', `${actorName(actor)} : appel sortant vers ${cleanText(target, 120)}`);
    audit(actor, 'call', a.id, cleanText(target, 120));
    changed(a);
    return a;
  }

  function addNote(id, text, actor) {
    const a = alertById(id);
    if (!a) throw httpError(404, 'Alerte introuvable');
    const clean = cleanText(text, 500);
    if (!clean) throw httpError(400, 'Note vide');
    log(a, 'operator', `Note de ${actorName(actor)} : ${clean}`);
    changed(a);
    return a;
  }

  function setCallback(id, status, actor) {
    const a = alertById(id);
    if (!a) throw httpError(404, 'Alerte introuvable');
    if (!CALLBACK_LABELS[status] || status === 'en_attente') throw httpError(400, 'Résultat de rappel invalide');
    a.callback = { status, at: Date.now(), by: actorName(actor) };
    log(a, 'operator', `Rappel du titulaire : ${CALLBACK_LABELS[status]} (${actorName(actor)})`);
    refreshTrust(a);
    audit(actor, 'callback', a.id, CALLBACK_LABELS[status]);
    changed(a);
    return a;
  }

  // --- Contributions du témoin -------------------------------------------------
  function setWitnessLocation(id, key, { lat, lng, accuracy }) {
    const a = alertById(id);
    checkKey(a, key);
    const la = Number(lat);
    const ln = Number(lng);
    const acc = Math.max(0, Math.min(100000, Number(accuracy) || 0));
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) throw httpError(400, 'Position invalide');
    const distanceM = Math.round(distanceKm({ lat: la, lng: ln }, a) * 1000);
    a.witness = { ...a.witness, location: { lat: la, lng: ln, accuracy: Math.round(acc), distanceM, at: Date.now() } };
    const dist = distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`;
    log(a, 'reporter', `Position du témoin reçue : à ${dist} de la plaque (précision ±${Math.round(acc)} m)`);
    refreshTrust(a);
    changed(a);
    return a;
  }

  function addMedia(id, key, media) {
    const a = alertById(id);
    checkKey(a, key);
    ensureOpen(a);
    if ((a.media?.length ?? 0) >= 5) throw httpError(409, 'Nombre maximal d\'éléments atteint');
    const item = { id: `${a.id}-M${(a.media?.length ?? 0) + 1}`, at: Date.now(), ...media };
    a.media = [...(a.media ?? []), item];
    const what = { photo: 'une photo', audio: 'un message vocal', text: `un message : « ${cleanText(media.text, 120)} »` }[media.kind];
    log(a, 'reporter', `Le témoin a joint ${what}`);
    refreshTrust(a);
    changed(a);
    return a;
  }

  // --- Unités -------------------------------------------------------------------
  function setUnitPosition(unitId, { lat, lng, accuracy }) {
    const unit = unitById(unitId);
    if (!unit) throw httpError(404, 'Unité introuvable');
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) throw httpError(400, 'Position invalide');
    unit.lat = la;
    unit.lng = ln;
    unit.gpsAt = Date.now();
    unit.gpsAccuracy = Math.round(Number(accuracy) || 0);
    unit.mission = null;
    const a = unit.alertId ? alertById(unit.alertId) : null;
    if (a && a.status === 'en_route' && distanceKm(unit, a) < 0.08) markOnSite(a, 'gps');
    if (Date.now() - lastUnitsPersist > 5000) persistUnits();
    emit('units');
    return unit;
  }

  function publicUnit(u) {
    return { id: u.id, name: u.name, kind: u.kind, leader: u.leader, phone: u.phone, lat: u.lat, lng: u.lng, status: u.status, alertId: u.alertId, moving: !!u.mission, gps: !!gpsLive(u) };
  }

  // --- Escalade & boucle de simulation ----------------------------------------
  function escalate(a, level) {
    a.escalation = { level, at: Date.now() };
    const secs = cfg.escalation[level - 1];
    const targets = auth.usersByRole(level === 1 ? 'superviseur' : 'admin');
    for (const t of targets) {
      notifier.send({
        alertId: a.id,
        channel: level === 1 ? 'SMS' : 'Appel vocal',
        to: t.phone ?? '—',
        toName: t.name,
        text: level === 1
          ? `[ESCALADE N1] ${a.id} non prise en charge depuis ${secs} s — ${TYPES[a.type].label}, ${a.quartier}, ${a.commune}.`
          : `[ESCALADE N2] Appel automatique : l'alerte ${a.id} n'est toujours pas prise en charge après ${secs} s.`,
      });
    }
    log(a, 'system', level === 1 ? `Escalade niveau 1 : superviseur de permanence alerté par SMS (${secs} s sans prise en charge)` : `Escalade niveau 2 : responsable de la centrale appelé (${secs} s sans prise en charge)`);
    audit(SYSTEM, 'escalation', a.id, `Niveau ${level}`);
    changed(a);
  }

  function tick() {
    const now = Date.now();
    for (const a of state.alerts) {
      if (a.status !== 'nouvelle') continue;
      const age = now - a.createdAt;
      const level = cfg.escalation.filter((s) => age >= s * 1000).length;
      if (level > (a.escalation?.level ?? 0)) escalate(a, level);
    }
    let moved = false;
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
        if (a && a.status === 'en_route') markOnSite(a, 'sim');
      }
    }
    if (moved) {
      emit('units');
      if (now - lastUnitsPersist > 5000) persistUnits();
    }
  }

  function simulate(type, actor) {
    const types = Object.keys(TYPES);
    const t = TYPES[type] ? type : types[Math.floor(Math.random() * types.length)];
    const candidates = state.plates.filter((p) => p.showcase && p.status === 'active' && !state.alerts.some((a) => a.plateId === p.id && OPEN.has(a.status)));
    const plate = candidates[Math.floor(Math.random() * candidates.length)] ?? state.plates[0];
    const { alert } = createAlert({ token: plate.token, type: t, source: 'demo' });
    audit(actor, 'simulate', alert.id, TYPES[t].label);
    return alert;
  }

  // --- Plaques (back-office) ------------------------------------------------------
  function validPhone(v, field = 'Téléphone') {
    const s = cleanText(v, 20);
    if (!PHONE_RE.test(s)) throw httpError(400, `${field} invalide`);
    return s;
  }

  function createPlate(input, actor) {
    const commune = COMMUNES.find((c) => c.code === input.communeCode);
    const quartier = commune?.quartiers.find((q) => q.code === input.quartierCode);
    if (!quartier) throw httpError(400, 'Commune ou quartier invalide');
    const pass = input.pass === 'rouge' ? 'rouge' : 'bleu';
    const kind = PLATE_KINDS.includes(input.kind) ? input.kind : 'Domicile';
    const label = cleanText(input.label, 80);
    const ownerName = cleanText(input.ownerName, 60);
    if (!label || !ownerName) throw httpError(400, 'Libellé et titulaire obligatoires');
    const ownerPhone = validPhone(input.ownerPhone, 'Téléphone du titulaire');
    const taken = new Set(state.plates.map((p) => p.code));
    let num = Number(input.number);
    if (!(num >= 1 && num <= 999)) {
      const free = Array.from({ length: 999 }, (_, i) => i + 1).filter((n) => !taken.has(`ABJ-${commune.code}-${quartier.code}-${String(n).padStart(3, '0')}`));
      if (!free.length) throw httpError(409, 'Plus de numéro disponible dans ce quartier');
      num = free[Math.floor(Math.random() * free.length)];
    }
    const code = `ABJ-${commune.code}-${quartier.code}-${String(num).padStart(3, '0')}`;
    if (taken.has(code)) throw httpError(409, `Le code ${code} existe déjà`);
    const usedShort = new Set(state.plates.map((p) => p.shortCode));
    let shortCode;
    do { shortCode = String(20000 + Math.floor(Math.random() * 79999)); } while (usedShort.has(shortCode));
    const chief = input.community ? (state.plates.find((p) => p.communeCode === commune.code && p.quartierCode === quartier.code && p.community)?.community ?? { name: 'Chef de quartier (à renseigner)', phone: '—' }) : null;
    const lastNum = Math.max(...state.plates.map((p) => Number(p.id.slice(3))));
    const now = Date.now();
    const plate = {
      id: `PL-${String(lastNum + 1).padStart(4, '0')}`,
      token: randomToken(10), tokenHistory: [], code, pass, kind, label,
      commune: commune.name, communeCode: commune.code, quartier: quartier.name, quartierCode: quartier.code,
      lat: +(quartier.lat + (Math.random() - 0.5) * 0.006).toFixed(5), lng: +(quartier.lng + (Math.random() - 0.5) * 0.006).toFixed(5),
      owner: { name: ownerName, phone: ownerPhone }, contacts: [], community: chief,
      status: 'active', installedAt: now, showcase: false, shortCode, clientKey: randomToken(16),
      subscription: { plan: pass, since: now, expiresAt: now + 30 * DAY },
    };
    state.plates.push(plate);
    persistPlate(plate);
    audit(actor, 'plate.create', plate.code, `${pass === 'rouge' ? 'Pass Rouge' : 'Pass Bleu'} — ${ownerName} (essai 30 jours)`);
    emit('plate', plate);
    return plate;
  }

  function updatePlate(id, patch, actor) {
    const p = plateById(id);
    if (!p) throw httpError(404, 'Plaque introuvable');
    const changes = [];
    if (patch.label !== undefined) { const v = cleanText(patch.label, 80); if (!v) throw httpError(400, 'Libellé obligatoire'); if (v !== p.label) { p.label = v; changes.push('libellé'); } }
    if (patch.kind !== undefined && PLATE_KINDS.includes(patch.kind) && patch.kind !== p.kind) { p.kind = patch.kind; changes.push('type'); }
    if (patch.pass !== undefined && ['bleu', 'rouge'].includes(patch.pass) && patch.pass !== p.pass) { p.pass = patch.pass; p.subscription.plan = patch.pass; changes.push(`Pass ${patch.pass}`); }
    if (patch.ownerName !== undefined) { const v = cleanText(patch.ownerName, 60); if (!v) throw httpError(400, 'Titulaire obligatoire'); if (v !== p.owner.name) { p.owner.name = v; changes.push('titulaire'); } }
    if (patch.ownerPhone !== undefined) { const v = validPhone(patch.ownerPhone, 'Téléphone du titulaire'); if (v !== p.owner.phone) { p.owner.phone = v; changes.push('téléphone'); } }
    persistPlate(p);
    if (changes.length) audit(actor, 'plate.update', p.code, changes.join(', '));
    emit('plate', p);
    return p;
  }

  function setPlateStatus(id, status, actor) {
    const p = plateById(id);
    if (!p) throw httpError(404, 'Plaque introuvable');
    if (!['active', 'inactive'].includes(status)) throw httpError(400, 'Statut invalide');
    p.status = status;
    persistPlate(p);
    audit(actor, status === 'active' ? 'plate.enable' : 'plate.disable', p.code);
    emit('plate', p);
    return p;
  }

  function regenerateToken(id, actor) {
    const p = plateById(id);
    if (!p) throw httpError(404, 'Plaque introuvable');
    p.tokenHistory = [...(p.tokenHistory ?? []), { token: p.token, revokedAt: Date.now() }];
    p.token = randomToken(10);
    persistPlate(p);
    audit(actor, 'plate.regenerate', p.code, 'Ancien QR révoqué, nouveau QR à imprimer');
    emit('plate', p);
    return p;
  }

  function setContacts(plateId, contacts, actor) {
    const p = plateById(plateId);
    if (!p) throw httpError(404, 'Plaque introuvable');
    if (!Array.isArray(contacts) || contacts.length > 5) throw httpError(400, '5 contacts maximum');
    p.contacts = contacts.map((c) => {
      const name = cleanText(c.name, 60);
      if (!name) throw httpError(400, 'Nom du contact obligatoire');
      return { name, relation: cleanText(c.relation, 30) || 'Proche', phone: validPhone(c.phone, `Téléphone de ${name}`) };
    });
    persistPlate(p);
    audit(actor, 'plate.contacts', p.code, `${p.contacts.length} contact(s)`);
    emit('plate', p);
    return p;
  }

  // --- Abonnements & Mobile Money (simulation) -----------------------------------
  function amountFor(pass, months) {
    const gross = TARIFFS[pass] * months;
    return months >= 12 ? Math.round(gross * 0.9) : gross; // -10 % sur l'abonnement annuel (tarifs fictifs)
  }

  function schedulePayment(pay) {
    pay._timer = setTimeout(() => {
      if (!state.payments.includes(pay) || pay.status !== 'en_attente') return;
      const plate = plateById(pay.plateId);
      if (pay.phone.replace(/\D/g, '').endsWith('0000') || !plate) {
        pay.status = 'échec';
        pay.reason = 'Solde insuffisant (simulation)';
      } else {
        const base = Math.max(Date.now(), plate.subscription.expiresAt);
        plate.subscription.expiresAt = base + pay.months * 30 * DAY;
        plate.subscription.plan = plate.pass;
        pay.status = 'réussi';
        persistPlate(plate);
        notifier.send({ channel: 'SMS', to: pay.phone, toName: plate.owner.name, text: `[APSIG] Paiement de ${pay.amount.toLocaleString('fr-FR')} FCFA reçu (${pay.operator}, réf ${pay.ref}). Pass ${plate.pass === 'rouge' ? 'Rouge Premium' : 'Bleu'} valable jusqu'au ${ddmmyyyy(plate.subscription.expiresAt)}.` });
        emit('plate', plate);
      }
      pay.confirmedAt = Date.now();
      db.put('payments', pay);
      audit(SYSTEM, 'payment', pay.code, `${pay.ref} : ${pay.status}`);
      emit('payment', pay);
    }, cfg.paymentDelayMs);
  }

  function startPayment({ plateId, operator, phone, months, via = 'backoffice' }, actor) {
    const plate = plateById(plateId);
    if (!plate) throw httpError(404, 'Plaque introuvable');
    if (!MOBILE_MONEY.includes(operator)) throw httpError(400, 'Opérateur Mobile Money invalide');
    const m = Number(months);
    if (![1, 3, 6, 12].includes(m)) throw httpError(400, 'Durée invalide');
    if (state.payments.some((p) => p.plateId === plate.id && p.status === 'en_attente')) throw httpError(409, 'Un paiement est déjà en attente pour cette plaque');
    state.paySeq += 1;
    db.meta.set('paySeq', state.paySeq);
    const pay = {
      id: `PAY-${String(state.paySeq).padStart(5, '0')}`, ref: `MM${randomToken(8).toUpperCase()}`, plateId: plate.id, code: plate.code,
      operator, phone: validPhone(phone, 'Numéro Mobile Money'), months: m, amount: amountFor(plate.pass, m), currency: 'FCFA',
      status: 'en_attente', reason: null, at: Date.now(), confirmedAt: null, via, by: actorName(actor),
    };
    state.payments.push(pay);
    db.put('payments', pay);
    audit(actor, 'payment.start', plate.code, `${pay.amount} FCFA via ${operator}`);
    emit('payment', pay);
    schedulePayment(pay);
    return pay;
  }

  // --- Appareils (sécurité) ------------------------------------------------------
  function blockDevice(id, blocked, note, actor) {
    const d = state.devices.get(id);
    if (!d) throw httpError(404, 'Appareil inconnu');
    d.blocked = !!blocked;
    d.blockedAt = blocked ? Date.now() : null;
    d.blockedBy = blocked ? actorName(actor) : null;
    d.note = cleanText(note, 200);
    db.put('devices', d);
    audit(actor, blocked ? 'device.block' : 'device.unblock', id, d.note);
    for (const a of state.alerts) {
      if (a.deviceId === id && OPEN.has(a.status)) { refreshTrust(a); changed(a); }
    }
    emit('device', deviceSummary(d));
    return deviceSummary(d);
  }

  // --- Indicateurs & rapports -----------------------------------------------------
  function stats() {
    const start = startOfToday();
    const today = state.alerts.filter((a) => a.createdAt >= start);
    const acked = today.filter((a) => a.ackAt && a.status !== 'annulee');
    const avgAck = acked.length ? acked.reduce((s, a) => s + (a.ackAt - a.createdAt), 0) / acked.length : 0;
    const arrived = today.filter((a) => a.onSiteAt);
    const avgArrival = arrived.length ? arrived.reduce((s, a) => s + (a.onSiteAt - a.createdAt), 0) / arrived.length : 0;
    return {
      alertsToday: today.length,
      ongoing: state.alerts.filter((a) => OPEN.has(a.status)).length,
      escalatedOpen: state.alerts.filter((a) => a.status === 'nouvelle' && a.escalation?.level > 0).length,
      activePlates: state.plates.filter((p) => p.status === 'active').length,
      expiredPlates: state.plates.filter((p) => !subscriptionActive(p)).length,
      unitsAvailable: state.units.filter((u) => u.status === 'disponible').length,
      unitsTotal: state.units.length,
      avgAckSeconds: Math.round(avgAck / 1000),
      avgArrivalMinutes: Math.round(avgArrival / 60000),
      byType: Object.fromEntries(Object.keys(TYPES).map((t) => [t, today.filter((a) => a.type === t).length])),
    };
  }

  function report(days = 30) {
    const d = Math.max(1, Math.min(365, Number(days) || 30));
    const from = startOfToday() - (d - 1) * DAY;
    const list = state.alerts.filter((a) => a.createdAt >= from);
    const avg = (arr, f) => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0);
    const acked = list.filter((a) => a.ackAt && a.status !== 'annulee');
    const arrived = list.filter((a) => a.onSiteAt);
    const group = (keyFn) => {
      const m = new Map();
      for (const a of list) {
        const k = keyFn(a);
        const g = m.get(k) ?? { key: k, total: 0, agression: 0, medical: 0, incendie: 0, arrivals: [], lat: 0, lng: 0, commune: a.commune, quartier: a.quartier };
        g.total += 1;
        g[a.type] += 1;
        g.lat += a.lat; g.lng += a.lng;
        if (a.onSiteAt) g.arrivals.push(a.onSiteAt - a.createdAt);
        m.set(k, g);
      }
      return [...m.values()].map(({ arrivals, ...g }) => ({ ...g, lat: g.lat / g.total, lng: g.lng / g.total, avgArrivalMinutes: Math.round(avg(arrivals, (x) => x) / 60000) })).sort((a, b) => b.total - a.total);
    };
    const byDay = Array.from({ length: d }, (_, i) => {
      const s = from + i * DAY;
      const dayList = list.filter((a) => a.createdAt >= s && a.createdAt < s + DAY);
      return { date: s, total: dayList.length, agression: dayList.filter((a) => a.type === 'agression').length, medical: dayList.filter((a) => a.type === 'medical').length, incendie: dayList.filter((a) => a.type === 'incendie').length };
    });
    const byHour = Array.from({ length: 24 }, (_, h) => list.filter((a) => new Date(a.createdAt).getHours() === h).length);
    return {
      days: d, from, to: Date.now(),
      totals: {
        alerts: list.length,
        byType: Object.fromEntries(Object.keys(TYPES).map((t) => [t, list.filter((a) => a.type === t).length])),
        cancelled: list.filter((a) => a.status === 'annulee').length,
        falseAlerts: list.filter((a) => a.outcome?.startsWith('Fausse')).length,
        escalated: list.filter((a) => a.escalation?.level > 0).length,
        avgAckSeconds: Math.round(avg(acked, (a) => a.ackAt - a.createdAt) / 1000),
        avgArrivalMinutes: Math.round(avg(arrived, (a) => a.onSiteAt - a.createdAt) / 60000),
        avgTrust: Math.round(avg(list.filter((a) => a.trust), (a) => a.trust.score)),
        bySource: { qr: list.filter((a) => a.source === 'qr').length, ussd: list.filter((a) => a.source === 'ussd').length, sms: list.filter((a) => a.source === 'sms').length },
      },
      byCommune: group((a) => a.commune),
      byQuartier: group((a) => `${a.commune} · ${a.quartier}`),
      byDay,
      byHour,
      revenue: state.payments.filter((p) => p.status === 'réussi' && p.at >= from).reduce((s, p) => s + p.amount, 0),
    };
  }

  // --- Conservation des données (loi n° 2013-450) ----------------------------------
  function applyRetention({ alertDays = 365, mediaDays = 90, removeFile = () => {} } = {}) {
    const now = Date.now();
    let anonymized = 0;
    let mediaRemoved = 0;
    for (const a of state.alerts) {
      if (OPEN.has(a.status)) continue;
      let touched = false;
      if (a.media?.length && now - a.createdAt > mediaDays * DAY) {
        for (const m of a.media) if (m.file) removeFile(m.file);
        mediaRemoved += a.media.length;
        a.media = [];
        touched = true;
      }
      if (now - a.createdAt > alertDays * DAY && (a.deviceId || a.msisdn || a.witness?.location)) {
        a.deviceId = null; a.msisdn = null; a.witness = {};
        anonymized += 1;
        touched = true;
      }
      if (touched) persistAlert(a);
    }
    if (anonymized || mediaRemoved) audit(SYSTEM, 'retention', 'données', `${anonymized} alerte(s) anonymisée(s), ${mediaRemoved} média(s) supprimé(s)`);
    return { anonymized, mediaRemoved };
  }

  load();

  return {
    reset, tick, simulate,
    createAlert, ack, assign, onSite, close, cancelByReporter, unitAck, logCall, addNote, setCallback,
    setWitnessLocation, addMedia, setUnitPosition,
    createPlate, updatePlate, setPlateStatus, regenerateToken, setContacts,
    startPayment, blockDevice, applyRetention,
    stats, report, opsAlert, lightAlert, publicAlert, publicPlate, adminPlate, clientView, publicUnit, publicPayment,
    plateById, plateByToken, plateByShortCode, plateByClientKey, isRevoked, alertById, unitById,
    isDeviceBlocked: (id) => !!(id && state.devices.get(id)?.blocked),
    listDevices: () => [...state.devices.values()].map(deviceSummary).sort((a, b) => (b.blocked - a.blocked) || (b.plates24h - a.plates24h) || (b.lastAt - a.lastAt)),
    listAudit: (limit = 300) => state.audit.slice(-limit).reverse(),
    listPayments: (limit = 300) => state.payments.slice(-limit).reverse().map(publicPayment),
    get plates() { return state.plates; },
    get units() { return state.units; },
    get alerts() { return state.alerts; },
    audit,
    TYPES, OPEN,
  };
}
