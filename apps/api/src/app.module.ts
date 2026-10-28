import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AlertesModule } from "./alertes/alertes.module.ts";
import { config } from "./config.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";
import { SanteController } from "./sante/sante.controller.ts";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.limiteAlertesParMinute }]),
    PrismaModule,
    AlertesModule,
  ],
  controllers: [SanteController],
})
export class AppModule {}
