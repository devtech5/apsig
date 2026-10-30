import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Alerte, Presence, Prisma } from "@apsig/db";
import {
  aAcces,
  ESPACES,
  estOuverte,
  LIBELLES_RAPPEL,
  LIBELLES_STATUT,
  niveauEscaladeDu,
  peutPasser,
  REPARTITION,
  scoreTriage,
  STATUTS_OUVERTS,
  statutsSuivants,
  SUPPORTS,
  URGENCES,
  type StatutAlerte,
  type StatutRappel,
} from "@apsig/domain";
import { AlertesService } from "../alertes/alertes.service.ts";
import type { UtilisateurConnecte } from "../auth/auth.module.ts";
import { FluxService } from "../flux/flux.module.ts";
import { PrismaService, type Tx } from "../prisma/prisma.service.ts";
import { RepartitionService } from "../repartition/repartition.service.ts";

const JOUR_MS = 86_400_000;
const OUVERTS = [...STATUTS_OUVERTS];
// La file ne montre que les alertes principales : les témoins rattachés suivent leur incident.
const principalesOuvertes = { statut: { in: OUVERTS }, principaleId: null } satisfies Prisma.AlerteWhereInput;
const TAILLE_FILE_COMMUNE = 50;

const inclusFile = {
  support: { select: { type: true, code: true } },
  foyer: { select: { quartier: { select: { nom: true, ville: { select: { nom: true } } } } } },
  operateur: { select: { nom: true } },
  attribueeA: { select: { id: true, nom: true } },
  _count: { select: { rattachees: { where: { statut: { in: OUVERTS } } } } },
} satisfies Prisma.AlerteInclude;
type AlerteFile = Prisma.AlerteGetPayload<{ include: typeof inclusFile }>;

const inclusDetail = {
  ...inclusFile,
  support: { include: { membre: true } },
  foyer: {
    include: {
      quartier: { include: { ville: true } },
      membres: { orderBy: { role: "asc" } },
      contacts: { orderBy: { ordre: "asc" } },
      abonnements: { include: { formule: true }, orderBy: { fin: "desc" } },
    },
  },
  principale: { select: { numero: true, statut: true, attribueeAId: true } },
  rattachees: { include: { support: { select: { type: true, code: true } } }, orderBy: { creeLe: "asc" } },
  evenements: { include: { auteur: { select: { nom: true } } }, orderBy: { le: "asc" } },
  messages: { orderBy: { creeLe: "asc" } },
} satisfies Prisma.AlerteInclude;

type AvecPrincipale = Alerte & { principale: { numero: string; attribueeAId: string | null } | null };

const parTriage = (maintenant: Date) => (x: AlerteFile, y: AlerteFile) =>
  scoreTriage({ ...y, rattachees: y._count.rattachees }, maintenant) - scoreTriage({ ...x, rattachees: x._count.rattachees }, maintenant);

@Injectable()
export class CentraleService {
  constructor(
    private readonly db: PrismaService,
    private readonly alertes: AlertesService,
    private readonly repartition: RepartitionService,
    private readonly flux: FluxService,
  ) {}

  // La centrale relit sa file en continu : c'est aussi le signe de vie de l'opérateur.
  async file(u: UtilisateurConnecte, maintenant = new Date()) {
    const { presence } = await this.db.utilisateur.update({ where: { id: u.id }, data: { vuLe: maintenant }, select: { presence: true } });
    const supervision = aAcces(u.role, "supervision");
    const [miennes, commune, autres, recentes, etat, equipe] = await Promise.all([
      this.db.alerte.findMany({ where: { ...principalesOuvertes, attribueeAId: u.id }, include: inclusFile }),
      this.db.alerte.findMany({ where: { ...principalesOuvertes, attribueeAId: null }, include: inclusFile }),
      supervision
        ? this.db.alerte.findMany({ where: { ...principalesOuvertes, AND: [{ attribueeAId: { not: null } }, { attribueeAId: { not: u.id } }] }, include: inclusFile })
        : undefined,
      this.db.alerte.findMany({
        where: {
          statut: { notIn: OUVERTS },
          principaleId: null,
          clotureLe: { gte: new Date(maintenant.getTime() - JOUR_MS) },
          ...(!supervision && { operateurId: u.id }),
        },
        include: inclusFile,
        orderBy: { clotureLe: "desc" },
        take: 30,
      }),
      this.repartition.etatFile(this.db, maintenant),
      supervision ? this.equipe(maintenant) : undefined,
    ]);
    const tri = parTriage(maintenant);
    // D'abord ce qui attend d'être accepté, puis le plus urgent.
    miennes.sort((x, y) => Number(!!x.accepteeLe) - Number(!!y.accepteeLe) || tri(x, y));
    commune.sort(tri);
    const resume = (a: AlerteFile) => this.resume(a, maintenant);
    return {
      presence,
      crise: { ...this.repartition.etatCrise, ...etat },
      mesAlertes: miennes.map(resume),
      aPrendre: { total: commune.length, alertes: commune.slice(0, TAILLE_FILE_COMMUNE).map(resume) },
      autres: autres?.sort(tri).map(resume),
      equipe,
      recentes: recentes.map(resume),
    };
  }

