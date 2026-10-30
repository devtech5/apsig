"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { appelApi, type Compte, ErreurApi } from "@/lib/api";

type Session = { compte: Compte; recharger: () => Promise<void>; deconnecter: () => Promise<void> };

const Contexte = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(Contexte);
  if (!s) throw new Error("useSession hors de <SessionProvider>");
  return s;
}

// Compte connecté, partagé par toutes les pages du back-office. Sans session : page de connexion ;
// double authentification pas encore activée : page Sécurité, seule accessible.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const chemin = usePathname();
  const [compte, setCompte] = useState<Compte | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      setCompte(await appelApi<Compte>("/compte"));
      setErreur(null);
    } catch (e) {
      if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 403)) router.replace("/connexion");
      else setErreur((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  // Serveur injoignable (redémarrage, réseau) : nouvel essai toutes les 5 s.
  useEffect(() => {
    if (!erreur) return;
    const t = setTimeout(() => void recharger(), 5000);
    return () => clearTimeout(t);
  }, [erreur, recharger]);

  useEffect(() => {
    if (compte?.deuxFacteursRequis && chemin !== "/securite") router.replace("/securite");
  }, [compte, chemin, router]);

  const deconnecter = useCallback(async () => {
    await appelApi("/auth/sign-out", {}).catch(() => null);
    router.replace("/connexion");
  }, [router]);

  if (!compte) {
    return (
      <p className="p-6 text-attenue">
        {erreur ? `${erreur} : nouvel essai…` : "Chargement…"}
        {erreur && <button onClick={() => void recharger()} className="ml-2 font-semibold text-brand underline">Réessayer</button>}
      </p>
    );
  }
  if (compte.deuxFacteursRequis && chemin !== "/securite") return null;
  return <Contexte value={{ compte, recharger, deconnecter }}>{children}</Contexte>;
}
