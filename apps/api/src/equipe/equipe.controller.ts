import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { aAcces, emailTerrain, ROLES_EQUIPE, type Role } from "@apsig/domain";
import { affichage } from "../administration/administration.service.ts";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { definirMotDePasse } from "../auth/comptes.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

const nouveauRecenseur = z.object({
  nom: z.string().trim().min(2).max(80),
  telephone: z.string().trim().max(20),
  // Administrateur seulement : rattacher le recenseur à un chef d'équipe.
  chefId: z.string().min(1).nullable().optional(),
});
const etat = z.object({ actif: z.boolean() });

// Équipe terrain : le chef d'équipe suit ses recenseurs (clients recensés, payés, plaques posées) et gère leurs comptes.
// L'administration voit tous les comptes terrain.
@Injectable()
export class EquipeService {
  constructor(private readonly db: PrismaService) {}

  private estAdmin = (u: UtilisateurConnecte) => aAcces(u.role, "administration");

  async tableau(u: UtilisateurConnecte) {
    const membres = await this.db.utilisateur.findMany({
      where: this.estAdmin(u) ? { role: { in: ["RECENSEUR", "AGENT", "CHEF_EQUIPE"] } } : { chefId: u.id },
      include: { chef: { select: { nom: true } } },
      orderBy: [{ actif: "desc" }, { nom: "asc" }],
    });
    const ids = membres.map((m) => m.id);
    const [recenses, payes, posees, poses] = await Promise.all([
      this.db.foyer.groupBy({ by: ["recenseParId"], where: { recenseParId: { in: ids } }, _count: true }),
      // Payés : forfait soldé (abonnement ouvert) ; un acompte ne suffit pas.
      this.db.foyer.groupBy({ by: ["recenseParId"], where: { recenseParId: { in: ids }, abonnements: { some: {} } }, _count: true }),
      // Plaques posées chez les clients du recenseur : la commission est due à la pose validée.
      this.db.foyer.groupBy({ by: ["recenseParId"], where: { recenseParId: { in: ids }, supports: { some: { type: "PORTAIL", pose: { isNot: null } } } }, _count: true }),
      this.db.pose.groupBy({ by: ["agentId"], where: { agentId: { in: ids } }, _count: true }),
    ]);
    const total = (rangs: { cle: string | null; _count: number }[]) => new Map(rangs.map((r) => [r.cle, r._count]));
    const nbRecenses = total(recenses.map((r) => ({ cle: r.recenseParId, _count: r._count })));
    const nbPayes = total(payes.map((r) => ({ cle: r.recenseParId, _count: r._count })));
    const nbPosees = total(posees.map((r) => ({ cle: r.recenseParId, _count: r._count })));
    const nbPoses = total(poses.map((r) => ({ cle: r.agentId, _count: r._count })));
    const derniers = await this.db.foyer.findMany({
      where: { recenseParId: { in: ids } },
      orderBy: { creeLe: "desc" },
      take: 100,
      include: {
        recensePar: { select: { nom: true } },
        quartier: { include: { ville: true, commune: true } },
        supports: { where: { type: "PORTAIL" }, include: { pose: { select: { id: true } } }, take: 1 },
        abonnements: { select: { id: true }, take: 1 },
      },
    });
    return {
      membres: membres.map((m) => ({
        id: m.id,
        nom: m.nom,
        identifiant: affichage(m.email),
        role: m.role,
        actif: m.actif,
        chef: m.chef?.nom ?? null,
        gerable: this.peutGerer(u, m),
        recenses: nbRecenses.get(m.id) ?? 0,
        payes: nbPayes.get(m.id) ?? 0,
        plaquesPosees: nbPosees.get(m.id) ?? 0,
        posesEffectuees: nbPoses.get(m.id) ?? 0,
      })),
      recensements: derniers.map((f) => ({
        id: f.id,
        code: f.supports[0]?.code ?? null,
        client: f.libelle,
        lieu: [f.quartier.nom, f.quartier.commune?.nom, f.quartier.ville.nom].filter(Boolean).join(", "),
        recenseur: f.recensePar?.nom ?? null,
        paye: f.abonnements.length > 0,
        posee: Boolean(f.supports[0]?.pose),
        creeLe: f.creeLe,
      })),
    };
  }

