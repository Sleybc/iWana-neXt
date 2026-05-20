# Sprint 1 — Módulo 1: Auth + Tenant + Audit

## iWana neXt Platform

**Objetivo del Sprint:** Tener un sistema de autenticación multi-tenant real en PostgreSQL, con RBAC/ABAC funcional, MFA operativo y audit log append-only — la fundación sobre la que todos los demás módulos se construyen.

**Regla de interpretación:** este sprint cubre la fase inicial de ejecución del Módulo 1. No se considera cierre del módulo hasta que exista validación en producción y checklist de salida completo.

**Duración:** 2 semanas | **Inicio:** 2026-02-27 | **Fin:** 2026-03-13
**Fase:** Sprint 1 de 12 (MVP)
**PRD de referencia:** docs/prds/PRD-MOD01-DEFINICION-v1.1.md
**HLD de referencia:** docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md

---

## Pre-Sprint — Semana 0 (Scaffold Maestro)

**Duración:** 2-3 días antes del Sprint 1
**Responsable:** Sr. Dev Fullstack
**Criterio de entrada:** Docker Desktop corriendo en la máquina de desarrollo

### Tareas del Scaffold (en orden)

**Día 1: Monorepo base**

```
1. pnpm init + Turborepo init
2. Crear estructura apps/ (api, web, portal, worker) — NestJS y Next.js scaffolds vacíos
3. Crear packages/ (shared, database, config, ui)
4. turbo.json con pipelines: build, test, lint, dev
5. tsconfig base en packages/config (strict mode)
6. ESLint + Prettier en packages/config
7. Husky + lint-staged + commitlint en raíz
8. Path aliases: @iwana/shared, @iwana/db, @iwana/config, @iwana/ui
```

**Día 2: Infraestructura Docker**

```
1. docker-compose.yml:
   - postgres (latest) — puerto 5432, volume persistente
   - redis (latest) — puerto 6379
   - minio (latest) — puertos 9000/9001 (para módulos futuros)
   - pgbouncer — connection pooling
   - nginx — reverse proxy básico
   - adminer (opcional, debug local)
2. Dockerfile.api, Dockerfile.web, Dockerfile.worker (base)
3. docker-compose.yml (producción on-premise — sin adminer)
4. .env.example completo y documentado
5. .env.local (gitignored) con valores de desarrollo
```

**Día 3: Seguridad y CI**

```
1. Generar par RSA 2048-bit: openssl genrsa -out secrets/jwt-private.pem 2048
                               openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
2. Generar ENCRYPTION_KEY: openssl rand -hex 32
3. secrets/ en .gitignore
4. GitHub Actions: .github/workflows/ci.yml (lint + typecheck + test + build)
5. Branch protection en main (PR + CI verde + 1 review)
6. Design tokens iWana en packages/ui (del Manual_Implementacion_Identidad_Iwana.md)
7. Verificar: turbo dev levanta todos los servicios sin errores
   Verificar: turbo lint y turbo build pasan
```

**Criterio de Done del Scaffold:**

- `pnpm dev` levanta la infraestructura local y las apps sin errores
- `turbo build` compila sin errores (apps vacíos pero compilando)
- `turbo lint` pasa sin errores
- CI verde en GitHub Actions
- `.env.example` completo con todas las variables documentadas

---

## Entregables documentales obligatorios del Sprint 1

| Artefacto                              | Responsable             | Carpeta destino                |
| -------------------------------------- | ----------------------- | ------------------------------ |
| Prompt de ejecución de Semana 0        | Engineering Manager     | `docs/prompts/`                |
| Prompt de ejecución de Sprint 1        | Engineering Manager     | `docs/prompts/`                |
| Informe de fase Scaffold               | Sr. Dev Fullstack + EM  | `docs/informes/`               |
| Informe de fase Sprint 1               | Sr. Dev Fullstack + EM  | `docs/informes/`               |
| Evidencia de pruebas y calidad         | Sr. Dev QA/Testing      | `docs/quality/`                |
| Decisión de bloqueo técnico, si aplica | EM + Architect Software | `docs/quality/` o `docs/adrs/` |

---

## Asignaciones del Sprint 1

### Sr. Dev Fullstack (Backend + Frontend)

#### Semana 1 — Fundación DB y Tenant

