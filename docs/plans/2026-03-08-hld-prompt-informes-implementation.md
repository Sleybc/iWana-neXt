# HLD MOD01 + Prompt Scaffold + Normalizacion Informes — Plan de Implementacion

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Materializar tres artefactos documentales bloqueantes para el inicio de la ejecucion del Modulo 1 de iWana neXt.

**Architecture:** Generacion secuencial: HLD primero (artefacto de entrada obligatorio para el prompt de ejecucion), prompt de fase Scaffold segundo, renombrado de plantillas de informes tercero. Referencias cruzadas actualizadas al final.

**Tech Stack:** Documentos Markdown siguiendo convencion `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`. Sin codigo ejecutable.

---

## Task 1: Crear HLD-MOD01-ARQUITECTURA-v1.0.md

**Files:**

- Create: `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`

**Step 1: Crear el archivo HLD completo**

El HLD debe tener exactamente 10 secciones con este contenido:

### Seccion 1: Vision General del Modulo

- Responsabilidades de @iwana/auth, @iwana/tenant, @iwana/audit
- Boundaries IN: todo lo listado en PRD-MOD01 seccion 2 "IN"
- Boundaries OUT: todo lo listado en PRD-MOD01 seccion 2 "OUT"
- Dependencias upstream: ninguna (modulo fundacional)
- Dependencias downstream: todos los demas modulos (CRM, Billing, NMS, etc.)

### Seccion 2: Arquitectura Interna del Modulo

Estructura de carpetas:

```
apps/api/src/modules/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── abac.guard.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── roles.decorator.ts
│   │   ├── public.decorator.ts
│   │   └── tenant-id.decorator.ts
│   ├── dto/
│   │   ├── login.dto.ts
│   │   ├── refresh-token.dto.ts
│   │   ├── mfa-setup.dto.ts
│   │   ├── mfa-verify.dto.ts
│   │   ├── forgot-password.dto.ts
│   │   ├── reset-password.dto.ts
│   │   └── change-password.dto.ts
│   └── interfaces/
│       ├── jwt-payload.interface.ts
│       └── auth-response.interface.ts
├── tenant/
│   ├── tenant.module.ts
│   ├── tenant.controller.ts
│   ├── tenant.service.ts
│   ├── tenant-provisioning.service.ts
│   ├── tenant-seed.service.ts
│   ├── tenant.middleware.ts
│   ├── dto/
│   │   ├── create-tenant.dto.ts
│   │   ├── update-tenant.dto.ts
│   │   └── tenant-response.dto.ts
│   └── interfaces/
│       └── tenant-context.interface.ts
├── audit/
│   ├── audit.module.ts
│   ├── audit.controller.ts
│   ├── audit.service.ts
│   ├── audit.interceptor.ts
│   ├── decorators/
│   │   └── skip-old-value.decorator.ts
│   ├── dto/
│   │   └── query-audit-logs.dto.ts
│   └── interfaces/
│       └── audit-entry.interface.ts
└── users/
    ├── users.module.ts
    ├── users.controller.ts
    ├── users.service.ts
    └── dto/
        ├── create-user.dto.ts
        ├── update-user.dto.ts
        └── user-response.dto.ts

packages/database/src/
├── entities/
│   ├── tenant.entity.ts
│   ├── platform-user.entity.ts
│   ├── platform-audit-log.entity.ts
│   ├── user.entity.ts
│   ├── refresh-token.entity.ts
│   └── audit-log.entity.ts
├── migrations/
│   └── public/
│       └── 001_create_public_schema.ts
├── templates/
│   └── tenant_template.sql
└── seeds/
    └── tenant-seed.ts

packages/shared/src/
├── enums/
│   ├── user-role.enum.ts
│   ├── user-status.enum.ts
│   ├── tenant-status.enum.ts
│   └── audit-action.enum.ts
├── dto/
│   └── pagination.dto.ts
└── interfaces/
    └── api-response.interface.ts
```

