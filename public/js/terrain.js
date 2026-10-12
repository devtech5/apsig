import { api, esc, icon, fmtTime, toast, logout, live, TYPE_META, STATUS_META } from './common.js';

document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
const $ = (id) => document.getElementById(id);

let unit = null;
let mission = null;
let watchId = null;
let lastSent = 0;

const etaMinutes = (km) => Math.max(3, Math.round((km / 22) * 60) + 2);
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let audioCtx = null;
document.addEventListener('pointerdown', () => { try { audioCtx ??= new AudioContext(); audioCtx.resume?.(); } catch { /* audio indisponible */ } }, { capture: true });
function ring() {
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

function renderHeader() {
  $('t-unit').textContent = `Unité ${unit.name}`;
  $('t-leader').textContent = `${unit.leader} · ${unit.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}`;
  $('t-status').textContent = unit.status === 'disponible' ? 'Disponible — en patrouille' : `En mission (${unit.alertId})`;
}

function renderMission(isNew = false) {
  const el = $('mission');
  if (!mission) {
    el.innerHTML = `<section class="t-card t-empty">${icon('shieldCheck')}<strong>Aucune mission en cours</strong><p>Les missions affectées par la centrale s'affichent ici instantanément, avec sonnerie et vibration.</p></section>`;
    return;
  }
  const a = mission;
  const meta = TYPE_META[a.type];
  const km = unit ? distanceKm(unit, a) : 0;
  const plate = a.plate ?? {};
  const notes = a.timeline.filter((t) => t.kind === 'operator' && t.text.includes('Note')).slice(-3);
  const witnessText = (a.media ?? []).filter((m) => m.kind === 'text');
  const dest = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}&travelmode=driving`;
  el.innerHTML = `
    <section class="t-card t-mission t-mission--${a.type} ${isNew ? 'is-new' : ''}">
      <div class="t-mission__head">${icon(meta.icon)}<div><small>${a.priority === 'critique' ? 'Mission critique' : 'Mission prioritaire'} · ${esc(a.id)}</small><strong>${esc(meta.label)}</strong></div></div>
      <div class="t-mission__body">
        <div class="t-mission__code">${esc(a.code)}</div>
        <div class="t-row">${icon('pin')}${esc(plate.label ?? '')} — ${esc(a.quartier)}, ${esc(a.commune)}</div>
        <div class="t-row">${icon('user')}${esc(plate.owner?.name ?? '')} · <span class="mono">${esc(plate.owner?.phone ?? '')}</span></div>
        <div class="t-row"><span class="status status--${STATUS_META[a.status].cls}">${STATUS_META[a.status].label}</span>${a.pass === 'rouge' ? '<span class="badge badge--rouge">Pass Rouge</span>' : ''}${a.trust ? `<span class="badge">Fiabilité ${a.trust.score}</span>` : ''}</div>
        ${a.status === 'en_route' ? `<div class="t-dist"><div><strong>${km.toFixed(1)} km</strong><span>Distance</span></div><div><strong>~${etaMinutes(km)} min</strong><span>Arrivée estimée</span></div></div>` : ''}
        ${witnessText.length || notes.length ? `<ul class="t-notes">${witnessText.map((m) => `<li>Témoin : « ${esc(m.text)} »</li>`).join('')}${notes.map((n) => `<li>${fmtTime(n.at)} · ${esc(n.text)}</li>`).join('')}</ul>` : ''}
        <div class="t-actions">
          ${!a.unitAckAt ? `<button type="button" class="btn btn--danger" data-act="ack">${icon('check')}Accepter la mission</button>` : ''}
          <a class="btn" href="${dest}" target="_blank" rel="noopener">${icon('navigation')}Itinéraire (Google Maps)</a>
          ${a.status === 'en_route' ? `<button type="button" class="btn btn--primary" data-act="onsite">${icon('pin')}Je suis sur place</button>` : ''}
          ${a.status === 'sur_place' ? `<button type="button" class="btn btn--success" data-act="close">${icon('flag')}Terminer l'intervention</button>` : ''}
        </div>
      </div>
    </section>`;
}

$('mission').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'close') return openClose();
  b.disabled = true;
  try {
    const res = await api(`/api/terrain/${b.dataset.act}`, { method: 'POST', body: {} });
    unit = res.unit; mission = res.mission;
    renderHeader(); renderMission();
  } catch (err) { toast(err.message, 'error'); b.disabled = false; }
});

function openClose() {
  const modal = $('modal');
  const options = ['Intervention réussie', 'Victime prise en charge par les secours', 'Situation sécurisée, aucun blessé', 'Fausse alerte / malveillance', 'Transféré aux services publics'];
  modal.innerHTML = `
    <div class="modal__head"><h3>Terminer l'intervention</h3><button type="button" class="btn btn--sm btn--ghost" data-close>${icon('x')}</button></div>
    <div class="modal__body"><div class="form-row"><label for="t-outcome">Issue</label><select id="t-outcome">${options.map((o) => `<option>${o}</option>`).join('')}</select></div></div>
    <div class="modal__foot"><button type="button" class="btn" data-close>Annuler</button><button type="button" class="btn btn--success" id="t-close">${icon('flag')}Terminer</button></div>`;
  modal.showModal();
  modal.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', () => modal.close()));
  modal.querySelector('#t-close').addEventListener('click', async () => {
    try {
      const res = await api('/api/terrain/close', { method: 'POST', body: { outcome: modal.querySelector('#t-outcome').value } });
      unit = res.unit; mission = res.mission;
      modal.close();
      toast('Intervention terminée', 'success');
      renderHeader(); renderMission();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// --- GPS réel (nécessite HTTPS : tunnel « npm run demo » ou déploiement) ------------
function setGps(on, text) {
  $('gps-dot').classList.toggle('is-on', on);
  $('gps-text').textContent = text;
  $('gps-btn').textContent = on ? 'Arrêter' : 'Activer';
}
function startGps() {
  if (!window.isSecureContext || !navigator.geolocation) {
    setGps(false, 'GPS indisponible en HTTP : position simulée par la centrale. Utilisez le lien HTTPS (tunnel) pour le GPS réel.');
    return;
  }
  setGps(false, 'Recherche de la position…');
  watchId = navigator.geolocation.watchPosition(async (pos) => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    setGps(true, `Position partagée (±${Math.round(accuracy)} m) · ${new Date().toLocaleTimeString('fr-FR')}`);
    if (Date.now() - lastSent < 4000) return;
    lastSent = Date.now();
    try {
      const res = await api('/api/terrain/position', { method: 'POST', body: { lat, lng, accuracy } });
      unit = res.unit;
      if (mission) renderMission();
    } catch { /* nouvelle tentative au prochain point */ }
  }, (err) => setGps(false, `GPS refusé ou indisponible (${err.message}).`), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function stopGps() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  setGps(false, 'Inactif');
}
$('gps-btn').addEventListener('click', () => (watchId === null ? startGps() : stopGps()));
$('t-logout').addEventListener('click', logout);

function connect() {
  live('/api/terrain/events', {
    mission: (e) => {
      const next = JSON.parse(e.data);
      const isNew = next && (!mission || mission.id !== next.id);
      mission = next;
      if (isNew) { ring(); toast(`Nouvelle mission : ${TYPE_META[next.type].label} — ${next.code}`, 'error'); }
      api('/api/terrain/me').then((res) => { unit = res.unit; mission = res.mission; renderHeader(); renderMission(isNew); }).catch(() => renderMission(isNew));
    },
    unit: (e) => { unit = JSON.parse(e.data); renderHeader(); if (mission?.status === 'en_route') renderMission(); },
    reset: () => location.reload(),
  }, {
    onOpen: () => { $('t-live').classList.remove('is-off'); $('t-live').textContent = 'En ligne'; },
    onError: () => {
      $('t-live').classList.add('is-off');
      $('t-live').textContent = 'Reconnexion…';
      api('/api/auth/me').catch(() => { location.href = '/connexion?next=/terrain'; });
    },
  });
}

try {
  const me = await api('/api/terrain/me');
  unit = me.unit;
  mission = me.mission;
  renderHeader();
  renderMission();
  connect();
  if (window.isSecureContext) startGps(); else setGps(false, 'GPS réel disponible via le lien HTTPS (tunnel). En HTTP, la centrale simule le trajet.');
} catch {
  location.href = '/connexion?next=/terrain';
}
