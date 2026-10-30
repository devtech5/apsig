import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import type { Presence } from "@apsig/db";
import { choisirOperateur, estEnCrise, REPARTITION, scoreTriage, STATUTS_OUVERTS } from "@apsig/domain";
import { FluxService } from "../flux/flux.module.ts";
import { PrismaService, type Tx } from "../prisma/prisma.service.ts";

const OUVERTS = [...STATUTS_OUVERTS];
const avant = (maintenant: Date, secondes: number) => new Date(maintenant.getTime() - secondes * 1000);
// Alertes qui comptent dans la file : les principales ouvertes (les rattachées suivent leur incident).
const principalesOuvertes = { statut: { in: OUVERTS }, principaleId: null };

export type EtatCrise = { actif: boolean; depuis: Date | null };

const evenement = (tx: Tx, alerteId: string, texte: string) => tx.evenementAlerte.create({ data: { alerteId, nature: "systeme", texte } });

@Injectable()
export class RepartitionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger("Répartition");
  private minuterie: NodeJS.Timeout | undefined;
  private crise: EtatCrise = { actif: false, depuis: null };

  constructor(
    private readonly db: PrismaService,
    private readonly flux: FluxService,
  ) {}

  // Les tests appellent tick() eux-mêmes, à l'heure qu'ils choisissent.
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    this.minuterie = setInterval(() => void this.tick().catch((e: unknown) => this.log.error(e)), 5000);
  }

  onModuleDestroy() {
    clearInterval(this.minuterie);
  }

  get etatCrise(): EtatCrise {
    return this.crise;
  }

  // Nouvelle alerte, ou alerte à réattribuer : à l'opérateur disponible le moins chargé, sauf en mode crise
  // (chacun prend alors « la suivante » dans la file triée). Sans opérateur, elle va en file commune.
  async attribuer(tx: Tx, alerteId: string, maintenant = new Date(), exclure?: string) {
    const op = this.crise.actif ? undefined : await this.choisir(tx, maintenant, exclure);
    await tx.alerte.update({
      where: { id: alerteId },
      data: { attribueeAId: op?.id ?? null, attribueeLe: op ? maintenant : null, accepteeLe: null, relanceLe: null },
    });
    if (op) await tx.utilisateur.update({ where: { id: op.id }, data: { derniereAttributionLe: maintenant } });
    await evenement(tx, alerteId, op ? `Attribuée à ${op.nom}` : this.crise.actif ? "Mode crise : alerte en file commune" : "Aucun opérateur disponible : alerte en file commune");
    return op ?? null;
  }

  // Charge de chaque opérateur disponible, pour la répartition et l'écran du superviseur.
  operateursDisponibles(db: Tx | PrismaService, maintenant = new Date()) {
    return db.utilisateur.findMany({
      where: { role: "OPERATEUR", actif: true, presence: "EN_SERVICE", vuLe: { gte: avant(maintenant, REPARTITION.signeDeVieS) } },
      select: { id: true, nom: true, derniereAttributionLe: true, _count: { select: { alertesAttribuees: { where: principalesOuvertes } } } },
    });
  }

  async changerPresence(utilisateurId: string, presence: Presence, maintenant = new Date(), motif?: string) {
    await this.db.$transaction(async (tx) => {
      const u = await tx.utilisateur.update({
        where: { id: utilisateurId },
        data: { presence, presenceLe: maintenant, ...(presence === "EN_SERVICE" && { vuLe: maintenant }) },
      });
      if (presence === "EN_SERVICE") return;
      // En pause, l'opérateur garde ce qu'il a accepté ; hors service, tout repart.
      const alertes = await tx.alerte.findMany({
        where: { ...principalesOuvertes, attribueeAId: u.id, ...(presence === "PAUSE" && { accepteeLe: null }) },
      });
      for (const a of alertes) {
        await evenement(tx, a.id, `${u.nom} ${motif ?? (presence === "PAUSE" ? "en pause" : "hors service")} : alerte réattribuée`);
        await this.attribuer(tx, a.id, maintenant, u.id);
      }
    });
    this.flux.emettre({ type: "alertes" });
  }

  // Exécuté toutes les 5 s : mode crise, absences, délais d'acceptation, file commune, inactivité.
  async tick(maintenant = new Date()) {
    let change = await this.evaluerCrise(maintenant);

    const absents = await this.db.utilisateur.findMany({
      where: { presence: { not: "HORS_SERVICE" }, OR: [{ vuLe: null }, { vuLe: { lt: avant(maintenant, REPARTITION.signeDeVieS) } }] },
      select: { id: true },
    });
    for (const u of absents) {
      await this.changerPresence(u.id, "HORS_SERVICE", maintenant, "sans signe de vie depuis 1 min");
      change = true;
    }

    const nonAcceptees = await this.db.alerte.findMany({
      where: { ...principalesOuvertes, attribueeAId: { not: null }, accepteeLe: null, attribueeLe: { lt: avant(maintenant, REPARTITION.delaiAcceptationS) } },
      include: { attribueeA: { select: { nom: true } } },
    });
    for (const a of nonAcceptees) {
      change = (await this.db.$transaction(async (tx) => {
        const suivant = this.crise.actif ? undefined : await this.choisir(tx, maintenant, a.attribueeAId!);
        // Personne d'autre : l'alerte reste à l'opérateur, et le superviseur est prévenu une fois.
        if (!suivant) {
          if (a.relanceLe) return false;
          await tx.alerte.update({ where: { id: a.id }, data: { relanceLe: maintenant } });
          await evenement(tx, a.id, `Non acceptée par ${a.attribueeA?.nom} et aucun autre opérateur disponible : signalée au superviseur`);
          this.flux.emettre({ type: "relance", numero: a.numero });
          return true;
        }
        await evenement(tx, a.id, `Non acceptée en ${REPARTITION.delaiAcceptationS} s par ${a.attribueeA?.nom}`);
        await this.attribuer(tx, a.id, maintenant, a.attribueeAId!);
        return true;
      })) || change;
    }

    if (!this.crise.actif) {
      const file = await this.db.alerte.findMany({
        where: { ...principalesOuvertes, attribueeAId: null },
        include: { _count: { select: { rattachees: true } } },
      });
      file.sort((x, y) => scoreTriage({ ...y, rattachees: y._count.rattachees }, maintenant) - scoreTriage({ ...x, rattachees: x._count.rattachees }, maintenant));
      for (const a of file) {
        const op = await this.db.$transaction(async (tx) => {
          const choisi = await this.choisir(tx, maintenant);
          return choisi ? this.attribuer(tx, a.id, maintenant) : null;
        });
        if (!op) break;
        change = true;
      }
    }

    const oubliees = await this.db.alerte.findMany({
      where: { ...principalesOuvertes, statut: "PRISE_EN_CHARGE", relanceLe: null, accepteeLe: { lt: avant(maintenant, REPARTITION.inactiviteMin * 60) } },
    });
    for (const a of oubliees) {
      await this.db.$transaction(async (tx) => {
        await tx.alerte.update({ where: { id: a.id }, data: { relanceLe: maintenant } });
        await evenement(tx, a.id, `Aucune progression depuis ${REPARTITION.inactiviteMin} min : signalée au superviseur`);
      });
      this.flux.emettre({ type: "relance", numero: a.numero });
      change = true;
    }

    if (change) this.flux.emettre({ type: "alertes" });
  }

  // File en attente d'un opérateur : en file commune ou attribuée sans être acceptée.
  async etatFile(db: Tx | PrismaService, maintenant = new Date()) {
    const [attente, operateurs] = await Promise.all([
      db.alerte.findMany({ where: { ...principalesOuvertes, statut: "NOUVELLE", accepteeLe: null }, select: { creeLe: true } }),
      this.operateursDisponibles(db, maintenant),
    ]);
    const plusAncienne = attente.reduce<Date | null>((min, a) => (!min || a.creeLe < min ? a.creeLe : min), null);
    return {
      enAttente: attente.length,
      operateursEnService: operateurs.length,
      plusLongueAttenteS: plusAncienne ? Math.round((maintenant.getTime() - plusAncienne.getTime()) / 1000) : 0,
    };
  }

  private async evaluerCrise(maintenant: Date) {
    const etat = await this.etatFile(this.db, maintenant);
    const actif = estEnCrise(etat, this.crise.actif);
    if (actif === this.crise.actif) return false;
    this.crise = { actif, depuis: actif ? maintenant : null };
    const texte = actif
      ? `Mode crise : ${etat.enAttente} alerte(s) en attente pour ${etat.operateursEnService} opérateur(s)`
      : "Fin du mode crise";
    this.log.warn(texte);
    await this.db.audit.create({ data: { action: actif ? "repartition.crise" : "repartition.fin_crise", cible: "centrale", details: etat } });
    this.flux.emettre({ type: "crise" });
    return true;
  }

  private async choisir(tx: Tx, maintenant: Date, exclure?: string) {
    const operateurs = await this.operateursDisponibles(tx, maintenant);
    return choisirOperateur(
      operateurs.filter((o) => o.id !== exclure).map((o) => ({ ...o, charge: o._count.alertesAttribuees })),
    );
  }
}
