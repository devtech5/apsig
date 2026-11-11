export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type Demande = {
  cible: string;
  prenom: string;
  nom: string;
  telephone: string;
  email: string;
  ville: string;
  quartier: string;
  adresse: string;
  message: string;
  consentement: boolean;
  site: string;
};

// Renvoie null si la demande est enregistrée, sinon le message à montrer au visiteur.
export async function deposerDemande(demande: Demande): Promise<string | null> {
  let reponse: Response;
  try {
    reponse = await fetch(`${API_URL}/public/inscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demande),
    });
  } catch {
    return "Connexion impossible. Vérifiez votre réseau et réessayez.";
  }
  if (reponse.ok) return null;
  if (reponse.status === 429) return "Trop de demandes depuis ce réseau. Patientez une minute puis réessayez.";
  const donnees = await reponse.json().catch(() => null);
  const erreurs = Array.isArray(donnees?.erreurs) ? (donnees.erreurs as { message?: string }[]) : [];
  const premiere = erreurs.find((e) => typeof e.message === "string")?.message;
  return premiere ?? "La demande n'a pas pu être enregistrée. Réessayez dans un instant.";
}
