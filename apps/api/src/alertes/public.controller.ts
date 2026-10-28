import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { z } from "zod";
import { TYPES_URGENCE } from "@apsig/domain";
import { ZodPipe } from "../common/zod.pipe.ts";
import { AlertesService } from "./alertes.service.ts";

const position = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  precisionM: z.number().min(0).max(100_000).optional(),
});

const creation = z.object({
  jeton: z.string().min(6).max(64),
  type: z.enum(TYPES_URGENCE),
  // Identifiant pseudonyme aléatoire généré par la page d'alerte (aucune donnée de l'appareil).
  appareilId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  position: position.optional(),
});

const cle = z.object({ cle: z.string().min(1).max(64) });
const partagePosition = cle.extend({ position });

// Routes publiques, appelées par la page d'alerte sur le téléphone du témoin.
@Controller("public")
export class PublicController {
  constructor(private readonly alertes: AlertesService) {}

  @Get("supports/:jeton")
  support(@Param("jeton") jeton: string) {
    return this.alertes.supportPublic(jeton);
  }

  @Post("alertes")
  @UseGuards(ThrottlerGuard)
  async creer(@Body(new ZodPipe(creation)) body: z.infer<typeof creation>) {
    const { alerte, doublon } = await this.alertes.creer(body);
    return { ...this.alertes.vuePublique(alerte), cleTemoin: alerte.cleTemoin, doublon };
  }

  @Get("alertes/:numero")
  async consulter(@Param("numero") numero: string, @Query("cle") cleTemoin?: string) {
    return this.alertes.vuePublique(await this.alertes.consulter(numero, cleTemoin));
  }

  @Post("alertes/:numero/position")
  @HttpCode(200)
  async position(@Param("numero") numero: string, @Body(new ZodPipe(partagePosition)) body: z.infer<typeof partagePosition>) {
    return this.alertes.vuePublique(await this.alertes.partagerPosition(numero, body.cle, body.position));
  }

  @Post("alertes/:numero/annuler")
  @HttpCode(200)
  async annuler(@Param("numero") numero: string, @Body(new ZodPipe(cle)) body: z.infer<typeof cle>) {
    return this.alertes.vuePublique(await this.alertes.annuler(numero, body.cle));
  }
}
