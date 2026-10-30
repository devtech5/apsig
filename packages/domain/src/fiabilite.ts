// Score de fiabilité d'une alerte (0–100), repris du prototype Secour v0.3.
// Il aide l'opérateur à prioriser mais n'empêche jamais une alerte d'être traitée.

import { distanceM, formatDistance, type Position } from "./geo.ts";
import { estFixe, type TypeSupport } from "./supports.ts";

export const STATUTS_RAPPEL = ["EN_ATTENTE", "CONFIRME", "EN_SECURITE", "INJOIGNABLE", "FAUSSE_ALERTE"] as const;
export type StatutRappel = (typeof STATUTS_RAPPEL)[number];
export type SourceAlerte = "QR" | "USSD" | "SMS" | "CENTRALE" | "APPLI";

export type ContexteFiabilite = {
  support: TypeSupport;
  source: SourceAlerte;
  adresse?: Position | null; // adresse du foyer (supports fixes)
  temoin?: (Position & { precisionM?: number }) | null;
  appareilBloque?: boolean;
  alertesAppareilAutresSupports24h?: number;
  redeclenchements?: number;
  medias?: number;
  rappel?: StatutRappel;
};

export type Raison = { delta: number; texte: string };
export type Fiabilite = { score: number; niveau: "ELEVEE" | "MOYENNE" | "FAIBLE"; raisons: Raison[] };

export const LIBELLES_RAPPEL: Record<StatutRappel, string> = {
  EN_ATTENTE: "Rappel du titulaire en cours",
  CONFIRME: "Titulaire joint : urgence confirmée",
  EN_SECURITE: "Titulaire joint : déclare être en sécurité",
  INJOIGNABLE: "Titulaire injoignable",
  FAUSSE_ALERTE: "Titulaire : fausse alerte",
};

export function calculerFiabilite(c: ContexteFiabilite): Fiabilite {
  const raisons: Raison[] = [];
  let score = 60;
  const ajouter = (delta: number, texte: string) => {
    score += delta;
    raisons.push({ delta, texte });
  };

  if (c.support === "INTERIEUR") ajouter(10, "QR intérieur : témoin présent dans le domicile");

  if (estFixe(c.support)) {
    if (c.temoin && c.adresse) {
      const d = distanceM(c.temoin, c.adresse);
      const tolerance = Math.max(150, (c.temoin.precisionM ?? 0) + 100);
      if (d <= tolerance) ajouter(25, `Témoin localisé à ${formatDistance(d)} de l'adresse`);
      else if (d <= 1000) ajouter(5, `Témoin à proximité (${formatDistance(d)})`);
      else ajouter(-30, `Témoin éloigné de l'adresse (${formatDistance(d)})`);
    } else if (c.source === "QR") {
      raisons.push({ delta: 0, texte: "Position du témoin non partagée" });
    }
  } else if (c.temoin) {
    // Support mobile : pas d'adresse à comparer, la position partagée sert à envoyer les secours.
    ajouter(15, "Position du témoin partagée (support mobile)");
  } else {
    ajouter(-10, "Support mobile sans position : localisation à obtenir par téléphone");
  }

  if (c.source === "USSD" || c.source === "SMS") ajouter(10, "Numéro de téléphone identifié par le réseau");
  if (c.source === "APPLI") ajouter(15, "Déclenchée depuis l'application par un abonné identifié");

  if (c.appareilBloque) ajouter(-50, "Appareil bloqué par un superviseur");
  const autres = c.alertesAppareilAutresSupports24h ?? 0;
  if (autres >= 3) ajouter(-25, `Appareil : ${autres} alertes sur d'autres supports en 24 h`);
  else if (autres >= 1) ajouter(-5, `Appareil : ${autres} autre(s) alerte(s) en 24 h`);

  if ((c.redeclenchements ?? 0) > 0) ajouter(5, "Déclenchements répétés depuis le support");
  if ((c.medias ?? 0) > 0) ajouter(10, "Photo, vocal ou message joint par le témoin");

  switch (c.rappel) {
    case "CONFIRME": ajouter(30, LIBELLES_RAPPEL.CONFIRME); break;
    case "EN_SECURITE": ajouter(-10, LIBELLES_RAPPEL.EN_SECURITE); break;
    case "INJOIGNABLE": ajouter(-5, LIBELLES_RAPPEL.INJOIGNABLE); break;
    case "FAUSSE_ALERTE": ajouter(-60, LIBELLES_RAPPEL.FAUSSE_ALERTE); break;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, niveau: score >= 70 ? "ELEVEE" : score >= 40 ? "MOYENNE" : "FAIBLE", raisons };
}