Capas: Controller (validacion + routing) → Service (logica de negocio) → Repository (TypeORM) → Entity (modelo)

Guards y pipeline de seguridad:

```
Rate Limiter → TLS (Nginx) → JwtAuthGuard → TenantMiddleware → RolesGuard → AbacGuard → Zod validation → Business Logic → AuditInterceptor
```

### Seccion 3: Modelo de Datos Definitivo

6 entidades TypeORM completas con TODOS los campos, tipos TypeScript, decoradores TypeORM, constraints e indices. Usar las definiciones del PRD seccion 6 como base y completar con:

Schema publico:

- **Tenant**: id, name, slug (unique inmutable), schemaName (unique), status (TenantStatus enum), settings (jsonb), contactEmail, maxSubscribers, createdAt, updatedAt
- **PlatformUser**: id, email (AES-256-GCM), emailHash (SHA-256 unique), passwordHash (bcrypt 12), role (SYSTEM_ADMIN|IWANA_SUPPORT), status, mfaEnabled (always true), mfaSecret (AES-256-GCM), lastLoginAt, createdAt, updatedAt, deletedAt
- **PlatformAuditLog**: id, userId, action, entityType, entityId, oldValue (jsonb), newValue (jsonb), ipAddress, userAgent, requestId, createdAt. SIN updatedAt, SIN deletedAt. Indices: (userId, createdAt DESC), (action, createdAt DESC)

Schema por tenant (tenant\_<slug>):

- **User**: id, email (AES-256), emailHash (SHA-256 unique), passwordHash (bcrypt 12), role (UserRole enum 14 roles), status (UserStatus enum), tenantId (FK logica), mfaEnabled, mfaSecret (AES-256), passwordResetRequired, passwordResetToken, passwordResetExpiresAt, failedLoginAttempts, lockedUntil, lastLoginAt, emailVerified, emailVerificationToken, createdAt, updatedAt, deletedAt. Indices: (emailHash), (tenantId, role), (tenantId, status)
- **RefreshToken**: id, userId (FK), tokenHash (SHA-256 unique), familyId (UUID), expiresAt, revokedAt, revokeReason (enum), ipAddress, userAgent, createdAt. Indices: (tokenHash), (familyId), (userId, revokedAt)
- **AuditLog**: id, tenantId, userId (nullable), action (AuditAction enum), entityType, entityId, oldValue (jsonb), newValue (jsonb), ipAddress, userAgent, requestId, createdAt. SIN updatedAt, SIN deletedAt. Indices: (tenantId, createdAt DESC), (entityType, entityId), (userId, createdAt DESC), (action, tenantId). RLS: DENY DELETE, DENY UPDATE

Decisiones criticas del modelo:

- `passwordHash` NO se cifra con AES-256 (bcrypt ya es un hash seguro; cifrar un hash es redundante y complica la verificacion)
- Solo `email` y `mfaSecret` se cifran con AES-256-GCM con IV unico por registro
- Busquedas de email siempre por `emailHash` (SHA-256 indice eficiente)
- Schema routing via `SET search_path TO 'tenant_<slug>'` por request
- TypeORM DataSource con seteo dinamico de schema via AsyncLocalStorage

Estrategia de migracion:

- Schema publico: migraciones TypeORM versionadas en packages/database/src/migrations/public/
- Schema tenant: DDL programatico via `tenant_template.sql` ejecutado por TenantProvisioningService (BullMQ worker). NO migraciones TypeORM para schemas de tenant
- `tenant_template.sql` contiene CREATE TABLE + indices + RLS policies para users, refresh_tokens, audit_logs

Seeds por tenant:

- ADMIN con password temporal (bcrypt hash de UUID aleatorio, 24h expiry, passwordResetRequired=true)
- Configuracion base (timezone: America/Bogota, currency: COP)
- Catalogo de documentos CO (tipos de identificacion, departamentos, estratos)

### Seccion 4: Contratos de API (OpenAPI 3.1)

