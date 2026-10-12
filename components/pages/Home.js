'use client';

import { useEffect, useState } from 'react';
import SiteHeader from '../SiteHeader';
import { Button, DemoRibbon, Icon, Plate } from '../ui';
import { api } from '@/lib/common';

const ENTRIES = [
  { href: '/demo', icon: 'smartphone', title: 'Page SOS publique', text: 'Adresse vérifiée, 3 boutons, suivi en direct, position du témoin, photo et message vocal. Français et anglais, lecture audio.', external: true, accent: true },
  { href: '/centrale', icon: 'monitor', title: 'Centrale de sécurité', text: 'Carte temps réel, sirène et annonce vocale, escalade, score de fiabilité, rapports, messagerie, sécurité.' },
  { href: '/terrain', icon: 'navigation', title: 'Application terrain', text: 'Les unités reçoivent la mission avec sonnerie, partagent leur GPS réel et clôturent sur place.' },
  { href: '/plaques', icon: 'qr', title: 'Back-office des plaques', text: 'Création, Pass Bleu / Rouge, régénération du QR, désactivation, encaissement Mobile Money.' },
  { href: '/client/demo', icon: 'user', title: 'Espace client', text: 'Le titulaire suit les alertes à son adresse, gère ses proches à prévenir et renouvelle son abonnement.' },
  { href: '/ussd', icon: 'keypad', title: 'USSD & SMS', text: 'Alerte depuis n\'importe quel téléphone, sans Internet : *789*CODE# ou « SOS CODE 1 » par SMS.' },
];

const STEPS = [
  ['Plaque physique', 'Adresse Code-Secours unique, QR sécurisé, code USSD, position GPS vérifiée.'],
  ['Scan', 'Un geste simple depuis n\'importe quel téléphone, sans application.'],
  ['Page SOS', 'Agression, malaise ou incendie : un seul appui.'],
  ['Plateforme APSIG', 'Horodatage, routage, score de fiabilité, escalade automatique.'],
  ['Centrale', 'Appeler, affecter, suivre l\'unité en direct, clôturer.'],
  ['Acteurs notifiés', 'Société partenaire, secours publics, chef de quartier, famille.'],
];

const KEYPOINTS = ['Sans application mobile', 'Fonctionne sans Internet (USSD/SMS)', 'Localisation immédiate', 'Suivi en temps réel', 'Pass Bleu & Pass Rouge'];

