// Utilitaires partagés : icônes, libellés, formats, appels API, composant plaque.

const PATHS = {
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  shieldAlert: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  volumeOff: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  keypad: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

export const TYPE_META = {
  agression: { label: 'Agression / Intrusion', short: 'Agression', icon: 'shieldAlert' },
  medical: { label: 'Maladie / Accident', short: 'Médical', icon: 'cross' },
  incendie: { label: 'Incendie', short: 'Incendie', icon: 'flame' },
};

export const STATUS_META = {
  nouvelle: { label: 'Nouvelle', cls: 'new' },
  prise_en_charge: { label: 'Prise en charge', cls: 'ack' },
  en_route: { label: 'Équipe en route', cls: 'route' },
  sur_place: { label: 'Sur place', cls: 'onsite' },
  cloturee: { label: 'Clôturée', cls: 'closed' },
  annulee: { label: 'Annulée', cls: 'cancelled' },
};
export const OPEN_STATUSES = ['nouvelle', 'prise_en_charge', 'en_route', 'sur_place'];

export const CALLBACK_META = {
  en_attente: { label: 'Rappel du titulaire en cours', short: 'Rappel en cours', cls: 'warning' },
  confirme: { label: 'Titulaire joint : urgence confirmée', short: 'Urgence confirmée', cls: 'success' },
  en_securite: { label: 'Titulaire joint : en sécurité', short: 'Titulaire en sécurité', cls: '' },
  injoignable: { label: 'Titulaire injoignable', short: 'Injoignable', cls: 'warning' },
  fausse_alerte: { label: 'Titulaire : fausse alerte', short: 'Fausse alerte', cls: 'agression' },
};
export const TRUST_META = {
  elevee: { label: 'Fiabilité élevée', cls: 'success' },
  moyenne: { label: 'Fiabilité moyenne', cls: 'warning' },
  faible: { label: 'Fiabilité faible', cls: 'agression' },
};
export const SOURCE_LABEL = { qr: 'QR code', ussd: 'USSD', sms: 'SMS', demo: 'Simulation' };

export const fmtMoney = (n) => `${Number(n).toLocaleString('fr-FR')} FCFA`;

export async function currentUser() {
  try { return (await api('/api/auth/me')).user; } catch { return null; }
}

export async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } finally { location.href = '/connexion'; }
}

// Synthèse vocale du navigateur (annonces de la centrale, consignes de la page SOS).
export function speak(text, lang = 'fr-FR') {
  try {
    if (!('speechSynthesis' in window)) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

// Connexion temps réel : Server-Sent Events, avec repli automatique en long polling
// si aucune donnée n'arrive en 5 s (proxy ou tunnel qui met le flux en tampon).
// `handlers` reçoit des objets { data } comme avec EventSource.
export function live(url, handlers, { onOpen, onError } = {}) {
  let closed = false;
  let received = false;
  let es = null;
  const cid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const fire = (event, data) => {
    received = true;
    handlers[event]?.({ data });
  };

  async function poll() {
    const sep = url.includes('?') ? '&' : '?';
    let failures = 0;
    let announced = false;
    while (!closed) {
      try {
        const res = await fetch(`${url}${sep}transport=poll&cid=${cid}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const { events } = await res.json();
        if (!announced || failures) onOpen?.();
        announced = true;
        failures = 0;
        for (const e of events) if (!closed) fire(e.event, JSON.stringify(e.data));
      } catch {
        failures += 1;
        onError?.();
        await new Promise((r) => setTimeout(r, Math.min(5000, 800 * failures)));
      }
    }
  }

  es = new EventSource(url);
  es.addEventListener('open', () => onOpen?.());
  es.addEventListener('error', () => { if (!closed) onError?.(); });
  es.addEventListener('hello', () => { received = true; });
  for (const name of Object.keys(handlers)) es.addEventListener(name, (e) => fire(name, e.data));
  setTimeout(() => {
    if (!received && !closed) {
      es.close();
      es = null;
      poll();
    }
  }, 5000);

  return {
    close() { closed = true; es?.close(); },
    get transport() { return es ? 'sse' : 'poll'; },
  };
}

// Identifiant pseudonyme de l'appareil du témoin (lutte contre les abus, aucune donnée personnelle).
export function deviceId() {
  const store = storage('local');
  let id = store.get('cs-device');
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    id = `d-${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8)}`;
    store.set('cs-device', id);
  }
  return id;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const fmtTimeSec = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateShort = (ts) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });

export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h ${String(m % 60).padStart(2, '0')}`;
  return `le ${fmtDate(ts)}`;
}

export function chrono(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export function plateHTML(plate, { qr = true } = {}) {
  const premium = plate.pass === 'rouge';
  return `
    <div class="plate plate--${premium ? 'rouge' : 'bleu'}" style="--chars:${plate.code.length}" role="img" aria-label="Plaque ${esc(plate.code)} — Pass ${premium ? 'Rouge Premium' : 'Bleu'}">
      <div class="plate__head">CODE-SECOURS CI${premium ? ' PREMIUM' : ''}</div>
      <div class="plate__code">${esc(plate.code)}</div>
      ${plate.shortCode ? `<div class="plate__ussd">Sans Internet : *789*${esc(plate.shortCode)}#</div>` : ''}
      <div class="plate__foot">
        <div class="plate__qr">${qr ? `<img src="/qr/${esc(plate.token)}.svg" alt="" loading="lazy">` : ''}</div>
        <div class="plate__brand">
          <div><strong>APSIG</strong><span>${premium ? 'Sécurité armée' : 'SOS Secours'}</span></div>
          <img src="/img/logo-apsig.svg" alt="">
        </div>
      </div>
    </div>`;
}

export function toast(message, kind = '') {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind ? `toast--${kind}` : ''}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), 4200);
}

export function storage(kind = 'session') {
  const s = () => (kind === 'session' ? window.sessionStorage : window.localStorage);
  return {
    get(key) { try { return JSON.parse(s().getItem(key)); } catch { return null; } },
    set(key, value) { try { s().setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ } },
    remove(key) { try { s().removeItem(key); } catch { /* stockage indisponible */ } },
  };
}
