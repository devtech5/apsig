import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { openDb } from '../src/db.js';
import { createAuth, verifyPassword } from '../src/auth.js';
import { createNotifier } from '../src/notify.js';
import { createStore } from '../src/store.js';
import { DEMO_PASSWORD } from '../src/seed.js';

function setup({ file = ':memory:', config = {} } = {}) {
  const db = openDb(file);
  const events = [];
  const emit = (type, payload) => events.push([type, payload]);
  const auth = createAuth({ db });
  const notifier = createNotifier({ db, emit, driver: 'instant' });
  const store = createStore({ db, emit, notifier, auth, config: { paymentDelayMs: 5, ...config } });
  const op = auth.users.find((u) => u.role === 'operateur');
  return { db, store, auth, notifier, events, op };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Jeu de données', () => {
  test('184 plaques, 30 jours d\'historique, 2 interventions en cours', () => {
    const { store } = setup();
    assert.equal(store.plates.length, 184);
    assert.ok(store.alerts.length > 600);
    assert.equal(store.stats().ongoing, 2);
    assert.equal(store.plates[0].code, 'ABJ-YOP-NIANGON-453');
    assert.equal(store.plates[0].shortCode, '10001');
    assert.equal(new Set(store.plates.map((p) => p.shortCode)).size, 184, 'codes USSD uniques');
  });
});

describe('Alertes', () => {
  let ctx;
  before(() => { ctx = setup(); });

  test('routage : agression sur Pass Rouge → équipe armée + police 170', () => {
    const plate = ctx.store.plates.find((p) => p.pass === 'rouge' && p.status === 'active');
    const { alert } = ctx.store.createAlert({ token: plate.token, type: 'agression' });
    const actors = alert.notified.map((n) => `${n.actor}|${n.target}`);
    assert.ok(actors.some((a) => a.startsWith("Équipe d'intervention armée")));
    assert.ok(actors.includes('Police secours|170'));
    assert.equal(alert.priority, 'critique');
    assert.equal(alert.callback.status, 'en_attente');
  });

  test('routage : malaise → SAMU 185, priorité haute', () => {
    const plate = ctx.store.plates.find((p) => p.pass === 'bleu' && p.code !== 'ABJ-YOP-NIANGON-453');
    const { alert } = ctx.store.createAlert({ token: plate.token, type: 'medical' });
    assert.ok(alert.notified.some((n) => n.target === '185'));
    assert.equal(alert.priority, 'haute');
  });

  test('anti-doublon : même plaque et même type regroupés', () => {
    const plate = ctx.store.plates[5];
    const first = ctx.store.createAlert({ token: plate.token, type: 'incendie' });
    const second = ctx.store.createAlert({ token: plate.token, type: 'incendie' });
    assert.equal(second.duplicate, true);
    assert.equal(second.alert.id, first.alert.id);
    assert.equal(second.alert.retriggers, 1);
  });

  test('type inconnu refusé, plaque inconnue 404', () => {
    assert.throws(() => ctx.store.createAlert({ token: ctx.store.plates[0].token, type: 'autre' }), { status: 400 });
    assert.throws(() => ctx.store.createAlert({ token: 'inexistant00', type: 'medical' }), { status: 404 });
  });

  test('annulation : clé du témoin obligatoire', () => {
    const { alert } = ctx.store.createAlert({ token: ctx.store.plates[7].token, type: 'medical' });
    assert.throws(() => ctx.store.cancelByReporter(alert.id, 'mauvaise'), { status: 403 });
    ctx.store.cancelByReporter(alert.id, alert.reporterKey);
    assert.equal(alert.status, 'annulee');
  });

  test('cycle complet : prise en charge → affectation → sur place → clôture', () => {
    const { alert } = ctx.store.createAlert({ token: ctx.store.plates[8].token, type: 'agression' });
    ctx.store.ack(alert.id, ctx.op);
    assert.equal(alert.status, 'prise_en_charge');
    const unit = ctx.store.units.find((u) => u.status === 'disponible');
    ctx.store.assign(alert.id, unit.id, ctx.op);
    assert.equal(alert.status, 'en_route');
    assert.equal(unit.status, 'en_mission');
    const other = ctx.store.createAlert({ token: ctx.store.plates[9].token, type: 'medical' }).alert;
    assert.throws(() => ctx.store.assign(other.id, unit.id, ctx.op), { status: 409 }, 'unité déjà en mission');
    ctx.store.onSite(alert.id, ctx.op);
    assert.equal(alert.status, 'sur_place');
    ctx.store.close(alert.id, 'Intervention réussie', ctx.op);
    assert.equal(alert.status, 'cloturee');
    assert.equal(unit.status, 'disponible');
    assert.ok(alert.timeline.some((t) => t.text.includes(ctx.op.name)), 'nom de l\'opérateur tracé');
  });

  test('GPS réel de l\'unité : arrivée détectée à moins de 80 m', () => {
    const { alert } = ctx.store.createAlert({ token: ctx.store.plates[10].token, type: 'medical' });
    const unit = ctx.store.units.find((u) => u.status === 'disponible');
    ctx.store.assign(alert.id, unit.id, ctx.op);
    ctx.store.setUnitPosition(unit.id, { lat: alert.lat + 0.01, lng: alert.lng, accuracy: 10 });
    assert.equal(alert.status, 'en_route');
    ctx.store.setUnitPosition(unit.id, { lat: alert.lat + 0.0003, lng: alert.lng, accuracy: 10 });
    assert.equal(alert.status, 'sur_place');
  });
});

