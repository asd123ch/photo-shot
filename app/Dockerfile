# syntax=docker/dockerfile:1

# --- Build stage -----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies (cached unless lockfile changes)
COPY package.json package-lock.json ./
RUN npm ci

# Build the static site
COPY . .
RUN npm run build

# --- Runtime stage ---------------------------------------------------------
FROM nginx:stable-alpine AS runtime

# nginx site config (SPA fallback + caching)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static build output
COPY --from=build /app/dist /usr/share/nginx/html

# Render runtime config (API keys / password) from env vars on container start.
# The nginx base image automatically runs executable *.sh files in
# /docker-entrypoint.d/ before launching nginx.
COPY docker/render-config.sh /docker-entrypoint.d/30-render-config.sh
RUN chmod +x /docker-entrypoint.d/30-render-config.sh

EXPOSE 80
