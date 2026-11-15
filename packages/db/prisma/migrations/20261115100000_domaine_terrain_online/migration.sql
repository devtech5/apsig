-- Domaine unique apsig.online : les identifiants des comptes au téléphone passent de
-- <numéro>@terrain.apsig.ci à <numéro>@terrain.apsig.online, sinon ces comptes ne peuvent plus se connecter.
UPDATE "Utilisateur"
SET "email" = replace("email", '@terrain.apsig.ci', '@terrain.apsig.online')
WHERE "email" LIKE '%@terrain.apsig.ci';
