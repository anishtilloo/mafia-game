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

# ---- Frontend image (target: web): nginx serving the built client ----
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80

# ---- Backend image (target: server, the default): the compiled server and its production deps ----
# It also serves the client itself, so it still works on its own without the `web` container.
FROM node:20-alpine AS server
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
