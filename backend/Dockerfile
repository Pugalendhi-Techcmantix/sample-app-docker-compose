FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Development image (docker-compose.dev.yml, target "dev"): all deps incl. nodemon.
# The compose file bind-mounts ./backend over /app, so edits are picked up without a rebuild.
FROM node:24-alpine AS dev
WORKDIR /app
ENV PRISMA_DISABLE_TELEMETRY=1
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma.config.ts nodemon.json ./
COPY migrations ./migrations
COPY prisma ./prisma
COPY src ./src
EXPOSE 4000
CMD ["npm", "run", "dev"]

# Production image: the default build target (last stage).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PRISMA_DISABLE_TELEMETRY=1
COPY --from=deps /app/node_modules ./node_modules
# Includes the prisma CLI, prisma.config.ts, contract, migrations and seed, so
# `docker compose exec api npm run db:migrate` / `db:seed` work. Nothing runs automatically.
COPY package.json prisma.config.ts ./
COPY migrations ./migrations
COPY prisma ./prisma
COPY src ./src
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
