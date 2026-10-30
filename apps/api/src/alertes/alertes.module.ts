import { Module } from "@nestjs/common";
import { RepartitionModule } from "../repartition/repartition.module.ts";
import { AlertesService } from "./alertes.service.ts";
import { PublicController } from "./public.controller.ts";

@Module({ imports: [RepartitionModule], controllers: [PublicController], providers: [AlertesService], exports: [AlertesService] })
export class AlertesModule {}
