import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AbonnementsModule } from "./abonnements/abonnements.module.ts";
import { AdministrationModule } from "./administration/administration.module.ts";
import { AlertesModule } from "./alertes/alertes.module.ts";
import { AuthModule } from "./auth/auth.module.ts";
import { CentraleModule } from "./centrale/centrale.module.ts";
import { ClientModule } from "./client/client.controller.ts";
import { config } from "./config.ts";
import { InscriptionsModule } from "./inscriptions/inscriptions.controller.ts";
import { FluxModule } from "./flux/flux.module.ts";
import { NotificationsModule } from "./notifications/notifications.service.ts";
import { PoseModule } from "./pose/pose.controller.ts";
import { RecensementModule } from "./recensement/recensement.controller.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";
import { SanteController } from "./sante/sante.controller.ts";
import { SupervisionModule } from "./supervision/supervision.module.ts";
import { TerrainModule } from "./terrain/terrain.controller.ts";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.limiteAlertesParMinute }]),
    PrismaModule,
    FluxModule,
    NotificationsModule,
    AuthModule,
    AlertesModule,
    InscriptionsModule,
    CentraleModule,
    AbonnementsModule,
    SupervisionModule,
    AdministrationModule,
    ClientModule,
    PoseModule,
    RecensementModule,
    TerrainModule,
  ],
  controllers: [SanteController],
})
export class AppModule {}
