import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { MOYENS_PAIEMENT, ROLES_MEMBRE, TYPES_SUPPORT } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { AbonnementsService } from "./abonnements.service.ts";

const texte = (max: number) => z.string().trim().min(1).max(max);
const optionnel = (max: number) => z.string().trim().max(max).nullable().optional();
const telephone = z.string().trim().regex(/^\+?[0-9 .-]{8,20}$/, "Numéro de téléphone invalide");
const position = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const foyer = z.object({
  libelle: texte(120),
  adresse: optionnel(300),
  quartierId: z.string().min(1),
  position: position.nullable().optional(),
});
const membre = z.object({
  role: z.enum(ROLES_MEMBRE),
  prenom: texte(60),
  nom: texte(60),
  telephone: telephone.nullable().optional().or(z.literal("")),
  anneeNaissance: z.number().int().min(1900).max(2100).nullable().optional(),
  // Santé : saisie par le conseiller, jamais relue dans cet espace (seule la centrale y a accès pendant une alerte).
  infosMedicales: optionnel(1000),
});
const titulaire = membre.omit({ role: true }).extend({ telephone });
const souscription = z.object({
  formuleId: z.string().min(1),
  mois: z.number().int().min(1).max(36),
  essai: z.boolean().optional(),
  paiement: z
    .object({
      montantFcfa: z.number().int().min(0).max(10_000_000),
      operateur: z.enum(MOYENS_PAIEMENT),
      telephone: telephone.optional(),
      reference: z.string().trim().min(3).max(64).optional(),
    })
    .optional(),
});
const creation = foyer.extend({ titulaire, souscription: souscription.optional() });
const contact = z.object({
  nom: texte(80),
  relation: texte(40),
  telephone,
  ordre: z.number().int().min(1).max(9).optional(),
  consenti: z.boolean().optional(),
});
const nouveauSupport = z.object({ type: z.enum(TYPES_SUPPORT), membreId: z.string().min(1).optional(), vehicule: z.string().trim().min(2).max(20).optional() });
const modifSupport = z.object({ membreId: z.string().min(1).nullable().optional(), vehicule: optionnel(20) });
const statutSupport = z.object({ statut: z.enum(["ACTIF", "SUSPENDU", "PERDU"]) });

// Espace abonnements : conseillers (et administration). Chaque modification renvoie le foyer à jour.
@Controller("abonnements")
@UseGuards(BackOfficeGuard)
@EspaceRequis("abonnements")
export class AbonnementsController {
  constructor(private readonly abonnements: AbonnementsService) {}

  @Get("referentiel")
  referentiel() {
    return this.abonnements.referentiel();
  }

  @Get("foyers")
  rechercher(@Query("q") q?: string) {
    return this.abonnements.rechercher(q);
  }

  @Post("foyers")
  creer(@Body(new ZodPipe(creation)) body: z.infer<typeof creation>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.creerFoyer(body, u);
  }

  @Get("foyers/:id")
  detail(@Param("id") id: string) {
    return this.abonnements.detail(id);
  }

  @Patch("foyers/:id")
  modifier(@Param("id") id: string, @Body(new ZodPipe(foyer.partial())) body: Partial<z.infer<typeof foyer>>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.modifierFoyer(id, body, u);
  }

  @Post("foyers/:id/membres")
  ajouterMembre(@Param("id") id: string, @Body(new ZodPipe(membre)) body: z.infer<typeof membre>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.ajouterMembre(id, body, u);
  }

  @Patch("membres/:id")
  modifierMembre(@Param("id") id: string, @Body(new ZodPipe(membre.partial())) body: Partial<z.infer<typeof membre>>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.modifierMembre(id, body, u);
  }

  @Delete("membres/:id")
  supprimerMembre(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.supprimerMembre(id, u);
  }

  @Post("membres/:id/code-application")
  codeApplication(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.codeActivation(id, u);
  }

  @Delete("applications/:id")
  deconnecterApplication(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.revoquerAcces(id, u);
  }

  @Post("foyers/:id/contacts")
  ajouterContact(@Param("id") id: string, @Body(new ZodPipe(contact)) body: z.infer<typeof contact>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.ajouterContact(id, body, u);
  }

  @Patch("contacts/:id")
  modifierContact(@Param("id") id: string, @Body(new ZodPipe(contact.partial())) body: Partial<z.infer<typeof contact>>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.modifierContact(id, body, u);
  }

  @Delete("contacts/:id")
  supprimerContact(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.supprimerContact(id, u);
  }

  @Post("foyers/:id/abonnements")
  souscrire(@Param("id") id: string, @Body(new ZodPipe(souscription)) body: z.infer<typeof souscription>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.souscrire(id, body, u);
  }

  @Post("abonnements/:id/resilier")
  @HttpCode(200)
  resilier(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.resilier(id, u);
  }

  @Post("foyers/:id/supports")
  ajouterSupport(@Param("id") id: string, @Body(new ZodPipe(nouveauSupport)) body: z.infer<typeof nouveauSupport>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.ajouterSupport(id, body, u);
  }

  @Patch("supports/:id")
  modifierSupport(@Param("id") id: string, @Body(new ZodPipe(modifSupport)) body: z.infer<typeof modifSupport>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.modifierSupport(id, body, u);
  }

  @Post("supports/:id/statut")
  @HttpCode(200)
  changerStatutSupport(@Param("id") id: string, @Body(new ZodPipe(statutSupport)) body: z.infer<typeof statutSupport>, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.changerStatutSupport(id, body.statut, u);
  }

  @Post("supports/:id/remplacer")
  @HttpCode(200)
  remplacer(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.abonnements.remplacerJeton(id, u);
  }
}