24 endpoints con DTOs TypeScript completos. Para cada endpoint incluir:

- Metodo HTTP + Path
- Request body DTO con validaciones (class-validator decoradores)
- Response body DTO
- Codigos HTTP posibles (200, 201, 400, 401, 403, 404, 409, 423, 429, 500)
- Headers requeridos (Authorization, Cookie, Idempotency-Key segun aplique)
- Roles permitidos
- Rate limiting aplicable

Endpoints (usar la lista del PRD seccion 7 con las 24 rutas):

1. POST /api/v1/auth/login — Publico, 10/min/IP
2. POST /api/v1/auth/refresh — Publico (cookie), 30/min/usuario
3. POST /api/v1/auth/logout — Autenticado
4. POST /api/v1/auth/mfa/setup — Autenticado
5. POST /api/v1/auth/mfa/verify — Autenticado
6. POST /api/v1/auth/mfa/disable — Autenticado
7. GET /api/v1/auth/me — Autenticado
8. POST /api/v1/auth/forgot-password — Publico
9. POST /api/v1/auth/reset-password — Publico (token)
10. POST /api/v1/auth/change-password — Autenticado
11. GET /api/v1/users — ADMIN, SYSTEM_ADMIN
12. POST /api/v1/users — ADMIN
13. GET /api/v1/users/:id — ADMIN, propio
14. PATCH /api/v1/users/:id — ADMIN, propio
15. DELETE /api/v1/users/:id — ADMIN (soft delete)
16. GET /api/v1/tenants — SYSTEM_ADMIN
17. POST /api/v1/tenants — SYSTEM_ADMIN (createWithProvisioning)
18. GET /api/v1/tenants/:id — SYSTEM_ADMIN
19. PATCH /api/v1/tenants/:id — SYSTEM_ADMIN
20. PATCH /api/v1/tenants/:id/suspend — SYSTEM_ADMIN
21. PATCH /api/v1/tenants/:id/activate — SYSTEM_ADMIN
22. POST /api/v1/tenants/:id/regenerate-admin-credentials — SYSTEM_ADMIN
23. GET /api/v1/audit-logs — AUDITOR, ADMIN, SYSTEM_ADMIN
24. GET /health — Publico

Estandar de respuestas:

- Exito: `{ data: T, meta?: { cursor?, total? } }`
- Error: RFC 7807 `{ type, title, status, detail, instance }`
- Paginacion: cursor-based `?cursor=<uuid>&limit=50`

### Seccion 5: Diagramas de Secuencia (Mermaid)

4 diagramas obligatorios:

1. **Flujo de Login con MFA:** Cliente → Controller → AuthService (email hash lookup → bcrypt compare → lockout check → MFA check) → si MFA habilitado: retorna mfaRequired=true → cliente envia TOTP → AuthService verifica otplib → genera JWT RS256 (access 15min) + refresh token (cookie httpOnly 7d) → AuditLog (LOGIN)

2. **Flujo de Refresh Token con reuse attack detection:** Cliente → Controller → AuthService → buscar token por hash en DB → si revokedAt != null: REUSE ATTACK → revocar TODA la familia (UPDATE refresh_tokens SET revokedAt = NOW() WHERE familyId = X) → 401 → si valido: generar nuevo par (access + refresh), revocar el anterior, misma familyId → setear cookie

3. **Flujo de creacion de Tenant + schema + seed:** SYSTEM*ADMIN → TenantController → TenantService (crear en public.tenants con status=PROVISIONING) → BullMQ.add('tenant-provisioning', { tenantId }) → Worker: TenantProvisioningService → CREATE SCHEMA tenant*<slug> → ejecutar tenant_template.sql → TenantSeedService (crear ADMIN + config + catalogo) → UPDATE tenant SET status=ACTIVE → (email opcional con credenciales temporales)

