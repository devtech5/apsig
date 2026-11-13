-- Zones des poseurs de plaques : communes, ou villes entières, où chacun voit les clients à équiper.

-- CreateTable
CREATE TABLE "ZonePoseur" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "villeId" TEXT NOT NULL,
    "communeId" TEXT,

    CONSTRAINT "ZonePoseur_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZonePoseur_utilisateurId_idx" ON "ZonePoseur"("utilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "ZonePoseur_utilisateurId_villeId_communeId_key" ON "ZonePoseur"("utilisateurId", "villeId", "communeId");

-- AddForeignKey
ALTER TABLE "ZonePoseur" ADD CONSTRAINT "ZonePoseur_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZonePoseur" ADD CONSTRAINT "ZonePoseur_villeId_fkey" FOREIGN KEY ("villeId") REFERENCES "Ville"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZonePoseur" ADD CONSTRAINT "ZonePoseur_communeId_fkey" FOREIGN KEY ("communeId") REFERENCES "Commune"("id") ON DELETE SET NULL ON UPDATE CASCADE;
