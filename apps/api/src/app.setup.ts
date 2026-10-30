import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import { AuthService } from "./auth/auth.module.ts";
import { config } from "./config.ts";

// Commun au serveur et aux tests, à appeler avant app.init() / app.listen().
export function configurerApp(app: NestExpressApplication) {
  if (config.trustProxy) app.set("trust proxy", 1);
  app.enableCors({ origin: config.corsOrigins });
  // Better Auth lit lui-même le corps des requêtes : sa route passe avant le parseur JSON de Nest.
  app.getHttpAdapter().getInstance().all("/api/auth/*splat", toNodeHandler(app.get(AuthService).auth));
  return app;
}
