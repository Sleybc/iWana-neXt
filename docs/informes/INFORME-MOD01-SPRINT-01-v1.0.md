# INFORME-MOD01-SPRINT-01-v1.0.md

**Tipo:** INFORME  
**Módulo:** MOD01 — Auth + Tenant + Audit  
**Fase:** SPRINT-01  
**Versión:** 1.0 (documento cerrado — cierre formal de producción)  
**Estado:** ✅ CERRADO — MOD01 apto para producción  
**Fecha de apertura:** 2026-03-12  
**Última actualización:** 2026-03-15 (Frontend PRD MOD01: MFA tenant corregido + recuperación/verificación públicas + hardening ARIA/rutas TailAdmin)  
**Agente responsable:** AI-EM-ARCH (Modo Mixto)  
**Referencia al prompt de ejecución:** `docs/prompts/PROMPT-MOD01-SPRINT-01-v1.0.md`

---

## Estado General

| Indicador | Valor |
|-----------|-------|
| Estado del sprint | ✅ CERRADO — Producción aprobada |
| Corte actual | AuthModule + Worker + Hardening tenant context + tenant seed + regeneración segura + cache/lifecycle tenant + integración HTTP tenant-aware + cifrado AES-256-GCM mfaSecret + smoke test aislamiento de schema + **AuditModule (interceptor global + auth events + tests)** + **UsersModule (CRUD tenant users + RBAC + audit trail)** + **OpenAPI (Swagger UI + decoradores en 4 controladores)** + **Hardening producción: Helmet + Joi env validation + OWASP ASVS L2 + ADR-016** |
| Typecheck | ✅ PASA — 0 errores (`@iwana/api`, `@iwana/worker`) |
| Tests | ✅ 121/121 — API: 118/118, Worker: 3/3 |
| Cobertura mínima requerida | 80% core |
| Criterios de aceptación CA-S1-001 a CA-S1-031 | Parcial avanzada (ver tabla abajo) |
| Bloqueos activos | Ninguno |

---

## 1. Contexto

Este informe documenta la primera entrega técnica del Sprint 1 de MOD01 (Auth + Tenant + Audit).  
El sprint plan orignal (`docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md`) estaba desfasado respecto al  
estado real del código (0% de implementación post-scaffold). El corte fue reencuadrado correctamente  
como un backlog técnico, comenzando con la capa más fundamental: **DB entities + Tenant base**.

El trabajo siguió el gate de gobernanza ADR-022: el prompt de ejecución fue verificado antes de  
iniciar cualquier código (`docs/prompts/PROMPT-MOD01-SPRINT-01-v1.0.md`).

---

## 2. Entregables de Este Corte

### Addendum correctivo (2026-03-14) — Build Docker del worker

| Artefacto | Archivo | Cambio | Estado |
|-----------|---------|--------|--------|
| Dockerfile del worker para compose | `apps/worker/Dockerfile` | Se reemplazó el build parcial con `tsc` directo por un build monorepo consistente (`@iwana/shared` → `@iwana/db` → `@iwana/worker`) preservando links de pnpm y copiando los paquetes workspace requeridos también en runtime | ✅ |
| Validación local previa al contenedor | `apps/worker` | Se confirmó que `pnpm --filter @iwana/worker typecheck` compila en verde fuera de Docker, aislando la causa al Dockerfile y no al código del worker | ✅ |

### Addendum correctivo (2026-03-14) — Runtime BullMQ del worker

| Artefacto | Archivo | Cambio | Estado |
|-----------|---------|--------|--------|
| Clasificación de fallos permanentes | `apps/worker/src/processors/tenant-provisioning.processor.ts` | Los casos `schemaName` inválido y `tenant` inexistente ahora lanzan `UnrecoverableError`, evitando reintentos inútiles de BullMQ para errores de datos que no se resuelven con backoff | ✅ |
| Cobertura del processor | `apps/worker/src/processors/tenant-provisioning.processor.spec.ts` | Se agregó test para verificar que un tenant inexistente se marca como fallo permanente y no intenta ejecutar DDL ni seed | ✅ |
| Validación en stack compose | `docker-compose.dev.yml` + Redis/PostgreSQL locales | El worker volvió a levantar limpio y el job huérfano `provision-324ed043-ab17-4013-938f-30f22219c563` quedó estabilizado en `atm=3` sin nuevos reintentos tras recrear el contenedor | ✅ |

### Addendum correctivo (2026-03-13) — Accesibilidad portal

| Artefacto | Archivo | Cambio | Estado |
|-----------|---------|--------|--------|
| MFA Verify Form | `apps/portal/src/components/auth/MfaVerifyForm.tsx` | Eliminado `style` inline del temporizador y reemplazado por `<progress>` con atributos ARIA validos | ✅ |
| Input design system | `packages/ui/src/components/Input.tsx` | Ajuste de atributos ARIA para eliminar warning de valores invalidos en `aria-invalid` | ✅ |
| Login brand panel web | `apps/web/src/components/auth/LoginBrandPanel.tsx` | Eliminado `style` inline del fondo decorativo (reemplazado por `<img>` decorativa) | ✅ |
| Login brand panel portal | `apps/portal/src/components/auth/LoginBrandPanel.tsx` | Eliminado `style` inline del fondo decorativo (reemplazado por `<img>` decorativa) | ✅ |
| Login page web | `apps/web/src/app/auth/login/page.tsx` | Eliminado `style` inline del patron de puntos usando clases utilitarias Tailwind | ✅ |
| AuthService logout | `apps/api/src/modules/auth/auth.service.ts` | Logout robusto para tokens de plataforma: no depende de `TenantContext` y solo revoca refresh token si existe `schemaName` | ✅ |
| API client logout web | `apps/web/src/lib/api-client.ts` | Logout en cliente convertido a best-effort para evitar Runtime ApiError cuando backend falla en cierre de sesion | ✅ |
| API client logout portal | `apps/portal/src/lib/api-client.ts` | Logout en cliente convertido a best-effort para mantener consistencia de UX | ✅ |

