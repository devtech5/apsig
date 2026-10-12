import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Persistance documentaire minimale sur SQLite (inclus dans Node, aucune dépendance).
// Chaque entité est stockée en JSON dans `docs` ; les clés commençant par « _ » (état d'exécution) sont ignorées.
// Migration prévue vers PostgreSQL + PostGIS : voir docs/ARCHITECTURE.md.
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const qAll = db.prepare('SELECT data FROM docs WHERE collection = ?');
  const qPut = db.prepare(`INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  const qDel = db.prepare('DELETE FROM docs WHERE collection = ? AND id = ?');
  const qClear = db.prepare('DELETE FROM docs WHERE collection = ?');
  const qMetaGet = db.prepare('SELECT value FROM meta WHERE key = ?');
  const qMetaSet = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

  const serialize = (obj) => JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v));
  let depth = 0;
  function transaction(fn) {
    if (depth > 0) return fn();
    depth += 1;
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      depth -= 1;
    }
  }

  return {
    file,
    all: (collection) => qAll.all(collection).map((r) => JSON.parse(r.data)),
    put: (collection, obj) => { qPut.run(collection, obj.id, serialize(obj), Date.now()); },
    remove: (collection, id) => { qDel.run(collection, id); },
    replaceAll(collection, list) {
      transaction(() => {
        qClear.run(collection);
        for (const obj of list) qPut.run(collection, obj.id, serialize(obj), Date.now());
      });
    },
    meta: {
      get(key) { const r = qMetaGet.get(key); return r ? JSON.parse(r.value) : null; },
      set(key, value) { qMetaSet.run(key, JSON.stringify(value)); },
    },
    transaction,
    backup(target) {
      mkdirSync(path.dirname(target), { recursive: true });
      db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    },
    ping() { return db.prepare('SELECT 1 AS ok').get().ok === 1; },
    close: () => db.close(),
  };
}
