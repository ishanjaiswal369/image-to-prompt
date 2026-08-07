FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json ./
COPY backend/package.json ./backend/package.json
RUN npm install --workspace backend --include-workspace-root

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY package.json ./
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate --schema src/db/prisma/schema.prisma
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/src/db/prisma ./src/db/prisma
COPY --from=build /app/backend/package.json ./package.json
EXPOSE 8080
CMD ["node", "dist/server.js"]
