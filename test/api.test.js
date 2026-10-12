import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { createAuth } from '../src/auth.js';
import { createNotifier } from '../src/notify.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD } from '../src/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server;
let base;
let store;

before(async () => {
  const db = openDb(':memory:');
  let broadcast = () => {};
  const emit = (t, p) => broadcast(t, p);
  const auth = createAuth({ db });
  const notifier = createNotifier({ db, emit, driver: 'instant' });
  store = createStore({ db, emit, notifier, auth, config: { paymentDelayMs: 5 } });
  const app = createApp({
    store, auth, notifier, db,
    config: {
      publicDir: path.join(ROOT, 'public'), leafletDir: path.join(ROOT, 'node_modules', 'leaflet', 'dist'),
      mediaDir: path.join(os.tmpdir(), `cs-media-${process.pid}`), backupDir: path.join(os.tmpdir(), `cs-backup-${process.pid}`),
      demo: true, rateLimit: 6, lanUrl: 'http://lan', getBaseUrl: () => 'http://test', getTunnelUrl: () => null,
    },
  });
  broadcast = app.broadcast;
  server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

async function call(method, url, { body, cookie, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}
async function login(username, password) {
  const r = await call('POST', '/api/auth/login', { body: { username, password } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.headers.get('set-cookie').split(';')[0];
}

describe('Public', () => {
  test('santé et configuration', async () => {
    const h = await call('GET', '/api/health');
    assert.equal(h.status, 200);
    assert.equal(h.data.db, 'ok');
    const c = await call('GET', '/api/config');
    assert.ok(c.data.demoToken);
  });

  test('pages protégées : redirection vers la connexion', async () => {
    const r = await call('GET', '/centrale');
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location'), /^\/connexion/);
    assert.equal((await call('GET', '/api/ops/bootstrap')).status, 401);
  });

  test('page SOS : plaque publique sans données personnelles', async () => {
    const token = store.plates[0].token;
    const r = await call('GET', `/api/public/plates/${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.plate.code, 'ABJ-YOP-NIANGON-453');
    assert.equal(r.data.plate.owner, undefined);
    assert.equal(r.data.plate.ussd, '*789*10001#');
    assert.equal((await call('GET', '/qr/' + token + '.svg')).status, 200);
  });

  test('alerte : création, position du témoin, message texte, anti-abus', async () => {
    const token = store.plates[30].token;
    const r = await call('POST', '/api/public/alerts', { body: { token, type: 'medical', deviceId: 'd-api' }, headers: { 'X-Forwarded-For': '10.0.0.9' } });
    assert.equal(r.status, 201);
    const { alert, key } = r.data;
    const loc = await call('POST', `/api/public/alerts/${alert.id}/location`, { body: { key, lat: store.plates[30].lat, lng: store.plates[30].lng, accuracy: 12 } });
    assert.equal(loc.data.alert.witnessLocated, true);
    const txt = await call('POST', `/api/public/alerts/${alert.id}/media`, { body: { key, kind: 'text', text: 'Il respire mal' } });
    assert.equal(txt.data.alert.mediaCount, 1);
    const bad = await call('POST', `/api/public/alerts/${alert.id}/media`, { body: { key, kind: 'photo', data: Buffer.from('pas une image').toString('base64') } });
    assert.equal(bad.status, 415);
    let last;
    for (let i = 0; i < 7; i++) last = await call('POST', '/api/public/alerts', { body: { token, type: 'medical' } });
    assert.equal(last.status, 429);
  });
});

describe('Temps réel en long polling (repli derrière un proxy)', () => {
  test('évènements initiaux puis attente jusqu\'au changement suivant', async () => {
    const r = await call('POST', '/api/public/alerts', { body: { token: store.plates[60].token, type: 'medical' }, headers: { 'X-Forwarded-For': '10.0.0.77' } });
    const { alert, key } = r.data;
    const url = `/api/public/events?alert=${alert.id}&key=${key}&transport=poll&cid=testcid0001`;
    const first = await call('GET', url);
    assert.deepEqual(first.data.events.map((e) => e.event), ['hello', 'alert']);
    const pending = call('GET', url);
    await new Promise((res) => setTimeout(res, 100));
    await call('POST', `/api/public/alerts/${alert.id}/cancel`, { body: { key } });
    const second = await pending;
    const last = second.data.events.at(-1);
    assert.equal(last.event, 'alert');
    assert.equal(last.data.status, 'annulee');
  });
});

describe('USSD & SMS', () => {
  test('session USSD complète', async () => {
    const form = async (text) => {
      const res = await fetch(`${base}/api/ussd`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ sessionId: 's1', phoneNumber: '+2250700112233', serviceCode: '*789#', text }) });
      return res.text();
    };
    assert.match(await form(''), /^CON .*code/s);
    assert.match(await form('10002'), /^CON ABJ-COC-RIVIERA-118/);
    assert.match(await form('10002*3'), /^END Alerte transmise/);
    assert.match(await form('99999'), /^END Code inconnu/);
  });

  test('SMS entrant « SOS 10006 2 »', async () => {
    const r = await call('POST', '/api/sms/inbound', { body: { from: '+2250700998877', text: 'sos 10006 2' } });
    assert.match(r.data.reply, /alerte ALR-\d+ transmise/);
    assert.equal(store.alertById(r.data.alertId).type, 'medical');
  });
});

describe('Centrale & droits', () => {
  test('opérateur : supervision et action, mais pas de réinitialisation', async () => {
    const cookie = await login('operateur', DEMO_PASSWORD.operateur);
    const boot = await call('GET', '/api/ops/bootstrap', { cookie });
    assert.equal(boot.status, 200);
    assert.equal(boot.data.me.role, 'operateur');
    const open = boot.data.alerts.find((a) => a.status === 'en_route');
    assert.ok(open);
    const sim = await call('POST', '/api/ops/simulate', { cookie, body: { type: 'incendie' } });
    assert.equal(sim.status, 201);
    const ack = await call('POST', `/api/ops/alerts/${sim.data.alert.id}/ack`, { cookie, body: {} });
    assert.equal(ack.data.alert.status, 'prise_en_charge');
    assert.equal((await call('POST', '/api/ops/reset', { cookie, body: {} })).status, 403);
    assert.equal((await call('GET', '/api/ops/audit', { cookie })).status, 403);
    const csrf = await fetch(`${base}/api/ops/alerts/${sim.data.alert.id}/note`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: 'text=x' });
    assert.equal(csrf.status, 415, 'POST sans JSON refusé (CSRF)');
  });

  test('mauvais mot de passe refusé', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'faux' } });
    assert.equal(r.status, 401);
  });

  test('admin : création de plaque et paiement Mobile Money', async () => {
    const cookie = await login('admin', DEMO_PASSWORD.admin);
    const created = await call('POST', '/api/admin/plates', { cookie, body: { communeCode: 'YOP', quartierCode: 'SELMER', pass: 'bleu', kind: 'Commerce', label: 'Boutique test', ownerName: 'Client API', ownerPhone: '+225 07 00 12 34 56' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const pay = await call('POST', `/api/admin/plates/${created.data.plate.id}/payments`, { cookie, body: { operator: 'Orange Money', phone: '+225 07 00 12 34 56', months: 12 } });
    assert.equal(pay.status, 201);
    assert.equal(pay.data.payment.amount, 27000);
    assert.equal((await call('GET', '/api/ops/audit', { cookie })).status, 200);
  });

  test('agent terrain : mission visible uniquement pour son unité', async () => {
    const cookie = await login('agent.rouge1', DEMO_PASSWORD.agent);
    const me = await call('GET', '/api/terrain/me', { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.data.unit.id, 'APS-ROUGE1');
    assert.ok(me.data.mission, 'Rouge 1 est en mission au démarrage');
    assert.equal((await call('GET', '/api/ops/bootstrap', { cookie })).status, 403);
    const ack = await call('POST', '/api/terrain/ack', { cookie, body: {} });
    assert.equal(ack.status, 200);
    assert.ok(ack.data.mission.unitAckAt);
  });

  test('espace client : contacts et suivi', async () => {
    const plate = store.plates[0];
    const view = await call('GET', `/api/client/${plate.clientKey}`);
    assert.equal(view.status, 200);
    assert.equal(view.data.plate.code, plate.code);
    const upd = await call('POST', `/api/client/${plate.clientKey}/contacts`, { body: { contacts: [{ name: 'Yao Koffi', relation: 'Frère', phone: '+225 07 00 44 55 66' }] } });
    assert.equal(upd.data.plate.contacts.length, 1);
    assert.equal((await call('GET', '/api/client/inexistant1234')).status, 404);
  });
});
