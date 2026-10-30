
-- AlterEnum
ALTER TYPE "RoleUtilisateur" ADD VALUE 'INTERVENANT';

-- AlterEnum
ALTER TYPE "SourceAlerte" ADD VALUE 'APPLI';

-- AlterEnum
ALTER TYPE "TypeSupport" ADD VALUE 'APPLI';

-- AlterTable
ALTER TABLE "Alerte" ADD COLUMN     "missionTermineeLe" TIMESTAMP(3),
ADD COLUMN     "uniteEngageeLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "jetonPush" TEXT;

-- CreateTable
CREATE TABLE "AccesClient" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "appareil" TEXT,
    "jetonPush" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vuLe" TIMESTAMP(3),
    "revoqueLe" TIMESTAMP(3),

    CONSTRAINT "AccesClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeActivation" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "essais" INTEGER NOT NULL DEFAULT 0,
    "utiliseLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccesClient_jetonHash_key" ON "AccesClient"("jetonHash");

-- CreateIndex
CREATE INDEX "AccesClient_membreId_idx" ON "AccesClient"("membreId");

-- CreateIndex
CREATE INDEX "CodeActivation_membreId_idx" ON "CodeActivation"("membreId");

-- AddForeignKey
ALTER TABLE "AccesClient" ADD CONSTRAINT "AccesClient_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeActivation" ADD CONSTRAINT "CodeActivation_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

