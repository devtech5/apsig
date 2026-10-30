import { Module } from "@nestjs/common";
import { AlertesModule } from "../alertes/alertes.module.ts";
import { RepartitionModule } from "../repartition/repartition.module.ts";
import { CentraleController } from "./centrale.controller.ts";
import { CentraleService } from "./centrale.service.ts";

@Module({ imports: [AlertesModule, RepartitionModule], controllers: [CentraleController], providers: [CentraleService] })
export class CentraleModule {}
