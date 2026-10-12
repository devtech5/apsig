import { api, esc, icon, fmtTime, fmtTimeSec, toast, storage, TYPE_META } from './common.js';

const app = document.getElementById('app');
const token = location.pathname.split('/').pop();
const session = storage('session');
const SESSION_KEY = `cs-alert-${token}`;

let plate = null;
let demo = true;
let current = null; // { alert, key }
let stream = null;

const ADVICE = {
  agression: ["Mettez-vous à l'abri dans une pièce qui ferme à clé.", 'Ne confrontez pas les agresseurs.', 'Gardez votre téléphone sur vous, en silencieux.', 'Si possible, retenez un signalement (tenue, véhicule, direction).'],
  medical: ['Restez auprès de la victime et parlez-lui.', 'Ne la déplacez pas, sauf danger immédiat.', 'En cas de saignement, comprimez la plaie avec un linge propre.', "Dégagez l'accès pour les secours."],
  incendie: ["Évacuez immédiatement les lieux, sans prendre l'ascenseur.", 'Fermez les portes derrière vous.', 'Baissez-vous sous la fumée.', "Ne revenez pas chercher d'affaires."],
};

const EMERGENCY = [
  { n: '170', label: 'Police' },
  { n: '180', label: 'Pompiers' },
  { n: '185', label: 'SAMU' },
];

function directNumbers() {
  const items = EMERGENCY.map((e) => (demo
    ? `<div class="direct__item"><strong>${e.n}</strong><span>${e.label}</span></div>`
    : `<a class="direct__item" href="tel:${e.n}"><strong>${e.n}</strong><span>${e.label}</span></a>`)).join('');
  return `
    <section class="direct" aria-labelledby="direct-title">
      <h2 id="direct-title">Numéros d'urgence</h2>
      <div class="direct__list">${items}</div>
      ${demo ? '<p class="direct__note">Appel direct désactivé en mode démonstration.</p>' : ''}
    </section>`;
}

function addressCard() {
  const premium = plate.pass === 'rouge';
  return `
    <section class="addr-card" aria-label="Adresse de la plaque">
      <div class="addr-card__label">Adresse sécurisée</div>
      <div class="addr-card__code">${esc(plate.code)}</div>
      <div class="addr-card__loc">${icon('pin')} ${esc(plate.quartier)}, ${esc(plate.commune)} — Abidjan</div>
      <div class="addr-card__row">
        <span class="verified">${icon('check')} Position vérifiée</span>
        <span class="badge badge--${premium ? 'rouge' : 'bleu'}">${premium ? 'Pass Rouge Premium' : 'Pass Bleu'}</span>
      </div>
    </section>`;
}

function renderChoose() {
  const buttons = Object.entries(TYPE_META).map(([type, meta]) => `
    <button class="sos-btn sos-btn--${type}" data-type="${type}">
      <span class="sos-btn__icon">${icon(meta.icon)}</span>
      <span><strong>SOS</strong><span class="sos-btn__label">${meta.label}</span></span>
      <span class="sos-btn__go">${icon('chevronRight')}</span>
    </button>`).join('');
  app.innerHTML = `
    ${addressCard()}
    <h1 class="sos-title">Quelle est l'urgence ?</h1>
    <p class="sos-sub">Un seul appui : la centrale APSIG est alertée immédiatement.</p>
    <div class="sos-buttons">${buttons}</div>
    <p class="how">${icon('clock')} Position transmise automatiquement · aucune donnée à saisir</p>
    ${directNumbers()}`;
  app.querySelectorAll('.sos-btn').forEach((btn) => btn.addEventListener('click', () => trigger(btn)));
}

async function trigger(btn) {
  const type = btn.dataset.type;
  app.querySelectorAll('.sos-btn').forEach((b) => { b.disabled = true; });
  btn.classList.add('is-sending');
  if (navigator.vibrate) navigator.vibrate(60);
  try {
    const { alert, key, duplicate } = await api('/api/public/alerts', { method: 'POST', body: { token, type } });
    current = { alert, key };
    session.set(SESSION_KEY, { id: alert.id, key });
    if (duplicate) toast('Une alerte identique est déjà en cours : elle a été relancée.');
    renderTracking();
    listen();
  } catch (err) {
    toast(`${err.message}. Appelez directement le ${type === 'incendie' ? '180' : type === 'medical' ? '185' : '170'}.`, 'error');
    app.querySelectorAll('.sos-btn').forEach((b) => { b.disabled = false; });
    btn.classList.remove('is-sending');
  }
}

