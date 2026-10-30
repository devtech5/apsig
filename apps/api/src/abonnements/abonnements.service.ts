import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import type { Prisma } from "@apsig/db";
import {
  ACTIVATION,
  ajouterMois,
  codeSupport,
  estImprime,
  etatAbonnement,
  genererJeton,
  SUPPORTS,
  urlAlerte,
  type MoyenPaiement,
  type RoleMembre,
  type TypeSupport,
} from "@apsig/domain";
import type { UtilisateurConnecte } from "../auth/auth.module.ts";
import { config } from "../config.ts";
import { PrismaService, type Tx } from "../prisma/prisma.service.ts";

const RESULTATS_MAX = 50;
// Codes courts (USSD / SMS : *789*CODE#) numériques ; ceux des supports de démonstration sont en dessous.
const PREMIER_CODE_COURT = 30_000;

const inclusFoyer = {
  quartier: { include: { ville: true, commune: true } },
  membres: { include: { acces: { where: { revoqueLe: null }, orderBy: { creeLe: "desc" } } } },
  contacts: { orderBy: { ordre: "asc" } },
  supports: { orderBy: { creeLe: "asc" }, include: { membre: true, pose: true } },
  abonnements: { orderBy: { debut: "desc" }, include: { formule: true } },
  paiements: { orderBy: { creeLe: "desc" }, take: 20 },
} satisfies Prisma.FoyerInclude;
type FoyerComplet = Prisma.FoyerGetPayload<{ include: typeof inclusFoyer }>;

export type Position = { lat: number; lng: number };
export type DonneesFoyer = { libelle: string; adresse?: string | null | undefined; quartierId: string; position?: Position | null | undefined };
export type DonneesMembre = {
  role: RoleMembre;
  prenom: string;
  nom: string;
  telephone?: string | null | undefined;
  anneeNaissance?: number | null | undefined;
  infosMedicales?: string | null | undefined;
};
export type DonneesContact = { nom: string; relation: string; telephone: string; ordre?: number | undefined; consenti?: boolean | undefined };
export type Souscription = {
  formuleId: string;
  mois: number;
  essai?: boolean | undefined;
  paiement?: { montantFcfa: number; operateur: MoyenPaiement; telephone?: string | undefined; reference?: string | undefined } | undefined;
};

export const empreinte = (secret: string) => createHash("sha256").update(secret).digest("hex");

const ORDRE_ROLE: Record<RoleMembre, number> = { TITULAIRE: 0, CONJOINT: 1, PARENT: 2, ENFANT: 3, AUTRE: 4 };

// Espace abonnements : les conseillers créent les foyers, gèrent abonnements et supports (QR) et les impriment.
@Injectable()
export class AbonnementsService {
  constructor(private readonly db: PrismaService) {}

  async referentiel() {
    const [villes, formules] = await Promise.all([
      this.db.ville.findMany({ orderBy: { nom: "asc" }, include: { quartiers: { orderBy: { nom: "asc" }, include: { commune: true } } } }),
      this.db.formule.findMany({ where: { actif: true }, orderBy: { prixFcfa: "asc" }, include: { composition: true } }),
    ]);
    return {
      villes: villes.map((v) => ({
        id: v.id,
        code: v.code,
        nom: v.nom,
        quartiers: v.quartiers.map((q) => ({ id: q.id, nom: q.commune ? `${q.nom} (${q.commune.nom})` : q.nom, lat: q.lat, lng: q.lng })),
      })),
      formules: formules.map((f) => ({
        id: f.id,
        code: f.code,
        nom: f.nom,
        prixFcfa: f.prixFcfa,
        prixMensuelFcfa: f.prixMensuelFcfa,
        moisInclus: f.moisInclus,
        intervention: f.intervention,
        composition: f.composition.map((c) => ({ type: c.type, quantite: c.quantite })),
      })),
    };
  }

