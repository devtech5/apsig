'use client';

import { useEffect, useRef, useState } from 'react';
import SiteHeader from '../SiteHeader';
import { Button, DemoRibbon, Field, Icon, cx, inputCls } from '../ui';
import { api, toast } from '@/lib/common';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const CODES = [['10001', 'Niangon (Bleu)'], ['10002', 'Riviera (Rouge)'], ['10003', 'Plateau (Rouge)'], ['10005', 'PK 18'], ['10006', 'Williamsville'], ['10010', 'Angré']];

export default function Ussd() {
  const [msisdn, setMsisdn] = useState('+225 07 00 55 66 77');
  const [tab, setTab] = useState('ussd');
  const [screen, setScreen] = useState('Composez *789*CODE# puis appuyez sur la touche verte.');
  const [input, setInput] = useState('');
  const [session, setSession] = useState(null); // { id, serviceCode, text }
  const [ended, setEnded] = useState(false);
  const [thread, setThread] = useState([{ dir: 'in', text: 'Envoyez « SOS <code> <1, 2 ou 3> ». Exemple : SOS 10001 1' }]);
  const [sms, setSms] = useState('');
  const inputRef = useRef(null);
  const threadRef = useRef(null);

  useEffect(() => { threadRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [thread]);

  async function gateway(s, text) {
    const res = await fetch('/api/ussd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ sessionId: s.id, phoneNumber: msisdn.replace(/\s/g, ''), serviceCode: s.serviceCode, text }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erreur réseau');
    return res.text();
  }

  function show(reply, s) {
    const end = reply.startsWith('END');
    setScreen(reply.replace(/^(CON|END)\s?/, ''));
    setInput('');
    setEnded(end);
    setSession(end ? null : s);
    if (!end) setTimeout(() => inputRef.current?.focus(), 0);
  }

  function endSession(msg) {
    setSession(null);
    setEnded(false);
    setScreen(msg);
    setInput('');
  }

  async function dial() {
    const code = input.trim();
    if (!/^\*789(\*\d{5})?#$/.test(code)) { setScreen('Numéro non valide.\nComposez *789# ou *789*CODE#'); return; }
    const s = { id: `sim-${Date.now()}`, serviceCode: code, text: '' };
    setScreen('Connexion…');
    setEnded(false);
    try { show(await gateway(s, ''), s); } catch (err) { endSession(err.message); }
  }

  async function send() {
    if (!session) return;
    const v = input.trim();
    if (!v) return;
    const s = { ...session, text: session.text ? `${session.text}*${v}` : v };
    try { show(await gateway(s, s.text), s); } catch (err) { endSession(err.message); }
  }

  const press = (k) => {
    if (k === 'call') return session ? send() : dial();
    if (k === 'hang') return endSession('Session terminée.');
    if (k === 'del') return setInput((v) => v.slice(0, -1));
    if (ended) { setEnded(false); setScreen(''); }
    setInput((v) => v + k);
  };

  async function sendSms(e) {
    e.preventDefault();
    const text = sms.trim();
    if (!text) return;
    setThread((t) => [...t, { dir: 'out', text }]);
    setSms('');
    try {
      const { reply } = await api('/api/sms/inbound', { method: 'POST', body: { from: msisdn.replace(/\s/g, ''), text } });
      setTimeout(() => setThread((t) => [...t, { dir: 'in', text: reply }]), 600);
    } catch (err) { toast(err.message, 'error'); }
  }

  const pickCode = (c) => {
    endSession('Appuyez sur la touche verte.');
    setInput(`*789*${c}#`);
    setSms(`SOS ${c} 1`);
  };

  return (
    <>
      <SiteHeader subtitle="Accès sans Internet" current="/ussd" links={[{ href: '/', label: 'Accueil' }, { href: '/centrale', label: 'Centrale' }, { href: '/ussd', label: 'USSD / SMS' }]} />
      <DemoRibbon>Simulateur de passerelle opérateur — code court *789# fictif, aucune communication réelle.</DemoRibbon>
      <main className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[340px_1fr]">
        {/* Téléphone basique */}
        <div className="mx-auto w-full max-w-[320px] rounded-[44px] bg-slate-900 p-4 pt-8 shadow-2xl ring-1 ring-slate-700">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-700" />
          <div className="grid min-h-[220px] content-between gap-3 rounded-2xl bg-[#c8d8b0] p-4 font-mono text-[13px] text-slate-900 shadow-inner">
            <pre className="font-mono whitespace-pre-wrap">{screen}</pre>
            {!ended && (
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (session) send(); else dial(); } }}
                inputMode="tel"
                autoComplete="off"
                aria-label="Saisie"
                className="h-10 w-full rounded-md border border-slate-900/30 bg-white/60 px-2 font-mono text-base outline-none focus:border-slate-900"
              />
            )}
            {session && (
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => endSession('Session annulée.')} className="h-9 cursor-pointer rounded-md bg-slate-900/10 px-3 text-xs font-bold">Annuler</button>
                <button type="button" onClick={send} className="h-9 cursor-pointer rounded-md bg-slate-900 px-3 text-xs font-bold text-white">Envoyer</button>
              </div>
            )}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {KEYS.map((k) => (
              <button key={k} type="button" onClick={() => press(k)} className="h-12 cursor-pointer rounded-2xl bg-slate-800 text-lg font-bold text-white transition hover:bg-slate-700 active:scale-95">{k}</button>
            ))}
            <button type="button" aria-label="Raccrocher" onClick={() => press('hang')} className="h-12 cursor-pointer rounded-2xl bg-danger text-lg font-bold text-white transition hover:brightness-110 active:scale-95">✕</button>
            <button type="button" aria-label="Effacer" onClick={() => press('del')} className="h-12 cursor-pointer rounded-2xl bg-slate-700 text-lg font-bold text-white transition hover:bg-slate-600 active:scale-95">⌫</button>
            <button type="button" aria-label="Appeler" onClick={() => press('call')} className="h-12 cursor-pointer rounded-2xl bg-success text-lg font-bold text-white transition hover:brightness-110 active:scale-95">✆</button>
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Alerter sans smartphone ni Internet</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Chaque plaque porte un code court à 5 chiffres. Depuis <strong className="text-ink">n'importe quel téléphone</strong>, même basique et sans crédit Internet, on compose <span className="mono text-ink">*789*CODE#</span> ou on envoie un SMS. La centrale reçoit une alerte avec le numéro de l'appelant, ce qui renforce sa fiabilité.
          </p>
          <Field label="Numéro simulé de l'appelant" className="mt-6 max-w-xs">
            <input className={inputCls} value={msisdn} onChange={(e) => setMsisdn(e.target.value)} inputMode="tel" />
          </Field>

          <div role="group" aria-label="Canal" className="mt-6 inline-flex rounded-xl bg-surface-3 p-1">
            {[['ussd', 'USSD'], ['sms', 'SMS']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cx('h-10 min-w-24 cursor-pointer rounded-lg px-4 text-sm font-bold transition', tab === k ? 'bg-surface text-ink shadow-sm' : 'text-muted')}>{l}</button>
            ))}
          </div>

          {tab === 'ussd' ? (
            <div className="mt-5">
              <p className="font-semibold text-ink">Codes des plaques de démonstration :</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CODES.map(([c, l]) => (
                  <button key={c} type="button" title={l} onClick={() => pickCode(c)} className="mono h-11 cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-brand-500/50 hover:bg-brand-50">
                    *789*{c}# <span className="ml-1 font-sans text-xs font-normal text-muted">{l}</span>
                  </button>
                ))}
              </div>
              <p className="mt-5 max-w-2xl text-sm text-muted">
                En production, le code court est loué auprès des opérateurs (Orange, MTN, Moov) via un agrégateur. Le point d'entrée <span className="mono">POST /api/ussd</span> suit le format standard des passerelles (sessionId, phoneNumber, serviceCode, text → réponse « CON » ou « END »).
              </p>
            </div>
          ) : (
            <div className="mt-5 max-w-lg overflow-hidden rounded-2xl border border-line bg-surface">
              <div ref={threadRef} className="grid max-h-80 min-h-56 content-start gap-2 overflow-y-auto bg-surface-2 p-4">
                {thread.map((m, i) => (
                  <div key={i} className={cx('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', m.dir === 'out' ? 'justify-self-end rounded-br-md bg-brand text-white' : 'justify-self-start rounded-bl-md bg-surface text-ink ring-1 ring-line')}>{m.text}</div>
                ))}
              </div>
              <form onSubmit={sendSms} className="flex gap-2 border-t border-line p-3">
                <input value={sms} onChange={(e) => setSms(e.target.value)} placeholder="SOS 10001 1" autoComplete="off" className={inputCls} />
                <Button type="submit" variant="primary"><Icon name="send" />Envoyer</Button>
              </form>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