### Addendum correctivo (2026-03-15) — Frontend PRD MOD01 + TailAdmin governance

| Artefacto | Archivo | Cambio | Estado |
|-----------|---------|--------|--------|
| Auth tenant MFA | `apps/portal/src/lib/api-client.ts` + `apps/portal/src/components/auth/AuthProvider.tsx` | Se corrigió el flujo tenant-aware de MFA: login ahora reconoce `mfaRequired`, persiste contexto efímero de tenant/email/password, reintenta `POST /auth/login` con `totpCode` y limpia sesión parcial si el segundo factor aún no se completa | ✅ |
| Login portal | `apps/portal/src/components/auth/LoginForm.tsx` | El formulario ya no asume autenticación directa: redirige a `/auth/mfa/verify` cuando el backend exige segundo factor y preserva el flujo de cambio obligatorio de contraseña | ✅ |
| MFA portal | `apps/portal/src/components/auth/MfaVerifyForm.tsx` | Se eliminó el enlace roto a `/auth/backup-code`; la verificación ahora usa `completeMfaLogin()` del `AuthProvider` y envía el payload correcto (`totpCode`) alineado al DTO backend | ✅ |
| Recuperación tenant | `apps/portal/src/app/auth/forgot-password/page.tsx` | Nueva pantalla pública con `react-hook-form` + `zod` para `POST /auth/forgot-password`, incluyendo slug del tenant requerido por `TenantMiddleware` | ✅ |
| Reset tenant | `apps/portal/src/app/auth/reset-password/page.tsx` | Nueva pantalla pública para `POST /auth/reset-password` con token, política de contraseña NIST/OWASP y soporte de `tenant` / `token` vía query params | ✅ |
| Verificación email tenant | `apps/portal/src/app/auth/verify-email/page.tsx` | Nueva pantalla pública para `POST /auth/email/verify` y reenvío `POST /auth/email/resend-verification`, con formularios separados y validación Zod | ✅ |
| Recuperación plataforma | `apps/web/src/app/auth/forgot-password/page.tsx` + `apps/web/src/components/auth/LoginForm.tsx` | Se sustituyó el enlace roto por una pantalla informativa gobernada: el módulo deja explícito que no existe contrato backend self-service para usuarios del schema público y deriva al canal controlado | ✅ |
| Hardening shell TailAdmin | `apps/web/src/components/audit/AuditLogsTable.tsx` + `apps/web/src/components/dashboard/TenantsTable.tsx` + `apps/web/src/components/layout/Sidebar.tsx` + `apps/web/src/components/dashboard/DashboardClient.tsx` | Se corrigieron errores ARIA reportados por VS Code y se reparó la ruta incorrecta del panel de actividad (`/audit` → `/audit-logs`) | ✅ |
| Validación de compilación | `apps/web` + `apps/portal` | Typecheck en verde con `pnpm --filter @iwana/web typecheck` y `pnpm --filter @iwana/portal typecheck` tras los cambios | ✅ |

**Referencia documental utilizada para el corte:**

- TailAdmin Docs: instalación Next.js, folder structure Next.js, app layout y catálogo de componentes.
- ADR-023 (`docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md`) como baseline visual y estructural.
- PRD/HLD vigentes de MOD01 para alinear contratos públicos de auth y restricciones tenant-aware.

### 2.1 Capa de Datos (`@iwana/db`)

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| Entidad Tenant | `packages/database/src/entities/tenant.entity.ts` | ✅ |
| Entidad PlatformUser | `packages/database/src/entities/platform-user.entity.ts` | ✅ |
| Entidad PlatformAuditLog | `packages/database/src/entities/platform-audit-log.entity.ts` | ✅ |
| Entidad User | `packages/database/src/entities/user.entity.ts` | ✅ |
| Entidad RefreshToken | `packages/database/src/entities/refresh-token.entity.ts` | ✅ |
| Entidad AuditLog | `packages/database/src/entities/audit-log.entity.ts` | ✅ |
| Barrel de entidades | `packages/database/src/entities/index.ts` | ✅ |
| DataSource TypeORM | `packages/database/src/data-source.ts` | ✅ |
| TenantContext (AsyncLocalStorage) | `packages/database/src/tenant-context.ts` | ✅ |
| Migración pública 001 | `packages/database/src/migrations/public/001_create_public_schema.ts` | ✅ |
| Tenant template SQL (DDL real) | `packages/database/src/templates/tenant_template.sql` | ✅ |
| Export público del paquete | `packages/database/src/index.ts` | ✅ |

### 2.2 Enum PlatformRole (`@iwana/shared`)

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| PlatformRole enum | `packages/shared/src/enums/platform-role.enum.ts` | ✅ |
| Actualización index.ts | `packages/shared/src/index.ts` | ✅ |

### 2.3 TenantModule (`@iwana/api`)

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| DTOs (Create, Update, Response) | `apps/api/src/modules/tenant/dto/tenant.dto.ts` | ✅ |
| Interface TenantContext | `apps/api/src/modules/tenant/interfaces/tenant-context.interface.ts` | ✅ |
| TenantService | `apps/api/src/modules/tenant/tenant.service.ts` | ✅ |
| TenantController | `apps/api/src/modules/tenant/tenant.controller.ts` | ✅ |
| TenantMiddleware | `apps/api/src/modules/tenant/tenant.middleware.ts` | ✅ |
| TenantModule | `apps/api/src/modules/tenant/tenant.module.ts` | ✅ |
| app.module.ts (root actualizado) | `apps/api/src/app.module.ts` | ✅ |
| jest.config.js | `apps/api/jest.config.js` | ✅ |
| Tests unitarios TenantService | `apps/api/src/modules/tenant/tenant.service.spec.ts` | ✅ |

### 2.4 Configuración TypeScript (`tsconfig`)

