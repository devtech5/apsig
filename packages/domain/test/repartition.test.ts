import { describe, expect, it } from "vitest";
import { choisirOperateur, estEnCrise, scoreTriage, trouverIncident } from "../src/index.ts";

const ADRESSE = { lat: 6.8774, lng: -6.4502 }; // Daloa
const T0 = new Date("2026-10-30T10:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("Choix de l'opérateur", () => {
  it("prend le moins chargé, puis celui qui attend depuis le plus longtemps", () => {
    const candidats = [
      { id: "a", charge: 2, derniereAttributionLe: minutes(-30) },
      { id: "b", charge: 1, derniereAttributionLe: minutes(-1) },
      { id: "c", charge: 1, derniereAttributionLe: minutes(-5) },
      { id: "d", charge: 1, derniereAttributionLe: null },
    ];
    expect(choisirOperateur(candidats)?.id).toBe("d");
    expect(choisirOperateur(candidats.slice(0, 3))?.id).toBe("c");
  });

  it("ignore un opérateur à pleine capacité", () => {
    expect(choisirOperateur([{ id: "a", charge: 3, derniereAttributionLe: null }])).toBeUndefined();
  });
});

describe("Triage de la file", () => {
  it("une priorité supérieure passe toujours devant, quelle que soit l'attente", () => {
    const critiqueNeuve = scoreTriage({ priorite: "CRITIQUE", scoreFiabilite: 0, creeLe: T0 }, T0);
    const hauteAncienne = scoreTriage({ priorite: "HAUTE", scoreFiabilite: 100, creeLe: minutes(-120), rattachees: 50 }, T0);
    expect(critiqueNeuve).toBeGreaterThan(hauteAncienne);
  });

  it("à priorité égale, la plus fiable puis la plus ancienne d'abord", () => {
    const fiable = scoreTriage({ priorite: "HAUTE", scoreFiabilite: 80, creeLe: T0 }, T0);
    const douteuse = scoreTriage({ priorite: "HAUTE", scoreFiabilite: 20, creeLe: T0 }, T0);
    const douteuseAncienne = scoreTriage({ priorite: "HAUTE", scoreFiabilite: 20, creeLe: minutes(-10) }, T0);
    expect(fiable).toBeGreaterThan(douteuse);
    expect(douteuseAncienne).toBeGreaterThan(fiable);
  });
});

describe("Mode crise", () => {
  it("se déclenche au-delà de 3 alertes en attente par opérateur", () => {
    expect(estEnCrise({ enAttente: 6, operateursEnService: 2, plusLongueAttenteS: 10 })).toBe(false);
    expect(estEnCrise({ enAttente: 7, operateursEnService: 2, plusLongueAttenteS: 10 })).toBe(true);
  });

  it("se déclenche si une alerte attend plus de 2 min, même sans opérateur", () => {
    expect(estEnCrise({ enAttente: 1, operateursEnService: 0, plusLongueAttenteS: 121 })).toBe(true);
    expect(estEnCrise({ enAttente: 0, operateursEnService: 0, plusLongueAttenteS: 0 })).toBe(false);
  });

  it("ne s'arrête que lorsque la file est redescendue", () => {
    const etat = { enAttente: 3, operateursEnService: 2, plusLongueAttenteS: 30 };
    expect(estEnCrise(etat, false)).toBe(false);
    expect(estEnCrise(etat, true)).toBe(true);
    expect(estEnCrise({ ...etat, enAttente: 2 }, true)).toBe(false);
  });
});

describe("Regroupement par incident", () => {
  const voisine = (type: "INCENDIE" | "MEDICAL", dLat: number, depuisMin: number) => ({
    type,
    creeLe: minutes(-depuisMin),
    lat: ADRESSE.lat + dLat,
    lng: ADRESSE.lng,
  });

  it("rattache un incendie voisin (≈ 110 m) déclaré il y a 5 min", () => {
    const r = trouverIncident([voisine("INCENDIE", 0.001, 5)], { type: "INCENDIE", position: ADRESSE }, T0);
    expect(r?.distanceM).toBeGreaterThan(100);
    expect(r?.distanceM).toBeLessThan(120);
  });

  it("ne rattache ni trop loin, ni trop tard, ni une urgence médicale", () => {
    expect(trouverIncident([voisine("INCENDIE", 0.004, 5)], { type: "INCENDIE", position: ADRESSE }, T0)).toBeUndefined();
    expect(trouverIncident([voisine("INCENDIE", 0.001, 16)], { type: "INCENDIE", position: ADRESSE }, T0)).toBeUndefined();
    expect(trouverIncident([voisine("MEDICAL", 0.001, 5)], { type: "MEDICAL", position: ADRESSE }, T0)).toBeUndefined();
    expect(trouverIncident([voisine("INCENDIE", 0.001, 5)], { type: "INCENDIE", position: null }, T0)).toBeUndefined();
  });
});