  async detail(numero: string, u: UtilisateurConnecte) {
    const a = await this.db.alerte.findUnique({ where: { numero }, include: inclusDetail });
    if (!a) throw new NotFoundException("Alerte introuvable");
    const { lire, agir } = this.droits(a, u);
    if (!lire) throw new ForbiddenException(`Alerte attribuée à ${a.attribueeA?.nom ?? "un autre opérateur"}`);
    const fiabilite = await this.alertes.evaluerFiabilite(this.db, a.id);
    const foyer = a.foyer;
    const abonnement = foyer?.abonnements[0];
    const porteur = a.support.membre;
    const principale = !a.principaleId;
    return {
      ...this.resume(a, new Date()),
      source: a.source,
      priseEnChargeLe: a.priseEnChargeLe,
      surPlaceLe: a.surPlaceLe,
      issue: a.issue,
      temoin:
        a.temoinLat != null && a.temoinLng != null ? { lat: a.temoinLat, lng: a.temoinLng, precisionM: a.temoinPrecisionM, le: a.temoinPositionLe } : null,
      porteur: porteur && { prenom: porteur.prenom, nom: porteur.nom, anneeNaissance: porteur.anneeNaissance, infosMedicales: porteur.infosMedicales },
      foyer: foyer && {
        libelle: foyer.libelle,
        adresse: foyer.adresse,
        quartier: foyer.quartier.nom,
        ville: foyer.quartier.ville.nom,
        adresseVerifiee: foyer.adresseVerifiee,
        abonnement: abonnement ? { formule: abonnement.formule.nom, statut: abonnement.statut, fin: abonnement.fin } : null,
        membres: foyer.membres.map(({ role, prenom, nom, telephone, anneeNaissance, infosMedicales }) => ({ role, prenom, nom, telephone, anneeNaissance, infosMedicales })),
        contacts: foyer.contacts.map(({ nom, relation, telephone }) => ({ nom, relation, telephone })),
      },
      fiabilite,
      principale: a.principale && { numero: a.principale.numero, statut: a.principale.statut },
      temoinsRattaches: a.rattachees.map((r) => ({
        numero: r.numero,
        statut: r.statut,
        creeLe: r.creeLe,
        support: { type: r.support.type, libelle: SUPPORTS[r.support.type].libelle, code: r.support.code },
        temoin: r.temoinLat != null && r.temoinLng != null ? { lat: r.temoinLat, lng: r.temoinLng } : null,
      })),
      journal: a.evenements.map((e) => ({ le: e.le, nature: e.nature, texte: e.texte, auteur: e.auteur?.nom ?? null })),
      messages: a.messages.map(({ canal, destinataire, nomDestinataire, texte, statut, creeLe }) => ({ canal, destinataire, nomDestinataire, texte, statut, creeLe })),
      peutAgir: agir,
      // Accepter : l'alerte n'est pas encore acceptée, ou elle l'est par quelqu'un d'autre et c'est un superviseur qui regarde.
      peutPrendre: agir && principale && estOuverte(a.statut) && !(a.accepteeLe && a.attribueeAId),
      statutsPossibles: agir && principale ? statutsSuivants(a.statut) : [],
    };
  }

