'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Icon, LiveDot, StatusPill, cx, inputCls } from '../../ui';
import { api, chrono, fmtTime, fmtTimeSec, isOpen, logout, siren, speak, startOfToday, storage, toast, SOURCE_LABEL, STATUS_META, TYPE_META } from '@/lib/common';
import { useAudioUnlock, useClickOutside, useLive, useNow } from '@/lib/hooks';
import { OpsMap } from './maps';
import Detail, { BlockDeviceModal, TrustBadge } from './Detail';
import { History, Messages, Reports, Security } from './Panels';

const VIEWS = [
  { id: 'supervision', icon: 'map', label: 'Supervision' },
  { id: 'historique', icon: 'history', label: 'Historique' },
  { id: 'rapports', icon: 'chart', label: 'Rapports' },
  { id: 'messages', icon: 'message', label: 'Messages' },
  { id: 'securite', icon: 'shieldCheck', label: 'Sécurité', minRank: 2 },
];
const SPOKEN = { agression: 'Agression', medical: 'Malaise ou accident', incendie: 'Incendie' };
const TYPE_TEXT = { agression: 'text-agression', medical: 'text-medical', incendie: 'text-incendie' };
const TYPE_ICON_BG = { agression: 'bg-agression', medical: 'bg-medical', incendie: 'bg-incendie' };
const TYPE_VAR = { agression: 'var(--color-agression)', medical: 'var(--color-medical)', incendie: 'var(--color-incendie)' };

function Dropdown({ label, children, buttonProps, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <Button {...buttonProps} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</Button>
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className={cx('absolute top-full z-[1100] mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-2xl', align === 'right' ? 'right-0' : 'left-0')}>
          {children}
        </div>
      )}
    </div>
  );
}
const menuItem = 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface-2';

function Kpi({ icon, value, label, tone, bump }) {
  const tones = { red: 'bg-agression-bg text-agression', amber: 'bg-warning-bg text-warning-ink', green: 'bg-success-bg text-success', blue: 'bg-incendie-bg text-incendie' };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span className={cx('grid size-9 shrink-0 place-items-center rounded-lg', tones[tone] ?? 'bg-surface-3 text-muted')}><Icon name={icon} /></span>
      <div className="min-w-0">
        <div key={bump} className={cx('text-xl leading-none font-extrabold text-ink tabular-nums', bump && 'animate-bump')}>{value}</div>
        <div className="mt-1 truncate text-[11px] font-semibold text-muted">{label}</div>
      </div>
    </div>
  );
}

