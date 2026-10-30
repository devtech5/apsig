import { Module } from "@nestjs/common";
import { SupervisionController } from "./supervision.controller.ts";
import { SupervisionService } from "./supervision.service.ts";

@Module({ controllers: [SupervisionController], providers: [SupervisionService] })
export class SupervisionModule {}