4. **Pipeline de seguridad por request:** Request → RateLimiter (throttler) → Nginx TLS → JwtAuthGuard (RS256, exp, JTI blacklist Redis) → TenantMiddleware (JWT → tenantId → Redis cache → DB fallback → SET search_path → AsyncLocalStorage) → RolesGuard (@Roles check) → AbacGuard (tenant ownership) → Zod validation → Controller → Service → Entity → AuditInterceptor (captura CUD + oldValue + newValue → audit_logs) → Response

### Seccion 6: Decisiones de Diseno

Referenciar ADRs vigentes:

- ADR-001: Modulith NestJS
- ADR-002: Multi-tenant por schema PostgreSQL
- ADR-003: EventEmitter2 sync + BullMQ async
- ADR-004: Soft delete + Audit Log universal
- ADR-012: i18n es-CO
- ADR-017: Schema provisioning por DDL programatico
- ADR-018: Roles de plataforma en schema publico
- ADR-019: JWT RS256 con refresh token rotation
- ADR-020: Seed inicial por tenant
- ADR-022: Politica de ejecucion modular por fases

Decisiones adicionales en el HLD (no nuevos ADRs, aclaraciones):

- passwordHash NO se cifra con AES-256 (justificacion: bcrypt es one-way hash, cifrar un hash no agrega seguridad y complica la verificacion)
- AsyncLocalStorage para propagar tenant context (alternativa evaluada: cls-hooked, descartada por deprecacion)
- pgBouncer en modo transaction pooling con SET search_path por conexion

### Seccion 7: Guia de Implementacion

Orden secuencial (alineado con PLAN-MOD01-SPRINT-01):

1. Scaffold (Semana 0): monorepo + Docker + CI
2. Semana 1: DB + Entities + Migrations + TenantMiddleware + TenantService CRUD
3. Semana 2: JWT + AuthService + MFA + Guards + Workers
4. Semana 3-4: AuditInterceptor + Frontend + QA + Calidad

Dependencias npm Sprint 1 (baseline verificado):

- Node 22.14.0 LTS, pnpm 9.15.x, TypeScript 5.9
- NestJS 11.1.0, TypeORM 0.3.28, BullMQ 5.70.x
- Next.js 15.2.0, React 19, Tailwind 3.4.x
- Zod 3.24.x, otplib 7.11.x, bcrypt 5.1.x
- PostgreSQL 16, Redis 8.x
  (Nota: Stack_Tecnologico.md recomienda latest stable para Sprint 2+)

Variables de entorno (.env.example):

```
# Runtime
NODE_ENV=development
PORT=3000

# Base de datos
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=iwana
DATABASE_PASSWORD=changeme
DATABASE_NAME=iwana_next

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_PRIVATE_KEY_PATH=./secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=./secrets/jwt-public.pem
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Cifrado
ENCRYPTION_KEY=<openssl rand -hex 32>

# Rate Limiting
THROTTLE_TTL=60000
THROTTLE_LIMIT=100

# BullMQ
BULL_REDIS_HOST=localhost
BULL_REDIS_PORT=6379

# Email (Mailtrap en desarrollo)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=changeme
SMTP_PASS=changeme

# App
APP_URL=http://localhost:3000
PORTAL_URL=http://localhost:3001
```

Anti-patterns a evitar:

- NUNCA acceder a tablas de otro modulo directamente
- NUNCA importar circularmente entre @iwana/auth, @iwana/tenant, @iwana/audit
- NUNCA almacenar refresh token en plaintext (siempre hash SHA-256)
- NUNCA usar HS256 para JWT (solo RS256)
- NUNCA confiar en el tenantId del body del request (siempre del JWT)
- NUNCA loggear PII (email, password, tokens, mfaSecret) en texto plano

### Seccion 8: Criterios de Aceptacion Verificables

31 criterios concretos organizados por categoria:

**Autenticacion (CA-M01-001 a CA-M01-013):**

