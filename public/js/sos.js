import { api, esc, icon, fmtTime, fmtTimeSec, toast, storage, speak, deviceId, live, TYPE_META } from './common.js';

const app = document.getElementById('app');
const token = location.pathname.split('/').pop();
const session = storage('session');
const local = storage('local');
const SESSION_KEY = `cs-alert-${token}`;

// Français et anglais. Les langues locales (dioula, baoulé…) seront ajoutées avec des traducteurs natifs
// et des enregistrements audio : une traduction approximative serait dangereuse en situation d'urgence.
const I18N = {
  fr: {
    htmlLang: 'fr', voice: 'fr-FR',
    ribbon: "Prototype de démonstration : aucune alerte réelle n'est transmise aux secours.",
    tagline: 'APSIG · Sécurité pour tous', footer: 'Aucune application à installer · Service APSIG',
    address: 'Adresse sécurisée', verified: 'Position vérifiée', passBleu: 'Pass Bleu', passRouge: 'Pass Rouge Premium',
    question: "Quelle est l'urgence ?", sub: 'Un seul appui : la centrale APSIG est alertée immédiatement.',
    types: { agression: 'Agression / Intrusion', medical: 'Maladie / Accident', incendie: 'Incendie' },
    how: 'Position transmise automatiquement · aucune donnée à saisir',
    listen: 'Écouter les instructions',
    listenText: "Code Secours. Appuyez sur le bouton rouge en cas d'agression ou d'intrusion. Sur le bouton orange en cas de malaise ou d'accident. Sur le bouton bleu en cas d'incendie. La centrale A P S I G sera prévenue immédiatement.",
    numbers: "Numéros d'urgence", police: 'Police', fire: 'Pompiers', samu: 'SAMU', numbersDemo: 'Appel direct désactivé en mode démonstration.',
    noNet: 'Sans Internet, composez',
    sent: 'Alerte transmise', closed: 'Intervention terminée', cancelled: 'Alerte annulée', ref: 'Réf.',
    steps: ['Alerte reçue par la centrale', 'Prise en charge par un opérateur', 'Équipe en route', 'Équipe sur place'],
    inProgress: 'En cours…', waitingUnit: "En attente d'affectation", unit: 'Unité', armed: 'intervention', eta: 'arrivée estimée ~{n} min',
    notified: '{n} personnes et services prévenus automatiquement (famille, secours compétents, centrale APSIG).',
    meanwhile: 'En attendant les secours', listenAdvice: 'Écouter les consignes',
    advice: {
      agression: ["Mettez-vous à l'abri dans une pièce qui ferme à clé.", 'Ne confrontez pas les agresseurs.', 'Gardez votre téléphone sur vous, en silencieux.', 'Si possible, retenez un signalement (tenue, véhicule, direction).'],
      medical: ['Restez auprès de la victime et parlez-lui.', 'Ne la déplacez pas, sauf danger immédiat.', 'En cas de saignement, comprimez la plaie avec un linge propre.', "Dégagez l'accès pour les secours."],
      incendie: ["Évacuez immédiatement les lieux, sans prendre l'ascenseur.", 'Fermez les portes derrière vous.', 'Baissez-vous sous la fumée.', "Ne revenez pas chercher d'affaires."],
    },
    cancel: "Annuler l'alerte (erreur de manipulation)", cancelConfirm: "Confirmer l'annulation ? Les secours seront informés qu'il s'agit d'une erreur.",
    back: 'Revenir à la page SOS',
    help: 'Aider la centrale (facultatif)', helpSub: 'Une photo, un message vocal ou quelques mots aident à préparer l\'intervention.',
    photo: 'Photo', voiceMsg: 'Vocal', write: 'Écrire', send: 'Envoyer', stop: 'Arrêter et envoyer', recording: 'Enregistrement',
    photoSent: 'Photo envoyée à la centrale', voiceSent: 'Message vocal envoyé', textSent: 'Message envoyé', sending: 'Envoi…',
    textPh: 'Décrivez la situation : nombre de personnes, blessés, véhicule…',
    geoAsk: 'Partage de votre position avec la centrale…', geoOk: 'Votre position a été partagée avec la centrale.', geoNo: 'Position non partagée : la centrale utilise la position de la plaque.',
    dup: 'Une alerte identique est déjà en cours : elle a été relancée.', callDirect: 'Appelez directement le {n}.',
    unknownTitle: 'Plaque non reconnue', unknownText: "Ce QR code n'est pas (ou plus) actif. En cas d'urgence, appelez directement les secours.",
    micDenied: 'Micro non autorisé.',
  },
  en: {
    htmlLang: 'en', voice: 'en-GB',
    ribbon: 'Demonstration prototype: no real alert is sent to emergency services.',
    tagline: 'APSIG · Safety for everyone', footer: 'No app to install · APSIG service',
    address: 'Secured address', verified: 'Verified location', passBleu: 'Blue Pass', passRouge: 'Red Premium Pass',
    question: 'What is the emergency?', sub: 'One tap: the APSIG control room is alerted immediately.',
    types: { agression: 'Assault / Break-in', medical: 'Illness / Accident', incendie: 'Fire' },
    how: 'Location sent automatically · nothing to type',
    listen: 'Listen to instructions',
    listenText: 'Code Secours. Press the red button for an assault or a break-in. The orange button for illness or an accident. The blue button for a fire. The A P S I G control room will be alerted immediately.',
    numbers: 'Emergency numbers', police: 'Police', fire: 'Fire brigade', samu: 'Ambulance', numbersDemo: 'Direct calls disabled in demo mode.',
    noNet: 'No internet? Dial',
    sent: 'Alert sent', closed: 'Intervention completed', cancelled: 'Alert cancelled', ref: 'Ref.',
    steps: ['Alert received by the control room', 'Handled by an operator', 'Team on the way', 'Team on site'],
    inProgress: 'In progress…', waitingUnit: 'Waiting for a team', unit: 'Unit', armed: 'response team', eta: 'estimated arrival ~{n} min',
    notified: '{n} people and services notified automatically (family, emergency services, APSIG control room).',
    meanwhile: 'While help is on the way', listenAdvice: 'Listen to the advice',
    advice: {
      agression: ['Take shelter in a room you can lock.', 'Do not confront the attackers.', 'Keep your phone with you, on silent.', 'If possible, remember a description (clothes, vehicle, direction).'],
      medical: ['Stay with the victim and talk to them.', 'Do not move them unless there is immediate danger.', 'If bleeding, press on the wound with a clean cloth.', 'Clear the way for the emergency team.'],
      incendie: ['Leave the building immediately; do not use the lift.', 'Close the doors behind you.', 'Stay low under the smoke.', 'Do not go back for belongings.'],
    },
    cancel: 'Cancel the alert (pressed by mistake)', cancelConfirm: 'Confirm cancellation? The control room will be told it was a mistake.',
    back: 'Back to the SOS page',
    help: 'Help the control room (optional)', helpSub: 'A photo, a voice message or a few words help prepare the intervention.',
    photo: 'Photo', voiceMsg: 'Voice', write: 'Write', send: 'Send', stop: 'Stop and send', recording: 'Recording',
    photoSent: 'Photo sent to the control room', voiceSent: 'Voice message sent', textSent: 'Message sent', sending: 'Sending…',
    textPh: 'Describe the situation: number of people, injuries, vehicle…',
    geoAsk: 'Sharing your location with the control room…', geoOk: 'Your location has been shared with the control room.', geoNo: 'Location not shared: the control room uses the plate location.',
    dup: 'An identical alert is already in progress: it has been re-sent.', callDirect: 'Call {n} directly.',
    unknownTitle: 'Plate not recognised', unknownText: 'This QR code is not (or no longer) active. In an emergency, call the emergency services directly.',
    micDenied: 'Microphone not allowed.',
  },
};

