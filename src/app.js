import path from 'node:path';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { httpError, distanceKm, etaMinutes, PLATE_KINDS } from './store.js';
import { sessionCookie } from './auth.js';
import { COMMUNES, TARIFFS, MOBILE_MONEY, USSD_CODE } from './seed.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
};

// Signatures binaires acceptées pour les pièces jointes du témoin.
const MEDIA_TYPES = [
  { kind: 'photo', mime: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { kind: 'photo', mime: 'image/png', ext: '.png', test: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  { kind: 'photo', mime: 'image/webp', ext: '.webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { kind: 'audio', mime: 'audio/webm', ext: '.webm', test: (b) => b.subarray(0, 4).toString('hex') === '1a45dfa3' },
  { kind: 'audio', mime: 'audio/ogg', ext: '.ogg', test: (b) => b.subarray(0, 4).toString() === 'OggS' },
  { kind: 'audio', mime: 'audio/mp4', ext: '.m4a', test: (b) => b.subarray(4, 8).toString() === 'ftyp' },
];

const PAGES = {
  '/': { file: 'index.html' },
  '/connexion': { file: 'connexion.html' },
  '/centrale': { file: 'centrale.html', rank: 1 },
  '/plaques': { file: 'plaques.html', rank: 1 },
  '/terrain': { file: 'terrain.html', agent: true },
  '/ussd': { file: 'ussd.html' },
};

export function createApp({ store, auth, notifier, db, config }) {
  const { publicDir, leafletDir, mediaDir, demo, rateLimit = 6, version = '0.2.0' } = config;
  const clients = new Set();
  const hits = new Map();
  const startedAt = Date.now();

  // --- Temps réel (Server-Sent Events), filtré selon le profil connecté ---------------
  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  function broadcast(type, payload) {
    for (const c of clients) {
      try { dispatch(c, type, payload); } catch { /* client déconnecté */ }
    }
  }

  function dispatch(c, type, payload) {
    if (type === 'reset') return send(c.res, 'reset', {});
    if (type === 'config') return send(c.res, 'config', publicConfig());
    if (c.scope === 'ops') {
      if (type === 'alert:new' || type === 'alert') {
        send(c.res, type, store.opsAlert(payload));
        send(c.res, 'stats', store.stats());
      } else if (type === 'units') {
        const now = Date.now();
        if (now - (c.lastUnits ?? 0) < 900) return; // au plus ~1 envoi par seconde
        c.lastUnits = now;
        send(c.res, 'units', store.units.map(store.publicUnit));
      } else if (type === 'plate') send(c.res, 'plate', store.adminPlate(payload));
      else if (type === 'payment') send(c.res, 'payment', store.publicPayment(payload));
      else if (type === 'message') send(c.res, 'message', payload);
      else if ((type === 'device' || type === 'audit') && c.rank >= 2) send(c.res, type, payload);
    } else if (c.scope === 'reporter') {
      if (type === 'units') {
        const mine = store.alertById(c.alertId);
        if (mine?.status === 'en_route' && Date.now() - (c.lastEta ?? 0) > 5000) {
          c.lastEta = Date.now();
          send(c.res, 'alert', store.publicAlert(mine));
        }
      } else if ((type === 'alert' || type === 'alert:new') && payload.id === c.alertId) send(c.res, 'alert', store.publicAlert(payload));
    } else if (c.scope === 'client') {
      if ((type === 'alert' || type === 'alert:new') && payload.plateId === c.plateId) send(c.res, type, store.publicAlert(payload));
      else if (type === 'payment' && payload.plateId === c.plateId) send(c.res, 'payment', store.publicPayment(payload));
      else if (type === 'plate' && payload.id === c.plateId) send(c.res, 'refresh', {});
    } else if (c.scope === 'agent') {
      if (type === 'alert' || type === 'alert:new') {
        const mine = payload.unitId === c.unitId && store.OPEN.has(payload.status);
        if (mine || c.missionId === payload.id) {
          c.missionId = mine ? payload.id : null;
          send(c.res, 'mission', mine ? store.opsAlert(payload) : null);
        }
      } else if (type === 'units') {
        const unit = store.unitById(c.unitId);
        if (unit && Date.now() - (c.lastUnits ?? 0) > 2000) {
          c.lastUnits = Date.now();
          send(c.res, 'unit', store.publicUnit(unit));
        }
      }
    }
  }

  const heartbeat = setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 20000);
  heartbeat.unref();

  function openStream(req, res, client) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const entry = { res, ...client };
    clients.add(entry);
    req.on('close', () => clients.delete(entry));
    return entry;
  }

  // --- Utilitaires HTTP ------------------------------------------------------------
  const json = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(data));
  };

  async function readBody(req, limit) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw httpError(413, 'Requête trop volumineuse');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    const type = req.headers['content-type'] ?? '';
    if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
    try { return JSON.parse(raw); } catch { throw httpError(400, 'JSON invalide'); }
  }

  async function serveFile(res, baseDir, relPath, extraHeaders = {}) {
    const filePath = path.normalize(path.join(baseDir, relPath));
    if (!filePath.startsWith(path.normalize(baseDir))) throw httpError(403, 'Accès refusé');
    let data;
    try { data = await readFile(filePath); } catch { throw httpError(404, 'Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', ...extraHeaders });
    res.end(data);
  }

  function clientIp(req) {
    const remote = req.socket.remoteAddress ?? 'unknown';
    // Derrière le tunnel (connexion locale), l'adresse réelle est fournie par Cloudflare.
    if (/^(::1|127\.|::ffff:127\.)/.test(remote)) {
      const fwd = req.headers['cf-connecting-ip'] ?? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
      if (fwd) return fwd;
    }
    return remote;
  }
  const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https' || String(req.headers['cf-visitor'] ?? '').includes('https');

  function limit(key, max, windowMs, message) {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) throw httpError(429, message);
    list.push(now);
    hits.set(key, list);
  }
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 600000)) hits.delete(k); }, 60000).unref();

  const publicConfig = () => ({
    baseUrl: config.getBaseUrl(), lanUrl: config.lanUrl, tunnelUrl: config.getTunnelUrl(), demo,
    demoToken: store.plates.find((x) => x.code === 'ABJ-YOP-NIANGON-453')?.token, ussdCode: USSD_CODE, version,
    // Plaques vitrines : leurs QR sont publics par nature (imprimés sur les plaques).
    showcase: store.plates.filter((x) => x.showcase && x.status === 'active').map((x) => ({ code: x.code, pass: x.pass, token: x.token, shortCode: x.shortCode })),
  });

  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString('fr-FR') : '');

  // --- Table des routes ------------------------------------------------------------
  const routes = [];
  const route = (method, pattern, opts, fn) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, opts, fn });
  };
  const OPS = { rank: 1 };
  const SUP = { rank: 2 };
  const ADMIN = { rank: 3 };
  const AGENT = { agent: true };

  // Configuration & santé
  route('GET', '/api/config', {}, () => publicConfig());
  route('GET', '/api/health', {}, () => ({
    status: 'ok', version, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), db: db.ping() ? 'ok' : 'erreur',
    tunnel: config.getTunnelUrl(), realtimeClients: clients.size, notifications: notifier.driver, time: new Date().toISOString(),
  }));

  // Authentification
  route('POST', '/api/auth/login', {}, ({ req, res, body, ip }) => {
    limit(`login:${ip}`, 8, 60000, 'Trop de tentatives. Réessayez dans une minute.');
    const session = auth.login(body.username ?? '', body.password ?? '');
    if (!session) throw httpError(401, 'Identifiant ou mot de passe incorrect');
    store.audit(session.user, 'login', session.user.username);
    return json(res, 200, { user: auth.publicUser(session.user) }, { 'Set-Cookie': sessionCookie(session.token, { secure: isSecure(req) }) });
  });
  route('POST', '/api/auth/demo', {}, ({ req, res, body }) => {
    if (!demo) throw httpError(404, 'Introuvable');
    const session = auth.loginAs(String(body.username ?? ''));
    if (!session) throw httpError(404, 'Compte inconnu');
    store.audit(session.user, 'login', `${session.user.username} (accès rapide démo)`);
    return json(res, 200, { user: auth.publicUser(session.user) }, { 'Set-Cookie': sessionCookie(session.token, { secure: isSecure(req) }) });
  });
  route('POST', '/api/auth/logout', {}, ({ req, res }) => {
    auth.logout(auth.tokenFromRequest(req));
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', { clear: true }) });
  });
  route('GET', '/api/auth/me', {}, ({ user }) => {
    if (!user) throw httpError(401, 'Non connecté');
    return { user: auth.publicUser(user) };
  });
  route('GET', '/api/auth/demo-accounts', {}, () => {
    if (!demo) throw httpError(404, 'Introuvable');
    return { accounts: auth.demoAccounts() };
  });

  // Page SOS publique
  route('GET', '/api/public/plates/:token', {}, ({ params }) => {
    const plate = store.plateByToken(params.token);
    if (!plate) {
      if (store.isRevoked(params.token)) throw httpError(410, 'Ce QR code a été remplacé et n\'est plus actif.');
      throw httpError(404, 'Plaque inconnue');
    }
    if (plate.status !== 'active') throw httpError(403, 'Cette plaque est désactivée.');
    return { plate: store.publicPlate(plate), demo };
  });
  route('POST', '/api/public/alerts', {}, ({ body, ip }) => {
    const deviceId = body.deviceId ? String(body.deviceId).slice(0, 40) : null;
    if (store.isDeviceBlocked(deviceId)) limit(`blocked:${deviceId}`, 1, 600000, 'Déclenchements restreints sur cet appareil. En cas d\'urgence, appelez directement les secours.');
    limit(`alert:${ip}`, rateLimit, 60000, 'Trop de déclenchements. Patientez une minute ou appelez directement les secours.');
    const { alert, duplicate } = store.createAlert({ token: String(body.token ?? ''), type: String(body.type ?? ''), deviceId, lang: body.lang });
    return { status: 201, data: { alert: store.publicAlert(alert), key: alert.reporterKey, duplicate } };
  });
  route('GET', '/api/public/alerts/:id', {}, ({ params, url }) => {
    const a = store.alertById(params.id);
    if (!a || a.reporterKey !== url.searchParams.get('key')) throw httpError(404, 'Alerte introuvable');
    return { alert: store.publicAlert(a) };
  });
  route('POST', '/api/public/alerts/:id/cancel', {}, ({ params, body }) => ({ alert: store.publicAlert(store.cancelByReporter(params.id, String(body.key ?? ''))) }));
  route('POST', '/api/public/alerts/:id/location', {}, ({ params, body }) => ({ alert: store.publicAlert(store.setWitnessLocation(params.id, String(body.key ?? ''), body)) }));
  route('POST', '/api/public/alerts/:id/media', { bodyLimit: 9 * 1024 * 1024 }, async ({ params, body, ip }) => {
    limit(`media:${ip}`, 10, 60000, 'Trop d\'envois. Patientez un instant.');
    const a = store.alertById(params.id);
    if (!a || a.reporterKey !== String(body.key ?? '')) throw httpError(403, 'Accès refusé');
    if (body.kind === 'text') {
      const text = String(body.text ?? '').trim().slice(0, 500);
      if (!text) throw httpError(400, 'Message vide');
      return { alert: store.publicAlert(store.addMedia(a.id, body.key, { kind: 'text', text })) };
    }
    const buf = Buffer.from(String(body.data ?? '').replace(/^data:[^,]*,/, ''), 'base64');
    if (!buf.length || buf.length > 6 * 1024 * 1024) throw httpError(413, 'Fichier vide ou trop volumineux (6 Mo max.)');
    const type = MEDIA_TYPES.find((t) => t.test(buf));
    if (!type || type.kind !== body.kind) throw httpError(415, 'Format de fichier non pris en charge');
    await mkdir(mediaDir, { recursive: true });
    const file = `${a.id}-${randomBytes(6).toString('hex')}${type.ext}`;
    await writeFile(path.join(mediaDir, file), buf);
    return { alert: store.publicAlert(store.addMedia(a.id, body.key, { kind: type.kind, mime: type.mime, file, url: `/media/${file}`, size: buf.length })) };
  });
  route('GET', '/api/public/events', {}, ({ req, res, url }) => {
    const a = store.alertById(url.searchParams.get('alert'));
    if (!a || a.reporterKey !== url.searchParams.get('key')) throw httpError(404, 'Alerte introuvable');
    const c = openStream(req, res, { scope: 'reporter', alertId: a.id });
    send(c.res, 'alert', store.publicAlert(a));
    return null;
  });

  // Passerelles réseau mobile (format compatible avec les agrégateurs USSD/SMS courants)
  const TYPE_BY_CHOICE = { 1: 'agression', 2: 'medical', 3: 'incendie' };
  route('POST', '/api/ussd', {}, ({ res, body }) => {
    const msisdn = String(body.phoneNumber ?? '').slice(0, 20);
    const serviceCode = String(body.serviceCode ?? USSD_CODE);
    const parts = String(body.text ?? '').split('*').filter((x) => x !== '');
    const fromService = serviceCode.match(/^\*\d+\*(\d{5})#$/)?.[1];
    const code = fromService ?? parts[0];
    const choice = fromService ? parts[0] : parts[1];
    const reply = (text) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); return null; };
    if (!code) return reply('CON CODE-SECOURS CI\nEntrez le code à 5 chiffres inscrit sur la plaque :');
    const plate = store.plateByShortCode(code);
    if (!plate || plate.status !== 'active') return reply('END Code inconnu ou plaque inactive.\nUrgence : Police 170, Pompiers 180, SAMU 185.');
    if (!choice) return reply(`CON ${plate.code}\n${plate.quartier}, ${plate.commune}\n1. Agression / Intrusion\n2. Malaise / Accident\n3. Incendie\n0. Annuler`);
    if (choice === '0') return reply('END Aucune alerte envoyée.');
    const type = TYPE_BY_CHOICE[choice];
    if (!type) return reply('END Choix invalide. Recomposez le code.');
    limit(`msisdn:${msisdn}`, 6, 60000, 'Trop de déclenchements');
    const { alert } = store.createAlert({ shortCode: code, type, source: 'ussd', msisdn });
    return reply(`END Alerte transmise (réf. ${alert.id}).\nLa centrale APSIG est prévenue et va vous rappeler. Restez en sécurité.`);
  });
  route('POST', '/api/sms/inbound', {}, ({ body }) => {
    const from = String(body.from ?? '').slice(0, 20);
    const text = String(body.text ?? '');
    const m = text.match(/^\s*SOS\s+(\d{5})(?:\s+(\S+))?/i);
    const answer = (reply, alertId = null) => {
      notifier.send({ alertId, channel: 'SMS', to: from, toName: 'Expéditeur SMS', text: reply });
      return { reply, alertId };
    };
    if (!m) return answer('CODE-SECOURS : envoyez « SOS <code plaque> <1, 2 ou 3> ». 1 = agression, 2 = malaise, 3 = incendie.');
    const plate = store.plateByShortCode(m[1]);
    if (!plate || plate.status !== 'active') return answer('CODE-SECOURS : code inconnu. Urgence : Police 170, Pompiers 180, SAMU 185.');
    const word = (m[2] ?? '').toLowerCase();
    const type = TYPE_BY_CHOICE[word] ?? (/^(a|agr)/.test(word) ? 'agression' : /^(m|mal|sant)/.test(word) ? 'medical' : /^(f|feu|inc)/.test(word) ? 'incendie' : null);
    if (!type) return answer(`CODE-SECOURS ${plate.code} : précisez le type. SOS ${m[1]} 1 (agression), 2 (malaise) ou 3 (incendie).`);
    limit(`msisdn:${from}`, 6, 60000, 'Trop de déclenchements');
    const { alert } = store.createAlert({ shortCode: m[1], type, source: 'sms', msisdn: from });
    return answer(`CODE-SECOURS : alerte ${alert.id} transmise pour ${plate.code}. La centrale APSIG vous rappelle.`, alert.id);
  });

  // Centrale
  route('GET', '/api/ops/bootstrap', OPS, ({ user }) => {
    const from = Date.now() - 8 * 86400000;
    return {
      me: auth.publicUser(user),
      alerts: store.alerts.filter((a) => a.createdAt >= from || store.OPEN.has(a.status)).map(store.opsAlert),
      units: store.units.map(store.publicUnit),
      plates: store.plates.map((p) => ({ id: p.id, token: p.token, code: p.code, pass: p.pass, kind: p.kind, label: p.label, commune: p.commune, quartier: p.quartier, lat: p.lat, lng: p.lng, showcase: p.showcase, status: p.status, shortCode: p.shortCode })),
      stats: store.stats(),
      messages: notifier.list({ limit: 150 }),
      config: publicConfig(),
    };
  });
  route('GET', '/api/ops/events', OPS, ({ req, res, user }) => {
    const c = openStream(req, res, { scope: 'ops', rank: auth.publicUser(user).rank });
    send(c.res, 'hello', { at: Date.now() });
    return null;
  });
  route('GET', '/api/ops/alert/:id', OPS, ({ params }) => {
    const a = store.alertById(params.id);
    if (!a) throw httpError(404, 'Alerte introuvable');
    return { alert: store.opsAlert(a) };
  });
  route('GET', '/api/ops/alerts', OPS, ({ url }) => {
    const days = Math.min(365, Number(url.searchParams.get('days')) || 30);
    const from = Date.now() - days * 86400000;
    return { alerts: store.alerts.filter((a) => a.createdAt >= from).map(store.lightAlert) };
  });
  route('GET', '/api/ops/alerts.csv', OPS, ({ res, url }) => {
    const days = Math.min(365, Number(url.searchParams.get('days')) || 30);
    const from = Date.now() - days * 86400000;
    const head = ['ID', 'Déclenchée', 'Source', 'Code plaque', 'Pass', 'Commune', 'Quartier', 'Type', 'Statut', 'Unité', 'Prise en charge (s)', 'Arrivée (min)', 'Clôture', 'Issue', 'Fiabilité', 'Escalade'];
    const rows = store.alerts.filter((a) => a.createdAt >= from).reverse().map((a) => [a.id, fmt(a.createdAt), a.source, a.code, a.pass, a.commune, a.quartier, a.type, a.status, a.unitId ?? '',
      a.ackAt ? Math.round((a.ackAt - a.createdAt) / 1000) : '', a.onSiteAt ? Math.round((a.onSiteAt - a.createdAt) / 60000) : '', fmt(a.closedAt), a.outcome ?? '', a.trust?.score ?? '', a.escalation?.level || '']);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="alertes-code-secours-${days}j.csv"` });
    res.end('﻿' + [head, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n'));
    return null;
  });
  route('POST', '/api/ops/alerts/:id/:action', OPS, ({ params, body, user }) => {
    const { id, action } = params;
    const a = {
      ack: () => store.ack(id, user),
      assign: () => store.assign(id, String(body.unitId ?? ''), user),
      onsite: () => store.onSite(id, user),
      close: () => store.close(id, body.outcome, user),
      call: () => store.logCall(id, body.target, user),
      note: () => store.addNote(id, body.text, user),
      callback: () => store.setCallback(id, String(body.status ?? ''), user),
    }[action];
    if (!a) throw httpError(404, 'Action inconnue');
    return { alert: store.opsAlert(a()) };
  });
  route('POST', '/api/ops/simulate', OPS, ({ body, user }) => ({ status: 201, data: { alert: store.opsAlert(store.simulate(body.type, user)) } }));
  route('POST', '/api/ops/reset', SUP, ({ user }) => { store.reset(user); notifier.clear(); broadcast('reset'); return { ok: true }; });
  route('GET', '/api/ops/reports', OPS, ({ url }) => store.report(url.searchParams.get('days')));
  route('GET', '/api/ops/messages', OPS, ({ url }) => ({ messages: notifier.list({ limit: Math.min(500, Number(url.searchParams.get('limit')) || 200), alertId: url.searchParams.get('alert') }) }));
  route('GET', '/api/ops/devices', SUP, () => ({ devices: store.listDevices().slice(0, 200) }));
  route('POST', '/api/ops/devices/:id/block', SUP, ({ params, body, user }) => ({ device: store.blockDevice(params.id, body.blocked !== false, body.note, user) }));
  route('GET', '/api/ops/audit', SUP, () => ({ audit: store.listAudit(300) }));
  route('POST', '/api/ops/backup', ADMIN, ({ user }) => {
    const name = `code-secours-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
    db.backup(path.join(config.backupDir, name));
    store.audit(user, 'backup', name);
    return { file: name };
  });

  // Plaques & back-office
  route('GET', '/api/ops/plates', OPS, () => ({ plates: store.plates.map(store.adminPlate) }));
  route('GET', '/api/ops/referentiel', OPS, () => ({
    communes: COMMUNES.map((c) => ({ code: c.code, name: c.name, quartiers: c.quartiers.map((q) => ({ code: q.code, name: q.name })) })),
    kinds: PLATE_KINDS, tariffs: TARIFFS, mobileMoney: MOBILE_MONEY, ussdCode: USSD_CODE,
  }));
  route('POST', '/api/admin/plates', ADMIN, ({ body, user }) => ({ status: 201, data: { plate: store.adminPlate(store.createPlate(body, user)) } }));
  route('POST', '/api/admin/plates/:id', ADMIN, ({ params, body, user }) => ({ plate: store.adminPlate(store.updatePlate(params.id, body, user)) }));
  route('POST', '/api/admin/plates/:id/status', ADMIN, ({ params, body, user }) => ({ plate: store.adminPlate(store.setPlateStatus(params.id, body.status, user)) }));
  route('POST', '/api/admin/plates/:id/regenerate', ADMIN, ({ params, user }) => ({ plate: store.adminPlate(store.regenerateToken(params.id, user)) }));
  route('POST', '/api/admin/plates/:id/contacts', ADMIN, ({ params, body, user }) => ({ plate: store.adminPlate(store.setContacts(params.id, body.contacts, user)) }));
  route('POST', '/api/admin/plates/:id/payments', ADMIN, ({ params, body, user }) => ({ status: 201, data: { payment: store.publicPayment(store.startPayment({ ...body, plateId: params.id, via: 'backoffice' }, user)) } }));
  route('GET', '/api/admin/payments', ADMIN, () => ({ payments: store.listPayments(300) }));

  // Espace client (lien privé envoyé par SMS au titulaire)
  const clientPlate = (key) => {
    const p = store.plateByClientKey(key);
    if (!p) throw httpError(404, 'Espace client introuvable');
    return p;
  };
  route('GET', '/api/client/:key', {}, ({ params }) => store.clientView(clientPlate(params.key)));
  route('POST', '/api/client/:key/contacts', {}, ({ params, body }) => {
    const p = clientPlate(params.key);
    store.setContacts(p.id, body.contacts, { name: `${p.owner.name} (espace client)`, role: 'client' });
    return store.clientView(p);
  });
  route('POST', '/api/client/:key/payments', {}, ({ params, body, ip }) => {
    limit(`pay:${ip}`, 5, 60000, 'Trop de tentatives de paiement.');
    const p = clientPlate(params.key);
    return { status: 201, data: { payment: store.publicPayment(store.startPayment({ ...body, plateId: p.id, via: 'client' }, { name: p.owner.name, role: 'client' })) } };
  });
  route('GET', '/api/client/:key/events', {}, ({ req, res, params }) => {
    const p = clientPlate(params.key);
    openStream(req, res, { scope: 'client', plateId: p.id });
    return null;
  });

  // Application terrain des unités
  const myUnit = (user) => {
    const unit = store.unitById(user.unitId);
    if (!unit) throw httpError(404, 'Unité introuvable');
    return unit;
  };
  const missionOf = (unit) => {
    const a = unit.alertId ? store.alertById(unit.alertId) : null;
    if (!a) return null;
    const km = distanceKm(unit, a);
    return { ...store.opsAlert(a), distanceKm: +km.toFixed(2), etaMinutes: etaMinutes(km) };
  };
  route('GET', '/api/terrain/me', AGENT, ({ user }) => {
    const unit = myUnit(user);
    return { user: auth.publicUser(user), unit: store.publicUnit(unit), mission: missionOf(unit) };
  });
  route('POST', '/api/terrain/position', AGENT, ({ body, user }) => ({ unit: store.publicUnit(store.setUnitPosition(user.unitId, body)) }));
  route('POST', '/api/terrain/:action', AGENT, ({ params, body, user }) => {
    const unit = myUnit(user);
    if (!unit.alertId) throw httpError(409, 'Aucune mission en cours');
    const id = unit.alertId;
    if (params.action === 'ack') store.unitAck(unit.id, user);
    else if (params.action === 'onsite') store.onSite(id, user);
    else if (params.action === 'close') store.close(id, body.outcome, user);
    else throw httpError(404, 'Action inconnue');
    return { unit: store.publicUnit(unit), mission: missionOf(unit) };
  });
  route('GET', '/api/terrain/events', AGENT, ({ req, res, user }) => {
    const unit = myUnit(user);
    const c = openStream(req, res, { scope: 'agent', unitId: unit.id, missionId: unit.alertId });
    send(c.res, 'mission', missionOf(unit));
    return null;
  });

  // --- Aiguillage -------------------------------------------------------------------
  const allowed = (opts, user) => {
    if (opts.agent) return user?.role === 'agent';
    if (opts.rank !== undefined) return !!user && auth.ROLES[user.role].rank >= opts.rank;
    return true;
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = decodeURIComponent(url.pathname);
    const user = auth.userFromRequest(req);
    let m;

    if (req.method === 'GET') {
      const page = PAGES[p];
      if (page) {
        if ((page.rank !== undefined || page.agent) && !allowed(page, user)) {
          const target = user?.role === 'agent' ? '/terrain' : user && page.agent ? '/centrale' : `/connexion?next=${encodeURIComponent(p)}`;
          res.writeHead(302, { Location: target });
          return res.end();
        }
        return serveFile(res, publicDir, page.file);
      }
      if (/^\/s\/[A-Za-z0-9]{6,32}$/.test(p)) return serveFile(res, publicDir, 'sos.html');
      if (p === '/client/demo' && demo) {
        res.writeHead(302, { Location: `/client/${store.plates.find((x) => x.code === 'ABJ-YOP-NIANGON-453').clientKey}` });
        return res.end();
      }
      if (/^\/client\/[A-Za-z0-9]{8,40}$/.test(p)) return serveFile(res, publicDir, 'client.html');
      if (p === '/demo') {
        res.writeHead(302, { Location: `/s/${publicConfig().demoToken}` });
        return res.end();
      }
      if ((m = p.match(/^\/qr\/([A-Za-z0-9]{6,32})\.svg$/))) {
        if (!store.plateByToken(m[1])) throw httpError(404, 'Plaque inconnue');
        const svg = await QRCode.toString(`${config.getBaseUrl()}/s/${m[1]}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B1F44', light: '#FFFFFF' } });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
        return res.end(svg);
      }
      if ((m = p.match(/^\/media\/(ALR-\d+-[a-f0-9]{12}\.(jpg|png|webp|webm|ogg|m4a))$/))) {
        if (!allowed(OPS, user)) throw httpError(403, 'Accès réservé à la centrale');
        return serveFile(res, mediaDir, m[1], { 'Cache-Control': 'private, max-age=3600' });
      }
      if (p.startsWith('/vendor/leaflet/')) return serveFile(res, leafletDir, p.slice('/vendor/leaflet/'.length));
      if (/^\/(css|js|img)\//.test(p) || p === '/favicon.svg' || p === '/manifest.webmanifest') return serveFile(res, publicDir, p);
    }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const match = p.match(r.re);
      if (!match) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      if (!allowed(r.opts, user)) throw httpError(user ? 403 : 401, user ? 'Droits insuffisants' : 'Connexion requise');
      let body = {};
      if (req.method === 'POST') {
        // Protection CSRF : les actions authentifiées exigent un corps JSON (impossible depuis un simple formulaire tiers).
        if ((r.opts.rank !== undefined || r.opts.agent) && !String(req.headers['content-type'] ?? '').includes('application/json')) throw httpError(415, 'Content-Type application/json requis');
        body = await readBody(req, r.opts.bodyLimit ?? 32 * 1024);
      }
      const out = await r.fn({ req, res, url, params, user, body, ip: clientIp(req) });
      if (out === null || res.headersSent) return;
      if (out && out.status && out.data) return json(res, out.status, out.data);
      return json(res, 200, out);
    }
    throw httpError(404, 'Introuvable');
  }

  async function handler(req, res) {
    try {
      await handle(req, res);
    } catch (err) {
      const status = err.status ?? 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.end();
      if (req.url.startsWith('/api/')) return json(res, status, { error: status === 500 ? 'Erreur interne' : err.message });
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(status === 404 ? 'Page introuvable' : err.message);
    }
  }

  const removeMediaFile = (file) => unlink(path.join(mediaDir, file)).catch(() => {});

  return { handler, broadcast, clients, removeMediaFile, close: () => clearInterval(heartbeat) };
}
