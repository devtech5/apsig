-- Mot de passe provisoire : donné par un responsable, l'utilisateur le remplace à sa première connexion.
-- Les comptes existants gardent leur mot de passe actuel (false).

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN "motDePasseProvisoire" BOOLEAN NOT NULL DEFAULT false;
