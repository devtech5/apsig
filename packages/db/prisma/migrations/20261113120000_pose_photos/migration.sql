-- Inscription en deux temps : RCCM et second téléphone au recensement ; représentant et photos à la pose.

-- CreateEnum
CREATE TYPE "NaturePhoto" AS ENUM ('PLAQUE', 'REMISE');

-- AlterTable
ALTER TABLE "Foyer" ADD COLUMN "rccm" TEXT;

-- AlterTable
ALTER TABLE "Membre" ADD COLUMN "telephone2" TEXT;

-- AlterTable
ALTER TABLE "Pose" ADD COLUMN "representantNom" TEXT,
ADD COLUMN "representantPrenom" TEXT;

-- CreateTable
CREATE TABLE "PhotoPose" (
    "id" TEXT NOT NULL,
    "poseId" TEXT NOT NULL,
    "nature" "NaturePhoto" NOT NULL,
    "type" TEXT NOT NULL,
    "donnees" BYTEA NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoPose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoPose_poseId_nature_key" ON "PhotoPose"("poseId", "nature");

-- AddForeignKey
ALTER TABLE "PhotoPose" ADD CONSTRAINT "PhotoPose_poseId_fkey" FOREIGN KEY ("poseId") REFERENCES "Pose"("id") ON DELETE CASCADE ON UPDATE CASCADE;
