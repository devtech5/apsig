'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import SiteHeader from '../SiteHeader';
import { Badge, Button, Card, DemoRibbon, EmptyState, Field, Icon, Plate, Spinner, StatusPill, cx, inputCls } from '../ui';
import { api, fmtDate, fmtMoney, fmtTime, toast, STATUS_META, TYPE_META } from '@/lib/common';
import { useLive } from '@/lib/hooks';

const daysLeft = (ts) => Math.ceil((ts - Date.now()) / 86400000);
const MONTHS = [1, 3, 12];

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/img/logo-apsig.svg' }); } catch { /* indisponible */ }
  }
}

function SectionTitle({ icon, children }) {
  return <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand"><Icon name={icon} /></span>{children}</h2>;
}

export default function Client() {
  const { key } = useParams();
  const [view, setView] = useState(null);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState(null);
  const [showPay, setShowPay] = useState(false);
  const [pay, setPay] = useState({ operator: '', phone: '', months: 1 });
  const [contact, setContact] = useState({ name: '', relation: '', phone: '' });
  const [notifState, setNotifState] = useState('unsupported');
  const pendingRef = useRef(null);
  pendingRef.current = pending;

  const refresh = useCallback(async () => {
    const v = await api(`/api/client/${key}`);
    setView(v);
    return v;
  }, [key]);

  useEffect(() => {
    refresh()
      .then((v) => {
        setPending(v.payments.find((p) => p.status === 'en_attente') ?? null);
        setPay({ operator: v.mobileMoney[0], phone: v.plate.owner.phone, months: 1 });
      })
      .catch(() => setMissing(true));
    if ('Notification' in window) setNotifState(Notification.permission);
  }, [refresh]);

  useLive(view ? `/api/client/${key}/events` : null, {
    'alert:new': (a) => { notify('Alerte à votre adresse', `${a.typeLabel} — la centrale APSIG est mobilisée.`); refresh(); },
    alert: () => refresh(),
    refresh: () => refresh(),
    payment: (p) => {
      const cur = pendingRef.current;
      if (cur && p.id === cur.id && p.status !== 'en_attente') {
        setPending(null);
        if (p.status === 'réussi') { toast(`Paiement reçu : ${fmtMoney(p.amount)}`, 'success'); notify('Paiement reçu', `${fmtMoney(p.amount)} via ${p.operator}`); } else toast(`Paiement échoué : ${p.reason ?? ''}`, 'error');
        refresh();
      }
    },
  });

  async function saveContacts(contacts) {
    try {
      setView(await api(`/api/client/${key}/contacts`, { method: 'POST', body: { contacts } }));
      toast('Contacts enregistrés', 'success');
      return true;
    } catch (err) { toast(err.message, 'error'); return false; }
  }

  async function submitPay(e) {
    e.preventDefault();
    try {
      const { payment } = await api(`/api/client/${key}/payments`, { method: 'POST', body: { operator: pay.operator, phone: pay.phone, months: Number(pay.months) } });
      setPending(payment);
      setShowPay(false);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function addContact(e) {
    e.preventDefault();
    if (await saveContacts([...view.plate.contacts, contact])) setContact({ name: '', relation: '', phone: '' });
  }

  async function enableNotifications() {
    const res = await Notification.requestPermission();
    setNotifState(res);
    if (res === 'granted') toast('Notifications activées', 'success');
  }

  let content;
  if (missing) {
    content = (
      <Card className="text-center">
        <EmptyState icon="alert" title="Espace introuvable">Ce lien n'est pas valide. Utilisez le lien reçu par SMS ou contactez APSIG.</EmptyState>
      </Card>
    );
  } else if (!view) {
    content = <div className="grid place-items-center py-24 text-muted"><Spinner className="size-8" /></div>;
  } else {
    const { plate, openAlert, alerts, payments, tariffs, mobileMoney } = view;
    const sub = plate.subscription;
    const gross = tariffs[plate.pass] * Number(pay.months);
    const amount = Number(pay.months) >= 12 ? Math.round(gross * 0.9) : gross;
    content = (
      <>
        {openAlert && (
          <div role="alert" className="flex items-center gap-3 rounded-2xl bg-agression p-4 text-white shadow-lg">
            <span className="grid size-11 shrink-0 animate-pulse place-items-center rounded-xl bg-white/20"><Icon name={TYPE_META[openAlert.type].icon} className="size-6" /></span>
            <div>
              <strong>Alerte en cours à votre adresse : {openAlert.typeLabel}</strong>
              <p className="text-sm text-white/85">{STATUS_META[openAlert.status].label}{openAlert.unit ? ` · Unité ${openAlert.unit.name}${openAlert.eta ? ` · ~${openAlert.eta} min` : ''}` : ''}</p>
            </div>
          </div>
        )}

        <section className="grid items-center gap-8 rounded-3xl border border-line bg-surface p-6 shadow-card md:grid-cols-[1fr_minmax(0,360px)]">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Bonjour {plate.owner.name.split(' ')[0]}</h1>
            <p className="mt-2 text-muted">{plate.label}<br />{plate.quartier}, {plate.commune}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={plate.pass}>{plate.pass === 'rouge' ? 'Pass Rouge Premium' : 'Pass Bleu'}</Badge>
              {plate.status !== 'active' && <Badge tone="danger">Plaque désactivée</Badge>}
            </div>
            <p className="mt-3 text-sm text-muted">Sans Internet : <strong className="mono text-ink">{plate.ussd}</strong></p>
            {notifState !== 'unsupported' && (
              <Button size="sm" className="mt-4" disabled={notifState === 'granted'} onClick={enableNotifications}>
                <Icon name="bell" />{notifState === 'granted' ? 'Notifications activées' : 'Activer les notifications'}
              </Button>
            )}
          </div>
          <Plate plate={plate} />
        </section>

        <Card>
          <SectionTitle icon="wallet">Abonnement</SectionTitle>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <strong className={cx('text-lg', sub.active ? 'text-success' : 'text-warning-ink')}>{sub.active ? `Actif jusqu'au ${fmtDate(sub.expiresAt)}` : `Expiré depuis le ${fmtDate(sub.expiresAt)}`}</strong>
              <p className="text-sm text-muted">{sub.active ? `${daysLeft(sub.expiresAt)} jour(s) restant(s)` : 'Vos alertes restent traitées, mais pensez à renouveler.'} · {fmtMoney(tariffs[plate.pass])} / mois</p>
            </div>
            {!pending && <Button variant="primary" onClick={() => setShowPay(!showPay)} aria-expanded={showPay}><Icon name="wallet" />Renouveler via Mobile Money</Button>}
          </div>
          {pending && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-warning-bg p-4 text-sm text-ink">
              <Spinner className="size-5 text-warning" />
              <div>Validez le paiement de <strong>{fmtMoney(pending.amount)}</strong> sur votre téléphone ({pending.operator}).<br /><small className="text-muted">Simulation : confirmation automatique dans quelques secondes.</small></div>
            </div>
          )}
          {showPay && !pending && (
            <form onSubmit={submitPay} className="mt-5 grid gap-4 rounded-2xl bg-surface-2 p-4">
              <fieldset>
                <legend className="text-[13px] font-semibold text-ink">Opérateur</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mobileMoney.map((m) => (
                    <label key={m} className={cx('flex h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-semibold transition', pay.operator === m ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:border-brand-500/50')}>
                      <input type="radio" name="operator" value={m} checked={pay.operator === m} onChange={() => setPay({ ...pay, operator: m })} className="sr-only" />{m}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Numéro Mobile Money"><input className={inputCls} value={pay.phone} onChange={(e) => setPay({ ...pay, phone: e.target.value })} inputMode="tel" required /></Field>
                <Field label="Durée">
                  <select className={inputCls} value={pay.months} onChange={(e) => setPay({ ...pay, months: e.target.value })}>
                    {MONTHS.map((m) => <option key={m} value={m}>{m} mois{m === 12 ? ' (-10 %)' : ''}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-2xl font-extrabold text-ink">{fmtMoney(amount)}</span>
                <Button type="submit" variant="success" size="lg"><Icon name="check" />Payer</Button>
              </div>
              <small className="text-muted">Tarifs fictifs. Astuce démo : un numéro se terminant par 0000 simule un solde insuffisant.</small>
            </form>
          )}
        </Card>

        <Card>
          <SectionTitle icon="users">Personnes à prévenir ({plate.contacts.length}/5)</SectionTitle>
          <p className="mt-1 text-sm text-muted">Elles reçoivent un SMS dès qu'une alerte est déclenchée à votre adresse.</p>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {plate.contacts.length ? plate.contacts.map((c, i) => (
              <li key={`${c.phone}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 place-items-center rounded-full bg-surface-3 text-sm font-bold text-muted">{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="flex-1"><strong className="block text-sm text-ink">{c.name}</strong><small className="text-muted">{c.relation} · <span className="mono">{c.phone}</span></small></span>
                <Button variant="ghost" size="sm" aria-label={`Retirer ${c.name}`} onClick={() => saveContacts(plate.contacts.filter((_, j) => j !== i))}><Icon name="trash" /></Button>
              </li>
            )) : <li className="px-4 py-3 text-sm text-muted">Aucun contact pour le moment.</li>}
          </ul>
          {plate.contacts.length < 5 && (
            <form onSubmit={addContact} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input className={inputCls} placeholder="Nom" required maxLength={60} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-label="Nom" />
              <input className={inputCls} placeholder="Lien (sœur, voisin…)" maxLength={30} value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })} aria-label="Lien" />
              <input className={inputCls} placeholder="+225 07 …" inputMode="tel" required value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-label="Téléphone" />
              <Button type="submit" variant="primary"><Icon name="plus" />Ajouter</Button>
            </form>
          )}
          {plate.community && <p className="mt-3 text-sm text-muted">Responsable communautaire prévenu : {plate.community.name}</p>}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle icon="history">Alertes à votre adresse</SectionTitle>
            <ul className="mt-4 grid gap-2">
              {alerts.length ? alerts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                  <Badge tone={a.type}>{TYPE_META[a.type].short}</Badge>
                  <span className="flex-1 text-sm text-ink">{fmtDate(a.createdAt)} à {fmtTime(a.createdAt)}<small className="block text-muted">{a.outcome ?? STATUS_META[a.status].label}</small></span>
                  <StatusPill meta={STATUS_META[a.status]} />
                </li>
              )) : <li className="text-sm text-muted">Aucune alerte enregistrée.</li>}
            </ul>
          </Card>
          <Card>
            <SectionTitle icon="wallet">Paiements</SectionTitle>
            <ul className="mt-4 grid gap-2">
              {payments.length ? payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                  <span className="flex-1 text-sm text-ink"><strong>{fmtMoney(p.amount)}</strong> · {p.months} mois<small className="block text-muted">{fmtDate(p.at)} · {p.operator} · réf. <span className="mono">{p.ref}</span></small></span>
                  <Badge tone={p.status === 'réussi' ? 'success' : p.status === 'échec' ? 'danger' : 'warning'}>{p.status}</Badge>
                </li>
              )) : <li className="text-sm text-muted">Aucun paiement.</li>}
            </ul>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader subtitle="Mon espace Code-Secours" links={[]} />
      <DemoRibbon>Prototype — titulaire, contacts et paiements fictifs (Mobile Money simulé).</DemoRibbon>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6">{content}</main>
    </>
  );
}
