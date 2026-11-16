import { Injectable } from "@nestjs/common";
import { FORFAIT_UNIQUE } from "@apsig/domain";
import { PrismaService } from "../prisma/prisma.service.ts";

// Tableau de bord du QG (base.apsig.online) : chiffres du mois, encaissements des six derniers mois,
// points à surveiller, derniers encaissements et activité de l'équipe terrain. Heures en UTC (Abidjan).

const JOUR = 86_400_000;
const NB_MOIS = 6;
// Acompte ou rien encaissé depuis plus de 30 jours : le client est à relancer.
const SOLDE_ANCIEN_JOURS = 30;
// Abonnement qui se termine dans les 30 jours : renouvellement à préparer.
const EXPIRATION_PROCHE_JOURS = 30;
// Plaque recensée mais pas posée au bout de 7 jours : pose en retard.
const POSE_EN_RETARD_JOURS = 7;
const MAX_ELEMENTS = 8;
const NB_ENCAISSEMENTS = 6;
const NB_TERRAIN = 6;

const debutMois = (d: Date, decalage = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + decalage, 1));
const debutJour = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const joursEntre = (avant: Date, apres: Date) => Math.floor((apres.getTime() - avant.getTime()) / JOUR);
const somme = (montants: number[]) => montants.reduce((t, m) => t + m, 0);

type Titulaire = { prenom: string; nom: string } | undefined;
const nomClient = (t: Titulaire, libelle: string) => (t ? `${t.prenom} ${t.nom}` : libelle);

export type ElementASurveiller = { nature: "solde" | "expiration" | "pose"; foyerId: string; client: string; detail: string };

// Chaque nature a sa part de la liste (les plus anciens d'abord), les places libres reviennent aux autres.
function repartir(listes: ElementASurveiller[][]) {
  const part = Math.ceil(MAX_ELEMENTS / listes.length);
  const premiers = listes.flatMap((l) => l.slice(0, part));
  const suivants = listes.flatMap((l) => l.slice(part));
  return [...premiers, ...suivants].slice(0, MAX_ELEMENTS);
}

@Injectable()
export class TableauDeBordService {
  constructor(private readonly db: PrismaService) {}

  async tableau() {
    const maintenant = new Date();
    const mois = debutMois(maintenant);
    const [paiements, abonnements, nonSoldes, aPoser, posesMois, recensesMois, derniers, terrain] = await Promise.all([
      this.paiementsDepuis(debutMois(maintenant, 1 - NB_MOIS)),
      this.abonnementsEnCours(maintenant),
      this.clientsNonSoldes(),
      this.plaquesAPoser(),
      this.db.pose.count({ where: { poseLe: { gte: mois }, support: { type: "PORTAIL" } } }),
      this.db.foyer.count({ where: { recenseParId: { not: null }, creeLe: { gte: mois } } }),
      this.derniersEncaissements(),
      this.equipeTerrain(mois),
    ]);

    const encaisseDepuis = (debut: Date) => somme(paiements.filter((p) => p.le >= debut).map((p) => p.montantFcfa));
    const soldesAnciens = nonSoldes.filter((f) => joursEntre(f.creeLe, maintenant) > SOLDE_ANCIEN_JOURS);
    const limiteExpiration = new Date(maintenant.getTime() + EXPIRATION_PROCHE_JOURS * JOUR);
    const expirent = abonnements.filter((a) => a.fin <= limiteExpiration);
    const limitePose = new Date(maintenant.getTime() - POSE_EN_RETARD_JOURS * JOUR);
    const posesEnRetard = aPoser.filter((s) => s.creeLe < limitePose);

    const elements = repartir([
      soldesAnciens.map((f) => ({
        nature: "solde" as const,
        foyerId: f.id,
        client: f.client,
        detail: `${f.resteFcfa.toLocaleString("fr-FR")} F à encaisser depuis ${joursEntre(f.creeLe, maintenant)} j`,
      })),
      expirent.map((a) => ({
        nature: "expiration" as const,
        foyerId: a.foyerId,
        client: a.client,
        detail: `Abonnement terminé dans ${Math.max(0, Math.ceil((a.fin.getTime() - maintenant.getTime()) / JOUR))} j`,
      })),
      posesEnRetard.map((s) => ({
        nature: "pose" as const,
        foyerId: s.foyerId,
        client: s.client,
        detail: `Plaque ${s.code} à poser depuis ${joursEntre(s.creeLe, maintenant)} j`,
      })),
    ]);

    return {
      indicateurs: {
        encaisseMoisFcfa: encaisseDepuis(mois),
        encaisseJourFcfa: encaisseDepuis(debutJour(maintenant)),
        abonnesActifs: abonnements.length,
        nouveauxAbonnesMois: abonnements.filter((a) => a.debut >= mois).length,
        clientsNonSoldes: nonSoldes.length,
        resteAEncaisserFcfa: somme(nonSoldes.map((f) => f.resteFcfa)),
        mensualitesFcfa: somme(abonnements.map((a) => a.mensualiteFcfa)),
        recensesMois,
        posesMois,
        aPoser: aPoser.length,
        aPoserDepuis7j: posesEnRetard.length,
      },
      parMois: Array.from({ length: NB_MOIS }, (_, i) => {
        const debut = debutMois(maintenant, i + 1 - NB_MOIS);
        const fin = debutMois(maintenant, i + 2 - NB_MOIS);
        const duMois = paiements.filter((p) => p.le >= debut && p.le < fin);
        return {
          mois: debut.toISOString().slice(0, 7),
          abonnementsFcfa: somme(duMois.filter((p) => !p.acompte).map((p) => p.montantFcfa)),
          acomptesFcfa: somme(duMois.filter((p) => p.acompte).map((p) => p.montantFcfa)),
        };
      }),
      aSurveiller: { acomptesAnciens: soldesAnciens.length, expirentBientot: expirent.length, posesEnRetard: posesEnRetard.length, elements },
      derniersEncaissements: derniers,
      terrain,
    };
  }

