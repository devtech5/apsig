-- CreateEnum
CREATE TYPE "Presence" AS ENUM ('EN_SERVICE', 'PAUSE', 'HORS_SERVICE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RoleUtilisateur" ADD VALUE 'CONSEILLER';
ALTER TYPE "RoleUtilisateur" ADD VALUE 'SUPERADMIN';

-- AlterTable
ALTER TABLE "Alerte" ADD COLUMN     "accepteeLe" TIMESTAMP(3),
ADD COLUMN     "attribueeAId" TEXT,
ADD COLUMN     "attribueeLe" TIMESTAMP(3),
ADD COLUMN     "principaleId" TEXT,
ADD COLUMN     "relanceLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "derniereAttributionLe" TIMESTAMP(3),
ADD COLUMN     "deuxFacteurs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "presence" "Presence" NOT NULL DEFAULT 'HORS_SERVICE',
ADD COLUMN     "presenceLe" TIMESTAMP(3),
ADD COLUMN     "vuLe" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SecondFacteur" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "SecondFacteur_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecondFacteur_userId_idx" ON "SecondFacteur"("userId");

-- CreateIndex
CREATE INDEX "SecondFacteur_secret_idx" ON "SecondFacteur"("secret");

-- CreateIndex
CREATE INDEX "Alerte_attribueeAId_statut_idx" ON "Alerte"("attribueeAId", "statut");

-- CreateIndex
CREATE INDEX "Alerte_principaleId_idx" ON "Alerte"("principaleId");

-- AddForeignKey
ALTER TABLE "SecondFacteur" ADD CONSTRAINT "SecondFacteur_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_attribueeAId_fkey" FOREIGN KEY ("attribueeAId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_principaleId_fkey" FOREIGN KEY ("principaleId") REFERENCES "Alerte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
