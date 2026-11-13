-- Villes, communes et quartiers ajoutés au recensement : un nouveau quartier n'a pas encore de centre connu.
-- Type de client gardé sur le foyer : il reste connu avant le paiement complet (acompte, pas encore payé).

-- AlterTable
ALTER TABLE "Quartier" ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Foyer" ADD COLUMN "cible" TEXT;

-- Clients déjà recensés : type de client déduit de leur formule.
UPDATE "Foyer" f SET "cible" = substring(fo."code" from 8)
FROM "Abonnement" a JOIN "Formule" fo ON fo."id" = a."formuleId"
WHERE a."foyerId" = f."id" AND fo."code" LIKE 'UNIQUE\_%' AND f."cible" IS NULL;
