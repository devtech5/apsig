import { Body, Controller, Get, GoneException, Injectable, Module, NotFoundException, Param, Post, UnprocessableEntityException, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { estEmailTerrain, estFixe, SUPPORTS, telephoneDeEmail } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

// Au-delà, le point ne localise pas la porte : l'agent attend un meilleur signal, dehors (exigence APSIG : 5 m).
export const PRECISION_POSE_M = 5;

const position = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), precisionM: z.number().min(0).max(100_000) });
const pose = z.object({ position });

// Photo prise par le téléphone, compressée en JPEG avant l'envoi : data URL base64, 3 Mo au plus.
const photo = z
  .string()
  .max(4_200_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Photo illisible : reprenez-la");
// Étape 2 de l'inscription : pose de la plaque, identifiée par son code.
const posePlaque = z.object({
  representant: z.object({ prenom: z.string().trim().min(1).max(60), nom: z.string().trim().min(1).max(60) }),
  position,
  photos: z.object({ plaque: photo, remise: photo }),
});
const decoder = (dataUrl: string) => {
  const [entete, base64] = dataUrl.split(",", 2) as [string, string];
  return { type: entete.slice(5, entete.indexOf(";")), donnees: Buffer.from(base64, "base64") };
};
const normaliser = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

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

  // Plaque cherchée par son code (saisi par l'agent) : client, lieu et état de la pose.
  async plaque(code: string) {
    const s = await this.db.support.findUnique({ where: { code: normaliser(code) } });
    if (!s || s.type !== "PORTAIL") throw new NotFoundException("Aucune plaque ne porte ce code : vérifiez-le");
    const vue = await this.support(s.jeton);
    const titulaire = s.foyerId ? await this.db.membre.findFirst({ where: { foyerId: s.foyerId, role: "TITULAIRE" } }) : null;
    // Le code de la plaque dit qui a recensé le client (commission, suivi de l'équipe).
    const foyer = s.foyerId ? await this.db.foyer.findUnique({ where: { id: s.foyerId }, include: { recensePar: { select: { nom: true, email: true } } } }) : null;
    const r = foyer?.recensePar;
    return {
      ...vue,
      titulaire: titulaire && { prenom: titulaire.prenom, nom: titulaire.nom, telephone: titulaire.telephone },
      recenseur: r && { nom: r.nom, telephone: estEmailTerrain(r.email) ? telephoneDeEmail(r.email) : null },
      recenseLe: foyer?.creeLe ?? null,
    };
  }

  // Conclusion de l'inscription : GPS à 5 m près, personne présente, photos de la plaque posée et de la remise des QR.
  async poserPlaque(code: string, d: z.infer<typeof posePlaque>, u: UtilisateurConnecte) {
    const s = await this.db.support.findUnique({ where: { code: normaliser(code) } });
    if (!s || s.type !== "PORTAIL") throw new NotFoundException("Aucune plaque ne porte ce code : vérifiez-le");
    await this.poser(s.jeton, d.position, u);
    await this.db.$transaction(async (tx) => {
      const p = await tx.pose.update({
        where: { supportId: s.id },
        data: { representantPrenom: d.representant.prenom, representantNom: d.representant.nom },
      });
      for (const [nature, dataUrl] of [["PLAQUE", d.photos.plaque], ["REMISE", d.photos.remise]] as const) {
        const { type, donnees } = decoder(dataUrl);
        await tx.photoPose.upsert({
          where: { poseId_nature: { poseId: p.id, nature } },
          create: { poseId: p.id, nature, type, donnees },
          update: { type, donnees, creeLe: new Date() },
        });
      }
      // Les QR intérieurs sont remis au client à la pose : ils deviennent actifs.
      if (s.foyerId) await tx.support.updateMany({ where: { foyerId: s.foyerId, type: "INTERIEUR", statut: "STOCK" }, data: { statut: "ACTIF" } });
      await tx.audit.create({
        data: { action: "inscription.conclure", cible: s.foyerId ?? s.id, auteurId: u.id, details: { code: s.code, representant: `${d.representant.prenom} ${d.representant.nom}` } },
      });
    });
    return this.plaque(s.code);
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

  @Get("plaques/:code")
  plaque(@Param("code") code: string) {
    return this.service.plaque(code);
  }

  @Post("plaques/:code")
  poserPlaque(@Param("code") code: string, @Body(new ZodPipe(posePlaque)) body: z.infer<typeof posePlaque>, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.poserPlaque(code, body, u);
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