  // Accepter l'alerte attribuée (ou la prendre dans la file commune).
  async prendre(numero: string, u: UtilisateurConnecte) {
    const a = await this.charger(this.db, numero, u);
    this.verifierPrincipale(a);
    if (!estOuverte(a.statut)) throw new ConflictException("Alerte déjà clôturée");
    if (a.accepteeLe && a.attribueeAId === u.id) return this.detail(numero, u);
    if (a.accepteeLe && a.attribueeAId) throw new ConflictException("Alerte déjà prise en charge : passez par la réattribution");
    if (a.statut === "NOUVELLE") return this.changerStatut(numero, "PRISE_EN_CHARGE", undefined, u);

    // Alerte en cours réattribuée : l'opérateur la reprend là où elle en est.
    await this.db.$transaction(async (tx) => {
      await this.mettreAJour(tx, a, this.prise(a, u, new Date()));
      await this.evenement(tx, a.id, `Reprise par ${u.nom}`, u);
      await this.audit(tx, "alerte.prise", numero, u, { statut: a.statut });
    });
    this.flux.emettre({ type: "alertes", numero });
    return this.detail(numero, u);
  }

  // Mode crise : chacun prend la plus urgente parmi la file commune et ce qui lui est attribué.
  async prendreSuivante(u: UtilisateurConnecte, maintenant = new Date()) {
    const candidates = await this.db.alerte.findMany({
      where: { ...principalesOuvertes, accepteeLe: null, OR: [{ attribueeAId: null }, { attribueeAId: u.id }] },
      include: inclusFile,
    });
    for (const a of candidates.sort(parTriage(maintenant))) {
      try {
        return await this.prendre(a.numero, u);
      } catch (e) {
        // Prise ou attribuée au même instant à un autre opérateur : on passe à la suivante.
        if (!(e instanceof ConflictException || e instanceof ForbiddenException)) throw e;
      }
    }
    throw new NotFoundException("Aucune alerte en attente");
  }

