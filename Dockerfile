# Dockerfile par défaut du dépôt : construit l'API (Dokploy l'utilise sans réglage : Docker File = Dockerfile, contexte = .).
# Copie conforme de apps/api/Dockerfile (à partir de la ligne FROM) : modifier les deux ensemble.
# Variables attendues à l'exécution : DATABASE_URL, PUBLIC_ALERT_URL, CORS_ORIGINS, TRUST_PROXY (cf. README).

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
# prisma.config.ts lit DATABASE_URL au chargement ; la vraie valeur n'est fournie qu'à l'exécution.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm install --frozen-lockfile --filter "@apsig/api..."
RUN pnpm --filter "@apsig/api..." run build

FROM base AS runtime
ENV NODE_ENV=production API_PORT=4000
COPY --from=build /app /app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Les migrations sont appliquées à chaque démarrage (sans effet si la base est à jour).
# Prisma est appelé directement : pnpm n'est pas téléchargé au démarrage du conteneur.
CMD ["sh", "-c", "cd packages/db && ./node_modules/.bin/prisma migrate deploy && cd /app && exec node --enable-source-maps apps/api/dist/main.js"]
