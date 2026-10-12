// Sauvegarde à chaud de la base SQLite : npm run backup
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'code-secours.db');
const target = path.join(DATA_DIR, 'backups', `manuel-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`);

const db = openDb(DB_FILE);
db.backup(target);
db.close();
console.log(`Sauvegarde créée : ${target}`);
