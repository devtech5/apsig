import { cleLieu, codeLieu, COMMUNES_CI, nomLieu, VILLES_CI } from "@apsig/domain";
import type { Tx } from "../prisma/prisma.service.ts";

// Ville et commune retrouvées par leur nom (accents, casse et tirets ignorés), créées si elles manquent.
// `ajoutes` reçoit ce qui a été créé, pour le journal d'audit.
export async function villeEtCommune(tx: Tx, lieu: { ville: string; commune: string | null }, ajoutes: string[]) {
  const villes = await tx.ville.findMany({ select: { id: true, nom: true, code: true } });
  let ville = villes.find((v) => cleLieu(v.nom) === cleLieu(lieu.ville));
  if (!ville) {
    const nom = VILLES_CI.find((n) => cleLieu(n) === cleLieu(lieu.ville)) ?? nomLieu(lieu.ville);
    ville = await tx.ville.create({ data: { nom, code: codeLieu(nom, "ville", new Set(villes.map((v) => v.code))) }, select: { id: true, nom: true, code: true } });
    ajoutes.push(`ville ${nom}`);
  }
  if (!lieu.commune) return { ville, communeId: null };
  const communes = await tx.commune.findMany({ where: { villeId: ville.id } });
  let commune = communes.find((c) => cleLieu(c.nom) === cleLieu(lieu.commune!));
  if (!commune) {
    const nom = (COMMUNES_CI[ville.nom] ?? []).find((n) => cleLieu(n) === cleLieu(lieu.commune!)) ?? nomLieu(lieu.commune);
    commune = await tx.commune.create({ data: { nom, villeId: ville.id, code: codeLieu(nom, "commune", new Set(communes.map((c) => c.code))) } });
    ajoutes.push(`commune ${nom}`);
  }
  return { ville, communeId: commune.id };
}

// Quartier retrouvé dans la ville (et la commune, si donnée), créé s'il manque : sans centre connu jusqu'à la première pose.
export async function quartierDe(tx: Tx, lieu: { ville: string; commune: string | null; quartier: string }, ajoutes: string[]) {
  const { ville, communeId } = await villeEtCommune(tx, lieu, ajoutes);
  const quartiers = await tx.quartier.findMany({ where: { villeId: ville.id } });
  let quartier = quartiers.find((q) => cleLieu(q.nom) === cleLieu(lieu.quartier) && (q.communeId === communeId || !communeId));
  if (!quartier) {
    const nom = nomLieu(lieu.quartier);
    quartier = await tx.quartier.create({ data: { nom, villeId: ville.id, communeId, code: codeLieu(nom, "quartier", new Set(quartiers.map((q) => q.code))) } });
    ajoutes.push(`quartier ${nom}`);
  }
  return { villeNom: ville.nom, quartierId: quartier.id };
}
