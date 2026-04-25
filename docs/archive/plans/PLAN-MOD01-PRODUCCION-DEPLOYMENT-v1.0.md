# Despliegue a Producción — MOD01 en 10.0.0.2:8080

**Version:** 1.0
**Estado:** En revisión
**Fecha:** 2026-03-16
**Convencion documental:** PLAN-MOD01-PRODUCCION-DEPLOYMENT-v1.0.md

> **Para Claude:** REQUIRED SUB-SKILL: Usar superpowers:executing-plans para implementar este plan tarea por tarea.

**Goal:** Llevar el stack completo de MOD01 (Auth + Tenant + Audit) a producción en el servidor on-premise `http://10.0.0.2:8080` con un solo `docker compose up -d --build`.

**Architecture:** Nginx en el puerto configurable `APP_PORT` (default 8080) enruta `/api/v1/*` → API NestJS (interno 3000) y `/*` → Web Next.js (interno 3001). Todo corre en Docker. El primer SYSTEM_ADMIN se crea automáticamente al arrancar la API vía `PlatformBootstrapService` (variables `PLATFORM_SUPER_ADMIN_EMAIL` + `PLATFORM_SUPER_ADMIN_PASSWORD`). Las migraciones corren automáticamente en startup. El Worker BullMQ provisiona schemas de tenant en background.

**Tech Stack:** NestJS 11 · Next.js 15 · PostgreSQL 18 · Redis 8 · BullMQ · Nginx Alpine · pnpm 10.32.1 · Node 24 · TypeORM · Docker Compose v2

---

## Diagnóstico del estado actual

### Lo que ya existe ✅
- Toda la lógica de negocio: AuthModule, TenantModule, UsersModule, AuditModule, RedisModule, MailerModule, PlatformUsersModule
- PlatformBootstrapService (crea SYSTEM_ADMIN desde env vars)
- TenantProvisioningProcessor (worker BullMQ, path al SQL template OK en Docker)
- Web app con UI completa: login, dashboard, tenants CRUD, users, audit logs
- api-client.ts con todos los endpoints (611 líneas)
- Worker Dockerfile (multi-stage, sirve como plantilla para API y Web)
- docker-compose.dev.yml (plantilla para compose de producción)

### Gaps críticos que este plan corrige ❌
| Gap | Impacto | Tarea |
|---|---|---|
| `migrationsRun: false` en app.module.ts | Migraciones no corren → DB vacía | Task 1 |
| `secure: process.env.NODE_ENV === 'production'` en cookie | Cookie refreshToken no se envía por HTTP | Task 1 |
| Sin endpoint `/health` | Healthchecks de Docker fallan | Task 2 |
| Sin `apps/api/Dockerfile` | API no puede contenerizarse | Task 3 |
| Sin `apps/web/Dockerfile` | Web no puede contenerizarse | Task 4 |
| Sin `nginx/nginx.prod.conf` | Sin proxy de producción | Task 5 |
| Sin `docker-compose.yml` (prod) | Sin orquestación de producción | Task 6 |
| `.env` con valores `CHANGE_ME` | Stack no arranca | Task 7 |

---

## Task 1: Corregir migrationsRun y COOKIE_SECURE

**Files:**
- Modify: `apps/api/src/app.module.ts` (línea 110)
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (línea 39)

**Problema 1 — migrationsRun:**
En `app.module.ts`, `migrationsRun: false` hace que las migraciones nunca corran en producción. La DB pública queda vacía y el bootstrap falla.

**Step 1: Cambiar migrationsRun en app.module.ts**

En `apps/api/src/app.module.ts`, línea 110, cambiar:
```typescript
// ANTES:
migrationsRun: false,

// DESPUÉS:
migrationsRun: config.get<string>('NODE_ENV') === 'production',
```

**Problema 2 — Cookie Secure en HTTP:**
En `apps/api/src/modules/auth/auth.controller.ts`, la cookie tiene `secure: process.env.NODE_ENV === 'production'`. En producción sobre HTTP (sin TLS), el navegador rechaza la cookie con `Secure=true`. El flujo de refresh token queda roto.

**Step 2: Cambiar cookie secure en auth.controller.ts**

En `apps/api/src/modules/auth/auth.controller.ts`, cambiar la constante `REFRESH_COOKIE_OPTIONS`:
```typescript
// ANTES:
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/v1/auth',
};

// DESPUÉS:
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  // COOKIE_SECURE=false para HTTP on-prem; true solo si se agrega TLS en el futuro
  secure: process.env['COOKIE_SECURE'] === 'true',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/v1/auth',
};
```

