import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { empreinte } from "../abonnements/abonnements.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

export type AbonneConnecte = { accesId: string; membreId: string; foyerId: string; prenom: string; nom: string; telephone: string | null };

// Signe de vie noté au plus toutes les 5 minutes (le back-office affiche « vu le … »).
const VU_MS = 5 * 60_000;

// Application mobile d'un abonné : jeton porté en « Authorization: Bearer », remis à l'activation.
@Injectable()
export class ClientGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<IncomingMessage & { abonne?: AbonneConnecte }>();
    const jeton = /^Bearer ([A-Za-z0-9]{20,128})$/.exec(req.headers.authorization ?? "")?.[1];
    const acces = jeton ? await this.db.accesClient.findUnique({ where: { jetonHash: empreinte(jeton) }, include: { membre: true } }) : null;
    if (!acces || acces.revoqueLe) throw new UnauthorizedException("Application déconnectée : demandez un nouveau code à APSIG");
    const maintenant = new Date();
    if (!acces.vuLe || maintenant.getTime() - acces.vuLe.getTime() > VU_MS) {
      await this.db.accesClient.update({ where: { id: acces.id }, data: { vuLe: maintenant } });
    }
    const { membre } = acces;
    req.abonne = { accesId: acces.id, membreId: membre.id, foyerId: membre.foyerId, prenom: membre.prenom, nom: membre.nom, telephone: membre.telephone };
    return true;
  }
}

export const Abonne = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ abonne: AbonneConnecte }>().abonne);