- CA-M01-001: Login con credenciales validas retorna access token (body) + refresh token (cookie httpOnly). RF: RF-AUTH-01, RF-AUTH-05
- CA-M01-002: Login con email inexistente retorna 401 con mensaje generico (no revelar si email existe). RF: RF-AUTH-01
- CA-M01-003: Login con password incorrecto retorna 401 con mismo mensaje que CA-M01-002. RF: RF-AUTH-01
- CA-M01-004: MFA setup genera QR code con URI otpauth y retorna base64 del QR. RF: RF-AUTH-03
- CA-M01-005: MFA verify con TOTP valido activa mfaEnabled=true para el usuario. RF: RF-AUTH-03
- CA-M01-006: MFA verify con TOTP invalido retorna 401. RF: RF-AUTH-03
- CA-M01-007: Request 11 en 1 minuto al endpoint /auth/login retorna 429 con header Retry-After. RF: RF-AUTH-10
- CA-M01-008: Cuenta bloqueada tras 5 intentos fallidos consecutivos. failedLoginAttempts=5 → lockedUntil=NOW()+15min. RF: RF-AUTH-02
- CA-M01-009: Login en cuenta bloqueada retorna 423 con timestamp de desbloqueo. RF: RF-AUTH-02
- CA-M01-010: Refresh retorna nuevo access token + nueva cookie refresh + revoca el anterior. RF: RF-AUTH-05
- CA-M01-011: Uso de refresh token ya rotado revoca toda la familia (WHERE familyId=X). RF: RF-AUTH-06
- CA-M01-012: Refresh con token expirado retorna 401. RF: RF-AUTH-05
- CA-M01-013: Logout invalida access token via JTI blacklist en Redis (TTL = remaining exp) + revoca refresh token. RF: RF-AUTH-11

**Multi-tenant (CA-M01-020 a CA-M01-022):**

- CA-M01-020: Usuario autenticado de Tenant A ejecuta query → solo ve datos de su schema. Query identica desde Tenant B retorna datos diferentes (aislamiento verificado). RF: RF-TNT-03
- CA-M01-021: Request con tenantId inexistente o invalido en JWT retorna 403. RF: RF-TNT-03
- CA-M01-022: Request a tenant con status SUSPENDED retorna 403 con mensaje explicativo. RF: RF-TNT-05

**RBAC (CA-M01-030 a CA-M01-033):**

- CA-M01-030: Endpoint protegido con @Roles(ADMIN) retorna 403 cuando el usuario tiene rol SUPPORT. RF: RF-RBAC-01
- CA-M01-031: Request de usuario de Tenant A intentando acceder a recurso de Tenant B (via ID) retorna 403 por ABAC guard. RF: RF-RBAC-02
- CA-M01-032: SUBSCRIBER solo puede ver/modificar su propio perfil (/users/:ownId). Request a /users/:otherId retorna 403. RF: RF-RBAC-03
- CA-M01-033: ADMIN no puede ejecutar PATCH ni DELETE sobre otro usuario con role=ADMIN del mismo tenant. RF: RF-RBAC-04

**Gestion de Tenants (CA-M01-040 a CA-M01-042):**

- CA-M01-040: POST /tenants crea registro en public.tenants con status=PROVISIONING y encola job en BullMQ. RF: RF-TNT-01, RF-TNT-02
- CA-M01-041: Worker de provisioning crea schema PostgreSQL + ejecuta tenant_template.sql exitosamente. Schema visible con \dn en psql. RF: RF-TNT-02
- CA-M01-042: Seed crea usuario ADMIN con passwordResetRequired=true, password temporal con expiracion 24h. RF: RF-TNT-04

**Audit Log (CA-M01-050 a CA-M01-053):**

- CA-M01-050: POST /users (CREATE) genera registro en audit_logs con action=CREATE, newValue=JSON del usuario creado. RF: RF-AUD-01
- CA-M01-051: PATCH /users/:id (UPDATE) genera registro en audit_logs con oldValue=estado previo, newValue=estado nuevo. RF: RF-AUD-02
- CA-M01-052: No existe endpoint DELETE ni UPDATE para /audit-logs. Request DELETE retorna 405. RF: RF-AUD-04
- CA-M01-053: INSERT directo en PostgreSQL con DELETE FROM audit_logs falla por RLS policy. RF: RF-AUD-04

