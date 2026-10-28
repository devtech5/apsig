# Page d'alerte CODE-SECOURS — image de production (sortie « standalone » de Next.js).
# À construire depuis la racine du monorepo :
#   docker build -f apps/alerte/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.ci .
# NEXT_PUBLIC_API_URL est intégrée au build : la changer impose de reconstruire l'image.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@apsig/alerte..."
RUN pnpm --filter "@apsig/alerte..." run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/alerte/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/alerte/.next/static ./apps/alerte/.next/static
COPY --from=build --chown=node:node /app/apps/alerte/public ./apps/alerte/public
USER node
EXPOSE 3001
CMD ["node", "apps/alerte/server.js"]
