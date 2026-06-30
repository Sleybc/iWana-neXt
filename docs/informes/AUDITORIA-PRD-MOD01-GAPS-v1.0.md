# Auditoría de Brechas — PRD-MOD01 Auth + Tenant + Audit

## iWana neXt Platform — ISP/OSS/BSS Colombia

**Tipo:** Auditoría de gaps
**Versión:** 1.0
**Fecha:** 2026-03-15
**PRD base:** docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md (v1.1)
**Elaborado por:** AI-ARCH (Architect Software) — modo Architect
**Fuente de datos:** Inspección directa del repositorio — rama `main` commit `f3b362e`

---

## Resumen Ejecutivo

El Módulo 1 presenta una implementación **sólida y avanzada del backend**. Los módulos core — Auth, Tenant, Users, Audit y PlatformUsers — están implementados con JWT RS256, MFA TOTP, cifrado AES-256-GCM, multi-tenant por schema y audit trail append-only.

Sin embargo, **el módulo NO puede declararse production-ready** según la Definition of Done del PRD §10, debido a 4 grupos de brechas bloqueantes:

| Grupo | Severidad | Brechas | DoD bloqueante |
|-------|-----------|---------|----------------|
| **G1** — Funcionalidad pendiente | 🔴 ALTA | 4 | Sí (Funcionalidad + Operacional) |
| **G2** — Documentación faltante | 🟠 MEDIA-ALTA | 7 | Sí (Documentación) |
| **G3** — Seguridad no evidenciada | 🟠 MEDIA-ALTA | 5 | Sí (Seguridad) |
| **G4** — Frontend incompleto | 🟡 MEDIA | 5 | Parcial |

---

## 1. Estado de Implementación por Área

| Módulo | Archivos | Tests | DoD funcional |
|--------|----------|-------|---------------|
| `AuthModule` | ✅ auth.service, auth.controller, guards, decorators, DTOs | ✅ 26 casos | ⚠️ 3 brechas |
| `TenantModule` | ✅ service, controller, DTOs, settings | ✅ 18 casos | ⚠️ 2 brechas |
| `UsersModule` | ✅ service, controller, DTOs | ✅ 25 casos | ✅ |
| `AuditModule` | ✅ service, interceptor, controller, query-service | ✅ sí | ⚠️ 1 brecha |
| `PlatformUsersModule` | ✅ service, controller, DTOs | ✅ sí | ✅ |
| `TenantProvisioningProcessor` | ✅ processor, spec | ✅ 2+ casos | ⚠️ 1 brecha |
| Entities + Migrations | ✅ Tenant, User, RefreshToken, AuditLog | N/A | ✅ |
| `frontend/web` (apps/web) | ⚠️ login, dashboard, tenants, users | ⏸️ skipped | ⚠️ 4 brechas |
| `frontend/portal` (apps/portal) | ⚠️ login, dashboard básico | ⏸️ skipped | ⚠️ 2 brechas |

---

## 2. Brechas por Grupo

---

### G1 — Funcionalidad Pendiente 🔴

#### G1-01 — RF-AUTH-09: Flujo de verificación de email incompleto

- **PRD §4:** "Email de verificación al crear usuario. Usuario no puede operar hasta verificar."
- **Estado actual:** La entidad `User` tiene los campos `emailVerified` y `emailVerificationToken`, pero **no existe** el endpoint `POST /api/v1/auth/email/verify` ni la ruta de reenvío de token.
- **Impacto:** Todo usuario creado queda en `PENDING_VERIFICATION` sin mecanismo programático para avanzar a `ACTIVE`.
- **Acción requerida:** Implementar endpoint de verificación de email + endpoint de reenvío de token. Integrar envío de email en `create()` del UsersService.
- **Bloquea DoD:** Sí — "Flujo completo de primer login de Admin de tenant nuevo"

#### G1-02 — RF-AUTH-07 / RF-TNT-04: Notificaciones por email no integradas

- **PRD §4:** forgot-password (token expirable 1h), seed inicial (email con credenciales temporales), regeneración de credenciales.
- **Estado actual:** Los tres flujos generan y persisten los tokens correctamente, pero el envío de email está marcado como `TODO` en `auth.service.ts` y en el processor del worker.
- **Impacto:** El flujo end-to-end de onboarding de un nuevo tenant (UC-02, UC-03 del PRD §3) es imposible sin intervención manual del SYSTEM_ADMIN.
- **Acción requerida:** Integrar servicio de email (MailerModule con Nodemailer o similar). Emitir emails en: forgot-password, create user, regenerate-admin-credentials, tenant provisioning seed.
- **Bloquea DoD:** Sí — "Aprovisionamiento de tenant: ... email admin → status: ACTIVE"

