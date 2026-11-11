-- Grille tarifaire du 11/11/2026 : Bronze / Gold / Premium × Particulier / Famille / Entreprise.
-- Migration de données, sans changement de structure. Mêmes valeurs que FORMULES dans @apsig/domain.

-- Les anciennes formules sortent de la vente ; les abonnements qui y renvoient sont conservés.
UPDATE "Formule" SET "actif" = false WHERE "code" IN ('ENFANT', 'MAISON', 'FAMILLE', 'SECURITE_PLUS');

INSERT INTO "Formule" ("id", "code", "nom", "prixFcfa", "prixMensuelFcfa", "moisInclus", "intervention", "actif") VALUES
  ('formule_bronze_particulier',  'BRONZE_PARTICULIER',  'Bronze — Particulier',  10000,  2000, 0, false, true),
  ('formule_bronze_famille',      'BRONZE_FAMILLE',      'Bronze — Famille',      15000,  3000, 0, false, true),
  ('formule_bronze_entreprise',   'BRONZE_ENTREPRISE',   'Bronze — Entreprise',   20000,  5000, 0, false, true),
  ('formule_gold_particulier',    'GOLD_PARTICULIER',    'Gold — Particulier',    20000,  5000, 0, false, true),
  ('formule_gold_famille',        'GOLD_FAMILLE',        'Gold — Famille',        25000,  7500, 0, false, true),
  ('formule_gold_entreprise',     'GOLD_ENTREPRISE',     'Gold — Entreprise',     30000, 10000, 0, false, true),
  ('formule_premium_particulier', 'PREMIUM_PARTICULIER', 'Premium — Particulier', 50000, 20000, 0, false, true),
  ('formule_premium_famille',     'PREMIUM_FAMILLE',     'Premium — Famille',     50000, 20000, 0, false, true),
  ('formule_premium_entreprise',  'PREMIUM_ENTREPRISE',  'Premium — Entreprise',  50000, 20000, 0, false, true)
ON CONFLICT ("code") DO UPDATE SET
  "nom" = EXCLUDED."nom",
  "prixFcfa" = EXCLUDED."prixFcfa",
  "prixMensuelFcfa" = EXCLUDED."prixMensuelFcfa",
  "actif" = true;

-- Supports fournis (provisoire) : Bronze = plaque + QR intérieur ; Gold et Premium = + bracelet + carte voyageur.
INSERT INTO "FormuleSupport" ("formuleId", "type", "quantite")
SELECT f."id", s."type"::"TypeSupport", 1
FROM "Formule" f
JOIN (VALUES
  ('BRONZE', 'PORTAIL'), ('BRONZE', 'INTERIEUR'),
  ('GOLD', 'PORTAIL'), ('GOLD', 'INTERIEUR'), ('GOLD', 'BRACELET'), ('GOLD', 'CARTE_VOYAGEUR'),
  ('PREMIUM', 'PORTAIL'), ('PREMIUM', 'INTERIEUR'), ('PREMIUM', 'BRACELET'), ('PREMIUM', 'CARTE_VOYAGEUR')
) AS s("forfait", "type") ON f."code" LIKE s."forfait" || '\_%'
ON CONFLICT ("formuleId", "type") DO NOTHING;