| #   | Tarea                                                                                                     | PRD ref   | Criterio de Done                                           |
| --- | --------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| 1   | TypeORM DataSource configurado con schema routing dinámico por tenant                                     | RF-TNT-03 | DataSource acepta schema como parámetro por request        |
| 2   | Entities: Tenant, PlatformUser, User, RefreshToken, AuditLog (con todos los campos, índices, constraints) | PRD §6    | Entities compilan en strict mode, migrations generadas     |
| 3   | Migration inicial schema público: `public.tenants`, `public.platform_users`, `public.platform_audit_logs` | ADR-018   | `npm run migration:run` exitoso en DB limpia               |
| 4   | `tenant_template.sql`: CREATE TABLE de users, refresh_tokens, audit_logs + índices + RLS policies         | ADR-017   | Script ejecutable en DB limpia sin errores                 |
| 5   | `@iwana/tenant` module: TenantService CRUD básico (create, findOne, list, update)                         | RF-TNT-01 | Tests unitarios TenantService pasan (sin provisioning aún) |
| 6   | TenantMiddleware: extrae tenantId del JWT sin verificar, busca en Redis/DB, inyecta tenantSchema          | RF-TNT-03 | Test: request con tenantId válido inyecta schema correcto  |

#### Semana 2 — Auth Core + MFA + Guards

| #   | Tarea                                                                                   | PRD ref            | Criterio de Done                                   |
| --- | --------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------- |
| 7   | JWT Strategy RS256 + JwtAuthGuard + `@Public()` decorator                               | RF-AUTH-05         | Endpoints protegidos retornan 401 sin token válido |
| 8   | AuthService: login (email hash lookup, bcrypt compare, lockout, MFA check)              | RF-AUTH-01 a 04    | CA-M01-001 a 007 pasan                             |
| 9   | Refresh token rotation: generación, hash en DB, cookie httpOnly, reuse attack detection | RF-AUTH-05, 06     | CA-M01-010 a 013 pasan                             |
| 10  | MFA TOTP: setup (QR con qrcode), verify (activa), disable (requiere password + código)  | RF-AUTH-03         | CA-M01-004, 005 pasan                              |
| 11  | Forgot/reset/change password + email verification                                       | RF-AUTH-07, 08, 09 | Flujo completo E2E sin errores                     |
| 12  | RolesGuard + AbacGuard + decoradores `@Roles()`, `@CurrentUser()`, `@TenantId()`        | RF-RBAC-01 a 06    | CA-M01-030 a 033 pasan                             |
| 13  | Rate limiting (nestjs/throttler): global 100/min, auth 10/min                           | RF-AUTH-10         | CA-M01-007 pasa                                    |
| 14  | TenantProvisioningService (BullMQ worker): CREATE SCHEMA + ejecutar template SQL + seed | RF-TNT-02, 04      | CA-M01-040, 041 pasan                              |
| 15  | TenantSeedService: ADMIN inicial + config base + catálogo docs CO                       | ADR-020            | CA-M01-042 pasa                                    |
| 16  | Frontend: página de login (web + portal) con design system iWana                        | PRD §3.2 UC-01     | Login funcional en browser, responsive             |

#### Semana 3-4 — Audit + Frontend + Calidad

| #   | Tarea                                                                                          | PRD ref         | Criterio de Done                                     |
| --- | ---------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------- |
| 17  | AuditInterceptor global: captura CUD, captura oldValue para UPDATE, emite evento síncrono      | RF-AUD-01 a 04  | CA-M01-050 a 053 pasan                               |
| 18  | AuditService + AuditLog entity: persiste en DB (tenant schema o platform_audit_logs según rol) | RF-AUD-03       | Audit en tenant A NO aparece en tenant B             |
| 19  | API audit-logs con filtros y paginación cursor-based                                           | RF-AUD-05       | Respuesta < 300ms p95 con 10k registros              |
| 20  | Decorador `@SkipOldValue()` para entidades sin necesidad de oldValue                           | RF-AUD-07       | Documentado y funcional                              |
| 21  | Frontend: pantalla MFA setup (QR code), cambio de password obligatorio, verificación de email  | PRD §3.2 UC-02  | Flujo completo desde primer login de ADMIN           |
| 22  | Health check `/health` con estado DB y Redis (nestjs/terminus)                                 | DoD operacional | Retorna 200 con estado de todos los servicios        |
| 23  | Job de purga de refresh_tokens expirados (BullMQ repeatable, cada 24h)                         | RF-AUTH-05      | Job visible en BullMQ dashboard                      |
| 24  | Swagger UI en `/api/docs` con todos los endpoints documentados                                 | DoD docs        | Todos los endpoints del módulo visibles y testeables |
| 25  | Logging estructurado (Pino + nestjs-pino) + RequestId middleware                               | DoD operacional | Logs JSON con requestId en stdout                    |
| 26  | Security headers: X-Content-Type-Options, X-Frame-Options, HSTS, CSP (Helmet.js)               | CA-M01-063      | Headers presentes en todas las respuestas            |

