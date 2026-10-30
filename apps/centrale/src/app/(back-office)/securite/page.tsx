"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { accueilDe } from "@/components/Coque";
import { useSession } from "@/components/Session";
import { appelApi, ErreurApi } from "@/lib/api";

type Activation = { totpURI: string; backupCodes: string[]; qr: string; secret: string };

const message = (e: unknown, mauvais: string) =>
  e instanceof ErreurApi && (e.statut === 400 || e.statut === 401) ? mauvais : (e as Error).message;

export default function Securite() {
  const { compte, recharger } = useSession();
  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-4">
      <h1 className="text-xl font-black">Sécurité du compte</h1>
      {compte.deuxFacteurs ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-bold">Double authentification activée</h2>
          <p className="mt-1 text-sm text-attenue">
            Chaque connexion demande le code à 6 chiffres de votre application d'authentification. En cas de perte du téléphone, utilisez un code de
            secours, ou demandez à un administrateur de réinitialiser votre accès.
          </p>
        </section>
      ) : (
        <ActiverDeuxFacteurs onActive={recharger} />
      )}
      <ChangerMotDePasse />
    </main>
  );
}

function ActiverDeuxFacteurs({ onActive }: { onActive: () => Promise<void> }) {
  const router = useRouter();
  const { compte } = useSession();
  const [activation, setActivation] = useState<Activation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function commencer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelApi<{ totpURI: string; backupCodes: string[] }>("/auth/two-factor/enable", { password: new FormData(e.currentTarget).get("motDePasse") });
      const secret = new URL(r.totpURI).searchParams.get("secret") ?? "";
      setActivation({ ...r, secret, qr: await QRCode.toDataURL(r.totpURI, { margin: 1, width: 220 }) });
    } catch (err) {
      setErreur(message(err, "Mot de passe incorrect"));
    } finally {
      setEnvoi(false);
    }
  }

  async function verifier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await appelApi("/auth/two-factor/verify-totp", { code: String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "") });
      await onActive();
      router.replace(accueilDe(compte.espaces));
    } catch (err) {
      setErreur(message(err, "Code incorrect : vérifiez l'heure du téléphone et réessayez"));
      setEnvoi(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="font-bold">Activer la double authentification</h2>
      <p className="text-sm text-attenue">
        Le back-office donne accès à des données de santé et à des adresses : en plus du mot de passe, chaque connexion demande un code à 6 chiffres
        affiché par une application d'authentification (Google Authenticator, Microsoft Authenticator, Aegis…).
        {compte.deuxFacteursRequis && " Elle est obligatoire avant d'accéder au back-office."}
      </p>
      {!activation ? (
        <form onSubmit={commencer} className="grid gap-3 sm:max-w-sm">
          <label className="grid gap-1 text-sm font-semibold">
            Mot de passe actuel
            <input name="motDePasse" type="password" autoComplete="current-password" required className="rounded-lg border border-ligne px-3 py-2 font-normal" />
          </label>
          <button disabled={envoi} className="rounded-lg bg-brand px-4 py-2.5 font-bold text-white disabled:opacity-60">
            Commencer
          </button>
        </form>
      ) : (
        <>
          <ol className="grid gap-3 text-sm">
            <li>
              <p className="font-semibold">1. Scannez ce QR code avec l'application d'authentification</p>
              <img src={activation.qr} alt="QR code d'activation" width={220} height={220} className="mt-2 rounded-lg border border-ligne" />
              <p className="mt-1 text-xs text-attenue">
                Ou saisissez la clé : <code className="font-mono break-all select-all">{activation.secret}</code>
              </p>
            </li>
            <li>
              <p className="font-semibold">2. Conservez ces codes de secours en lieu sûr (chacun ne sert qu'une fois)</p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono sm:grid-cols-4">
                {activation.backupCodes.map((c) => (
                  <li key={c} className="rounded bg-fond px-2 py-1 text-center">{c}</li>
                ))}
              </ul>
            </li>
          </ol>
          <form onSubmit={verifier} className="grid gap-2 sm:max-w-sm">
            <label className="grid gap-1 text-sm font-semibold">
              3. Code affiché par l'application
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                required
                autoFocus
                className="rounded-lg border border-ligne px-3 py-2 font-mono text-lg tracking-widest"
              />
            </label>
            <button disabled={envoi} className="rounded-lg bg-brand px-4 py-2.5 font-bold text-white disabled:opacity-60">
              Activer
            </button>
          </form>
        </>
      )}
      {erreur && <p role="alert" className="rounded-lg bg-danger-fond px-3 py-2 text-sm text-danger">{erreur}</p>}
    </section>
  );
}

function ChangerMotDePasse() {
  const [etat, setEtat] = useState<{ ok?: boolean; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function changer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const champs = new FormData(form);
    if (champs.get("nouveau") !== champs.get("confirmation")) return setEtat({ texte: "Les deux nouveaux mots de passe diffèrent" });
    setEnvoi(true);
    try {
      await appelApi("/auth/change-password", { currentPassword: champs.get("actuel"), newPassword: champs.get("nouveau"), revokeOtherSessions: true });
      form.reset();
      setEtat({ ok: true, texte: "Mot de passe changé. Vos autres sessions ont été fermées." });
    } catch (err) {
      setEtat({ texte: message(err, "Mot de passe actuel incorrect, ou nouveau mot de passe trop court (12 caractères minimum)") });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="font-bold">Changer de mot de passe</h2>
      <form onSubmit={changer} className="mt-3 grid gap-3 sm:max-w-sm">
        <label className="grid gap-1 text-sm font-semibold">
          Mot de passe actuel
          <input name="actuel" type="password" autoComplete="current-password" required className="rounded-lg border border-ligne px-3 py-2 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Nouveau mot de passe (12 caractères minimum)
          <input name="nouveau" type="password" autoComplete="new-password" minLength={12} required className="rounded-lg border border-ligne px-3 py-2 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Confirmation
          <input name="confirmation" type="password" autoComplete="new-password" minLength={12} required className="rounded-lg border border-ligne px-3 py-2 font-normal" />
        </label>
        {etat && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${etat.ok ? "bg-succes-fond text-succes" : "bg-danger-fond text-danger"}`}>{etat.texte}</p>}
        <button disabled={envoi} className="rounded-lg border border-brand px-4 py-2 font-bold text-brand disabled:opacity-60">
          Changer le mot de passe
        </button>
      </form>
    </section>
  );
}
