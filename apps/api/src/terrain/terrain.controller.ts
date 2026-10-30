import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@apsig/db";
import { ETAPES_MISSION, estOuverte, LIBELLES_TYPE_UNITE, peutPasser, STATUTS_OUVERTS, SUPPORTS, URGENCES, type EtapeMission, type StatutAlerte } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { FluxService } from "../flux/flux.module.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { PrismaService, type Tx } from "../prisma/prisma.service.ts";

const OUVERTS = [...STATUTS_OUVERTS];

const inclusMission = {
  support: { include: { membre: true } },
  foyer: { include: { quartier: { include: { ville: true } } } },
  evenements: { orderBy: { le: "desc" }, take: 8 },
} satisfies Prisma.AlerteInclude;
type Mission = Prisma.AlerteGetPayload<{ include: typeof inclusMission }>;

const SUIVI: Record<"EN_ROUTE" | "SUR_PLACE", string> = { EN_ROUTE: "Les secours sont en route.", SUR_PLACE: "Les secours sont sur place." };
const TEXTE_ETAPE: Record<EtapeMission, string> = { EN_ROUTE: "en route", SUR_PLACE: "sur place", TERMINEE: "mission terminée, la centrale peut clôturer" };

const position = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), precisionM: z.number().min(0).max(100_000).optional() });
const etape = z.object({ etape: z.enum(ETAPES_MISSION) });
const disponibilite = z.object({ statut: z.enum(["DISPONIBLE", "HORS_SERVICE"]) });
const notifications = z.object({ jetonPush: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/).nullable() });

// Application des unités terrain : missions engagées par la centrale, étapes, position en direct.
@Injectable()
export class TerrainService {
  constructor(
    private readonly db: PrismaService,
    private readonly flux: FluxService,
    private readonly notifications: NotificationsService,
  ) {}

  async moi(u: UtilisateurConnecte) {
    const unite = await this.unite(this.db, u);
    if (!unite) return { unite: null, missions: [] };
    const missions = await this.db.alerte.findMany({
      where: { uniteId: unite.id, statut: { in: OUVERTS }, missionTermineeLe: null },
      include: inclusMission,
      orderBy: { uniteEngageeLe: "desc" },
    });
    return {
      unite: { id: unite.id, nom: unite.nom, type: unite.type, libelleType: LIBELLES_TYPE_UNITE[unite.type], statut: unite.statut },
      missions: missions.map((m) => this.vue(m)),
    };
  }

  async mission(u: UtilisateurConnecte, numero: string) {
    return this.vue(await this.chargerMission(this.db, u, numero));
  }

  async etape(u: UtilisateurConnecte, numero: string, etape: EtapeMission) {
    const id = await this.db.$transaction(async (tx) => {
      const a = await this.chargerMission(tx, u, numero);
      if (!estOuverte(a.statut) || a.missionTermineeLe) throw new ConflictException("Mission terminée ou alerte déjà clôturée");
      const unite = (await this.unite(tx, u))!;
      const maintenant = new Date();
      if (etape === "TERMINEE") {
        await tx.alerte.update({ where: { id: a.id }, data: { missionTermineeLe: maintenant } });
        await tx.unite.update({ where: { id: unite.id }, data: { statut: "DISPONIBLE" } });
      } else if (peutPasser(a.statut, etape)) {
        // L'unité fait avancer l'alerte ; si la centrale l'a déjà fait, seule l'information est notée.
        await tx.alerte.update({
          where: { id: a.id },
          data: { statut: etape, priseEnChargeLe: a.priseEnChargeLe ?? maintenant, ...(etape === "SUR_PLACE" && { surPlaceLe: maintenant }) },
        });
        await this.notifications.suiviFoyer(tx, a.id, SUIVI[etape]);
      }
      await tx.evenementAlerte.create({ data: { alerteId: a.id, nature: "unite", texte: `Unité ${unite.nom} : ${TEXTE_ETAPE[etape]}`, auteurId: u.id } });
      await tx.audit.create({ data: { action: "terrain.etape", cible: numero, auteurId: u.id, details: { etape, uniteId: unite.id } } });
      return a.id;
    });
    this.flux.emettre({ type: "alertes", numero });
    void this.notifications.envoyerEnFile(id);
    return this.mission(u, numero);
  }

  async position(u: UtilisateurConnecte, p: z.infer<typeof position>) {
    const unite = await this.uniteRequise(u);
    await this.db.unite.update({ where: { id: unite.id }, data: { lat: p.lat, lng: p.lng, gpsLe: new Date() } });
    this.flux.emettre({ type: "unites" });
  }