#### G1-03 — POST /api/v1/auth/platform/login no documentado en PRD §7

- **PRD §7:** La tabla de contratos no incluye `POST /api/v1/auth/platform/login`.
- **Estado actual:** El endpoint está implementado y funcional para SYSTEM_ADMIN / IWANA_SUPPORT.
- **Impacto:** Contrato de API incompleto en el PRD. El frontend (`apps/web`) necesita saber cuál endpoint usar para login de plataforma.
- **Acción requerida:** Añadir `POST /api/v1/auth/platform/login` a la tabla de contratos del PRD §7 y actualizar Swagger.
- **Bloquea DoD:** No directamente, pero "Este PRD actualizado si surgieron cambios durante implementación" aplica.

#### G1-04 — PATCH /api/v1/tenants/:id/retry-provisioning no documentado en PRD §7

- **PRD §7:** La tabla de contratos no incluye el endpoint de reintento de provisioning.
- **Estado actual:** Endpoint implementado en `TenantController`.
- **Acción requerida:** Documentar en PRD §7.
- **Bloquea DoD:** No directamente.

---

### G2 — Documentación Faltante 🟠

#### G2-01 — ADR-017, ADR-018, ADR-019, ADR-020 no archivados

- **PRD §10 DoD Documentación:** "ADR-017, ADR-018, ADR-019, ADR-020 archivados en `docs/adrs/`"
- **Estado actual:** Solo existen como archivos en `docs/adrs/`: ADR-016, ADR-021, ADR-022, ADR-023. Los ADRs 017–020 referenciados en el PRD **no existen como archivos standalone**.
- **Impacto:** Decisiones críticas de arquitectura (provisioning por schema, ciclo de vida de tenant, JWT RS256, seed inicial) sin trazabilidad documental formal.
- **Acción requerida:** Crear los 4 archivos ADR en `docs/adrs/` con el contenido de las decisiones que ya están implementadas.
- **Bloquea DoD:** Sí.

| ADR | Tema | Contenido mínimo |
|-----|------|-----------------|
| ADR-017 | Provisioning PostgreSQL por schema via BullMQ | Justificación de DDL programático, worker separado, transacciones, retry |
| ADR-018 | Ciclo de vida de Tenant + PlatformUsers en schema público | PROVISIONING→ACTIVE→SUSPENDED→INACTIVE, tabla platform_users |
| ADR-019 | JWT RS256 asimétrico + refresh rotation + reuse attack | RS256 vs HS256, rotación por familia, JTI blacklist Redis |
| ADR-020 | Seed inicial de tenant + credenciales temporales | Password temporal 24h, ADMIN obligatorio, catalogo docs CO |

#### G2-02 — Runbook de aprovisionamiento de tenant inexistente

- **PRD §10 DoD Documentación:** "Runbook de aprovisionamiento de tenant en `docs/runbooks/`"
- **Estado actual:** El directorio `docs/runbooks/` **no existe**.
- **Acción requerida:** Crear `docs/runbooks/RUNBOOK-TENANT-PROVISIONING-v1.0.md` describiendo el flujo operativo (qué verificar si falla, cómo reintentar, comandos de diagnóstico Redis/BullMQ/PostgreSQL).
- **Bloquea DoD:** Sí.

#### G2-03 — Checklist de salida a producción no completado

- **PRD §10 DoD Documentación:** "Checklist de salida a producción archivado en `docs/quality/`"
- **Estado actual:** Solo existe el template `TEMPLATE-CHECKLIST-SALIDA-PRODUCCION-MODULO.md`. **No hay una instancia completada para MOD01**.
- **Acción requerida:** Crear `CHECKLIST-SALIDA-PRODUCCION-MOD01-v1.0.md` con todos los ítems del DoD verificados y firmados.
- **Bloquea DoD:** Sí.

#### G2-04 — Informe de cierre del módulo faltante