**Seguridad y Cifrado (CA-M01-060 a CA-M01-063):**

- CA-M01-060: SELECT email FROM users en psql retorna valor cifrado (no legible como email). RF: cifrado PII
- CA-M01-061: SELECT mfa_secret FROM users en psql retorna valor cifrado (no legible como base32). RF: cifrado PII
- CA-M01-062: grep en logs de aplicacion durante tests: 0 ocurrencias de passwords, tokens JWT, mfaSecret en texto plano. RF: OWASP
- CA-M01-063: Todas las respuestas HTTP incluyen: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Content-Security-Policy (Helmet.js). RF: OWASP ASVS

### Seccion 9: Definition of Done del Modulo 1

Copiar el checklist completo del PRD-MOD01 seccion 10 (Funcionalidad, Calidad de Codigo, Seguridad, Documentacion, Operacional, Bloqueo y continuidad).

### Seccion 10: Matriz Documental por Fase

| Fase       | Artefacto                            | Responsable    | Carpeta        | Gate         |
| ---------- | ------------------------------------ | -------------- | -------------- | ------------ |
| Definicion | PRD-MOD01-DEFINICION-v1.1.md         | AI-ARCH        | docs/prds/     | Aprobado     |
| Definicion | PRD-MOD01-Auth-Tenant-Audit-v1.0.md  | AI-ARCH        | docs/prds/     | Aprobado     |
| Definicion | HLD-MOD01-ARQUITECTURA-v1.0.md       | AI-ARCH        | docs/hlds/     | Aprobado     |
| Definicion | ADR-017 a ADR-022                    | AI-ARCH        | docs/adrs/     | Aprobados    |
| Scaffold   | PROMPT-MOD01-SCAFFOLD-v1.0.md        | AI-EM          | docs/prompts/  | Generado     |
| Scaffold   | INFORME-MOD01-SCAFFOLD-v1.0.md       | Sr. Dev + EM   | docs/informes/ | Completado   |
| Sprint 1   | PROMPT-MOD01-SPRINT01-v1.0.md        | AI-EM          | docs/prompts/  | Generado     |
| Sprint 1   | INFORME-MOD01-SPRINT01-v1.0.md       | Sr. Dev + EM   | docs/informes/ | Completado   |
| Cierre     | INFORME-MOD01-CIERRE-v1.0.md         | EM             | docs/informes/ | Aprobado CTO |
| Cierre     | CHECKLIST-SALIDA-PRODUCCION-MOD01.md | QA + Architect | docs/quality/  | 100% verde   |

**Step 2: Verificar referencias cruzadas**

Confirmar que el HLD referencia correctamente:

- `docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md`
- `docs/prds/PRD-MOD01-DEFINICION-v1.1.md`
- `docs/prds/Stack_Tecnologico.md`
- `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md`
- `docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md`

---

## Task 2: Crear PROMPT-MOD01-SCAFFOLD-v1.0.md

**Files:**

- Create: `docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md`
- Reference: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

**Step 1: Crear el prompt de ejecucion**

Llenar la plantilla TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md con:

**Modulo:**

- Nombre: Auth + Tenant + Audit
- Codigo: MOD01
- Fase: Scaffold (Pre-Sprint / Semana 0)
- Version: 1.0
- Fecha: 2026-03-08
- Generado por: Engineering Manager (AI-EM-ARCH)
- Nombre de archivo destino: PROMPT-MOD01-SCAFFOLD-v1.0.md

**Seccion 1 — Objetivo exacto de la fase:**

