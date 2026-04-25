# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Este archivo complementa AGENTS.md con formato nativo Claude Code.
> No dupliques reglas — importa y referencia.

## Instrucciones Base

@import AGENTS.md

## Reglas Modulares

Las reglas por dominio están en `.claude/rules/`. Se cargan automáticamente según los paths del archivo en edición:
- `backend.md` → `apps/api/**`, `packages/*/src/**/*.{service,module,controller}.ts`
- `frontend.md` → `apps/web/**`, `apps/portal/**`, `packages/*/src/**/*.tsx`
- `testing.md` → `**/*.{test,spec}.{ts,tsx}`, `e2e/**`
- `security.md` → siempre activo

## Despacho de Skills

Las skills activas del proyecto viven en `.agents/skills/{nombre}/SKILL.md`.
**Siempre leer la skill con `Read` antes de actuar — nunca de memoria.**

### Regla general de resolución

Resolver en este orden antes de generar código o tomar decisiones:

1. **Skills de proceso** (si la tarea implica diseño, planning o bug): `brainstorming` → `writing-plans` → `systematic-debugging` → `test-driven-development`
2. **Skills de dominio** (primera línea según el área técnica)
3. **Skills de segunda línea** (para profundizar cuando la tarea ya está acotada)
4. **Skills especializadas** (solo cuando el problema es específico del dominio)

Máximo 3 skills simultáneas salvo tareas explícitamente transversales (inicio de módulo, sprint planning).
Anti-duplicación: si dos skills cubren el mismo dominio, usar la de mayor prioridad en INDEX.md.

### Backend (NestJS / API)

| Condición | Primera skill | Complementar con |
|---|---|---|
| Crear/modificar módulo, servicio, controller | `nestjs-expert` | `typescript-expert` |
| Endpoint auth, JWT, MFA, guards, decorators | `auth-implementation-patterns` | `nestjs-expert`, `backend-security-coder` |
| Queries, entidades, TypeORM, índices | `postgresql` | `nestjs-expert` |
| Migraciones TypeORM, zero-downtime, rollback | `database-migration` | `postgresql` |
| Colas BullMQ, workers, jobs, DLQ, retry | `bullmq-specialist` | `nestjs-expert` |
| Contrato OpenAPI, DTOs, versioning REST | `openapi-spec-generation` | `nestjs-expert` |
| Logs, métricas, trazabilidad distribuida | `observability-engineer` | `nestjs-expert` |
| Seguridad capa backend, hardening | `backend-security-coder` | `security-auditor` |
| Tipos complejos, generics, decoradores TS | `typescript-pro` | `typescript-expert` |

### Frontend (Next.js / UI)

| Condición | Primera skill | Complementar con |
|---|---|---|
| Páginas, layouts, rutas, RSC vs Client | `nextjs-app-router-patterns` | `frontend-dev-guidelines` |
| Componentes UI, design system, tokens | `core-components` | `tailwind-patterns` |
| Estilos Tailwind 4, CSS-first, `@theme` | `tailwind-patterns` | `core-components` |
| Formularios, validación Zod, react-hook-form | `frontend-dev-guidelines` | `nextjs-app-router-patterns` |
| Accesibilidad WCAG 2.2 AA | `wcag-audit-patterns` | `core-components` |
| i18n, textos es-CO, mensajes localizados | `i18n-localization` | `frontend-dev-guidelines` |
| Seguridad cliente, XSS, CSP, sanitización | `frontend-security-coder` | `security-auditor` |

### Arquitectura y Gobierno

| Condición | Primera skill | Complementar con |
|---|---|---|
| Inicio de módulo, boundaries, HLD | `monorepo-architect` | `architect-review` |
| Optimización pipelines Turborepo, caché CI | `turborepo-caching` | `monorepo-architect` |
| Crear/revisar ADR | `architecture-decision-records` | `architect-review` |
| Review técnico de PR o diseño | `architect-review` | skill del dominio afectado |
| Documentación técnica, informes, specs | `docs-architect` | `mermaid-expert` |
| Diagramas Mermaid, C4, secuencia | `mermaid-expert` | `docs-architect` |
| Docker, infra on-premise, compose | `docker-expert` | — |

