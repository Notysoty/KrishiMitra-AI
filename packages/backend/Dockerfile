# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -g 1001 -S nodejs && adduser -S krishimitra -u 1001

WORKDIR /app

# Copy built assets and prod node_modules
COPY --from=builder --chown=krishimitra:nodejs /app/dist ./dist
COPY --from=builder --chown=krishimitra:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=krishimitra:nodejs /app/package.json ./

# Copy migrations (needed at runtime)
COPY --chown=krishimitra:nodejs src/db/migrations ./src/db/migrations

USER krishimitra

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
