import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@apsig/db";
import { aAcces, LIBELLES_TYPE_UNITE, peutGererRole, REPARTITION, type Role, type StatutUnite, type TypeUnite } from "@apsig/domain";
import type { UtilisateurConnecte } from "../auth/auth.module.ts";
import { definirMotDePasse } from "../auth/comptes.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { RepartitionService } from "../repartition/repartition.service.ts";

const AUDIT_PAR_PAGE = 100;

// Administration : comptes du back-office (chacun ne gère que les rôles inférieurs au sien) et journal d'audit.
@Injectable()
export class AdministrationService {
  constructor(
    private readonly db: PrismaService,
    private readonly repartition: RepartitionService,
  ) {}

  async comptes(acteur: UtilisateurConnecte) {
    const maintenant = Date.now();
    const comptes = await this.db.utilisateur.findMany({ orderBy: [{ actif: "desc" }, { nom: "asc" }], include: { unite: { select: { id: true, nom: true } } } });
    return comptes.map((c) => ({
      id: c.id,
      nom: c.nom,
      email: c.email,
      role: c.role,
      actif: c.actif,
      deuxFacteurs: c.deuxFacteurs,
      presence: c.presence,
      enLigne: c.vuLe != null && maintenant - c.vuLe.getTime() < REPARTITION.signeDeVieS * 1000,
      vuLe: c.vuLe,
      creeLe: c.creeLe,
      unite: c.unite,
      gerable: c.id !== acteur.id && peutGererRole(acteur.role, c.role as Role),
    }));
  }

  // Le mot de passe généré n'est montré qu'une fois, à l'administrateur, qui le transmet en main propre.
  async creerCompte(d: { nom: string; email: string; role: Role }, acteur: UtilisateurConnecte) {
    this.verifierRole(acteur, d.role);
    const email = d.email.trim().toLowerCase();
    if (await this.db.utilisateur.findUnique({ where: { email } })) throw new ConflictException("Un compte existe déjà avec cet e-mail");
    const { utilisateur, motDePasse } = await definirMotDePasse(this.db, { email, nom: d.nom, role: d.role });
    await this.auditer(acteur, "compte.creer", utilisateur.email, { role: d.role });
    return { compte: { id: utilisateur.id, email: utilisateur.email }, motDePasse };
  }

  async modifierCompte(
    id: string,
    d: { nom?: string | undefined; role?: Role | undefined; actif?: boolean | undefined; uniteId?: string | null | undefined },
    acteur: UtilisateurConnecte,
  ) {
    const cible = await this.cible(id, acteur);
    if (d.role && d.role !== cible.role) this.verifierRole(acteur, d.role);
    if (d.uniteId && !(await this.db.unite.findUnique({ where: { id: d.uniteId } }))) throw new BadRequestException("Unité inconnue");
    await this.db.utilisateur.update({
      where: { id },
      data: {
        ...(d.nom !== undefined && { nom: d.nom }),
        ...(d.role !== undefined && { role: d.role }),
        ...(d.actif !== undefined && { actif: d.actif }),
        ...(d.uniteId !== undefined && { uniteId: d.uniteId }),
      },
    });
    const desactive = d.actif === false && cible.actif;
    const plusCentrale = d.role !== undefined && !aAcces(d.role, "centrale");
    if (desactive) await this.db.session.deleteMany({ where: { userId: id } });
    // Ses alertes repartent aussitôt vers les autres opérateurs.
    if ((desactive || plusCentrale) && cible.presence !== "HORS_SERVICE") {
      await this.repartition.changerPresence(id, "HORS_SERVICE", new Date(), desactive ? "compte désactivé" : "n'est plus opérateur");
    }
    await this.auditer(acteur, "compte.modifier", cible.email, {
      ...(d.nom !== undefined && { nom: d.nom }),
      ...(d.role !== undefined && { de: cible.role, vers: d.role }),
      ...(d.actif !== undefined && { actif: d.actif }),
      ...(d.uniteId !== undefined && { uniteId: d.uniteId }),
    });
    return this.comptes(acteur);
  }

  // Mot de passe oublié ou téléphone perdu : nouveau mot de passe, double authentification à refaire, sessions fermées.
  async reinitialiser(id: string, acteur: UtilisateurConnecte) {
    const cible = await this.cible(id, acteur);
    if (!cible.actif) throw new ConflictException("Compte désactivé : réactivez-le d'abord");
    const { motDePasse } = await definirMotDePasse(this.db, { email: cible.email });
    await this.auditer(acteur, "compte.reinitialiser", cible.email, {});
    return { motDePasse };
  }

  // ─── Unités terrain ───────────────────────────────────────────────────────

  async unites() {
    const unites = await this.db.unite.findMany({ include: { agents: { select: { id: true, nom: true, actif: true } } }, orderBy: { nom: "asc" } });
    return unites.map((u) => ({ id: u.id, nom: u.nom, type: u.type, libelleType: LIBELLES_TYPE_UNITE[u.type], statut: u.statut, agents: u.agents }));
  }

  async creerUnite(d: { nom: string; type: TypeUnite }, acteur: UtilisateurConnecte) {
    const u = await this.db.unite.create({ data: { nom: d.nom, type: d.type, statut: "HORS_SERVICE" } });
    await this.auditer(acteur, "unite.creer", u.nom, { type: d.type });
    return this.unites();
  }

  async modifierUnite(id: string, d: { nom?: string | undefined; type?: TypeUnite | undefined; statut?: StatutUnite | undefined }, acteur: UtilisateurConnecte) {
    const u = await this.db.unite.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("Unité introuvable");
    await this.db.unite.update({ where: { id }, data: { ...(d.nom !== undefined && { nom: d.nom }), ...(d.type !== undefined && { type: d.type }), ...(d.statut !== undefined && { statut: d.statut }) } });
    await this.auditer(acteur, "unite.modifier", u.nom, { ...d });
    return this.unites();
  }

  async journal(action: string | undefined, page: number) {
    const where: Prisma.AuditWhereInput = action ? { action: { startsWith: action } } : {};
    const [total, entrees] = await Promise.all([
      this.db.audit.count({ where }),
      this.db.audit.findMany({
        where,
        orderBy: { le: "desc" },
        skip: (page - 1) * AUDIT_PAR_PAGE,
        take: AUDIT_PAR_PAGE,
        include: { auteur: { select: { nom: true } } },
      }),
    ]);
    return {
      total,
      page,
      parPage: AUDIT_PAR_PAGE,
      entrees: entrees.map((e) => ({ id: e.id, le: e.le, action: e.action, cible: e.cible, details: e.details, auteur: e.auteur?.nom ?? null })),
    };
  }

  private async cible(id: string, acteur: UtilisateurConnecte) {
    const c = await this.db.utilisateur.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Compte introuvable");
    if (c.id === acteur.id) throw new ForbiddenException("Votre propre compte se gère depuis la page Sécurité");
    if (!peutGererRole(acteur.role, c.role as Role)) throw new ForbiddenException("Ce compte relève d'un niveau supérieur au vôtre");
    return c;
  }

  private verifierRole(acteur: UtilisateurConnecte, role: Role) {
    if (!peutGererRole(acteur.role, role)) throw new ForbiddenException("Vous ne pouvez pas attribuer ce rôle");
  }

  private auditer(acteur: UtilisateurConnecte, action: string, cible: string, details: Prisma.InputJsonValue) {
    return this.db.audit.create({ data: { action, cible, auteurId: acteur.id, details } });
  }
}