export default function Centrale() {
  const [me, setMe] = useState(null);
  const [config, setConfig] = useState(null);
  const [alerts, setAlerts] = useState(() => new Map());
  const [units, setUnits] = useState([]);
  const [plates, setPlates] = useState([]);
  const [stats, setStats] = useState(null);
  const [bumps, setBumps] = useState({});
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('open');
  const [view, setView] = useState('supervision');
  const [live, setLive] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const [securityKey, setSecurityKey] = useState(0);
  const [blockDevice, setBlockDevice] = useState(null);
  const now = useNow(1000);
  useAudioUnlock();

  // Références à jour pour les gestionnaires temps réel.
  const st = useRef({});
  st.current = { alerts, selectedId, soundOn, view, stats };
  const lost = useRef(false);
  const rank = me?.rank ?? 0;

  useEffect(() => {
    setSoundOn(storage('local').get('cs-sound') ?? true);
    setQrToken(storage('local').get('cs-qr-plate'));
  }, []);

  const select = useCallback((id, { fly = false } = {}) => {
    setSelectedId(id);
    const a = st.current.alerts.get(id);
    if (a && fly) setFlyTarget({ lat: a.lat, lng: a.lng, t: Date.now() });
  }, []);

  const announce = useCallback((text, delay = 1900) => {
    if (!st.current.soundOn) return;
    setTimeout(() => speak(text, 'fr-FR'), delay);
  }, []);

  const applyStats = useCallback((next) => {
    const prev = st.current.stats;
    if (prev) {
      const changed = {};
      for (const k of Object.keys(next)) if (prev[k] !== next[k]) changed[k] = Date.now();
      setBumps((b) => ({ ...b, ...changed }));
    }
    setStats(next);
  }, []);

  const bootstrap = useCallback(async () => {
    const data = await api('/api/ops/bootstrap');
    setMe(data.me);
    setConfig(data.config);
    const map = new Map(data.alerts.map((a) => [a.id, a]));
    setAlerts(map);
    setUnits(data.units);
    setPlates(data.plates);
    setMessages(data.messages);
    setSelectedId((id) => (id && map.has(id) ? id : null));
    setStats(data.stats);
    setFitKey((k) => k + 1);
  }, []);

  useEffect(() => {
    bootstrap().catch((err) => {
      if (err.status === 401 || err.status === 403) window.location.href = '/connexion?next=/centrale';
      else toast(`Chargement impossible : ${err.message}`, 'error');
    });
  }, [bootstrap]);

  const upsert = useCallback((alert, isNew = false) => {
    const prev = st.current.alerts.get(alert.id);
    setAlerts((m) => new Map(m).set(alert.id, alert));
    st.current.alerts = new Map(st.current.alerts).set(alert.id, alert);
    if (isNew) {
      if (st.current.soundOn) siren();
      announce(`${alert.priority === 'critique' ? 'Alerte critique' : 'Nouvelle alerte'}. ${SPOKEN[alert.type]}. ${alert.quartier}, ${alert.commune}.${alert.pass === 'rouge' ? ' Pass Rouge Premium.' : ''}`);
      const cur = st.current.alerts.get(st.current.selectedId);
      if (!cur || cur.status !== 'nouvelle') select(alert.id, { fly: true });
    } else if (prev && (alert.escalation?.level ?? 0) > (prev.escalation?.level ?? 0)) {
      if (st.current.soundOn) siren(true);
      announce(`Escalade niveau ${alert.escalation.level}. Alerte ${SPOKEN[alert.type]} à ${alert.quartier} non prise en charge.`, 2000);
    }
    if (st.current.view === 'historique') setHistoryKey((k) => k + 1);
  }, [announce, select]);

  const run = useCallback(async (id, action, body = {}) => {
    try {
      const { alert } = await api(`/api/ops/alerts/${id}/${action}`, { method: 'POST', body });
      upsert(alert);
      return alert;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }, [upsert]);

  useLive(me ? '/api/ops/events' : null, {
    'alert:new': (a) => upsert(a, true),
    alert: (a) => upsert(a),
    stats: (s) => applyStats(s),
    units: (u) => setUnits(u),
    message: (m) => setMessages((list) => {
      const i = list.findIndex((x) => x.id === m.id);
      const next = i >= 0 ? list.map((x, j) => (j === i ? m : x)) : [m, ...list];
      return next.slice(0, 500);
    }),
    plate: (p) => setPlates((list) => {
      const i = list.findIndex((x) => x.id === p.id);
      return i >= 0 ? list.map((x, j) => (j === i ? { ...x, ...p } : x)) : [...list, p];
    }),
    payment: (p) => { if (p.status === 'réussi') toast(`Paiement reçu : ${p.amount.toLocaleString('fr-FR')} FCFA (${p.operator}) — ${p.code}`, 'success'); },
    device: () => setSecurityKey((k) => k + 1),
    audit: () => setSecurityKey((k) => k + 1),
    config: (c) => { setConfig(c); if (c.tunnelUrl) toast(`Tunnel HTTPS actif : ${c.tunnelUrl}`, 'success'); },
    reset: () => { setSelectedId(null); bootstrap().then(() => toast('Démo réinitialisée', 'success')); },
  }, {
    onOpen: () => {
      setLive(true);
      if (lost.current) { lost.current = false; bootstrap().catch(() => {}); }
    },
    onError: () => {
      setLive(false);
      lost.current = true;
      api('/api/auth/me').catch(() => { window.location.href = '/connexion?next=/centrale'; });
    },
  });

  // --- Dérivés ---
  const all = useMemo(() => [...alerts.values()], [alerts]);
  const today = startOfToday();
  const queue = useMemo(() => {
    if (filter === 'open') {
      return all.filter(isOpen).sort((a, b) => (a.status === 'nouvelle' ? 0 : 1) - (b.status === 'nouvelle' ? 0 : 1)
        || (b.escalation?.level ?? 0) - (a.escalation?.level ?? 0) || b.createdAt - a.createdAt);
    }
    return all.filter((a) => a.createdAt >= today).sort((a, b) => b.createdAt - a.createdAt);
  }, [all, filter, today]);
  const openCount = all.filter(isOpen).length;
  const todayCount = all.filter((a) => a.createdAt >= today).length;
  const pending = useMemo(() => all.filter((a) => a.status === 'nouvelle').sort((a, b) => (b.escalation?.level ?? 0) - (a.escalation?.level ?? 0) || b.createdAt - a.createdAt), [all]);
  const critical = pending[0];
  const selected = alerts.get(selectedId) ?? null;
  const communes = useMemo(() => [...new Set(plates.map((p) => p.commune))].sort((a, b) => a.localeCompare(b, 'fr')), [plates]);
  const showcase = plates.filter((p) => p.showcase && p.status === 'active');
  const qrPlate = showcase.find((p) => p.token === qrToken) ?? showcase[0];
  const baseUrl = config?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');

  useEffect(() => {
    document.title = pending.length ? `(${pending.length}) NOUVELLE ALERTE — APSIG` : 'Centrale de sécurité — APSIG';
  }, [pending.length]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setQrOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    storage('local').set('cs-sound', next);
    if (next) { setTimeout(() => siren(), 50); setTimeout(() => speak('Annonces vocales activées.', 'fr-FR'), 400); }
  }

  async function simulate(type) {
    if (type === 'reset') {
      if (!window.confirm('Réinitialiser toutes les données de démonstration ?')) return;
      await api('/api/ops/reset', { method: 'POST' }).catch((err) => toast(err.message, 'error'));
      return;
    }
    await api('/api/ops/simulate', { method: 'POST', body: { type } }).catch((err) => toast(err.message, 'error'));
  }

  async function openFromHistory(id) {
    if (!alerts.has(id)) {
      try {
        const { alert } = await api(`/api/ops/alert/${id}`);
        setAlerts((m) => new Map(m).set(id, alert));
        st.current.alerts = new Map(st.current.alerts).set(id, alert);
      } catch (err) { toast(err.message, 'error'); return; }
    }
    setView('supervision');
    select(id, { fly: true });
  }

  const initials = me ? me.name.replace(/[^A-Za-zÀ-ÿ ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() : '';
  const kpiDefs = stats ? [
    { key: 'alertsToday', tone: 'red', icon: 'bell', value: stats.alertsToday, label: 'Alertes du jour' },
    { key: 'ongoing', tone: 'amber', icon: 'radio', value: <>{stats.ongoing}{stats.escalatedOpen > 0 && <small className="ml-1 text-xs text-agression">· {stats.escalatedOpen} escaladée(s)</small>}</>, label: 'Interventions en cours' },
    { key: 'activePlates', tone: 'green', icon: 'qr', value: <>{stats.activePlates}{stats.expiredPlates > 0 && <small className="ml-1 text-xs text-muted">· {stats.expiredPlates} expirées</small>}</>, label: 'Plaques actives' },
    { key: 'unitsAvailable', tone: 'blue', icon: 'car', value: <>{stats.unitsAvailable}<small className="text-sm text-muted">/{stats.unitsTotal}</small></>, label: 'Unités disponibles' },
    { key: 'avgAckSeconds', icon: 'clock', value: <>{stats.avgAckSeconds}<small className="text-sm text-muted"> s</small></>, label: 'Prise en charge moyenne' },
    { key: 'avgArrivalMinutes', icon: 'navigation', value: <>{stats.avgArrivalMinutes}<small className="text-sm text-muted"> min</small></>, label: 'Arrivée moyenne sur place' },
  ] : [];

  return (
    <div className="theme-dark flex h-dvh flex-col overflow-hidden bg-bg text-[14px] text-ink max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible">
      {/* Barre supérieure */}
      <header className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2">
        <a href="/" title="Accueil" className="flex items-center gap-2.5">
          <img src="/img/logo-apsig.svg" alt="" className="size-8" />
          <div className="leading-tight"><strong className="block text-sm font-extrabold">APSIG</strong><span className="block text-[11px] text-muted">Centrale de sécurité</span></div>
        </a>
        <nav aria-label="Vues" className="flex flex-wrap gap-1">
          {VIEWS.filter((v) => rank >= (v.minRank ?? 0)).map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}
              className={cx('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition', view === v.id ? 'bg-brand-500 text-white' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
              <Icon name={v.icon} />{v.label}
            </button>
          ))}
          <a href="/plaques" target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"><Icon name="qr" />Plaques</a>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LiveDot on={live}>{live ? 'En direct' : 'Connexion…'}</LiveDot>
          <span className="mono hidden w-20 text-center text-sm font-semibold tabular-nums sm:block">{now ? new Date(now).toLocaleTimeString('fr-FR') : '--:--:--'}</span>
          <Button size="sm" variant="ghost" onClick={() => setQrOpen(true)} title="Afficher le QR public en plein écran"><Icon name="maximize" />QR public</Button>
          <Button size="sm" variant="ghost" onClick={toggleSound} aria-pressed={soundOn} title={soundOn ? 'Sirène et annonce vocale activées' : 'Son coupé'} className="!px-2.5"><Icon name={soundOn ? 'volume' : 'volumeOff'} /></Button>
          <Dropdown buttonProps={{ size: 'sm', variant: 'danger' }} label={<><Icon name="play" />Simuler<Icon name="chevronDown" /></>}>
            {[['agression', 'Agression / Intrusion'], ['medical', 'Maladie / Accident'], ['incendie', 'Incendie'], ['random', 'Type aléatoire']].map(([t, l]) => (
              <button key={t} type="button" role="menuitem" className={menuItem} onClick={() => simulate(t)}>
                <span className={cx('size-2.5 rounded-full', t === 'random' ? 'bg-muted' : TYPE_ICON_BG[t])} />{l}
              </button>
            ))}
            {rank >= 2 && (
              <>
                <hr className="my-1 border-line" />
                <button type="button" role="menuitem" className={menuItem} onClick={() => simulate('reset')}><Icon name="refresh" />Réinitialiser la démo</button>
              </>
            )}
          </Dropdown>
          {me && (
            <Dropdown buttonProps={{ size: 'sm', variant: 'ghost', className: '!h-10 !gap-2' }} label={
              <>
                <span className="grid size-7 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white">{initials}</span>
                <span className="hidden text-left leading-tight md:block"><strong className="block text-xs">{me.name}</strong><small className="block text-[10px] font-normal text-muted">{me.roleLabel}</small></span>
              </>
            }>
              <button type="button" role="menuitem" className={menuItem} onClick={logout}><Icon name="logout" />Se déconnecter</button>
            </Dropdown>
          )}
        </div>
      </header>

      {/* Bandeau critique */}
      {critical && view === 'supervision' && (
        <div role="alert" className={cx('no-print flex flex-wrap items-center gap-3 px-4 py-2.5 text-white animate-flash', critical.escalation?.level ? 'bg-gradient-to-r from-agression to-[#7d0b1d]' : TYPE_ICON_BG[critical.type])}>
          <span className="grid size-9 place-items-center rounded-lg bg-white/20"><Icon name={TYPE_META[critical.type].icon} className="size-5" /></span>
          <div className="min-w-0 flex-1 text-sm">
            <strong className="tracking-wide">{critical.escalation?.level ? `ESCALADE N${critical.escalation.level} — ` : ''}{critical.priority === 'critique' ? 'ALERTE CRITIQUE' : 'NOUVELLE ALERTE'} — {TYPE_META[critical.type].label}</strong>
            <p className="text-white/90"><span className="mono">{critical.code}</span> · {critical.quartier}, {critical.commune} · {fmtTimeSec(critical.createdAt)}{pending.length > 1 ? ` · +${pending.length - 1} autre(s)` : ''}</p>
          </div>
          <Button size="sm" className="!bg-white !text-slate-900 !ring-0" onClick={async () => { select(critical.id, { fly: true }); await run(critical.id, 'ack'); }}><Icon name="check" />Prendre en charge</Button>
        </div>
      )}

      {view === 'supervision' && (
        <section aria-label="Indicateurs" className="no-print grid grid-cols-2 gap-2 border-b border-line px-4 py-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {stats ? kpiDefs.map((k) => <Kpi key={k.key} {...k} bump={bumps[k.key]} />) : Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-surface" />)}
        </section>
      )}

      {/* Supervision : file / carte / détail */}
      <main className={cx('min-h-0 flex-1 gap-0 lg:grid lg:grid-cols-[320px_1fr_400px]', view !== 'supervision' && 'hidden')}>
        <aside aria-label="File des alertes" className="flex min-h-0 flex-col border-line bg-surface lg:border-r max-lg:max-h-[50vh]">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <h2 className="font-bold">Alertes</h2>
            <div role="group" aria-label="Filtre" className="flex rounded-lg bg-surface-2 p-0.5">
              {[['open', 'En cours', openCount], ['today', "Aujourd'hui", todayCount]].map(([k, l, n]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cx('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition', filter === k ? 'bg-surface-3 text-ink' : 'text-muted')}>
                  {l}<b className={cx('rounded-full px-1.5 text-[10px]', filter === k ? 'bg-brand-500 text-white' : 'bg-surface-3')}>{n}</b>
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {queue.length === 0 ? (
              <li className="grid place-items-center gap-2 px-4 py-12 text-center text-muted">
                <Icon name="shieldCheck" className="size-8 text-success" />
                {filter === 'open' ? <><strong className="text-ink">Aucune alerte en cours</strong>Situation calme.</> : "Aucune alerte aujourd'hui."}
              </li>
            ) : queue.map((a) => {
              const open = isOpen(a);
              return (
                <li key={a.id} className="mb-1.5">
                  <button
                    type="button"
                    onClick={() => select(a.id, { fly: true })}
                    style={{ '--c': TYPE_VAR[a.type] }}
                    className={cx(
                      'flex w-full cursor-pointer gap-2.5 rounded-xl border p-2.5 text-left transition',
                      a.id === selectedId ? 'border-brand-500 bg-surface-3' : 'border-transparent bg-surface-2 hover:border-line',
                      a.status === 'nouvelle' && 'animate-q-new',
                      !open && 'opacity-60',
                    )}
                  >
                    <span className={cx('grid size-9 shrink-0 place-items-center rounded-lg text-white', TYPE_ICON_BG[a.type])}><Icon name={TYPE_META[a.type].icon} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <strong className={cx('truncate text-[13px]', TYPE_TEXT[a.type])}>{TYPE_META[a.type].label}</strong>
                        <span className="mono shrink-0 text-xs font-semibold tabular-nums text-ink">{open ? chrono(now - a.createdAt) : fmtTime(a.createdAt)}</span>
                      </span>
                      <span className="mono block truncate text-xs text-ink">{a.code}{a.source !== 'qr' && <small className="ml-1 rounded bg-surface-3 px-1 font-sans text-[10px] text-muted">{SOURCE_LABEL[a.source]}</small>}</span>
                      <span className="block truncate text-xs text-muted">{a.quartier}, {a.commune}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        <StatusPill meta={STATUS_META[a.status]} />
                        {a.escalation?.level > 0 && a.status === 'nouvelle' && <Badge tone="danger"><Icon name="alert" className="size-3" />N{a.escalation.level}</Badge>}
                        <TrustBadge trust={a.trust} />
                        {a.pass === 'rouge' && <Badge tone="rouge">Premium</Badge>}
                        {a.unit && <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Icon name="car" className="size-3" />{a.unit.name}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section aria-label="Carte" className="relative min-h-[50vh] bg-[#0a1730] lg:min-h-0">
          <OpsMap plates={plates} units={units} alerts={all} selectedId={selectedId} onSelect={(id) => select(id)} flyTarget={flyTarget} visible={view === 'supervision'} fitKey={fitKey} />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-surface/90 px-3 py-2 text-[11px] text-muted backdrop-blur">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#4f86e8]" />Pass Bleu</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#ef4b63]" />Pass Rouge</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#11804a]" />Unité APSIG</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#7b2ff7]" />GPS réel</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#b388ff]" />Témoin</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 animate-pulse rounded-full bg-agression" />Alerte active</span>
          </div>
        </section>

        <aside aria-label="Détail de l'alerte" className="min-h-0 border-line bg-surface lg:border-l max-lg:min-h-[60vh]">
          <Detail alert={selected} units={units} rank={rank} now={now} run={run} onBlock={(id, block) => setBlockDevice({ id, block })} />
        </aside>
      </main>

      {view !== 'supervision' && (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {view === 'historique' && <History communes={communes} refreshKey={historyKey} onOpenAlert={openFromHistory} />}
          {view === 'rapports' && <Reports />}
          {view === 'messages' && <Messages messages={messages} />}
          {view === 'securite' && <Security rank={rank} refreshKey={securityKey} onBlock={(id, block) => setBlockDevice({ id, block })} />}
        </main>
      )}

      {/* QR public plein écran */}
      {qrOpen && qrPlate && (
        <div className="fixed inset-0 z-[1500] grid place-items-center bg-brand-700/97 p-6 text-white backdrop-blur" role="dialog" aria-modal="true" aria-label="QR public">
          <Button variant="glass" className="absolute top-4 right-4 !size-11 !px-0" aria-label="Fermer" onClick={() => setQrOpen(false)}><Icon name="x" className="size-5" /></Button>
          <div className="grid max-w-5xl items-center gap-10 md:grid-cols-[auto_1fr]">
            <div className="mx-auto rounded-3xl bg-white p-5 shadow-2xl">
              <img src={`/qr/${qrPlate.token}.svg?b=${encodeURIComponent(baseUrl)}`} alt="QR code de la plaque de démonstration" className="size-[min(60vh,420px)]" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-widest text-white/70 uppercase">Scannez avec l'appareil photo</p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight">Déclenchez une alerte de démonstration</h2>
              <select aria-label="Plaque" value={qrPlate.token} onChange={(e) => { setQrToken(e.target.value); storage('local').set('cs-qr-plate', e.target.value); }} className={cx(inputCls, 'mt-6 max-w-md !bg-white/10 !text-white [&>option]:text-ink')}>
                {showcase.map((p) => <option key={p.token} value={p.token}>{p.code} — {p.pass === 'rouge' ? 'Pass Rouge' : 'Pass Bleu'}</option>)}
              </select>
              <p className="mono mt-4 text-lg break-all text-white/90">{baseUrl}/s/{qrPlate.token}</p>
              <p className="mt-3 text-lg">Sans Internet : composez <strong className="mono">*789*{qrPlate.shortCode}#</strong></p>
              <p className="mt-3 text-sm text-white/70">{config?.tunnelUrl ? "Accessible depuis n'importe quel réseau (tunnel HTTPS actif)." : 'Le téléphone doit être sur le même Wi-Fi que cet ordinateur (ou lancez « npm run demo » pour le tunnel HTTPS).'}</p>
            </div>
          </div>
        </div>
      )}

      <BlockDeviceModal key={blockDevice?.id ?? 'none'} device={blockDevice} onClose={() => setBlockDevice(null)} onDone={() => setSecurityKey((k) => k + 1)} />
    </div>
  );
}
