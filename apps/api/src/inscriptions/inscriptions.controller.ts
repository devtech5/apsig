import { Body, Controller, Get, HttpCode, Module, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { z } from "zod";
import { CIBLES } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

const texte = (max: number) => z.string().trim().min(1).max(max);
const optionnel = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const demande = z.object({
  cible: z.enum(CIBLES),
  prenom: texte(60),
  nom: texte(60),
  telephone: z.string().trim().regex(/^\+?[0-9 .-]{8,20}$/, "Numéro de téléphone invalide"),
  email: z.union([z.literal(""), z.email().max(120)]).optional().transform((v) => (v ? v : null)),
  ville: texte(80),
  quartier: texte(80),
  adresse: optionnel(300),
  message: optionnel(500),
  // L'inscription suppose que le visiteur accepte d'être rappelé : refusé sans consentement.
  consentement: z.literal(true, { error: "Le consentement est requis" }),
  // Champ piège, caché à l'écran : un robot le remplit, une personne jamais.
  site: z.string().max(200).optional(),
});

const traitement = z.object({ traitee: z.boolean() });

// Route publique appelée par le formulaire de code-secours.apsig.online (limitée par IP, comme les alertes).
@Controller("public")
export class InscriptionsController {
  constructor(private readonly db: PrismaService) {}

  @Post("inscriptions")
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  async deposer(@Body(new ZodPipe(demande)) { consentement: _, site, ...donnees }: z.infer<typeof demande>) {
    // Robot : même réponse qu'un dépôt réussi, rien n'est enregistré.
    if (site) return { recue: true };
    await this.db.demandeInscription.create({ data: donnees });
    return { recue: true };
  }
}

// Demandes reçues en ligne, rappelées par les conseillers depuis l'espace Abonnements.
@Controller("abonnements/demandes")
@UseGuards(BackOfficeGuard)
@EspaceRequis("abonnements")
export class DemandesController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  async lister(@Query("statut") statut?: string) {
    const filtre = statut === "TRAITEE" ? "TRAITEE" : "NOUVELLE";
    const [demandes, nouvelles] = await Promise.all([
      // Les plus anciennes d'abord à rappeler ; les plus récentes d'abord dans l'historique.
      this.db.demandeInscription.findMany({ where: { statut: filtre }, orderBy: { creeLe: filtre === "NOUVELLE" ? "asc" : "desc" }, take: 200 }),
      this.db.demandeInscription.count({ where: { statut: "NOUVELLE" } }),
    ]);
    return { demandes, nouvelles };
  }

  @Post(":id/traiter")
  @HttpCode(200)
  async traiter(@Param("id") id: string, @Body(new ZodPipe(traitement)) { traitee }: z.infer<typeof traitement>, @Utilisateur() u: UtilisateurConnecte) {
    return this.db.$transaction(async (tx) => {
      const existante = await tx.demandeInscription.findUnique({ where: { id } });
      if (!existante) throw new NotFoundException("Demande introuvable");
      const demande = await tx.demandeInscription.update({
        where: { id },
        data: traitee ? { statut: "TRAITEE", traiteeLe: new Date() } : { statut: "NOUVELLE", traiteeLe: null },
      });
      await tx.audit.create({ data: { action: traitee ? "demande.traiter" : "demande.rouvrir", cible: id, auteurId: u.id, details: { telephone: demande.telephone } } });
      return demande;
    });
  }
}

@Module({ controllers: [InscriptionsController, DemandesController] })
export class InscriptionsModule {}
