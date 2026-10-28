import type { Metadata } from "next";
import { cache } from "react";
import { PageErreur } from "@/components/Cadre";
import { PageAlerte } from "@/components/PageAlerte";
import { API_URL, type SupportPublic } from "@/lib/api";

export const dynamic = "force-dynamic";

// Côté serveur, l'API peut être jointe par une adresse interne (même machine, réseau privé).
const API_SERVEUR = process.env.API_INTERNAL_URL ?? API_URL;

type Chargement = { support: SupportPublic } | { erreur: { titre: string; message: string } };

// Rendu côté serveur : le menu d'urgences s'affiche sans attendre le JavaScript (3G, entrée de gamme).
const chargerSupport = cache(async (jeton: string): Promise<Chargement> => {
  try {
    const r = await fetch(`${API_SERVEUR}/public/supports/${encodeURIComponent(jeton)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { support: (await r.json()) as SupportPublic };
    const corps = await r.json().catch(() => null);
    const message = typeof corps?.message === "string" ? corps.message : "En cas d'urgence, appelez directement les secours.";
    const titre = r.status === 410 ? "QR code remplacé" : r.status === 403 ? "Support inactif" : "QR code non reconnu";
    return { erreur: { titre, message } };
  } catch {
    return { erreur: { titre: "Centrale injoignable", message: "La page n'a pas pu joindre la centrale APSIG. En cas d'urgence, appelez directement les secours." } };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ jeton: string }> }): Promise<Metadata> {
  const c = await chargerSupport((await params).jeton);
  return { title: "support" in c ? `SOS ${c.support.code} — Code-Secours CI` : "Code-Secours CI" };
}

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const c = await chargerSupport(jeton);
  if ("erreur" in c) return <PageErreur {...c.erreur} />;
  return <PageAlerte jeton={jeton} support={c.support} />;
}
