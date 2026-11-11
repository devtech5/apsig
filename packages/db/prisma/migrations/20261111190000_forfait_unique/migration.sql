-- Forfait unique de lancement (11/11/2026) : 10 000 F à l'entrée, premier mois compris ;
-- mensualité de 2 000 F (particulier), 5 000 F (famille), 10 000 F (entreprise et autres organisations).
-- Migration de données, sans changement de structure. Mêmes valeurs que FORMULES dans @apsig/domain.

-- La grille Bronze / Gold / Premium sort de la vente ; les abonnements qui y renvoient sont conservés.
UPDATE "Formule" SET "actif" = false
WHERE "code" LIKE 'BRONZE\_%' OR "code" LIKE 'GOLD\_%' OR "code" LIKE 'PREMIUM\_%';

INSERT INTO "Formule" ("id", "code", "nom", "prixFcfa", "prixMensuelFcfa", "moisInclus", "intervention", "actif") VALUES
  ('formule_unique_particulier', 'UNIQUE_PARTICULIER', 'Forfait unique — Particulier', 10000,  2000, 1, false, true),
  ('formule_unique_famille',     'UNIQUE_FAMILLE',     'Forfait unique — Famille',     10000,  5000, 1, false, true),
  ('formule_unique_entreprise',  'UNIQUE_ENTREPRISE',  'Forfait unique — Entreprise',  10000, 10000, 1, false, true)
ON CONFLICT ("code") DO UPDATE SET
  "nom" = EXCLUDED."nom",
  "prixFcfa" = EXCLUDED."prixFcfa",
  "prixMensuelFcfa" = EXCLUDED."prixMensuelFcfa",
  "moisInclus" = EXCLUDED."moisInclus",
  "actif" = true;

-- Supports fournis (provisoire) : plaque du portail + QR intérieur.
INSERT INTO "FormuleSupport" ("formuleId", "type", "quantite")
SELECT f."id", s."type"::"TypeSupport", 1
FROM "Formule" f
CROSS JOIN (VALUES ('PORTAIL'), ('INTERIEUR')) AS s("type")
WHERE f."code" LIKE 'UNIQUE\_%'
ON CONFLICT ("formuleId", "type") DO NOTHING;