function trackerSteps(a) {
  const done = { nouvelle: 1, prise_en_charge: 2, en_route: 2, sur_place: 4, cloturee: 4 }[a.status] ?? 1;
  const idx = done;
  const unitTxt = a.unit ? `Unité ${esc(a.unit.name)}${a.unit.kind === 'intervention' ? ' (intervention)' : ''}` : '';
  const steps = [
    { title: 'Alerte reçue par la centrale', sub: fmtTimeSec(a.createdAt) },
    { title: 'Prise en charge par un opérateur', sub: a.ackAt ? fmtTimeSec(a.ackAt) : 'En cours…' },
    { title: 'Équipe en route', sub: a.status === 'en_route' ? `${unitTxt}${a.eta ? ` · arrivée estimée ~${a.eta} min` : ''}` : idx > 2 ? unitTxt : 'En attente d\'affectation' },
    { title: 'Équipe sur place', sub: a.onSiteAt ? fmtTimeSec(a.onSiteAt) : '' },
  ];
  return steps.map((s, i) => {
    const state = i < done ? 'is-done' : i === done ? 'is-current' : '';
    return `<li class="${state}"><span class="tracker__dot">${state === 'is-done' ? icon('check') : i + 1}</span><span><strong>${s.title}</strong>${s.sub ? `<small>${s.sub}</small>` : ''}</span></li>`;
  }).join('');
}

function renderTracking() {
  const a = current.alert;
  const meta = TYPE_META[a.type];
  if (a.status === 'annulee') {
    app.innerHTML = `
      <section class="sent sent--cancelled">
        <div class="sent__pulse">${icon('x')}</div>
        <h1>Alerte annulée</h1>
        <p>${esc(meta.label)}</p>
        <p class="sent__code">${esc(a.code)}</p>
        <p class="ref">Réf. ${esc(a.id)}</p>
      </section>
      <button class="btn btn--primary btn--lg btn--block" id="again">Revenir à la page SOS</button>
      ${directNumbers()}`;
    app.querySelector('#again').addEventListener('click', restart);
    return;
  }
  const closed = a.status === 'cloturee';
  app.innerHTML = `
    <section class="sent ${closed ? 'sent--closed' : ''}">
      <div class="sent__pulse">${icon(closed ? 'checkCircle' : 'check')}</div>
      <h1>${closed ? 'Intervention terminée' : 'Alerte transmise'}</h1>
      <p>${esc(meta.label)}</p>
      <p class="sent__code">${esc(a.code)}</p>
      <p class="ref">Réf. ${esc(a.id)} · ${fmtTime(a.createdAt)}</p>
    </section>
    <ol class="tracker" aria-label="Suivi de l'intervention">${trackerSteps(a)}</ol>
    <div class="info-line">${icon('users')} <span>${a.notifiedCount} personnes et services prévenus automatiquement (famille, secours compétents, centrale APSIG).</span></div>
    ${closed ? '' : `<section class="advice"><h2>En attendant les secours</h2><ul>${ADVICE[a.type].map((t) => `<li>${t}</li>`).join('')}</ul></section>`}
    ${closed
      ? '<button class="btn btn--primary btn--lg btn--block" id="again">Revenir à la page SOS</button>'
      : '<button class="btn btn--lg btn--block" id="cancel">Annuler l\'alerte (erreur de manipulation)</button>'}
    ${directNumbers()}`;
  app.querySelector('#again')?.addEventListener('click', restart);
  app.querySelector('#cancel')?.addEventListener('click', cancel);
}

async function cancel() {
  if (!confirm("Confirmer l'annulation ? Les secours seront informés qu'il s'agit d'une erreur.")) return;
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
  session.remove(SESSION_KEY);
  renderChoose();
}

function listen() {
  stream?.close();
  stream = new EventSource(`/api/public/events?alert=${encodeURIComponent(current.alert.id)}&key=${encodeURIComponent(current.key)}`);
  stream.addEventListener('alert', (e) => {
    const prev = current?.alert.status;
    current.alert = JSON.parse(e.data);
    if (prev && prev !== current.alert.status && navigator.vibrate) navigator.vibrate([40, 60, 40]);
    renderTracking();
    if (['cloturee', 'annulee'].includes(current.alert.status)) stream.close();
  });
}

function renderError(title, text) {
  app.innerHTML = `
    <section class="err">${icon('alert')}<h1>${esc(title)}</h1><p>${esc(text)}</p></section>
    ${directNumbers()}`;
}

async function init() {
  try {
    const data = await api(`/api/public/plates/${encodeURIComponent(token)}`);
    plate = data.plate;
    demo = data.demo;
  } catch {
    demo = true;
    renderError('Plaque non reconnue', "Ce QR code n'est pas (ou plus) actif. En cas d'urgence, appelez directement les secours.");
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
