# Centrale CODE-SECOURS — image de production (sortie « standalone » de Next.js).
# À construire depuis la racine du monorepo :
#   docker build -f apps/centrale/Dockerfile --build-arg CENTRALE_API_URL=http://api:4000 .
# CENTRALE_API_URL (adresse de l'API vue par ce serveur) est intégrée au build : la changer impose de reconstruire l'image.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG CENTRALE_API_URL
ENV CENTRALE_API_URL=$CENTRALE_API_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@apsig/centrale..."
RUN pnpm --filter "@apsig/centrale..." run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3002 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/centrale/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/centrale/.next/static ./apps/centrale/.next/static
COPY --from=build --chown=node:node /app/apps/centrale/public ./apps/centrale/public
USER node
EXPOSE 3002
CMD ["node", "apps/centrale/server.js"]