let lang = local.get('cs-lang') ?? (navigator.language?.startsWith('en') ? 'en' : 'fr');
let T = I18N[lang];
let plate = null;
let demo = true;
let current = null; // { alert, key }
let stream = null;
let geoState = null; // 'ask' | 'ok' | 'no'
let built = null; // id de l'alerte dont le squelette de suivi est affiché

const fmt = (s, n) => s.replace('{n}', n);
const EMERGENCY = () => [{ n: '170', label: T.police }, { n: '180', label: T.fire }, { n: '185', label: T.samu }];

function applyLang() {
  T = I18N[lang];
  document.documentElement.lang = T.htmlLang;
  document.getElementById('tagline').textContent = T.tagline;
  document.getElementById('footer').textContent = T.footer;
  document.getElementById('demo-ribbon').textContent = T.ribbon;
  const listen = document.getElementById('listen');
  listen.innerHTML = icon('volume');
  listen.setAttribute('aria-label', T.listen);
  listen.title = T.listen;
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}

document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  local.set('cs-lang', lang);
  applyLang();
  built = null;
  if (current) renderTracking(); else if (plate) renderChoose();
}));
document.getElementById('listen').addEventListener('click', () => {
  const text = current && !['cloturee', 'annulee'].includes(current.alert.status)
    ? `${T.meanwhile}. ${T.advice[current.alert.type].join(' ')}`
    : T.listenText;
  if (!speak(text, T.voice)) toast('Synthèse vocale indisponible sur ce navigateur.');
});

