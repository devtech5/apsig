import { describe, expect, it } from "vitest";
import { ajouterMois, etatAbonnement } from "../src/index.ts";

describe("Abonnements", () => {
  it("ajoute des mois sans déborder sur le mois suivant", () => {
    expect(ajouterMois(new Date("2026-01-15T10:00:00Z"), 1).toISOString()).toBe("2026-02-15T10:00:00.000Z");
    expect(ajouterMois(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(ajouterMois(new Date("2027-11-30T00:00:00Z"), 3).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(ajouterMois(new Date("2026-10-30T00:00:00Z"), 12).toISOString()).toBe("2027-10-30T00:00:00.000Z");
  });

  it("déduit l'état affiché des dates", () => {
    const maintenant = new Date("2026-10-30T12:00:00Z");
    const a = (statut: "ESSAI" | "ACTIF" | "EXPIRE" | "RESILIE", debut: string, fin: string) => ({ statut, debut: new Date(debut), fin: new Date(fin) });
    expect(etatAbonnement(a("ACTIF", "2026-10-01", "2026-11-01"), maintenant)).toBe("ACTIF");
    expect(etatAbonnement(a("ACTIF", "2026-09-01", "2026-10-01"), maintenant)).toBe("EXPIRE");
    expect(etatAbonnement(a("ACTIF", "2026-11-01", "2026-12-01"), maintenant)).toBe("A_VENIR");
    expect(etatAbonnement(a("ESSAI", "2026-10-25", "2026-11-25"), maintenant)).toBe("ESSAI");
    expect(etatAbonnement(a("RESILIE", "2026-10-01", "2026-11-01"), maintenant)).toBe("RESILIE");
  });
});
