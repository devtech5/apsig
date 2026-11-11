import { Body, Controller, HttpCode, Module, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { z } from "zod";
import { CIBLES } from "@apsig/domain";
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

@Module({ controllers: [InscriptionsController] })
export class InscriptionsModule {}