function directNumbers() {
  const items = EMERGENCY().map((e) => (demo
    ? `<div class="direct__item"><strong>${e.n}</strong><span>${e.label}</span></div>`
    : `<a class="direct__item" href="tel:${e.n}"><strong>${e.n}</strong><span>${e.label}</span></a>`)).join('');
  return `
    <section class="direct" aria-labelledby="direct-title">
      <h2 id="direct-title">${T.numbers}</h2>
      <div class="direct__list">${items}</div>
      ${plate?.ussd ? `<p class="direct__ussd">${T.noNet} <strong class="mono">${esc(plate.ussd)}</strong></p>` : ''}
      ${demo ? `<p class="direct__note">${T.numbersDemo}</p>` : ''}
    </section>`;
}

function addressCard() {
  const premium = plate.pass === 'rouge';
  return `
    <section class="addr-card" aria-label="${T.address}">
      <div class="addr-card__label">${T.address}</div>
      <div class="addr-card__code">${esc(plate.code)}</div>
      <div class="addr-card__loc">${icon('pin')} ${esc(plate.quartier)}, ${esc(plate.commune)} — Abidjan</div>
      <div class="addr-card__row">
        <span class="verified">${icon('check')} ${T.verified}</span>
        <span class="badge badge--${premium ? 'rouge' : 'bleu'}">${premium ? T.passRouge : T.passBleu}</span>
      </div>
    </section>`;
}

function renderChoose() {
  built = null;
  const buttons = Object.entries(TYPE_META).map(([type, meta]) => `
    <button class="sos-btn sos-btn--${type}" data-type="${type}">
      <span class="sos-btn__icon">${icon(meta.icon)}</span>
      <span><strong>SOS</strong><span class="sos-btn__label">${T.types[type]}</span></span>
      <span class="sos-btn__go">${icon('chevronRight')}</span>
    </button>`).join('');
  app.innerHTML = `
    ${addressCard()}
    <h1 class="sos-title">${T.question}</h1>
    <p class="sos-sub">${T.sub}</p>
    <div class="sos-buttons">${buttons}</div>
    <button type="button" class="listen-line" id="listen-inline">${icon('volume')} ${T.listen}</button>
    <p class="how">${icon('clock')} ${T.how}</p>
    ${directNumbers()}`;
  app.querySelectorAll('.sos-btn').forEach((btn) => btn.addEventListener('click', () => trigger(btn)));
  app.querySelector('#listen-inline').addEventListener('click', () => document.getElementById('listen').click());
}

