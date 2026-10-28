import type { StatutAlerte, TypeSupport, TypeUrgence } from "@apsig/domain";

// Formes renvoyées par les routes publiques de apps/api (cf. AlertesService.supportPublic / vuePublique).
export type SupportPublic = {
  type: TypeSupport;
  libelle: string;
  code: string;
  lieu: { quartier: string; ville: string; adresseVerifiee: boolean } | null;
  urgences: { type: TypeUrgence; bouton: string; description: string }[];
};

export type AlertePublique = {
  numero: string;
  type: TypeUrgence;
  urgence: string;
  statut: StatutAlerte;
  creeLe: string;
  priseEnChargeLe: string | null;
  surPlaceLe: string | null;
  clotureLe: string | null;
  positionPartagee: boolean;
  peutAnnuler: boolean;
};

export type Position = { lat: number; lng: number; precisionM?: number };

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ErreurApi extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

// Messages de l'API (déjà rédigés pour le témoin) ; repli neutre si le réseau est en cause.
export async function appelApi<T>(chemin: string, init?: { methode?: "GET" | "POST"; corps?: unknown; signal?: AbortSignal }): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`${API_URL}${chemin}`, {
      method: init?.methode ?? "GET",
      headers: init?.corps ? { "Content-Type": "application/json" } : undefined,
      body: init?.corps ? JSON.stringify(init.corps) : undefined,
      cache: "no-store",
      signal: init?.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ErreurApi("Connexion impossible avec la centrale", 0);
  }
  const donnees = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const message = typeof donnees?.message === "string" ? donnees.message : null;
    if (reponse.status === 429) throw new ErreurApi("Trop de déclenchements depuis ce réseau. Patientez une minute", 429);
    throw new ErreurApi(message ?? "La centrale n'a pas pu enregistrer la demande", reponse.status);
  }
  return donnees as T;
}
