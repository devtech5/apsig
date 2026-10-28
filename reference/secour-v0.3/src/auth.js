import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DEMO_USERS, DEMO_PASSWORD } from './seed.js';

export const ROLES = {
  agent: { label: 'Agent terrain', rank: 0 },
  operateur: { label: 'Opérateur', rank: 1 },
  superviseur: { label: 'Superviseur', rank: 2 },
  admin: { label: 'Administrateur', rank: 3 },
};

const SESSION_TTL = 12 * 3600 * 1000;
export const COOKIE = 'cs_session';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') };
}

export function verifyPassword(password, user) {
  if (!user?.salt || !user?.hash) return false;
  const candidate = scryptSync(String(password), user.salt, 32);
  const ref = Buffer.from(user.hash, 'hex');
  return ref.length === candidate.length && timingSafeEqual(candidate, ref);
}

export function createAuth({ db }) {
  let users = db.all('users');
  if (!users.length) {
    users = DEMO_USERS.map((u) => ({ ...u, ...hashPassword(DEMO_PASSWORD[u.role]), createdAt: Date.now() }));
    db.replaceAll('users', users);
  }
  const sessions = new Map();

  const publicUser = (u) => u && ({ id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLES[u.role].label, rank: ROLES[u.role].rank, unitId: u.unitId ?? null });

  function openSession(user) {
    const token = randomBytes(24).toString('hex');
    sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_TTL });
    return token;
  }

  return {
    ROLES,
    publicUser,
    get users() { return users; },
    userById: (id) => users.find((u) => u.id === id),
    usersByRole: (role) => users.filter((u) => u.role === role),
    login(username, password) {
      const user = users.find((u) => u.username === String(username).trim().toLowerCase());
      // Toujours calculer un hachage pour ne pas révéler l'existence du compte par le temps de réponse.
      const ok = verifyPassword(password, user ?? { salt: 'x', hash: '00'.repeat(32) });
      if (!user || !ok) return null;
      return { token: openSession(user), user };
    },
    loginAs(username) {
      const user = users.find((u) => u.username === username);
      return user ? { token: openSession(user), user } : null;
    },
    logout(token) { sessions.delete(token); },
    userFromRequest(req) {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      const s = token && sessions.get(token);
      if (!s) return null;
      if (s.expires < Date.now()) { sessions.delete(token); return null; }
      s.expires = Date.now() + SESSION_TTL;
      return users.find((u) => u.id === s.userId) ?? null;
    },
    tokenFromRequest: (req) => parseCookies(req.headers.cookie)[COOKIE],
    demoAccounts: () => users.map((u) => ({ username: u.username, name: u.name, role: u.role, roleLabel: ROLES[u.role].label, unitId: u.unitId ?? null })),
  };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure = false, clear = false } = {}) {
  return [
    `${COOKIE}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${SESSION_TTL / 1000}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}
