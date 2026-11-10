# syntax=docker/dockerfile:1

# ---- Build stage: compile the Vue client and the Nest server ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first so this layer is cached until a package file changes.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: only the compiled app and the server's production dependencies ----
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=8004 \
    HOST=0.0.0.0
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false \
 && npm cache clean --force

# The server serves the built client from ../../client/dist relative to server/dist.
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

USER node
EXPOSE 8004
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" > /dev/null || exit 1

CMD ["node", "server/dist/main.js"]
