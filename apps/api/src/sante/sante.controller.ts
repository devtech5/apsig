import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.ts";

@Controller("sante")
export class SanteController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  async sante() {
    await this.db.$queryRaw`SELECT 1`;
    return { statut: "ok", base: "ok", heure: new Date().toISOString() };
  }
}
