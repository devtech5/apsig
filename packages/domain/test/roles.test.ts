import { describe, expect, it } from "vitest";
import { aAcces, peutGererRole } from "../src/index.ts";

describe("Espaces du back-office", () => {
  it("chaque rôle n'ouvre que ses espaces", () => {
    expect(aAcces("OPERATEUR", "centrale")).toBe(true);
    expect(aAcces("OPERATEUR", "supervision")).toBe(false);
    expect(aAcces("CONSEILLER", "abonnements")).toBe(true);
    expect(aAcces("CONSEILLER", "centrale")).toBe(false);
    expect(aAcces("AGENT", "centrale")).toBe(false);
    expect(aAcces("SUPERADMIN", "administration")).toBe(true);
  });

  it("un administrateur ne gère que les comptes de rang inférieur", () => {
    expect(peutGererRole("ADMIN", "SUPERVISEUR")).toBe(true);
    expect(peutGererRole("ADMIN", "ADMIN")).toBe(false);
    expect(peutGererRole("ADMIN", "SUPERADMIN")).toBe(false);
    expect(peutGererRole("SUPERADMIN", "ADMIN")).toBe(true);
    expect(peutGererRole("SUPERVISEUR", "OPERATEUR")).toBe(false);
  });
});