  // Recherche par nom, téléphone, libellé, code imprimé, code court ou numéro de foyer.
  async rechercher(q: string | undefined) {
    const texte = q?.trim();
    const contient = (v: string) => ({ contains: v, mode: "insensitive" as const });
    const where: Prisma.FoyerWhereInput = texte
      ? {
          OR: [
            { libelle: contient(texte) },
            { adresse: contient(texte) },
            { membres: { some: { OR: [{ nom: contient(texte) }, { prenom: contient(texte) }, { telephone: { contains: texte.replace(/\s/g, "") } }, { telephone: contient(texte) }] } } },
            { supports: { some: { OR: [{ code: contient(texte) }, { codeCourt: texte }] } } },
            ...(/^\d{1,9}$/.test(texte) ? [{ numero: Number(texte) }] : []),
          ],
        }
      : {};
    const maintenant = new Date();
    const foyers = await this.db.foyer.findMany({
      where,
      orderBy: { creeLe: "desc" },
      take: RESULTATS_MAX,
      include: {
        quartier: { include: { ville: true } },
        membres: { where: { role: "TITULAIRE" }, take: 1 },
        abonnements: { orderBy: { fin: "desc" }, take: 1, include: { formule: true } },
        _count: { select: { supports: true } },
      },
    });
    return foyers.map((f) => {
      const t = f.membres[0];
      const a = f.abonnements[0];
      return {
        id: f.id,
        numero: f.numero,
        libelle: f.libelle,
        lieu: `${f.quartier.nom}, ${f.quartier.ville.nom}`,
        titulaire: t ? { prenom: t.prenom, nom: t.nom, telephone: t.telephone } : null,
        abonnement: a ? { formule: a.formule.nom, etat: etatAbonnement(a, maintenant), fin: a.fin } : null,
        supports: f._count.supports,
      };
    });
  }

  async detail(id: string) {
    return this.vue(await this.charger(this.db, id));
  }

  async creerFoyer(donnees: DonneesFoyer & { titulaire: Omit<DonneesMembre, "role">; souscription?: Souscription | undefined }, u: UtilisateurConnecte) {
    const id = await this.db.$transaction(async (tx) => {
      await this.verifierQuartier(tx, donnees.quartierId);
      const foyer = await tx.foyer.create({
        data: {
          numero: await this.numeroLibre(tx),
          libelle: donnees.libelle,
          adresse: donnees.adresse ?? null,
          quartierId: donnees.quartierId,
          lat: donnees.position?.lat ?? null,
          lng: donnees.position?.lng ?? null,
          cleClient: genererJeton(24),
          membres: { create: { ...this.membre({ ...donnees.titulaire, role: "TITULAIRE" }) } },
        },
      });
      if (donnees.souscription) await this.souscrireDans(tx, foyer.id, donnees.souscription, u);
      await this.auditer(tx, u, "foyer.creer", foyer.id, { libelle: foyer.libelle, numero: foyer.numero });
      return foyer.id;
    });
    return this.detail(id);
  }

