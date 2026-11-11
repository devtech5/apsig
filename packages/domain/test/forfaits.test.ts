import { describe, expect, it } from "vitest";
import { FORMULES, FORMULES_RETIREES } from "../src/index.ts";

describe("Forfait unique", () => {
  it("vend trois formules : même abonnement, mensualité selon le client", () => {
    expect(FORMULES.map((f) => [f.code, f.abonnementFcfa, f.mensualiteFcfa])).toEqual([
      ["UNIQUE_PARTICULIER", 10_000, 2_000],
      ["UNIQUE_FAMILLE", 10_000, 5_000],
      ["UNIQUE_ENTREPRISE", 10_000, 10_000],
    ]);
  });

  it("retire la grille Bronze / Gold / Premium sans toucher aux formules vendues", () => {
    expect(FORMULES_RETIREES).toContain("GOLD_FAMILLE");
    expect(FORMULES_RETIREES).toHaveLength(13);
    for (const f of FORMULES) expect(FORMULES_RETIREES).not.toContain(f.code);
  });
});
