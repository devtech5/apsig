'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Icon, LiveDot, Modal, Spinner, StatusPill, cx, inputCls } from '../ui';
import { api, distanceKm, etaMinutes, fmtTime, logout, ring, toast, STATUS_META, TYPE_META } from '@/lib/common';
import { useAudioUnlock, useLive } from '@/lib/hooks';

const OUTCOMES = ['Intervention réussie', 'Victime prise en charge par les secours', 'Situation sécurisée, aucun blessé', 'Fausse alerte / malveillance', 'Transféré aux services publics'];
const TYPE_BG = { agression: 'bg-agression', medical: 'bg-medical', incendie: 'bg-incendie' };

export default function Terrain() {
  const [unit, setUnit] = useState(null);
  const [mission, setMission] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [online, setOnline] = useState(false);
  const [gps, setGps] = useState({ on: false, text: 'Inactif' });
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const watchId = useRef(null);
  const lastSent = useRef(0);
  const missionRef = useRef(null);
  missionRef.current = mission;
  useAudioUnlock();

  const reload = useCallback(async () => {
    const res = await api('/api/terrain/me');
    setUnit(res.unit);
    setMission(res.mission);
    return res;
  }, []);

  // --- GPS réel (nécessite HTTPS : tunnel « npm run demo » ou déploiement) ----------------
  const startGps = useCallback(() => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setGps({ on: false, text: 'GPS indisponible en HTTP : position simulée par la centrale. Utilisez le lien HTTPS (tunnel) pour le GPS réel.' });
      return;
    }
    setGps({ on: false, text: 'Recherche de la position…' });
    watchId.current = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      setGps({ on: true, text: `Position partagée (±${Math.round(accuracy)} m) · ${new Date().toLocaleTimeString('fr-FR')}` });
      if (Date.now() - lastSent.current < 4000) return;
      lastSent.current = Date.now();
      try {
        const res = await api('/api/terrain/position', { method: 'POST', body: { lat, lng, accuracy } });
        setUnit(res.unit);
      } catch { /* nouvelle tentative au prochain point */ }
    }, (err) => {
      if (err.code === err.PERMISSION_DENIED && watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setGps({ on: false, text: `GPS refusé ou indisponible (${err.message}).` });
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }, []);

  const stopGps = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setGps({ on: false, text: 'Inactif' });
  };

  useEffect(() => {
    reload()
      .then(() => {
        if (window.isSecureContext) startGps();
        else setGps({ on: false, text: 'GPS réel disponible via le lien HTTPS (tunnel). En HTTP, la centrale simule le trajet.' });
      })
      .catch(() => { window.location.href = '/connexion?next=/terrain'; });
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); };
  }, [reload, startGps]);

  useLive(unit ? '/api/terrain/events' : null, {
    mission: (next) => {
      const fresh = !!next && (!missionRef.current || missionRef.current.id !== next.id);
      setMission(next);
      if (fresh) {
        ring();
        toast(`Nouvelle mission : ${TYPE_META[next.type].label} — ${next.code}`, 'error');
        setIsNew(true);
        setTimeout(() => setIsNew(false), 6000);
      }
      reload().catch(() => {});
    },
    unit: (u) => setUnit(u),
    reset: () => window.location.reload(),
  }, {
    onOpen: () => setOnline(true),
    onError: () => {
      setOnline(false);
      api('/api/auth/me').catch(() => { window.location.href = '/connexion?next=/terrain'; });
    },
  });

  async function act(action, body = {}) {
    setBusy(true);
    try {
      const res = await api(`/api/terrain/${action}`, { method: 'POST', body });
      setUnit(res.unit);
      setMission(res.mission);
      return true;
    } catch (err) { toast(err.message, 'error'); return false; } finally { setBusy(false); }
  }

  async function close() {
    if (await act('close', { outcome })) {
      setClosing(false);
      toast('Intervention terminée', 'success');
    }
  }

  const a = mission;
  const km = a && unit ? distanceKm(unit, a) : 0;
  const plate = a?.plate ?? {};
  const notes = a ? a.timeline.filter((t) => t.kind === 'operator' && t.text.includes('Note')).slice(-3) : [];
  const witnessText = a ? (a.media ?? []).filter((m) => m.kind === 'text') : [];

  return (
    <div className="theme-dark flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur pt-[max(.75rem,env(safe-area-inset-top))]">
        <img src="/img/logo-apsig.svg" alt="" className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <strong className="block truncate font-extrabold">{unit ? `Unité ${unit.name}` : 'Unité'}</strong>
          <small className="block truncate text-muted">{unit ? `${unit.leader} · ${unit.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'}` : 'APSIG · application terrain'}</small>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}><Icon name="logout" />Quitter</Button>
      </header>

      <main className="mx-auto grid w-full max-w-lg flex-1 content-start gap-4 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
          <div>
            <small className="text-xs font-semibold tracking-wider text-muted uppercase">Statut</small>
            <strong className="block text-lg">{!unit ? '—' : unit.status === 'disponible' ? 'Disponible — en patrouille' : `En mission (${unit.alertId})`}</strong>
          </div>
          <LiveDot on={online}>{online ? 'En ligne' : 'Reconnexion…'}</LiveDot>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 font-bold"><Icon name="locate" className="size-5 text-info" />Position GPS</h2>
          <div className="mt-3 flex items-center gap-3">
            <span className={cx('size-3 shrink-0 rounded-full', gps.on ? 'animate-pulse bg-success shadow-[0_0_12px] shadow-success' : 'bg-surface-3')} />
            <p className="flex-1 text-sm text-muted">{gps.text}</p>
            <Button size="sm" onClick={() => (watchId.current === null ? startGps() : stopGps())}>{gps.on || watchId.current !== null ? 'Arrêter' : 'Activer'}</Button>
          </div>
        </section>

        {!unit ? (
          <div className="grid place-items-center py-16 text-muted"><Spinner className="size-8" /></div>
        ) : !a ? (
          <section className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-success-bg text-success"><Icon name="shieldCheck" className="size-7" /></span>
            <strong className="text-lg">Aucune mission en cours</strong>
            <p className="max-w-xs text-sm text-muted">Les missions affectées par la centrale s'affichent ici instantanément, avec sonnerie et vibration.</p>
          </section>
        ) : (
          <section className={cx('overflow-hidden rounded-2xl border border-line bg-surface shadow-xl', isNew && 'ring-4 ring-agression/60 animate-flash')}>
            <div className={cx('flex items-center gap-3 p-4 text-white', TYPE_BG[a.type])}>
              <span className="grid size-12 place-items-center rounded-xl bg-white/20"><Icon name={TYPE_META[a.type].icon} className="size-7" /></span>
              <div>
                <small className="text-xs font-semibold text-white/85">{a.priority === 'critique' ? 'Mission critique' : 'Mission prioritaire'} · {a.id}</small>
                <strong className="block text-xl">{TYPE_META[a.type].label}</strong>
              </div>
            </div>
            <div className="grid gap-3 p-4">
              <div className="mono text-2xl font-extrabold tracking-tight break-all">{a.code}</div>
              <p className="flex items-start gap-2 text-sm"><Icon name="pin" className="mt-0.5 text-muted" />{plate.label} — {a.quartier}, {a.commune}</p>
              <p className="flex items-start gap-2 text-sm"><Icon name="user" className="mt-0.5 text-muted" />{plate.owner?.name} · <a href={`tel:${plate.owner?.phone}`} className="mono text-info">{plate.owner?.phone}</a></p>
              <div className="flex flex-wrap gap-2">
                <StatusPill meta={STATUS_META[a.status]} />
                {a.pass === 'rouge' && <Badge tone="rouge">Pass Rouge</Badge>}
                {a.trust && <Badge>Fiabilité {a.trust.score}</Badge>}
              </div>
              {a.status === 'en_route' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-surface-2 p-3 text-center"><strong className="block text-2xl">{km.toFixed(1)} km</strong><span className="text-xs text-muted">Distance</span></div>
                  <div className="rounded-xl bg-surface-2 p-3 text-center"><strong className="block text-2xl">~{etaMinutes(km)} min</strong><span className="text-xs text-muted">Arrivée estimée</span></div>
                </div>
              )}
              {(witnessText.length > 0 || notes.length > 0) && (
                <ul className="grid gap-1.5 rounded-xl bg-warning-bg p-3 text-sm">
                  {witnessText.map((m, i) => <li key={`w${i}`}>Témoin : « {m.text} »</li>)}
                  {notes.map((n, i) => <li key={`n${i}`}>{fmtTime(n.at)} · {n.text}</li>)}
                </ul>
              )}
              <div className="mt-1 grid gap-2">
                {!a.unitAckAt && <Button variant="danger" size="lg" disabled={busy} onClick={() => act('ack')}><Icon name="check" className="size-5" />Accepter la mission</Button>}
                <Button as="a" size="lg" href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}&travelmode=driving`} target="_blank" rel="noopener"><Icon name="navigation" className="size-5" />Itinéraire (Google Maps)</Button>
                {a.status === 'en_route' && <Button variant="primary" size="lg" disabled={busy} onClick={() => act('onsite')}><Icon name="pin" className="size-5" />Je suis sur place</Button>}
                {a.status === 'sur_place' && <Button variant="success" size="lg" onClick={() => setClosing(true)}><Icon name="flag" className="size-5" />Terminer l'intervention</Button>}
              </div>
            </div>
          </section>
        )}
      </main>

      <Modal open={closing} onClose={() => setClosing(false)} title="Terminer l'intervention" footer={<><Button onClick={() => setClosing(false)}>Annuler</Button><Button variant="success" disabled={busy} onClick={close}><Icon name="flag" />Terminer</Button></>}>
        <Field label="Issue">
          <select className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </Modal>
    </div>
  );
}
