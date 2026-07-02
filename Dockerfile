# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY core/package.json ./core/
RUN pnpm install --frozen-lockfile
COPY core/ ./core/
RUN pnpm --filter core run build

# Stage 2: Production server
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json ./server/
COPY core/package.json ./core/
COPY --from=frontend-build /app/core/dist ./core/dist
COPY --from=frontend-build /app/core/src ./core/src

RUN pnpm install --frozen-lockfile --prod

COPY server/ ./server/

EXPOSE 1118 1119

CMD ["node", "--import", "./server/import-hooks.ts", "server/index.ts"]
