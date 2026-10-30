import { Module } from "@nestjs/common";
import { AbonnementsController } from "./abonnements.controller.ts";
import { AbonnementsService } from "./abonnements.service.ts";

@Module({ controllers: [AbonnementsController], providers: [AbonnementsService] })
export class AbonnementsModule {}
