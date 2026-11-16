# Site officiel APSIG (apsig.online) — sortie « standalone » de Next.js.
# À construire depuis la racine du monorepo :
#   docker build -f apps/site/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.apsig.online .
# NEXT_PUBLIC_API_URL est intégrée au build (formulaire « Être rappelé ») : la changer impose de reconstruire l'image.
# Côté API, l'adresse publique de ce site doit figurer dans CORS_ORIGINS.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ARG PAGE_ALERTE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL PAGE_ALERTE_URL=$PAGE_ALERTE_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@apsig/site..."
RUN pnpm --filter "@apsig/site..." run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3004 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/site/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/site/.next/static ./apps/site/.next/static
COPY --from=build --chown=node:node /app/apps/site/public ./apps/site/public
USER node
EXPOSE 3004
CMD ["node", "apps/site/server.js"]
