import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { Prisma } from "@apsig/db";
import { URGENCES, type TypeUrgence } from "@apsig/domain";
import { config } from "../config.ts";
import { PrismaService, type Tx } from "../prisma/prisma.service.ts";

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
const PAR_ENVOI = 100; // limite du service Expo par requête

type Ticket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };
type MembreAvecAcces = { id: string; prenom: string; nom: string; acces: { jetonPush: string | null; revoqueLe: Date | null }[] };

// Notifications de l'application mobile : inscrites dans la table Message (canal PUSH) avec l'alerte,
// puis envoyées par le service Expo une fois la transaction validée. Un échec d'envoi ne bloque jamais l'alerte.
@Injectable()
export class NotificationsService {
  private readonly log = new Logger("Notifications");

  constructor(private readonly db: PrismaService) {}

  // Un message par téléphone du foyer relié à l'application (sauf celui qui a déclenché l'alerte).
  messagesFoyer(membres: MembreAvecAcces[], alerteId: string, texte: string, saufMembreId?: string | null): Prisma.MessageCreateManyInput[] {
    return membres
      .filter((m) => m.id !== saufMembreId)
      .flatMap((m) =>
        m.acces
          .filter((a) => !a.revoqueLe && a.jetonPush)
          .map((a) => ({ alerteId, canal: "PUSH" as const, pilote: "expo", destinataire: a.jetonPush!, nomDestinataire: `Application — ${m.prenom} ${m.nom}`, texte })),
      );
  }

  // Avancement d'une alerte, annoncé à tout le foyer (y compris à l'abonné qui l'a déclenchée).
  async suiviFoyer(tx: Tx, alerteId: string, texte: string) {
    const a = await tx.alerte.findUnique({
      where: { id: alerteId },
      select: { foyer: { select: { membres: { select: { id: true, prenom: true, nom: true, acces: { select: { jetonPush: true, revoqueLe: true } } } } } } },
    });
    const messages = a?.foyer ? this.messagesFoyer(a.foyer.membres, alerteId, texte) : [];
    if (messages.length) await tx.message.createMany({ data: messages });
    return messages.length;
  }

  async envoyerEnFile(alerteId: string) {
    if (!config.push.actif) return;
    try {
      const messages = await this.db.message.findMany({
        where: { alerteId, canal: "PUSH", statut: "EN_FILE" },
        include: { alerte: { select: { numero: true, type: true } } },
        orderBy: { creeLe: "asc" },
      });
      for (let i = 0; i < messages.length; i += PAR_ENVOI) await this.envoyer(messages.slice(i, i + PAR_ENVOI));
    } catch (e) {
      this.log.warn(`Envoi des notifications de l'alerte ${alerteId} impossible : ${(e as Error).message}`);
    }
  }

  private async envoyer(lot: (Prisma.MessageGetPayload<{ include: { alerte: { select: { numero: true; type: true } } } }>)[]) {
    let tickets: Ticket[];
    try {
      const r = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(config.push.jetonAcces && { Authorization: `Bearer ${config.push.jetonAcces}` }) },
        body: JSON.stringify(
          lot.map((m) => ({
            to: m.destinataire,
            title: m.alerte ? `${URGENCES[m.alerte.type as TypeUrgence].bouton} · ${m.alerte.numero}` : "APSIG",
            body: m.texte,
            data: { numero: m.alerte?.numero },
            sound: "default",
            priority: "high",
            channelId: "alertes",
          })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`service Expo : HTTP ${r.status}`);
      tickets = ((await r.json()) as { data: Ticket[] }).data;
    } catch (e) {
      await this.db.message.updateMany({ where: { id: { in: lot.map((m) => m.id) } }, data: { statut: "ECHEC", erreur: (e as Error).message.slice(0, 500) } });
      throw e;
    }
    await Promise.all(
      lot.map(async (m, i) => {
        const t = tickets[i];
        if (t?.status === "ok") return this.db.message.update({ where: { id: m.id }, data: { statut: "ENVOYE", refFournisseur: t.id } });
        await this.db.message.update({ where: { id: m.id }, data: { statut: "ECHEC", erreur: (t?.message ?? "Réponse Expo incomplète").slice(0, 500) } });
        // Application désinstallée ou notifications coupées : le jeton ne servira plus.
        if (t?.details?.error === "DeviceNotRegistered") {
          await this.db.accesClient.updateMany({ where: { jetonPush: m.destinataire }, data: { jetonPush: null } });
          await this.db.utilisateur.updateMany({ where: { jetonPush: m.destinataire }, data: { jetonPush: null } });
        }
      }),
    );
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
