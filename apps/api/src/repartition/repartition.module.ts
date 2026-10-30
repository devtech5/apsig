import { Module } from "@nestjs/common";
import { RepartitionService } from "./repartition.service.ts";

@Module({ providers: [RepartitionService], exports: [RepartitionService] })
export class RepartitionModule {}