describe('Escalade', () => {
  test('N1 après 60 s, N2 après 120 s sans prise en charge', () => {
    const { store, notifier } = setup();
    const { alert } = store.createAlert({ token: store.plates[20].token, type: 'agression' });
    alert.createdAt -= 61000;
    store.tick();
    assert.equal(alert.escalation.level, 1);
    assert.ok(notifier.list().some((m) => m.text.startsWith('[ESCALADE N1]')));
    alert.createdAt -= 60000;
    store.tick();
    assert.equal(alert.escalation.level, 2);
    assert.ok(notifier.list().some((m) => m.text.startsWith('[ESCALADE N2]')));
  });
});

describe('Fiabilité', () => {
  test('témoin proche → score élevé ; éloigné → score bas', () => {
    const { store } = setup();
    const p1 = store.plates[11];
    const near = store.createAlert({ token: p1.token, type: 'medical' }).alert;
    store.setWitnessLocation(near.id, near.reporterKey, { lat: p1.lat + 0.0002, lng: p1.lng, accuracy: 15 });
    assert.ok(near.trust.score >= 80, `score ${near.trust.score}`);
    const p2 = store.plates[12];
    const far = store.createAlert({ token: p2.token, type: 'medical' }).alert;
    store.setWitnessLocation(far.id, far.reporterKey, { lat: p2.lat + 0.1, lng: p2.lng, accuracy: 15 });
    assert.ok(far.trust.score < 40, `score ${far.trust.score}`);
  });

  test('appareil bloqué : alerte acceptée mais fiabilité faible', () => {
    const { store, auth } = setup();
    const sup = auth.users.find((u) => u.role === 'superviseur');
    store.blockDevice('d-7f3az9qk', true, 'Fausses alertes répétées', sup);
    const { alert } = store.createAlert({ token: store.plates[2].token, type: 'agression', deviceId: 'd-7f3az9qk' });
    assert.equal(alert.status, 'nouvelle');
    assert.ok(alert.trust.score < 20, `score ${alert.trust.score}`);
    assert.ok(alert.trust.reasons.some((r) => r.text.includes('bloqué')));
  });

  test('rappel titulaire « confirmé » augmente le score', () => {
    const { store, op } = setup();
    const { alert } = store.createAlert({ token: store.plates[4].token, type: 'medical' });
    const before = alert.trust.score;
    store.setCallback(alert.id, 'confirme', op);
    assert.equal(alert.trust.score, before + 30);
  });
});