- **PRD §10 DoD Documentación:** "Informe de cierre del módulo archivado en `docs/informes/`"
- **Estado actual:** Existe `INFORME-MOD01-SPRINT-01-v1.0.md` (informe de sprint), pero **no hay un informe de cierre del módulo** que certifique production-readiness.
- **Acción requerida:** Crear `INFORME-MOD01-CIERRE-v1.0.md` cuando se complete el DoD. No antes.
- **Bloquea DoD:** Sí (es el artefacto final de cierre).

#### G2-05 — .env.example no verificado como completo

- **PRD §10 DoD Documentación:** "`.env.example` completo y documentado"
- **Estado actual:** No se verificó la existencia y completitud del `.env.example`. El PRD §5 lista variables obligatorias: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `MFA_ENCRYPTION_KEY`, `CORS_ORIGIN`.
- **Acción requerida:** Verificar que `.env.example` en el raíz existe y documenta todas las variables, sin valores reales.
- **Bloquea DoD:** Sí.

#### G2-06 — Swagger UI no verificado en /api/docs

- **PRD §10 DoD Documentación:** "Swagger UI funcional en `/api/docs` con todos los endpoints del módulo"
- **Estado actual:** El controlador tiene anotaciones `@ApiTags`, `@ApiOperation`, `@ApiResponse`. No se verificó si el módulo Swagger está configurado en `main.ts` y los nuevos endpoints (platform/login, retry-provisioning, audit-logs, settings) están documentados.
- **Acción requerida:** Verificar `apps/api/src/main.ts` y confirmar que todos los endpoints del PRD §7 aparecen en Swagger, incluyendo los endpoints de platform y configuración de tenant.
- **Bloquea DoD:** Sí.

#### G2-07 — PRD no actualizado con cambios del Sprint 1

- **PRD §10 DoD:** "Este PRD actualizado si surgieron cambios durante implementación"
- **Estado actual:** La implementación introdujo: `POST /auth/platform/login`, `PATCH /tenants/:id/retry-provisioning`, campos legales y de negocio en Tenant entity (legalName, nit, companyType, address, city, etc.), y separación de `firstName`/`lastName` reemplazando `displayName`. Ninguno de estos cambios está reflejado en el PRD.
- **Acción requerida:** Actualizar PRD §6 (Modelo de Datos) con los campos legales de Tenant y los campos de perfil de User. Actualizar PRD §7 con los 2 endpoints faltantes. Incrementar versión a v1.2.
- **Bloquea DoD:** Sí.

---

### G3 — Seguridad No Evidenciada 🟠

#### G3-01 — OWASP ASVS Level 2 checklist no completado

- **PRD §10 DoD Seguridad:** "OWASP ASVS Level 2 checklist completado"
- **Estado actual:** No existe ningún archivo en `docs/` ni `docs/quality/` que documente la revisión ASVS L2. El código implementa muchos controles (bcrypt, cifrado, rate limiting, JTI blacklist, refresh rotation), pero **no están formalmente trazados**.
- **Acción requerida:** Crear `docs/quality/CHECKLIST-OWASP-ASVS-L2-MOD01-v1.0.md` mapeando cada control ASVS L2 relevante al código que lo implementa.
- **Bloquea DoD:** Sí.

#### G3-02 — Rate limiting no verificado con test de carga

- **PRD §10 DoD Seguridad:** "Rate limiting verificado con test de carga básico (100 req/min → 429 en la 101)"
- **Estado actual:** El `AppModule` configura `ThrottlerModule` con límite global, pero no hay evidencia de que se haya ejecutado un test de carga que confirme el comportamiento 429.
- **Acción requerida:** Ejecutar test con `k6` o `autocannon` contra `/api/v1/auth/login`. Documentar resultado.
- **Bloquea DoD:** Sí.

#### G3-03 — Headers de seguridad HTTP no verificados

- **PRD §10 DoD Seguridad:** "Headers HTTP de seguridad presentes en todas las respuestas"
- **Estado actual:** No se encontró configuración de `helmet` en `main.ts` durante la inspección. Los headers `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` son obligatorios para ASVS L2.
- **Acción requerida:** Verificar que `helmet()` está configurado en `main.ts`. Si no está, añadirlo.
- **Bloquea DoD:** Sí — es verificación de seguridad bloqueante.

#### G3-04 — Inspección directa en DB de campos PII cifrados

