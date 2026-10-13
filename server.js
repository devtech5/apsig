import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './src/db.js';
import { createAuth } from './src/auth.js';
import { createNotifier } from './src/notify.js';
import { createStore } from './src/store.js';
import { createApp } from './src/app.js';
import { startTunnel } from './src/tunnel.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const env = process.env;
const DEV = args.has('--dev');
// API seule (back-end hébergé séparément du front, ex. front sur Vercel) : Next.js n'est pas chargé.
const API_ONLY = args.has('--api-only') || env.API_ONLY === '1';
env.NODE_ENV ??= DEV ? 'development' : 'production';
const PORT = Number(env.PORT) || 3000;
const DEMO = env.DEMO !== '0'; // mode démo : numéros d'urgence non composables, accès rapide aux comptes
const DATA_DIR = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = env.DB_FILE || path.join(DATA_DIR, 'code-secours.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DAY = 86400000;

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

const lanUrl = `http://${lanAddress()}:${PORT}`;
let tunnelUrl = null;
const getBaseUrl = () => (env.PUBLIC_URL || tunnelUrl || lanUrl).replace(/\/$/, '');

const db = openDb(DB_FILE);
let broadcast = () => {};
const emit = (type, payload) => broadcast(type, payload);
const auth = createAuth({ db });
const notifier = createNotifier({ db, emit });
const store = createStore({
  db, emit, notifier, auth,
  config: {
    baseUrl: getBaseUrl,
    escalation: (env.ESCALATION_SECONDS || '60,120').split(',').map(Number).filter((n) => n > 0),
  },
});
if (args.has('--reset')) store.reset();

// Front-end Next.js servi par le même processus (un seul port : réseau local, tunnel, Docker).
let renderPage = null;
let upgradeNext = null;
if (!API_ONLY) {
  if (!DEV && !existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) {
    console.error('\n  Front-end non compilé : lancez « npm run build » (ou « npm run dev » pour le développement).\n');
    process.exit(1);
  }
  const { default: next } = await import('next');
  const nextApp = next({ dev: DEV, dir: ROOT, hostname: 'localhost', port: PORT });
  await nextApp.prepare();
  renderPage = nextApp.getRequestHandler();
  upgradeNext = nextApp.getUpgradeHandler(); // rechargement à chaud en développement
}

const app = createApp({
  store, auth, notifier, db,
  config: {
    renderPage,
    mediaDir: path.join(DATA_DIR, 'media'),
    backupDir: BACKUP_DIR,
    demo: DEMO,
    rateLimit: Number(env.RATE_LIMIT) || 6,
    trustProxy: env.TRUST_PROXY === '1', // derrière le proxy d'un hébergeur (Render…) : lire l'adresse du visiteur
    lanUrl,
    getBaseUrl,
    getTunnelUrl: () => tunnelUrl,
  },
});
broadcast = app.broadcast;

// Boucle de simulation (déplacements, escalades) + maintenance quotidienne.
setInterval(() => store.tick(), 1000).unref();

function dailyMaintenance() {
  store.applyRetention({
    alertDays: Number(env.RETENTION_DAYS) || 365,
    mediaDays: Number(env.MEDIA_RETENTION_DAYS) || 90,
    removeFile: app.removeMediaFile,
  });
  try {
    db.backup(path.join(BACKUP_DIR, `auto-${new Date().toISOString().slice(0, 10)}.db`));
    const autos = readdirSync(BACKUP_DIR).filter((f) => f.startsWith('auto-')).sort();
    for (const f of autos.slice(0, -7)) rmSync(path.join(BACKUP_DIR, f), { force: true });
  } catch (err) {
    console.error('Sauvegarde automatique impossible :', err.message);
  }
}
setTimeout(dailyMaintenance, 60000).unref();
setInterval(dailyMaintenance, DAY).unref();

const server = http.createServer(app.handler);
if (upgradeNext) server.on('upgrade', (req, socket, head) => upgradeNext(req, socket, head));
server.listen(PORT, '0.0.0.0', () => {
  const demoToken = store.plates.find((x) => x.code === 'ABJ-YOP-NIANGON-453').token;
  console.log('\n  CODE-SECOURS CI — prototype APSIG v0.3 (données fictives)\n');
  console.log(`  Accueil          http://localhost:${PORT}/`);
  console.log(`  Centrale         http://localhost:${PORT}/centrale`);
  console.log(`  Plaques          http://localhost:${PORT}/plaques`);
  console.log(`  Terrain (unités) http://localhost:${PORT}/terrain`);
  console.log(`  USSD / SMS       http://localhost:${PORT}/ussd`);
  console.log(`  Page SOS démo    ${getBaseUrl()}/s/${demoToken}`);
  console.log(`\n  Réseau local     ${lanUrl}/demo`);
  console.log(`  Base de données  ${DB_FILE}`);
  console.log(`  Mode démo        ${DEMO ? 'oui (accès rapide, numéros non composables)' : 'non'}\n`);

  if (args.has('--tunnel') || env.TUNNEL === '1') {
    console.log('  Ouverture du tunnel HTTPS…');
    startTunnel({
      port: PORT,
      onUrl: (url) => {
        tunnelUrl = url;
        if (url) console.log(`\n  ✔ Tunnel HTTPS actif : ${url}\n    Les QR codes pointent désormais vers ${url}/s/…\n`);
        broadcast('config');
      },
    });
  }
});

function shutdown() {
  server.close();
  app.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
