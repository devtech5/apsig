-- AlterTable
ALTER TABLE "Foyer" ADD COLUMN     "numero" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Foyer_numero_key" ON "Foyer"("numero");
