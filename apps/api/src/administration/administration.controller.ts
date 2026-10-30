import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ROLES, STATUTS_UNITE, TYPES_UNITE } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { AdministrationService } from "./administration.service.ts";

const creation = z.object({ nom: z.string().trim().min(2).max(80), email: z.string().trim().email().max(120), role: z.enum(ROLES) });
const modification = z.object({
  nom: z.string().trim().min(2).max(80).optional(),
  role: z.enum(ROLES).optional(),
  actif: z.boolean().optional(),
  uniteId: z.string().min(1).nullable().optional(),
});
const unite = z.object({ nom: z.string().trim().min(2).max(60), type: z.enum(TYPES_UNITE), statut: z.enum(STATUTS_UNITE).optional() });
const journal = z.object({ action: z.string().trim().max(40).optional(), page: z.coerce.number().int().min(1).max(10_000).default(1) });

@Controller("administration")
@UseGuards(BackOfficeGuard)
@EspaceRequis("administration")
export class AdministrationController {
  constructor(private readonly administration: AdministrationService) {}

  @Get("comptes")
  comptes(@Utilisateur() u: UtilisateurConnecte) {
    return this.administration.comptes(u);
  }

  @Post("comptes")
  creer(@Body(new ZodPipe(creation)) body: z.infer<typeof creation>, @Utilisateur() u: UtilisateurConnecte) {
    return this.administration.creerCompte(body, u);
  }

  @Patch("comptes/:id")
  modifier(@Param("id") id: string, @Body(new ZodPipe(modification)) body: z.infer<typeof modification>, @Utilisateur() u: UtilisateurConnecte) {
    return this.administration.modifierCompte(id, body, u);
  }

  @Post("comptes/:id/reinitialiser")
  @HttpCode(200)
  reinitialiser(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.administration.reinitialiser(id, u);
  }

  @Get("unites")
  unites() {
    return this.administration.unites();
  }

  @Post("unites")
  creerUnite(@Body(new ZodPipe(unite.omit({ statut: true }))) body: Omit<z.infer<typeof unite>, "statut">, @Utilisateur() u: UtilisateurConnecte) {
    return this.administration.creerUnite(body, u);
  }

  @Patch("unites/:id")
  modifierUnite(@Param("id") id: string, @Body(new ZodPipe(unite.partial())) body: Partial<z.infer<typeof unite>>, @Utilisateur() u: UtilisateurConnecte) {
    return this.administration.modifierUnite(id, body, u);
  }

  @Get("journal")
  journal(@Query(new ZodPipe(journal)) q: z.infer<typeof journal>) {
    return this.administration.journal(q.action, q.page);
  }
}