- **PRD §10 DoD Seguridad:** "Campos PII cifrados verificados con inspección directa en DB"
- **Estado actual:** El código cifra email, firstName, lastName, documentNumber con AES-256-GCM. No hay evidencia documentada de que se haya verificado el cifrado en la base de datos real.
- **Acción requerida:** Ejecutar `psql` y verificar que las columnas cifradas contienen ciphertext, no texto plano. Documentar captura en el checklist de calidad.
- **Bloquea DoD:** Sí.

#### G3-05 — RF-AUD-03: platform_audit_logs para operaciones SYSTEM_ADMIN

- **PRD §4 RF-AUD-03:** "Operaciones de SYSTEM_ADMIN/IWANA_SUPPORT se registran en `public.platform_audit_logs`"
- **Estado actual:** La tabla `platform_audit_logs` existe en el schema público (migración 001). Sin embargo, la inspección no confirmó que el `AuditInterceptor` diferencie entre operaciones de schema público (plataforma) y de schema de tenant para enrutar a la tabla correcta.
- **Acción requerida:** Revisar `audit.interceptor.ts` y `audit.service.ts` para confirmar que las operaciones de `PlatformUsersController` y `TenantController` escriben en `public.platform_audit_logs`, no en `audit_logs` del schema de tenant.
- **Bloquea DoD:** Sí — es un requisito de aislamiento de datos y cumplimiento.

---

### G4 — Frontend Incompleto 🟡

#### G4-01 — Pantalla de cambio de password obligatorio

- **PRD §2 IN / UC-02:** "Pantalla de cambio de password obligatorio" cuando `passwordResetRequired=true`
- **Estado actual:** El campo `passwordResetRequired` existe en la entidad y el `AuthService` tiene lógica de detección, pero **no se encontró una página `/auth/change-password` o similar** en `apps/web` ni en `apps/portal`.
- **Acción requerida:** Implementar página de cambio obligatorio. Añadir lógica en el flujo de login para redirigir antes de acceder al dashboard.
- **Bloquea DoD:** Sí — "Flujo completo de primer login de Admin de tenant nuevo"

#### G4-02 — Página de verificación de email

- **RF-AUTH-09:** Usuario no puede operar hasta verificar email.
- **Estado actual:** No se encontró ruta `/auth/verify-email` en `apps/web` ni en `apps/portal`.
- **Acción requerida:** Implementar página de verificación que reciba el token por query param y llame al endpoint backend correspondiente (pendiente en G1-01).
- **Bloquea DoD:** Sí — depende de G1-01.

#### G4-03 — Vista de audit logs para AUDITOR

- **PRD §2 IN / UC-05:** "Pantalla de consulta de audit log (Auditor)"
- **Estado actual:** No se encontró ruta `/audit-logs` ni componente relacionado en `apps/web`.
- **Acción requerida:** Implementar vista de audit logs en `apps/web` con filtros y paginación cursor-based para el rol AUDITOR.
- **Bloquea DoD:** Parcial — el backend está completo, falta la UI.

#### G4-04 — E2E tests en estado SKIPPED

- **PRD §10 DoD Funcionalidad:** CA-M01-001 a CA-M01-063 deben pasar en staging.
- **Estado actual:** Los 3 archivos E2E (`admin-bootstrap.spec.ts`, `web-auth-dashboard.spec.ts`, `portal-auth-notifications.spec.ts`) están marcados como SKIPPED.
- **Acción requerida:** Activar y completar los tests E2E. Ejecutar en staging antes del cierre.
- **Bloquea DoD:** Sí.

#### G4-05 — Zod schemas frontend no integrados

- **ADR-025 / HLD-MOD01-Frontend-Auth-Zod-Schemas-Spec.md:** Formularios deben usar react-hook-form + Zod.
- **Estado actual:** Los formularios usan react-hook-form pero las validaciones Zod definidas en el HLD no están integradas. Los schemas están especificados en el HLD pero no implementados en código.
- **Acción requerida:** Implementar schemas Zod en formularios de login, MFA verify, forgot-password, reset-password, change-password según el HLD.
- **Bloquea DoD:** No directamente, pero impacta la calidad del módulo.

---

## 3. Endpoints del PRD §7 — Verificación de Completitud

