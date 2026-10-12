import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { createStore, httpError } from './src/store.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const LEAFLET_DIR = path.join(ROOT, 'node_modules', 'leaflet', 'dist');
const PORT = Number(process.env.PORT) || 3000;
// Mode démo : aucun vrai numéro n'est composable depuis la page SOS.
const DEMO = process.env.DEMO !== '0';

function lanAddress() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Docker/i.test(name)) continue;
      candidates.push(a.address);
    }
  }
  return candidates.find((ip) => ip.startsWith('192.168.')) ?? candidates.find((ip) => ip.startsWith('10.')) ?? candidates[0] ?? 'localhost';
}
const BASE_URL = (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');

// --- Temps réel (Server-Sent Events) ---------------------------------------
const clients = new Set();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function emit(type, alert) {
  for (const c of clients) {
    if (c.scope === 'ops') {
      if (type === 'units') send(c.res, 'units', store.units.map(store.publicUnit));
      else if (type === 'reset') send(c.res, 'reset', {});
      else {
        send(c.res, type === 'alert:new' ? 'alert:new' : 'alert', store.opsAlert(alert));
        send(c.res, 'stats', store.stats());
      }
    } else if (c.scope === 'reporter') {
      if (type === 'units') {
        // Rafraîchit l'ETA du témoin pendant le trajet (au plus toutes les 5 s).
        const mine = store.alertById(c.alertId);
        if (mine?.status === 'en_route' && Date.now() - (c.lastEta ?? 0) > 5000) {
          c.lastEta = Date.now();
          send(c.res, 'alert', store.publicAlert(mine));
        }
      } else if (alert && alert.id === c.alertId) {
        send(c.res, 'alert', store.publicAlert(alert));
      }
    }
  }
}

const store = createStore({ emit });
setInterval(() => store.tick(), 1000).unref();
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 20000).unref();

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

// --- Utilitaires HTTP ------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw httpError(413, 'Requête trop volumineuse');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400, 'JSON invalide'); }
}

async function serveFile(res, baseDir, relPath) {
  const filePath = path.normalize(path.join(baseDir, relPath));
  if (!filePath.startsWith(baseDir)) throw httpError(403, 'Accès refusé');
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    throw httpError(404, 'Introuvable');
  }
}

// Anti-abus minimal : N déclenchements par minute et par adresse IP (RATE_LIMIT, 6 par défaut).
const RATE_LIMIT = Number(process.env.RATE_LIMIT) || 6;
const hits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60000);
  if (list.length >= RATE_LIMIT) throw httpError(429, 'Trop de déclenchements. Patientez une minute ou appelez directement les secours.');
  list.push(now);
  hits.set(ip, list);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const fmt = (ts) => (ts ? new Date(ts).toLocaleString('fr-FR') : '');