---

### Sr. Dev Data Engineer

| #   | Tarea                                                                                                        | PRD ref       | Criterio de Done                                               |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------- |
| D1  | `tenant_template.sql` definitivo con todos los CREATE TABLE, índices y RLS policies de este módulo           | ADR-017       | Ejecutable en DB limpia, verificado en PostgreSQL              |
| D2  | Migration public schema: `001_create_public_schema.ts` — tablas tenants, platform_users, platform_audit_logs | ADR-018       | `migration:run` exitoso, rollback funcional                    |
| D3  | Seed script de desarrollo local (SYSTEM_ADMIN de prueba + tenant de prueba con ADMIN)                        | DoD funcional | `npm run seed:dev` genera datos listos para testing            |
| D4  | pgBouncer configuración para multi-schema (pool por tenant, max_client_conn, pool_size)                      | ADR-002       | Sin errores de pool exhaustion en 50 requests concurrentes     |
| D5  | Verificar queries de audit log con `EXPLAIN ANALYZE` — índices usados correctamente                          | RF-AUD-05     | Query de 10k registros con filtro tenantId+fechas < 300ms      |
| D6  | Script `migrate-tenant.ts`: aplica migrations pendientes a un schema de tenant específico                    | ADR-017       | Funcional para cuando hay cambios de schema en módulos futuros |
| D7  | Documentar queries más costosas en `docs/database/` con nombre normalizado del módulo                        | DoD docs      | Documento con EXPLAIN ANALYZE de las 5 queries principales     |

---

### Sr. Dev QA/Testing

| #   | Tarea                                                                                                               | PRD ref          | Criterio de Done                                 |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------ |
| Q1  | Tests unitarios AuthService: todos los casos del diagrama de secuencia (login, MFA, reuse attack, lockout)          | CA-M01-001 a 013 | ≥ 85% cobertura en AuthService                   |
| Q2  | Tests unitarios TenantService + TenantProvisioningService                                                           | CA-M01-040 a 042 | ≥ 85% cobertura                                  |
| Q3  | Tests unitarios AuditInterceptor + AuditService                                                                     | CA-M01-050 a 053 | ≥ 85% cobertura                                  |
| Q4  | Tests de integración (Supertest): todos los endpoints con casos happy path + edge cases + errores                   | CA-M01-001 a 063 | Todos los CA verificados                         |
| Q5  | Test de aislamiento multi-tenant: usuario tenant A NO ve datos tenant B (el más crítico)                            | CA-M01-020       | Explícitamente verificado con 2 tenants reales   |
| Q6  | Test de seguridad: rate limiting (10 req/min en auth → 429 en la 11)                                                | CA-M01-007       | Automatizado en suite de integración             |
| Q7  | Test de seguridad: refresh token reuse attack → revocación de familia completa                                      | CA-M01-011       | Automatizado                                     |
| Q8  | Test de campos PII: verificar que email y mfaSecret nunca aparecen en plaintext en DB                               | CA-M01-060, 061  | Script de inspección directa de DB post-test     |
| Q9  | Test de logs: grep en logs de test → ningún campo sensible en texto plano                                           | CA-M01-062       | Script automatizable                             |
| Q10 | E2E (Playwright): flujo completo de primer login ADMIN (email → password temporal → cambio → MFA setup → dashboard) | PRD §3.2 UC-02   | E2E pasa en headless mode                        |
| Q11 | Reporte de cobertura final con screenshot del Jest coverage report                                                  | DoD calidad      | Coverage ≥ 85% documentado                       |
| Q12 | OWASP ASVS L2 checklist completado y firmado                                                                        | DoD seguridad    | Checklist en `docs/security/` con nombre normalizado del módulo |

---

## Dependencias y Blockers

| #   | Descripción                                                    | Propietario       | Fecha límite               | Acción si no resuelto                              |
| --- | -------------------------------------------------------------- | ----------------- | -------------------------- | -------------------------------------------------- |
| B1  | Docker Desktop disponible en máquina de desarrollo             | CTO               | Día 0 (antes del scaffold) | Bloquea todo — escalar inmediatamente              |
| B2  | Acceso a GitHub repo (remote configurado)                      | CTO               | Día 1                      | Bloquea CI/CD — trabajar solo local hasta resolver |
| B3  | Par de llaves RSA generado y en `secrets/`                     | Sr. Dev Fullstack | Día 1                      | Bloquea AuthService — prioridad alta               |
| B4  | `@nestjs/bullmq` compatible con última versión de BullMQ       | Sr. Dev Fullstack | Día 3                      | Verificar changelog antes de instalar              |
| B5  | Email funcional para recibir password temporal del tenant seed | CTO/ISP           | Semana 2                   | Usar Mailtrap o similar en desarrollo              |

