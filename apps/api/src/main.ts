import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.ts";
import { config } from "./config.ts";

const app = await NestFactory.create<NestExpressApplication>(AppModule);
if (config.trustProxy) app.set("trust proxy", 1);
app.enableCors({ origin: config.corsOrigins });
app.enableShutdownHooks();
await app.listen(config.port);
Logger.log(`API CODE-SECOURS prête sur http://localhost:${config.port}`, "Démarrage");