// --- Routes ----------------------------------------------------------------
const PAGES = { '/': 'index.html', '/centrale': 'centrale.html', '/plaques': 'plaques.html' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = decodeURIComponent(url.pathname);
  const m = (re) => p.match(re);
  let r;

  if (req.method === 'GET') {
    if (PAGES[p]) return serveFile(res, PUBLIC_DIR, PAGES[p]);
    if (m(/^\/s\/[A-Za-z0-9]{6,32}$/)) return serveFile(res, PUBLIC_DIR, 'sos.html');
    if (p === '/demo') {
      const plate = store.plates.find((x) => x.code === 'ABJ-YOP-NIANGON-453');
      res.writeHead(302, { Location: `/s/${plate.token}` });
      return res.end();
    }
    if ((r = m(/^\/qr\/([A-Za-z0-9]{6,32})\.svg$/))) {
      if (!store.plateByToken(r[1])) throw httpError(404, 'Plaque inconnue');
      const svg = await QRCode.toString(`${BASE_URL}/s/${r[1]}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B1F44', light: '#FFFFFF' } });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
      return res.end(svg);
    }
    if (p.startsWith('/vendor/leaflet/')) return serveFile(res, LEAFLET_DIR, p.slice('/vendor/leaflet/'.length));
    if (/^\/(css|js|img)\//.test(p) || p === '/favicon.svg' || p === '/manifest.webmanifest') return serveFile(res, PUBLIC_DIR, p);

    if (p === '/api/config') return json(res, 200, { baseUrl: BASE_URL, demo: DEMO, demoToken: store.plates.find((x) => x.code === 'ABJ-YOP-NIANGON-453').token });

    // Public (page SOS) — n'expose ni titulaire ni contacts.
    if ((r = m(/^\/api\/public\/plates\/([A-Za-z0-9]{6,32})$/))) {
      const plate = store.plateByToken(r[1]);
      if (!plate) throw httpError(404, 'Plaque inconnue');
      return json(res, 200, { plate: store.publicPlate(plate), demo: DEMO });
    }
    if ((r = m(/^\/api\/public\/alerts\/(ALR-\d+)$/))) {
      const a = store.alertById(r[1]);
      if (!a || a.reporterKey !== url.searchParams.get('key')) throw httpError(404, 'Alerte introuvable');
      return json(res, 200, { alert: store.publicAlert(a) });
    }
    if (p === '/api/public/events') {
      const a = store.alertById(url.searchParams.get('alert'));
      if (!a || a.reporterKey !== url.searchParams.get('key')) throw httpError(404, 'Alerte introuvable');
      const c = openStream(req, res, { scope: 'reporter', alertId: a.id });
      return send(c.res, 'alert', store.publicAlert(a));
    }

    // Centrale (prototype : pas encore d'authentification opérateur).
    if (p === '/api/ops/bootstrap') {
      return json(res, 200, {
        alerts: store.alerts.map(store.opsAlert),
        units: store.units.map(store.publicUnit),
        plates: store.plates.map((x) => ({ token: x.token, code: x.code, pass: x.pass, kind: x.kind, label: x.label, commune: x.commune, quartier: x.quartier, lat: x.lat, lng: x.lng, owner: x.owner, contacts: x.contacts, community: x.community, installedAt: x.installedAt, showcase: x.showcase, status: x.status })),
        stats: store.stats(),
        baseUrl: BASE_URL,
      });
    }
    if (p === '/api/ops/events') {
      const c = openStream(req, res, { scope: 'ops' });
      return send(c.res, 'hello', { at: Date.now() });
    }
    if (p === '/api/ops/alerts.csv') {
      const head = ['ID', 'Déclenchée', 'Code plaque', 'Pass', 'Commune', 'Quartier', 'Type', 'Statut', 'Unité', 'Prise en charge (s)', 'Arrivée (min)', 'Clôture', 'Issue'];
      const rows = [...store.alerts].reverse().map((a) => [a.id, fmt(a.createdAt), a.code, a.pass, a.commune, a.quartier, a.type, a.status, a.unitId ?? '',
        a.ackAt ? Math.round((a.ackAt - a.createdAt) / 1000) : '', a.onSiteAt ? Math.round((a.onSiteAt - a.createdAt) / 60000) : '', fmt(a.closedAt), a.outcome ?? '']);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="historique-alertes-code-secours.csv"' });
      return res.end('﻿' + [head, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n'));
    }
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (p === '/api/public/alerts') {
      rateLimit(req.socket.remoteAddress ?? 'unknown');
      const { alert, duplicate } = store.createAlert({ token: String(body.token ?? ''), type: String(body.type ?? '') });
      return json(res, 201, { alert: store.publicAlert(alert), key: alert.reporterKey, duplicate });
    }
    if ((r = m(/^\/api\/public\/alerts\/(ALR-\d+)\/cancel$/))) {
      return json(res, 200, { alert: store.publicAlert(store.cancelByReporter(r[1], String(body.key ?? ''))) });
    }
    if ((r = m(/^\/api\/ops\/alerts\/(ALR-\d+)\/(ack|assign|onsite|close|call|note)$/))) {
      const [, id, action] = r;
      const a = action === 'ack' ? store.ack(id)
        : action === 'assign' ? store.assign(id, String(body.unitId ?? ''))
        : action === 'onsite' ? store.onSite(id)
        : action === 'close' ? store.close(id, body.outcome)
        : action === 'call' ? store.logCall(id, body.target)
        : store.addNote(id, body.text);
      return json(res, 200, { alert: store.opsAlert(a) });
    }
    if (p === '/api/ops/simulate') return json(res, 201, { alert: store.opsAlert(store.simulate(body.type)) });
    if (p === '/api/ops/reset') {
      store.reset();
      emit('reset');
      return json(res, 200, { ok: true });
    }
  }

  throw httpError(404, 'Introuvable');
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return res.end();
    if (req.url.startsWith('/api/')) return json(res, status, { error: err.message });
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(status === 404 ? 'Page introuvable' : err.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const demoToken = store.plates.find((x) => x.code === 'ABJ-YOP-NIANGON-453').token;
  console.log('\n  CODE-SECOURS CI — prototype APSIG (données fictives)\n');
  console.log(`  Accueil         http://localhost:${PORT}/`);
  console.log(`  Centrale        http://localhost:${PORT}/centrale`);
  console.log(`  Plaques         http://localhost:${PORT}/plaques`);
  console.log(`  Page SOS démo   ${BASE_URL}/s/${demoToken}`);
  console.log(`\n  Téléphones (même Wi-Fi) : ${BASE_URL}/demo`);
  console.log(`  Mode démo : ${DEMO ? 'oui (numéros d\'urgence non composables)' : 'non'}\n`);
});
