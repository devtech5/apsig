"use client";

import { useState } from "react";
import { Icone } from "./Icone";

const LIENS = [
  { href: "#fonctionnement", libelle: "Comment ça marche" },
  { href: "#supports", libelle: "Supports" },
  { href: "#centrale", libelle: "La centrale" },
  { href: "#tarifs", libelle: "Tarifs" },
  { href: "#questions", libelle: "Questions" },
];

export function EnTete() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-marine/95 text-white backdrop-blur supports-[backdrop-filter]:bg-marine/85">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <a href="#haut" className="flex items-center gap-2.5" aria-label="APSIG, retour en haut de page">
          <img src="/logo-apsig.svg" alt="" width={28} height={32} className="h-8 w-7" />
          <span className="leading-none">
            <span className="block font-titre text-lg font-extrabold tracking-wide">APSIG</span>
            <span className="block text-[10px] tracking-[0.2em] text-white/60 uppercase">Code-Secours CI</span>
          </span>
        </a>
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-1 lg:flex">
          {LIENS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
              {l.libelle}
            </a>
          ))}
        </nav>
        <a
          href="#rappel"
          className="ml-auto hidden rounded-full bg-signal px-4 py-2 text-sm font-bold shadow-[0_8px_20px_-8px_rgb(200_16_46_/_0.8)] transition hover:bg-[#a90d26] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:inline-flex lg:ml-2"
        >
          Être rappelé
        </a>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-controls="menu-mobile"
          className="ml-auto rounded-lg p-2 hover:bg-white/10 sm:ml-0 lg:hidden"
        >
          <Icone nom={ouvert ? "fermer" : "menu"} className="size-6" />
          <span className="sr-only">{ouvert ? "Fermer le menu" : "Ouvrir le menu"}</span>
        </button>
      </div>
      {ouvert && (
        <nav id="menu-mobile" aria-label="Sections" className="grid gap-1 border-t border-white/10 px-4 pt-2 pb-4 lg:hidden">
          {LIENS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOuvert(false)} className="rounded-lg px-3 py-3 font-medium hover:bg-white/10">
              {l.libelle}
            </a>
          ))}
          <a href="#rappel" onClick={() => setOuvert(false)} className="mt-1 rounded-xl bg-signal px-3 py-3 text-center font-bold">
            Être rappelé par un conseiller
          </a>
        </nav>
      )}
    </header>
  );
}
