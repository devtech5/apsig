import { api, esc, icon, plateHTML, fmtDate, fmtMoney, toast, logout } from './common.js';

document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

const PAGE = 24;
const $ = (id) => document.getElementById(id);
let plates = [];
let ref = null;
let me = null;
let shown = PAGE;
const isAdmin = () => me?.rank >= 3;
const active = (p) => p.subscription.expiresAt > Date.now();

function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const pass = $('pass').value;
  const commune = $('commune').value;
  const status = $('status').value;
  return plates.filter((p) => (!pass || p.pass === pass)
    && (!commune || p.commune === commune)
    && (!status || (status === 'expired' ? !active(p) : p.status === status))
    && (!q || [p.code, p.shortCode, p.quartier, p.commune, p.label, p.owner.name, p.kind].join(' ').toLowerCase().includes(q)));
}

function card(p) {
  const sub = active(p)
    ? `<span class="badge badge--success">Abonnement jusqu'au ${fmtDate(p.subscription.expiresAt)}</span>`
    : `<span class="badge badge--warning">Expiré depuis le ${fmtDate(p.subscription.expiresAt)}</span>`;
  return `
    <article class="plate-card ${p.status !== 'active' ? 'is-inactive' : ''}" data-id="${esc(p.id)}">
      ${plateHTML(p)}
      <div class="plate-card__badges">${p.status !== 'active' ? '<span class="badge badge--agression">Désactivée</span>' : ''}${sub}${p.tokenHistory?.length ? `<span class="badge">QR v${p.tokenHistory.length + 1}</span>` : ''}</div>
      <div class="plate-card__meta">
        <strong>${esc(p.label)}</strong>
        <span class="plate-card__row">${icon('pin')} ${esc(p.quartier)}, ${esc(p.commune)} · ${esc(p.kind)}</span>
        <span class="plate-card__row">${icon('user')} ${esc(p.owner.name)} · <span class="mono">${esc(p.owner.phone)}</span></span>
        <span class="plate-card__row">${icon('users')} ${p.contacts.length} contact(s)${p.community ? ' · chef de quartier' : ''} · ${p.alertCount} alerte(s)</span>
        <span class="plate-card__row">${icon('keypad')} USSD <span class="mono">*789*${esc(p.shortCode)}#</span></span>
      </div>
      <div class="plate-card__actions">
        <a class="btn btn--sm btn--primary" href="/s/${esc(p.token)}" target="_blank" rel="noopener">${icon('external')}SOS</a>
        <button type="button" class="btn btn--sm" data-act="print">${icon('print')}Imprimer</button>
        <div class="dropdown">
          <button type="button" class="btn btn--sm" data-act="menu" aria-haspopup="true">${icon('chevronDown')}Gérer</button>
          <div class="menu" hidden>
            <a href="/client/${esc(p.clientKey)}" target="_blank" rel="noopener">${icon('user')}Espace client</a>
            ${isAdmin() ? `
              <button type="button" data-act="edit">${icon('edit')}Modifier</button>
              <button type="button" data-act="pay">${icon('wallet')}Encaisser (Mobile Money)</button>
              <button type="button" data-act="regen">${icon('refresh')}Régénérer le QR</button>
              <button type="button" data-act="toggle">${icon('ban')}${p.status === 'active' ? 'Désactiver' : 'Réactiver'}</button>` : ''}
          </div>
        </div>
      </div>
    </article>`;
}

function render() {
  const list = filtered();
  $('grid').innerHTML = list.slice(0, shown).map(card).join('') || '<p class="muted">Aucune plaque ne correspond.</p>';
  $('more').hidden = list.length <= shown;
  $('more').textContent = `Afficher plus (${list.length - shown} restantes)`;
  const blue = plates.filter((p) => p.pass === 'bleu').length;
  $('counts').innerHTML = `<span class="badge">${plates.length} plaques</span><span class="badge badge--bleu">${blue} Pass Bleu</span><span class="badge badge--rouge">${plates.length - blue} Pass Rouge</span><span class="badge badge--warning">${plates.filter((p) => !active(p)).length} expirées</span>`;
}

const byId = (id) => plates.find((p) => p.id === id);
function upsert(p) {
  const i = plates.findIndex((x) => x.id === p.id);
  if (i >= 0) plates[i] = p; else plates.unshift(p);
  render();
}

