import { describe, expect, it } from "vitest";
import { sitesDe } from "../src/config.ts";

describe("Sites du back-office", () => {
  it("déduit de la centrale les sites terrain (op. et l'ancien code-secours.) et QG : chacun peut ouvrir une session", () => {
    expect(sitesDe("https://centrale.apsig.online")).toEqual([
      "https://centrale.apsig.online",
      "https://op.apsig.online",
      "https://code-secours.apsig.online",
      "https://base.apsig.online",
    ]);
  });

  it("garde telle quelle une adresse sans sous-domaine centrale. (développement)", () => {
    expect(sitesDe("http://localhost:3002")).toEqual(["http://localhost:3002"]);
  });
});
