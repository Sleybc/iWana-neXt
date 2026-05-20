# INFORME — Scaffold MOD01

**Version:** 1.0
**Fecha:** 2026-03-12
**Convencion documental:** INFORME-MOD01-SCAFFOLD-v1.0.md

## Vinculos de trazabilidad

- Plantilla base: docs/informes/TEMPLATE-INFORME-FASE-v1.0.md
- Plan ejecutado: docs/plans/2026-03-08-mod01-scaffold.md
- HLD referenciado: docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md (Seccion 7)
- Politica de ejecucion: ADR-022

---

## Identificacion

- Modulo: MOD01 — Auth / Tenant / Audit (base tecnica)
- Fase: Sprint 0 — Scaffold
- Sprint: Sprint 00
- Fecha: 2026-03-12
- Responsable principal: AI-EM-Architect (Claude Sonnet 4.6)

---

## 1. Resumen ejecutivo

- **Objetivo de la fase:** Crear el monorepo Turborepo funcional con 4 apps scaffoldeadas, infraestructura Docker dev operativa, CI basico en GitHub Actions y design tokens iWana integrados — base tecnica para Sprint 1.
- **Resultado alcanzado:** Todos los criterios de aceptacion CA-SCAFFOLD-001 a CA-SCAFFOLD-004 verificados y aprobados. Commit inicial creado: `7595995`.
- **Estado:** ✅ Completa

---

## 2. Entregables implementados

### Monorepo (raiz)

