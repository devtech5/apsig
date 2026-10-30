import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AbonnementsModule } from "./abonnements/abonnements.module.ts";
import { AlertesModule } from "./alertes/alertes.module.ts";
import { AuthModule } from "./auth/auth.module.ts";
import { CentraleModule } from "./centrale/centrale.module.ts";
import { config } from "./config.ts";
import { FluxModule } from "./flux/flux.module.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";
import { SanteController } from "./sante/sante.controller.ts";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.limiteAlertesParMinute }]),
    PrismaModule,
    FluxModule,
    AuthModule,
    AlertesModule,
    CentraleModule,
    AbonnementsModule,
  ],
  controllers: [SanteController],
})
export class AppModule {}