### Dependencias técnicas inter-tareas

```
Scaffold → [D1, D2] → [F1, F2, F3] → [F4, F5] → [F6...F15] → [Q1...Q12]
D1 (tenant_template.sql) debe estar listo ANTES de F14 (TenantProvisioningService)
D2 (migration pública) debe estar listo ANTES de F1 (TypeORM DataSource)
D4 (pgBouncer) debe estar listo ANTES de los tests de carga (Q6)
```

---

## Stack de Dependencias npm — Sprint 1

> Verificar `docs/prds/Stack_Tecnologico.md` y usar las versiones aprobadas para el Sprint 1. Latest stable es solo referencia, no instrucción automática de instalación.

```bash
# apps/api — Auth + Tenant + Audit
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt
pnpm add bcrypt otplib qrcode uuid
pnpm add @nestjs/throttler ioredis @nestjs/cache-manager cache-manager-ioredis-yet
pnpm add class-validator class-transformer zod
pnpm add @nestjs/swagger swagger-ui-express
pnpm add eventemitter2 @nestjs/event-emitter
pnpm add bullmq @nestjs/bullmq
pnpm add @nestjs/terminus          # health checks
pnpm add nestjs-pino pino-http     # logging estructurado
pnpm add helmet cookie-parser      # seguridad HTTP

pnpm add -D @types/bcrypt @types/passport-jwt @types/qrcode @types/uuid
pnpm add -D supertest @types/supertest
pnpm add -D madge                  # detección de imports circulares

# apps/web + apps/portal — Frontend
pnpm add next react react-dom @tanstack/react-query axios react-hook-form zod @hookform/resolvers
pnpm add -D tailwindcss @tailwindcss/postcss
pnpm dlx shadcn@latest init

# QA
pnpm add -D @playwright/test
pnpm add -D k6                     # load testing (instalación separada)
```

---

## Definition of Done del Sprint 1

**Nota:** cumplir esta sección habilita avanzar a la siguiente fase del Módulo 1 o solicitar salida a producción. No autoriza por sí sola declarar el módulo cerrado.

```
☐ Todos los CA-M01-001 a CA-M01-063 pasan en ambiente de staging
☐ Cobertura de tests ≥ 85% en AuthService, TenantService, AuditService
☐ 0 errores TypeScript strict mode (noImplicitAny, strictNullChecks)
☐ 0 errores ESLint
☐ 0 imports circulares (madge --circular)
☐ 0 credenciales hardcodeadas (truffleHog scan)
☐ OWASP ASVS L2 checklist completado y firmado
☐ PR aprobado por Architect Software (code review de boundaries y seguridad)
☐ ADR-017, ADR-018, ADR-019, ADR-020 archivados y aprobados
☐ Swagger UI funcional en /api/docs con todos los endpoints
☐ .env.example completo
☐ docker compose up en server limpio funciona sin errores
☐ Migrations corren automáticamente al iniciar
☐ Health check /health responde correctamente
☐ Logs JSON estructurados en stdout
☐ Job de purga de refresh_tokens configurado (BullMQ, cada 24h)
☐ Runbook de aprovisionamiento de tenant en docs/runbooks/
☐ Informe de fase Scaffold archivado en docs/informes/
☐ Informe de fase Sprint 1 archivado en docs/informes/
☐ Evidencia QA archivada en docs/quality/
☐ Si hubo bloqueo o desvío, decisión stop/go archivada en docs/adrs/ o docs/quality/
☐ Informe de Sprint 1 generado por EM y entregado al CTO
```

---

## Métricas DORA — Línea Base Sprint 1

Al cerrar el sprint, el EM reporta estas métricas:

| Métrica DORA          | Definición                                       | Target Sprint 1                |
| --------------------- | ------------------------------------------------ | ------------------------------ |
| Deployment Frequency  | # de deploys a staging durante el sprint         | ≥ 3 (al menos 1 por semana)    |
| Lead Time for Changes | Desde primer commit hasta deploy a staging       | < 2 días                       |
| Change Failure Rate   | # de commits que rompen el build / total commits | < 10% (Sprint 1 — aprendizaje) |
| MTTR                  | Tiempo en restaurar si algo rompe staging        | < 2 horas                      |

---

_Plan de Sprint generado por: AI-EM (Engineering Manager) — iWana neXt Platform_
_Fecha: 2026-02-27 | Sprint 1 de 12 — MVP_
_Framework de Gobernanza Multi-IA v2.0_
