-- Inscriptions en ligne (code-secours.apsig.online) : demandes à rappeler par un conseiller.

-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('NOUVELLE', 'TRAITEE');

-- CreateTable
CREATE TABLE "DemandeInscription" (
    "id" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "StatutDemande" NOT NULL DEFAULT 'NOUVELLE',
    "cible" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT,
    "ville" TEXT NOT NULL,
    "quartier" TEXT NOT NULL,
    "adresse" TEXT,
    "message" TEXT,
    "traiteeLe" TIMESTAMP(3),

    CONSTRAINT "DemandeInscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandeInscription_statut_creeLe_idx" ON "DemandeInscription"("statut", "creeLe");