describe('Plaques & abonnements', () => {
  test('création, code unique, régénération du QR (ancien révoqué)', () => {
    const { store, op } = setup();
    const p = store.createPlate({ communeCode: 'COC', quartierCode: 'RIVIERA', number: 901, pass: 'rouge', kind: 'Domicile', label: 'Villa test', ownerName: 'Client Test', ownerPhone: '+225 07 00 00 00 01' }, op);
    assert.equal(p.code, 'ABJ-COC-RIVIERA-901');
    assert.throws(() => store.createPlate({ communeCode: 'COC', quartierCode: 'RIVIERA', number: 901, label: 'x', ownerName: 'y', ownerPhone: '+225 07 00 00 00 02' }, op), { status: 409 });
    const old = p.token;
    store.regenerateToken(p.id, op);
    assert.notEqual(p.token, old);
    assert.throws(() => store.createAlert({ token: old, type: 'medical' }), { status: 410 });
    store.setPlateStatus(p.id, 'inactive', op);
    assert.throws(() => store.createAlert({ token: p.token, type: 'medical' }), { status: 403 });
  });

  test('contacts : validation des numéros, 5 maximum', () => {
    const { store, op } = setup();
    const p = store.plates[0];
    assert.throws(() => store.setContacts(p.id, [{ name: 'A', phone: 'abc' }], op), { status: 400 });
    assert.throws(() => store.setContacts(p.id, Array(6).fill({ name: 'A', phone: '+225 07 00 00 00 01' }), op), { status: 400 });
    store.setContacts(p.id, [{ name: 'Awa Koné', relation: 'Sœur', phone: '+225 07 00 00 00 09' }], op);
    assert.equal(p.contacts.length, 1);
  });

  test('Mobile Money : succès prolonge l\'abonnement, numéro en 0000 échoue', async () => {
    const { store, op } = setup();
    const p = store.plates[1];
    const before = p.subscription.expiresAt;
    const ok = store.startPayment({ plateId: p.id, operator: 'Wave', phone: '+225 07 00 11 22 33', months: 3 }, op);
    assert.equal(ok.status, 'en_attente');
    assert.equal(ok.amount, 30000);
    await wait(30);
    assert.equal(ok.status, 'réussi');
    assert.ok(p.subscription.expiresAt >= before + 89 * 86400000);
    const ko = store.startPayment({ plateId: p.id, operator: 'Orange Money', phone: '+225 07 00 00 00 00', months: 1 }, op);
    await wait(30);
    assert.equal(ko.status, 'échec');
  });
});

describe('Persistance', () => {
  test('les alertes survivent à un redémarrage', async () => {
    const file = path.join(os.tmpdir(), `code-secours-test-${process.pid}.db`);
    try {
      const a = setup({ file });
      const { alert } = a.store.createAlert({ token: a.store.plates[0].token, type: 'incendie' });
      await wait(30); // laisse les accusés de réception asynchrones s'écrire
      a.db.close();
      const b = setup({ file });
      const reloaded = b.store.alertById(alert.id);
      assert.ok(reloaded, 'alerte rechargée');
      assert.equal(reloaded.type, 'incendie');
      b.db.close();
    } finally {
      for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
    }
  });
});

describe('Authentification & conservation', () => {
  test('mots de passe hachés, vérification correcte', () => {
    const { auth } = setup();
    const admin = auth.users.find((u) => u.role === 'admin');
    assert.ok(!('password' in admin));
    assert.ok(verifyPassword(DEMO_PASSWORD.admin, admin));
    assert.equal(auth.login('admin', 'mauvais'), null);
    assert.ok(auth.login('ADMIN ', DEMO_PASSWORD.admin));
  });

  test('anonymisation des alertes anciennes', () => {
    const { store } = setup();
    const res = store.applyRetention({ alertDays: 10, mediaDays: 5 });
    assert.ok(res.anonymized > 0);
    const old = store.alerts.find((a) => Date.now() - a.createdAt > 11 * 86400000);
    assert.equal(old.deviceId, null);
  });
});