$('grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const article = btn.closest('.plate-card');
  const p = byId(article.dataset.id);
  const act = btn.dataset.act;
  if (act === 'menu') {
    const menu = btn.nextElementSibling;
    const open = menu.hidden;
    document.querySelectorAll('.dropdown .menu').forEach((m) => { m.hidden = true; });
    menu.hidden = !open;
    e.stopPropagation();
    return;
  }
  document.querySelectorAll('.dropdown .menu').forEach((m) => { m.hidden = true; });
  if (act === 'print') return printPlate(article);
  if (act === 'edit') return openForm(p);
  if (act === 'pay') return openPayment(p);
  if (act === 'regen') {
    if (!confirm(`Régénérer le QR de ${p.code} ? L'ancien QR cessera immédiatement de fonctionner : il faudra réimprimer la plaque.`)) return;
    return mutate(`/api/admin/plates/${p.id}/regenerate`, {}, 'Nouveau QR généré — pensez à réimprimer la plaque');
  }
  if (act === 'toggle') {
    const next = p.status === 'active' ? 'inactive' : 'active';
    if (next === 'inactive' && !confirm(`Désactiver ${p.code} ? Le QR et le code USSD afficheront « plaque désactivée ».`)) return;
    return mutate(`/api/admin/plates/${p.id}/status`, { status: next }, next === 'active' ? 'Plaque réactivée' : 'Plaque désactivée');
  }
});
document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) document.querySelectorAll('.dropdown .menu').forEach((m) => { m.hidden = true; }); });

async function mutate(url, body, message) {
  try {
    const { plate } = await api(url, { method: 'POST', body });
    upsert(plate);
    toast(message, 'success');
    return plate;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

function printPlate(article) {
  article.classList.add('is-printing');
  document.body.classList.add('printing');
  const img = article.querySelector('.plate__qr img');
  const done = () => {
    window.print();
    article.classList.remove('is-printing');
    document.body.classList.remove('printing');
  };
  if (img && !img.complete) img.addEventListener('load', done, { once: true }); else done();
}

// --- Modales ----------------------------------------------------------------
const modal = $('modal');
function openModal(title, body, foot) {
  modal.innerHTML = `<div class="modal__head"><h3>${title}</h3><button type="button" class="btn btn--sm btn--ghost" data-close aria-label="Fermer">${icon('x')}</button></div><div class="modal__body">${body}</div><div class="modal__foot">${foot}</div>`;
  if (!modal.open) modal.showModal();
}
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.close(); });

