import { Global, Injectable, Module } from "@nestjs/common";
import { Subject } from "rxjs";

// « alertes » : la file a changé ; « crise » : entrée ou sortie du mode crise ;
// « relance » : alerte signalée au superviseur ; « unites » : une unité terrain a bougé ou changé de statut.
// La centrale relit sa file à chaque événement.
export type EvenementFlux = { type: "alertes" | "crise" | "relance" | "unites"; numero?: string };

// Bus en mémoire (une seule instance d'API) ; à remplacer par Redis pub/sub en cas de mise à l'échelle.
@Injectable()
export class FluxService {
  private readonly sujet = new Subject<EvenementFlux>();
  readonly evenements$ = this.sujet.asObservable();

  emettre(e: EvenementFlux) {
    this.sujet.next(e);
  }
}

@Global()
@Module({ providers: [FluxService], exports: [FluxService] })
export class FluxModule {}
