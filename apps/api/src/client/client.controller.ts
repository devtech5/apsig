import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { z } from "zod";
import { ACTIVATION, PROBLEMES_POSITION, TYPES_URGENCE } from "@apsig/domain";
import { AbonnementsModule } from "../abonnements/abonnements.module.ts";
import { AlertesModule } from "../alertes/alertes.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { Abonne, type AbonneConnecte, ClientGuard } from "./client.guard.ts";
import { ClientService } from "./client.service.ts";

const activation = z.object({
  telephone: z.string().regex(/^\+?[0-9 .-]{8,20}$/, "Numéro de téléphone invalide"),
  code: z.string().trim().regex(new RegExp(`^\\d{${ACTIVATION.chiffres}}$`), `Le code compte ${ACTIVATION.chiffres} chiffres`),
  appareil: z.string().trim().min(1).max(80).optional(),
});

const sos = z.object({
  type: z.enum(TYPES_URGENCE),
  position: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), precisionM: z.number().min(0).max(100_000).optional() }).optional(),
  problemePosition: z.enum(PROBLEMES_POSITION).optional(),
});

// Jeton Expo (« ExponentPushToken[…] ») ; null coupe les notifications.
const notifications = z.object({ jetonPush: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/).nullable() });

// Application mobile des abonnés. L'activation est publique (code remis par APSIG), tout le reste exige le jeton.
@Controller("client")
export class ClientController {
  constructor(private readonly client: ClientService) {}

  @Post("activation")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  activer(@Body(new ZodPipe(activation)) body: z.infer<typeof activation>) {
    return this.client.activer(body);
  }

  @Get("moi")
  @UseGuards(ClientGuard)
  moi(@Abonne() a: AbonneConnecte) {
    return this.client.moi(a);
  }

  @Post("sos")
  @UseGuards(ClientGuard)
  declencher(@Abonne() a: AbonneConnecte, @Body(new ZodPipe(sos)) body: z.infer<typeof sos>) {
    return this.client.sos(a, body);
  }

  @Get("alertes")
  @UseGuards(ClientGuard)
  alertes(@Abonne() a: AbonneConnecte) {
    return this.client.alertesFoyer(a);
  }

  @Get("alertes/:numero")
  @UseGuards(ClientGuard)
  alerte(@Abonne() a: AbonneConnecte, @Param("numero") numero: string) {
    return this.client.alerteFoyer(a, numero);
  }

  @Put("notifications")
  @UseGuards(ClientGuard)
  notifications(@Abonne() a: AbonneConnecte, @Body(new ZodPipe(notifications)) body: z.infer<typeof notifications>) {
    return this.client.notifications(a, body.jetonPush);
  }

  @Delete("session")
  @HttpCode(204)
  @UseGuards(ClientGuard)
  deconnecter(@Abonne() a: AbonneConnecte) {
    return this.client.deconnecter(a);
  }
}

@Module({ imports: [AlertesModule, AbonnementsModule], controllers: [ClientController], providers: [ClientService, ClientGuard] })
export class ClientModule {}