  // Paiements réussis : un paiement sans abonnement rattaché est un acompte versé au recensement.
  private async paiementsDepuis(depuis: Date) {
    const lignes = await this.db.paiement.findMany({
      where: { statut: "REUSSI", payeLe: { gte: depuis } },
      select: { montantFcfa: true, payeLe: true, abonnementId: true },
    });
    return lignes.map((p) => ({ montantFcfa: p.montantFcfa, le: p.payeLe!, acompte: p.abonnementId == null }));
  }

  private async abonnementsEnCours(maintenant: Date) {
    const lignes = await this.db.abonnement.findMany({
      where: { statut: { in: ["ACTIF", "ESSAI"] }, fin: { gt: maintenant } },
      orderBy: { fin: "asc" },
      select: {
        foyerId: true,
        debut: true,
        fin: true,
        formule: { select: { prixMensuelFcfa: true } },
        foyer: { select: { libelle: true, membres: { where: { role: "TITULAIRE" }, take: 1, select: { prenom: true, nom: true } } } },
      },
    });
    return lignes.map((a) => ({
      foyerId: a.foyerId,
      debut: a.debut,
      fin: a.fin,
      mensualiteFcfa: a.formule.prixMensuelFcfa ?? 0,
      client: nomClient(a.foyer.membres[0], a.foyer.libelle),
    }));
  }

  // Clients recensés qui n'ont pas encore soldé l'abonnement (acompte versé ou rien encaissé).
  private async clientsNonSoldes() {
    const foyers = await this.db.foyer.findMany({
      where: { abonnements: { none: {} }, recenseParId: { not: null } },
      orderBy: { creeLe: "asc" },
      select: {
        id: true,
        libelle: true,
        creeLe: true,
        membres: { where: { role: "TITULAIRE" }, take: 1, select: { prenom: true, nom: true } },
        paiements: { where: { statut: "REUSSI" }, select: { montantFcfa: true } },
      },
    });
    return foyers.map((f) => ({
      id: f.id,
      creeLe: f.creeLe,
      client: nomClient(f.membres[0], f.libelle),
      resteFcfa: Math.max(0, FORFAIT_UNIQUE.abonnementFcfa - somme(f.paiements.map((p) => p.montantFcfa))),
    }));
  }

  private async plaquesAPoser() {
    const supports = await this.db.support.findMany({
      where: { type: "PORTAIL", statut: { in: ["ACTIF", "STOCK"] }, pose: null, foyerId: { not: null } },
      orderBy: { creeLe: "asc" },
      select: {
        code: true,
        creeLe: true,
        foyerId: true,
        foyer: { select: { libelle: true, membres: { where: { role: "TITULAIRE" }, take: 1, select: { prenom: true, nom: true } } } },
      },
    });
    return supports.map((s) => ({ code: s.code, creeLe: s.creeLe, foyerId: s.foyerId!, client: nomClient(s.foyer?.membres[0], s.foyer?.libelle ?? s.code) }));
  }

  private async derniersEncaissements() {
    const lignes = await this.db.paiement.findMany({
      where: { statut: "REUSSI" },
      orderBy: [{ payeLe: "desc" }, { creeLe: "desc" }],
      take: NB_ENCAISSEMENTS,
      select: { id: true, payeLe: true, creeLe: true, montantFcfa: true, operateur: true, abonnementId: true, foyer: { select: { id: true, libelle: true } } },
    });
    return lignes.map((p) => ({
      id: p.id,
      le: p.payeLe ?? p.creeLe,
      montantFcfa: p.montantFcfa,
      operateur: p.operateur,
      foyer: p.foyer,
      nature: p.abonnementId ? ("abonnement" as const) : ("acompte" as const),
    }));
  }

  // Recensements et poses du mois par membre actif de l'équipe terrain, les plus actifs d'abord.
  private async equipeTerrain(mois: Date) {
    const membres = await this.db.utilisateur.findMany({
      where: { actif: true, role: { in: ["RECENSEUR", "CHEF_EQUIPE", "AGENT"] } },
      select: { id: true, nom: true, role: true },
    });
    const ids = membres.map((m) => m.id);
    const [recenses, poses] = await Promise.all([
      this.db.foyer.groupBy({ by: ["recenseParId"], where: { recenseParId: { in: ids }, creeLe: { gte: mois } }, _count: true }),
      this.db.pose.groupBy({ by: ["agentId"], where: { agentId: { in: ids }, poseLe: { gte: mois }, support: { type: "PORTAIL" } }, _count: true }),
    ]);
    const nbRecenses = new Map(recenses.map((r) => [r.recenseParId, r._count]));
    const nbPoses = new Map(poses.map((p) => [p.agentId, p._count]));
    return membres
      .map((m) => ({ ...m, recensesMois: nbRecenses.get(m.id) ?? 0, posesMois: nbPoses.get(m.id) ?? 0 }))
      .filter((m) => m.recensesMois + m.posesMois > 0)
      .sort((a, b) => b.recensesMois + b.posesMois - (a.recensesMois + a.posesMois))
      .slice(0, NB_TERRAIN);
  }
}