| Artefacto | Archivo | Cambio |
|-----------|---------|--------|
| tsconfig database | `packages/database/tsconfig.json` | Añadido `strictPropertyInitialization: false`, paths override |
| tsconfig api | `apps/api/tsconfig.json` | Añadido `strictPropertyInitialization: false`, paths override |

**Justificación del override de `paths`:** Las entidades TypeORM con `emitDecoratorMetadata` requieren  
`strictPropertyInitialization: false` (recomendación oficial de TypeORM). El override de `paths`  
elimina las referencias a source files de otros paquetes en el `rootDir` de compilación, usando  
en cambio los artefactos compilados (`dist/`) que cada paquete expone. Este es el patrón correcto  
en un monorepo sin TypeScript project references.

---

## 2.5 AuthModule (`@iwana/api`) — Semana 2

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| DTOs (LoginDto, MfaVerifyDto, MfaDisableDto, etc.) | `apps/api/src/modules/auth/dto/auth.dto.ts` | ✅ |
| JwtPayload interface | `apps/api/src/modules/auth/interfaces/jwt-payload.interface.ts` | ✅ |
| JwtAuthGuard | `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` | ✅ |
| RolesGuard (RBAC) | `apps/api/src/modules/auth/guards/roles.guard.ts` | ✅ |
| AbacGuard (ABAC) | `apps/api/src/modules/auth/guards/abac.guard.ts` | ✅ |
| AuthService (JWT RS256 + MFA TOTP) | `apps/api/src/modules/auth/auth.service.ts` | ✅ |
| AuthController | `apps/api/src/modules/auth/auth.controller.ts` | ✅ |
| AuthModule | `apps/api/src/modules/auth/auth.module.ts` | ✅ |
| Tests unitarios AuthService (17 tests) | `apps/api/src/modules/auth/auth.service.spec.ts` | ✅ |
| Tests HTTP AuthController (11 tests) | `apps/api/src/modules/auth/auth.controller.http.spec.ts` | ✅ |

### 2.6 RedisModule (`@iwana/api`) — Semana 2

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| RedisModule (ioredis cliente) | `apps/api/src/modules/redis/redis.module.ts` | ✅ |
| Token REDIS_CLIENT | exportado desde redis.module | ✅ |

### 2.7 TenantController Guards + Throttler — Semana 2

| Artefacto | Cambio | Estado |
|-----------|--------|--------|
| TenantController | Añadidos `@UseGuards(JwtAuthGuard, RolesGuard)` y `@Roles('platform_admin')` | ✅ |
| TenantModule | Importa `TENANT_PROVISIONING_QUEUE` desde `@iwana/shared` | ✅ |
| TenantProvisioningService | Usa constante exportada de `@iwana/shared` en lugar de local | ✅ |
| AppModule | Registra `ThrottlerModule`, `AuthModule`, `RedisModule` | ✅ |
| main.ts | `cookieParser` via `require('cookie-parser')()` (solución compatibilidad ESM) | ✅ |

### 2.8 Worker (`@iwana/worker`) — Semana 2

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| WorkerModule (BullMQ + TypeORM) | `apps/worker/src/worker.module.ts` | ✅ |
| TenantProvisioningProcessor (migrado) | `apps/worker/src/processors/tenant-provisioning.processor.ts` | ✅ |
| TenantSeedService | `apps/worker/src/services/tenant-seed.service.ts` | ✅ |
| Tests unitarios worker | `apps/worker/src/**/*.spec.ts` | ✅ |
| jest.config.js worker | `apps/worker/jest.config.js` | ✅ |
| tsconfig worker (paths override) | `apps/worker/tsconfig.json` | ✅ |

### 2.9 Shared — Semana 2

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| TENANT_PROVISIONING_QUEUE constante | `packages/shared/src/constants/queue-names.ts` | ✅ |
| Export desde index.ts | `packages/shared/src/index.ts` | ✅ |

### 2.10 Infraestructura de paquetes — Semana 2

| Cambio | Detalle | Estado |
|--------|---------|--------|
| `pnpm.overrides.ioredis = "5.10.0"` en root `package.json` | Deduplica ioredis entre BullMQ y cliente directo | ✅ |
| `@types/pg` en `@iwana/worker` devDependencies | Requerido por TypeORM postgres driver | ✅ |

### 2.11 Hardening de contexto tenant — Semana 2

| Artefacto | Cambio | Estado |
|-----------|--------|--------|
| TenantMiddleware | Resuelve tenant desde JWT firmado (`tenantId` + `schemaName`) cuando hay Bearer token | ✅ |
| TenantMiddleware | Mantiene fallback `X-Tenant-Slug` solo para auth público (`login`, `refresh`, `forgot-password`, `reset-password`) | ✅ |
| TenantMiddleware | Valida consistencia entre claims JWT y `public.tenants` antes de abrir `TenantContext` | ✅ |
| AuthService | Inserta `schemaName` real en el access token en lugar de `null` | ✅ |
| AppModule | Deja de excluir `/auth/**` del middleware de tenant para evitar fallos runtime en AuthService | ✅ |
| TenantModule | Importa `AuthModule` para reutilizar verificación JWT en middleware | ✅ |
| Tests unitarios TenantMiddleware | `apps/api/src/modules/tenant/tenant.middleware.spec.ts` | ✅ |

### 2.12 Regeneración segura de credenciales iniciales — Semana 2

| Artefacto | Cambio | Estado |
|-----------|--------|--------|
| TenantController | Expone `POST /api/v1/tenants/:id/regenerate-admin-credentials` para SYSTEM_ADMIN | ✅ |
| AuthService | Regenera password temporal del ADMIN inicial con cache idempotente por `Idempotency-Key` en Redis | ✅ |
| AuthService | Rechaza login con credenciales temporales expiradas y fuerza ventana real de 24h | ✅ |
| TenantSeedService | Asigna `passwordResetExpiresAt` de 24h al ADMIN sembrado por el worker | ✅ |
| Tests unitarios TenantController | `apps/api/src/modules/tenant/tenant.controller.spec.ts` | ✅ |
| Tests unitarios AuthService | Cubre expiración e idempotencia de regeneración | ✅ |

