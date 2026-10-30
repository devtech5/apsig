import { Module } from "@nestjs/common";
import { RepartitionModule } from "../repartition/repartition.module.ts";
import { AdministrationController } from "./administration.controller.ts";
import { AdministrationService } from "./administration.service.ts";

@Module({ imports: [RepartitionModule], controllers: [AdministrationController], providers: [AdministrationService] })
export class AdministrationModule {}
