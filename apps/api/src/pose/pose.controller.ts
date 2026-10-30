import { Body, Controller, Get, GoneException, Injectable, Module, NotFoundException, Param, Post, UnprocessableEntityException, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { estFixe, SUPPORTS } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

// Au-delà, le point ne localise pas la porte : l'agent attend un meilleur signal, dehors.
export const PRECISION_POSE_M = 50;

const pose = z.object({
  position: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), precisionM: z.number().min(0).max(100_000) }),
});

const inclusSupport = { foyer: { include: { quartier: { include: { ville: true } } } }, membre: true, pose: { include: { agent: { select: { nom: true } } } } } as const;

// Pose des supports par un agent : le GPS relevé devant le QR devient l'adresse vérifiée du foyer.
@Injectable()
export class PoseService {
  constructor(private readonly db: PrismaService) {}

  async support(jeton: string) {
    const s = await this.db.support.findUnique({ where: { jeton }, include: inclusSupport });
    if (!s) {
      if (await this.db.jetonRevoque.findUnique({ where: { jeton } })) throw new GoneException("QR remplacé : ne pas le poser, il ne déclenche plus d'alerte");
      throw new NotFoundException("QR inconnu");
    }
    if (s.type === "APPLI") throw new NotFoundException("QR inconnu");
    const f = s.foyer;
    return {
      code: s.code,
      type: s.type,
      libelle: SUPPORTS[s.type].libelle,
      statut: s.statut,
      fixe: estFixe(s.type),
      porteur: s.membre && `${s.membre.prenom} ${s.membre.nom}`,
      foyer: f && {
        libelle: f.libelle,
        adresse: f.adresse,
        quartier: f.quartier.nom,
        ville: f.quartier.ville.nom,
        adresseVerifiee: f.adresseVerifiee,
        position: f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : null,
      },
      pose: s.pose && { le: s.pose.poseLe, agent: s.pose.agent.nom, position: { lat: s.pose.lat, lng: s.pose.lng }, precisionM: s.pose.precisionM },
      precisionRequiseM: PRECISION_POSE_M,
    };
  }

  async poser(jeton: string, position: z.infer<typeof pose>["position"], u: UtilisateurConnecte) {
    await this.db.$transaction(async (tx) => {
      const s = await tx.support.findUnique({ where: { jeton } });
      if (!s || s.type === "APPLI") throw new NotFoundException("QR inconnu");
      if (!s.foyerId) throw new UnprocessableEntityException("Ce QR n'est rattaché à aucun foyer : voir le conseiller avant de le poser");
      if (s.statut === "PERDU" || s.statut === "SUSPENDU") throw new UnprocessableEntityException("Ce QR est suspendu ou déclaré perdu : ne pas le poser");
      const fixe = estFixe(s.type);
      if (fixe && position.precisionM > PRECISION_POSE_M) {
        throw new UnprocessableEntityException(`Position trop imprécise (${Math.round(position.precisionM)} m) : attendez quelques secondes, à l'extérieur`);
      }
      const donnees = { agentId: u.id, lat: position.lat, lng: position.lng, precisionM: position.precisionM, poseLe: new Date() };
      await tx.pose.upsert({ where: { supportId: s.id }, create: { supportId: s.id, ...donnees }, update: donnees });
      if (s.statut === "STOCK") await tx.support.update({ where: { id: s.id }, data: { statut: "ACTIF" } });
      // Support fixe : la porte du foyer est désormais connue au mètre près.
      if (fixe) await tx.foyer.update({ where: { id: s.foyerId }, data: { lat: position.lat, lng: position.lng, adresseVerifiee: true } });
      await tx.audit.create({ data: { action: "support.poser", cible: s.foyerId, auteurId: u.id, details: { supportId: s.id, code: s.code, precisionM: Math.round(position.precisionM) } } });
    });
    return this.support(jeton);
  }

  // Tournée de l'agent : QR fixes actifs pas encore posés.
  async aPoser() {
    const supports = await this.db.support.findMany({
      where: { type: { in: ["PORTAIL", "INTERIEUR"] }, statut: { in: ["ACTIF", "STOCK"] }, pose: null, foyerId: { not: null } },
      include: { foyer: { include: { quartier: { include: { ville: true } } } } },
      orderBy: { creeLe: "asc" },
      take: 100,
    });
    return supports.map((s) => ({
      code: s.code,
      libelle: SUPPORTS[s.type].libelle,
      foyer: s.foyer && { libelle: s.foyer.libelle, adresse: s.foyer.adresse, quartier: s.foyer.quartier.nom, ville: s.foyer.quartier.ville.nom },
    }));
  }
}

@Controller("pose")
@UseGuards(BackOfficeGuard)
@EspaceRequis("pose")
export class PoseController {
  constructor(private readonly service: PoseService) {}

  @Get("a-poser")
  aPoser() {
    return this.service.aPoser();
  }

  @Get("supports/:jeton")
  support(@Param("jeton") jeton: string) {
    return this.service.support(jeton);
  }

  @Post("supports/:jeton")
  poser(@Param("jeton") jeton: string, @Body(new ZodPipe(pose)) body: z.infer<typeof pose>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.poser(jeton, body.position, u);
  }
}

@Module({ controllers: [PoseController], providers: [PoseService] })
export class PoseModule {}
