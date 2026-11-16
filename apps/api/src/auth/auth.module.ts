import {
  BadRequestException,
  Body,
  type CanActivate,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Get,
  Global,
  HttpCode,
  Injectable,
  Module,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IncomingMessage } from "node:http";
import { APIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { aAcces, deuxFacteursExige, ESPACES, LIBELLES_ESPACE, MOT_DE_PASSE, type Espace, type Role } from "@apsig/domain";
import { ZodPipe } from "../common/zod.pipe.ts";
import { config } from "../config.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { type Auth, creerAuth } from "./auth.ts";

export type UtilisateurConnecte = { id: string; nom: string; email: string; role: Role; deuxFacteurs: boolean; motDePasseProvisoire: boolean };

const ESPACE_REQUIS = "espaceRequis";
// Espace du back-office exigé par un contrôleur ou une route ; sans lui, tout compte du back-office passe.
export const EspaceRequis = (espace: Espace) => SetMetadata(ESPACE_REQUIS, espace);

const AVANT_DEUX_FACTEURS = "avantDeuxFacteurs";
// Route accessible avant d'avoir activé la double authentification (pour savoir qu'il faut l'activer).
const AvantDeuxFacteurs = () => SetMetadata(AVANT_DEUX_FACTEURS, true);

// Repérée par le back-office, qui envoie alors l'utilisateur sur la page d'activation.
export const DEUX_FACTEURS_REQUIS = "Double authentification à activer avant d'accéder au back-office";

const AVANT_CHANGEMENT = "avantChangementMotDePasse";
// Route accessible avec un mot de passe provisoire (pour savoir qu'il faut le remplacer, et le remplacer).
const AvantChangementMotDePasse = () => SetMetadata(AVANT_CHANGEMENT, true);

// Repérée par le back-office et l'application mobile, qui demandent alors un nouveau mot de passe.
export const MOT_DE_PASSE_A_CHANGER = "Mot de passe provisoire à remplacer avant d'accéder au back-office";

const espacesDe = (role: Role) => (Object.keys(ESPACES) as Espace[]).filter((e) => aAcces(role, e));

@Injectable()
export class AuthService {
  readonly auth: Auth;

  constructor(db: PrismaService) {
    this.auth = creerAuth(db);
  }
}

@Injectable()
export class BackOfficeGuard implements CanActivate {
  constructor(
    private readonly service: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<IncomingMessage & { utilisateur?: UtilisateurConnecte }>();
    const session = await this.service.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new UnauthorizedException("Connexion requise");
    const { id, name, email, actif } = session.user;
    const role = session.user.role as Role;
    const deuxFacteurs = !!session.user.twoFactorEnabled;
    const motDePasseProvisoire = !!session.user.motDePasseProvisoire;
    const cibles = [ctx.getHandler(), ctx.getClass()];
    const espace = this.reflector.getAllAndOverride<Espace | undefined>(ESPACE_REQUIS, cibles);
    // Les agents de pose n'ont aucun espace dans le back-office.
    if (!actif || !espacesDe(role).length) throw new ForbiddenException("Accès réservé aux équipes APSIG");
    // Le mot de passe provisoire se remplace d'abord, puis la double authentification s'active.
    if (motDePasseProvisoire && !this.reflector.getAllAndOverride<boolean>(AVANT_CHANGEMENT, cibles)) throw new ForbiddenException(MOT_DE_PASSE_A_CHANGER);
    if (config.deuxFacteursObligatoire && deuxFacteursExige(role) && !deuxFacteurs && !this.reflector.getAllAndOverride<boolean>(AVANT_DEUX_FACTEURS, cibles)) {
      throw new ForbiddenException(DEUX_FACTEURS_REQUIS);
    }
    if (espace && !aAcces(role, espace)) throw new ForbiddenException(`Accès réservé à l'espace ${LIBELLES_ESPACE[espace]}`);
    req.utilisateur = { id, nom: name, email, role, deuxFacteurs, motDePasseProvisoire };
    return true;
  }
}

export const Utilisateur = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ utilisateur: UtilisateurConnecte }>().utilisateur,
);

const changement = z
  .object({
    actuel: z.string().min(1).max(MOT_DE_PASSE.max),
    nouveau: z.string().min(MOT_DE_PASSE.min, `Nouveau mot de passe : ${MOT_DE_PASSE.min} caractères au moins`).max(MOT_DE_PASSE.max),
  })
  .refine((d) => d.nouveau !== d.actuel, { message: "Choisissez un mot de passe différent du mot de passe provisoire", path: ["nouveau"] });

@Controller("compte")
@UseGuards(BackOfficeGuard)
export class CompteController {
  constructor(
    private readonly service: AuthService,
    private readonly db: PrismaService,
  ) {}

  // Le back-office construit sa navigation à partir des espaces du compte.
  @Get()
  @AvantDeuxFacteurs()
  @AvantChangementMotDePasse()
  moi(@Utilisateur() u: UtilisateurConnecte) {
    return { ...u, espaces: espacesDe(u.role), deuxFacteursRequis: config.deuxFacteursObligatoire && deuxFacteursExige(u.role) && !u.deuxFacteurs };
  }

  // Première connexion (ou après réinitialisation) : l'utilisateur remplace le mot de passe provisoire par le sien.
  // Ouvert à tout compte connecté : changer son mot de passe ne demande pas d'autre droit.
  @Post("mot-de-passe")
  @HttpCode(200)
  @AvantDeuxFacteurs()
  @AvantChangementMotDePasse()
  async changerMotDePasse(@Body(new ZodPipe(changement)) d: z.infer<typeof changement>, @Utilisateur() u: UtilisateurConnecte, @Req() req: IncomingMessage) {
    try {
      await this.service.auth.api.changePassword({ body: { currentPassword: d.actuel, newPassword: d.nouveau }, headers: fromNodeHeaders(req.headers) });
    } catch (e) {
      if (e instanceof APIError) throw new BadRequestException("Mot de passe actuel incorrect");
      throw e;
    }
    await this.db.utilisateur.update({ where: { id: u.id }, data: { motDePasseProvisoire: false } });
    await this.db.audit.create({ data: { action: "compte.mot_de_passe", cible: u.email, auteurId: u.id, details: { provisoire: u.motDePasseProvisoire } } });
    return { motDePasseProvisoire: false };
  }
}

@Global()
@Module({ controllers: [CompteController], providers: [AuthService, BackOfficeGuard], exports: [AuthService, BackOfficeGuard] })
export class AuthModule {}
