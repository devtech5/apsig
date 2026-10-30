"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/api";

const CHAMP = "rounded-lg border border-ligne px-3 py-2 font-normal";

export default function Connexion() {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Mot de passe accepté, code de l'application d'authentification attendu.
  const [code, setCode] = useState<"totp" | "secours" | null>(null);

  async function seConnecter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const champs = new FormData(e.currentTarget);
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelApi<{ twoFactorRedirect?: boolean }>("/auth/sign-in/email", { email: champs.get("email"), password: champs.get("motDePasse") });
      if (r.twoFactorRedirect) {
        setCode("totp");
        setEnvoi(false);
      } else router.replace("/");
    } catch (err) {
      const statut = err instanceof ErreurApi ? err.statut : 0;
      // Un 403 sans compte désactivé : l'API ne reconnaît pas l'adresse de la centrale (CENTRALE_URL).
      setErreur(
        statut === 401 ? "E-mail ou mot de passe incorrect"
        : statut === 403 && err instanceof Error && err.message === "Ce compte est désactivé" ? "Ce compte est désactivé"
        : statut === 403 ? "Connexion refusée par le serveur : adresse de la centrale non autorisée (CENTRALE_URL)"
        : statut === 429 ? "Trop de tentatives. Réessayez dans une minute"
        : "Connexion au serveur impossible",
      );
      setEnvoi(false);
    }
  }

  async function verifier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const saisi = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setEnvoi(true);
    setErreur(null);
    try {
      await appelApi(code === "secours" ? "/auth/two-factor/verify-backup-code" : "/auth/two-factor/verify-totp", {
        code: code === "secours" ? saisi : saisi.replace(/\s/g, ""),
      });
      router.replace("/");
    } catch (err) {
      const statut = err instanceof ErreurApi ? err.statut : 0;
      setErreur(
        statut === 401 || statut === 400 ? "Code incorrect"
        : statut === 429 || statut === 403 ? "Trop d'essais : reconnectez-vous dans quelques minutes"
        : "Connexion au serveur impossible",
      );
      setEnvoi(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-brand px-4">
      <div className="grid w-full max-w-sm gap-4 rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <img src="/logo-apsig.svg" alt="" width={32} height={36} className="h-9 w-8" />
          <div>
            <h1 className="text-lg leading-tight font-black">Back-office APSIG</h1>
            <p className="text-xs text-attenue">CODE-SECOURS CI · accès réservé aux équipes</p>
          </div>
        </div>
        {!code ? (
          <form onSubmit={seConnecter} className="grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">
              E-mail
              <input name="email" type="email" autoComplete="username" required className={CHAMP} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Mot de passe
              <input name="motDePasse" type="password" autoComplete="current-password" required className={CHAMP} />
            </label>
            {erreur && <p role="alert" className="rounded-lg bg-danger-fond px-3 py-2 text-sm text-danger">{erreur}</p>}
            <button disabled={envoi} className="rounded-lg bg-brand px-4 py-2.5 font-bold text-white disabled:opacity-60">
              {envoi ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        ) : (
          <form key={code} onSubmit={verifier} className="grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">
              {code === "totp" ? "Code à 6 chiffres de l'application d'authentification" : "Code de secours"}
              <input
                name="code"
                required
                autoFocus
                autoComplete="one-time-code"
                {...(code === "totp" && { inputMode: "numeric" as const, pattern: "[0-9 ]{6,7}" })}
                className={`${CHAMP} font-mono text-lg tracking-widest`}
              />
            </label>
            {erreur && <p role="alert" className="rounded-lg bg-danger-fond px-3 py-2 text-sm text-danger">{erreur}</p>}
            <button disabled={envoi} className="rounded-lg bg-brand px-4 py-2.5 font-bold text-white disabled:opacity-60">
              {envoi ? "Vérification…" : "Valider"}
            </button>
            <button type="button" onClick={() => setCode(code === "totp" ? "secours" : "totp")} className="text-sm text-brand underline">
              {code === "totp" ? "Téléphone indisponible : utiliser un code de secours" : "Utiliser l'application d'authentification"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