| Endpoint | Estado | Observación |
|----------|--------|-------------|
| POST `/api/v1/auth/login` | ✅ | Implementado y documentado en Swagger |
| POST `/api/v1/auth/refresh` | ✅ | Cookie httpOnly, reuse attack |
| POST `/api/v1/auth/logout` | ✅ | JTI blacklist + revoca cookie |
| POST `/api/v1/auth/mfa/setup` | ✅ | QR + secret en Redis |
| POST `/api/v1/auth/mfa/verify` | ✅ | Activa MFA, persiste secret cifrado |
| POST `/api/v1/auth/mfa/disable` | ✅ | Requiere password + TOTP |
| GET `/api/v1/auth/me` | ✅ | Retorna JwtPayload del usuario autenticado |
| POST `/api/v1/auth/forgot-password` | ⚠️ | Token generado, **email no enviado** (G1-02) |
| POST `/api/v1/auth/reset-password` | ✅ | Revoca refresh tokens |
| POST `/api/v1/auth/change-password` | ✅ | Requiere contraseña actual |
| GET `/api/v1/users` | ✅ | Cursor-based, filtros role/status |
| POST `/api/v1/users` | ✅ | Idempotency-Key, PII cifrado |
| GET `/api/v1/users/:id` | ✅ | Descifra perfil |
| PATCH `/api/v1/users/:id` | ✅ | RBAC + audit trail |
| DELETE `/api/v1/users/:id` | ✅ | Soft delete, prevención auto-eliminación |
| GET `/api/v1/tenants` | ✅ | SYSTEM_ADMIN + IWANA_SUPPORT |
| POST `/api/v1/tenants` | ✅ | Encola provisioning BullMQ |
| GET `/api/v1/tenants/:id` | ✅ | Cache Redis TTL 5min |
| PATCH `/api/v1/tenants/:id` | ✅ | Slug/schemaName inmutables |
| PATCH `/api/v1/tenants/:id/suspend` | ✅ | |
| PATCH `/api/v1/tenants/:id/activate` | ✅ | |
| POST `/api/v1/tenants/:id/regenerate-admin-credentials` | ✅ | Idempotencia Redis |
| GET `/api/v1/audit-logs` | ⚠️ | Módulo completo, verificar RBAC AUDITOR+ADMIN vs SYSTEM_ADMIN |
| GET `/health` | ⚠️ | No verificado en la inspección — confirmar en main.ts |
| POST `/api/v1/auth/platform/login` | ⚠️ | **Implementado, NO en PRD §7** (G1-03) |
| PATCH `/api/v1/tenants/:id/retry-provisioning` | ⚠️ | **Implementado, NO en PRD §7** (G1-04) |

---

## 4. Definition of Done — Estado de Cada Ítem

### 4.1 Funcionalidad (verificada por Sr. Dev QA)

| Ítem | Estado | Brecha |
|------|--------|--------|
| CA-M01-001 a CA-M01-063: todos pasan en staging | ❌ PENDIENTE | G4-04 — E2E skipped |
| Flujo completo primer login Admin (email → temp pass → cambio → MFA → dashboard) | ❌ BLOQUEADO | G1-01, G1-02, G4-01 |
| Aprovisionamiento de tenant completo (POST → DDL → seed → email → ACTIVE) | ⚠️ PARCIAL | G1-02 (email no integrado) |
| Aislamiento multi-tenant (test con 2 tenants) | ❌ PENDIENTE | G4-04 |
| Audit log 100% operaciones CUD en integration tests | ⚠️ VERIFICAR | G3-05 |
| Job de purga de refresh_tokens en worker | ⚠️ VERIFICAR | No confirmado |

### 4.2 Calidad de Código (verificada por Architect Software)

| Ítem | Estado | Nota |
|------|--------|------|
| Cobertura ≥ 85% en AuthService, TenantService, AuditService | ⚠️ VERIFICAR | Tests existen, porcentaje no medido |
| 0 errores TypeScript strict mode | ⚠️ VERIFICAR | tsconfig strict activo, no ejecutado en CI este sprint |
| 0 errores ESLint | ⚠️ VERIFICAR | |
| 0 imports circulares (madge --circular) | ⚠️ VERIFICAR | No documentado |
| Code review Architect aprobado | ❌ PENDIENTE | |

### 4.3 Seguridad (verificada por Sr. Dev QA + Architect)