export default function Home() {
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => api('/api/config').then((c) => alive && setCfg(c)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const blue = cfg?.showcase.find((p) => p.code === 'ABJ-YOP-NIANGON-453') ?? cfg?.showcase[0];
  const red = cfg?.showcase.find((p) => p.pass === 'rouge');
  const demoUrl = cfg ? `${cfg.baseUrl}/s/${cfg.demoToken}` : '…';
  const demoPlate = cfg?.showcase.find((p) => p.token === cfg.demoToken);

  return (
    <>
      <SiteHeader current="/" />
      <DemoRibbon>Prototype de démonstration — toutes les données (noms, numéros, adresses précises, paiements) sont fictives.</DemoRibbon>

      <main>
        <section className="relative overflow-hidden bg-brand text-white">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_10%,rgb(200_16_46/.35),transparent_60%),radial-gradient(50%_70%_at_0%_100%,rgb(26_69_150/.9),transparent_70%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-widest uppercase ring-1 ring-white/20">
                <span className="size-1.5 rounded-full bg-accent" />Code-Secours CI
              </span>
              <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl">
                De la plaque intelligente à la <em className="text-[#ff8a9a] not-italic">coordination</em> des secours.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-white/80">
                Une adresse unique, un QR code, une alerte en un geste — même sans Internet. La centrale APSIG localise, route, escalade et suit chaque urgence en temps réel.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button as="a" href="/demo" target="_blank" rel="noopener" variant="danger" size="lg"><Icon name="smartphone" className="size-5" />Ouvrir la page SOS</Button>
                <Button as="a" href="/centrale" variant="glass" size="lg"><Icon name="monitor" className="size-5" />Centrale de sécurité</Button>
                <Button as="a" href="/connexion" variant="glass" size="lg" className="!bg-transparent"><Icon name="lock" className="size-5" />Connexion</Button>
              </div>
            </div>
            <div className="grid justify-items-center gap-5">
              {blue ? <Plate plate={blue} className="max-w-[400px]" /> : <div className="aspect-[1.62] w-full max-w-[400px] animate-pulse rounded-3xl bg-white/10" />}
              {red && <Plate plate={red} className="-mt-2 max-w-[350px] -rotate-2" />}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="grid items-center gap-8 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8 md:grid-cols-[auto_1fr]">
            <div className="mx-auto grid size-52 place-items-center rounded-2xl bg-white p-3 ring-1 ring-line">
              {cfg ? <img src={`/qr/${cfg.demoToken}.svg?b=${encodeURIComponent(cfg.baseUrl)}`} alt="QR code de la plaque de démonstration" className="size-full" /> : <div className="size-full animate-pulse rounded-xl bg-surface-3" />}
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-muted uppercase">Essayez maintenant</p>
              <h2 className="mt-1 text-2xl font-extrabold text-ink">Scannez la plaque de démonstration</h2>
              <ol className="mt-4 grid gap-3 text-[15px] text-ink">
                {[
                  'Scannez le QR code avec l\'appareil photo : aucune application à installer.',
                  'Choisissez le type d\'urgence : l\'alerte apparaît aussitôt sur la centrale.',
                ].map((t, i) => (
                  <li key={t} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand">{i + 1}</span>{t}</li>
                ))}
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand">3</span>
                  <span>Sans Internet : composez <strong className="mono">*789*{demoPlate?.shortCode ?? '10001'}#</strong> (<a className="font-semibold text-brand-500 underline underline-offset-2" href="/ussd">simulateur</a>).</span>
                </li>
              </ol>
              <code className="mt-5 inline-block max-w-full truncate rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink ring-1 ring-line">{demoUrl}</code>
              <div className="mt-3 text-sm">
                {cfg?.tunnelUrl ? (
                  <p className="flex items-center gap-2 font-semibold text-success"><Icon name="checkCircle" />Tunnel HTTPS actif <span className="font-normal text-muted">— accessible depuis n'importe quel réseau, avec géolocalisation et micro.</span></p>
                ) : cfg ? (
                  <p className="text-muted">Réseau local : <span className="mono">{cfg.lanUrl}</span> — les téléphones doivent être sur le même Wi-Fi. Pour un accès depuis n'importe quel réseau : <span className="mono">npm run demo</span>.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
          <h2 className="text-2xl font-extrabold text-ink">Les interfaces du prototype</h2>
          <p className="mt-1 text-muted">Chaque acteur dispose de son écran, synchronisé en temps réel.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ENTRIES.map((e) => (
              <a
                key={e.href}
                href={e.href}
                {...(e.external ? { target: '_blank', rel: 'noopener' } : {})}
                className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className={`grid size-11 place-items-center rounded-xl ${e.accent ? 'bg-agression-bg text-agression' : 'bg-brand-50 text-brand'}`}><Icon name={e.icon} className="size-5" /></span>
                <h3 className="mt-4 text-lg font-bold text-ink">{e.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{e.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-500">Ouvrir <Icon name="chevronRight" className="size-4 transition group-hover:translate-x-0.5" /></span>
              </a>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <h2 className="text-2xl font-extrabold text-ink">Comment ça marche</h2>
          <p className="mt-1 text-muted">De la plaque à l'intervention, en six étapes.</p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="relative rounded-2xl border border-line bg-surface p-4 shadow-card">
                <span className="mono text-xs font-bold text-accent">0{i + 1}</span>
                <h4 className="mt-1 font-bold text-ink">{title}</h4>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            {KEYPOINTS.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1.5 text-[13px] font-semibold text-success"><Icon name="check" />{k}</span>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">APSIG · Code-Secours CI · Prototype v0.3 — Ensemble pour des communautés plus sûres</footer>
    </>
  );
}