  async changerStatut(numero: string, vers: StatutAlerte, issue: string | undefined, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const a = await this.charger(tx, numero, u);
      this.verifierPrincipale(a);
      if (!peutPasser(a.statut, vers)) {
        throw new ConflictException(`Passage impossible : ${LIBELLES_STATUT[a.statut]} → ${LIBELLES_STATUT[vers]}`);
      }
      const finale = !estOuverte(vers);
      if (finale && !issue) throw new BadRequestException("Indiquez l'issue de l'alerte");
      const maintenant = new Date();
      await this.mettreAJour(tx, a, {
        statut: vers,
        ...this.prise(a, u, maintenant),
        // Le délai de prise en charge s'arrête à la première action d'un opérateur.
        priseEnChargeLe: a.priseEnChargeLe ?? maintenant,
        ...(vers === "SUR_PLACE" && { surPlaceLe: maintenant }),
        ...(finale && { clotureLe: maintenant, issue }),
      });
      await this.evenement(tx, a.id, `${LIBELLES_STATUT[vers]}${issue ? ` — ${issue}` : ""}`, u);
      await this.audit(tx, "alerte.statut", numero, u, { de: a.statut, vers, issue });
      if (finale) await this.cloreRattachees(tx, a, vers, issue!, u, maintenant);
    });
    this.flux.emettre({ type: "alertes", numero });
    return this.detail(numero, u);
  }

  async noterRappel(numero: string, rappel: StatutRappel, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const a = await this.charger(tx, numero, u);
      if (!estOuverte(a.statut)) throw new ConflictException("Alerte déjà clôturée");
      await tx.alerte.update({ where: { id: a.id }, data: { rappel } });
      await this.evenement(tx, a.id, LIBELLES_RAPPEL[rappel], u);
      await this.audit(tx, "alerte.rappel", numero, u, { de: a.rappel, vers: rappel });
      await this.alertes.rafraichirFiabilite(tx, a.id);
    });
    this.flux.emettre({ type: "alertes", numero });
    return this.detail(numero, u);
  }

  async ajouterNote(numero: string, texte: string, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const a = await this.charger(tx, numero, u);
      await this.evenement(tx, a.id, texte, u);
    });
    return this.detail(numero, u);
  }

  // Superviseur : vers un opérateur choisi, ou sans cible pour laisser la répartition choisir un autre opérateur.
  async reattribuer(numero: string, operateurId: string | undefined, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const a = await this.charger(tx, numero, u);
      this.verifierPrincipale(a);
      if (!estOuverte(a.statut)) throw new ConflictException("Alerte déjà clôturée");
      const maintenant = new Date();
      if (operateurId) {
        const cible = await tx.utilisateur.findFirst({ where: { id: operateurId, actif: true, role: { in: [...ESPACES.centrale] } } });
        if (!cible) throw new BadRequestException("Opérateur introuvable ou inactif");
        await this.mettreAJour(tx, a, { attribueeAId: cible.id, attribueeLe: maintenant, accepteeLe: null, relanceLe: null });
        await tx.utilisateur.update({ where: { id: cible.id }, data: { derniereAttributionLe: maintenant } });
        await this.evenement(tx, a.id, `Réattribuée à ${cible.nom}`, u);
      } else {
        await this.evenement(tx, a.id, "Remise en répartition", u);
        await this.repartition.attribuer(tx, a.id, maintenant, a.attribueeAId ?? undefined);
      }
      await this.audit(tx, "alerte.reattribution", numero, u, { de: a.attribueeAId, vers: operateurId ?? "automatique" });
    });
    this.flux.emettre({ type: "alertes", numero });
    return this.detail(numero, u);
  }

  // Témoin rattaché à tort (autre incendie, autre agression) : l'alerte redevient indépendante.
  async detacher(numero: string, u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const a = await this.charger(tx, numero, u);
      if (!a.principale) throw new ConflictException("Cette alerte n'est rattachée à aucun incident");
      if (!estOuverte(a.statut)) throw new ConflictException("Alerte déjà clôturée");
      await tx.alerte.update({ where: { id: a.id }, data: { principaleId: null } });
      await this.evenement(tx, a.id, `Détachée de l'incident ${a.principale.numero}`, u);
      await this.evenement(tx, a.principaleId!, `Témoin ${a.numero} détaché : traité comme une alerte distincte`, u);
      await this.audit(tx, "alerte.detachement", numero, u, { incident: a.principale.numero });
      await this.repartition.attribuer(tx, a.id, new Date());
    });
    this.flux.emettre({ type: "alertes", numero });
    return this.detail(numero, u);
  }

  async signeDeVie(u: UtilisateurConnecte) {
    await this.db.utilisateur.update({ where: { id: u.id }, data: { vuLe: new Date() } });
  }

  async changerPresence(u: UtilisateurConnecte, presence: Presence) {
    await this.repartition.changerPresence(u.id, presence);
    await this.db.audit.create({ data: { action: "operateur.presence", cible: u.email, auteurId: u.id, details: { presence } } });
    return this.file(u);
  }

  // ─── Interne ───────────────────────────────────────────────────────────────

  private async equipe(maintenant: Date) {
    const limite = new Date(maintenant.getTime() - REPARTITION.signeDeVieS * 1000);
    const membres = await this.db.utilisateur.findMany({
      where: { actif: true, role: { in: ["OPERATEUR", "SUPERVISEUR"] } },
      select: {
        id: true,
        nom: true,
        role: true,
        presence: true,
        presenceLe: true,
        vuLe: true,
        _count: { select: { alertesAttribuees: { where: principalesOuvertes } } },
      },
      orderBy: { nom: "asc" },
    });
    return membres.map(({ _count, vuLe, ...m }) => ({ ...m, vuLe, enLigne: !!vuLe && vuLe >= limite, charge: _count.alertesAttribuees }));
  }

  // La supervision voit et fait tout. L'opérateur agit sur ce qui lui est attribué et sur la file commune,
  // et relit les alertes qu'il a traitées. Un témoin rattaché suit les droits de son incident.
  private droits(a: AvecPrincipale, u: UtilisateurConnecte) {
    if (aAcces(u.role, "supervision")) return { lire: true, agir: true };
    const attribuee = a.principale ? a.principale.attribueeAId : a.attribueeAId;
    const agir = estOuverte(a.statut) && (attribuee === u.id || attribuee === null);
    return { lire: agir || attribuee === u.id || a.operateurId === u.id, agir };
  }

  private async charger(db: Tx | PrismaService, numero: string, u: UtilisateurConnecte) {
    const a = await db.alerte.findUnique({
      where: { numero },
      include: { principale: { select: { numero: true, attribueeAId: true } }, attribueeA: { select: { nom: true } } },
    });
    if (!a) throw new NotFoundException("Alerte introuvable");
    if (!this.droits(a, u).agir) {
      throw new ForbiddenException(estOuverte(a.statut) ? `Alerte attribuée à ${a.attribueeA?.nom ?? "un autre opérateur"}` : "Alerte déjà clôturée");
    }
    return a;
  }

  private verifierPrincipale(a: AvecPrincipale) {
    if (a.principale) throw new ConflictException(`Témoin rattaché à l'incident ${a.principale.numero} : agissez sur l'alerte principale`);
  }

  // Agir sur une alerte que personne n'a acceptée revient à l'accepter. Un superviseur qui intervient
  // sur une alerte déjà acceptée par un opérateur ne la lui retire pas.
  private prise(a: Alerte, u: UtilisateurConnecte, maintenant: Date) {
    if (a.accepteeLe && a.attribueeAId) return {};
    return {
      attribueeAId: u.id,
      attribueeLe: a.attribueeAId === u.id ? a.attribueeLe : maintenant,
      accepteeLe: maintenant,
      operateurId: u.id,
      relanceLe: null,
    };
  }

  // Deux opérateurs peuvent agir au même instant : la mise à jour n'aboutit que si personne n'est passé avant.
  private async mettreAJour(tx: Tx, a: Alerte, data: Prisma.AlerteUncheckedUpdateManyInput) {
    const { count } = await tx.alerte.updateMany({
      where: { id: a.id, statut: a.statut, attribueeAId: a.attribueeAId, accepteeLe: a.accepteeLe },
      data,
    });
    if (!count) throw new ConflictException("L'alerte vient d'être modifiée par quelqu'un d'autre : rechargez la fiche");
  }

  // L'incident clos, les témoins rattachés le sont aussi.
  private async cloreRattachees(tx: Tx, a: Alerte, vers: StatutAlerte, issue: string, u: UtilisateurConnecte, maintenant: Date) {
    const rattachees = await tx.alerte.findMany({ where: { principaleId: a.id, statut: { in: OUVERTS } }, select: { id: true } });
    if (!rattachees.length) return;
    await tx.alerte.updateMany({
      where: { id: { in: rattachees.map((r) => r.id) } },
      data: { statut: vers, clotureLe: maintenant, issue: `Incident ${a.numero} : ${issue}` },
    });
    await tx.evenementAlerte.createMany({
      data: rattachees.map((r) => ({ alerteId: r.id, nature: "operateur", texte: `${LIBELLES_STATUT[vers]} avec l'incident ${a.numero} — ${issue}`, auteurId: u.id })),
    });
  }

  private resume(a: AlerteFile, maintenant: Date) {
    const q = a.foyer?.quartier;
    return {
      numero: a.numero,
      type: a.type,
      urgence: URGENCES[a.type].bouton,
      priorite: a.priorite,
      statut: a.statut,
      creeLe: a.creeLe,
      clotureLe: a.clotureLe,
      support: { type: a.support.type, libelle: SUPPORTS[a.support.type].libelle, code: a.support.code },
      lieu: q ? `${q.nom}, ${q.ville.nom}` : null,
      position: a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null,
      problemePosition: a.problemePosition,
      scoreFiabilite: a.scoreFiabilite,
      rappel: a.rappel,
      // Tant que personne n'a pris l'alerte, l'escalade se lit à l'horloge.
      niveauEscalade: a.statut === "NOUVELLE" ? niveauEscaladeDu(a.creeLe, maintenant) : a.niveauEscalade,
      redeclenchements: a.redeclenchements,
      abonnementExpire: a.abonnementExpire,
      intervention: a.intervention,
      operateur: a.operateur?.nom ?? null,
      attribueeA: a.attribueeA,
      attribueeLe: a.attribueeLe,
      accepteeLe: a.accepteeLe,
      signaleeLe: a.relanceLe,
      temoinsRattaches: a._count.rattachees,
    };
  }

  private evenement(tx: Tx, alerteId: string, texte: string, u: UtilisateurConnecte) {
    return tx.evenementAlerte.create({ data: { alerteId, nature: "operateur", texte, auteurId: u.id } });
  }

  private audit(tx: Tx, action: string, cible: string, u: UtilisateurConnecte, details: Prisma.InputJsonValue) {
    return tx.audit.create({ data: { action, cible, auteurId: u.id, details } });
  }
}
