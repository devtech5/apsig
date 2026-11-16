"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LIBELLES_ROLE } from "@apsig/domain";
import { estActif, type LienNavigation, pageDe, parGroupe } from "@/lib/navigation";
import { NOMS_SITE } from "@/lib/site";
import { Icone, type NomIcone } from "./Icone";
import { useSession } from "./Session";

type SiteDistant = keyof typeof NOMS_SITE;

// Coque du QG (base.apsig.online) : barre latérale à sections, en-tête avec recherche de client et compte connecté.
// Sur téléphone, la barre latérale s'ouvre par le bouton menu.
export function CoqueQg({ liens, ailleurs, children }: { liens: LienNavigation[]; ailleurs: SiteDistant[]; children: React.ReactNode }) {
  const chemin = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);
  // Une page choisie ferme le menu sur téléphone.
  useEffect(() => setMenuOuvert(false), [chemin]);
  const titre = chemin === "/securite" ? "Sécurité du compte" : (pageDe(chemin)?.libelle ?? NOMS_SITE.base.titre);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {menuOuvert && <button aria-label="Fermer le menu" onClick={() => setMenuOuvert(false)} className="fixed inset-0 z-30 bg-encre/40 lg:hidden" />}
      <BarreLaterale liens={liens} ailleurs={ailleurs} ouverte={menuOuvert} onFermer={() => setMenuOuvert(false)} />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ligne bg-white px-4 py-2.5 print:hidden">
          <button onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu" aria-expanded={menuOuvert} className="rounded-lg p-1.5 text-attenue hover:bg-fond lg:hidden">
            <Icone nom="menu" className="size-5" />
          </button>
          <span className="hidden truncate text-sm text-attenue sm:block lg:w-48">
            {NOMS_SITE.base.titre} <span className="text-ligne">/</span> <span className="text-encre">{titre}</span>
          </span>
          <Recherche />
          <MenuCompte />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function BarreLaterale({ liens, ailleurs, ouverte, onFermer }: { liens: LienNavigation[]; ailleurs: SiteDistant[]; ouverte: boolean; onFermer: () => void }) {
  const chemin = usePathname();
  const groupes = parGroupe(liens);
  return (
    <aside
      aria-label="Navigation du QG"
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-5 overflow-y-auto bg-brand px-3 py-4 text-white transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-x-0 print:hidden ${
        ouverte ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2">
        <Link href={liens[0]?.href ?? "/securite"} className="flex flex-1 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-brand shadow-sm">
          <img src="/logo-apsig.svg" alt="" width={24} height={28} className="h-7 w-6" />
          <span className="leading-tight">
            <span className="block font-black">APSIG</span>
            <span className="block text-[11px] text-attenue">{NOMS_SITE.base.sousTitre}</span>
          </span>
        </Link>
        <button onClick={onFermer} aria-label="Fermer le menu" className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden">
          <Icone nom="fermer" className="size-5" />
        </button>
      </div>
      <nav aria-label="Pages" className="grid gap-4">
        {groupes.map((g) => (
          <Section key={g.groupe} titre={g.groupe}>
            {g.liens.map((l) => (
              <LienLateral key={l.href} href={l.href} libelle={l.libelle} icone={l.icone} actif={estActif(l.href, chemin)} />
            ))}
          </Section>
        ))}
        <Section titre="Compte">
          <LienLateral href="/securite" libelle="Sécurité du compte" icone="cadenas" actif={chemin === "/securite"} />
        </Section>
        {ailleurs.length > 0 && (
          <Section titre="Autres sites">
            {ailleurs.map((s) => (
              <a key={s} href={NOMS_SITE[s].adresse} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10">
                <Icone nom="lien" className="size-4 shrink-0" />
                {NOMS_SITE[s].titre}
              </a>
            ))}
          </Section>
        )}
      </nav>
    </aside>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <p className="px-3 pb-1 text-[11px] font-bold tracking-widest text-white/60 uppercase">{titre}</p>
      {children}
    </div>
  );
}

function LienLateral({ href, libelle, icone, actif }: { href: string; libelle: string; icone: NomIcone; actif: boolean }) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${actif ? "bg-white text-brand shadow-sm" : "text-white/85 hover:bg-white/10"}`}
    >
      <Icone nom={icone} className="size-4 shrink-0" />
      {libelle}
    </Link>
  );
}

// Recherche d'un foyer (nom, téléphone, code plaque, n° de foyer) : ouvre la liste des abonnements filtrée.
function Recherche() {
  const router = useRouter();
  const { compte } = useSession();
  const [q, setQ] = useState("");
  if (!compte.espaces.includes("abonnements")) return <span className="flex-1" />;
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/abonnements?q=${encodeURIComponent(q.trim())}`);
      }}
      className="mx-auto flex w-full max-w-md min-w-0 flex-1 items-center gap-2 rounded-lg border border-ligne bg-fond px-3 py-1.5 focus-within:border-brand"
    >
      <Icone nom="loupe" className="size-4 shrink-0 text-attenue" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un client, un téléphone, un code plaque…"
        aria-label="Rechercher un client"
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-attenue"
      />
    </form>
  );
}

function MenuCompte() {
  const { compte, deconnecter } = useSession();
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="relative ml-auto shrink-0">
      <button onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-fond">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-white">
          {compte.nom.trim().charAt(0).toUpperCase()}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-semibold">{compte.nom}</span>
          <span className="block text-xs text-attenue">{LIBELLES_ROLE[compte.role]}</span>
        </span>
      </button>
      {ouvert && (
        <div className="absolute right-0 z-30 mt-1 grid w-52 rounded-xl bg-white p-1 text-sm text-encre shadow-lg ring-1 ring-ligne">
          <Link href="/securite" onClick={() => setOuvert(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-fond">
            <Icone nom="cadenas" className="size-4" /> Sécurité du compte
          </Link>
          <button onClick={() => void deconnecter()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-fond">
            <Icone nom="sortie" className="size-4" /> Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