async function trigger(btn) {
  const type = btn.dataset.type;
  app.querySelectorAll('.sos-btn').forEach((b) => { b.disabled = true; });
  btn.classList.add('is-sending');
  if (navigator.vibrate) navigator.vibrate(60);
  try {
    const { alert, key, duplicate } = await api('/api/public/alerts', { method: 'POST', body: { token, type, deviceId: deviceId(), lang } });
    current = { alert, key };
    session.set(SESSION_KEY, { id: alert.id, key });
    if (duplicate) toast(T.dup);
    geoState = null;
    renderTracking();
    listen();
    shareLocation();
  } catch (err) {
    toast(`${err.message}. ${fmt(T.callDirect, type === 'incendie' ? '180' : type === 'medical' ? '185' : '170')}`, 'error');
    app.querySelectorAll('.sos-btn').forEach((b) => { b.disabled = false; });
    btn.classList.remove('is-sending');
  }
}

// --- Géolocalisation du témoin (HTTPS requis par les navigateurs) ----------------
function shareLocation() {
  if (!window.isSecureContext || !navigator.geolocation || !current) return;
  geoState = 'ask';
  renderGeo();
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      await api(`/api/public/alerts/${current.alert.id}/location`, { method: 'POST', body: { key: current.key, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } });
      geoState = 'ok';
    } catch { geoState = 'no'; }
    renderGeo();
  }, () => { geoState = 'no'; renderGeo(); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}

function renderGeo() {
  const el = document.getElementById('geo');
  if (!el) return;
  if (!geoState) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `info-line info-line--${geoState}`;
  el.innerHTML = `${icon(geoState === 'ok' ? 'checkCircle' : 'locate')}<span>${geoState === 'ask' ? T.geoAsk : geoState === 'ok' ? T.geoOk : T.geoNo}</span>`;
}

// --- Suivi -----------------------------------------------------------------------
function trackerSteps(a) {
  const done = { nouvelle: 1, prise_en_charge: 2, en_route: 2, sur_place: 4, cloturee: 4 }[a.status] ?? 1;
  const unitTxt = a.unit ? `${T.unit} ${esc(a.unit.name)}${a.unit.kind === 'intervention' ? ` (${T.armed})` : ''}` : '';
  const steps = [
    { title: T.steps[0], sub: fmtTimeSec(a.createdAt) },
    { title: T.steps[1], sub: a.ackAt ? fmtTimeSec(a.ackAt) : T.inProgress },
    { title: T.steps[2], sub: a.status === 'en_route' ? `${unitTxt}${a.eta ? ` · ${fmt(T.eta, a.eta)}` : ''}` : done > 2 ? unitTxt : T.waitingUnit },
    { title: T.steps[3], sub: a.onSiteAt ? fmtTimeSec(a.onSiteAt) : '' },
  ];
  return steps.map((s, i) => {
    const st = i < done ? 'is-done' : i === done ? 'is-current' : '';
    return `<li class="${st}"><span class="tracker__dot">${st === 'is-done' ? icon('check') : i + 1}</span><span><strong>${s.title}</strong>${s.sub ? `<small>${s.sub}</small>` : ''}</span></li>`;
  }).join('');
}

function headerCard(a) {
  const closed = a.status === 'cloturee';
  const cancelled = a.status === 'annulee';
  return `
    <section class="sent ${closed ? 'sent--closed' : ''} ${cancelled ? 'sent--cancelled' : ''}">
      <div class="sent__pulse">${icon(cancelled ? 'x' : closed ? 'checkCircle' : 'check')}</div>
      <h1>${cancelled ? T.cancelled : closed ? T.closed : T.sent}</h1>
      <p>${esc(T.types[a.type])}</p>
      <p class="sent__code">${esc(a.code)}</p>
      <p class="ref">${T.ref} ${esc(a.id)} · ${fmtTime(a.createdAt)}</p>
    </section>`;
}