| Ítem | Estado | Brecha |
|------|--------|--------|
| 0 credenciales hardcodeadas (TruffleHog) | ⚠️ VERIFICAR | CI tiene TruffleHog configurado, no ejecutado sprint actual |
| OWASP ASVS Level 2 checklist completado | ❌ PENDIENTE | G3-01 |
| Rate limiting verificado (100 req/min → 429) | ❌ PENDIENTE | G3-02 |
| Campos PII cifrados verificados en DB | ❌ PENDIENTE | G3-04 |
| Headers HTTP de seguridad en todas las respuestas | ❌ VERIFICAR | G3-03 |
| Logs sin passwords, tokens ni secrets | ❌ PENDIENTE | No documentado |

### 4.4 Documentación (generada por EM)

| Ítem | Estado | Brecha |
|------|--------|--------|
| Swagger UI funcional en `/api/docs` | ⚠️ VERIFICAR | G2-06 |
| ADR-017 archivado | ❌ PENDIENTE | G2-01 |
| ADR-018 archivado | ❌ PENDIENTE | G2-01 |
| ADR-019 archivado | ❌ PENDIENTE | G2-01 |
| ADR-020 archivado | ❌ PENDIENTE | G2-01 |
| ADR-022 referenciado | ✅ | Existe en docs/adrs/ |
| .env.example completo y documentado | ⚠️ VERIFICAR | G2-05 |
| Runbook de aprovisionamiento en `docs/runbooks/` | ❌ PENDIENTE | G2-02 |
| Prompts de ejecución por fase archivados | ✅ | Existen en docs/prompts/ |
| Informes de fase archivados | ✅ | INFORME-MOD01-SPRINT-01-v1.0.md |
| Informe de cierre del módulo | ❌ PENDIENTE | G2-04 |
| Checklist de salida a producción archivado | ❌ PENDIENTE | G2-03 |
| PRD actualizado con cambios del Sprint 1 | ❌ PENDIENTE | G2-07 |

### 4.5 Operacional (verificada por Sr. Dev Fullstack)

| Ítem | Estado | Nota |
|------|--------|------|
| `docker compose up` en server limpio sin errores | ❌ PENDIENTE | No documentado |
| Migrations corren automáticamente al iniciar | ⚠️ VERIFICAR | |
| Health check `/health` con estado DB + Redis | ⚠️ VERIFICAR | No encontrado en inspección |
| Logs JSON estructurado (Pino) en stdout | ⚠️ VERIFICAR | |
| Job de purga de tokens configurado (repeatable, 24h) | ⚠️ VERIFICAR | |
| Deploy a producción ejecutado | ❌ PENDIENTE | |
| Smoke tests en producción | ❌ PENDIENTE | |

---

## 5. Deuda Técnica Identificada (fuera del DoD inmediato)

| ID | Descripción | Sprint sugerido |
|----|-------------|-----------------|
| DT-M01-01 | Tenant DELETE no ejecuta `DROP SCHEMA` PostgreSQL | Sprint 2 |
| DT-M01-02 | Zod schemas en formularios frontend (HLD especificado, no implementado) | Sprint 2 |
| DT-M01-03 | CVA no usado en componentes de `@iwana/ui` | Sprint 2 |
| DT-M01-04 | i18n: mensajes en es-CO no localizados (textos hardcodeados en español) | Sprint 2 |
| DT-M01-05 | `GET /auth/me` retorna JwtPayload; para datos completos del perfil se debería consultar DB | Sprint 2 |
| DT-M01-06 | Vista de audit logs para rol AUDITOR en apps/web | Sprint 2 |

---

## 6. Plan de Acción Priorizado

### Prioridad 1 — Bloqueantes de DoD (completar antes de declarar production-ready)

