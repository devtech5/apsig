import { api, esc, icon, plateHTML, fmtDate, fmtTime, fmtMoney, toast, live, TYPE_META, STATUS_META } from './common.js';

const key = location.pathname.split('/').pop();
const app = document.getElementById('app');
let view = null;
let pendingPayment = null;
let showPay = false;

const daysLeft = (ts) => Math.ceil((ts - Date.now()) / 86400000);

function render() {
  const { plate, openAlert, alerts, payments, tariffs, mobileMoney } = view;
  const sub = plate.subscription;
  const left = daysLeft(sub.expiresAt);
  const months = [1, 3, 12];
  app.innerHTML = `
    ${openAlert ? `<div class="c-alert">${icon(TYPE_META[openAlert.type].icon)}<div>Alerte en cours à votre adresse : ${esc(openAlert.typeLabel)}<br><small>${esc(STATUS_META[openAlert.status].label)}${openAlert.unit ? ` · Unité ${esc(openAlert.unit.name)}${openAlert.eta ? ` · ~${openAlert.eta} min` : ''}` : ''}</small></div></div>` : ''}
    <section class="c-hero">
      <div>
        <h1>Bonjour ${esc(plate.owner.name.split(' ')[0])}</h1>
        <p>${esc(plate.label)}<br>${esc(plate.quartier)}, ${esc(plate.commune)}</p>
        <p style="margin-top:10px"><span class="badge badge--${plate.pass}">${plate.pass === 'rouge' ? 'Pass Rouge Premium' : 'Pass Bleu'}</span> ${plate.status !== 'active' ? '<span class="badge badge--agression">Plaque désactivée</span>' : ''}</p>
        <p class="muted" style="margin-top:10px">Sans Internet : <strong class="mono">${esc(plate.ussd)}</strong></p>
        <button type="button" class="btn btn--sm" id="notif-btn" style="margin-top:12px">${icon('bell')}Activer les notifications</button>
      </div>
      <div>${plateHTML(plate)}</div>
    </section>

    <section class="c-card">
      <h2>${icon('wallet')}Abonnement</h2>
      <div class="c-sub">
        <div>
          <strong>${sub.active ? `Actif jusqu'au ${fmtDate(sub.expiresAt)}` : `Expiré depuis le ${fmtDate(sub.expiresAt)}`}</strong><br>
          <small class="muted">${sub.active ? `${left} jour(s) restant(s)` : 'Vos alertes restent traitées, mais pensez à renouveler.'} · ${fmtMoney(tariffs[plate.pass])} / mois</small>
        </div>
        ${pendingPayment ? '' : `<button type="button" class="btn btn--primary" id="pay-toggle">${icon('wallet')}Renouveler via Mobile Money</button>`}
      </div>
      ${pendingPayment ? `<div class="c-pay"><div class="c-pending"><span class="spin"></span><div>Validez le paiement de <strong>${fmtMoney(pendingPayment.amount)}</strong> sur votre téléphone (${esc(pendingPayment.operator)}).<br><small class="muted">Simulation : confirmation automatique dans quelques secondes.</small></div></div></div>` : ''}
      ${showPay && !pendingPayment ? `<form class="c-pay" id="pay-form">
        <div><strong>Opérateur</strong><div class="chips" style="margin-top:6px">${mobileMoney.map((m, i) => `<label class="chip-radio"><input type="radio" name="operator" value="${esc(m)}" ${i === 0 ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('')}</div></div>
        <div class="form-grid">
          <label class="form-field">Numéro Mobile Money<input name="phone" value="${esc(plate.owner.phone)}" inputmode="tel" required></label>
          <label class="form-field">Durée<select name="months">${months.map((m) => `<option value="${m}">${m} mois${m === 12 ? ' (-10 %)' : ''}</option>`).join('')}</select></label>
        </div>
        <div class="c-sub"><span class="c-amount" id="pay-amount"></span><button class="btn btn--success btn--lg" type="submit">${icon('check')}Payer</button></div>
        <small class="muted">Tarifs fictifs. Astuce démo : un numéro se terminant par 0000 simule un solde insuffisant.</small>
      </form>` : ''}
    </section>

    <section class="c-card">
      <h2>${icon('users')}Personnes à prévenir (${plate.contacts.length}/5)</h2>
      <p class="muted" style="margin-top:0">Elles reçoivent un SMS dès qu'une alerte est déclenchée à votre adresse.</p>
      <ul class="c-list">${plate.contacts.map((c, i) => `<li><span class="grow"><strong>${esc(c.name)}</strong><small>${esc(c.relation)} · <span class="mono">${esc(c.phone)}</span></small></span><button type="button" class="btn btn--sm btn--ghost" data-remove="${i}" aria-label="Retirer ${esc(c.name)}">${icon('trash')}</button></li>`).join('') || '<li class="muted">Aucun contact pour le moment.</li>'}</ul>
      ${plate.contacts.length < 5 ? `<form class="c-add" id="contact-form">
        <input name="name" placeholder="Nom" required maxlength="60">
        <input name="relation" placeholder="Lien (sœur, voisin…)" maxlength="30">
        <input name="phone" placeholder="+225 07 …" inputmode="tel" required>
        <button class="btn btn--primary" type="submit">${icon('plus')}Ajouter</button>
      </form>` : ''}
      ${plate.community ? `<p class="muted" style="margin:10px 0 0">Responsable communautaire prévenu : ${esc(plate.community.name)}</p>` : ''}
    </section>

    <section class="c-card">
      <h2>${icon('history')}Alertes à votre adresse</h2>
      <ul class="c-list">${alerts.map((a) => `<li><span class="badge badge--${a.type}">${TYPE_META[a.type].short}</span><span class="grow">${fmtDate(a.createdAt)} à ${fmtTime(a.createdAt)}<small>${esc(a.outcome ?? STATUS_META[a.status].label)}</small></span><span class="status status--${STATUS_META[a.status].cls}">${STATUS_META[a.status].label}</span></li>`).join('') || '<li class="muted">Aucune alerte enregistrée.</li>'}</ul>
    </section>

    <section class="c-card">
      <h2>${icon('wallet')}Paiements</h2>
      <ul class="c-list">${payments.map((p) => `<li><span class="grow"><strong>${fmtMoney(p.amount)}</strong> · ${p.months} mois<small>${fmtDate(p.at)} · ${esc(p.operator)} · réf. <span class="mono">${esc(p.ref)}</span></small></span><span class="badge badge--${p.status === 'réussi' ? 'success' : p.status === 'échec' ? 'agression' : 'warning'}">${esc(p.status)}</span></li>`).join('') || '<li class="muted">Aucun paiement.</li>'}</ul>
    </section>`;
  bind();
}

function bind() {
  document.getElementById('pay-toggle')?.addEventListener('click', () => { showPay = !showPay; render(); });
  const form = document.getElementById('pay-form');
  if (form) {
    const update = () => {
      const m = Number(form.months.value);
      const gross = view.tariffs[view.plate.pass] * m;
      document.getElementById('pay-amount').textContent = fmtMoney(m >= 12 ? Math.round(gross * 0.9) : gross);
    };
    form.months.addEventListener('change', update);
    update();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { payment } = await api(`/api/client/${key}/payments`, { method: 'POST', body: { operator: form.operator.value, phone: form.phone.value, months: Number(form.months.value) } });
        pendingPayment = payment;
        showPay = false;
        render();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  document.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    const contacts = view.plate.contacts.filter((_, i) => i !== Number(b.dataset.remove));
    saveContacts(contacts);
  }));
  const cf = document.getElementById('contact-form');
  cf?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveContacts([...view.plate.contacts, { name: cf.name.value, relation: cf.relation.value, phone: cf.phone.value }]);
  });
  const nb = document.getElementById('notif-btn');
  if (!('Notification' in window)) nb.hidden = true;
  else if (Notification.permission === 'granted') { nb.disabled = true; nb.innerHTML = `${icon('bell')}Notifications activées`; }
  nb.addEventListener('click', async () => {
    const res = await Notification.requestPermission();
    if (res === 'granted') { toast('Notifications activées', 'success'); render(); }
  });
}