  // Le mot de passe n'est montré qu'une fois : le chef le remet en main propre au recenseur.
  async creerRecenseur(d: z.infer<typeof nouveauRecenseur>, u: UtilisateurConnecte) {
    const email = emailTerrain(d.telephone);
    if (!email) throw new ConflictException("Numéro de téléphone invalide (10 chiffres)");
    if (await this.db.utilisateur.findUnique({ where: { email } })) throw new ConflictException("Un compte existe déjà avec ce téléphone");
    const chefId = this.estAdmin(u) ? (d.chefId ?? null) : u.id;
    if (chefId && chefId !== u.id) {
      const chef = await this.db.utilisateur.findUnique({ where: { id: chefId } });
      if (!chef || chef.role !== "CHEF_EQUIPE" || !chef.actif) throw new NotFoundException("Chef d'équipe inconnu ou désactivé");
    }
    const { utilisateur, motDePasse } = await definirMotDePasse(this.db, { email, nom: d.nom, role: "RECENSEUR" });
    await this.db.utilisateur.update({ where: { id: utilisateur.id }, data: { chefId } });
    await this.auditer(u, "compte.creer", email, { role: "RECENSEUR", chefId });
    return { compte: { id: utilisateur.id, identifiant: affichage(email) }, motDePasse };
  }

  async reinitialiser(id: string, u: UtilisateurConnecte) {
    const m = await this.membre(id, u);
    if (!m.actif) throw new ConflictException("Compte désactivé : réactivez-le d'abord");
    const { motDePasse } = await definirMotDePasse(this.db, { email: m.email });
    await this.auditer(u, "compte.reinitialiser", m.email, {});
    return { motDePasse };
  }

  async changerEtat(id: string, actif: boolean, u: UtilisateurConnecte) {
    const m = await this.membre(id, u);
    await this.db.utilisateur.update({ where: { id }, data: { actif } });
    if (!actif) await this.db.session.deleteMany({ where: { userId: id } });
    await this.auditer(u, "compte.modifier", m.email, { actif });
    return this.tableau(u);
  }

  // Le chef d'équipe ne gère que ses recenseurs ; l'administration, tous les recenseurs.
  private peutGerer(u: UtilisateurConnecte, m: { id: string; role: string; chefId: string | null }) {
    if (m.id === u.id || !ROLES_EQUIPE.includes(m.role as Role)) return false;
    return this.estAdmin(u) || m.chefId === u.id;
  }

  private async membre(id: string, u: UtilisateurConnecte) {
    const m = await this.db.utilisateur.findUnique({ where: { id } });
    if (!m) throw new NotFoundException("Compte introuvable");
    if (!this.peutGerer(u, m)) throw new ForbiddenException("Ce compte n'est pas dans votre équipe");
    return m;
  }

  private auditer(u: UtilisateurConnecte, action: string, cible: string, details: Record<string, unknown>) {
    return this.db.audit.create({ data: { action, cible, auteurId: u.id, details: details as object } });
  }
}

@Controller("equipe")
@UseGuards(BackOfficeGuard)
@EspaceRequis("equipe")
export class EquipeController {
  constructor(private readonly service: EquipeService) {}

  @Get()
  tableau(@Utilisateur() u: UtilisateurConnecte) {
    return this.service.tableau(u);
  }

  @Post("recenseurs")
  creer(@Body(new ZodPipe(nouveauRecenseur)) body: z.infer<typeof nouveauRecenseur>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.creerRecenseur(body, u);
  }

  @Post("membres/:id/reinitialiser")
  @HttpCode(200)
  reinitialiser(@Param("id") id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.reinitialiser(id, u);
  }

  @Patch("membres/:id")
  changerEtat(@Param("id") id: string, @Body(new ZodPipe(etat)) body: z.infer<typeof etat>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.changerEtat(id, body.actif, u);
  }
}

@Module({ controllers: [EquipeController], providers: [EquipeService] })
export class EquipeModule {}
