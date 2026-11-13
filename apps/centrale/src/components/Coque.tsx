"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Espace, LIBELLES_ESPACE, LIBELLES_ROLE } from "@apsig/domain";
import type { Presence } from "@/lib/api";
import { espaceSurSite, NOMS_SITE, SITE_ESPACE, siteCourant } from "@/lib/site";
import { useCentrale } from "./Centrale";
import { Icone, type NomIcone } from "./Icone";
import { useSession } from "./Session";

// Pages de chaque site (lib/site.ts) : la centrale (alertes), le terrain (recensement, pose), le QG (pilotage).
const NAVIGATION: { href: string; libelle: string; icone: NomIcone; espace: Espace }[] = [
  { href: "/", libelle: "Alertes", icone: "file", espace: "centrale" },
  { href: "/carte", libelle: "Carte", icone: "carte", espace: "centrale" },
  { href: "/supervision", libelle: "Supervision", icone: "equipe", espace: "supervision" },
  { href: "/recensement", libelle: "Recensement", icone: "plus", espace: "recensement" },
  { href: "/pose", libelle: "Pose de plaque", icone: "repere", espace: "pose" },
  { href: "/equipe", libelle: "Équipe terrain", icone: "equipe", espace: "equipe" },
  { href: "/administration", libelle: "Personnel", icone: "reglages", espace: "administration" },
  { href: "/abonnements", libelle: "Abonnements", icone: "maison", espace: "abonnements" },
  { href: "/finance", libelle: "Finance", icone: "file", espace: "finance" },
  { href: "/forfaits", libelle: "Forfaits", icone: "lien", espace: "forfaits" },
  { href: "/prestataires", libelle: "Prestataires", icone: "bouclier", espace: "prestataires" },
];

const liensDe = (espaces: Espace[]) => NAVIGATION.filter((n) => espaces.includes(n.espace) && espaceSurSite(n.espace, siteCourant()));

// Page d'accueil de chaque compte sur ce site : la première de ses espaces.
export const accueilDe = (espaces: Espace[]) => liensDe(espaces)[0]?.href ?? "/securite";

// Page du site courant correspondant au chemin (la plus longue correspondance), pour refuser celles d'un autre site.
const pageDe = (chemin: string) =>
  NAVIGATION.filter((n) => (n.href === "/" ? chemin === "/" : chemin === n.href || chemin.startsWith(`${n.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];

const PRESENCES: [Presence, string][] = [
  ["EN_SERVICE", "En service"],
  ["PAUSE", "Pause"],
  ["HORS_SERVICE", "Hors service"],
];

export function Coque({ children }: { children: React.ReactNode }) {
  const { compte } = useSession();
  const centrale = useCentrale();
  const chemin = usePathname();
  const router = useRouter();
  const actif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));
  const liens = liensDe(compte.espaces);
  const site = siteCourant();
  // Page d'un autre site, ou d'un espace que le compte n'a pas : retour à l'accueil du site.
  const page = pageDe(chemin);
  const horsSite = page != null && (!espaceSurSite(page.espace, site) || !compte.espaces.includes(page.espace));
  useEffect(() => {
    if (horsSite && liens.length > 0) router.replace(liens[0]!.href);
  }, [horsSite, liens, router]);
  // Sites où ce compte travaille, quand ce n'est pas celui-ci.
  const ailleurs = [...new Set(compte.espaces.map((e) => SITE_ESPACE[e]).filter((s) => s != null))].filter((s) => s !== site);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-brand px-4 py-2 text-white print:hidden">
        <Link href={accueilDe(compte.espaces)} className="flex items-center gap-2">
          <img src="/logo-apsig.svg" alt="" width={24} height={28} className="h-7 w-6" />
          <span className="leading-tight">
            <span className="block font-black">APSIG</span>
            <span className="block text-[11px] text-white/70">{site === "tout" ? "CODE-SECOURS CI" : NOMS_SITE[site].titre.toUpperCase()}</span>
          </span>
        </Link>
        {!compte.deuxFacteursRequis && (
          <nav aria-label="Espaces" className="mr-auto flex flex-wrap gap-1">
            {liens.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={actif(n.href) ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${actif(n.href) ? "bg-white text-brand" : "hover:bg-white/10"}`}
              >
                <Icone nom={n.icone} className="size-4" />
                {n.libelle}
              </Link>
            ))}
          </nav>
        )}
        {centrale && <EtatCentrale />}
        <Menu />
      </header>
      {centrale?.file?.crise.actif && <BandeauCrise />}
      {!compte.deuxFacteursRequis && liens.length === 0 && (
        <div role="status" className="grid gap-1 bg-brand-clair px-4 py-3 text-sm text-brand print:hidden">
          <p>Votre compte ne travaille pas sur ce site ({compte.espaces.map((e) => LIBELLES_ESPACE[e]).join(", ")}).</p>
          {ailleurs.length > 0 && (
            <p className="flex flex-wrap gap-3">
              {ailleurs.map((s) => (
                <a key={s} href={NOMS_SITE[s].adresse} className="font-bold underline">
                  Aller sur {NOMS_SITE[s].titre} ({NOMS_SITE[s].adresse.replace("https://", "")})
                </a>
              ))}
            </p>
          )}
        </div>
      )}
      <div className="flex-1">{horsSite ? null : children}</div>
    </div>
  );
}