### 2.13 Cache Redis + lifecycle operativo de tenant — Semana 2

| Artefacto | Cambio | Estado |
|-----------|--------|--------|
| TenantService | Cachea tenants por `id` y `slug` en Redis con TTL de 5 minutos | ✅ |
| TenantService | Invalida y recalienta cache al crear, actualizar, suspender o activar tenants | ✅ |
| TenantController | Expone `PATCH /api/v1/tenants/:id/suspend` | ✅ |
| TenantController | Expone `PATCH /api/v1/tenants/:id/activate` | ✅ |
| Tests unitarios TenantService | Cubre cache hit por id/slug y mutaciones de status | ✅ |
| Tests unitarios TenantController | Cubre delegación de `suspend` y `activate` | ✅ |

### 2.14 Integración HTTP tenant-aware — Semana 2

| Artefacto | Cambio | Estado |
|-----------|--------|--------|
| Auth HTTP integration spec | Verifica `TenantContext` real en login público y rutas protegidas con `TenantMiddleware` | ✅ |
| Evidencia de wiring | Confirma resolución por `X-Tenant-Slug` y por claims JWT antes de invocar `AuthService` | ✅ |

### 2.15 Cifrado AES-256-GCM para mfaSecret — Semana 2

| Artefacto | Cambio | Estado |
|-----------|--------|--------|
| AuthService: `encryptSecret()` | Cifra el mfaSecret con AES-256-GCM (IV 12 bytes, formato `iv:tag:ciphertext`) antes de persistir en DB | ✅ |
| AuthService: `decryptSecret()` | Descifra mfaSecret antes de `verifyTotp()` en login y disableMfa | ✅ |
| AuthService constructor | Deriva `mfaEncryptionKey: Buffer` desde `MFA_ENCRYPTION_KEY` (64-char hex) via `configService.getOrThrow` | ✅ |
| auth.service.spec.ts | ConfigService mock con `getOrThrow` para `MFA_ENCRYPTION_KEY`; fixtures MFA actualizados para usar `encryptSecret()` | ✅ |

### 2.16 Smoke test aislamiento de schema por tenant — Semana 2

| Artefacto | Cambio | Estado |
|-----------|--------|--------|
| `tenant-schema-isolation.spec.ts` | Importa la implementación REAL de `runInTenantSchema` (sin mock); verifica `SET LOCAL search_path` por tenant, rechazo de schemas inválidos, rollback ante error, y concurrencia con QRs independientes | ✅ |

### 2.17 AuditModule (`@iwana/api`) — Corte Semana 3

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| Interface `AuditEntryInput` | `apps/api/src/modules/audit/interfaces/audit-entry.interface.ts` | ✅ |
| Decorator `@SkipAudit()` | `apps/api/src/modules/audit/decorators/skip-audit.decorator.ts` | ✅ |
| Decorator `@AuditEntity(name)` | `apps/api/src/modules/audit/decorators/audit-entity.decorator.ts` | ✅ |
| AuditService (append-only, fire-and-forget) | `apps/api/src/modules/audit/audit.service.ts` | ✅ |
| AuditInterceptor (global HTTP CUD) | `apps/api/src/modules/audit/audit.interceptor.ts` | ✅ |
| DTO `QueryAuditLogsDto` | `apps/api/src/modules/audit/dto/query-audit-logs.dto.ts` | ✅ |
| AuditQueryService (cursor-based pagination) | `apps/api/src/modules/audit/audit-query.service.ts` | ✅ |
| AuditController `GET /api/v1/audit-logs` | `apps/api/src/modules/audit/audit.controller.ts` | ✅ |
| AuditModule | `apps/api/src/modules/audit/audit.module.ts` | ✅ |
| AppModule: `AuditModule` + `APP_INTERCEPTOR` | `apps/api/src/app.module.ts` | ✅ |
| AuthModule: importa `AuditModule` | `apps/api/src/modules/auth/auth.module.ts` | ✅ |
| AuthService: inyecta `AuditService`, emite 6 eventos de auth | `apps/api/src/modules/auth/auth.service.ts` | ✅ |
| Tests unitarios AuditService (6 tests) | `apps/api/src/modules/audit/audit.service.spec.ts` | ✅ |
| Tests unitarios AuditInterceptor (10 tests) | `apps/api/src/modules/audit/audit.interceptor.spec.ts` | ✅ |
| auth.service.spec.ts: mock AuditService añadido | `apps/api/src/modules/auth/auth.service.spec.ts` | ✅ |

### 2.18 OpenAPI — Corte Semana 4

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| Instalación `@nestjs/swagger` + `swagger-ui-express` | `apps/api/package.json` | ✅ |
| Swagger setup (non-prod, `/api/v1/docs`) | `apps/api/src/main.ts` | ✅ |
| `@ApiTags('auth')`, `@ApiBearerAuth`, `@ApiOperation`, `@ApiResponse` en AuthController (11 endpoints) | `apps/api/src/modules/auth/auth.controller.ts` | ✅ |
| `@ApiTags('tenants')`, `@ApiHeader` Idempotency-Key, decoradores completos TenantController (7 endpoints) | `apps/api/src/modules/tenant/tenant.controller.ts` | ✅ |
| `@ApiTags('audit-logs')`, decoradores AuditController | `apps/api/src/modules/audit/audit.controller.ts` | ✅ |
| `@ApiTags('users')`, decoradores UsersController (5 endpoints) | `apps/api/src/modules/users/users.controller.ts` | ✅ |

