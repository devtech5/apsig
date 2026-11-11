# Inscriptions en ligne CODE-SECOURS (code-secours.apsig.online) — sortie « standalone » de Next.js.
# À construire depuis la racine du monorepo :
#   docker build -f apps/inscription/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.ci .
# NEXT_PUBLIC_API_URL est intégrée au build : la changer impose de reconstruire l'image.
# Côté API, ajouter l'adresse publique de ce site à CORS_ORIGINS.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@apsig/inscription..."
RUN pnpm --filter "@apsig/inscription..." run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3003 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/inscription/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/inscription/.next/static ./apps/inscription/.next/static
COPY --from=build --chown=node:node /app/apps/inscription/public ./apps/inscription/public
USER node
EXPOSE 3003
CMD ["node", "apps/inscription/server.js"]