function Menu() {
  const { compte, deconnecter } = useSession();
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10">
        <span className="block font-semibold">{compte.nom}</span>
        <span className="block text-xs text-white/70">{LIBELLES_ROLE[compte.role]}</span>
      </button>
      {ouvert && (
        <div className="absolute right-0 z-20 mt-1 grid w-52 rounded-xl bg-white p-1 text-sm text-encre shadow-lg">
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

function EtatCentrale() {
  const { compte } = useSession();
  const c = useCentrale()!;
  const [erreur, setErreur] = useState<string | null>(null);
  const operateur = compte.role === "OPERATEUR";

  async function changer(p: Presence) {
    setErreur(null);
    try {
      await c.changerPresence(p);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {c.horsLigne ? (
        <span className="rounded bg-danger px-2 py-1 text-xs font-bold">Serveur injoignable : nouvel essai en cours</span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-white/80" title={c.enDirect ? "Mises à jour instantanées" : "Mises à jour toutes les 5 s"}>
          <span className={`size-2 rounded-full ${c.enDirect ? "bg-green-400" : "bg-amber-400"}`} />
          {c.enDirect ? "En direct" : "Relecture 5 s"}
        </span>
      )}
      {operateur && c.file && (
        <div role="radiogroup" aria-label="Ma présence" className="flex rounded-lg bg-white/10 p-0.5">
          {PRESENCES.map(([p, libelle]) => (
            <button
              key={p}
              role="radio"
              aria-checked={c.file?.presence === p}
              onClick={() => void changer(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                c.file?.presence === p ? (p === "EN_SERVICE" ? "bg-green-500 text-white" : "bg-white text-brand") : "text-white/80 hover:bg-white/10"
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      )}
      {erreur && <span className="text-xs text-danger-fond">{erreur}</span>}
      {c.son.bloque ? (
        <button onClick={() => void c.son.activer()} className="clignote flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-danger">
          <Icone nom="son" className="size-4" /> Activer la sirène
        </button>
      ) : (
        <button onClick={c.son.basculer} aria-pressed={c.son.actif} title={c.son.actif ? "Couper la sirène" : "Rétablir la sirène"} className="rounded-lg p-1.5 hover:bg-white/10">
          <Icone nom={c.son.actif ? "son" : "sourdine"} className="size-5" />
          <span className="sr-only">{c.son.actif ? "Sirène active" : "Sirène coupée"}</span>
        </button>
      )}
    </div>
  );
}

function BandeauCrise() {
  const { crise } = useCentrale()!.file!;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-danger px-4 py-2 text-sm text-white print:hidden">
      <Icone nom="alerte" className="size-5 shrink-0" />
      <strong>Mode crise</strong>
      <span>
        {crise.enAttente} alerte{crise.enAttente > 1 ? "s" : ""} en attente pour {crise.operateursEnService} opérateur{crise.operateursEnService > 1 ? "s" : ""} en
        service, la plus ancienne depuis {Math.round(crise.plusLongueAttenteS / 60)} min. L'attribution automatique est suspendue : chacun prend la
        suivante, la plus urgente d'abord.
      </span>
    </div>
  );
}