  async modifierFoyer(id: string, donnees: Partial<DonneesFoyer>, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const avant = await this.charger(tx, id);
      if (donnees.quartierId) await this.verifierQuartier(tx, donnees.quartierId);
      const deplace =
        (donnees.quartierId !== undefined && donnees.quartierId !== avant.quartierId) ||
        (donnees.position !== undefined && (donnees.position?.lat ?? null) !== avant.lat) ||
        (donnees.position !== undefined && (donnees.position?.lng ?? null) !== avant.lng);
      await tx.foyer.update({
        where: { id },
        data: {
          ...(donnees.libelle !== undefined && { libelle: donnees.libelle }),
          ...(donnees.adresse !== undefined && { adresse: donnees.adresse }),
          ...(donnees.quartierId !== undefined && { quartierId: donnees.quartierId }),
          ...(donnees.position !== undefined && { lat: donnees.position?.lat ?? null, lng: donnees.position?.lng ?? null }),
          // L'adresse vérifiée l'est sur place, à la pose : déplacée au bureau, elle est à revérifier.
          ...(deplace && { adresseVerifiee: false }),
        },
      });
      await this.auditer(tx, u, "foyer.modifier", id, { champs: Object.keys(donnees) });
    });
    return this.detail(id);
  }

  // ─── Membres et contacts ───────────────────────────────────────────────────

  async ajouterMembre(foyerId: string, donnees: DonneesMembre, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      await this.charger(tx, foyerId);
      if (donnees.role === "TITULAIRE") throw new ConflictException("Le foyer a déjà un titulaire");
      const m = await tx.membre.create({ data: { foyerId, ...this.membre(donnees) } });
      await this.auditer(tx, u, "membre.ajouter", foyerId, { membreId: m.id });
    });
    return this.detail(foyerId);
  }

  async modifierMembre(id: string, donnees: Partial<DonneesMembre>, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const m = await tx.membre.findUnique({ where: { id } });
      if (!m) throw new NotFoundException("Membre introuvable");
      if (donnees.role && (donnees.role === "TITULAIRE") !== (m.role === "TITULAIRE")) {
        throw new ConflictException("Le titulaire reste le titulaire : modifiez ses coordonnées plutôt que son rôle");
      }
      await tx.membre.update({ where: { id }, data: this.membre(donnees) });
      // Les données de santé ne sont jamais relues ici : l'audit note seulement qu'elles ont changé.
      await this.auditer(tx, u, "membre.modifier", m.foyerId, { membreId: id, champs: Object.keys(donnees) });
      return m.foyerId;
    });
    return this.detail(foyerId);
  }

  async supprimerMembre(id: string, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const m = await tx.membre.findUnique({ where: { id } });
      if (!m) throw new NotFoundException("Membre introuvable");
      if (m.role === "TITULAIRE") throw new ConflictException("Le titulaire ne peut pas être supprimé");
      // Son application ne déclenche plus rien ; ses bracelets et cartes restent au foyer, sans porteur.
      await tx.support.updateMany({ where: { membreId: id, type: "APPLI" }, data: { statut: "SUSPENDU" } });
      await tx.support.updateMany({ where: { membreId: id }, data: { membreId: null } });
      await tx.membre.delete({ where: { id } });
      await this.auditer(tx, u, "membre.supprimer", m.foyerId, { membreId: id });
      return m.foyerId;
    });
    return this.detail(foyerId);
  }

  async ajouterContact(foyerId: string, donnees: DonneesContact, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      await this.charger(tx, foyerId);
      const c = await tx.contactUrgence.create({ data: { foyerId, ...this.contact(donnees) } });
      await this.auditer(tx, u, "contact.ajouter", foyerId, { contactId: c.id });
    });
    return this.detail(foyerId);
  }

  async modifierContact(id: string, donnees: Partial<DonneesContact>, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const c = await tx.contactUrgence.findUnique({ where: { id } });
      if (!c) throw new NotFoundException("Contact introuvable");
      await tx.contactUrgence.update({ where: { id }, data: this.contact(donnees) });
      await this.auditer(tx, u, "contact.modifier", c.foyerId, { contactId: id });
      return c.foyerId;
    });
    return this.detail(foyerId);
  }

  async supprimerContact(id: string, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const c = await tx.contactUrgence.findUnique({ where: { id } });
      if (!c) throw new NotFoundException("Contact introuvable");
      await tx.contactUrgence.delete({ where: { id } });
      await this.auditer(tx, u, "contact.supprimer", c.foyerId, { contactId: id });
      return c.foyerId;
    });
    return this.detail(foyerId);
  }

  // ─── Abonnements ───────────────────────────────────────────────────────────

  async souscrire(foyerId: string, s: Souscription, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      await this.charger(tx, foyerId);
      await this.souscrireDans(tx, foyerId, s, u);
    });
    return this.detail(foyerId);
  }

  async resilier(abonnementId: string, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const a = await tx.abonnement.findUnique({ where: { id: abonnementId } });
      if (!a) throw new NotFoundException("Abonnement introuvable");
      if (a.statut === "RESILIE") throw new ConflictException("Abonnement déjà résilié");
      const maintenant = new Date();
      await tx.abonnement.update({ where: { id: a.id }, data: { statut: "RESILIE", ...(a.fin > maintenant && { fin: maintenant }) } });
      await this.auditer(tx, u, "abonnement.resilier", a.foyerId, { abonnementId: a.id });
      return a.foyerId;
    });
    return this.detail(foyerId);
  }

  // Une nouvelle période commence à la fin de la période en cours (renouvellement anticipé), sinon tout de suite.
  private async souscrireDans(tx: Tx, foyerId: string, s: Souscription, u: UtilisateurConnecte) {
    const formule = await tx.formule.findUnique({ where: { id: s.formuleId }, include: { composition: true } });
    if (!formule?.actif) throw new BadRequestException("Formule inconnue ou retirée de la vente");
    const maintenant = new Date();
    const enCours = await tx.abonnement.findFirst({
      where: { foyerId, statut: { in: ["ACTIF", "ESSAI"] }, fin: { gt: maintenant } },
      orderBy: { fin: "desc" },
    });
    const debut = enCours ? enCours.fin : maintenant;
    const abonnement = await tx.abonnement.create({
      data: { foyerId, formuleId: formule.id, statut: s.essai ? "ESSAI" : "ACTIF", debut, fin: ajouterMois(debut, s.mois) },
    });
    if (s.paiement) {
      if (s.paiement.reference && (await tx.paiement.findUnique({ where: { refFournisseur: s.paiement.reference } }))) {
        throw new ConflictException("Cette référence de paiement est déjà enregistrée");
      }
      await tx.paiement.create({
        data: {
          foyerId,
          abonnementId: abonnement.id,
          montantFcfa: s.paiement.montantFcfa,
          operateur: s.paiement.operateur,
          telephone: s.paiement.telephone ?? null,
          refFournisseur: s.paiement.reference ?? null,
          statut: "REUSSI",
          payeLe: maintenant,
        },
      });
    }
    // La formule fournit ses supports : seuls les manquants sont créés (un renouvellement n'en refait pas).
    const foyer = await this.charger(tx, foyerId);
    for (const { type, quantite } of formule.composition) {
      const existants = foyer.supports.filter((x) => x.type === type && x.statut !== "PERDU").length;
      for (let i = existants; i < quantite; i++) await this.creerSupport(tx, foyer, type);
    }
    await this.auditer(tx, u, "abonnement.souscrire", foyerId, {
      abonnementId: abonnement.id,
      formule: formule.code,
      mois: s.mois,
      ...(s.paiement && { montantFcfa: s.paiement.montantFcfa, operateur: s.paiement.operateur }),
    });
  }

  // ─── Supports ──────────────────────────────────────────────────────────────

  async ajouterSupport(foyerId: string, d: { type: TypeSupport; membreId?: string | undefined; vehicule?: string | undefined }, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const foyer = await this.charger(tx, foyerId);
      if (d.membreId && !foyer.membres.some((m) => m.id === d.membreId)) throw new BadRequestException("Ce porteur n'est pas membre du foyer");
      const s = await this.creerSupport(tx, foyer, d.type, d.membreId, d.vehicule);
      await this.auditer(tx, u, "support.creer", foyerId, { supportId: s.id, code: s.code });
    });
    return this.detail(foyerId);
  }

  async modifierSupport(id: string, d: { membreId?: string | null | undefined; vehicule?: string | null | undefined }, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const s = await this.support(tx, id);
      if (d.membreId && !(await tx.membre.findFirst({ where: { id: d.membreId, foyerId: s.foyerId } }))) {
        throw new BadRequestException("Ce porteur n'est pas membre du foyer");
      }
      await tx.support.update({ where: { id }, data: { ...(d.membreId !== undefined && { membreId: d.membreId }), ...(d.vehicule !== undefined && { vehicule: d.vehicule }) } });
      await this.auditer(tx, u, "support.modifier", s.foyerId, { supportId: id, code: s.code });
      return s.foyerId;
    });
    return this.detail(foyerId);
  }

  // Suspendu ou perdu : le QR ne déclenche plus d'alerte (la page invite à appeler les secours publics).
  async changerStatutSupport(id: string, statut: "ACTIF" | "SUSPENDU" | "PERDU", u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const s = await this.support(tx, id);
      if (s.statut === statut) return s.foyerId;
      await tx.support.update({ where: { id }, data: { statut } });
      await this.auditer(tx, u, "support.statut", s.foyerId, { supportId: id, code: s.code, de: s.statut, vers: statut });
      return s.foyerId;
    });
    return this.detail(foyerId);
  }

  // QR volé, photographié ou abîmé : nouveau jeton, même code imprimé. L'ancien QR affiche « remplacé ».
  async remplacerJeton(id: string, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const s = await this.support(tx, id);
      await tx.jetonRevoque.create({ data: { jeton: s.jeton, supportId: s.id } });
      await tx.support.update({ where: { id }, data: { jeton: await this.jetonLibre(tx), ...(s.statut === "PERDU" && { statut: "ACTIF" }) } });
      await this.auditer(tx, u, "support.remplacer", s.foyerId, { supportId: id, code: s.code });
      return s.foyerId;
    });
    return this.detail(foyerId);
  }

  // ─── Application mobile des abonnés ────────────────────────────────────────

  // Code à usage unique, affiché une fois au conseiller qui le remet au membre (plus tard, envoyé par SMS).
  async codeActivation(membreId: string, u: UtilisateurConnecte) {
    return this.db.$transaction(async (tx) => {
      const m = await tx.membre.findUnique({ where: { id: membreId } });
      if (!m) throw new NotFoundException("Membre introuvable");
      if (!m.telephone) throw new ConflictException("Renseignez d'abord le téléphone du membre : il le saisira dans l'application");
      const maintenant = new Date();
      await tx.codeActivation.updateMany({ where: { membreId, utiliseLe: null, expireLe: { gt: maintenant } }, data: { expireLe: maintenant } });
      const code = String(randomInt(10 ** ACTIVATION.chiffres)).padStart(ACTIVATION.chiffres, "0");
      const expireLe = new Date(maintenant.getTime() + ACTIVATION.dureeH * 3_600_000);
      await tx.codeActivation.create({ data: { membreId, codeHash: empreinte(code), expireLe } });
      await this.auditer(tx, u, "membre.code_application", m.foyerId, { membreId });
      return { code, expireLe, telephone: m.telephone };
    });
  }

  // Téléphone perdu ou changé : l'application est déconnectée et ne reçoit plus les notifications.
  async revoquerAcces(accesId: string, u: UtilisateurConnecte) {
    const foyerId = await this.db.$transaction(async (tx) => {
      const a = await tx.accesClient.findUnique({ where: { id: accesId }, include: { membre: true } });
      if (!a) throw new NotFoundException("Application introuvable");
      if (!a.revoqueLe) await tx.accesClient.update({ where: { id: accesId }, data: { revoqueLe: new Date(), jetonPush: null } });
      await this.auditer(tx, u, "membre.deconnecter_application", a.membre.foyerId, { membreId: a.membreId, accesId });
      return a.membre.foyerId;
    });
    return this.detail(foyerId);
  }

  // Le téléphone de l'abonné est un support à part entière (APP-0053-01) : l'alerte suit le même circuit qu'un QR.
  async supportApplication(tx: Tx, membreId: string) {
    const existant = await tx.support.findFirst({ where: { membreId, type: "APPLI" }, orderBy: { creeLe: "asc" } });
    if (existant) return existant.statut === "ACTIF" ? existant : tx.support.update({ where: { id: existant.id }, data: { statut: "ACTIF" } });
    const m = await tx.membre.findUniqueOrThrow({ where: { id: membreId } });
    return this.creerSupport(tx, await this.charger(tx, m.foyerId), "APPLI", membreId);
  }

  // ─── Interne ───────────────────────────────────────────────────────────────

  private async charger(db: Tx | PrismaService, id: string): Promise<FoyerComplet> {
    const f = await db.foyer.findUnique({ where: { id }, include: inclusFoyer });
    if (!f) throw new NotFoundException("Foyer introuvable");
    return f;
  }

  private async support(tx: Tx, id: string) {
    const s = await tx.support.findUnique({ where: { id } });
    if (!s?.foyerId) throw new NotFoundException("Support introuvable");
    return { ...s, foyerId: s.foyerId };
  }

  private async verifierQuartier(tx: Tx, id: string) {
    if (!(await tx.quartier.findUnique({ where: { id } }))) throw new BadRequestException("Quartier inconnu");
  }

  private membre(d: Partial<DonneesMembre>) {
    return {
      ...(d.role !== undefined && { role: d.role }),
      ...(d.prenom !== undefined && { prenom: d.prenom }),
      ...(d.nom !== undefined && { nom: d.nom }),
      ...(d.telephone !== undefined && { telephone: d.telephone || null }),
      ...(d.anneeNaissance !== undefined && { anneeNaissance: d.anneeNaissance }),
      ...(d.infosMedicales !== undefined && { infosMedicales: d.infosMedicales?.trim() || null }),
    } as { role: RoleMembre; prenom: string; nom: string };
  }

  private contact(d: Partial<DonneesContact>) {
    return {
      ...(d.nom !== undefined && { nom: d.nom }),
      ...(d.relation !== undefined && { relation: d.relation }),
      ...(d.telephone !== undefined && { telephone: d.telephone }),
      ...(d.ordre !== undefined && { ordre: d.ordre }),
      ...(d.consenti !== undefined && { consentiLe: d.consenti ? new Date() : null }),
    } as { nom: string; relation: string; telephone: string };
  }

  private async creerSupport(tx: Tx, foyer: FoyerComplet, type: TypeSupport, membreId?: string, vehicule?: string) {
    const numero = foyer.numero ?? (await this.numeroterFoyer(tx, foyer.id));
    const { quartier } = foyer;
    const deja = await tx.support.count({ where: { foyerId: foyer.id, type } });
    // Le rang suivant ; s'il est déjà pris (support de démonstration, ancien foyer), le suivant encore.
    for (let rang = deja + 1; ; rang++) {
      const code = codeSupport(type, { ville: quartier.ville.code, commune: quartier.commune?.code, quartier: quartier.code, numero, rang });
      if (await tx.support.findUnique({ where: { code } })) continue;
      return tx.support.create({
        data: {
          type,
          code,
          jeton: await this.jetonLibre(tx),
          codeCourt: await this.codeCourtLibre(tx),
          statut: "ACTIF",
          foyerId: foyer.id,
          membreId: membreId ?? null,
          vehicule: vehicule ?? null,
        },
      });
    }
  }

  private async numeroterFoyer(tx: Tx, id: string) {
    const numero = await this.numeroLibre(tx);
    await tx.foyer.update({ where: { id }, data: { numero } });
    return numero;
  }

  private async numeroLibre(tx: Tx) {
    for (;;) {
      const n = await this.compteur(tx, "foyer", 1);
      if (!(await tx.foyer.findUnique({ where: { numero: n } }))) return n;
    }
  }

  private async codeCourtLibre(tx: Tx) {
    for (;;) {
      const code = String(await this.compteur(tx, "codeCourt", PREMIER_CODE_COURT));
      if (!(await tx.support.findUnique({ where: { codeCourt: code } }))) return code;
    }
  }

  private async jetonLibre(tx: Tx) {
    for (;;) {
      const jeton = genererJeton();
      const pris = (await tx.support.findUnique({ where: { jeton } })) || (await tx.jetonRevoque.findUnique({ where: { jeton } }));
      if (!pris) return jeton;
    }
  }

  private async compteur(tx: Tx, nom: string, depart: number) {
    const c = await tx.compteur.upsert({ where: { nom }, create: { nom, valeur: depart }, update: { valeur: { increment: 1 } } });
    return c.valeur;
  }

  private auditer(tx: Tx, u: UtilisateurConnecte, action: string, cible: string, details: Prisma.InputJsonValue) {
    return tx.audit.create({ data: { action, cible, auteurId: u.id, details } });
  }

  private vue(f: FoyerComplet) {
    const maintenant = new Date();
    return {
      id: f.id,
      numero: f.numero,
      libelle: f.libelle,
      adresse: f.adresse,
      quartier: { id: f.quartier.id, nom: f.quartier.nom },
      ville: { id: f.quartier.ville.id, code: f.quartier.ville.code, nom: f.quartier.ville.nom },
      position: f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : null,
      adresseVerifiee: f.adresseVerifiee,
      creeLe: f.creeLe,
      membres: [...f.membres]
        .sort((a, b) => ORDRE_ROLE[a.role] - ORDRE_ROLE[b.role] || a.prenom.localeCompare(b.prenom))
        .map((m) => ({
          id: m.id,
          role: m.role,
          prenom: m.prenom,
          nom: m.nom,
          telephone: m.telephone,
          anneeNaissance: m.anneeNaissance,
          // Saisies ici, lues seulement par la centrale pendant une alerte.
          infosMedicalesRenseignees: !!m.infosMedicales,
          applications: m.acces.map((a) => ({ id: a.id, appareil: a.appareil, creeLe: a.creeLe, vuLe: a.vuLe })),
        })),
      contacts: f.contacts.map((c) => ({ id: c.id, nom: c.nom, relation: c.relation, telephone: c.telephone, ordre: c.ordre, consentiLe: c.consentiLe })),
      supports: f.supports.filter((s) => estImprime(s.type)).map((s) => ({
        id: s.id,
        type: s.type,
        libelle: SUPPORTS[s.type].libelle,
        code: s.code,
        codeCourt: s.codeCourt,
        statut: s.statut,
        porteur: s.membre ? { id: s.membre.id, prenom: s.membre.prenom, nom: s.membre.nom } : null,
        vehicule: s.vehicule,
        url: urlAlerte(config.publicAlertUrl, s.jeton),
        poseLe: s.pose?.poseLe ?? null,
        creeLe: s.creeLe,
      })),
      abonnements: f.abonnements.map((a) => ({
        id: a.id,
        formule: { id: a.formule.id, code: a.formule.code, nom: a.formule.nom },
        etat: etatAbonnement(a, maintenant),
        debut: a.debut,
        fin: a.fin,
      })),
      paiements: f.paiements.map((p) => ({ id: p.id, montantFcfa: p.montantFcfa, operateur: p.operateur, statut: p.statut, reference: p.refFournisseur, creeLe: p.creeLe })),
    };
  }
}