- Resultado esperado: Monorepo Turborepo funcional con apps scaffoldeados, infraestructura Docker dev operativa, CI basico en GitHub Actions, design tokens iWana integrados
- Lo que SI entra: scaffold monorepo (turbo.json, apps/, packages/), docker-compose.dev.yml con PostgreSQL+Redis+MinIO+pgBouncer+Nginx+Adminer, Dockerfiles base, .env.example, CI workflow, par RSA, design tokens en packages/ui
- Lo que NO entra: logica de negocio, entities TypeORM, endpoints, guards, tests funcionales

**Seccion 2 — Artefactos de entrada obligatorios:**

- PRD del modulo: docs/prds/PRD-MOD01-DEFINICION-v1.1.md
- HLD del modulo: docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md
- ADRs aplicables: ADR-001, ADR-002, ADR-022
- Sprint plan aplicable: docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md
- Prompt arquitectonico origen: docs/prompts/PROMPT-ARCHITECT-MOD01-Auth-Tenant-Audit.md
- Artefactos faltantes detectados: Ninguno (HLD ya materializado)

**Seccion 3 — Instrucciones para Sr. Dev Fullstack:**

Dia 1: Monorepo base

1. pnpm init + Turborepo init
2. Crear estructura apps/ (api, web, portal, worker) con NestJS y Next.js scaffolds vacios
3. Crear packages/ (shared, database, config, ui)
4. turbo.json con pipelines: build, test, lint, dev
5. tsconfig base en packages/config (strict mode)
6. ESLint + Prettier en packages/config
7. Husky + lint-staged + commitlint en raiz
8. Path aliases: @iwana/shared, @iwana/db, @iwana/config, @iwana/ui

Dia 2: Infraestructura Docker

1. docker-compose.dev.yml con postgres, redis, minio, pgbouncer, nginx, adminer
2. Dockerfile.api, Dockerfile.web, Dockerfile.worker (base)
3. docker-compose.yml (produccion on-premise, sin adminer)
4. .env.example completo y documentado
5. .env.local (gitignored) con valores de desarrollo

Dia 3: Seguridad y CI

1. Generar par RSA 2048-bit para JWT
2. Generar ENCRYPTION_KEY (openssl rand -hex 32)
3. secrets/ en .gitignore
4. GitHub Actions: .github/workflows/ci.yml (lint + typecheck + test + build)
5. Branch protection en main
6. Design tokens iWana en packages/ui (del Manual_Implementacion_Identidad_Iwana.md)
7. Verificar: turbo dev, turbo lint, turbo build pasan

**Seccion 4 — Restricciones no negociables:**

- No romper boundaries del modulith
- No generar codigo de negocio en esta fase
- No usar credenciales reales en .env.example
- No omitir Dockerfiles ni docker-compose

**Seccion 5 — Entregables tecnicos obligatorios:**

- Monorepo Turborepo funcional (turbo build sin errores)
- docker-compose.dev.yml funcional (up sin errores)
- CI pipeline verde en GitHub Actions
- .env.example documentado
- Design tokens base en packages/ui

**Seccion 6 — Entregables documentales obligatorios:**

- Informe de fase en docs/informes/INFORME-MOD01-SCAFFOLD-v1.0.md
- Si la fase encuentra bloqueo, documentar en docs/quality/ usando TEMPLATE-DECISION-BLOQUEO-TECNICO.md

**Seccion 7 — Criterios de aceptacion:**

- CA-SCAFFOLD-001: `docker compose -f docker-compose.dev.yml up` levanta sin errores
- CA-SCAFFOLD-002: `turbo build` compila todos los apps sin errores (vacios pero compilando)
- CA-SCAFFOLD-003: `turbo lint` pasa sin errores
- CA-SCAFFOLD-004: CI verde en GitHub Actions (lint + typecheck + build)
- CA-SCAFFOLD-005: `.env.example` completo con todas las variables documentadas

**Seccion 8 — Criterio de stop/go:**

- Detenerse si: Docker Desktop no disponible en maquina de desarrollo
- Documentar causa en: docs/quality/TEMPLATE-DECISION-BLOQUEO-TECNICO.md
- Escalar a: CTO
- Recomendacion: No continuar con Sprint 1 hasta resolver

