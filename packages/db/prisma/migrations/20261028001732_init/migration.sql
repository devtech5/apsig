-- CreateEnum
CREATE TYPE "RoleMembre" AS ENUM ('TITULAIRE', 'CONJOINT', 'ENFANT', 'PARENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeSupport" AS ENUM ('PORTAIL', 'INTERIEUR', 'BRACELET', 'CARTE_VOYAGEUR', 'CARTE_VEHICULE');

-- CreateEnum
CREATE TYPE "StatutSupport" AS ENUM ('STOCK', 'ACTIF', 'SUSPENDU', 'PERDU');

-- CreateEnum
CREATE TYPE "StatutAbonnement" AS ENUM ('ESSAI', 'ACTIF', 'EXPIRE', 'RESILIE');

-- CreateEnum
CREATE TYPE "Operateur" AS ENUM ('ORANGE_MONEY', 'MTN_MOMO', 'MOOV_MONEY', 'WAVE', 'ESPECES');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('EN_ATTENTE', 'REUSSI', 'ECHOUE');

-- CreateEnum
CREATE TYPE "TypePartenaire" AS ENUM ('POLICE', 'GSPM', 'SAMU', 'AMBULANCE_PRIVEE', 'INFIRMIER', 'SECURITE_PRIVEE');

-- CreateEnum
CREATE TYPE "TypeUnite" AS ENUM ('PATROUILLE', 'INTERVENTION', 'INFIRMIER', 'AMBULANCE');

-- CreateEnum
CREATE TYPE "StatutUnite" AS ENUM ('DISPONIBLE', 'EN_MISSION', 'HORS_SERVICE');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('AGENT', 'OPERATEUR', 'SUPERVISEUR', 'ADMIN');

-- CreateEnum
CREATE TYPE "TypeUrgence" AS ENUM ('AGRESSION', 'MEDICAL', 'INCENDIE', 'EGARE', 'SOINS', 'AUTRE');

-- CreateEnum
CREATE TYPE "Priorite" AS ENUM ('CRITIQUE', 'HAUTE', 'NORMALE');

-- CreateEnum
CREATE TYPE "StatutAlerte" AS ENUM ('NOUVELLE', 'PRISE_EN_CHARGE', 'EN_ROUTE', 'SUR_PLACE', 'CLOTUREE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "SourceAlerte" AS ENUM ('QR', 'USSD', 'SMS', 'CENTRALE');

-- CreateEnum
CREATE TYPE "StatutRappel" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'EN_SECURITE', 'INJOIGNABLE', 'FAUSSE_ALERTE');

-- CreateEnum
CREATE TYPE "TypeMedia" AS ENUM ('PHOTO', 'VOCAL', 'TEXTE');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('SMS', 'WHATSAPP', 'APPEL', 'PUSH', 'RADIO');

-- CreateEnum
CREATE TYPE "StatutMessage" AS ENUM ('EN_FILE', 'ENVOYE', 'DELIVRE', 'ECHEC');

-- CreateTable
CREATE TABLE "Ville" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "Ville_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commune" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "villeId" TEXT NOT NULL,

    CONSTRAINT "Commune_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quartier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "villeId" TEXT NOT NULL,
    "communeId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Quartier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foyer" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "adresse" TEXT,
    "quartierId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "adresseVerifiee" BOOLEAN NOT NULL DEFAULT false,
    "cleClient" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Foyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membre" (
    "id" TEXT NOT NULL,
    "foyerId" TEXT NOT NULL,
    "role" "RoleMembre" NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "anneeNaissance" INTEGER,
    "infosMedicales" TEXT,

    CONSTRAINT "Membre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUrgence" (
    "id" TEXT NOT NULL,
    "foyerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 1,
    "consentiLe" TIMESTAMP(3),

    CONSTRAINT "ContactUrgence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Support" (
    "id" TEXT NOT NULL,
    "type" "TypeSupport" NOT NULL,
    "code" TEXT NOT NULL,
    "jeton" TEXT NOT NULL,
    "codeCourt" TEXT NOT NULL,
    "statut" "StatutSupport" NOT NULL DEFAULT 'STOCK',
    "foyerId" TEXT,
    "membreId" TEXT,
    "vehicule" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Support_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JetonRevoque" (
    "jeton" TEXT NOT NULL,
    "supportId" TEXT NOT NULL,
    "revoqueLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonRevoque_pkey" PRIMARY KEY ("jeton")
);

-- CreateTable
CREATE TABLE "Pose" (
    "id" TEXT NOT NULL,
    "supportId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "precisionM" DOUBLE PRECISION,
    "photo" TEXT,
    "poseLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prixFcfa" INTEGER NOT NULL,
    "prixMensuelFcfa" INTEGER,
    "moisInclus" INTEGER NOT NULL DEFAULT 0,
    "intervention" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Formule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormuleSupport" (
    "formuleId" TEXT NOT NULL,
    "type" "TypeSupport" NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FormuleSupport_pkey" PRIMARY KEY ("formuleId","type")
);

-- CreateTable
CREATE TABLE "Abonnement" (
    "id" TEXT NOT NULL,
    "foyerId" TEXT NOT NULL,
    "formuleId" TEXT NOT NULL,
    "statut" "StatutAbonnement" NOT NULL DEFAULT 'ACTIF',
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "foyerId" TEXT NOT NULL,
    "abonnementId" TEXT,
    "montantFcfa" INTEGER NOT NULL,
    "operateur" "Operateur" NOT NULL,
    "telephone" TEXT,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'EN_ATTENTE',
    "refFournisseur" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payeLe" TIMESTAMP(3),

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partenaire" (
    "id" TEXT NOT NULL,
    "type" "TypePartenaire" NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "villeCode" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Partenaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarif" (
    "id" TEXT NOT NULL,
    "partenaireId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "prixJourFcfa" INTEGER NOT NULL,
    "prixNuitFcfa" INTEGER,

    CONSTRAINT "Tarif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unite" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeUnite" NOT NULL,
    "statut" "StatutUnite" NOT NULL DEFAULT 'DISPONIBLE',
    "partenaireId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "gpsLe" TIMESTAMP(3),

    CONSTRAINT "Unite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "uniteId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerte" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "type" "TypeUrgence" NOT NULL,
    "priorite" "Priorite" NOT NULL,
    "statut" "StatutAlerte" NOT NULL DEFAULT 'NOUVELLE',
    "source" "SourceAlerte" NOT NULL,
    "supportId" TEXT NOT NULL,
    "foyerId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "appareilId" TEXT,
    "temoinTelephone" TEXT,
    "temoinLat" DOUBLE PRECISION,
    "temoinLng" DOUBLE PRECISION,
    "temoinPrecisionM" DOUBLE PRECISION,
    "cleTemoin" TEXT NOT NULL,
    "scoreFiabilite" INTEGER NOT NULL,
    "rappel" "StatutRappel" NOT NULL DEFAULT 'EN_ATTENTE',
    "niveauEscalade" INTEGER NOT NULL DEFAULT 0,
    "redeclenchements" INTEGER NOT NULL DEFAULT 0,
    "abonnementExpire" BOOLEAN NOT NULL DEFAULT false,
    "intervention" BOOLEAN NOT NULL DEFAULT false,
    "operateurId" TEXT,
    "uniteId" TEXT,
    "issue" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priseEnChargeLe" TIMESTAMP(3),
    "surPlaceLe" TIMESTAMP(3),
    "clotureLe" TIMESTAMP(3),
    "anonymiseLe" TIMESTAMP(3),

    CONSTRAINT "Alerte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvenementAlerte" (
    "id" TEXT NOT NULL,
    "alerteId" TEXT NOT NULL,
    "le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nature" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "auteurId" TEXT,

    CONSTRAINT "EvenementAlerte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "alerteId" TEXT NOT NULL,
    "type" "TypeMedia" NOT NULL,
    "chemin" TEXT,
    "texte" TEXT,
    "mime" TEXT,
    "tailleOctets" INTEGER,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "alerteId" TEXT,
    "canal" "Canal" NOT NULL,
    "destinataire" TEXT NOT NULL,
    "nomDestinataire" TEXT,
    "texte" TEXT NOT NULL,
    "statut" "StatutMessage" NOT NULL DEFAULT 'EN_FILE',
    "pilote" TEXT NOT NULL,
    "refFournisseur" TEXT,
    "erreur" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivreLe" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appareil" (
    "id" TEXT NOT NULL,
    "premiereVue" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloque" BOOLEAN NOT NULL DEFAULT false,
    "bloqueLe" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compteur" (
    "nom" TEXT NOT NULL,
    "valeur" INTEGER NOT NULL,

    CONSTRAINT "Compteur_pkey" PRIMARY KEY ("nom")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT,
    "action" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "details" JSONB,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ville_code_key" ON "Ville"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Commune_villeId_code_key" ON "Commune"("villeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Quartier_villeId_code_key" ON "Quartier"("villeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Foyer_cleClient_key" ON "Foyer"("cleClient");

-- CreateIndex
CREATE INDEX "Membre_foyerId_idx" ON "Membre"("foyerId");

-- CreateIndex
CREATE INDEX "ContactUrgence_foyerId_idx" ON "ContactUrgence"("foyerId");

-- CreateIndex
CREATE UNIQUE INDEX "Support_code_key" ON "Support"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Support_jeton_key" ON "Support"("jeton");

-- CreateIndex
CREATE UNIQUE INDEX "Support_codeCourt_key" ON "Support"("codeCourt");

-- CreateIndex
CREATE INDEX "Support_foyerId_idx" ON "Support"("foyerId");

-- CreateIndex
CREATE UNIQUE INDEX "Pose_supportId_key" ON "Pose"("supportId");

-- CreateIndex
CREATE UNIQUE INDEX "Formule_code_key" ON "Formule"("code");

-- CreateIndex
CREATE INDEX "Abonnement_foyerId_idx" ON "Abonnement"("foyerId");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_refFournisseur_key" ON "Paiement"("refFournisseur");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Alerte_numero_key" ON "Alerte"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Alerte_cleTemoin_key" ON "Alerte"("cleTemoin");

-- CreateIndex
CREATE INDEX "Alerte_statut_creeLe_idx" ON "Alerte"("statut", "creeLe");

-- CreateIndex
CREATE INDEX "Alerte_supportId_type_statut_idx" ON "Alerte"("supportId", "type", "statut");

-- CreateIndex
CREATE INDEX "EvenementAlerte_alerteId_le_idx" ON "EvenementAlerte"("alerteId", "le");

-- CreateIndex
CREATE INDEX "Message_alerteId_idx" ON "Message"("alerteId");

-- CreateIndex
CREATE INDEX "Audit_le_idx" ON "Audit"("le");

-- AddForeignKey
ALTER TABLE "Commune" ADD CONSTRAINT "Commune_villeId_fkey" FOREIGN KEY ("villeId") REFERENCES "Ville"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quartier" ADD CONSTRAINT "Quartier_villeId_fkey" FOREIGN KEY ("villeId") REFERENCES "Ville"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quartier" ADD CONSTRAINT "Quartier_communeId_fkey" FOREIGN KEY ("communeId") REFERENCES "Commune"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foyer" ADD CONSTRAINT "Foyer_quartierId_fkey" FOREIGN KEY ("quartierId") REFERENCES "Quartier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_foyerId_fkey" FOREIGN KEY ("foyerId") REFERENCES "Foyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactUrgence" ADD CONSTRAINT "ContactUrgence_foyerId_fkey" FOREIGN KEY ("foyerId") REFERENCES "Foyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Support" ADD CONSTRAINT "Support_foyerId_fkey" FOREIGN KEY ("foyerId") REFERENCES "Foyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Support" ADD CONSTRAINT "Support_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JetonRevoque" ADD CONSTRAINT "JetonRevoque_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "Support"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pose" ADD CONSTRAINT "Pose_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "Support"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pose" ADD CONSTRAINT "Pose_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormuleSupport" ADD CONSTRAINT "FormuleSupport_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "Formule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_foyerId_fkey" FOREIGN KEY ("foyerId") REFERENCES "Foyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "Formule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_foyerId_fkey" FOREIGN KEY ("foyerId") REFERENCES "Foyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarif" ADD CONSTRAINT "Tarif_partenaireId_fkey" FOREIGN KEY ("partenaireId") REFERENCES "Partenaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unite" ADD CONSTRAINT "Unite_partenaireId_fkey" FOREIGN KEY ("partenaireId") REFERENCES "Partenaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_uniteId_fkey" FOREIGN KEY ("uniteId") REFERENCES "Unite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "Support"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_foyerId_fkey" FOREIGN KEY ("foyerId") REFERENCES "Foyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_appareilId_fkey" FOREIGN KEY ("appareilId") REFERENCES "Appareil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_operateurId_fkey" FOREIGN KEY ("operateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_uniteId_fkey" FOREIGN KEY ("uniteId") REFERENCES "Unite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementAlerte" ADD CONSTRAINT "EvenementAlerte_alerteId_fkey" FOREIGN KEY ("alerteId") REFERENCES "Alerte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementAlerte" ADD CONSTRAINT "EvenementAlerte_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_alerteId_fkey" FOREIGN KEY ("alerteId") REFERENCES "Alerte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_alerteId_fkey" FOREIGN KEY ("alerteId") REFERENCES "Alerte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
