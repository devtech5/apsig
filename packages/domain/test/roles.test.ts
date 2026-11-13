import { describe, expect, it } from "vitest";
import { aAcces, deuxFacteursExige, emailTerrain, peutGererRole, telephoneDeEmail } from "../src/index.ts";

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

describe("Accès terrain", () => {
  it("travail dissocié : recenseur au recensement, poseur à la pose ; chef d'équipe : les deux et l'équipe", () => {
    expect(aAcces("RECENSEUR", "recensement")).toBe(true);
    expect(aAcces("RECENSEUR", "pose")).toBe(false);
    expect(aAcces("RECENSEUR", "abonnements")).toBe(false);
    expect(aAcces("AGENT", "pose")).toBe(true);
    expect(aAcces("AGENT", "recensement")).toBe(false);
    expect(aAcces("AGENT", "equipe")).toBe(false);
    expect(aAcces("CHEF_EQUIPE", "equipe")).toBe(true);
    expect(aAcces("CHEF_EQUIPE", "administration")).toBe(false);
  });

  it("seul le terrain (recenseur, poseur) se passe de la double authentification", () => {
    expect(deuxFacteursExige("RECENSEUR")).toBe(false);
    expect(deuxFacteursExige("AGENT")).toBe(false);
    expect(deuxFacteursExige("CHEF_EQUIPE")).toBe(true);
  });

  it("le téléphone donne un identifiant de connexion stable", () => {
    expect(emailTerrain("07 08 09 10 11")).toBe("2250708091011@terrain.apsig.ci");
    expect(emailTerrain("+225 0708091011")).toBe("2250708091011@terrain.apsig.ci");
    expect(emailTerrain("1234")).toBeNull();
    expect(telephoneDeEmail("2250708091011@terrain.apsig.ci")).toBe("07 08 09 10 11");
  });
});
