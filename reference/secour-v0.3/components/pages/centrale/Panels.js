'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, EmptyState, Icon, Spinner, StatusPill, cx, inputCls } from '../../ui';
import { api, fmtDate, fmtDateShort, fmtTime, fmtTimeSec, isOpen, startOfToday, toast, SOURCE_LABEL, STATUS_META, TYPE_META } from '@/lib/common';
import { HeatMap } from './maps';
import { CHANNEL_ICON, TrustBadge } from './Detail';

export function PanelHead({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

function Table({ head, children, minWidth = 900, tall }) {
  return (
    <div className={cx('overflow-auto rounded-2xl border border-line bg-surface', tall && 'max-h-[60vh]')}>
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        <thead className="sticky top-0 z-10 bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line text-ink">{children}</tbody>
      </table>
    </div>
  );
}

const td = 'px-3 py-2.5 align-top';
const selectCls = cx(inputCls, 'h-10 w-auto');

// --- Historique ------------------------------------------------------------------------
export function History({ communes, refreshKey, onOpenAlert }) {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ q: '', type: '', status: '', source: '', commune: '' });

  const load = useCallback(() => {
    api(`/api/ops/alerts?days=${days}`).then((r) => setRows(r.alerts)).catch((err) => toast(err.message, 'error'));
  }, [days]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!refreshKey) return undefined;
    const t = setTimeout(load, 600);
    return () => clearTimeout(t);
  }, [refreshKey, load]);

  const list = useMemo(() => {
    if (!rows) return [];
    const q = f.q.trim().toLowerCase();
    const from = days === 1 ? startOfToday() : 0;
    return rows.filter((a) => a.createdAt >= from
      && (!f.type || a.type === f.type)
      && (!f.status || (f.status === 'open' ? isOpen(a) : f.status === 'fausse' ? a.outcome?.startsWith('Fausse') : a.status === f.status))
      && (!f.source || a.source === f.source)
      && (!f.commune || a.commune === f.commune)
      && (!q || [a.id, a.code, a.quartier, a.commune, a.outcome, a.unit?.name].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rows, f, days]);

  const by = (t) => list.filter((a) => a.type === t).length;
  const acked = list.filter((a) => a.ackAt && a.status !== 'annulee');
  const avgAck = acked.length ? Math.round(acked.reduce((s, a) => s + (a.ackAt - a.createdAt), 0) / acked.length / 1000) : 0;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PanelHead title="Historique & traçabilité" subtitle="Chaque alerte est horodatée de bout en bout : déclenchement, prise en charge, arrivée, clôture.">
        <Button as="a" href={`/api/ops/alerts.csv?days=${Math.max(days, 1)}`}><Icon name="download" />Exporter (CSV)</Button>
      </PanelHead>
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-60 flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input type="search" value={f.q} onChange={set('q')} placeholder="Code plaque, ID, quartier, issue…" aria-label="Rechercher" className={cx(inputCls, 'h-10 pl-9')} />
        </label>
        <select className={selectCls} value={f.type} onChange={set('type')} aria-label="Type"><option value="">Tous types</option><option value="agression">Agression</option><option value="medical">Médical</option><option value="incendie">Incendie</option></select>
        <select className={selectCls} value={f.status} onChange={set('status')} aria-label="Statut"><option value="">Tous statuts</option><option value="open">En cours</option><option value="cloturee">Clôturées</option><option value="annulee">Annulées</option><option value="fausse">Fausses alertes</option></select>
        <select className={selectCls} value={f.source} onChange={set('source')} aria-label="Source"><option value="">Toutes sources</option><option value="qr">QR code</option><option value="ussd">USSD</option><option value="sms">SMS</option><option value="demo">Simulation</option></select>
        <select className={selectCls} value={f.commune} onChange={set('commune')} aria-label="Commune"><option value="">Toutes communes</option>{communes.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={selectCls} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Période"><option value={1}>Aujourd'hui</option><option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option></select>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge>{list.length} alertes</Badge>
        <Badge tone="agression">{by('agression')} agressions</Badge>
        <Badge tone="medical">{by('medical')} médicales</Badge>
        <Badge tone="incendie">{by('incendie')} incendies</Badge>
        <Badge tone="warning">{list.filter((a) => a.outcome?.startsWith('Fausse')).length} fausses alertes</Badge>
        <Badge tone="success">Prise en charge moyenne : {avgAck} s</Badge>
      </div>
      <Table head={['ID', 'Déclenchée', 'Source', 'Plaque', 'Localisation', 'Type', 'Unité', 'Prise en charge', 'Arrivée', 'Fiabilité', 'Statut', 'Issue']} minWidth={1180}>
        {!rows ? (
          <tr><td colSpan={12} className="py-10 text-center text-muted"><Spinner /></td></tr>
        ) : list.length === 0 ? (
          <tr><td colSpan={12}><EmptyState icon="search">Aucune alerte pour ces filtres.</EmptyState></td></tr>
        ) : list.slice(0, 500).map((a) => (
          <tr key={a.id} onClick={() => onOpenAlert(a.id)} className="cursor-pointer transition hover:bg-surface-2">
            <td className={cx(td, 'mono')}>{a.id}</td>
            <td className={cx(td, 'mono whitespace-nowrap')}>{fmtDate(a.createdAt)} {fmtTime(a.createdAt)}</td>
            <td className={td}>{SOURCE_LABEL[a.source] ?? a.source}</td>
            <td className={cx(td, 'mono whitespace-nowrap')}>{a.code} {a.pass === 'rouge' && <Badge tone="rouge">R</Badge>}</td>
            <td className={td}>{a.quartier}, {a.commune}</td>
            <td className={td}><Badge tone={a.type}>{TYPE_META[a.type].short}</Badge></td>
            <td className={td}>{a.unit?.name ?? '—'}</td>
            <td className={cx(td, 'mono whitespace-nowrap')}>{a.ackAt ? `${Math.round((a.ackAt - a.createdAt) / 1000)} s` : '—'} {a.escalation?.level > 0 && <Badge tone="danger">N{a.escalation.level}</Badge>}</td>
            <td className={cx(td, 'mono')}>{a.onSiteAt ? `${Math.round((a.onSiteAt - a.createdAt) / 60000)} min` : '—'}</td>
            <td className={td}><TrustBadge trust={a.trust} /></td>
            <td className={td}><StatusPill meta={STATUS_META[a.status]} /></td>
            <td className={cx(td, 'max-w-60 text-muted')}>{a.outcome ?? ''}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// --- Rapports ---------------------------------------------------------------------------
function Kpi({ label, value, tone }) {
  const color = { agression: 'text-agression', medical: 'text-medical', incendie: 'text-incendie' }[tone] ?? 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <strong className={cx('block text-2xl font-extrabold tabular-nums', color)}>{value}</strong>
      <span className="text-xs font-semibold text-muted">{label}</span>
    </div>
  );
}

export function Reports() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  useEffect(() => {
    setR(null);
    api(`/api/ops/reports?days=${days}`).then(setR).catch((err) => toast(err.message, 'error'));
  }, [days]);

  const print = () => {
    document.body.classList.add('print-report');
    window.print();
    document.body.classList.remove('print-report');
  };

  return (
    <>
      <PanelHead title="Rapports d'activité" subtitle="Synthèse pour la direction, les clients, les communes et les syndics.">
        <select className={selectCls} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Période"><option value={7}>7 jours</option><option value={30}>30 jours</option></select>
        <Button className="no-print" onClick={print}><Icon name="print" />Imprimer</Button>
      </PanelHead>
      {!r ? (
        <div className="grid place-items-center py-24 text-muted"><Spinner className="size-8" /></div>
      ) : (() => {
        const t = r.totals;
        const max = Math.max(1, ...r.byDay.map((d) => d.total));
        const hmax = Math.max(1, ...r.byHour);
        return (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="Alertes" value={t.alerts} />
              <Kpi label="Agressions" value={t.byType.agression} tone="agression" />
              <Kpi label="Malaises / accidents" value={t.byType.medical} tone="medical" />
              <Kpi label="Incendies" value={t.byType.incendie} tone="incendie" />
              <Kpi label="Prise en charge moy." value={`${t.avgAckSeconds} s`} />
              <Kpi label="Arrivée moy." value={`${t.avgArrivalMinutes} min`} />
              <Kpi label="Fausses alertes" value={<>{t.falseAlerts} <small className="text-sm text-muted">({t.alerts ? Math.round((t.falseAlerts / t.alerts) * 100) : 0} %)</small></>} />
              <Kpi label="Escalades" value={t.escalated} />
              <Kpi label="Via USSD / SMS" value={t.bySource.ussd + t.bySource.sms} />
              <Kpi label="Encaissements" value={<>{r.revenue.toLocaleString('fr-FR')} <small className="text-sm text-muted">FCFA</small></>} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-line bg-surface p-4 lg:row-span-2">
                <h3 className="mb-3 font-bold text-ink">Carte de chaleur par quartier</h3>
                <HeatMap byQuartier={r.byQuartier} />
              </section>
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="mb-3 flex items-center justify-between font-bold text-ink">Alertes par jour
                  <span className="flex gap-3 text-[11px] font-semibold text-muted"><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-agression" />Agression</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-medical" />Médical</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-incendie" />Incendie</span></span>
                </h3>
                <div className="grid h-44 items-end gap-1" style={{ gridTemplateColumns: `repeat(${r.byDay.length}, minmax(0,1fr))` }}>
                  {r.byDay.map((d, i) => (
                    <div key={d.date} className="flex h-full flex-col justify-end" title={`${fmtDate(d.date)} : ${d.agression} agressions · ${d.medical} médicales · ${d.incendie} incendies`}>
                      <div className="flex flex-col-reverse overflow-hidden rounded-t" style={{ height: `${Math.round((d.total / max) * 100)}%` }}>
                        <i className="block bg-agression" style={{ flex: d.agression }} /><i className="block bg-medical" style={{ flex: d.medical }} /><i className="block bg-incendie" style={{ flex: d.incendie }} />
                      </div>
                      <span className="mt-1 h-7 text-center text-[9px] leading-tight text-muted">{r.byDay.length <= 10 || i % 5 === 0 || i === r.byDay.length - 1 ? <><b className="text-ink">{d.total}</b><br />{fmtDateShort(d.date)}</> : ''}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="mb-3 font-bold text-ink">Répartition horaire</h3>
                <div className="grid h-32 grid-cols-24 items-end gap-0.5">
                  {r.byHour.map((n, h) => (
                    <div key={h} className="flex h-full flex-col justify-end" title={`${h} h : ${n} alertes`}>
                      <i className="block rounded-t bg-info/80" style={{ height: `${Math.round((n / hmax) * 100)}%` }} />
                      <span className="h-4 text-center text-[9px] text-muted">{h % 3 === 0 ? h : ''}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="mb-3 font-bold text-ink">Par commune</h3>
                <Table head={['Commune', 'Total', 'Agressions', 'Médical', 'Incendies', 'Arrivée moy.']} minWidth={480}>
                  {r.byCommune.map((c) => (
                    <tr key={c.key}><td className={td}>{c.key}</td><td className={cx(td, 'font-bold')}>{c.total}</td><td className={td}>{c.agression}</td><td className={td}>{c.medical}</td><td className={td}>{c.incendie}</td><td className={cx(td, 'mono')}>{c.avgArrivalMinutes} min</td></tr>
                  ))}
                </Table>
              </section>
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="mb-3 font-bold text-ink">Quartiers les plus exposés</h3>
                <ol className="grid gap-2">
                  {r.byQuartier.slice(0, 8).map((q, i) => (
                    <li key={`${q.commune}-${q.quartier}`} className="flex items-center gap-3 text-sm">
                      <span className="mono w-5 text-muted">{i + 1}</span>
                      <span className="flex-1 text-ink">{q.quartier} <small className="text-muted">{q.commune}</small></span>
                      <strong className="text-ink">{q.total}</strong>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        );
      })()}
    </>
  );
}

// --- Messagerie ------------------------------------------------------------------------
export function Messages({ messages }) {
  const [channel, setChannel] = useState('');
  const list = messages.filter((m) => !channel || m.channel === channel);
  return (
    <>
      <PanelHead title="Messagerie sortante" subtitle="SMS, WhatsApp, appels vocaux et radio émis automatiquement.">
        <select className={selectCls} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal">
          <option value="">Tous les canaux</option>{['SMS', 'WhatsApp', 'Appel vocal', 'Appel + SMS', 'Radio'].map((c) => <option key={c}>{c}</option>)}
        </select>
      </PanelHead>
      <Table head={['Heure', 'Canal', 'Destinataire', 'Message', 'Alerte', 'Statut']} minWidth={900}>
        {list.length === 0 ? (
          <tr><td colSpan={6}><EmptyState icon="message">Aucun message pour le moment. Déclenchez une alerte pour voir la messagerie s'animer.</EmptyState></td></tr>
        ) : list.slice(0, 300).map((m) => (
          <tr key={m.id} className="hover:bg-surface-2">
            <td className={cx(td, 'mono whitespace-nowrap')}>{fmtTimeSec(m.at)}</td>
            <td className={td}><Badge><Icon name={CHANNEL_ICON[m.channel] ?? 'message'} className="size-3" />{m.channel}</Badge></td>
            <td className={td}>{m.toName}<small className="mono block text-muted">{m.to}</small></td>
            <td className={cx(td, 'max-w-md')}>{m.text}</td>
            <td className={cx(td, 'mono')}>{m.alertId ?? '—'}</td>
            <td className={td}><Badge tone={m.status === 'envoyé' ? 'neutral' : m.status === 'échec' ? 'danger' : 'success'}>{m.status}</Badge></td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// --- Sécurité -----------------------------------------------------------------------------
export function Security({ rank, refreshKey, onBlock }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    Promise.all([api('/api/ops/devices'), api('/api/ops/audit')])
      .then(([{ devices }, { audit }]) => setData({ devices, audit }))
      .catch((err) => toast(err.message, 'error'));
  }, []);
  useEffect(load, [load, refreshKey]);

  async function backup() {
    try {
      const { file } = await api('/api/ops/backup', { method: 'POST' });
      toast(`Sauvegarde créée : ${file}`, 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <PanelHead title="Sécurité & conformité" subtitle="Appareils suspects, journal d'audit, sauvegardes. Une alerte n'est jamais rejetée : un appareil bloqué voit sa fiabilité abaissée et ses déclenchements limités.">
        {rank >= 3 && <Button onClick={backup}><Icon name="database" />Sauvegarder maintenant</Button>}
      </PanelHead>
      {!data ? (
        <div className="grid place-items-center py-24 text-muted"><Spinner className="size-8" /></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <section>
            <h3 className="mb-3 font-bold text-ink">Appareils des témoins</h3>
            <Table head={['Appareil', '24 h', 'Plaques 24 h', 'Total', 'Dernière alerte', 'Statut', '']} minWidth={640} tall>
              {data.devices.slice(0, 60).map((d) => (
                <tr key={d.id} className={cx(d.plates24h >= 3 && 'bg-agression-bg')}>
                  <td className={cx(td, 'mono')}>{d.id}</td>
                  <td className={td}>{d.last24h}</td>
                  <td className={td}>{d.plates24h}{d.plates24h >= 3 && <Badge tone="danger" className="ml-1">suspect</Badge>}</td>
                  <td className={td}>{d.total}</td>
                  <td className={cx(td, 'mono whitespace-nowrap')}>{fmtDate(d.lastAt)} {fmtTime(d.lastAt)}</td>
                  <td className={td}>{d.blocked ? <><Badge tone="danger">Bloqué</Badge><small className="block text-muted">{d.blockedBy ?? ''}</small></> : <Badge>Normal</Badge>}</td>
                  <td className={td}><Button size="sm" onClick={() => onBlock(d.id, !d.blocked)}>{d.blocked ? 'Débloquer' : 'Bloquer'}</Button></td>
                </tr>
              ))}
            </Table>
          </section>
          <section>
            <h3 className="mb-3 font-bold text-ink">Journal d'audit</h3>
            <Table head={['Heure', 'Utilisateur', 'Action', 'Cible', 'Détail']} minWidth={640} tall>
              {data.audit.map((x, i) => (
                <tr key={i}>
                  <td className={cx(td, 'mono whitespace-nowrap')}>{fmtDate(x.at)} {fmtTimeSec(x.at)}</td>
                  <td className={td}>{x.userName}</td>
                  <td className={cx(td, 'mono')}>{x.action}</td>
                  <td className={cx(td, 'mono')}>{x.target}</td>
                  <td className={cx(td, 'text-muted')}>{x.details}</td>
                </tr>
              ))}
            </Table>
          </section>
        </div>
      )}
    </>
  );
}
