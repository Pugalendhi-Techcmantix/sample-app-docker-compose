FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PRISMA_DISABLE_TELEMETRY=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts docker-entrypoint.sh ./
COPY migrations ./migrations
COPY prisma ./prisma
COPY src ./src
USER node
EXPOSE 4000
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
