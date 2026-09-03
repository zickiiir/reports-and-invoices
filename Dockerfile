# syntax=docker.io/docker/dockerfile:1
#
# Simple (not size-optimized) multi-stage build — reliability and clarity over
# minimizing image size. Also keeps devDependencies (needed for `next build` and for
# `drizzle-kit migrate` on container startup).

FROM node:22-alpine AS base
RUN corepack enable
# Puppeteer has nothing to download in any stage — Chromium comes from the system
# Alpine package (set up in the runner stage below).
ENV PUPPETEER_SKIP_DOWNLOAD=true

# ---- deps: instalace závislostí (cachovatelná vrstva) ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# ---- dev: `next dev` in the container, sources mounted from the host (see docker-compose.dev.yml) ----
FROM base AS dev
WORKDIR /app

# System Chromium for Puppeteer (PDF generation) + fonts for diacritics — same as runner.
RUN apk add --no-cache \
    chromium \
    ttf-freefont \
    font-noto \
    font-noto-cjk \
  && rm -rf /var/cache/apk/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=deps /app/node_modules ./node_modules

CMD ["pnpm", "dev"]

# ---- builder: building the Next.js application ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DB/AUTH variables aren't needed at build time — env.js validation is skipped. Still,
# we set a few default values explicitly (SKIP_ENV_VALIDATION bypasses zod defaults too).
ENV SKIP_ENV_VALIDATION=1
ENV DATA_DIR=/data
RUN pnpm build

# ---- runner: production image ----
FROM base AS runner
WORKDIR /app

# System Chromium for Puppeteer (PDF generation) + fonts for diacritics.
RUN apk add --no-cache \
    chromium \
    ttf-freefont \
    font-noto \
    font-noto-cjk \
  && rm -rf /var/cache/apk/*

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data \
  && chown nextjs:nodejs /data

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
# Directly via the next binary, not "pnpm start" — pnpm would try to verify/repair
# node_modules before running the script, which fails in a container without a TTY (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
CMD ["node_modules/.bin/next", "start"]
