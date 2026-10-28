'use client';

// Composants d'interface partagés (Tailwind). Les couleurs viennent des jetons de la charte (app/globals.css).
import { useEffect, useRef } from 'react';
import { PATHS } from './icon-paths';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Icon({ name, className = '' }) {
  return (
    <svg
      className={cx('shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]', !/(^|\s)size-/.test(className) && 'size-4', className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }}
    />
  );
}

// Version chaîne pour les infobulles et marqueurs Leaflet.
export function iconHTML(name, cls = '') {
  return `<svg class="cs-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

const BTN_VARIANTS = {
  default: 'bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2',
  primary: 'bg-brand text-white hover:bg-brand-700 shadow-sm',
  danger: 'bg-danger text-white hover:bg-danger-700 shadow-sm',
  success: 'bg-success text-white hover:brightness-110 shadow-sm',
  ghost: 'text-ink hover:bg-surface-2',
  glass: 'bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20',
};
const BTN_SIZES = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-xl',
};

export function Button({ variant = 'default', size = 'md', className, as: As = 'button', children, ...props }) {
  const extra = As === 'button' ? { type: props.type ?? 'button' } : {};
  return (
    <As
      {...props}
      {...extra}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center font-semibold whitespace-nowrap transition duration-150 select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50',
        BTN_VARIANTS[variant], BTN_SIZES[size], className,
      )}
    >
      {children}
    </As>
  );
}

const TONES = {
  neutral: 'bg-surface-3 text-muted',
  danger: 'bg-agression-bg text-agression',
  warning: 'bg-warning-bg text-warning-ink',
  success: 'bg-success-bg text-success',
  info: 'bg-incendie-bg text-incendie',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  agression: 'bg-agression-bg text-agression',
  medical: 'bg-medical-bg text-medical',
  incendie: 'bg-incendie-bg text-incendie',
  bleu: 'bg-pass-bleu text-white',
  rouge: 'bg-pass-rouge text-white',
};

export function Badge({ tone = 'neutral', className, children, title }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusPill({ meta }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', TONES[meta.tone])}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

export function Spinner({ className = 'size-5' }) {
  return <span className={cx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-hidden="true" />;
}

export function LiveDot({ on, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase', on ? 'text-success' : 'text-warning')}>
      <span className={cx('size-2 rounded-full bg-current', on && 'animate-pulse')} />
      {children}
    </span>
  );
}

export function Card({ className, children, ...props }) {
  return <section {...props} className={cx('rounded-2xl border border-line bg-surface p-5 shadow-card', className)}>{children}</section>;
}

export function Field({ label, hint, className, children }) {
  return (
    <label className={cx('grid gap-1.5 text-[13px] font-semibold text-ink', className)}>
      {label}
      {children}
      {hint && <small className="font-normal text-muted">{hint}</small>}
    </label>
  );
}

export const inputCls = 'h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-focus focus:ring-3 focus:ring-focus/20';
export const textareaCls = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-focus focus:ring-3 focus:ring-focus/20';

// Boîte de dialogue native (<dialog>) pilotée par React : focus piégé et Échap gérés par le navigateur.
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm',
        size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open && (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h3 className="text-base font-bold">{title}</h3>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer" className="!px-2"><Icon name="x" /></Button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// Plaque physique Code-Secours : proportions et typographie en unités de conteneur (cqi).
export function Plate({ plate, qr = true, className }) {
  const premium = plate.pass === 'rouge';
  const chars = plate.code.length;
  // L'enveloppe porte le conteneur : les unités cqi de la plaque se rapportent à sa largeur.
  return (
    <div className={cx('@container w-full', className)}>
    <div
      role="img"
      aria-label={`Plaque ${plate.code} — Pass ${premium ? 'Rouge Premium' : 'Bleu'}`}
      className={cx(
        'relative isolate flex aspect-[1.62] w-full flex-col overflow-hidden rounded-[6cqi] px-[6cqi] pt-[4.5cqi] pb-[5cqi] text-white shadow-plate',
        'before:absolute before:inset-[2.2cqi] before:-z-10 before:rounded-[4cqi] before:border-[0.7cqi] before:border-white/85',
        'after:absolute after:inset-0 after:-z-20 after:bg-[linear-gradient(160deg,rgba(255,255,255,.22),transparent_45%)]',
        premium ? 'bg-[radial-gradient(120%_140%_at_20%_0%,var(--color-pass-rouge),var(--color-pass-rouge-dark))]' : 'bg-[radial-gradient(120%_140%_at_20%_0%,var(--color-pass-bleu),var(--color-pass-bleu-dark))]',
      )}
    >
      <div className="mt-[1.2cqi] text-center text-[4.2cqi] font-extrabold tracking-[.12em] opacity-90">CODE-SECOURS CI{premium ? ' PREMIUM' : ''}</div>
      <div className="mt-[2.2cqi] text-center leading-[1.1] font-black tracking-tight whitespace-nowrap [text-shadow:0_.4cqi_0_rgba(0,0,0,.25)]" style={{ fontSize: `min(8.6cqi, calc(124cqi / ${chars}))` }}>
        {plate.code}
      </div>
      {plate.shortCode && <div className="mt-[1.2cqi] text-center text-[3.3cqi] font-bold opacity-90">Sans Internet : *789*{plate.shortCode}#</div>}
      <div className="mt-auto flex items-end justify-between gap-[4cqi]">
        <div className="aspect-square w-[25cqi] rounded-[1.6cqi] bg-white p-[1cqi]">
          {qr && <img src={`/qr/${plate.token}.svg`} alt="" loading="lazy" className="size-full" />}
        </div>
        <div className="flex items-center gap-[2cqi] text-right">
          <div>
            <strong className="block text-[7.4cqi] leading-none font-black">APSIG</strong>
            <span className="mt-[.6cqi] block text-[3.4cqi] font-bold opacity-90">{premium ? 'Sécurité armée' : 'SOS Secours'}</span>
          </div>
          <img src="/img/logo-apsig.svg" alt="" className="w-[10cqi]" />
        </div>
      </div>
    </div>
    </div>
  );
}

export function Brand({ subtitle, light = false, href = '/' }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-focus">
      <img src="/img/logo-apsig.svg" alt="" className="size-9" />
      <div className="leading-tight">
        <strong className={cx('block text-[15px] font-extrabold tracking-wide', light ? 'text-white' : 'text-brand dark:text-white')}>APSIG</strong>
        <span className={cx('block text-xs', light ? 'text-white/75' : 'text-muted')}>{subtitle}</span>
      </div>
    </a>
  );
}

export function DemoRibbon({ children, className }) {
  return (
    <div className={cx('border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/60 dark:text-amber-200', className)}>
      {children}
    </div>
  );
}

export function EmptyState({ icon = 'info', title, children }) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-10 text-center text-muted">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted"><Icon name={icon} className="size-6" /></span>
      {title && <strong className="text-ink">{title}</strong>}
      {children && <p className="max-w-xs text-sm">{children}</p>}
    </div>
  );
}
