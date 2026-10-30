import {
  type CanActivate,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Get,
  Global,
  Injectable,
  Module,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IncomingMessage } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { aAcces, ESPACES, LIBELLES_ESPACE, type Espace, type Role } from "@apsig/domain";
import { config } from "../config.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { type Auth, creerAuth } from "./auth.ts";

export type UtilisateurConnecte = { id: string; nom: string; email: string; role: Role; deuxFacteurs: boolean };

const ESPACE_REQUIS = "espaceRequis";
// Espace du back-office exigé par un contrôleur ou une route ; sans lui, tout compte du back-office passe.
export const EspaceRequis = (espace: Espace) => SetMetadata(ESPACE_REQUIS, espace);

const AVANT_DEUX_FACTEURS = "avantDeuxFacteurs";
// Route accessible avant d'avoir activé la double authentification (pour savoir qu'il faut l'activer).
const AvantDeuxFacteurs = () => SetMetadata(AVANT_DEUX_FACTEURS, true);

// Repérée par le back-office, qui envoie alors l'utilisateur sur la page d'activation.
export const DEUX_FACTEURS_REQUIS = "Double authentification à activer avant d'accéder au back-office";

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
    const cibles = [ctx.getHandler(), ctx.getClass()];
    const espace = this.reflector.getAllAndOverride<Espace | undefined>(ESPACE_REQUIS, cibles);
    // Les agents de pose n'ont aucun espace dans le back-office.
    if (!actif || !espacesDe(role).length) throw new ForbiddenException("Accès réservé aux équipes APSIG");
    if (config.deuxFacteursObligatoire && !deuxFacteurs && !this.reflector.getAllAndOverride<boolean>(AVANT_DEUX_FACTEURS, cibles)) {
      throw new ForbiddenException(DEUX_FACTEURS_REQUIS);
    }
    if (espace && !aAcces(role, espace)) throw new ForbiddenException(`Accès réservé à l'espace ${LIBELLES_ESPACE[espace]}`);
    req.utilisateur = { id, nom: name, email, role, deuxFacteurs };
    return true;
  }
}

export const Utilisateur = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ utilisateur: UtilisateurConnecte }>().utilisateur,
);

@Controller("compte")
@UseGuards(BackOfficeGuard)
export class CompteController {
  // Le back-office construit sa navigation à partir des espaces du compte.
  @Get()
  @AvantDeuxFacteurs()
  moi(@Utilisateur() u: UtilisateurConnecte) {
    return { ...u, espaces: espacesDe(u.role), deuxFacteursRequis: config.deuxFacteursObligatoire && !u.deuxFacteurs };
  }
}

@Global()
@Module({ controllers: [CompteController], providers: [AuthService, BackOfficeGuard], exports: [AuthService, BackOfficeGuard] })
export class AuthModule {}