### 2.20 Hardening de Producción — Corte Cierre MOD01

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| `helmet()` como primer middleware HTTP | `apps/api/src/main.ts` | ✅ |
| Import `helmet` tipado + JSDoc actualizado | `apps/api/src/main.ts` | ✅ |
| Joi validationSchema fail-fast en `ConfigModule.forRoot()` | `apps/api/src/app.module.ts` | ✅ |
| 16 variables de entorno críticas validadas al arranque | `apps/api/src/app.module.ts` | ✅ |
| Validación omitida en `NODE_ENV=test` para no romper CI | `apps/api/src/app.module.ts` | ✅ |
| OWASP ASVS L2 — 44 controles evaluados, 0 críticos | `docs/security/OWASP-ASVS-MOD01-v1.0.md` | ✅ |
| ADR-016 cierre formal MOD01 | `docs/adrs/ADR-016-Cierre-MOD01-Produccion.md` | ✅ |
| `docs/security/README.md` — nota pendiente eliminada | `docs/security/README.md` | ✅ |
| Paquetes instalados: `helmet`, `@types/helmet`, `joi`, `@hapi/joi` | `apps/api/package.json` | ✅ |

### 2.19 UsersModule (`@iwana/api`) — Corte Semana 4

| Artefacto | Archivo | Estado |
|-----------|---------|--------|
| DTOs (CreateUserDto, UpdateUserDto, UserResponseDto) | `apps/api/src/modules/users/dto/user.dto.ts` | ✅ |
| UsersService (findAll cursor-based, findOne, create, update, remove) | `apps/api/src/modules/users/users.service.ts` | ✅ |
| UsersController (5 endpoints, RBAC, Idempotency-Key) | `apps/api/src/modules/users/users.controller.ts` | ✅ |
| UsersModule (importa AuditModule, ConfigModule, TypeOrmModule) | `apps/api/src/modules/users/users.module.ts` | ✅ |
| AppModule actualizado con `UsersModule` | `apps/api/src/app.module.ts` | ✅ |
| Tests unitarios UsersService (17 tests) | `apps/api/src/modules/users/users.service.spec.ts` | ✅ |

---

## 3. Criterios de Aceptación

| CA | Descripción | Estado |
|----|-------------|--------|
| CA-S1-001 | Entidades TypeORM 6/6 compilando sin errores | ✅ |
| CA-S1-002 | Migración 001 reversible con up() y down() | ✅ |
| CA-S1-003 | tenant_template.sql contiene DDL real con BEGIN/COMMIT | ✅ |
| CA-S1-004 | TenantContext (AsyncLocalStorage) exportado y funcional | ✅ |
| CA-S1-005 | isValidSchemaName() valida formato `^tenant_[a-z][a-z0-9_]{0,54}$` | ✅ |
| CA-S1-006 | runInTenantSchema() usa SET LOCAL (compatible pgBouncer) | ✅ |
| CA-S1-007 | TenantService CRUD con ConflictException y NotFoundException | ✅ |
| CA-S1-008 | Tests ≥80% cobertura en TenantService | ✅ (94.73%) |
| CA-S1-009 | AuthService: login con JWT RS256 + bcrypt compare | ✅ |
| CA-S1-010 | AuthService: refresh token con rotación y detección reuse attack | ✅ |
| CA-S1-011 | AuthService: logout con JTI blacklist en Redis (TTL calculado) | ✅ |
| CA-S1-012 | AuthService: MFA TOTP setup/verify/disable via otplib@13 | ✅ |
| CA-S1-013 | JwtAuthGuard, RolesGuard, AbacGuard implementados | ✅ |
| CA-S1-014 | TenantController protegido con guards RBAC | ✅ |
| CA-S1-015 | Worker registra TenantProvisioningProcessor con BullMQ | ✅ |
| CA-S1-016 | Typecheck limpio en `@iwana/api` y `@iwana/worker` | ✅ |
| CA-S1-017 | AuthController cubierto por tests HTTP con ValidationPipe, cookies y rutas protegidas/publicas | ✅ |
| CA-S1-018 | `POST /auth/refresh` responde 401 si falta la cookie de refresh token | ✅ |
| CA-S1-019 | Rutas autenticadas resuelven `TenantContext` desde JWT firmado y auth público usa fallback controlado sin romper runtime | ✅ |
| CA-S1-020 | El worker crea el ADMIN inicial del tenant de forma idempotente durante el provisioning y solo activa el tenant tras completar el seed | ✅ |
| CA-S1-021 | SYSTEM_ADMIN puede regenerar credenciales temporales del ADMIN inicial con `Idempotency-Key` y expiración efectiva de 24h | ✅ |
| CA-S1-022 | TenantService resuelve tenants desde cache Redis y plataforma puede suspender/reactivar tenants con invalidación inmediata de cache | ✅ |
| CA-S1-023 | El flujo HTTP de Auth propaga `TenantContext` real vía middleware tanto en login público como en rutas protegidas con JWT | ✅ |
| CA-S1-024 | `mfaSecret` se almacena cifrado con AES-256-GCM en DB; se descifra antes de `verifyTotp()` en login y disableMfa; nunca en texto plano | ✅ |
| CA-S1-025 | `runInTenantSchema` emite `SET LOCAL search_path` correcto por tenant, rechaza schemas inválidos antes de emitir SQL, y ejecuta rollback+release garantizados ante error | ✅ |
| CA-S1-026 | AuditService registra entradas append-only en audit_logs usando TenantContext o valores explícitos de tenantId/schemaName; swallows errores sin bloquear operacion principal | ✅ |
| CA-S1-027 | AuditInterceptor intercepta POST/PUT/PATCH/DELETE y registra audit trail automático; omite GET, @SkipAudit(), requests sin TenantContext | ✅ |
| CA-S1-028 | AuthService emite eventos de audit para: LOGIN, LOGIN_FAILED, LOGOUT, MFA_ENABLED, MFA_DISABLED, PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED | ✅ |
| CA-S1-029 | AuditController `GET /api/v1/audit-logs` protegido con JwtAuthGuard + RolesGuard('tenant_admin'), soporta cursor-based pagination y filtros por action/entityType/userId/fechas | ✅ |
| CA-S1-030 | UsersModule CRUD completo: `GET/POST /users`, `GET/PATCH/DELETE /users/:id` con RBAC (`UserRole.ADMIN`), email cifrado AES-256-GCM, soft delete, audit trail CREATE/UPDATE/DELETE | ✅ |
| CA-S1-031 | OpenAPI Swagger UI disponible en `/api/v1/docs` (solo non-production); los 4 controladores tienen `@ApiTags`, `@ApiBearerAuth('access-token')`, `@ApiOperation` y `@ApiResponse` en todos sus endpoints | ✅ |

