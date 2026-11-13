import { describe, expect, it } from "vitest";
import { cleLieu, codeLieu, COMMUNES_CI, nomLieu, VILLES_CI } from "../src/index.ts";

describe("Lieux de Côte d'Ivoire", () => {
  it("liste les villes, sans doublon, avec les communes d'Abidjan", () => {
    expect(new Set(VILLES_CI.map(cleLieu)).size).toBe(VILLES_CI.length);
    expect(VILLES_CI).toContain("Daloa");
    expect(COMMUNES_CI.Abidjan).toContain("Yopougon");
  });

  it("compare les noms sans accents, casse ni tirets", () => {
    expect(cleLieu("Port-Bouët")).toBe(cleLieu("port bouet"));
    expect(nomLieu("  gonzagueville   nord ")).toBe("Gonzagueville nord");
  });

  it("donne un code court et unique à un nouveau lieu", () => {
    expect(codeLieu("Daloa", "ville", new Set())).toBe("DAL");
    expect(codeLieu("Tiassalé", "ville", new Set(["TIA"]))).toBe("TSS");
    expect(codeLieu("Dabou", "ville", new Set(["DAB"]))).toBe("DAU");
    expect(codeLieu("Dabou", "ville", new Set(["DAB", "DAU"]))).toBe("DA2");
    expect(codeLieu("Port-Bouët", "commune", new Set())).toBe("POR");
    expect(codeLieu("Gonzagueville Nord", "quartier", new Set())).toBe("GONZAGUEVILLE-N");
    expect(codeLieu("Lobia", "quartier", new Set(["LOBIA"]))).toBe("LOBIA2");
  });
});