**Step 3: Agregar COOKIE_SECURE al schema de validación Joi en app.module.ts**

En el bloque `validationSchema: Joi.object({...})`, agregar:
```typescript
COOKIE_SECURE: Joi.boolean().default(false),
```

**Step 4: Verificar que compila sin errores**

```bash
cd C:\appiw
pnpm --filter @iwana/api typecheck
```
Resultado esperado: 0 errores TypeScript.

**Step 5: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/auth/auth.controller.ts
git commit -m "fix(api): migrationsRun=true en producción y COOKIE_SECURE configurable"
```

---

## Task 2: Agregar endpoint /health al API

**Files:**
- Create: `apps/api/src/modules/health/health.controller.ts`
- Create: `apps/api/src/modules/health/health.module.ts`
- Modify: `apps/api/src/app.module.ts` (importar HealthModule)

**Problema:** Docker healthcheck y Nginx necesitan `GET /health` para saber si la API está lista. Actualmente el endpoint no existe → los contenedores nunca pasan a `healthy`.

**Step 1: Crear health.controller.ts**

```typescript
// apps/api/src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Endpoint de health check para Docker y Nginx.
 * GET /health — público, sin autenticación.
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<{ status: string; db: string; redis: string; timestamp: string }> {
    let dbStatus = 'ok';
    let redisStatus = 'ok';

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    try {
      await this.redis.ping();
    } catch {
      redisStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
```

**Step 2: Crear health.module.ts**

```typescript
// apps/api/src/modules/health/health.module.ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

**Step 3: Importar HealthModule en app.module.ts**

En `apps/api/src/app.module.ts`, agregar en el array `imports`:
```typescript
import { HealthModule } from './modules/health/health.module';
// ... en el array imports[]:
HealthModule,
```

**IMPORTANTE:** El `/health` queda en `/api/v1/health` por el global prefix. El Nginx y Docker healthcheck deben usar `/api/v1/health`.

**Step 4: Agregar /health a exclusiones del TenantMiddleware**

En `app.module.ts`, método `configure()`, agregar exclusión:
```typescript
consumer
  .apply(TenantMiddleware)
  .exclude(
    { path: 'tenants', method: RequestMethod.ALL },
    { path: 'tenants/*path', method: RequestMethod.ALL },
    { path: 'health', method: RequestMethod.GET }, // <-- agregar
  )
  .forRoutes({ path: '*path', method: RequestMethod.ALL });
```

**Step 5: Verificar compilación**

```bash
pnpm --filter @iwana/api typecheck
```
Resultado esperado: 0 errores.

**Step 6: Commit**

```bash
git add apps/api/src/modules/health/
git add apps/api/src/app.module.ts
git commit -m "feat(api): agregar endpoint /health con check de DB y Redis"
```

---

## Task 3: Crear apps/api/Dockerfile (multi-stage NestJS)

**Files:**
- Create: `apps/api/Dockerfile`

**Referencia:** Basado en `apps/worker/Dockerfile` — misma estructura multi-stage.

**Step 1: Crear el Dockerfile**

```dockerfile
# apps/api/Dockerfile — Build multi-stage para NestJS API
# Basado en el patrón del worker (apps/worker/Dockerfile)

FROM node:24-bookworm AS base
WORKDIR /app
RUN npm install -g pnpm@10.32.1

# ── deps: instalar dependencias con contexto completo del monorepo ──────────
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

# HUSKY=0 evita que el hook "prepare" falle por ausencia de .git en Docker
RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# ── builder: compilar la API ─────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules   ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules   ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/api/node_modules          ./apps/api/node_modules

COPY . .

# Rehidrata el grafo del monorepo (links de workspace pnpm)
RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# Compilar dependencias y la API
RUN pnpm exec tsc --project packages/shared/tsconfig.json && \
    pnpm exec tsc --project packages/database/tsconfig.json && \
    pnpm exec tsc --project apps/api/tsconfig.json

# ── runner: imagen mínima de producción ────────────────────────────────────
FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/node_modules      ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api          ./apps/api
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared   ./packages/shared
COPY --from=builder --chown=nestjs:nodejs /app/packages/database ./packages/database

USER nestjs

WORKDIR /app/apps/api

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
```

**Step 2: Verificar que el Dockerfile tiene la estructura correcta**

Revisar que:
- La imagen base es `node:24-bookworm` (igual que el worker)
- Se compilan `shared`, `database` y `api` en orden correcto
- El runner copia `packages/database` (necesario para migraciones y tenant_template.sql)
- El HEALTHCHECK usa el endpoint `/api/v1/health` que creamos en Task 2
- El usuario es `nestjs` (no root)

**Step 3: Commit**

```bash
git add apps/api/Dockerfile
git commit -m "feat(api): agregar Dockerfile multi-stage para producción"
```

---

## Task 4: Crear apps/web/Dockerfile (multi-stage Next.js standalone)

**Files:**
- Create: `apps/web/Dockerfile`

**Clave:** Next.js con `output: 'standalone'` genera un directorio `.next/standalone` que incluye solo lo necesario para producción. `NEXT_PUBLIC_API_URL` se bake en el bundle en tiempo de build → se pasa como `ARG`.

**Step 1: Crear el Dockerfile**

```dockerfile
# apps/web/Dockerfile — Build multi-stage para Next.js App Router
# output: 'standalone' ya configurado en apps/web/next.config.ts

FROM node:24-bookworm AS base
WORKDIR /app
RUN npm install -g pnpm@10.32.1

# ── deps ─────────────────────────────────────────────────────────────────────
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

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder

# NEXT_PUBLIC_API_URL se bake en el bundle en tiempo de build.
# Pasar como ARG → ENV para que Next.js lo exponga al cliente.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules   ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules   ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules       ./packages/ui/node_modules
COPY --from=deps /app/apps/web/node_modules          ./apps/web/node_modules

COPY . .

RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# Compilar dependencias
RUN pnpm exec tsc --project packages/shared/tsconfig.json

# Build Next.js (usa output: standalone automáticamente desde next.config.ts)
RUN pnpm --filter @iwana/web build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar el output standalone de Next.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public           ./apps/web/public

USER nextjs

EXPOSE 3001

CMD ["node", "apps/web/server.js"]
```

**Step 2: Verificar la estructura del standalone de Next.js**

Cuando Next.js construye en modo `standalone`, genera `apps/web/.next/standalone/` con un `server.js` y todas las dependencias necesarias. El WORKDIR final debe tener `apps/web/server.js` relativo a `/app`.

**Step 3: Commit**

```bash
git add apps/web/Dockerfile
git commit -m "feat(web): agregar Dockerfile multi-stage Next.js standalone"
```

---

## Task 5: Crear nginx/nginx.prod.conf

**Files:**
- Create: `nginx/nginx.prod.conf`

**Lógica de routing:**
- `http://10.0.0.2:${APP_PORT}/api/v1/*` → `api:3000/api/v1/*` (sin strip de prefijo)
- `http://10.0.0.2:${APP_PORT}/*` → `web:3001/*`
- `http://10.0.0.2:${APP_PORT}/health` → `api:3000/api/v1/health` (conveniencia)

**Step 1: Crear nginx.prod.conf**

```nginx
# nginx/nginx.prod.conf — Proxy inverso de producción iWana neXt
# Puerto externo configurado en docker-compose.yml via APP_PORT (default 8080)
# Routing: /api/v1/* → api:3000  |  /* → web:3001

upstream api {
    server api:3000;
    keepalive 32;
}

upstream web {
    server web:3001;
    keepalive 16;
}

server {
    listen 80;
    server_name _;

    # Tamaño máximo de body (uploads futuros)
    client_max_body_size 10M;

    # Headers de seguridad básicos
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ── Health check (acceso directo sin /api/v1 para conveniencia) ──────────
    location = /health {
        proxy_pass http://api/api/v1/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    # ── API NestJS (/api/ → api:3000, preserva path completo) ───────────────
    location /api/ {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        # Reenviar cookies (refresh token httpOnly)
        proxy_pass_header Set-Cookie;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # ── Web Next.js (todo lo demás → web:3001) ───────────────────────────────
    location / {
        proxy_pass http://web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
}
```

**Step 2: Verificar que el routing es correcto**

Con esta configuración:
- Browser: `GET http://10.0.0.2:8080/api/v1/tenants`
  - Nginx recibe: `/api/v1/tenants`
  - Matches: `location /api/` → proxy_pass `http://api` (sin trailing slash)
  - API recibe: `GET http://api:3000/api/v1/tenants` ✅ (NestJS global prefix `api/v1`)
- Browser: `GET http://10.0.0.2:8080/dashboard`
  - Nginx: → `http://web:3001/dashboard` ✅

**Step 3: Commit**

```bash
git add nginx/nginx.prod.conf
git commit -m "feat(nginx): configuración de producción con routing API + Web"
```

---

## Task 6: Crear docker-compose.yml (producción, 6 servicios)

**Files:**
- Create: `docker-compose.yml`

**Servicios:** postgres · redis · api · worker · web · nginx
(pgBouncer y MinIO son opcionales — se agregan en iteración futura)

**Step 1: Crear docker-compose.yml**

```yaml
# docker-compose.yml — Stack de producción iWana neXt
# Uso: docker compose up -d --build
# Puerto público: http://10.0.0.2:${APP_PORT:-8080}
#
# Para cambiar el puerto: editar APP_PORT en .env y ejecutar:
#   docker compose up -d --build

services:

  # ── PostgreSQL 18 ────────────────────────────────────────────────────────────
  postgres:
    image: postgres:18-alpine
    container_name: iwana_postgres
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - iwana_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER} -d ${DB_NAME}']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

  # ── Redis 8 ──────────────────────────────────────────────────────────────────
  redis:
    image: redis:8-alpine
    container_name: iwana_redis
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --save 60 1
      --loglevel warning
    volumes:
      - iwana_redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', '${REDIS_PASSWORD}', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 5s
    restart: unless-stopped

  # ── API NestJS ───────────────────────────────────────────────────────────────
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: iwana_api
    environment:
      NODE_ENV: production
      PORT: 3000
      # Base de datos — conexión directa a postgres (sin pgBouncer en MVP)
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      # Redis
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      REDIS_DB: ${REDIS_DB:-0}
      # JWT RS256 (contenido PEM con \n escapados)
      JWT_PRIVATE_KEY: ${JWT_PRIVATE_KEY}
      JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY}
      # AES-256-GCM para cifrado de MFA secrets (64 hex chars)
      MFA_ENCRYPTION_KEY: ${MFA_ENCRYPTION_KEY}
      # CORS: origen del browser (http://10.0.0.2:${APP_PORT})
      CORS_ORIGIN: ${CORS_ORIGIN}
      # Cookie: false para HTTP sin TLS, true solo si se agrega HTTPS
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
      # Bootstrap del primer SYSTEM_ADMIN (se ejecuta una sola vez en startup)
      PLATFORM_SUPER_ADMIN_EMAIL: ${PLATFORM_SUPER_ADMIN_EMAIL}
      PLATFORM_SUPER_ADMIN_PASSWORD: ${PLATFORM_SUPER_ADMIN_PASSWORD}
      # URL del frontend para links en emails
      FRONTEND_URL: ${WEB_URL}
      APP_NAME: ${APP_NAME:-iWana neXt}
      # SMTP — si SMTP_HOST está vacío, MailerService usa modo dev (logs en consola)
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      SMTP_FROM: ${SMTP_FROM:-no-reply@iwana.local}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://localhost:3000/api/v1/health || exit 1']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 90s
    restart: unless-stopped

  # ── Worker BullMQ ────────────────────────────────────────────────────────────
  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    container_name: iwana_worker
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      REDIS_DB: ${REDIS_DB:-0}
      MFA_ENCRYPTION_KEY: ${MFA_ENCRYPTION_KEY}
      PLATFORM_SUPER_ADMIN_EMAIL: ${PLATFORM_SUPER_ADMIN_EMAIL}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  # ── Web Next.js ───────────────────────────────────────────────────────────────
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        # Bakeado en el bundle de Next.js en tiempo de build.
        # Si cambia APP_PORT, ejecutar: docker compose build web && docker compose up -d web
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
    container_name: iwana_web
    environment:
      NODE_ENV: production
      PORT: 3001
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  # ── Nginx (proxy + puerto público) ──────────────────────────────────────────
  nginx:
    image: nginx:alpine
    container_name: iwana_nginx
    ports:
      # APP_PORT configurable en .env — cambiar si el puerto está ocupado
      - '${APP_PORT:-8080}:80'
    volumes:
      - ./nginx/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - api
      - web
    restart: unless-stopped

# ── Volúmenes persistentes ────────────────────────────────────────────────────
volumes:
  iwana_postgres_data:
    name: iwana_postgres_data
  iwana_redis_data:
    name: iwana_redis_data
```

**Step 2: Verificar dependencias entre servicios**

El orden de arranque es:
1. `postgres` + `redis` (con healthcheck)
2. `api` (espera postgres + redis healthy → corre migraciones → crea SYSTEM_ADMIN)
3. `worker` (espera postgres + redis healthy)
4. `web` (espera api healthy → standalone Next.js)
5. `nginx` (espera api + web)

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: docker-compose.yml de producción con 6 servicios"
```

---

## Task 7: Actualizar .env con valores de producción

**Files:**
- Modify: `.env`

**Nota de seguridad:** Los secretos se generan en Task 8. Aquí solo se establece la estructura completa del `.env`.

**Agregar/actualizar las siguientes variables en `.env`:**

```env
# =============================================================================
# iWana neXt — Variables de Entorno de Producción
# Servidor: http://10.0.0.2:${APP_PORT}
# =============================================================================

# Puerto público de acceso (cambiar si 8080 está ocupado)
APP_PORT=8080

# URLs derivadas del puerto
APP_URL=http://10.0.0.2:8080
WEB_URL=http://10.0.0.2:8080
PORTAL_URL=http://10.0.0.2:8080

# URL del API para el bundle de Next.js (bakeado en build time)
NEXT_PUBLIC_API_URL=http://10.0.0.2:8080/api/v1

# CORS: mismo origen que el browser
CORS_ORIGIN=http://10.0.0.2:8080

# Cookie: false para HTTP on-prem, true solo con HTTPS/TLS
COOKIE_SECURE=false

# ── Base de datos ─────────────────────────────────────────────────────────────
DB_HOST=postgres
DB_PORT=5432
DB_USER=iwana
DB_PASSWORD=CHANGE_ME_DB_PASSWORD    # ← generar en Task 8
DB_NAME=dbiw

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD   # ← generar en Task 8
REDIS_DB=0

# ── JWT RS256 (generar en Task 8) ─────────────────────────────────────────────
JWT_PRIVATE_KEY=CHANGE_ME_JWT_PRIVATE_KEY_PEM_ESCAPED
JWT_PUBLIC_KEY=CHANGE_ME_JWT_PUBLIC_KEY_PEM_ESCAPED
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# ── Cifrado MFA (generar en Task 8: openssl rand -hex 32) ────────────────────
MFA_ENCRYPTION_KEY=CHANGE_ME_64_HEX_CHARS

# ── Bootstrap primer SYSTEM_ADMIN ────────────────────────────────────────────
# Cambia el email y contraseña antes de desplegar.
# La contraseña debe cumplir la política: 10+ chars, mayúscula, minúscula, número, especial.
PLATFORM_SUPER_ADMIN_EMAIL=admin@tuempresa.com
PLATFORM_SUPER_ADMIN_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# ── SMTP (dejar vacío para modo dev — imprime emails en logs) ─────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@tuempresa.com

# ── App ───────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
APP_NAME=iWana neXt
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
LOG_LEVEL=info
```

**Nota importante sobre las JWT keys en .env:**
Los valores PEM deben tener los saltos de línea escapados como `\n`. El `.env.development` ya tiene el formato correcto como referencia.

**Step 1: Actualizar el .env con la estructura anterior**
(Los valores CHANGE_ME se reemplazan en Task 8)

**Step 2: Verificar que no queden valores CHANGE_ME del .env original que puedan confundir**

Revisar que no haya variables antiguas con valores obsoletos como `https://api.example.com`.

**Step 3: Commit (sin secrets reales)**

```bash
git add .env
git commit -m "chore: actualizar .env template para producción en 10.0.0.2:8080"
```

---

## Task 8: Generar secrets de producción en el servidor

**Files:**
- Modify: `.env` (valores finales — solo en el servidor, NO en git)
- El .env se copia al servidor y se edita ahí directamente.

**Prerrequisito:** Linux con `openssl` disponible (viene por defecto en cualquier distro).

**Step 1: Copiar archivos al servidor**

Desde tu máquina Windows, ejecutar en PowerShell:
```powershell
# Copiar los archivos necesarios al servidor (excluye node_modules, .git, secrets/)
# Opción A: con SCP
scp -r C:\appiw usuario@10.0.0.2:/home/usuario/appiw

# Opción B: con rsync (si está disponible en WSL)
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='secrets/' \
  /mnt/c/appiw/ usuario@10.0.0.2:/home/usuario/appiw/
```

**Step 2: En el servidor — generar contraseña segura para DB y Redis**

```bash
# En el servidor 10.0.0.2
cd /home/usuario/appiw

# Contraseña DB
openssl rand -base64 24 | tr -dc 'A-Za-z0-9!@#$%' | head -c 24
# Anotar el resultado → reemplazar CHANGE_ME_DB_PASSWORD en .env

# Contraseña Redis
openssl rand -base64 24 | tr -dc 'A-Za-z0-9!@#$%' | head -c 24
# Anotar el resultado → reemplazar CHANGE_ME_REDIS_PASSWORD en .env
```

**Step 3: Generar par de claves RSA 2048-bit**

```bash
# Generar clave privada
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_private.pem

# Extraer clave pública
openssl rsa -pubout -in jwt_private.pem -out jwt_public.pem

# Ver el formato necesario para .env (con \n escapados)
# Clave privada:
awk 'NR==1{printf "%s",$0} NR>1{printf "\\n%s",$0}' jwt_private.pem
# Copiar el resultado completo → JWT_PRIVATE_KEY en .env

# Clave pública:
awk 'NR==1{printf "%s",$0} NR>1{printf "\\n%s",$0}' jwt_public.pem
# Copiar el resultado completo → JWT_PUBLIC_KEY en .env

# Limpiar archivos temporales (no dejar PEMs en disco)
rm jwt_private.pem jwt_public.pem
```

**Step 4: Generar MFA_ENCRYPTION_KEY**

```bash
openssl rand -hex 32
# Copiar los 64 caracteres hex → MFA_ENCRYPTION_KEY en .env
```

**Step 5: Editar .env en el servidor con todos los valores generados**

```bash
nano /home/usuario/appiw/.env
```

Reemplazar todos los `CHANGE_ME_*` con los valores generados. También:
- `PLATFORM_SUPER_ADMIN_EMAIL`: tu email real
- `PLATFORM_SUPER_ADMIN_PASSWORD`: contraseña segura (10+ chars, mayúscula, minúscula, número, especial)

**Step 6: Verificar que .env no tiene CHANGE_ME**

```bash
grep 'CHANGE_ME' /home/usuario/appiw/.env
# Resultado esperado: ninguna línea (vacío)
```

---

## Task 9: Desplegar en el servidor

**Prerrequisito:** Docker y Docker Compose v2 instalados en 10.0.0.2.

**Step 1: Verificar Docker en el servidor**

```bash
# En el servidor
docker --version      # esperado: Docker 24+ o 25+
docker compose version  # esperado: Docker Compose v2.x
```

Si no está instalado:
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

**Step 2: Primer build y arranque**

```bash
cd /home/usuario/appiw

# Build de todas las imágenes (primera vez toma ~10-15 min)
docker compose build

# Arrancar en background
docker compose up -d
```

**Step 3: Monitorear el arranque**

```bash
# Ver logs en tiempo real (Ctrl+C para salir)
docker compose logs -f

# O ver logs de un servicio específico
docker compose logs -f api
docker compose logs -f worker
```

Secuencia esperada en los logs:
1. `postgres` → `database system is ready to accept connections`
2. `redis` → `Ready to accept connections`
3. `api` → Logs de migraciones TypeORM → `Bootstrap de superusuario de plataforma completado.` → `Application is listening on port 3000`
4. `worker` → `Worker started`
5. `web` → `Listening on port 3001`
6. `nginx` → sin logs (proxy pasivo)

**Step 4: Verificar estado de los contenedores**

```bash
docker compose ps
```

Todos deben estar en estado `running` o `healthy`. Si alguno está en `restarting`, ver logs con:
```bash
docker compose logs [nombre-servicio] --tail=50
```

**Step 5: Smoke test del health endpoint**

```bash
curl http://10.0.0.2:8080/health
# Esperado:
# {"status":"ok","db":"ok","redis":"ok","timestamp":"2026-..."}

curl http://10.0.0.2:8080/api/v1/health
# Mismo resultado (ruta directa)
```

---

## Task 10: Verificar el flujo completo — primera empresa

**Prerrequisito:** El stack está corriendo (Task 9 completado).

### Paso 1: Login como SYSTEM_ADMIN

Abrir `http://10.0.0.2:8080` en el navegador.

Credenciales (del `.env`):
- Email: `PLATFORM_SUPER_ADMIN_EMAIL`
- Password: `PLATFORM_SUPER_ADMIN_PASSWORD`

Resultado esperado: Redirige al Dashboard.

Si el login falla, verificar:
```bash
# Confirmar que el bootstrap creó el usuario
docker compose logs api | grep -i bootstrap
# Debe aparecer: "Bootstrap de superusuario de plataforma completado."
```

### Paso 2: Crear la primera empresa (tenant)

1. Ir a **Tenants** en el menú lateral
2. Clic en **Nuevo Tenant**
3. Completar:
   - **Nombre:** Nombre de la empresa (p.ej. `MiISP Colombia`)
   - **Slug:** identificador único (p.ej. `miispcolombia` — solo letras minúsculas y números)
   - **Email de contacto:** email del admin del ISP
4. Clic en **Crear**

Resultado esperado: El tenant aparece con estado `PROVISIONING`.

### Paso 3: Verificar provisioning del schema

```bash
# Monitorear el worker
docker compose logs -f worker

# Logs esperados:
# [provisioning] Iniciando provisioning de schema "tenant_miispcolombia"
# [provisioning] Schema "tenant_miispcolombia" creado exitosamente
# [provisioning] Seed inicial del ADMIN completado
# [provisioning] Tenant miispcolombia activado exitosamente (status=ACTIVE)
```

En la UI, el tenant debe cambiar a `ACTIVE` en ~30 segundos.

### Paso 4: Obtener credenciales del admin del tenant

Las credenciales del ADMIN del tenant se imprimen en los logs del worker (modo dev sin SMTP). Buscar:
```bash
docker compose logs worker | grep -i "admin\|email\|password\|temporal"
```

O si el SMTP está configurado, el email llega directamente al `contactEmail` del tenant.

### Paso 5: Login como admin del tenant

El admin del tenant usa la misma URL pero hace login con su email/password temporal y el **header X-Tenant-Slug**.

**Nota:** La UI de portal para tenant admins está en `apps/portal` (pendiente Sprint 2). Para esta validación, usar el endpoint directo:
```bash
curl -X POST http://10.0.0.2:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: miispcolombia" \
  -d '{"email":"admin@tuisp.com","password":"PasswordTemporal123!"}'
```

---

## Task 11: Comandos de operación del stack

### Actualizar el stack después de cambios en código

```bash
cd /home/usuario/appiw

# Reconstruir imagen(s) específica(s)
docker compose build api          # solo API
docker compose build web          # solo Web (NEXT_PUBLIC_API_URL bakeado)
docker compose build api worker   # API + Worker

# Aplicar sin downtime extendido
docker compose up -d --no-deps api    # reiniciar solo API
docker compose up -d --no-deps web    # reiniciar solo Web
```

### Cambiar el puerto de acceso

```bash
# 1. Editar APP_PORT en .env
nano /home/usuario/appiw/.env
# Cambiar: APP_PORT=8080 → APP_PORT=9090

# 2. Si el puerto cambia, NEXT_PUBLIC_API_URL también cambia → rebuild web
# Editar: NEXT_PUBLIC_API_URL=http://10.0.0.2:9090/api/v1
# Editar: CORS_ORIGIN=http://10.0.0.2:9090

# 3. Reconstruir y reiniciar
docker compose build web
docker compose up -d
```

### Ver logs

```bash
docker compose logs -f              # todos los servicios
docker compose logs -f api          # solo API
docker compose logs api --tail=100  # últimas 100 líneas
```

### Backup de la base de datos

```bash
docker compose exec postgres pg_dump -U iwana dbiw > backup_$(date +%Y%m%d).sql
```

---

## Checklist de salida antes de ir live

- [ ] `docker compose ps` → todos los servicios `running` o `healthy`
- [ ] `curl http://10.0.0.2:8080/health` → `{"status":"ok",...}`
- [ ] Login como SYSTEM_ADMIN en `http://10.0.0.2:8080` funciona
- [ ] Crear un tenant → status pasa de `PROVISIONING` a `ACTIVE` en <60s
- [ ] Logs del worker muestran provisioning exitoso
- [ ] `.env` no contiene valores `CHANGE_ME`
- [ ] `grep 'CHANGE_ME' .env` retorna vacío
- [ ] Worker y API están conectados a la misma Redis y Postgres

---

_Plan generado: 2026-03-16 | iWana neXt Platform — MOD01 Producción_
_Servidor target: http://10.0.0.2:${APP_PORT:-8080}_
