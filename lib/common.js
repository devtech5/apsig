// Utilitaires partagés côté navigateur : libellés, formats, appels API, temps réel, stockage.

export const TYPE_META = {
  agression: { label: 'Agression / Intrusion', short: 'Agression', icon: 'shieldAlert' },
  medical: { label: 'Maladie / Accident', short: 'Médical', icon: 'cross' },
  incendie: { label: 'Incendie', short: 'Incendie', icon: 'flame' },
};

export const STATUS_META = {
  nouvelle: { label: 'Nouvelle', tone: 'danger' },
  prise_en_charge: { label: 'Prise en charge', tone: 'warning' },
  en_route: { label: 'Équipe en route', tone: 'info' },
  sur_place: { label: 'Sur place', tone: 'violet' },
  cloturee: { label: 'Clôturée', tone: 'success' },
  annulee: { label: 'Annulée', tone: 'neutral' },
};
export const OPEN_STATUSES = ['nouvelle', 'prise_en_charge', 'en_route', 'sur_place'];
export const isOpen = (a) => OPEN_STATUSES.includes(a.status);

export const CALLBACK_META = {
  en_attente: { label: 'Rappel du titulaire en cours', short: 'Rappel en cours', tone: 'warning' },
  confirme: { label: 'Titulaire joint : urgence confirmée', short: 'Urgence confirmée', tone: 'success' },
  en_securite: { label: 'Titulaire joint : en sécurité', short: 'Titulaire en sécurité', tone: 'neutral' },
  injoignable: { label: 'Titulaire injoignable', short: 'Injoignable', tone: 'warning' },
  fausse_alerte: { label: 'Titulaire : fausse alerte', short: 'Fausse alerte', tone: 'danger' },
};
export const TRUST_META = {
  elevee: { label: 'Fiabilité élevée', tone: 'success' },
  moyenne: { label: 'Fiabilité moyenne', tone: 'warning' },
  faible: { label: 'Fiabilité faible', tone: 'danger' },
};
export const SOURCE_LABEL = { qr: 'QR code', ussd: 'USSD', sms: 'SMS', demo: 'Simulation' };

export const fmtMoney = (n) => `${Number(n).toLocaleString('fr-FR')} FCFA`;
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const fmtTimeSec = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateShort = (ts) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const etaMinutes = (km) => Math.max(3, Math.round((km / 22) * 60) + 2);

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function chrono(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Erreur ${res.status}`, res.status);
  return data;
}

export async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/connexion'; }
}

// Synthèse vocale du navigateur (annonces de la centrale, consignes de la page SOS).
export function speak(text, lang = 'fr-FR') {
  try {
    if (!('speechSynthesis' in window)) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
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
// Les gestionnaires reçoivent directement l'objet décodé.
export function live(url, handlers, { onOpen, onError } = {}) {
  let closed = false;
  let received = false;
  let es = null;
  const cid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const fire = (event, data) => {
    received = true;
    if (closed) return;
    handlers.current?.[event]?.(data);
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
        for (const e of events) fire(e.event, e.data);
      } catch {
        if (closed) return;
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
  for (const name of Object.keys(handlers.current ?? {})) {
    es.addEventListener(name, (e) => {
      let data = null;
      try { data = JSON.parse(e.data); } catch { /* évènement sans charge utile */ }
      fire(name, data);
    });
  }
  const fallback = setTimeout(() => {
    if (!received && !closed) {
      es.close();
      es = null;
      poll();
    }
  }, 5000);

  return {
    close() { closed = true; clearTimeout(fallback); es?.close(); },
  };
}

export function storage(kind = 'session') {
  const s = () => (kind === 'session' ? window.sessionStorage : window.localStorage);
  return {
    get(key) { try { return JSON.parse(s().getItem(key)); } catch { return null; } },
    set(key, value) { try { s().setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ } },
    remove(key) { try { s().removeItem(key); } catch { /* stockage indisponible */ } },
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

// Notifications éphémères : un conteneur unique ajouté au document.
export function toast(message, kind = '') {
  let host = document.getElementById('cs-toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'cs-toasts';
    host.className = 'fixed inset-x-0 bottom-4 z-[2000] flex flex-col items-center gap-2 px-4 pointer-events-none';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  const tone = kind === 'error' ? 'bg-danger text-white' : kind === 'success' ? 'bg-success text-white' : 'bg-slate-900 text-white';
  el.className = `toast-in pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl ring-1 ring-black/10 ${tone}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), 4200);
}

// Sons générés (aucun fichier audio) : l'AudioContext est débloqué au premier geste de l'utilisateur.
let audioCtx = null;
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    else if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* audio indisponible */ }
}

export function siren(urgent = false) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.connect(gain).connect(audioCtx.destination);
  const n = urgent ? 12 : 8;
  const step = urgent ? 0.15 : 0.22;
  for (let i = 0; i < n; i++) osc.frequency.setValueAtTime(i % 2 ? 640 : 920, t0 + i * step);
  const end = n * step;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
  gain.gain.setValueAtTime(0.35, t0 + end - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
  osc.start(t0);
  osc.stop(t0 + end + 0.02);
}

export function ring() {
  if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 600]);
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain).connect(audioCtx.destination);
  for (let i = 0; i < 6; i++) osc.frequency.setValueAtTime(i % 2 ? 700 : 1050, t0 + i * 0.18);
  gain.gain.setValueAtTime(0.3, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
  osc.start(t0);
  osc.stop(t0 + 1.1);
}