### Testing

| Condición | Primera skill | Complementar con |
|---|---|---|
| Unit/integration tests Jest + Supertest | `testing-patterns` | skill del dominio |
| TDD — escribir test antes de implementar | `test-driven-development` | `testing-patterns` |
| E2E Playwright, flujos usuario críticos | `playwright-skill` | `e2e-testing-patterns` |
| E2E avanzado, tests flaky, trazas, CI | `e2e-testing-patterns` | `playwright-skill` |

### Seguridad y Mantenimiento

| Condición | Primera skill | Complementar con |
|---|---|---|
| Auditoría de seguridad global | `security-auditor` | skill de la capa afectada |
| Seguridad backend específica | `backend-security-coder` | `security-auditor` |
| Seguridad frontend específica | `frontend-security-coder` | `security-auditor` |
| Auditoría deps, CVEs, pnpm audit | `codebase-cleanup-deps-audit` | `security-auditor` |

### Combinaciones Frecuentes

| Tarea compuesta | Secuencia de skills |
|---|---|
| Nuevo endpoint backend completo | `nestjs-expert` → `openapi-spec-generation` → `testing-patterns` |
| Nueva página frontend con formulario | `nextjs-app-router-patterns` → `frontend-dev-guidelines` → `core-components` |
| Inicio de módulo nuevo | `monorepo-architect` → `architect-review` → `architecture-decision-records` |
| Bug con impacto en seguridad | `security-auditor` → skill capa afectada → `testing-patterns` |
| Feature con auth multi-tenant | `auth-implementation-patterns` → `nestjs-expert` → `backend-security-coder` |
| Componente accesible con i18n | `core-components` → `wcag-audit-patterns` → `i18n-localization` |
| Migración de schema tenant | `database-migration` → `postgresql` → `testing-patterns` |
| Optimización monorepo / CI | `turborepo-caching` → `monorepo-architect` |
| Tipos complejos compartidos TS | `typescript-pro` → `typescript-expert` |
| Preparar release / auditoría deps | `codebase-cleanup-deps-audit` → `security-auditor` |

## Comandos de Desarrollo

```bash
# Levantar infraestructura + todos los apps en dev
pnpm dev                        # docker compose up + turbo dev

# Comandos Turborepo (corren en todos los workspaces)
pnpm build                      # turbo build
pnpm lint                       # turbo lint
pnpm test                       # turbo test (jest, --passWithNoTests)
pnpm typecheck                  # turbo typecheck

# Tests E2E (Playwright) — requiere apps corriendo
pnpm test:e2e                   # web (playwright.web.config.ts)
pnpm test:e2e:portal            # portal (playwright.portal.config.ts)
pnpm test:e2e:all               # ambos

# Correr tests de un workspace específico
pnpm --filter @iwana/api test
pnpm --filter @iwana/web test

# TypeORM migrations (desde packages/database)
pnpm --filter @iwana/db migration:generate -- src/migrations/public/NombreMigracion
pnpm --filter @iwana/db migration:run
pnpm --filter @iwana/db migration:revert
```

**Gestor de paquetes:** `pnpm@10.32.1` (Node 24.14.0). No usar npm ni yarn.
Corepack está bloqueado en NTFS/Win11 — instalar pnpm vía `npm install -g pnpm`.

## Arquitectura del Monorepo

```
apps/
  api/      @iwana/api     — NestJS Modulith (puerto 3000)
  web/      @iwana/web     — Next.js App Router admin (puerto 3001)
  portal/   @iwana/portal  — Next.js App Router portal cliente (puerto 3002)
  worker/   @iwana/worker  — BullMQ consumers (sin HTTP)

packages/
  database/ @iwana/db      — TypeORM entities, DataSource, migrations
  shared/   @iwana/shared  — DTOs (class-validator), enums, interfaces
  ui/       @iwana/ui      — Design system: tokens, componentes, ThemeProvider
  config/   @iwana/config  — tsconfig/eslint/prettier base compartidos
```

