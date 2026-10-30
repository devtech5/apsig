import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { STATUTS_ALERTE, TYPES_URGENCE } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { SupervisionService } from "./supervision.service.ts";

const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ").optional();
const periode = z.object({ du: jour, au: jour });
const filtres = periode.extend({
  type: z.enum(TYPES_URGENCE).optional(),
  statut: z.enum(STATUTS_ALERTE).optional(),
  operateurId: z.string().min(1).optional(),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

@Controller("supervision")
@UseGuards(BackOfficeGuard)
@EspaceRequis("supervision")
export class SupervisionController {
  constructor(private readonly supervision: SupervisionService) {}

  @Get("historique")
  historique(@Query(new ZodPipe(filtres)) f: z.infer<typeof filtres>) {
    return this.supervision.historique(f, f.page);
  }

  @Get("statistiques")
  statistiques(@Query(new ZodPipe(periode)) p: z.infer<typeof periode>) {
    return this.supervision.statistiques(p.du, p.au);
  }

  @Get("operateurs")
  operateurs() {
    return this.supervision.operateurs();
  }
}
