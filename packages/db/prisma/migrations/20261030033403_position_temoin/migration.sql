-- CreateEnum
CREATE TYPE "ProblemePosition" AS ENUM ('REFUSEE', 'INDISPONIBLE');

-- AlterTable
ALTER TABLE "Alerte" ADD COLUMN     "problemePosition" "ProblemePosition",
ADD COLUMN     "temoinPositionLe" TIMESTAMP(3);
