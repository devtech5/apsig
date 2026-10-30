import { describe, expect, it } from "vitest";
import {
  calculerFiabilite,
  codeSupport,
  destinatairesPour,
  genererJeton,
  menuPour,
  MENUS,
  niveauEscaladeDu,
  peutPasser,
  temoinPeutAnnuler,
  transition,
  trouverDoublon,
  TYPES_SUPPORT,
  URGENCES,
  urlAlerte,
} from "../src/index.ts";

const ADRESSE = { lat: 6.8774, lng: -6.4502 }; // Daloa

describe("Urgences et menus", () => {
  it("chaque support a un menu non vide de types connus", () => {
    for (const s of TYPES_SUPPORT) {
      expect(MENUS[s].length).toBeGreaterThan(0);
      for (const t of MENUS[s]) expect(URGENCES[t]).toBeDefined();
    }
  });

  it("le bracelet propose d'abord « enfant égaré »", () => {
    expect(menuPour("BRACELET")[0]?.type).toBe("EGARE");
  });

  it("Sécurité + : l'intervention APSIG part en premier sur une agression uniquement", () => {
    expect(destinatairesPour("AGRESSION", { intervention: true })[0]).toBe("INTERVENTION_APSIG");
    expect(destinatairesPour("AGRESSION")).not.toContain("INTERVENTION_APSIG");
    expect(destinatairesPour("MEDICAL", { intervention: true })).not.toContain("INTERVENTION_APSIG");
  });

  it("le QR intérieur propose les soins à domicile, pas le portail", () => {
    expect(MENUS.INTERIEUR).toContain("SOINS");
    expect(MENUS.PORTAIL).not.toContain("SOINS");
  });
});

describe("Supports", () => {
  it("formate les codes lisibles", () => {
    expect(codeSupport("PORTAIL", { ville: "DAL", quartier: "Lobia", numero: 53 })).toBe("DAL-LOBIA-053");
    expect(codeSupport("PORTAIL", { ville: "DAL", quartier: "Tazibouo Résidentiel", numero: 7 })).toBe("DAL-TAZIBOUO-RESIDENTIEL-007");
    expect(codeSupport("PORTAIL", { ville: "ABJ", commune: "YOP", quartier: "Niangon", numero: 453 })).toBe("ABJ-YOP-NIANGON-453");
    expect(codeSupport("BRACELET", { numero: 453, rang: 1 })).toBe("ENF-0453-01");
    expect(codeSupport("CARTE_VOYAGEUR", { numero: 453 })).toBe("VOY-0453");
    expect(codeSupport("INTERIEUR", { numero: 453 })).toBe("INT-0453");
  });

  it("distingue plusieurs supports du même type dans un foyer", () => {
    expect(codeSupport("BRACELET", { numero: 453, rang: 2 })).toBe("ENF-0453-02");
    expect(codeSupport("CARTE_VOYAGEUR", { numero: 453, rang: 1 })).toBe("VOY-0453");
    expect(codeSupport("CARTE_VOYAGEUR", { numero: 453, rang: 2 })).toBe("VOY-0453-2");
    expect(codeSupport("PORTAIL", { ville: "DAL", quartier: "Lobia", numero: 53, rang: 2 })).toBe("DAL-LOBIA-053-2");
  });

  it("exige ville et quartier pour un QR portail", () => {
    expect(() => codeSupport("PORTAIL", { numero: 1 })).toThrow();
  });

  it("génère des jetons opaques uniques sans caractères ambigus", () => {
    const jetons = new Set(Array.from({ length: 500 }, () => genererJeton()));
    expect(jetons.size).toBe(500);
    for (const j of jetons) expect(j).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
  });

  it("construit l'URL encodée dans le QR", () => {
    expect(urlAlerte("https://alerte.apsig.ci/", "abc")).toBe("https://alerte.apsig.ci/s/abc");
  });
});

describe("Fiabilité", () => {
  it("témoin au pied du portail : fiabilité élevée", () => {
    const f = calculerFiabilite({ support: "PORTAIL", source: "QR", adresse: ADRESSE, temoin: { ...ADRESSE, precisionM: 10 } });
    expect(f.score).toBe(85);
    expect(f.niveau).toBe("ELEVEE");
  });

  it("témoin à plusieurs km d'un portail : fiabilité faible", () => {
    const f = calculerFiabilite({ support: "PORTAIL", source: "QR", adresse: ADRESSE, temoin: { lat: 6.95, lng: -6.45 } });
    expect(f.niveau).toBe("FAIBLE");
  });

  it("QR intérieur : bonus de présence", () => {
    const f = calculerFiabilite({ support: "INTERIEUR", source: "QR" });
    expect(f.score).toBe(70);
  });

  it("support mobile : la distance à l'adresse n'est pas utilisée", () => {
    const loin = calculerFiabilite({ support: "BRACELET", source: "QR", adresse: ADRESSE, temoin: { lat: 5.35, lng: -4.0 } });
    expect(loin.score).toBe(75);
    expect(calculerFiabilite({ support: "BRACELET", source: "QR" }).score).toBe(50);
  });

  it("le score reste borné entre 0 et 100", () => {
    const f = calculerFiabilite({ support: "PORTAIL", source: "QR", appareilBloque: true, alertesAppareilAutresSupports24h: 5, rappel: "FAUSSE_ALERTE" });
    expect(f.score).toBe(0);
  });
});

describe("Cycle de vie d'une alerte", () => {
  it("autorise le parcours normal et refuse les retours en arrière", () => {
    expect(transition("NOUVELLE", "PRISE_EN_CHARGE")).toBe("PRISE_EN_CHARGE");
    expect(peutPasser("SUR_PLACE", "CLOTUREE")).toBe(true);
    expect(() => transition("CLOTUREE", "NOUVELLE")).toThrow();
  });

  it("le témoin ne peut plus annuler une fois l'unité sur place", () => {
    expect(temoinPeutAnnuler("EN_ROUTE")).toBe(true);
    expect(temoinPeutAnnuler("SUR_PLACE")).toBe(false);
  });

  it("regroupe un redéclenchement de moins de 10 min", () => {
    const maintenant = new Date("2026-10-27T20:00:00Z");
    const existantes = [
      { id: "a", supportId: "s1", type: "MEDICAL" as const, statut: "NOUVELLE" as const, creeLe: new Date("2026-10-27T19:55:00Z") },
      { id: "b", supportId: "s1", type: "INCENDIE" as const, statut: "CLOTUREE" as const, creeLe: new Date("2026-10-27T19:58:00Z") },
    ];
    expect(trouverDoublon(existantes, { supportId: "s1", type: "MEDICAL" }, maintenant)?.id).toBe("a");
    expect(trouverDoublon(existantes, { supportId: "s1", type: "INCENDIE" }, maintenant)).toBeUndefined();
    expect(trouverDoublon(existantes, { supportId: "s1", type: "MEDICAL" }, new Date("2026-10-27T20:06:00Z"))).toBeUndefined();
  });

  it("calcule le niveau d'escalade", () => {
    const creeLe = new Date("2026-10-27T20:00:00Z");
    expect(niveauEscaladeDu(creeLe, new Date("2026-10-27T20:00:30Z"))).toBe(0);
    expect(niveauEscaladeDu(creeLe, new Date("2026-10-27T20:01:00Z"))).toBe(1);
    expect(niveauEscaladeDu(creeLe, new Date("2026-10-27T20:05:00Z"))).toBe(2);
  });
});
