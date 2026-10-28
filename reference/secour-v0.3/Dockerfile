# Image de production du prototype Code-Secours CI (API Node + front-end Next.js, un seul port).
# node:sqlite (base intégrée) nécessite Node ≥ 22.13.

# --- Construction du front-end ---------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.mjs postcss.config.mjs jsconfig.json ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
RUN npx next build

# --- Image d'exécution -------------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY next.config.mjs ./
COPY server.js ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public

# Les données (base SQLite, médias, sauvegardes) vivent dans un volume.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