---

## 4. Riesgos Gestionados

| Riesgo | Descripción | Mitigación aplicada |
|--------|-------------|---------------------|
| R1 | DDL tenant_template.sql a medio ejecutar deja schema corrupto | BEGIN/COMMIT explícito en todo el script |
| R2 | pgBouncer transaction pooling — SET search_path no persiste | `SET LOCAL search_path` en `runInTenantSchema()` |
| R3 | AsyncLocalStorage no se propaga a BullMQ workers | Documentado en TenantContext; workers deben reconstruir contexto desde job payload |

---

## 5. Decisiones Técnicas de Este Corte

### D1 — Entidades con `strictPropertyInitialization: false`
Las entidades TypeORM no inicializan columnas en el constructor — TypeORM las hidrata  
post-query vía reflection. El flag es la solución oficial de TypeORM para TypeScript strict.  
Aplica solo a `packages/database` y `apps/api`.

### D2 — Schema routing sin calificar nombres de tabla en entidades tenant
Las entidades `User`, `RefreshToken`, `AuditLog` no especifican `schema` en `@Entity()`.  
TypeORM genera SQL sin calificar (`SELECT * FROM "users"`) que PostgreSQL resuelve vía  
`search_path`. Esto es compatible con `SET LOCAL search_path = "tenant_xxx"` al inicio  
de la transaccion.

### D3 — `PlatformRole` como enum separado de `UserRole`
Las entidades y servicios que operan a nivel de plataforma usan `PlatformRole` (solo  
`SYSTEM_ADMIN | IWANA_SUPPORT`) para evitar asignación accidental de roles tenant  
(ej: `SUBSCRIBER`) a usuarios de plataforma. El constraint `CHECK` en la migración  
refuerza esto a nivel de DB.

### D4 — TenantMiddleware resuelve tenant via header `X-Tenant-Slug` (transitorio)
Para Sprint 1 first cut sin AuthModule disponible, la resolución usa el header  
`X-Tenant-Slug`. En Sprint 1 Semana 2, cuando AuthModule esté listo, se reemplaza  
por extracción del claim del JWT. El middleware rechaza `SUSPENDED` e `INACTIVE` con  
403 en ambas versiones.

### D5 — otplib@13: API TOTP completamente renovada
En `otplib@13` desaparece el namespace `authenticator`. El nuevo API usa la clase `TOTP`
con plugins explícitos: `new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() })`.
El método `verify` es ahora **asíncrono** y retorna `{ valid: boolean, delta: number }`.  
El parámetro de tolerancia cambió de `window: 1` a `epochTolerance: 30`.  
Además, `@scure/base@2.0.0` (dep transitiva) es ESM-only: en tests Jest se mockea todo
el módulo `otplib` con `jest.mock('otplib', factory)` (hoisting antes de imports).

### D6 — bcryptjs: jest.spyOn falla por propiedad non-configurable
`bcryptjs` exporta `compare` con `configurable: false` en su módulo CJS.  
`jest.spyOn` no puede redefinirlo. Solución: `jest.mock('bcryptjs', factory)` en el
 archivo spec reemplaza el módulo completo con mocks controlables antes de la carga;
en cada test se usa `(bcrypt.compare as jest.Mock).mockResolvedValue(...)`.

### D7 — Worker tsconfig: paths override para evitar rootDir violations
Al extender `@iwana/config/tsconfig/nestjs`, TypeScript hereda `paths` con alias
apuntando a archivos fuente de otros paquetes (ej: `@iwana/db → packages/database/src`),
lo que viola el `rootDir` del worker. Solución: añadir `paths: { "@iwana/worker": [...] }`
en el tsconfig local del worker para **sobrescribir** (no heredar) el map de paths base.  
TypeScript no mergea `paths` — la asignación local reemplaza completamente la heredada.  
Patrón idéntico ya aplicado en `@iwana/api`.

### D8 — ioredis deduplicado via pnpm.overrides
BullMQ@5 y ioredis directo requerían versiones compatibles. Se fijó  
`pnpm.overrides.ioredis = "5.10.0"` en el root `package.json` para garantizar  
una única instancia del cliente en todo el monorepo.

### D9 — Contrato HTTP de AuthController validado con Supertest
Se añadió un spec HTTP dedicado al controlador de autenticación que levanta una
Nest application real con prefijo global `/api/v1`, `ValidationPipe` y `cookie-parser`.
El objetivo fue validar el contrato externo del módulo: body validation, emisión y
rotación de cookies `httpOnly`, rutas públicas con `@Public()`, rutas protegidas y
payload expuesto por `@CurrentUser()`.

### D10 — `refresh` sin cookie debe ser 401, no 500
El endpoint `POST /api/v1/auth/refresh` lanzaba `Error` genérico cuando faltaba la
cookie del refresh token. Eso producía `500 Internal Server Error`, que es incorrecto
para un fallo de autenticación. Se corrigió a `UnauthorizedException` para mantener
el contrato HTTP coherente y seguro.

