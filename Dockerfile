# Stage 1: Build frontend
FROM node:24-alpine AS frontend-build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY core/package.json ./core/
RUN pnpm install --frozen-lockfile
COPY core/ ./core/
# Gate the image on the client typecheck (svelte-check, 350+ files) so type errors
# fail the build instead of shipping. The server half of `pnpm typecheck` needs
# devDependencies the production stage deliberately omits — run it locally or in CI.
RUN pnpm --filter core run typecheck
RUN pnpm --filter core run test
RUN pnpm --filter core run build

# Stage 2: Build native modules (better-sqlite3, sharp) with a full toolchain.
# Kept out of the runtime image: gcc, make and a Python interpreter sitting in
# production are prime post-exploitation tooling.
FROM node:24-alpine AS deps-build
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json ./server/
COPY core/package.json ./core/
RUN pnpm install --frozen-lockfile --prod

# Stage 3: Production runtime — no compilers, no package manager, not root.
FROM node:24-alpine AS production
WORKDIR /app

COPY --from=deps-build /app/node_modules ./node_modules
COPY --from=deps-build /app/server/node_modules ./server/node_modules
COPY --from=frontend-build /app/core/dist ./core/dist
COPY --from=frontend-build /app/core/src ./core/src
COPY pnpm-workspace.yaml package.json ./
COPY core/package.json ./core/
COPY server/ ./server/

# The data volume is bind-mounted from the host; running as root meant any write
# through the app landed there as uid 0.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

# 1118 serves the page, /api and socket.io in production. 1119 is dev-only
# (see server/index.ts) and is not exposed here.
EXPOSE 1118

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD wget -qO- http://127.0.0.1:1118/api/health || exit 1

CMD ["node", "--import", "./server/import-hooks.ts", "server/index.ts"]