| # | Acción | Responsable sugerido | Esfuerzo |
|---|--------|---------------------|----------|
| P1-01 | Implementar servicio de email (Nodemailer/SMTP) e integrar en forgot-password, create user, tenant provisioning, regenerate-credentials | Sr. Dev Fullstack | Alto |
| P1-02 | Implementar endpoint `POST /api/v1/auth/email/verify` + endpoint de reenvío | Sr. Dev Backend | Medio |
| P1-03 | Implementar página frontend de cambio de password obligatorio (web + portal) | Sr. Dev Fullstack | Medio |
| P1-04 | Crear ADR-017, ADR-018, ADR-019, ADR-020 en `docs/adrs/` | AI-ARCH | Bajo |
| P1-05 | Crear `docs/runbooks/RUNBOOK-TENANT-PROVISIONING-v1.0.md` | AI-ARCH / EM | Bajo |
| P1-06 | Verificar `helmet()` en `main.ts` y añadir si falta | Sr. Dev Backend | Bajo |
| P1-07 | Verificar `GET /health` con estado DB + Redis en `main.ts` | Sr. Dev Backend | Bajo |
| P1-08 | Verificar enrutamiento de `platform_audit_logs` para operaciones SYSTEM_ADMIN | Sr. Dev Backend | Medio |
| P1-09 | Activar y completar tests E2E (admin-bootstrap, web-auth-dashboard, portal-auth) | Sr. Dev QA | Alto |
| P1-10 | Ejecutar test de carga rate limiting (100 req/min → 429) y documentar | Sr. Dev QA | Bajo |
| P1-11 | Verificar campos PII cifrados en DB y documentar en checklist | Sr. Dev QA | Bajo |
| P1-12 | Crear `CHECKLIST-OWASP-ASVS-L2-MOD01-v1.0.md` | AI-ARCH / Sr. Dev QA | Medio |
| P1-13 | Actualizar PRD §6 y §7 con cambios del Sprint 1 (v1.2) | EM / AI-ARCH | Bajo |
| P1-14 | Crear `CHECKLIST-SALIDA-PRODUCCION-MOD01-v1.0.md` instanciado | EM | Bajo |

### Prioridad 2 — Calidad verificable (completar en el sprint de cierre)

| # | Acción | Responsable sugerido |
|---|--------|---------------------|
| P2-01 | Verificar cobertura ≥ 85% con `pnpm --filter @iwana/api test -- --coverage` | Sr. Dev Backend |
| P2-02 | Verificar 0 errores TypeScript strict mode con `pnpm typecheck` | Sr. Dev Backend |
| P2-03 | Verificar 0 imports circulares con `madge --circular` | Sr. Dev Backend |
| P2-04 | Verificar que Swagger documenta todos los endpoints incluyendo platform/login y retry-provisioning | Sr. Dev Backend |
| P2-05 | Verificar `.env.example` contiene todas las variables del PRD §5 | Sr. Dev Fullstack |
| P2-06 | Ejecutar `docker compose up` en entorno limpio y documentar resultado | Sr. Dev Fullstack |
| P2-07 | Verificar job de purga de refresh_tokens (repeatable, 24h) en worker | Sr. Dev Backend |
| P2-08 | Implementar página de audit logs para rol AUDITOR en apps/web | Sr. Dev Fullstack |

---

## 7. Riesgos Residuales

| # | Riesgo | Severidad | Mitigación recomendada |
|---|--------|-----------|------------------------|
| RR-01 | platform_audit_logs no recibe operaciones de SYSTEM_ADMIN | 🔴 ALTA | Revisar AuditInterceptor antes de cualquier despliegue |
| RR-02 | Email no integrado → onboarding de tenant bloqueado manualmente | 🟠 MEDIA | Integrar SMTP antes de primer tenant productivo |
| RR-03 | E2E tests skipped → flujos críticos sin cobertura automatizada | 🟠 MEDIA | Activar antes de staging |
| RR-04 | helmet() potencialmente ausente → XSS/clickjacking posibles | 🟠 MEDIA | Verificar main.ts inmediatamente |
| RR-05 | ADRs 017-020 sin archivo → decisiones no trazables formalmente | 🟡 BAJA | Crear antes del informe de cierre |

---

## 8. Nota de Escalación

> [ESCALACION AL CTO] — Riesgo RR-01 (platform_audit_logs): si el AuditInterceptor no diferencia entre operaciones de schema público y de tenant, las acciones de SYSTEM_ADMIN (creación de tenants, gestión de usuarios de plataforma) NO quedan registradas en `public.platform_audit_logs` como exige RF-AUD-03. Esto es un gap de cumplimiento regulatorio (trazabilidad de operaciones de administración de plataforma) que debe resolverse antes del primer despliegue productivo.

---

_Auditoría generada por: AI-ARCH (Architect Software) — iWana neXt Platform_
_Fecha: 2026-03-15 | Rama: main | Commit base: f3b362e_
_Próxima revisión: al completar las acciones de Prioridad 1_
