import { Body, Controller, Get, Header, HttpCode, type MessageEvent, Param, Post, Sse, UseGuards } from "@nestjs/common";
import { interval, map, merge, type Observable, startWith, tap } from "rxjs";
import { z } from "zod";
import { STATUTS_ALERTE, STATUTS_RAPPEL } from "@apsig/domain";
import { BackOfficeGuard, EspaceRequis, Utilisateur, type UtilisateurConnecte } from "../auth/auth.module.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { FluxService } from "../flux/flux.module.ts";
import { CentraleService } from "./centrale.service.ts";

// Assez court pour garder la connexion ouverte à travers les proxys, et servir de signe de vie (60 s).
const BATTEMENT_MS = 25_000;

const statut = z.object({ statut: z.enum(STATUTS_ALERTE), issue: z.string().trim().min(1).max(500).optional() });
const rappel = z.object({ rappel: z.enum(STATUTS_RAPPEL) });
const note = z.object({ texte: z.string().trim().min(1).max(1000) });
const reattribution = z.object({ operateurId: z.string().min(1).optional() });
const presence = z.object({ presence: z.enum(["EN_SERVICE", "PAUSE", "HORS_SERVICE"]) });

// Routes de la centrale, réservées aux opérateurs connectés (cookie de session Better Auth).
@Controller("centrale")
@UseGuards(BackOfficeGuard)
@EspaceRequis("centrale")
export class CentraleController {
  constructor(
    private readonly centrale: CentraleService,
    private readonly flux: FluxService,
  ) {}

  // Flux d'événements (SSE) : la centrale relit sa file à chaque événement au lieu de l'interroger sans cesse.
  @Sse("flux")
  @Header("X-Accel-Buffering", "no")
  evenements(@Utilisateur() u: UtilisateurConnecte): Observable<MessageEvent> {
    const battements = interval(BATTEMENT_MS).pipe(
      startWith(0),
      tap(() => void this.centrale.signeDeVie(u).catch(() => undefined)),
      map(() => ({ data: { type: "battement" } })),
    );
    return merge(this.flux.evenements$.pipe(map((e) => ({ data: e }))), battements);
  }

  @Get("alertes")
  file(@Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.file(u);
  }

  @Post("alertes/suivante")
  @HttpCode(200)
  prendreSuivante(@Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.prendreSuivante(u);
  }

  @Get("alertes/:numero")
  detail(@Param("numero") numero: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.detail(numero, u);
  }

  @Post("alertes/:numero/prendre")
  @HttpCode(200)
  prendre(@Param("numero") numero: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.prendre(numero, u);
  }

  @Post("alertes/:numero/statut")
  @HttpCode(200)
  changerStatut(@Param("numero") numero: string, @Body(new ZodPipe(statut)) body: z.infer<typeof statut>, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.changerStatut(numero, body.statut, body.issue, u);
  }

  @Post("alertes/:numero/rappel")
  @HttpCode(200)
  noterRappel(@Param("numero") numero: string, @Body(new ZodPipe(rappel)) body: z.infer<typeof rappel>, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.noterRappel(numero, body.rappel, u);
  }

  @Post("alertes/:numero/notes")
  @HttpCode(200)
  ajouterNote(@Param("numero") numero: string, @Body(new ZodPipe(note)) body: z.infer<typeof note>, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.ajouterNote(numero, body.texte, u);
  }

  @Post("alertes/:numero/reattribuer")
  @HttpCode(200)
  @EspaceRequis("supervision")
  reattribuer(@Param("numero") numero: string, @Body(new ZodPipe(reattribution)) body: z.infer<typeof reattribution>, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.reattribuer(numero, body.operateurId, u);
  }

  @Post("alertes/:numero/detacher")
  @HttpCode(200)
  detacher(@Param("numero") numero: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.detacher(numero, u);
  }

  @Post("presence")
  @HttpCode(200)
  changerPresence(@Body(new ZodPipe(presence)) body: z.infer<typeof presence>, @Utilisateur() u: UtilisateurConnecte) {
    return this.centrale.changerPresence(u, body.presence);
  }
}
