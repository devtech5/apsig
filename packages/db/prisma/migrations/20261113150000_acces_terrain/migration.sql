-- Accès terrain : recenseurs (connexion par téléphone) et chefs d'équipe qui les inscrivent et les suivent.

-- AlterEnum
ALTER TYPE "RoleUtilisateur" ADD VALUE 'RECENSEUR';
ALTER TYPE "RoleUtilisateur" ADD VALUE 'CHEF_EQUIPE';

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN "chefId" TEXT;

-- CreateIndex
CREATE INDEX "Utilisateur_chefId_idx" ON "Utilisateur"("chefId");

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