**Seccion 9 — Criterio de salida de la fase:**

- Backend validado: turbo build pasa para apps/api
- Frontend validado: turbo build pasa para apps/web y apps/portal
- Base de datos validada: PostgreSQL container levanta y acepta conexiones
- Tests en verde: N/A (no hay tests funcionales en scaffold)
- Documentacion archivada: INFORME-MOD01-SCAFFOLD-v1.0.md en docs/informes/

---

## Task 3: Normalizar template de informe de fase

**Files:**

- Legacy eliminado durante la normalizacion: template de fase anterior
- Create: `docs/informes/TEMPLATE-INFORME-FASE-v1.0.md`

**Step 1: Crear el archivo con nombre nuevo**

Mismo contenido que el template legacy de fase pero con header actualizado:

```markdown
# TEMPLATE — Informe de Fase de Modulo

# Convencion: INFORME-{MODULO}-{FASE}-v{VERSION}.md

**Version:** 1.0
**Fecha:** 2026-03-08
**Convencion documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Vinculos de trazabilidad

- Plantilla base: docs/informes/TEMPLATE-INFORME-FASE-v1.0.md
- Archivo destino sugerido: docs/informes/INFORME-{MODULO}-{FASE}-v{VERSION}.md
- Politica de ejecucion: ADR-022
```

El resto del contenido se mantiene identico al template actual (secciones 1-7).

**Step 2: Eliminar el archivo antiguo**

Eliminar el archivo legacy de template de fase

---

## Task 4: Normalizar template de informe de cierre

**Files:**

- Legacy eliminado durante la normalizacion: template de cierre anterior
- Create: `docs/informes/TEMPLATE-INFORME-CIERRE-v1.0.md`

**Step 1: Crear el archivo con nombre nuevo**

Mismo contenido que el template legacy de cierre pero con header actualizado:

```markdown
# TEMPLATE — Informe de Cierre de Modulo

# Convencion: INFORME-{MODULO}-CIERRE-v{VERSION}.md

**Version:** 1.0
**Fecha:** 2026-03-08
**Convencion documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Vinculos de trazabilidad

- Plantilla base: docs/informes/TEMPLATE-INFORME-CIERRE-v1.0.md
- Archivo destino sugerido: docs/informes/INFORME-{MODULO}-CIERRE-v{VERSION}.md
- Politica de ejecucion: ADR-022
```

El resto del contenido se mantiene identico al template actual (secciones 1-6).

**Step 2: Eliminar el archivo antiguo**

Eliminar el archivo legacy de template de cierre

---

## Task 5: Actualizar referencias cruzadas

**Files:**

- Modify: `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md` (si referencia templates viejos)
- Modify: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (si referencia templates viejos)

**Step 1: Buscar referencias a nombres antiguos**

Buscar en todos los archivos de docs/ menciones a:

- `TEMPLATE-INFORME-FASE-MODULO.md`
- `TEMPLATE-INFORME-CIERRE-MODULO.md`

**Step 2: Reemplazar por nombres nuevos**

- `TEMPLATE-INFORME-FASE-MODULO.md` → `TEMPLATE-INFORME-FASE-v1.0.md`
- `TEMPLATE-INFORME-CIERRE-MODULO.md` → `TEMPLATE-INFORME-CIERRE-v1.0.md`

---

## Task 6: Crear/actualizar informe de sesion

**Files:**

- Create: `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md`

**Step 1: Crear informe**

Registrar los cambios realizados en esta sesion usando el template TEMPLATE-INFORME-FASE-v1.0.md:

- Modulo: Sistema (gobernanza documental)
- Fase: Normalizacion documental + materializacion HLD
- Resultado: HLD creado, prompt de scaffold creado, templates renombrados
- Estado: Completa

---

_Plan generado por: AI-EM-ARCH — iWana neXt Platform_
_Fecha: 2026-03-08_
