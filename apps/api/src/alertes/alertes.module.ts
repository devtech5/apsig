import { Module } from "@nestjs/common";
import { AlertesService } from "./alertes.service.ts";
import { PublicController } from "./public.controller.ts";

@Module({ controllers: [PublicController], providers: [AlertesService], exports: [AlertesService] })
export class AlertesModule {}
