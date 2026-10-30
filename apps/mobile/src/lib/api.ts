// Adresse de l'API, intégrée au build : apps/mobile/.env.local en développement, eas.json pour les builds EAS.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// Numéros publics, toujours affichés quand l'application ne joint pas la centrale.
export const SECOURS = [
  { nom: "Police", numero: "170" },
  { nom: "Pompiers", numero: "180" },
  { nom: "SAMU", numero: "185" },
] as const;

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message);
  }
}

type Options = { methode?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; corps?: unknown; jeton?: string | null; entetes?: Record<string, string> };

function messageDe(d: unknown): string | null {
  const m = (d as { message?: unknown } | null)?.message;
  if (typeof m === "string") return m;
  if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  return null;
}

export async function appel<T>(chemin: string, { methode, corps, jeton, entetes }: Options = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_URL}${chemin}`, {
      method: methode ?? (corps === undefined ? "GET" : "POST"),
      headers: {
        Accept: "application/json",
        ...(corps !== undefined && { "Content-Type": "application/json" }),
        ...(jeton && { Authorization: `Bearer ${jeton}` }),
        ...entetes,
      },
      ...(corps !== undefined && { body: JSON.stringify(corps) }),
    });
  } catch {
    throw new ErreurApi("Pas de connexion à APSIG. En urgence, appelez directement le 170, le 180 ou le 185.", 0);
  }
  if (r.status === 204) return undefined as T;
  const donnees: unknown = await r.json().catch(() => null);
  if (!r.ok) throw new ErreurApi(messageDe(donnees) ?? `Erreur ${r.status}`, r.status);
  return donnees as T;
}
