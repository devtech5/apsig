import { randomBytes } from "node:crypto";

// Valeurs alignées sur l'enum TypeSupport de @apsig/db.
export const TYPES_SUPPORT = ["PORTAIL", "INTERIEUR", "BRACELET", "CARTE_VOYAGEUR", "CARTE_VEHICULE"] as const;
export type TypeSupport = (typeof TYPES_SUPPORT)[number];

export const SUPPORTS: Record<TypeSupport, { libelle: string; fixe: boolean; prefixe: string }> = {
  PORTAIL: { libelle: "QR portail (extérieur)", fixe: true, prefixe: "" },
  INTERIEUR: { libelle: "QR intérieur", fixe: true, prefixe: "INT" },
  BRACELET: { libelle: "Bracelet enfant", fixe: false, prefixe: "ENF" },
  CARTE_VOYAGEUR: { libelle: "Carte voyageur", fixe: false, prefixe: "VOY" },
  CARTE_VEHICULE: { libelle: "Carte véhicule", fixe: false, prefixe: "VEH" },
};

// Support fixe : la position de référence est l'adresse du foyer.
// Support mobile : c'est le GPS du témoin.
export const estFixe = (type: TypeSupport) => SUPPORTS[type].fixe;

// Alphabet sans caractères ambigus (0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function genererJeton(longueur = 12): string {
  return Array.from(randomBytes(longueur), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

// Code lisible imprimé sur le support (jamais encodé dans le QR).
// Portail, format adaptatif : VILLE-QUARTIER-NNN (DAL-LOBIA-053), ou
// VILLE-COMMUNE-QUARTIER-NNN pour une ville découpée en communes (ABJ-YOP-NIANGON-453).
export function codeSupport(
  type: TypeSupport,
  p: { ville?: string; commune?: string; quartier?: string; numero: number; rang?: number },
): string {
  switch (type) {
    case "PORTAIL":
      if (!p.ville || !p.quartier) throw new Error("Ville et quartier requis pour un QR portail");
      return [p.ville, p.commune, p.quartier].filter(Boolean).map((s) => slug(s!)).join("-") + `-${pad(p.numero, 3)}`;
    case "BRACELET":
      return `ENF-${pad(p.numero, 4)}-${pad(p.rang ?? 1, 2)}`;
    default:
      return `${SUPPORTS[type].prefixe}-${pad(p.numero, 4)}`;
  }
}

export const urlAlerte = (base: string, jeton: string) => `${base.replace(/\/$/, "")}/s/${jeton}`;
