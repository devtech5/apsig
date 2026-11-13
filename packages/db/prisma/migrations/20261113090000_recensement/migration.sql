-- Inscription en deux temps : l'agent recense le client (foyer, code plaque, encaissement), puis pose la plaque (GPS).

-- AlterTable
ALTER TABLE "Foyer" ADD COLUMN "recenseParId" TEXT;

-- CreateIndex
CREATE INDEX "Foyer_recenseParId_idx" ON "Foyer"("recenseParId");

-- AddForeignKey
ALTER TABLE "Foyer" ADD CONSTRAINT "Foyer_recenseParId_fkey" FOREIGN KEY ("recenseParId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
