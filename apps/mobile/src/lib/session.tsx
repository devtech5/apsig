import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { appel, ErreurApi } from "./api";
import { CLES, coffre } from "./coffre";
import { jetonNotifications } from "./notifications";
import { comptePersonnel, deconnecterPersonnel, type ComptePersonnel } from "./personnel";

// Abonné : jeton remis à l'activation. Personnel : session Better Auth (agents de pose, unités terrain).
export type Session =
  | { type: "aucune" }
  | { type: "abonne"; jeton: string; prenom: string }
  | { type: "personnel"; compte: ComptePersonnel };

type Contexte = {
  session: Session | null; // null tant que le trousseau n'est pas relu
  ouvrirAbonne: (jeton: string, prenom: string) => Promise<void>;
  ouvrirPersonnel: (compte: ComptePersonnel) => void;
  fermer: () => Promise<void>;
  // Réponse 401 de l'API : l'accès a été retiré (téléphone déconnecté par APSIG, session expirée).
  expiree: () => Promise<void>;
};

const SessionContexte = createContext<Contexte | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void (async () => {
      const abonne = await coffre.lire(CLES.abonne).catch(() => null);
      if (abonne) {
        const { jeton, prenom } = JSON.parse(abonne) as { jeton: string; prenom: string };
        return setSession({ type: "abonne", jeton, prenom });
      }
      const compte = await comptePersonnel().catch(() => null);
      setSession(compte ? { type: "personnel", compte } : { type: "aucune" });
    })();
  }, []);

  // Notifications des alertes du foyer : jeton envoyé à chaque ouverture (il peut changer).
  useEffect(() => {
    if (session?.type !== "abonne") return;
    void jetonNotifications()
      .then((jetonPush) => jetonPush && appel("/client/notifications", { methode: "PUT", corps: { jetonPush }, jeton: session.jeton }))
      .catch(() => undefined);
  }, [session]);

  const ouvrirAbonne = useCallback(async (jeton: string, prenom: string) => {
    await coffre.ecrire(CLES.abonne, JSON.stringify({ jeton, prenom }));
    setSession({ type: "abonne", jeton, prenom });
  }, []);

  const ouvrirPersonnel = useCallback((compte: ComptePersonnel) => setSession({ type: "personnel", compte }), []);

  const expiree = useCallback(async () => {
    await coffre.effacer(CLES.abonne);
    setSession({ type: "aucune" });
  }, []);

  const fermer = useCallback(async () => {
    if (session?.type === "abonne") await appel("/client/session", { methode: "DELETE", jeton: session.jeton }).catch(() => undefined);
    if (session?.type === "personnel") await deconnecterPersonnel().catch(() => undefined);
    await expiree();
  }, [session, expiree]);

  const valeur = useMemo(() => ({ session, ouvrirAbonne, ouvrirPersonnel, fermer, expiree }), [session, ouvrirAbonne, ouvrirPersonnel, fermer, expiree]);
  return <SessionContexte.Provider value={valeur}>{children}</SessionContexte.Provider>;
}

export function useSession() {
  const c = useContext(SessionContexte);
  if (!c) throw new Error("useSession hors de SessionProvider");
  return c;
}

// Appels de l'espace abonné : le jeton est ajouté, et un 401 ramène à l'activation.
export function useAbonne() {
  const { session, expiree } = useSession();
  if (session?.type !== "abonne") throw new Error("Espace réservé aux abonnés");
  const { jeton, prenom } = session;
  const appeler = useCallback(
    async <T,>(chemin: string, options: Parameters<typeof appel>[1] = {}) => {
      try {
        return await appel<T>(chemin, { ...options, jeton });
      } catch (e) {
        if (e instanceof ErreurApi && e.statut === 401) await expiree();
        throw e;
      }
    },
    [jeton, expiree],
  );
  return { prenom, appeler };
}