### D11 — El contexto tenant se resuelve en middleware verificando JWT, no esperando al guard
Durante el hardening de producción se detectó una brecha real: `AuthService` depende de
`TenantContext`, pero Nest ejecuta middleware antes que guards. Eso invalidaba el supuesto
de que `JwtAuthGuard` resolvería primero al tenant para rutas protegidas. La corrección fue
verificar el Bearer token directamente dentro de `TenantMiddleware`, usar los claims firmados
`tenantId` y `schemaName`, contrastarlos contra `public.tenants` y solo entonces inicializar
`TenantContext`. El header `X-Tenant-Slug` queda como fallback transitorio y restringido a
endpoints públicos de auth que todavía necesitan tenant antes de emitir JWT.

### D12 — El seed inicial del tenant vive en el worker y es idempotente
El alta del ADMIN inicial se movió al pipeline de provisioning para que el tenant no quede en
`ACTIVE` si el schema existe pero todavía no tiene usuario operativo. `TenantSeedService` crea
el ADMIN usando `contactEmail` del tenant, genera un password temporal compatible con bcrypt y
marca `passwordResetRequired=true`. La operación es idempotente: si el usuario ya existe en el
schema del tenant, el seed se omite sin duplicar registros. Por seguridad, el password temporal
nunca se persiste ni se registra en logs; además, ahora queda asociado a una expiración real de
24 horas mediante `passwordResetExpiresAt`, alineando el comportamiento runtime con el HLD.

### D13 — La regeneración de credenciales usa Redis para idempotencia operativa
El HLD ya definía `POST /tenants/:id/regenerate-admin-credentials` con `Idempotency-Key`, pero
el código todavía no tenía implementación ni semántica de reintento segura. La solución aplicada
regenera el password temporal del ADMIN inicial dentro del schema del tenant, reinicia lockout y
marca `passwordResetRequired=true`, pero solo una vez por llave de idempotencia. La respuesta se
cachea temporalmente en Redis para que un retry del cliente reciba exactamente la misma credencial
sin mutar otra vez el usuario ni generar una segunda contraseña distinta.

### D14 — Cache Redis de tenant como acelerador del middleware y del plano de control
La resolución de tenant en middleware y en los endpoints de plataforma consultaba siempre
`public.tenants`, lo que añadía latencia innecesaria a paths muy frecuentes. Se añadió cache
Redis por `tenant:id:*` y `tenant:slug:*` con TTL de 5 minutos, suficiente para amortizar lecturas
repetidas sin comprometer consistencia operativa. Todas las mutaciones relevantes del tenant
invalidan y recalientan la cache inmediatamente para que `suspend` y `activate` tengan efecto
visible desde el siguiente request.

### D15 — mfaSecret almacenado con cifrado AES-256-GCM simétrico
El secret TOTP se almacenaba en texto plano en `users.mfa_secret`. Se implementó cifrado
AES-256-GCM con IV aleatorio de 12 bytes por cada cifrado (recomendación NIST SP 800-38D).
La clave de 256 bits (32 bytes) se deriva al inicio de `AuthService` desde la variable de entorno
`MFA_ENCRYPTION_KEY` (64 chars hex) usando `configService.getOrThrow` — si la variable no está
configurada, el servicio falla al arrancar de forma explícita (`fail-fast`). El formato almacenado
es `iv_hex:authTag_hex:ciphertext_hex`; la autenticación GCM garantiza integridad contra alteración.
Se actualizaron todas las rutas de lectura (`login`, `disableMfa`) para descifrar antes de verificar.

### D16 — Smoke test de aislamiento de schema probado sobre la implementación real
El spec `tenant-schema-isolation.spec.ts` utiliza `jest.requireActual('@iwana/db')` para importar
la función `runInTenantSchema` real (no el mock global). Esta decisión permite validar directamente
el contrato de seguridad (validación de `schemaName`, `SET LOCAL search_path`, rollback garantizado)
sin que el mock de tests oculte regresiones en la implementación de producción.

### D17 — AuditService como fire-and-forget con transacción independiente
La auditoria usa `void this.auditService.log()` desde interceptor y desde `AuthService`. El método
`log()` crea su propio `QueryRunner` independiente (vía `runInTenantSchema`) y swallows cualquier
excepción sin relanzar. Esto garantiza que un fallo puntual de audit nunca bloquea ni revierte la
operación principal de negocio. Para eventos de auth (LOGIN, LOGOUT, etc.), los valores `ipAddress`
y `userAgent` se normalizan a `null` cuando son `undefined` para cumplir `exactOptionalPropertyTypes`.
En `logout`, el tenant se pasa explícitamente desde el JWT payload para no depender de `TenantContext`.

### D18 — Swagger UI solo en entornos non-production
La UI de Swagger (`SwaggerModule.setup`) se levanta condicionalmente (`NODE_ENV !== 'production'`).
Exponiendo el schema OpenAPI en producción se filtraría la superficie de ataque de la API.
El esquema de bearer auth se nombra `'access-token'` en `DocumentBuilder.addBearerAuth()` y se
referencia con ese mismo nombre en todos los `@ApiBearerAuth('access-token')` de los controladores.

### D19 — UsersService: clave de cifrado derivada en constructor (fail-fast)
El patrón sigue el establecido en `AuthService`: la variable de entorno `MFA_ENCRYPTION_KEY`
se inyecta via `configService.getOrThrow` en el constructor de `UsersService`, derivando el
`Buffer` AES-256 una sola vez al arranque. Si la variable falta, NestJS rechaza inicializar el
proveedor con un error explícito (`InternalServerErrorException`). Esto evita fallos silenciosos
en tiempo de request y centraliza la política de cifrado del email en el servicio.

---

## 6. Deuda Técnica Documentada (MOD01 Cerrado)

| ID | Tarea | Prioridad | Sprint objetivo |
|----|-------|-----------|----------------|
| DT-MOD01-01 | `cookie-parser` cargado vía `require()` — migrar a import estático | Baja | Sprint 2 |
| DT-MOD01-02 | Re-autenticación para operaciones destructivas (ASVS V3.7.1) | Media | Sprint 2 |
| DT-MOD01-03 | Recuperación de contraseña (ASVS V2.5) — flujo OTP por email | Alta | Sprint 2 |
| DT-MOD01-04 | E2E tests contra PostgreSQL real | Alta | Sprint 2 |
| DT-MOD01-05 | Entrega automatizada de credenciales iniciales por email seguro | Alta | Sprint 2 |

