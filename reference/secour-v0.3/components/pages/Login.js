'use client';

import { useEffect, useState } from 'react';
import { Brand, Button, Field, Icon, Spinner, inputCls } from '../ui';
import { api } from '@/lib/common';

function targetFor(user) {
  const next = new URLSearchParams(window.location.search).get('next');
  if (user.role === 'agent') return '/terrain';
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/centrale';
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState(null);

  useEffect(() => {
    api('/api/auth/demo-accounts').then((r) => setAccounts(r.accounts)).catch(() => setAccounts([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) return setError('Renseignez votre identifiant et votre mot de passe.');
    setBusy(true);
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { username: username.trim(), password } });
      window.location.href = targetFor(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function quick(name) {
    setError('');
    try {
      const { user } = await api('/api/auth/demo', { method: 'POST', body: { username: name } });
      window.location.href = targetFor(user);
    } catch (err) { setError(err.message); }
  }

  const chip = (a) => {
    const unit = a.name.match(/^(.*) \((Unité .+)\)$/);
    return (
      <button
        key={a.username}
        type="button"
        onClick={() => quick(a.username)}
        className="flex min-h-11 cursor-pointer flex-col items-start rounded-xl border border-line bg-surface-2 px-3 py-2 text-left transition hover:border-brand-500/50 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <strong className="text-[13px] text-ink">{unit ? unit[2] : a.roleLabel}</strong>
        <span className="text-xs text-muted">{unit ? unit[1] : a.name}</span>
      </button>
    );
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(120%_80%_at_10%_0%,var(--color-brand-500),var(--color-brand-700))] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Brand subtitle="Code-Secours CI" light /></div>
        <section className="rounded-3xl bg-surface p-6 shadow-2xl sm:p-8">
          <h1 className="text-2xl font-extrabold text-ink">Connexion</h1>
          <p className="mt-1 text-sm text-muted">Centrale de sécurité, back-office et application terrain.</p>
          <form onSubmit={submit} noValidate className="mt-6 grid gap-4">
            <Field label="Identifiant">
              <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
            </Field>
            <Field label="Mot de passe">
              <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-agression-bg px-3 py-2.5 text-sm font-semibold text-agression"><Icon name="alert" />{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? <Spinner className="size-4" /> : <Icon name="lock" className="size-5" />}Se connecter
            </Button>
          </form>

          {accounts?.length > 0 && (
            <div className="mt-8 border-t border-line pt-6">
              <h2 className="text-sm font-bold text-ink">Accès rapide — démonstration</h2>
              <p className="mt-0.5 text-xs text-muted">Comptes fictifs. Les mots de passe de test figurent dans le README.</p>
              <h3 className="mt-4 mb-2 text-[11px] font-bold tracking-widest text-muted uppercase">Centrale</h3>
              <div className="grid grid-cols-2 gap-2">{accounts.filter((a) => a.role !== 'agent').map(chip)}</div>
              <h3 className="mt-4 mb-2 text-[11px] font-bold tracking-widest text-muted uppercase">Application terrain</h3>
              <div className="grid grid-cols-2 gap-2">{accounts.filter((a) => a.role === 'agent').map(chip)}</div>
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-sm"><a href="/" className="font-semibold text-white/80 hover:text-white">← Retour à l'accueil</a></p>
      </div>
    </main>
  );
}