async function saveContacts(contacts) {
  try {
    view = await api(`/api/client/${key}/contacts`, { method: 'POST', body: { contacts } });
    toast('Contacts enregistrés', 'success');
    render();
  } catch (err) { toast(err.message, 'error'); }
}

async function refresh() {
  view = await api(`/api/client/${key}`);
  render();
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/img/logo-apsig.svg' }); } catch { /* indisponible */ }
  }
}

function connect() {
  live(`/api/client/${key}/events`, {
    'alert:new': (e) => {
      const a = JSON.parse(e.data);
      notify('Alerte à votre adresse', `${a.typeLabel} — la centrale APSIG est mobilisée.`);
      refresh();
    },
    alert: () => refresh(),
    refresh: () => refresh(),
    payment: (e) => {
      const p = JSON.parse(e.data);
      if (pendingPayment && p.id === pendingPayment.id && p.status !== 'en_attente') {
        pendingPayment = null;
        if (p.status === 'réussi') { toast(`Paiement reçu : ${fmtMoney(p.amount)}`, 'success'); notify('Paiement reçu', `${fmtMoney(p.amount)} via ${p.operator}`); } else toast(`Paiement échoué : ${p.reason ?? ''}`, 'error');
        refresh();
      }
    },
  });
}

try {
  await refresh();
  pendingPayment = view.payments.find((p) => p.status === 'en_attente') ?? null;
  if (pendingPayment) render();
  connect();
} catch {
  app.innerHTML = `<section class="c-card"><h2>${icon('alert')}Espace introuvable</h2><p class="muted">Ce lien n'est pas valide. Utilisez le lien reçu par SMS ou contactez APSIG.</p></section>`;
}