## Backend: NestJS Modulith (`apps/api`)

Arquitectura **Modulith**: cada módulo tiene boundaries explícitos. Los módulos actuales son:

| Módulo | Responsabilidad |
|--------|----------------|
| `AuthModule` | JWT RS256, MFA TOTP, refresh rotation, JTI blacklist Redis, guards |
| `TenantModule` | CRUD de tenants (schema público), provisioning BullMQ, `TenantMiddleware`, `DashboardSummaryService` |
| `UsersModule` | CRUD usuarios por tenant, RBAC, idempotencia |
| `AuditModule` | Interceptor global CUD + `AuditService` para eventos de dominio |
| `RedisModule` | Cliente ioredis global (JTI blacklist, cache tenant, MFA secrets) |
| `CrmModule` | MOD05 CRM — Contacts, Habeas Data, Opportunities, Quotes, Contracts, Expedientes; sub-módulos: contacts, habeas-data, opportunities, quotes, contracts, expedientes |
| `PlatformUsersModule` | CRUD usuarios de plataforma (SYSTEM_ADMIN, IWANA_SUPPORT) en schema público |
| `MailerModule` | Servicio de email global; dev-mode loguea por Logger, prod usa `SMTP_*` |
| `HealthModule` | Health check `GET /api/v1/health` para Docker y monitoreo externo |

**Flujo de autenticación por request:**
`JwtAuthGuard → TenantMiddleware → RolesGuard → AbacGuard → Controller`

**TenantMiddleware** almacena el contexto del tenant en `AsyncLocalStorage` (`TenantContext`).
- Con JWT válido: resuelve `tenantId` + `schemaName` desde los claims.
- Fallback transitorio (rutas públicas de auth): header `X-Tenant-Slug`.
- Excluido para `/api/v1/tenants/**` (administración de plataforma, schema público).

**Multi-tenancy:** PostgreSQL por schema. Entidades públicas usan `schema: 'public'` en `@Entity()`. Entidades de tenant no llevan schema — PostgreSQL las resuelve vía `SET LOCAL search_path` al inicio de cada transacción (compatible con pgBouncer transaction pooling). Función helper: `runInTenantSchema()` en `@iwana/db`.

**JWT:** RS256 con claves en `secrets/` (git-ignored). Access token: 15 min. Refresh token: 7 días, cookie httpOnly. Los valores PEM se cargan vía `ConfigService`; los `\n` literales del `.env` se normalizan con `.replace(/\\n/g, '\n')`.

**Variables de entorno obligatorias en `.env`:**
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `MFA_ENCRYPTION_KEY` (64 hex chars), `CORS_ORIGIN`.
Tests usan `.env.test` — la validación Joi se omite en modo test.

**Prohibiciones absolutas de arquitectura:**
- Sin `synchronize: true` en TypeORM en producción — solo migraciones.
- Sin acceso directo a tablas de otro módulo — usar interfaces tipadas o eventos BullMQ.
- Sin imports circulares entre bounded contexts.

## Frontend: Next.js App Router

Ambas apps (`web` y `portal`) comparten la misma estructura. Usan Next.js App Router con RSC donde aporta valor.

**Autenticación híbrida (ADR-023):** proxy cookie check (servidor) + `AuthProvider` (contexto cliente). El `AuthProvider` (`src/components/auth/AuthProvider.tsx`) expone `{ user, isLoading, logout }` vía `useAuth()`.

**API client** (`src/lib/api-client.ts`): access token en `localStorage` (`iwana.{app}.access-token`). Refresco automático con retry ante 401. Refresh usa `credentials: 'include'` para enviar la cookie httpOnly.

