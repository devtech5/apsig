import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.ts";
import { configurerApp } from "./app.setup.ts";
import { config } from "./config.ts";

const app = configurerApp(await NestFactory.create<NestExpressApplication>(AppModule));
app.enableShutdownHooks();
await app.listen(config.port);
// Derrière un proxy (centrale Next, Traefik), les connexions sont réutilisées : l'API doit les garder
// ouvertes plus longtemps que le proxy, sinon une requête part sur une connexion déjà fermée (ECONNRESET).
const serveur = app.getHttpServer();
serveur.keepAliveTimeout = 65_000;
serveur.headersTimeout = 66_000;
Logger.log(`API CODE-SECOURS prête sur http://localhost:${config.port}`, "Démarrage");