function renderTracking() {
  const a = current.alert;
  const finished = ['cloturee', 'annulee'].includes(a.status);
  if (finished) {
    built = null;
    app.innerHTML = `
      ${headerCard(a)}
      ${a.status === 'cloturee' ? `<ol class="tracker">${trackerSteps(a)}</ol>` : ''}
      <button class="btn btn--primary btn--lg btn--block" id="again">${T.back}</button>
      ${directNumbers()}`;
    app.querySelector('#again').addEventListener('click', restart);
    return;
  }
  if (built !== a.id) {
    built = a.id;
    app.innerHTML = `
      <div id="track"></div>
      <div id="geo" class="info-line" hidden></div>
      <section class="helpers">
        <h2>${T.help}</h2>
        <p class="muted">${T.helpSub}</p>
        <div class="helpers__row">
          <label class="helper-btn">${icon('camera')}<span>${T.photo}</span><input type="file" accept="image/*" capture="environment" id="photo-input" hidden></label>
          <button type="button" class="helper-btn" id="voice-btn" ${navigator.mediaDevices?.getUserMedia && window.MediaRecorder ? '' : 'hidden'}>${icon('mic')}<span>${T.voiceMsg}</span></button>
          <button type="button" class="helper-btn" id="text-btn">${icon('edit')}<span>${T.write}</span></button>
        </div>
        <div id="helper-zone"></div>
        <ul id="helper-done" class="helper-done"></ul>
      </section>
      <section class="advice">
        <div class="advice__head"><h2>${T.meanwhile}</h2><button type="button" class="btn btn--sm" id="advice-listen">${icon('volume')}${T.listenAdvice}</button></div>
        <ul>${T.advice[a.type].map((t) => `<li>${t}</li>`).join('')}</ul>
      </section>
      <button class="btn btn--lg btn--block" id="cancel">${T.cancel}</button>
      ${directNumbers()}`;
    app.querySelector('#cancel').addEventListener('click', cancel);
    app.querySelector('#advice-listen').addEventListener('click', () => speak(`${T.meanwhile}. ${T.advice[a.type].join(' ')}`, T.voice));
    app.querySelector('#photo-input').addEventListener('change', onPhoto);
    app.querySelector('#voice-btn').addEventListener('click', toggleRecording);
    app.querySelector('#text-btn').addEventListener('click', openText);
    renderGeo();
  }
  document.getElementById('track').innerHTML = `
    ${headerCard(a)}
    <ol class="tracker" aria-label="Suivi">${trackerSteps(a)}</ol>
    <div class="info-line">${icon('users')} <span>${fmt(T.notified, a.notifiedCount)}</span></div>`;
}