**Design system (`@iwana/ui`):**
- Tailwind 4 CSS-first: `@import "tailwindcss"` + `@theme {}` en `packages/ui/src/styles/globals.css`. **Sin `tailwind.config.js`**.
- El CSS global se importa en el layout raíz como `@iwana/ui/styles/globals.css`.
- Tokens de color en `@theme`: prefijo `iwana-primary-*` (Azul Noche), `iwana-secondary-*` (Lima).
- **Accesibilidad:** `#A5C330` (secondary) = 2.3:1 sobre blanco = FAIL WCAG AA. Para texto usar `#6A7A1C` (`iwana-secondary-700`, contraste 6.2:1).
- Componentes: Button, Input, Card, Badge, OtpInput, ThemeProvider, ThemeToggle.
- CVA aún no implementado (deuda técnica pendiente).

**Formularios:** `react-hook-form` + `zod` + `@hookform/resolvers`.

## Infraestructura Docker

Archivo: `docker-compose.dev.yml`. Incluye PostgreSQL, Redis, pgBouncer (`edoburu/pgbouncer`).
Variables pgBouncer: `DB_USER`, `DB_HOST`, `DB_NAME` (no bitnami).

## Workflow y Restricciones

1. Verificar versiones de stack en `docs/prds/Stack_Tecnologico.md` — no asumir.
2. Toda ejecución con cambios debe actualizar un informe en `docs/informes/`. Para correcciones, actualizar el informe existente en vez de crear uno nuevo.
3. Nuevos documentos: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md` (ej: `INFORME-MOD01-SPRINT-01-v1.1.md`).
4. Si se genera un prompt de ejecución por fase, usar `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` como base.
5. No iniciar módulo N+1 sin cerrar N (ADR-016).
6. Todo código generado debe incluir comentarios funcionales en español cuando la lógica no sea trivial.

## Gotchas conocidos — Auth / MFA

- `@Roles()` siempre con enum `UserRole.*` — string literals como `'tenant_admin'` no arrojan error pero causan 403 silencioso.
- `auth.controller.ts`: cada flag de respuesta (`mfaRequired`, `mfaSetupRequired`) debe propagarse explícitamente con spread en el return del controller — NestJS no serializa automáticamente campos extra del servicio.
- `setupMfa()` es idempotente por diseño: reutiliza `mfa:pending:{userId}` en Redis si ya existe. Previene race condition con React Strict Mode que invoca `useEffect` dos veces en dev.
- `useEffect` que llama endpoints de setup de MFA debe usar `[]` como dependencia — nunca `[router]`.
- `TenantContext.getOrThrow()` lanza `Error` genérico (→ 500), no `UnauthorizedException` (→ 401). Si falta contexto en una ruta protegida, el error es 500, no 401.
- Token `scope='mfa-setup'` SÍ contiene `tenantId` + `schemaName` — TenantMiddleware lo resuelve correctamente sin necesidad de `X-Tenant-Slug`.
- **Portal — dos tokens en localStorage:** `iwana.portal.access-token` (sesión completa) y `iwana.portal.mfa-setup-token` (alcance limitado, solo durante setup MFA). `api-client.mfaSetup()` y `mfaVerifySetup()` leen el segundo directamente, sin pasar por `request()`.

## Formato de Respuesta

- Explicita el **modo activo** (EM / Architect / Mixto) al inicio de entregables mayores.
- Incluye **referencias** a docs cuando tomes decisiones.
- Usa el formato de escalación `[ESCALACION AL CTO]` cuando corresponda.

## Precedencia Documental

1. CTO Humano y ADRs aprobados
2. PRD del sistema → `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md`
3. HLD del módulo vigente (`docs/hlds/`)
4. Baseline del sprint + `docs/prds/Stack_Tecnologico.md`
5. ADRs individuales → `docs/adrs/` (ADR-017 a ADR-024; ADR-001-016 inline en PRD v2.2)
