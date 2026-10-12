'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SiteHeader from '../SiteHeader';
import { Badge, Button, DemoRibbon, EmptyState, Field, Icon, Modal, Plate, Spinner, cx, inputCls } from '../ui';
import { api, fmtDate, fmtMoney, toast } from '@/lib/common';
import { useClickOutside, useLive } from '@/lib/hooks';

const PAGE = 24;
const isActiveSub = (p) => p.subscription.expiresAt > Date.now();
const amountFor = (tariff, months) => (months >= 12 ? Math.round(tariff * months * 0.9) : tariff * months);

function ManageMenu({ p, isAdmin, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const item = 'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface-2';
  const pick = (act) => { setOpen(false); onAction(act, p); };
  return (
    <div ref={ref} className="relative flex-1">
      <Button size="sm" className="w-full" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="chevronDown" />Gérer</Button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full z-20 mb-2 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <a role="menuitem" href={`/client/${p.clientKey}`} target="_blank" rel="noopener" className={item}><Icon name="user" />Espace client</a>
          {isAdmin && (
            <>
              <button role="menuitem" type="button" className={item} onClick={() => pick('edit')}><Icon name="edit" />Modifier</button>
              <button role="menuitem" type="button" className={item} onClick={() => pick('pay')}><Icon name="wallet" />Encaisser (Mobile Money)</button>
              <button role="menuitem" type="button" className={item} onClick={() => pick('regen')}><Icon name="refresh" />Régénérer le QR</button>
              <button role="menuitem" type="button" className={cx(item, p.status === 'active' && '!text-agression')} onClick={() => pick('toggle')}><Icon name="ban" />{p.status === 'active' ? 'Désactiver' : 'Réactiver'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PlateCard({ p, isAdmin, onAction, printing }) {
  return (
    <article className={cx('flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:shadow-lg', p.status !== 'active' && 'opacity-70')}>
      <Plate plate={p} className={printing ? 'print-target' : ''} />
      <div className="flex flex-wrap gap-1.5">
        {p.status !== 'active' && <Badge tone="danger">Désactivée</Badge>}
        {isActiveSub(p) ? <Badge tone="success">Abonnement jusqu'au {fmtDate(p.subscription.expiresAt)}</Badge> : <Badge tone="warning">Expiré depuis le {fmtDate(p.subscription.expiresAt)}</Badge>}
        {p.tokenHistory?.length > 0 && <Badge>QR v{p.tokenHistory.length + 1}</Badge>}
      </div>
      <div className="grid gap-1 text-[13px] text-muted">
        <strong className="text-[15px] text-ink">{p.label}</strong>
        <span className="flex items-center gap-1.5"><Icon name="pin" className="size-3.5" />{p.quartier}, {p.commune} · {p.kind}</span>
        <span className="flex items-center gap-1.5"><Icon name="user" className="size-3.5" />{p.owner.name} · <span className="mono">{p.owner.phone}</span></span>
        <span className="flex items-center gap-1.5"><Icon name="users" className="size-3.5" />{p.contacts.length} contact(s){p.community ? ' · chef de quartier' : ''} · {p.alertCount} alerte(s)</span>
        <span className="flex items-center gap-1.5"><Icon name="keypad" className="size-3.5" />USSD <span className="mono">*789*{p.shortCode}#</span></span>
      </div>
      <div className="mt-auto flex gap-2 pt-1">
        <Button as="a" size="sm" variant="primary" className="flex-1" href={`/s/${p.token}`} target="_blank" rel="noopener"><Icon name="external" />SOS</Button>
        <Button size="sm" className="flex-1" onClick={() => onAction('print', p)}><Icon name="print" />Imprimer</Button>
        <ManageMenu p={p} isAdmin={isAdmin} onAction={onAction} />
      </div>
    </article>
  );
}

function PlateForm({ plate, refData, onSaved, onCancel }) {
  const communes = refData.communes;
  const [form, setForm] = useState(() => ({
    communeCode: communes[0].code,
    quartierCode: communes[0].quartiers[0].code,
    number: '',
    kind: plate?.kind ?? refData.kinds[0],
    label: plate?.label ?? '',
    ownerName: plate?.owner.name ?? '',
    ownerPhone: plate?.owner.phone ?? '+225 07 ',
    pass: plate?.pass ?? 'bleu',
    community: true,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const commune = communes.find((c) => c.code === form.communeCode);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const body = plate
      ? { kind: form.kind, label: form.label, ownerName: form.ownerName, ownerPhone: form.ownerPhone, pass: form.pass }
      : form;
    try {
      const { plate: saved } = await api(plate ? `/api/admin/plates/${plate.id}` : '/api/admin/plates', { method: 'POST', body });
      toast(plate ? 'Plaque modifiée' : 'Plaque créée', 'success');
      onSaved(saved, !plate);
    } catch (err) { toast(err.message, 'error'); setBusy(false); }
  }

  return (
    <form id="plate-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      {!plate && (
        <>
          <Field label="Commune">
            <select className={inputCls} value={form.communeCode} onChange={(e) => { const c = communes.find((x) => x.code === e.target.value); setForm({ ...form, communeCode: c.code, quartierCode: c.quartiers[0].code }); }}>
              {communes.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Quartier">
            <select className={inputCls} value={form.quartierCode} onChange={set('quartierCode')}>
              {commune.quartiers.map((q) => <option key={q.code} value={q.code}>{q.name}</option>)}
            </select>
          </Field>
          <Field label="Numéro (facultatif)" hint="Le code sera ABJ-COMMUNE-QUARTIER-NNN">
            <input className={inputCls} type="number" min="1" max="999" placeholder="Automatique" value={form.number} onChange={set('number')} />
          </Field>
        </>
      )}
      <Field label="Type de lieu">
        <select className={inputCls} value={form.kind} onChange={set('kind')}>{refData.kinds.map((k) => <option key={k}>{k}</option>)}</select>
      </Field>
      <Field label="Libellé" className="sm:col-span-2">
        <input className={inputCls} required maxLength={80} value={form.label} onChange={set('label')} placeholder="Ex. : Villa 12, résidence Les Cocotiers" />
      </Field>
      <Field label="Titulaire"><input className={inputCls} required maxLength={60} value={form.ownerName} onChange={set('ownerName')} /></Field>
      <Field label="Téléphone"><input className={inputCls} required inputMode="tel" value={form.ownerPhone} onChange={set('ownerPhone')} /></Field>
      <fieldset className="sm:col-span-2">
        <legend className="text-[13px] font-semibold text-ink">Pass</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {['bleu', 'rouge'].map((pass) => (
            <label key={pass} className={cx('flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition', form.pass === pass ? (pass === 'rouge' ? 'border-pass-rouge bg-pass-rouge text-white' : 'border-pass-bleu bg-pass-bleu text-white') : 'border-line text-ink hover:bg-surface-2')}>
              <input type="radio" name="pass" value={pass} checked={form.pass === pass} onChange={set('pass')} className="sr-only" />
              {pass === 'rouge' ? 'Pass Rouge Premium' : 'Pass Bleu'} · {fmtMoney(refData.tariffs[pass])}/mois
            </label>
          ))}
        </div>
      </fieldset>
      {!plate && (
        <>
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2"><input type="checkbox" checked={form.community} onChange={set('community')} className="size-4 accent-brand" />Prévenir le chef de quartier en cas d'alerte</label>
          <p className="text-sm text-muted sm:col-span-2">Une période d'essai de 30 jours est appliquée à la création.</p>
        </>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
        <Button onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary" disabled={busy}><Icon name="check" />{plate ? 'Enregistrer' : 'Créer la plaque'}</Button>
      </div>
    </form>
  );
}

function PaymentForm({ plate, refData, onDone, onCancel }) {
  const [operator, setOperator] = useState(refData.mobileMoney[0]);
  const [phone, setPhone] = useState(plate.owner.phone);
  const [months, setMonths] = useState(1);
  async function save(e) {
    e.preventDefault();
    try {
      const { payment } = await api(`/api/admin/plates/${plate.id}/payments`, { method: 'POST', body: { operator, phone, months: Number(months) } });
      toast(`Demande envoyée : ${fmtMoney(payment.amount)} via ${payment.operator}. En attente de validation…`);
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  }
  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className="text-[13px] font-semibold text-ink">Opérateur</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {refData.mobileMoney.map((m) => (
            <label key={m} className={cx('flex h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-semibold transition', operator === m ? 'border-brand bg-brand text-white' : 'border-line text-ink hover:bg-surface-2')}>
              <input type="radio" name="operator" checked={operator === m} onChange={() => setOperator(m)} className="sr-only" />{m}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Numéro Mobile Money"><input className={inputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <Field label="Durée">
        <select className={inputCls} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} mois{m === 12 ? ' (-10 %)' : ''}</option>)}
        </select>
      </Field>
      <p className="text-ink sm:col-span-2">Montant : <strong className="text-xl">{fmtMoney(amountFor(refData.tariffs[plate.pass], months))}</strong> <small className="text-muted">(tarifs fictifs)</small></p>
      <p className="text-sm text-muted sm:col-span-2">Le client valide sur son téléphone ; la confirmation arrive en quelques secondes (simulation). Un numéro finissant par 0000 simule un échec.</p>
      <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
        <Button onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="success"><Icon name="wallet" />Envoyer la demande</Button>
      </div>
    </form>
  );
}

export default function Plaques() {
  const [me, setMe] = useState(null);
  const [plates, setPlates] = useState(null);
  const [refData, setRefData] = useState(null);
  const [tab, setTab] = useState('plates');
  const [filters, setFilters] = useState({ q: '', pass: '', commune: '', status: '' });
  const [shown, setShown] = useState(PAGE);
  const [modal, setModal] = useState(null); // { kind: 'form' | 'pay', plate }
  const [payments, setPayments] = useState(null);
  const [printing, setPrinting] = useState(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const isAdmin = (me?.rank ?? 0) >= 3;

  useEffect(() => {
    Promise.all([api('/api/auth/me'), api('/api/ops/plates'), api('/api/ops/referentiel')])
      .then(([{ user }, data, referentiel]) => {
        setMe(user);
        setRefData(referentiel);
        setPlates([...data.plates].sort((a, b) => (b.showcase - a.showcase) || (a.showcase ? 0 : a.code.localeCompare(b.code))));
      })
      .catch(() => { window.location.href = '/connexion?next=/plaques'; });
  }, []);

  const loadPayments = () => api('/api/admin/payments').then((r) => setPayments(r.payments)).catch((err) => toast(err.message, 'error'));

  const upsert = (p) => setPlates((list) => {
    const i = list.findIndex((x) => x.id === p.id);
    if (i < 0) return [p, ...list];
    const next = [...list];
    next[i] = p;
    return next;
  });

  useLive(me ? '/api/ops/events' : null, {
    plate: (p) => upsert(p),
    payment: (p) => {
      if (p.status === 'réussi') toast(`Paiement reçu : ${fmtMoney(p.amount)} (${p.operator}) — ${p.code}`, 'success');
      if (p.status === 'échec') toast(`Paiement échoué (${p.code}) : ${p.reason}`, 'error');
      if (tabRef.current === 'payments') loadPayments();
    },
  });

  const communes = useMemo(() => [...new Set((plates ?? []).map((p) => p.commune))].sort((a, b) => a.localeCompare(b, 'fr')), [plates]);
  const list = useMemo(() => {
    if (!plates) return [];
    const q = filters.q.trim().toLowerCase();
    return plates.filter((p) => (!filters.pass || p.pass === filters.pass)
      && (!filters.commune || p.commune === filters.commune)
      && (!filters.status || (filters.status === 'expired' ? !isActiveSub(p) : p.status === filters.status))
      && (!q || [p.code, p.shortCode, p.quartier, p.commune, p.label, p.owner.name, p.kind].join(' ').toLowerCase().includes(q)));
  }, [plates, filters]);

  const setFilter = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setShown(PAGE); };

  async function mutate(url, body, message) {
    try {
      const { plate } = await api(url, { method: 'POST', body });
      upsert(plate);
      toast(message, 'success');
    } catch (err) { toast(err.message, 'error'); }
  }

  function onAction(act, p) {
    if (act === 'print') {
      setPrinting(p.id);
      document.body.classList.add('printing');
      setTimeout(() => {
        window.print();
        document.body.classList.remove('printing');
        setPrinting(null);
      }, 400);
    }
    if (act === 'edit') setModal({ kind: 'form', plate: p });
    if (act === 'pay') setModal({ kind: 'pay', plate: p });
    if (act === 'regen' && window.confirm(`Régénérer le QR de ${p.code} ? L'ancien QR cessera immédiatement de fonctionner : il faudra réimprimer la plaque.`)) {
      mutate(`/api/admin/plates/${p.id}/regenerate`, {}, 'Nouveau QR généré — pensez à réimprimer la plaque');
    }
    if (act === 'toggle') {
      const next = p.status === 'active' ? 'inactive' : 'active';
      if (next === 'inactive' && !window.confirm(`Désactiver ${p.code} ? Le QR et le code USSD afficheront « plaque désactivée ».`)) return;
      mutate(`/api/admin/plates/${p.id}/status`, { status: next }, next === 'active' ? 'Plaque réactivée' : 'Plaque désactivée');
    }
  }

  const blue = plates?.filter((p) => p.pass === 'bleu').length ?? 0;
  const segBtn = (active) => cx('h-10 cursor-pointer rounded-lg px-4 text-sm font-bold transition', active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink');

  return (
    <>
      <SiteHeader subtitle="Back-office des plaques" current="/plaques" user={me} links={[{ href: '/', label: 'Accueil' }, { href: '/centrale', label: 'Centrale' }, { href: '/plaques', label: 'Plaques' }]} />
      <DemoRibbon className="no-print">Prototype — titulaires, numéros, établissements et paiements fictifs.</DemoRibbon>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="no-print flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Parc de plaques</h1>
            <p className="mt-1 text-muted">Adresse Code-Secours unique, QR code, code USSD et abonnement pour chaque plaque.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {plates && (
              <>
                <Badge>{plates.length} plaques</Badge>
                <Badge tone="bleu">{blue} Pass Bleu</Badge>
                <Badge tone="rouge">{plates.length - blue} Pass Rouge</Badge>
                <Badge tone="warning">{plates.filter((p) => !isActiveSub(p)).length} expirées</Badge>
              </>
            )}
            {isAdmin && <Button variant="primary" onClick={() => setModal({ kind: 'form', plate: null })}><Icon name="plus" />Nouvelle plaque</Button>}
          </div>
        </div>

        {isAdmin && (
          <div role="group" aria-label="Vue" className="no-print mt-6 inline-flex rounded-xl bg-surface-3 p-1">
            <button type="button" aria-pressed={tab === 'plates'} className={segBtn(tab === 'plates')} onClick={() => setTab('plates')}>Plaques</button>
            <button type="button" aria-pressed={tab === 'payments'} className={segBtn(tab === 'payments')} onClick={() => { setTab('payments'); loadPayments(); }}>Paiements Mobile Money</button>
          </div>
        )}

        {tab === 'plates' ? (
          <>
            <div className="no-print mt-6 grid gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
              <label className="relative">
                <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input type="search" value={filters.q} onChange={setFilter('q')} placeholder="Code, code USSD, quartier, titulaire…" aria-label="Rechercher" className={cx(inputCls, 'pl-9')} />
              </label>
              <select className={inputCls} value={filters.pass} onChange={setFilter('pass')} aria-label="Pass"><option value="">Tous les Pass</option><option value="bleu">Pass Bleu</option><option value="rouge">Pass Rouge Premium</option></select>
              <select className={inputCls} value={filters.commune} onChange={setFilter('commune')} aria-label="Commune"><option value="">Toutes communes</option>{communes.map((c) => <option key={c}>{c}</option>)}</select>
              <select className={inputCls} value={filters.status} onChange={setFilter('status')} aria-label="Statut"><option value="">Tous statuts</option><option value="active">Actives</option><option value="inactive">Désactivées</option><option value="expired">Abonnement expiré</option></select>
            </div>

            {!plates ? (
              <div className="grid place-items-center py-24 text-muted"><Spinner className="size-8" /></div>
            ) : list.length === 0 ? (
              <EmptyState icon="search" title="Aucune plaque ne correspond">Modifiez la recherche ou les filtres.</EmptyState>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {list.slice(0, shown).map((p) => <PlateCard key={p.id} p={p} isAdmin={isAdmin} onAction={onAction} printing={printing === p.id} />)}
              </div>
            )}
            {list.length > shown && (
              <div className="no-print mt-8 mb-12 flex justify-center">
                <Button onClick={() => setShown(shown + PAGE)}>Afficher plus ({list.length - shown} restantes)</Button>
              </div>
            )}
          </>
        ) : (
          <div className="mt-6 mb-12 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-2 text-xs tracking-wider text-muted uppercase">
                <tr>{['Date', 'Plaque', 'Opérateur', 'Numéro', 'Durée', 'Montant', 'Canal', 'Statut'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {!payments ? (
                  <tr><td colSpan={8} className="py-10 text-center text-muted"><Spinner /></td></tr>
                ) : payments.map((x) => (
                  <tr key={x.id} className="hover:bg-surface-2">
                    <td className="mono px-4 py-3">{fmtDate(x.at)}</td>
                    <td className="mono px-4 py-3">{x.code}</td>
                    <td className="px-4 py-3">{x.operator}</td>
                    <td className="mono px-4 py-3">{x.phone}</td>
                    <td className="px-4 py-3">{x.months} mois</td>
                    <td className="px-4 py-3 font-bold">{fmtMoney(x.amount)}</td>
                    <td className="px-4 py-3">{x.via === 'client' ? 'Espace client' : 'Back-office'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={x.status === 'réussi' ? 'success' : x.status === 'échec' ? 'danger' : 'warning'}>{x.status}</Badge>
                      {x.reason && <small className="block text-muted">{x.reason}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Modal size="lg" open={modal?.kind === 'form'} onClose={() => setModal(null)} title={modal?.plate ? `Modifier ${modal.plate.code}` : 'Nouvelle plaque'}>
        {modal?.kind === 'form' && refData && (
          <PlateForm
            plate={modal.plate}
            refData={refData}
            onCancel={() => setModal(null)}
            onSaved={(saved, created) => {
              upsert(saved);
              setModal(null);
              if (created) { setFilters({ q: saved.code, pass: '', commune: '', status: '' }); setShown(PAGE); }
            }}
          />
        )}
      </Modal>
      <Modal open={modal?.kind === 'pay'} onClose={() => setModal(null)} title={modal?.plate ? `Encaisser · ${modal.plate.code}` : ''}>
        {modal?.kind === 'pay' && refData && <PaymentForm plate={modal.plate} refData={refData} onDone={() => setModal(null)} onCancel={() => setModal(null)} />}
      </Modal>
    </>
  );
}
