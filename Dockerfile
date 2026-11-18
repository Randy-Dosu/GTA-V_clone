# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Grand Theft Auto V — Los Santos
# Multi-stage production image: Node build → nginx static serve
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build optimized static bundle into /app/dist
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── Stage 2: Serve ─────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Custom nginx config (SPA fallback, gzip, caching, security headers)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx listens on 80 by default
EXPOSE 80

# Health check — fails if nginx stops serving
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
