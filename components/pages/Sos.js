'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, DemoRibbon, Icon, Spinner, cx, textareaCls } from '../ui';
import { api, deviceId, fmtTime, fmtTimeSec, speak, storage, toast, TYPE_META } from '@/lib/common';
import { useLive } from '@/lib/hooks';
import { I18N, fmtN } from './sos-i18n';

const FINISHED = ['cloturee', 'annulee'];
const SOS_STYLE = {
  agression: 'bg-agression text-agression',
  medical: 'bg-medical text-medical',
  incendie: 'bg-incendie text-incendie',
};

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Sos() {
  const { token } = useParams();
  const sessionKey = `cs-alert-${token}`;
  const [lang, setLang] = useState('fr');
  const T = I18N[lang];
  const [plate, setPlate] = useState(null);
  const [demo, setDemo] = useState(true);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null); // { alert, key }
  const [sending, setSending] = useState(null); // type en cours d'envoi
  const [geo, setGeo] = useState(null); // 'ask' | 'ok' | 'no'
  const [zone, setZone] = useState(null); // null | 'text' | 'rec' | 'sending'
  const [done, setDone] = useState([]);
  const [recSec, setRecSec] = useState(0);
  const [canRecord, setCanRecord] = useState(false);
  const [text, setText] = useState('');
  const recorder = useRef(null);
  const currentRef = useRef(null);
  currentRef.current = current;

  // Langue mémorisée, sinon celle du navigateur.
  useEffect(() => {
    const saved = storage('local').get('cs-lang');
    setLang(saved ?? (navigator.language?.startsWith('en') ? 'en' : 'fr'));
    setCanRecord(!!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
  }, []);
  useEffect(() => { document.documentElement.lang = T.htmlLang; }, [T.htmlLang]);

  const chooseLang = (l) => { setLang(l); storage('local').set('cs-lang', l); };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api(`/api/public/plates/${encodeURIComponent(token)}`);
        if (!alive) return;
        setPlate(data.plate);
        setDemo(data.demo);
        document.title = `SOS ${data.plate.code} — Code-Secours CI`;
      } catch (err) {
        if (alive) setError(err.message && !/^Erreur/.test(err.message) ? err.message : '');
        return;
      }
      // Reprise du suivi si la page est rechargée pendant une alerte.
      const saved = storage('session').get(sessionKey);
      if (!saved) return;
      try {
        const { alert } = await api(`/api/public/alerts/${encodeURIComponent(saved.id)}?key=${encodeURIComponent(saved.key)}`);
        if (!alive) return;
        setCurrent({ alert, key: saved.key });
        if (alert.witnessLocated) setGeo('ok');
      } catch {
        storage('session').remove(sessionKey);
      }
    })();
    return () => { alive = false; };
  }, [token, sessionKey]);

  const alert = current?.alert;
  const finished = alert && FINISHED.includes(alert.status);

  useLive(alert && !finished ? `/api/public/events?alert=${encodeURIComponent(alert.id)}&key=${encodeURIComponent(current.key)}` : null, {
    alert: (next) => {
      setCurrent((c) => {
        if (!c) return c;
        if (c.alert.status !== next.status && navigator.vibrate) navigator.vibrate([40, 60, 40]);
        return { ...c, alert: next };
      });
    },
  });

  const shareLocation = useCallback((id, key) => {
    if (!window.isSecureContext || !navigator.geolocation) return;
    setGeo('ask');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await api(`/api/public/alerts/${id}/location`, { method: 'POST', body: { key, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } });
        setGeo('ok');
      } catch { setGeo('no'); }
    }, () => setGeo('no'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }, []);

  async function trigger(type) {
    setSending(type);
    if (navigator.vibrate) navigator.vibrate(60);
    try {
      const { alert: a, key, duplicate } = await api('/api/public/alerts', { method: 'POST', body: { token, type, deviceId: deviceId(), lang } });
      setCurrent({ alert: a, key });
      storage('session').set(sessionKey, { id: a.id, key });
      if (duplicate) toast(T.dup);
      setGeo(null);
      setDone([]);
      shareLocation(a.id, key);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast(`${err.message}. ${fmtN(T.callDirect, type === 'incendie' ? '180' : type === 'medical' ? '185' : '170')}`, 'error');
    }
    setSending(null);
  }

  async function cancel() {
    if (!window.confirm(T.cancelConfirm)) return;
    try {
      const { alert: a } = await api(`/api/public/alerts/${alert.id}/cancel`, { method: 'POST', body: { key: current.key } });
      setCurrent((c) => ({ ...c, alert: a }));
    } catch (err) { toast(err.message, 'error'); }
  }

  function restart() {
    storage('session').remove(sessionKey);
    setCurrent(null);
    setGeo(null);
    setDone([]);
    setZone(null);
  }

  const listen = () => {
    const txt = alert && !finished ? `${T.meanwhile}. ${T.advice[alert.type].join(' ')}` : T.listenText;
    if (!speak(txt, T.voice)) toast(T.ttsNo);
  };

  // --- Pièces jointes -----------------------------------------------------------------
  async function upload(kind, payload) {
    const c = currentRef.current;
    const { alert: a } = await api(`/api/public/alerts/${c.alert.id}/media`, { method: 'POST', body: { key: c.key, kind, ...payload } });
    setCurrent((x) => ({ ...x, alert: a }));
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setZone('sending');
    try {
      await upload('photo', { data: await compressImage(file) });
      setDone((d) => [...d, T.photoSent]);
    } catch (err) { toast(err.message, 'error'); }
    setZone(null);
  }

  async function toggleRecording() {
    if (recorder.current) { recorder.current.stop(); return; }
    let mediaStream;
    try { mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast(T.micDenied, 'error'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
    const chunks = [];
    const rec = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
    const started = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setRecSec(s);
      if (s >= 30) recorder.current?.stop();
    }, 250);
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    rec.onstop = async () => {
      clearInterval(timer);
      mediaStream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setZone('sending');
      try {
        const blob = new Blob(chunks, { type: chunks[0]?.type || mime || 'audio/webm' });
        const data = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
        await upload('audio', { data });
        setDone((d) => [...d, T.voiceSent]);
      } catch (err) { toast(err.message, 'error'); }
      setZone(null);
    };
    recorder.current = rec;
    rec.start();
    setRecSec(0);
    setZone('rec');
  }

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    try {
      await upload('text', { text: t });
      setDone((d) => [...d, T.textSent]);
      setText('');
      setZone(null);
    } catch (err) { toast(err.message, 'error'); }
  }

  // --- Rendu -----------------------------------------------------------------------------
  const emergency = [{ n: '170', label: T.police }, { n: '180', label: T.fire }, { n: '185', label: T.samu }];
  const direct = (
    <section aria-labelledby="direct-title" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="direct-title" className="text-[13px] font-bold tracking-wide text-muted uppercase">{T.numbers}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {emergency.map((e) => {
          const inner = (<><strong className="mono block text-xl font-extrabold text-ink">{e.n}</strong><span className="text-xs text-muted">{e.label}</span></>);
          return demo
            ? <div key={e.n} className="rounded-xl bg-surface-2 px-2 py-3 text-center">{inner}</div>
            : <a key={e.n} href={`tel:${e.n}`} className="rounded-xl bg-surface-2 px-2 py-3 text-center ring-1 ring-line transition hover:bg-surface-3">{inner}</a>;
        })}
      </div>
      {plate?.ussd && <p className="mt-3 text-center text-sm text-muted">{T.noNet} <strong className="mono text-ink">{plate.ussd}</strong></p>}
      {demo && <p className="mt-1 text-center text-xs text-muted">{T.numbersDemo}</p>}
    </section>
  );

  let body;
  if (error !== null) {
    body = (
      <>
        <section className="grid justify-items-center gap-3 rounded-3xl border border-line bg-surface px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-warning-bg text-warning"><Icon name="alert" className="size-7" /></span>
          <h1 className="text-xl font-extrabold text-ink">{T.unknownTitle}</h1>
          <p className="text-muted">{error ? `${error} ${T.unknownText}` : T.unknownText}</p>
        </section>
        {direct}
      </>
    );
  } else if (!plate) {
    body = <div className="grid place-items-center py-24 text-muted" aria-label="Chargement"><Spinner className="size-8" /></div>;
  } else if (!alert) {
    const premium = plate.pass === 'rouge';
    body = (
      <>
        <section aria-label={T.address} className="relative overflow-hidden rounded-3xl bg-brand p-5 text-white shadow-lg">
          <div aria-hidden="true" className="absolute -top-10 -right-10 size-40 rounded-full bg-white/5" />
          <p className="text-[11px] font-bold tracking-widest text-white/70 uppercase">{T.address}</p>
          <p className="mono mt-1 text-[22px] leading-tight font-extrabold break-all">{plate.code}</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85"><Icon name="pin" />{plate.quartier}, {plate.commune} — Abidjan</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/25 px-2.5 py-1 text-xs font-bold text-[#7ff0b0]"><Icon name="check" className="size-3.5" />{T.verified}</span>
            <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold', premium ? 'bg-pass-rouge' : 'bg-white/15')}>{premium ? T.passRouge : T.passBleu}</span>
          </div>
        </section>

        <div className="text-center">
          <h1 className="text-[26px] leading-tight font-extrabold text-ink">{T.question}</h1>
          <p className="mt-1 text-muted">{T.sub}</p>
        </div>

        <div className="grid gap-3">
          {Object.entries(TYPE_META).map(([type, meta]) => (
            <button
              key={type}
              type="button"
              disabled={!!sending}
              onClick={() => trigger(type)}
              className={cx(
                'group flex min-h-[84px] cursor-pointer items-center gap-4 rounded-2xl px-4 text-left shadow-lg transition active:scale-[.98] disabled:cursor-wait disabled:opacity-60',
                'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus',
                SOS_STYLE[type],
                sending === type && 'animate-sos-pulse !opacity-100',
              )}
            >
              <span className="grid size-13 shrink-0 place-items-center rounded-xl bg-white/20 text-white">
                {sending === type ? <Spinner className="size-6" /> : <Icon name={meta.icon} className="size-7" />}
              </span>
              <span className="flex-1 text-white">
                <strong className="block text-2xl leading-none font-black tracking-wide">SOS</strong>
                <span className="mt-1 block text-[15px] font-semibold text-white/95">{T.types[type]}</span>
              </span>
              <Icon name="chevronRight" className="size-6 text-white/80 transition group-hover:translate-x-1" />
            </button>
          ))}
        </div>

        <button type="button" onClick={listen} className="mx-auto flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold text-brand-500 hover:bg-brand-50">
          <Icon name="volume" />{T.listen}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted"><Icon name="clock" className="size-3.5" />{T.how}</p>
        {direct}
      </>
    );
  } else {
    const a = alert;
    const closed = a.status === 'cloturee';
    const cancelled = a.status === 'annulee';
    const stepsDone = { nouvelle: 1, prise_en_charge: 2, en_route: 2, sur_place: 4, cloturee: 4 }[a.status] ?? 1;
    const unitTxt = a.unit ? `${T.unit} ${a.unit.name}${a.unit.kind === 'intervention' ? ` (${T.armed})` : ''}` : '';
    const steps = [
      { title: T.steps[0], sub: fmtTimeSec(a.createdAt) },
      { title: T.steps[1], sub: a.ackAt ? fmtTimeSec(a.ackAt) : T.inProgress },
      { title: T.steps[2], sub: a.status === 'en_route' ? `${unitTxt}${a.eta ? ` · ${fmtN(T.eta, a.eta)}` : ''}` : stepsDone > 2 ? unitTxt : T.waitingUnit },
      { title: T.steps[3], sub: a.onSiteAt ? fmtTimeSec(a.onSiteAt) : '' },
    ];

    const header = (
      <section className={cx('grid justify-items-center rounded-3xl px-5 pt-7 pb-6 text-center text-white shadow-lg', cancelled ? 'bg-slate-600' : closed ? 'bg-success' : 'bg-brand')}>
        <span className={cx('grid size-16 place-items-center rounded-full bg-white/20 text-white', !closed && !cancelled && 'animate-sos-pulse')}>
          <Icon name={cancelled ? 'x' : closed ? 'checkCircle' : 'check'} className="size-8" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">{cancelled ? T.cancelled : closed ? T.closed : T.sent}</h1>
        <p className="mt-1 font-semibold text-white/90">{T.types[a.type]}</p>
        <p className="mono mt-2 rounded-lg bg-white/10 px-3 py-1 text-sm font-bold">{a.code}</p>
        <p className="mt-2 text-xs text-white/70">{T.ref} {a.id} · {fmtTime(a.createdAt)}</p>
      </section>
    );

    const tracker = (
      <ol aria-label="Suivi" className="grid gap-0 rounded-2xl border border-line bg-surface p-4">
        {steps.map((s, i) => {
          const isDone = i < stepsDone;
          const isCurrent = i === stepsDone && !finished;
          return (
            <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden="true" className={cx('absolute top-8 bottom-0 left-[15px] w-0.5', isDone ? 'bg-success' : 'bg-line')} />}
              <span className={cx('relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold', isDone ? 'bg-success text-white' : isCurrent ? 'bg-brand text-white ring-4 ring-brand/20' : 'bg-surface-3 text-muted')}>
                {isDone ? <Icon name="check" /> : i + 1}
              </span>
              <span className="pt-1">
                <strong className={cx('block text-[15px]', isDone || isCurrent ? 'text-ink' : 'text-muted')}>{s.title}</strong>
                {s.sub && <small className={cx('text-[13px]', isCurrent ? 'font-semibold text-brand-500' : 'text-muted')}>{s.sub}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    );

    if (finished) {
      body = (
        <>
          {header}
          {closed && tracker}
          <Button variant="primary" size="lg" className="w-full" onClick={restart}>{T.back}</Button>
          {direct}
        </>
      );
    } else {
      const btnHelper = 'flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-[13px] font-semibold text-ink transition hover:border-brand-500/40 hover:bg-brand-50';
      body = (
        <>
          {header}
          {tracker}
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-brand"><Icon name="users" className="mt-0.5" /><span>{fmtN(T.notified, a.notifiedCount)}</span></p>
          {geo && (
            <p className={cx('flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]', geo === 'ok' ? 'bg-success-bg text-success' : geo === 'ask' ? 'bg-surface-2 text-muted' : 'bg-warning-bg text-warning-ink')}>
              {geo === 'ask' ? <Spinner className="mt-0.5 size-3.5" /> : <Icon name={geo === 'ok' ? 'checkCircle' : 'locate'} className="mt-0.5" />}
              <span>{geo === 'ask' ? T.geoAsk : geo === 'ok' ? T.geoOk : T.geoNo}</span>
            </p>
          )}

          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-bold text-ink">{T.help}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{T.helpSub}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className={btnHelper}>
                <Icon name="camera" className="size-6 text-brand-500" />{T.photo}
                <input type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
              </label>
              {canRecord && (
                <button type="button" className={cx(btnHelper, zone === 'rec' && '!border-agression !bg-agression-bg')} onClick={toggleRecording}>
                  <Icon name={zone === 'rec' ? 'stop' : 'mic'} className={cx('size-6', zone === 'rec' ? 'text-agression' : 'text-brand-500')} />{T.voiceMsg}
                </button>
              )}
              <button type="button" className={btnHelper} onClick={() => setZone(zone === 'text' ? null : 'text')}>
                <Icon name="edit" className="size-6 text-brand-500" />{T.write}
              </button>
            </div>
            {zone === 'sending' && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" />{T.sending}</p>}
            {zone === 'rec' && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-agression-bg px-3 py-2.5">
                <span className="size-2.5 animate-pulse rounded-full bg-agression" />
                <span className="flex-1 text-sm text-ink">{T.recording} <b className="mono">0:{String(recSec).padStart(2, '0')}</b> / 0:30</span>
                <Button size="sm" variant="danger" onClick={() => recorder.current?.stop()}><Icon name="stop" />{T.stop}</Button>
              </div>
            )}
            {zone === 'text' && (
              <div className="mt-3 grid gap-2">
                <textarea autoFocus rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={T.textPh} className={textareaCls} />
                <Button variant="primary" onClick={sendText} disabled={!text.trim()}><Icon name="send" />{T.send}</Button>
              </div>
            )}
            {done.length > 0 && (
              <ul className="mt-3 grid gap-1.5">
                {done.map((d, i) => <li key={i} className="flex items-center gap-2 text-[13px] font-semibold text-success"><Icon name="checkCircle" />{d}</li>)}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-warning/30 bg-warning-bg p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-ink">{T.meanwhile}</h2>
              <Button size="sm" onClick={() => speak(`${T.meanwhile}. ${T.advice[a.type].join(' ')}`, T.voice)}><Icon name="volume" />{T.listenAdvice}</Button>
            </div>
            <ul className="mt-3 grid gap-2">
              {T.advice[a.type].map((t) => <li key={t} className="flex gap-2 text-[15px] text-ink"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />{t}</li>)}
            </ul>
          </section>

          <Button size="lg" className="w-full !text-muted" onClick={cancel}>{T.cancel}</Button>
          {direct}
        </>
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {(demo || error !== null) && <DemoRibbon>{T.ribbon}</DemoRibbon>}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur pt-[max(.625rem,env(safe-area-inset-top))]">
        <img src="/img/logo-apsig.svg" alt="" className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <strong className="block text-sm font-extrabold tracking-wide text-brand">CODE-SECOURS CI</strong>
          <span className="block truncate text-xs text-muted">{T.tagline}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={listen} aria-label={T.listen} title={T.listen} className="!size-11 !px-0"><Icon name="volume" className="size-5" /></Button>
        <div role="group" aria-label="Langue" className="flex rounded-xl bg-surface-3 p-1">
          {['fr', 'en'].map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => chooseLang(l)} className={cx('h-9 min-w-10 cursor-pointer rounded-lg px-2 text-xs font-bold transition', lang === l ? 'bg-surface text-ink shadow-sm' : 'text-muted')}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <main aria-live="polite" className="mx-auto grid w-full max-w-md flex-1 content-start gap-4 px-4 py-5">
        {body}
      </main>
      <footer className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">{T.footer}</footer>
    </div>
  );
}