function openForm(p = null) {
  const communes = ref.communes;
  const c0 = p ? communes.find((c) => c.code === p.communeCode) : communes[0];
  openModal(p ? `Modifier ${esc(p.code)}` : 'Nouvelle plaque', `
    <form id="plate-form" class="form-grid">
      ${p ? '' : `
        <label class="form-field">Commune<select name="communeCode">${communes.map((c) => `<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="form-field">Quartier<select name="quartierCode">${c0.quartiers.map((q) => `<option value="${q.code}">${esc(q.name)}</option>`).join('')}</select></label>
        <label class="form-field">Numéro (facultatif)<input name="number" type="number" min="1" max="999" placeholder="Automatique"><small>Le code sera ABJ-COMMUNE-QUARTIER-NNN</small></label>`}
      <label class="form-field">Type de lieu<select name="kind">${ref.kinds.map((k) => `<option ${p?.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="form-field full">Libellé<input name="label" required maxlength="80" value="${esc(p?.label ?? '')}" placeholder="Ex. : Villa 12, résidence Les Cocotiers"></label>
      <label class="form-field">Titulaire<input name="ownerName" required maxlength="60" value="${esc(p?.owner.name ?? '')}"></label>
      <label class="form-field">Téléphone<input name="ownerPhone" required inputmode="tel" value="${esc(p?.owner.phone ?? '+225 07 ')}"></label>
      <fieldset class="full" style="border:0;padding:0;margin:0"><legend class="form-field" style="margin-bottom:6px">Pass</legend><div class="chips">
        <label class="chip-radio"><input type="radio" name="pass" value="bleu" ${p?.pass !== 'rouge' ? 'checked' : ''}><span>Pass Bleu · ${fmtMoney(ref.tariffs.bleu)}/mois</span></label>
        <label class="chip-radio"><input type="radio" name="pass" value="rouge" ${p?.pass === 'rouge' ? 'checked' : ''}><span>Pass Rouge Premium · ${fmtMoney(ref.tariffs.rouge)}/mois</span></label>
      </div></fieldset>
      ${p ? '' : '<label class="form-check full"><input type="checkbox" name="community" checked> Prévenir le chef de quartier en cas d\'alerte</label><p class="muted full" style="margin:0">Une période d\'essai de 30 jours est appliquée à la création.</p>'}
    </form>`,
  `<button type="button" class="btn" data-close>Annuler</button><button type="button" class="btn btn--primary" id="plate-save">${icon('check')}${p ? 'Enregistrer' : 'Créer la plaque'}</button>`);
  const form = modal.querySelector('#plate-form');
  form.communeCode?.addEventListener('change', () => {
    const c = communes.find((x) => x.code === form.communeCode.value);
    form.quartierCode.innerHTML = c.quartiers.map((q) => `<option value="${q.code}">${esc(q.name)}</option>`).join('');
  });
  modal.querySelector('#plate-save').addEventListener('click', async () => {
    const data = Object.fromEntries(new FormData(form));
    data.community = form.community?.checked ?? undefined;
    const saved = p ? await mutate(`/api/admin/plates/${p.id}`, data, 'Plaque modifiée') : await mutate('/api/admin/plates', data, 'Plaque créée');
    if (saved) {
      modal.close();
      if (!p) { $('q').value = saved.code; shown = PAGE; render(); }
    }
  });
}

function openPayment(p) {
  openModal(`Encaisser · ${esc(p.code)}`, `
    <form id="pay-form" class="form-grid">
      <div class="full"><strong>Opérateur</strong><div class="chips" style="margin-top:6px">${ref.mobileMoney.map((m, i) => `<label class="chip-radio"><input type="radio" name="operator" value="${esc(m)}" ${i === 0 ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('')}</div></div>
      <label class="form-field">Numéro Mobile Money<input name="phone" inputmode="tel" value="${esc(p.owner.phone)}"></label>
      <label class="form-field">Durée<select name="months"><option value="1">1 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12">12 mois (-10 %)</option></select></label>
      <p class="full" style="margin:0">Montant : <strong id="pay-amount"></strong> <small class="muted">(tarifs fictifs)</small></p>
      <p class="muted full" style="margin:0">Le client valide sur son téléphone ; la confirmation arrive en quelques secondes (simulation). Un numéro finissant par 0000 simule un échec.</p>
    </form>`,
  `<button type="button" class="btn" data-close>Annuler</button><button type="button" class="btn btn--success" id="pay-save">${icon('wallet')}Envoyer la demande</button>`);
  const form = modal.querySelector('#pay-form');
  const update = () => {
    const m = Number(form.months.value);
    const gross = ref.tariffs[p.pass] * m;
    modal.querySelector('#pay-amount').textContent = fmtMoney(m >= 12 ? Math.round(gross * 0.9) : gross);
  };
  form.months.addEventListener('change', update);
  update();
  modal.querySelector('#pay-save').addEventListener('click', async () => {
    try {
      const { payment } = await api(`/api/admin/plates/${p.id}/payments`, { method: 'POST', body: { operator: form.operator.value, phone: form.phone.value, months: Number(form.months.value) } });
      modal.close();
      toast(`Demande envoyée : ${fmtMoney(payment.amount)} via ${payment.operator}. En attente de validation…`);
    } catch (err) { toast(err.message, 'error'); }
  });
}

// --- Paiements --------------------------------------------------------------------
async function renderPayments() {
  try {
    const { payments } = await api('/api/admin/payments');
    $('payments').innerHTML = payments.map((x) => `<tr>
      <td class="mono">${fmtDate(x.at)}</td><td class="mono">${esc(x.code)}</td><td>${esc(x.operator)}</td><td class="mono">${esc(x.phone)}</td>
      <td>${x.months} mois</td><td><strong>${fmtMoney(x.amount)}</strong></td><td>${x.via === 'client' ? 'Espace client' : 'Back-office'}</td>
      <td><span class="badge badge--${x.status === 'réussi' ? 'success' : x.status === 'échec' ? 'agression' : 'warning'}">${esc(x.status)}</span>${x.reason ? `<br><small class="muted">${esc(x.reason)}</small>` : ''}</td></tr>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('view-plates').hidden = b.dataset.tab !== 'plates';
  $('view-payments').hidden = b.dataset.tab !== 'payments';
  if (b.dataset.tab === 'payments') renderPayments();
}));

['q', 'pass', 'commune', 'status'].forEach((id) => $(id).addEventListener('input', () => { shown = PAGE; render(); }));
$('more').addEventListener('click', () => { shown += PAGE; render(); });
$('new-plate').addEventListener('click', () => openForm());
$('logout').addEventListener('click', logout);

try {
  const [{ user }, data, referentiel] = await Promise.all([api('/api/auth/me'), api('/api/ops/plates'), api('/api/ops/referentiel')]);
  me = user;
  ref = referentiel;
  $('me').textContent = `${user.name} · ${user.roleLabel}`;
  $('new-plate').hidden = !isAdmin();
  $('tab-payments').hidden = !isAdmin();
  plates = [...data.plates].sort((a, b) => (b.showcase - a.showcase) || (a.showcase ? 0 : a.code.localeCompare(b.code)));
  const communes = [...new Set(plates.map((p) => p.commune))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('commune').innerHTML += communes.map((c) => `<option>${esc(c)}</option>`).join('');
  render();

  const es = new EventSource('/api/ops/events');
  es.addEventListener('plate', (e) => upsert(JSON.parse(e.data)));
  es.addEventListener('payment', (e) => {
    const p = JSON.parse(e.data);
    if (p.status === 'réussi') toast(`Paiement reçu : ${fmtMoney(p.amount)} (${p.operator}) — ${p.code}`, 'success');
    if (p.status === 'échec') toast(`Paiement échoué (${p.code}) : ${p.reason}`, 'error');
    if (!$('view-payments').hidden) renderPayments();
  });
} catch {
  location.href = '/connexion?next=/plaques';
}