  async disponibilite(u: UtilisateurConnecte, statut: "DISPONIBLE" | "HORS_SERVICE") {
    const unite = await this.uniteRequise(u);
    const enCours = await this.db.alerte.count({ where: { uniteId: unite.id, statut: { in: OUVERTS }, missionTermineeLe: null } });
    if (statut === "HORS_SERVICE" && enCours) throw new ConflictException("Terminez d'abord la mission en cours");
    await this.db.unite.update({ where: { id: unite.id }, data: { statut: enCours ? "EN_MISSION" : statut } });
    await this.db.audit.create({ data: { action: "terrain.disponibilite", cible: unite.nom, auteurId: u.id, details: { statut } } });
    this.flux.emettre({ type: "unites" });
    return this.moi(u);
  }

  async enregistrerJetonPush(u: UtilisateurConnecte, jetonPush: string | null) {
    if (jetonPush) await this.db.utilisateur.updateMany({ where: { jetonPush, id: { not: u.id } }, data: { jetonPush: null } });
    await this.db.utilisateur.update({ where: { id: u.id }, data: { jetonPush } });
    return { notifications: !!jetonPush };
  }

  private async unite(db: Tx | PrismaService, u: UtilisateurConnecte) {
    return (await db.utilisateur.findUniqueOrThrow({ where: { id: u.id }, include: { unite: true } })).unite;
  }

  private async uniteRequise(u: UtilisateurConnecte) {
    const unite = await this.unite(this.db, u);
    if (!unite) throw new ForbiddenException("Vous n'êtes rattaché à aucune unité : voyez votre administrateur");
    return unite;
  }

  private async chargerMission(db: Tx | PrismaService, u: UtilisateurConnecte, numero: string) {
    const [unite, a] = await Promise.all([this.unite(db, u), db.alerte.findUnique({ where: { numero }, include: inclusMission })]);
    if (!a) throw new NotFoundException("Mission introuvable");
    if (!unite || a.uniteId !== unite.id) throw new ForbiddenException("Cette mission n'est pas confiée à votre unité");
    return a;
  }

  // Ce dont l'unité a besoin pour intervenir. Les données de santé restent à la centrale, qui les transmet par téléphone.
  private vue(a: Mission) {
    const f = a.foyer;
    return {
      numero: a.numero,
      type: a.type,
      urgence: URGENCES[a.type].bouton,
      priorite: a.priorite,
      statut: a.statut as StatutAlerte,
      creeLe: a.creeLe,
      engageeLe: a.uniteEngageeLe,
      termineeLe: a.missionTermineeLe,
      support: { libelle: SUPPORTS[a.support.type].libelle, code: a.support.code },
      lieu: f ? { libelle: f.libelle, adresse: f.adresse, quartier: f.quartier.nom, ville: f.quartier.ville.nom, adresseVerifiee: f.adresseVerifiee } : null,
      position: a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null,
      temoin: {
        telephone: a.temoinTelephone,
        position: a.temoinLat != null && a.temoinLng != null ? { lat: a.temoinLat, lng: a.temoinLng, le: a.temoinPositionLe } : null,
      },
      personne: a.support.membre && { prenom: a.support.membre.prenom, nom: a.support.membre.nom, anneeNaissance: a.support.membre.anneeNaissance },
      journal: a.evenements.map((e) => ({ le: e.le, texte: e.texte })),
    };
  }
}

@Controller("terrain")
@UseGuards(BackOfficeGuard)
@EspaceRequis("terrain")
export class TerrainController {
  constructor(private readonly service: TerrainService) {}

  @Get()
  moi(@Utilisateur() u: UtilisateurConnecte) {
    return this.service.moi(u);
  }

  @Get("missions/:numero")
  mission(@Utilisateur() u: UtilisateurConnecte, @Param("numero") numero: string) {
    return this.service.mission(u, numero);
  }

  @Post("missions/:numero/etape")
  @HttpCode(200)
  etape(@Utilisateur() u: UtilisateurConnecte, @Param("numero") numero: string, @Body(new ZodPipe(etape)) body: z.infer<typeof etape>) {
    return this.service.etape(u, numero, body.etape);
  }

  @Post("position")
  @HttpCode(204)
  position(@Utilisateur() u: UtilisateurConnecte, @Body(new ZodPipe(position)) body: z.infer<typeof position>) {
    return this.service.position(u, body);
  }

  @Post("disponibilite")
  @HttpCode(200)
  disponibilite(@Utilisateur() u: UtilisateurConnecte, @Body(new ZodPipe(disponibilite)) body: z.infer<typeof disponibilite>) {
    return this.service.disponibilite(u, body.statut);
  }

  @Put("notifications")
  notifications(@Utilisateur() u: UtilisateurConnecte, @Body(new ZodPipe(notifications)) body: z.infer<typeof notifications>) {
    return this.service.enregistrerJetonPush(u, body.jetonPush);
  }
}

@Module({ controllers: [TerrainController], providers: [TerrainService] })
export class TerrainModule {}
