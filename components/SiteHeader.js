'use client';

import { useState } from 'react';
import { Brand, Button, Icon, cx } from './ui';
import { logout } from '@/lib/common';

const LINKS = [
  { href: '/', label: 'Accueil' },
  { href: '/demo', label: 'Page SOS', external: true },
  { href: '/centrale', label: 'Centrale' },
  { href: '/plaques', label: 'Plaques' },
  { href: '/terrain', label: 'Terrain' },
  { href: '/ussd', label: 'USSD / SMS' },
];

export default function SiteHeader({ subtitle = 'Sécurité pour tous, en toute confiance', current, links = LINKS, user }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="no-print sticky top-0 z-40 border-b border-white/10 bg-brand/95 text-white backdrop-blur supports-[backdrop-filter]:bg-brand/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Brand subtitle={subtitle} light />
        {links.length > 0 && (
          <nav aria-label="Navigation principale" className="ml-auto hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener' } : {})}
                aria-current={current === l.href ? 'page' : undefined}
                className={cx('rounded-lg px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white', current === l.href && 'bg-white/15 text-white')}
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}
        {user && (
          <div className="ml-auto flex items-center gap-2 md:ml-2">
            <span className="hidden text-right text-xs leading-tight text-white/80 sm:block"><strong className="block text-sm text-white">{user.name}</strong>{user.roleLabel}</span>
            <Button variant="glass" size="sm" onClick={logout} aria-label="Se déconnecter"><Icon name="logout" /></Button>
          </div>
        )}
        {links.length > 0 && (
          <Button variant="glass" size="sm" className={cx('md:hidden', !user && 'ml-auto')} aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
            <Icon name={open ? 'x' : 'chevronDown'} />
          </Button>
        )}
      </div>
      {open && (
        <nav aria-label="Navigation mobile" className="grid gap-1 border-t border-white/10 px-4 py-3 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} {...(l.external ? { target: '_blank', rel: 'noopener' } : {})} className="rounded-lg px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">{l.label}</a>
          ))}
        </nav>
      )}
    </header>
  );
}
