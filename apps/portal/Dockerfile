# apps/portal/Dockerfile — Build multi-stage para Next.js App Router (@iwana/portal)
# output: 'standalone' configurado en apps/portal/next.config.ts

FROM node:24-bookworm AS base
WORKDIR /app
RUN npm install -g pnpm@10.32.1

# ── deps ─────────────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json          apps/api/
COPY apps/portal/package.json       apps/portal/
COPY apps/web/package.json          apps/web/
COPY apps/worker/package.json       apps/worker/
COPY packages/config/package.json   packages/config/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json   packages/shared/
COPY packages/ui/package.json       packages/ui/

RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# ── builder ───────────────────────────────────────────────────────────────
FROM base AS builder

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules                ./node_modules
COPY --from=deps /app/packages/config/node_modules   ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules   ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules       ./packages/ui/node_modules
COPY --from=deps /app/apps/portal/node_modules       ./apps/portal/node_modules

COPY . .

RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts
RUN pnpm exec tsc --project packages/shared/tsconfig.json
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @iwana/portal build

# ── runner ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/portal/.next/static     ./apps/portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/portal/public           ./apps/portal/public

USER nextjs

EXPOSE 3002

CMD ["node", "apps/portal/server.js"]