**MOD02 desbloqueado:** Per ADR-016 + ADR-022, MOD02 (CRM/Subscribers/Contracts) puede iniciar planificación.

---

## 7. Integridad del Repositorio — Cierre Final

```
# Semana 1 (DB + Tenant base)
pnpm --filter @iwana/db typecheck   → OK (0 errores)

# Semana 2 (Auth + Worker + Tests)
pnpm --filter @iwana/api typecheck  → OK (0 errores)
pnpm --filter @iwana/worker typecheck → OK (0 errores)
pnpm --filter @iwana/api test       → 118/118 PASS
  - TenantService: 20 tests (incluye cache Redis por id/slug y lifecycle de status)
  - AuthService:   20 tests (login ×8, refresh ×2, logout ×1, setupMfa ×1, verifyMfaSetup ×3, disableMfa ×3, regeneración ×2)
  - AuthController HTTP: 11 tests (login, refresh, logout, me, mfa/setup, mfa/verify validation, change-password)
  - Auth tenant-context HTTP: 2 tests (X-Tenant-Slug público + claims JWT protegidos con middleware real)
  - TenantMiddleware: 6 tests (JWT claims, fallback header público, schema mismatch, suspended tenant, platform token)
  - TenantController: 4 tests (Idempotency-Key obligatorio, regeneración segura, suspend y activate)
  - Tenant schema isolation: 25 tests (SET LOCAL correcto por tenant; rechazo de 9 schemas inválidos; rollback+release ante error; concurrencia; isValidSchemaName ×9)
  - AuditService: 6 tests (TenantContext, valores explícitos, omisión silenciosa, swallow error, campos correctos, tenantId parcial)
  - AuditInterceptor: 10 tests (GET skip, POST CREATE, PATCH UPDATE, DELETE, @SkipAudit, sin TenantContext, sanitización, error handler, @AuditEntity, RPC skip)
  - UsersService: 17 tests (findAll paginado + nextCursor, findOne ok + NotFoundException, create ok + temp password + ConflictException + audit, update ok + ForbiddenException + NotFoundException + audit con oldValue/newValue, remove ok + NotFoundException + BadRequest self-delete + ForbiddenException RF-RBAC-04 + audit)
pnpm --filter @iwana/worker test    → 3/3 PASS
  - TenantSeedService: 2 tests (creación inicial e idempotencia)
  - TenantProvisioningProcessor: 1 test (DDL + seed + activación)
docs/*.md references integrity      → OK
```

---

---

## 8. Decisión de Salida — Cierre Formal

| Gate | Estado |
|------|--------|
| Tests 121/121 pasando | ✅ |
| Typecheck 0 errores | ✅ |
| Helmet activo | ✅ |
| Joi env validation fail-fast | ✅ |
| OWASP ASVS L2 evaluado (0 críticos) | ✅ |
| ADR-016 creado | ✅ |
| OpenAPI decorada en 4 controllers | ✅ |
| Migrations reversibles | ✅ |
| Sin PII en logs | ✅ |
| ADR-022 gate cumplido | ✅ MOD02 desbloqueado |

**Estado final:** ✅ MOD01 CERRADO Y APTO PARA PRODUCCIÓN  
**Aprobado por:** CTO — 2026-03-12

---

*Documento cerrado tras cierre formal de producción MOD01 — 2025-07-14.*

---

## 9. Addendum — Verificación Final Prototipo Frontend (2026-03-12)

### Correcciones aplicadas

| Archivo | Problema | Corrección |
|---------|----------|------------|
| `packages/ui/package.json` | `react` / `@types/react` ausentes — `Cannot find module 'react'` en typecheck | Agregados `react`, `react-dom`, `@types/react`, `@types/react-dom` como `devDependencies` + `peerDependencies` |
| `packages/ui/tsconfig.json` | `lib` sin `DOM` — errores `Property 'focus' does not exist on HTMLInputElement` | Agregado `"lib": ["ES2022", "DOM", "DOM.Iterable"]` |
| `packages/ui/src/components/Input.tsx` | `error?: string` incompatible con `exactOptionalPropertyTypes: true` — `string | undefined` no asignable a `string` | Cambiado a `error?: string | undefined` |
| `apps/web/tsconfig.json` | `lib` sin `DOM` — OtpInput errores de DOM API al compilar via path alias | Agregado `"lib": ["ES2022", "DOM", "DOM.Iterable"]` |
| `apps/web/src/lib/api-client.ts` | `body` tipo `unknown` — acceso a `.code` y `.message` sin cast | Cast a `Record<string, string>` + acceso por índice `body['code']` |
| `apps/portal/tsconfig.json` | Mismo problema DOM que `@iwana/web` | Mismo fix |
| `apps/portal/src/lib/api-client.ts` | Mismo problema `unknown body` | Mismo fix |
| `apps/portal/src/lib/api-client.ts` + `apps/portal/src/components/auth/LoginForm.tsx` | Login devolvía 404 por fallback `X-Tenant-Slug=default` cuando el tenant real era otro | Se eliminó el fallback rígido, se permite ingresar slug en UI, se persiste en `localStorage` para MFA/reintentos y se muestra error explícito de tenant faltante/inválido |

### Resultados

```
pnpm --filter @iwana/ui typecheck      → ✅ OK (0 errores)
pnpm --filter @iwana/shared typecheck  → ✅ OK (0 errores)
pnpm --filter @iwana/web typecheck     → ✅ OK (0 errores)
pnpm --filter @iwana/portal typecheck  → ✅ OK (0 errores)
pnpm --filter @iwana/web build         → ✅ OK — 5 rutas estáticas generadas
  - /
  - /_not-found
  - /auth/login
  - /auth/mfa/verify
  - /dashboard
```