| Archivo | Descripcion |
| ------- | ----------- |
| `package.json` | Root workspace con scripts turbo, packageManager pnpm@10.32.1 |
| `pnpm-workspace.yaml` | Configuracion pnpm workspaces (apps/*, packages/*), useNodeVersion 24.13.1 |
| `turbo.json` | Pipeline Turborepo: build, dev, lint, typecheck, test, clean |
| `.gitignore` | Excluye dist/, .next/, .turbo/, secrets/*.pem, .env.local |
| `.npmrc` | Hoist patterns para eslint, @typescript-eslint/*, prettier |
| `.prettierrc.json` | Config Prettier raiz (singleQuote, lf, trailingComma) |
| `eslint.config.mjs` | ESLint v9 flat config con @typescript-eslint/parser, sin reglas Sprint 0 |

### packages/

| Paquete | Descripcion |
| ------- | ----------- |
| `@iwana/config` | tsconfig.base/nestjs/nextjs, .eslintrc.base.js, prettier.config.js |
| `@iwana/shared` | 4 enums (UserRole, UserStatus, TenantStatus, AuditAction), `ApiResponse<T>`, ProblemDetail RFC 7807, PaginationQueryDto |
| `@iwana/db` | Placeholder TypeORM — entidades en Sprint 1. tenant_template.sql stub |
| `@iwana/ui` | Design tokens (colors #17163A/#A5C330), typography (Exo 2), spacing. globals.css Tailwind 4 CSS-first con @theme {} |

### apps/

| App | Puerto | Descripcion |
| --- | ------ | ----------- |
| `@iwana/api` | 3000 | NestJS 11.1.14 scaffold — AppModule vacio, modulos de negocio en Sprint 1 |
| `@iwana/web` | 3001 | Next.js 16.1.6 Portal Administrativo — layout + page placeholder |
| `@iwana/portal` | 3002 | Next.js 16.1.6 Portal de Suscriptores — layout + page placeholder |
| `@iwana/worker` | — | NestJS WorkerModule BullMQ — sin puerto HTTP, workers en Sprint 1 |

### Docker

| Archivo | Descripcion |
| ------- | ----------- |
| `docker-compose.yml` | Infraestructura local unica: postgres, redis, pgbouncer, minio, typesense, nginx y adminer |
| `scripts/dev.mjs` | Orquestador de `pnpm dev`: levanta Docker, inicializa MinIO, ejecuta migraciones y arranca API/web/portal/worker en host |
| `Dockerfile.api` | Multi-stage 3 etapas, usuario nestjs uid 1001, EXPOSE 3000 |
| `Dockerfile.web` | Multi-stage 3 etapas, Next.js standalone, usuario nextjs uid 1001, EXPOSE 3001 |
| `Dockerfile.worker` | Multi-stage 3 etapas, sin puerto HTTP, usuario worker uid 1001 |
| `nginx/nginx.dev.conf` | Proxy /api/ → api:3000, /health check |

### CI/CD y Git

| Archivo | Descripcion |
| ------- | ----------- |
| `.github/workflows/ci.yml` | Node 24, pnpm 10, cache store, install → lint → typecheck → build |
| `.husky/pre-commit` | lint-staged scoped a apps/ y packages/ |
| `.husky/commit-msg` | commitlint conventional commits |
| `commitlint.config.js` | extends @commitlint/config-conventional, header max 100 chars |
| `.lintstagedrc.js` | Scoped: apps/packages TS/TSX, json/yaml/md en project dirs, root JS/JSON |

### Secretos

| Archivo | Descripcion |
| ------- | ----------- |
| `secrets/.gitkeep` | Directorio versionado sin los .pem (correctamente ignorados) |
| `scripts/generate-secrets.sh` | Genera jwt-private.pem, jwt-public.pem y ENCRYPTION_KEY |
| `secrets/jwt-private.pem` | RSA 2048-bit — generado localmente, NO versionado |
| `secrets/jwt-public.pem` | Clave publica JWT — generada localmente, NO versionada |

---

## 3. Evidencia funcional

### CA-SCAFFOLD-001: Docker dev stack

```text
$ docker compose --env-file .env -f docker-compose.yml ps
NAME                  IMAGE                       STATUS
iwana_postgres_dev    postgres:18-alpine         Up (healthy) — 5432
iwana_redis_dev       redis:8-alpine             Up (healthy) — 6379
iwana_pgbouncer_dev   edoburu/pgbouncer:latest   Up (healthy) — 6432
iwana_minio_dev       minio/minio:latest         Up (healthy) — 9000/9001
iwana_typesense_dev   typesense/typesense:27.1   Up (healthy) — 8108
iwana_nginx_dev       nginx:alpine               Up (healthy) — 80
iwana_adminer_dev     adminer:latest             Up — 8080

$ docker exec iwana_postgres_dev pg_isready -U iwana -d iwana_next
/var/run/postgresql:5432 - accepting connections ✓

$ docker exec iwana_redis_dev redis-cli ping
PONG ✓
```

### CA-SCAFFOLD-002: pnpm build

```text
turbo run build — 6 Tasks: 6 successful, 0 failed
- @iwana/shared: tsc ✓
- @iwana/db: tsc ✓
- @iwana/api: nest build ✓
- @iwana/worker: nest build ✓
- @iwana/web: next build (Turbopack, 17s) ✓
- @iwana/portal: next build (Turbopack, 17s) ✓
```

### CA-SCAFFOLD-003: pnpm lint

```text
turbo run lint — 7 Tasks: 7 successful, 0 failed
ESLint v9 flat config con @typescript-eslint/parser — 0 errores ✓
```

### CA-SCAFFOLD-004: pnpm typecheck

```text
turbo run typecheck — 7 Tasks: 7 successful, 0 failed
TypeScript strict en todos los workspaces — 0 errores ✓
```

---

## 4. Evidencia de calidad

- **Unit tests:** No aplica en Sprint 0 (scaffold sin logica de negocio). Infraestructura Jest configurada en apps/api y apps/worker para Sprint 1.
- **Integration tests:** No aplica en Sprint 0.
- **E2E tests:** No aplica en Sprint 0.
- **Cobertura:** 0% — sin codigo de negocio que cubrir.
- **Hallazgos abiertos:**
  - DT-SCAFFOLD-01: `bitnami/pgbouncer:latest` removido de Docker Hub → reemplazado con `edoburu/pgbouncer:latest` (equivalente, vars DB_USER/DB_HOST/DB_NAME)
  - DT-SCAFFOLD-02: pnpm.onlyBuiltDependencies requerido para @nestjs/core, msgpackr-extract, sharp
  - DT-SCAFFOLD-03: `packageManager` field requerido en root package.json para Turborepo 2.x
  - DT-SCAFFOLD-04: ESLint v9 flat config requiere .mjs extension y @typescript-eslint/parser explicitamente

---

## 5. Cambios documentales

- **PRD actualizado:** No — scaffold no altera PRD maestro
- **HLD actualizado:** No — scaffold sigue HLD-MOD01-ARQUITECTURA-v1.0 Seccion 7 sin modificaciones
- **ADR nuevo o referenciado:**
  - ADR-017: Multi-tenant schema isolation (referenciado en packages/database)
  - ADR-019: NestJS Modulith (referenciado en apps/api)
  - ADR-020: BullMQ jobs asincronos (referenciado en apps/worker)
  - ADR-023: Frontend hybrid auth (referenciado en apps/web/portal — Sprint 1)
  - ADR-026: shadcn/ui + Radix + CVA (referenciado en packages/ui — Sprint 1)
- **Otros documentos afectados:** Ninguno

---

## 6. Riesgos y bloqueos

| ID | Riesgo | Mitigacion aplicada |
| -- | ------ | ------------------- |
| R-01 | bitnami/pgbouncer removido de Docker Hub | Reemplazado con edoburu/pgbouncer — funcional y probado |
| R-02 | pnpm 10 no instalable via Corepack (permisos NTFS) | Instalado via npm install -g pnpm@10 — misma version |
| R-03 | lint-staged ejecutando sobre 2800+ archivos en commit inicial | lintstagedrc scoped a apps/, packages/ y root — resuelto |
| R-04 | Conflicto merge en .lintstagedrc.js tras fallo de lint-staged | Resuelto manualmente + .prettierrc.json en raiz agregado |

- **Bloqueo tecnico activo:** Ninguno

---

## 7. Decision de salida

- **Puede pasar a siguiente fase:** ✅ Si
- **Requiere correcciones previas:** No
- **Aprobadores pendientes:** CTO (revision de commit y estructura antes de iniciar Sprint 1)
- **Proxima fase:** Sprint 1 — MOD01 Auth/Tenant/Audit (NestJS Modulith + JWT RS256 + Multi-tenant)

---

## 8. Verificacion de ejecucion en runtime (2026-03-12 — sesion post-cierre)

**Objetivo:** Confirmar que el proyecto arranca correctamente en modo desarrollo y todos los servicios operan de extremo a extremo.

### 8.1 Problemas detectados y corregidos

| ID | Componente | Problema | Correccion aplicada |
| -- | ---------- | -------- | ------------------- |
| FIX-01 | `nginx/nginx.dev.conf` | `host not found in upstream "api:3000"` — API corre en host, no en Docker | Cambiado a `server host.docker.internal:3000` |
| FIX-02 | `apps/api/.env` | Archivo no existia — API no arrancaba por variables faltantes | Creado con todos los valores de dev (DB, Redis, JWT, MFA, CORS) |
| FIX-03 | `apps/api/src/app.module.ts` | Schema Joi usaba `DATABASE_*` pero el codigo usa `DB_*` | Corregidas las claves: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` |
| FIX-04 | `apps/api/src/modules/auth/auth.module.ts` | JWT PEM keys como variable de entorno de una sola linea perdian los saltos de linea | Agregado `.replace(/\\n/g, '\n')` a `JWT_PRIVATE_KEY` y `JWT_PUBLIC_KEY` |
| FIX-05 | `apps/api/src/app.module.ts` | TypeORM `useFactory: () => ({...dataSourceOptions})` leia `process.env` en tiempo de importacion (antes de que ConfigModule cargara `.env`) — contrasena vacia | Reemplazado con `useFactory: (config: ConfigService): TypeOrmModuleOptions => ({...})` con valores de ConfigService |
| FIX-06 | 5 entidades en `@iwana/db` | `DataTypeNotSupportedError: Data type "Object"` — columnas `string \| null` sin `type` explicito; `reflect-metadata` reporta `Object` en TypeScript union types | Agregado `type: 'varchar'` (12 columnas) y `type: 'uuid'` (2 columnas) en los decoradores `@Column` de los 5 archivos de entidades |
| FIX-07 | `apps/api/src/app.module.ts` | Warnings `Unsupported route path` en NestJS 11 — `path-to-regexp` ya no acepta `(.*)` ni `*` sin nombre | Cambiado a `tenants/*path` y `{ path: '*path', method: RequestMethod.ALL }` |
| FIX-08 | `.env` raiz y `.env.example` | Faltaba el archivo requerido por `docker-compose.yml` para produccion; la plantilla ademas apuntaba a `.env.local`, lo que mezclaba flujo de desarrollo con despliegue | Creado `.env` raiz con placeholders seguros y corregida `.env.example` para distinguir raiz/produccion de `apps/api/.env` |
| FIX-09 | `apps/api/.env` y `docker-compose.yml` | Desarrollo local quedaba desalineado respecto a la nueva configuracion objetivo `dbiw` / `Iwana102+` | Actualizados API dev, PostgreSQL dev y pgBouncer dev para usar la misma base y credenciales; requiere recrear el volumen local si ya existia con el esquema anterior |
| FIX-10 | `apps/api/src/modules/auth/strategies/jwt.strategy.ts` | La verificacion RS256 fallaba con PEM cargado desde variable de entorno porque `JWT_PUBLIC_KEY` no normalizaba `\\n` | Agregado `.replace(/\\n/g, '\n')` en `secretOrKey` para que los Bearer tokens validos sean aceptados |
| FIX-11 | `apps/worker/src/processors/tenant-provisioning.processor.ts` | El worker resolvia `tenant_template.sql` hacia `apps/packages/...` y el provisioning fallaba con `ENOENT` | Corregida la ruta relativa a `../../../../packages/database/src/templates/tenant_template.sql`; provisioning validado con tenant `demoisp2` en estado `ACTIVE` |
| FIX-12 | `apps/api/src/modules/auth/*` | No existia un flujo formal de login de plataforma ni bootstrap del primer SYSTEM_ADMIN, lo que obligaba a firmar tokens manualmente para operar `/tenants` | Agregado `POST /api/v1/auth/platform/login` y bootstrap opcional del superusuario de plataforma desde variables locales de entorno |
| FIX-13 | `apps/api/src/main.ts` | Acceder a `http://localhost:3000/` devolvia 404 JSON y Firefox intentaba cargar `/favicon.ico`, generando `NS_ERROR_DOM_CORP_FAILED` por politica CORP | Agregadas respuestas explicitas para `GET /` (`200 text/plain`) y `GET /favicon.ico` (`204` con `Cross-Origin-Resource-Policy: cross-origin`); Helmet mantiene CORP restrictivo en produccion |

### 8.2 Migraciones ejecutadas

- Migracion `CreatePublicSchema1741766400000` ejecutada exitosamente.
- Tablas creadas en `public`: `typeorm_migrations`, `tenants`, `platform_users`, `platform_audit_logs`.
- Tablas tenant-scoped (`users`, `audit_logs`, `refresh_tokens`) se crean dinamicamente en el schema del tenant durante el provisioning.

### 8.3 Evidencia de verificacion final

```text
# Docker — todos los servicios operativos
NAME                  STATUS
iwana_adminer_dev     Up
iwana_minio_dev       Up (healthy)
iwana_nginx_dev       Up
iwana_pgbouncer_dev   Up
iwana_postgres_dev    Up (healthy)
iwana_redis_dev       Up (healthy)

# Tests
Tests: 121 passed, 121 total — 10 suites
Time: ~16s

# API
GET http://localhost:3000/api/v1/docs → 200 OK (Swagger UI)
Nest application successfully started — sin errores ni warnings de tipo

# Typecheck
pnpm --filter @iwana/api exec tsc --noEmit → 0 errors
```

---

## Notas adicionales

### Desviaciones respecto al plan original

1. **pgBouncer image:** `bitnami/pgbouncer:latest` → `edoburu/pgbouncer:latest` (imagen no disponible en Docker Hub)
2. **pnpm installation:** Corepack global install bloqueado por NTFS → `npm install -g pnpm@10`
3. **root package.json additions:** `packageManager`, `pnpm.onlyBuiltDependencies`, `eslint + @typescript-eslint/*` agregados como necesidad del scaffold real
4. **eslint.config.mjs:** Creado en raiz como flat config ESLint v9 para hoisting correcto en monorepo pnpm 10
5. **lint-staged:** Scoped a directorios de proyecto para evitar procesar el antiguo archivo local de skills, ya retirado del repo

### Artefactos de Sprint 1 desbloqueados

- `packages/database/src/entities/` → TypeORM entities (User, Tenant, AuditLog, RefreshToken)
- `packages/database/src/migrations/public/` → Migraciones PostgreSQL schema publico
- `packages/database/src/templates/tenant_template.sql` → DDL completo por tenant
- `apps/api/src/` → AuthModule, TenantModule, AuditModule, UsersModule
- `apps/worker/src/` → TenantProvisioningProcessor, RefreshTokenPurgeProcessor
- `apps/web/src/` → LoginPage, MFAVerify, AuthProvider, proxy.ts
- `packages/ui/src/components/` → Button, Input, Card, Checkbox (shadcn/ui + CVA)
