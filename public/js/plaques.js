import { api, esc, icon, plateHTML, fmtDate } from './common.js';

document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

const PAGE = 24;
let plates = [];
let shown = PAGE;

const $ = (id) => document.getElementById(id);

function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const pass = $('pass').value;
  const commune = $('commune').value;
  return plates.filter((p) => (!pass || p.pass === pass)
    && (!commune || p.commune === commune)
    && (!q || [p.code, p.quartier, p.commune, p.label, p.owner.name, p.kind].join(' ').toLowerCase().includes(q)));
}

function card(p) {
  return `
    <article class="plate-card" data-token="${esc(p.token)}">
      ${plateHTML(p)}
      <div class="plate-card__meta">
        <strong>${esc(p.label)}</strong>
        <span class="plate-card__row">${icon('pin')} ${esc(p.quartier)}, ${esc(p.commune)} · ${esc(p.kind)}</span>
        <span class="plate-card__row">${icon('user')} ${esc(p.owner.name)} · <span class="mono">${esc(p.owner.phone)}</span></span>
        <span class="plate-card__row">${icon('users')} ${p.contacts.length} contact(s) famille${p.community ? ' · chef de quartier' : ''}</span>
        <span class="plate-card__row">${icon('clock')} Installée le ${fmtDate(p.installedAt)}</span>
      </div>
      <div class="plate-card__actions">
        <a class="btn btn--sm btn--primary" href="/s/${esc(p.token)}" target="_blank" rel="noopener">${icon('external')}Page SOS</a>
        <button type="button" class="btn btn--sm" data-print>${icon('print')}Imprimer</button>
      </div>
    </article>`;
}

function render() {
  const list = filtered();
  $('grid').innerHTML = list.slice(0, shown).map(card).join('') || '<p class="muted">Aucune plaque ne correspond.</p>';
  $('more').hidden = list.length <= shown;
  $('more').textContent = `Afficher plus (${list.length - shown} restantes)`;
}

$('grid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-print]');
  if (!btn) return;
  const article = btn.closest('.plate-card');
  article.classList.add('is-printing');
  document.body.classList.add('printing');
  const img = article.querySelector('.plate__qr img');
  const done = () => {
    window.print();
    article.classList.remove('is-printing');
    document.body.classList.remove('printing');
  };
  if (img && !img.complete) img.addEventListener('load', done, { once: true }); else done();
});

['q', 'pass', 'commune'].forEach((id) => $(id).addEventListener('input', () => { shown = PAGE; render(); }));
$('more').addEventListener('click', () => { shown += PAGE; render(); });

const data = await api('/api/ops/bootstrap');
// Plaques vitrines d'abord (dans l'ordre de la démo), puis le reste par code.
plates = [...data.plates].sort((a, b) => (b.showcase - a.showcase) || (a.showcase ? 0 : a.code.localeCompare(b.code)));
const blue = plates.filter((p) => p.pass === 'bleu').length;
$('counts').innerHTML = `<span class="badge">${plates.length} plaques</span><span class="badge badge--bleu">${blue} Pass Bleu</span><span class="badge badge--rouge">${plates.length - blue} Pass Rouge</span>`;
const communes = [...new Set(plates.map((p) => p.commune))].sort((a, b) => a.localeCompare(b, 'fr'));
$('commune').innerHTML += communes.map((c) => `<option>${esc(c)}</option>`).join('');
render();
