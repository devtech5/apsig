-- Site des opérations op.apsig.online : les identifiants des comptes au téléphone passent de
-- <numéro>@terrain.apsig.ci à <numéro>@op.apsig.online, sinon ces comptes ne peuvent plus se connecter.
UPDATE "Utilisateur"
SET "email" = replace("email", '@terrain.apsig.ci', '@op.apsig.online')
WHERE "email" LIKE '%@terrain.apsig.ci';