async function cancel() {
  if (!confirm(T.cancelConfirm)) return;
  try {
    const { alert } = await api(`/api/public/alerts/${current.alert.id}/cancel`, { method: 'POST', body: { key: current.key } });
    current.alert = alert;
    renderTracking();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function restart() {
  stream?.close();
  stream = null;
  current = null;
  built = null;
  session.remove(SESSION_KEY);
  renderChoose();
}

function listen() {
  stream?.close();
  stream = live(`/api/public/events?alert=${encodeURIComponent(current.alert.id)}&key=${encodeURIComponent(current.key)}`, {
    alert: (e) => {
      if (!current) return;
      const prev = current.alert.status;
      current.alert = JSON.parse(e.data);
      if (prev !== current.alert.status && navigator.vibrate) navigator.vibrate([40, 60, 40]);
      renderTracking();
      if (['cloturee', 'annulee'].includes(current.alert.status)) stream?.close();
    },
  });
}

// --- Pièces jointes ---------------------------------------------------------------
function helperDone(kind, label) {
  const ul = document.getElementById('helper-done');
  if (ul) ul.insertAdjacentHTML('beforeend', `<li>${icon('checkCircle')}${label}</li>`);
}

async function upload(kind, payload) {
  const { alert } = await api(`/api/public/alerts/${current.alert.id}/media`, { method: 'POST', body: { key: current.key, kind, ...payload } });
  current.alert = alert;
}

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function onPhoto(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const zone = document.getElementById('helper-zone');
  zone.innerHTML = `<p class="muted">${T.sending}</p>`;
  try {
    await upload('photo', { data: await compressImage(file) });
    helperDone('photo', T.photoSent);
  } catch (err) { toast(err.message, 'error'); }
  zone.innerHTML = '';
}

let recorder = null;
let recTimer = null;
async function toggleRecording() {
  const zone = document.getElementById('helper-zone');
  if (recorder) { recorder.stop(); return; }
  let mediaStream;
  try { mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast(T.micDenied, 'error'); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
  const chunks = [];
  recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
  recorder.onstop = async () => {
    clearInterval(recTimer);
    mediaStream.getTracks().forEach((t) => t.stop());
    recorder = null;
    zone.innerHTML = `<p class="muted">${T.sending}</p>`;
    try {
      const blob = new Blob(chunks, { type: chunks[0]?.type || mime || 'audio/webm' });
      const data = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
      await upload('audio', { data });
      helperDone('audio', T.voiceSent);
    } catch (err) { toast(err.message, 'error'); }
    zone.innerHTML = '';
  };
  recorder.start();
  const started = Date.now();
  zone.innerHTML = `<div class="rec"><span class="rec__dot"></span><span>${T.recording} <b id="rec-time">0:00</b> / 0:30</span><button type="button" class="btn btn--danger btn--sm" id="rec-stop">${icon('stop')}${T.stop}</button></div>`;
  zone.querySelector('#rec-stop').addEventListener('click', () => recorder?.stop());
  recTimer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    const el = document.getElementById('rec-time');
    if (el) el.textContent = `0:${String(s).padStart(2, '0')}`;
    if (s >= 30) recorder?.stop();
  }, 250);
}

function openText() {
  const zone = document.getElementById('helper-zone');
  zone.innerHTML = `<div class="text-zone"><textarea id="text-msg" rows="3" maxlength="500" placeholder="${esc(T.textPh)}"></textarea><button type="button" class="btn btn--primary" id="text-send">${icon('send')}${T.send}</button></div>`;
  zone.querySelector('#text-msg').focus();
  zone.querySelector('#text-send').addEventListener('click', async () => {
    const text = zone.querySelector('#text-msg').value.trim();
    if (!text) return;
    try {
      await upload('text', { text });
      helperDone('text', T.textSent);
      zone.innerHTML = '';
    } catch (err) { toast(err.message, 'error'); }
  });
}

function renderError(title, text) {
  app.innerHTML = `
    <section class="err">${icon('alert')}<h1>${esc(title)}</h1><p>${esc(text)}</p></section>
    ${directNumbers()}`;
}

async function init() {
  applyLang();
  try {
    const data = await api(`/api/public/plates/${encodeURIComponent(token)}`);
    plate = data.plate;
    demo = data.demo;
  } catch (err) {
    demo = true;
    document.getElementById('demo-ribbon').hidden = false;
    renderError(T.unknownTitle, err.message && !/^Erreur/.test(err.message) ? `${err.message} ${T.unknownText}` : T.unknownText);
    return;
  }
  document.getElementById('demo-ribbon').hidden = !demo;
  document.title = `SOS ${plate.code} — Code-Secours CI`;

  // Reprise du suivi si la page est rechargée pendant une alerte.
  const saved = session.get(SESSION_KEY);
  if (saved) {
    try {
      const { alert } = await api(`/api/public/alerts/${encodeURIComponent(saved.id)}?key=${encodeURIComponent(saved.key)}`);
      current = { alert, key: saved.key };
      if (alert.witnessLocated) geoState = 'ok';
      renderTracking();
      if (!['cloturee', 'annulee'].includes(alert.status)) listen();
      return;
    } catch {
      session.remove(SESSION_KEY);
    }
  }
  renderChoose();
}

init();
