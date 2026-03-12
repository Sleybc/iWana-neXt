# PRD — Módulo 1: Auth + Usuarios + Tenant + Audit

## iWana neXt Platform — ISP/OSS/BSS Colombia

**Versión:** 1.1
**Fecha:** 2026-03-07
**Estado:** ✅ APROBADO — Definición arquitectónica vigente; cierre productivo pendiente
**Autor:** AI-ARCH (Architect Software)
**Solicitado por:** AI-EM (Engineering Manager)
**HLD base:** docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md (AI-ARCH)
**ADRs:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-012, ADR-017, ADR-018, ADR-019, ADR-020, ADR-022

---

## 1. Contexto y Motivación

### 1.1 Por qué este módulo existe

El Módulo 1 es la **fundación irreversible** de iWana neXt. Sin él, ningún otro módulo puede existir — no hay autenticación, no hay aislamiento de datos, no hay trazabilidad de cambios. Es el único módulo sin dependencias upstream.

Todos los demás módulos (CRM, Billing, NMS, Provisioning, etc.) consumen los Guards, Decoradores y el pipeline de seguridad que este módulo provee. Si este módulo tiene deuda técnica o errores de diseño, esa deuda se propaga a los 15 módulos restantes. **Aquí la calidad no es negociable.**

### 1.2 Problema a resolver

El ISP colombiano que usa iWana neXt necesita que múltiples tipos de usuarios (empleados, suscriptores, técnicos, auditores, inversionistas, soporte externo) accedan a la plataforma con permisos granulares, desde una misma URL, con garantía de que los datos de cada empresa están completamente aislados de las demás. Adicionalmente, la normativa colombiana (Ley 1581/2012, DIAN, CRC) exige trazabilidad de 7 años de todas las operaciones que modifican datos.

### 1.3 Alcance en el roadmap

- **Posición:** Módulo 1 de 20. MVP obligatorio.
- **Regla de completitud (ADR-016):** Ningún otro módulo inicia hasta que este esté production-ready y aprobado por el Architect Software.
- **Excepción controlada:** Si negocio exige repriorizar otro módulo o si aparece un bloqueo técnico real, la decisión debe quedar documentada formalmente según ADR-022.
- **Fase:** MVP (0-90 días).

### 1.4 Artefactos obligatorios del módulo

Este módulo no se considera correctamente gobernado si faltan alguno de estos artefactos en `docs/`:

- PRD del módulo en `docs/prds/`
- HLD del módulo en `docs/hlds/`
- prompts de ejecución por fase en `docs/prompts/`
- informes de fase y cierre en `docs/informes/`
- evidencia de calidad y checklist de salida en `docs/quality/`
- ADRs y decisiones de bloqueo/repriorización en `docs/adrs/` cuando apliquen

---

## 2. Alcance

### IN — Lo que construimos en este módulo

- **@iwana/auth:** Autenticación JWT RS256, MFA TOTP, gestión de sesiones con refresh token rotation y detección de reuse attack, recuperación de contraseña, pipeline de seguridad completo (Rate Limit → TLS → JWT → Tenant → RBAC → ABAC → Zod → Logic → Audit)
- **@iwana/tenant:** CRUD de tenants (solo SYSTEM_ADMIN), aprovisionamiento automático de schemas PostgreSQL por tenant (DDL programático + BullMQ worker), seed inicial por tenant (ADMIN + config base), schema routing middleware
- **@iwana/audit:** Interceptor global append-only para todas las operaciones CUD, API de consulta de audit logs con paginación cursor-based, retención 7 años con RLS que previene borrado
- **Guards y decoradores compartidos:** `JwtAuthGuard`, `RolesGuard`, `AbacGuard`, `@CurrentUser()`, `@Roles()`, `@Public()`, `@TenantId()` — consumidos por todos los módulos futuros
- **Frontend:** Página de login (apps/web + apps/portal) con design system iWana, flujo de MFA setup/verify, pantalla de cambio de password obligatorio

### OUT — Lo que NO está en este módulo

- Perfil detallado de suscriptor (datos de contrato, estrato, IVA) → @iwana/crm (Módulo 2)
- Perfil detallado de empleado (nómina, departamento, contrato laboral) → @iwana/hcm (Fase 3)
- Notificaciones de bienvenida via WhatsApp → @iwana/omnichannel (Fase 2)
- Portal público (landing comercial, consulta de cobertura) → proyecto externo separado
- RBAC de módulos futuros (NMS, Billing, etc.) → cada módulo declara sus propias rutas y roles permitidos

---

## 3. Personas y Casos de Uso

### 3.1 Tipos de usuarios soportados (14 roles)

| Rol             | Perfil asociado | Ubicación en DB | MFA obligatorio |
| --------------- | --------------- | --------------- | --------------- |
| `ADMIN`         | EMPLOYEE        | Schema tenant   | ✅ Sí           |
| `NOC`           | EMPLOYEE        | Schema tenant   | ✅ Sí           |
| `SUPPORT`       | EMPLOYEE        | Schema tenant   | No              |
| `SALES`         | EMPLOYEE        | Schema tenant   | No              |
| `TECHNICIAN`    | EMPLOYEE        | Schema tenant   | No              |
| `ACCOUNTANT`    | EMPLOYEE        | Schema tenant   | ✅ Sí           |
| `HR`            | EMPLOYEE        | Schema tenant   | No              |
| `SUBSCRIBER`    | SUBSCRIBER      | Schema tenant   | No              |
| `CONTRACTOR`    | CONTRACTOR      | Schema tenant   | No              |
| `PARTNER`       | PARTNER         | Schema tenant   | No              |
| `AUDITOR`       | AUDITOR         | Schema tenant   | No              |
| `INVESTOR`      | INVESTOR        | Schema tenant   | No              |
| `SYSTEM_ADMIN`  | PlatformUser    | Schema público  | ✅ Sí (siempre) |
| `IWANA_SUPPORT` | PlatformUser    | Schema público  | ✅ Sí (siempre) |

### 3.2 Casos de uso principales

**UC-01: Login con MFA**

- Actor: Cualquier usuario registrado
- Flujo: Email + password → validación → si MFA habilitado, pedir código TOTP → retornar access token (body) + refresh token (cookie httpOnly)
- Alternativa: Si `passwordResetRequired=true`, forzar pantalla de cambio de password antes de acceder

**UC-02: Login primer acceso (Admin de nuevo tenant)**

- Actor: ADMIN de ISP recién creado
- Flujo: Recibe email con password temporal → ingresa → sistema detecta `passwordResetRequired=true` → fuerza setup de nuevo password → fuerza setup de MFA (ADMIN obligatorio) → accede al dashboard

**UC-03: Aprovisionamiento de tenant (SYSTEM_ADMIN)**

- Actor: SYSTEM_ADMIN de iWana
- Flujo: Crea tenant con nombre + slug + adminEmail → sistema crea schema PostgreSQL en background (BullMQ) → seed inicial (ADMIN + config) → email automático con credenciales temporales → tenant queda en ACTIVE

**UC-04: Aislamiento multi-tenant**

- Actor: Usuario de Tenant A con JWT válido
- Flujo: Intenta acceder a datos de Tenant B → TenantMiddleware detecta mismatch → HTTP 403 antes de llegar a la lógica de negocio

**UC-05: Consulta de audit log (Auditor)**

- Actor: Auditor del ISP
- Flujo: Consulta `/api/v1/audit-logs` con filtros (rango de fechas, tipo de entidad, usuario) → sistema retorna registros paginados con cursor → puede exportar para informes regulatorios (CRC, DIAN)

---

## 4. Requerimientos Funcionales

### RF-AUTH (Autenticación)

| ID         | Requerimiento                                                                                                      | Prioridad | ADR ref       |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | --------- | ------------- |
| RF-AUTH-01 | Login con email + password. Mensaje de error genérico (no revelar si email existe).                                | MVP       | OWASP         |
| RF-AUTH-02 | Bloqueo temporal de cuenta tras 5 intentos fallidos (15 minutos).                                                  | MVP       | OWASP         |
| RF-AUTH-03 | MFA TOTP: setup (QR + secret), verify (activa MFA), disable (requiere password + código).                          | MVP       | ADR-001       |
| RF-AUTH-04 | MFA obligatorio para: ADMIN, NOC, ACCOUNTANT, SYSTEM_ADMIN, IWANA_SUPPORT.                                         | MVP       | PRD v2.2      |
| RF-AUTH-05 | JWT RS256 con access token (15 min) y refresh token rotado por cookie httpOnly (7 días).                           | MVP       | ADR-019       |
| RF-AUTH-06 | Detección de reuse attack: refresh token ya rotado → revocar familia completa.                                     | MVP       | ADR-019       |
| RF-AUTH-07 | Recuperación de contraseña: token expirable en 1 hora, respuesta siempre HTTP 200.                                 | MVP       | OWASP         |
| RF-AUTH-08 | Cambio de contraseña: requiere contraseña actual, invalida todos los refresh tokens al cambiar.                    | MVP       | —             |
| RF-AUTH-09 | Email de verificación al crear usuario. Usuario no puede operar hasta verificar.                                   | MVP       | —             |
| RF-AUTH-10 | Política de contraseñas NIST SP 800-63B / OWASP: mínimo 10 chars, mayúscula, minúscula, número, carácter especial. | MVP       | OWASP ASVS L2 |
| RF-AUTH-11 | JTI blacklist en Redis para revocación inmediata de access tokens en logout.                                       | MVP       | ADR-003       |

### RF-TENANT (Multi-tenant)

| ID        | Requerimiento                                                                                                                           | Prioridad | ADR ref |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------- |
| RF-TNT-01 | CRUD completo de tenants (solo SYSTEM_ADMIN). Slug inmutable post-creación.                                                             | MVP       | ADR-002 |
| RF-TNT-02 | Aprovisionamiento automático de schema PostgreSQL al crear tenant (BullMQ worker).                                                      | MVP       | ADR-017 |
| RF-TNT-03 | Schema routing: cada request del tenant usa su schema exclusivo. Imposible cross-schema accidental.                                     | MVP       | ADR-002 |
| RF-TNT-04 | Seed inicial por tenant: ADMIN con password temporal (24h) + config base + catálogo de docs CO.                                         | MVP       | ADR-020 |
| RF-TNT-05 | Ciclo de vida del tenant: PROVISIONING → ACTIVE → SUSPENDED → INACTIVE. Tenant SUSPENDED bloquea acceso (HTTP 403) en TenantMiddleware. | MVP       | ADR-018 |
| RF-TNT-06 | Configuración por tenant en JSONB: timezone (default: America/Bogota), currency (default: COP), features habilitadas.                   | MVP       | —       |
| RF-TNT-07 | SYSTEM_ADMIN puede regenerar credenciales temporales del ADMIN de un tenant (`POST /tenants/:id/regenerate-admin-credentials`).         | MVP       | ADR-020 |
| RF-TNT-08 | Cache de tenant en Redis (TTL 5 min) para evitar query a public.tenants en cada request.                                                | MVP       | ADR-003 |

### RF-RBAC (Control de Acceso)

| ID         | Requerimiento                                                                                    | Prioridad | ADR ref        |
| ---------- | ------------------------------------------------------------------------------------------------ | --------- | -------------- |
| RF-RBAC-01 | Guard `@Roles()` verifica el rol del usuario contra los roles permitidos en el endpoint.         | MVP       | —              |
| RF-RBAC-02 | Guard ABAC verifica que el recurso pertenece al tenant del usuario autenticado.                  | MVP       | ADR-002        |
| RF-RBAC-03 | Un usuario de cualquier rol puede ver y modificar únicamente sus propios datos (ABAC adicional). | MVP       | PRD v2.2 §13.3 |
| RF-RBAC-04 | ADMIN no puede modificar ni eliminar a otro ADMIN del mismo tenant (previene lockout).           | MVP       | —              |
| RF-RBAC-05 | SYSTEM_ADMIN tiene acceso a todos los tenants y no pasa por tenant resolution.                   | MVP       | ADR-018        |
| RF-RBAC-06 | IWANA_SUPPORT solo puede acceder a logs, métricas y health checks (sin datos de negocio ni PII). | MVP       | ADR-018        |

### RF-AUDIT (Auditoría)

| ID        | Requerimiento                                                                                                                                            | Prioridad | ADR ref       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- |
| RF-AUD-01 | Interceptor global registra TODA operación CUD en `audit_logs` sin intervención del código de negocio.                                                   | MVP       | ADR-004       |
| RF-AUD-02 | Audit log incluye: `userId`, `tenantId`, `action`, `entityType`, `entityId`, `oldValue`, `newValue`, `ipAddress`, `userAgent`, `requestId`, `createdAt`. | MVP       | ADR-004       |
| RF-AUD-03 | Operaciones de SYSTEM_ADMIN/IWANA_SUPPORT se registran en `public.platform_audit_logs` (ADR-018 aprobado).                                               | MVP       | ADR-018       |
| RF-AUD-04 | Audit log es append-only: NO existe endpoint DELETE ni UPDATE. RLS en PostgreSQL previene borrado directo.                                               | MVP       | ADR-004       |
| RF-AUD-05 | API de consulta con filtros: `entityType`, `entityId`, `userId`, `action`, `from`, `to`. Paginación cursor-based.                                        | MVP       | Ley 1581/2012 |
| RF-AUD-06 | Retención mínima de 7 años. No participar en procesos de borrado por derechos ARCO (solo anonimizar el nombre en otras tablas, nunca el audit log).      | MVP       | Ley 1581/2012 |
| RF-AUD-07 | Decorador `@SkipOldValue()` disponible para entidades de alta frecuencia donde `oldValue` no aporta valor (requiere justificación en PR).                | MVP       | ADR-004       |

---

## 5. Requerimientos No Funcionales

| Categoría      | NFR                           | Target                               | Medición          |
| -------------- | ----------------------------- | ------------------------------------ | ----------------- |
| Performance    | Login endpoint (p95)          | < 200ms                              | Prometheus        |
| Performance    | Refresh token (p95)           | < 100ms                              | Prometheus        |
| Performance    | Audit log query (p95)         | < 300ms                              | Prometheus        |
| Seguridad      | OWASP ASVS                    | Level 2 completo                     | Checklist firmado |
| Seguridad      | JWT                           | RS256, llaves ≥ 2048 bits            | Inspección        |
| Seguridad      | Cifrado PII                   | AES-256-GCM (email, mfaSecret)       | Inspección DB     |
| Disponibilidad | Uptime del módulo             | > 99.5%                              | Prometheus        |
| Escalabilidad  | Requests concurrentes de auth | 200+ sin degradación                 | Load test k6      |
| Mantenibilidad | Cobertura de tests            | ≥ 85% en Services                    | Jest coverage     |
| Mantenibilidad | TypeScript strict mode        | 0 errores                            | CI/CD             |
| Observabilidad | Logs                          | JSON estructurado (Pino)             | Grafana           |
| Operacional    | Deploy on-premise             | `docker compose up` en server limpio | Manual test       |

---

## 6. Modelo de Datos

### 6.1 Schema Público (una sola instancia, compartida)

```
public.tenants
  id (UUID PK), name, slug (UNIQUE), schema_name (UNIQUE), status (enum),
  settings (JSONB), contact_email, max_subscribers (int), created_at, updated_at

public.platform_users
  id (UUID PK), email (AES-256 cifrado), email_hash (SHA-256, UNIQUE),
  password_hash (bcrypt 12), role (SYSTEM_ADMIN|IWANA_SUPPORT), status (enum),
  mfa_enabled (bool, always true), mfa_secret (AES-256 cifrado),
  last_login_at, created_at, updated_at, deleted_at (soft delete)

public.platform_audit_logs
  id (UUID PK), user_id, action, entity_type, entity_id,
  old_value (JSONB), new_value (JSONB), ip_address, user_agent,
  request_id, created_at
  [SIN updated_at, SIN deleted_at — append-only absoluto]
  [Índices: (user_id, created_at DESC), (action, created_at DESC)]
```

### 6.2 Schema por Tenant (`tenant_<slug>`)

```
users
  id (UUID PK), email (AES-256), email_hash (SHA-256 UNIQUE),
  password_hash (bcrypt 12), role (enum 14 roles), status (enum),
  tenant_id (FK lógica a public.tenants), mfa_enabled (bool),
  mfa_secret (AES-256), password_reset_required (bool),
  password_reset_token (hash), password_reset_expires_at,
  failed_login_attempts (int), locked_until, last_login_at,
  email_verified (bool), email_verification_token,
  created_at, updated_at, deleted_at
  [Índices: (email_hash), (tenant_id, role), (tenant_id, status)]

refresh_tokens
  id (UUID PK), user_id (FK), token_hash (SHA-256 UNIQUE),
  family_id (UUID, agrupador de sesión), expires_at,
  revoked_at (null=vigente), revoke_reason (enum),
  ip_address, user_agent, created_at
  [Índices: (token_hash), (family_id), (user_id, revoked_at)]
  [Job de purga diaria: DELETE WHERE expires_at < NOW() - INTERVAL '1 day']

audit_logs
  id (UUID PK), tenant_id, user_id (nullable para jobs del sistema),
  action (enum), entity_type, entity_id, old_value (JSONB),
  new_value (JSONB), ip_address, user_agent, request_id, created_at
  [SIN updated_at, SIN deleted_at — append-only]
  [Índices: (tenant_id, created_at DESC), (entity_type, entity_id),
            (user_id, created_at DESC), (action, tenant_id)]
  [RLS Policy: DENY DELETE, DENY UPDATE para todos los roles]
```

### 6.3 Retención por entidad

| Entidad               | Retención                  | Base legal                 | Acción                      |
| --------------------- | -------------------------- | -------------------------- | --------------------------- |
| `users` (PII)         | Vigencia contrato + 5 años | Ley 1581/2012              | Soft delete + anonimización |
| `audit_logs`          | 7 años                     | Ley 1581/2012 + compliance | Append-only, nunca borrar   |
| `platform_audit_logs` | 7 años                     | Compliance interno         | Append-only, nunca borrar   |
| `refresh_tokens`      | Purga diaria de expirados  | Operacional                | BullMQ job 24h              |

---

## 7. Contratos de API (resumen ejecutivo)

Referencia completa en docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md — Sección 4.

| Método | Endpoint                                           | Roles                        | Descripción                 |
| ------ | -------------------------------------------------- | ---------------------------- | --------------------------- |
| POST   | `/api/v1/auth/login`                               | Público                      | Login con credenciales      |
| POST   | `/api/v1/auth/refresh`                             | Público (cookie)             | Rotar refresh token         |
| POST   | `/api/v1/auth/logout`                              | Autenticado                  | Cerrar sesión               |
| POST   | `/api/v1/auth/mfa/setup`                           | Autenticado                  | Iniciar setup TOTP          |
| POST   | `/api/v1/auth/mfa/verify`                          | Autenticado                  | Activar MFA                 |
| POST   | `/api/v1/auth/mfa/disable`                         | Autenticado                  | Desactivar MFA              |
| GET    | `/api/v1/auth/me`                                  | Autenticado                  | Perfil propio               |
| POST   | `/api/v1/auth/forgot-password`                     | Público                      | Solicitar reset             |
| POST   | `/api/v1/auth/reset-password`                      | Público (token)              | Establecer nueva contraseña |
| POST   | `/api/v1/auth/change-password`                     | Autenticado                  | Cambiar contraseña          |
| GET    | `/api/v1/users`                                    | ADMIN, SYSTEM_ADMIN          | Listar usuarios del tenant  |
| POST   | `/api/v1/users`                                    | ADMIN                        | Crear usuario               |
| GET    | `/api/v1/users/:id`                                | ADMIN, propio                | Ver usuario                 |
| PATCH  | `/api/v1/users/:id`                                | ADMIN, propio                | Actualizar usuario          |
| DELETE | `/api/v1/users/:id`                                | ADMIN                        | Soft delete usuario         |
| GET    | `/api/v1/tenants`                                  | SYSTEM_ADMIN                 | Listar tenants              |
| POST   | `/api/v1/tenants`                                  | SYSTEM_ADMIN                 | Crear tenant                |
| GET    | `/api/v1/tenants/:id`                              | SYSTEM_ADMIN                 | Ver tenant                  |
| PATCH  | `/api/v1/tenants/:id`                              | SYSTEM_ADMIN                 | Actualizar tenant           |
| PATCH  | `/api/v1/tenants/:id/suspend`                      | SYSTEM_ADMIN                 | Suspender tenant            |
| PATCH  | `/api/v1/tenants/:id/activate`                     | SYSTEM_ADMIN                 | Reactivar tenant            |
| POST   | `/api/v1/tenants/:id/regenerate-admin-credentials` | SYSTEM_ADMIN                 | Regenerar password admin    |
| GET    | `/api/v1/audit-logs`                               | AUDITOR, ADMIN, SYSTEM_ADMIN | Consultar audit log         |
| GET    | `/health`                                          | Público                      | Health check                |

**Estándar de API:**

- Versión URI: `/api/v1/`
- Paginación: cursor-based (`?cursor=<uuid>&limit=50`)
- Errores: RFC 7807 Problem Details
- Validación semántica y de payload: `400 Bad Request` para este módulo
- Idempotencia: header `Idempotency-Key` en POST/PUT (Redis TTL 24h)
- Docs: Swagger UI en `/api/docs`

**Decisión de diseño aplicada al contrato de administración:**

- El namespace único de administración es `/api/v1/tenants`; no se expone `/api/v1/platform/tenants` como contrato final del módulo.
- `tenant` es el recurso técnico del backend; `empresa` es sólo naming funcional en el portal.
- El alta entra por `createWithProvisioning`.
- `ACTIVE` sólo se publica al completar schema + seed mínimo del primer admin.

---

## 8. Criterios de Aceptación

Referencia completa: CA-M01-001 a CA-M01-063 en docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md — Sección 8.

**Resumen por categoría:**

| Categoría           | Criterios               | Todos deben pasar para DoD |
| ------------------- | ----------------------- | -------------------------- |
| Autenticación       | CA-M01-001 a CA-M01-013 | ✅ 100%                    |
| Multi-tenant        | CA-M01-020 a CA-M01-022 | ✅ 100%                    |
| RBAC                | CA-M01-030 a CA-M01-033 | ✅ 100%                    |
| Gestión Tenants     | CA-M01-040 a CA-M01-042 | ✅ 100%                    |
| Audit Log           | CA-M01-050 a CA-M01-053 | ✅ 100%                    |
| Seguridad y Cifrado | CA-M01-060 a CA-M01-063 | ✅ 100%                    |

---

## 9. Dependencias y Riesgos

### 9.1 Dependencias técnicas pre-existentes (deben estar antes del Sprint 1)

| Dependencia                             | Estado        | Responsable       | Bloqueante                |
| --------------------------------------- | ------------- | ----------------- | ------------------------- |
| Docker Desktop en máquina de desarrollo | Por verificar | CTO               | ✅ Sí                     |
| PostgreSQL container corriendo          | Por crear     | Sr. Dev Fullstack | ✅ Sí                     |
| Redis container corriendo               | Por crear     | Sr. Dev Fullstack | ✅ Sí                     |
| Par de llaves RSA 2048-bit generado     | Por crear     | Sr. Dev Fullstack | ✅ Sí                     |
| Monorepo Turborepo scaffold             | Por crear     | Sr. Dev Fullstack | ✅ Sí                     |
| GitHub repo creado (local → remote)     | Por crear     | CTO               | ✅ Sí                     |
| GitHub Actions CI configurado           | Por crear     | Sr. Dev Fullstack | No (puede ir en paralelo) |

### 9.2 Riesgos del módulo

| #   | Riesgo                                                           | Prob. | Impacto | Mitigación                                                                          |
| --- | ---------------------------------------------------------------- | ----- | ------- | ----------------------------------------------------------------------------------- |
| R01 | Schema provisioning falla a mitad → schema corrupto              | Media | Alto    | Transacción DDL + tabla de estado con retry en BullMQ                               |
| R02 | Email de admin temporal no llega                                 | Media | Medio   | SYSTEM_ADMIN puede regenerar via API                                                |
| R03 | Complejidad de ABAC hace que guards sean lentos                  | Baja  | Medio   | Cache de permisos en Redis por usuario (TTL 5 min)                                  |
| R04 | Cifrado AES-256 en todos los emails genera overhead en búsquedas | Baja  | Medio   | Búsquedas siempre por emailHash (SHA-256) — índice eficiente                        |
| R05 | Audit log crece rápido en tenants con muchas operaciones         | Media | Bajo    | Índices correctos + purga programada (particionamiento en Fase 2 si > 1M registros) |

---

## 10. Definition of Done

El Módulo 1 solo se considera cerrado cuando el 100% de esta checklist está verificado y existe validación en producción. El EM puede planificar el siguiente módulo únicamente cuando haya cierre productivo o una repriorización formal aprobada.

### Funcionalidad (verificada por Sr. Dev QA)

- [ ] CA-M01-001 a CA-M01-063: todos pasan en staging
- [ ] Flujo completo de primer login de Admin de tenant nuevo: email → password temporal → cambio obligatorio → setup MFA → acceso a dashboard
- [ ] Aprovisionamiento de tenant: `POST /api/v1/tenants` entra por `createWithProvisioning` → schema PostgreSQL creado → seed mínimo primer admin → email admin → `status: ACTIVE`
- [ ] Aislamiento multi-tenant: test explícito con 2 tenants, usuario del tenant A no ve datos del tenant B
- [ ] Audit log: 100% de operaciones CUD registradas en tests de integración
- [ ] Job de purga de refresh_tokens expirados funcional en worker

### Calidad de Código (verificada por Architect Software)

- [ ] Cobertura tests ≥ 85% en AuthService, TenantService, AuditService (Jest)
- [ ] 0 errores TypeScript strict mode
- [ ] 0 errores ESLint
- [ ] 0 imports circulares (verificado con `madge --circular`)
- [ ] Code review del Architect Software aprobado y firmado

### Seguridad (verificada por Sr. Dev QA + Architect)

- [ ] 0 credenciales hardcodeadas (scan con `truffleHog` o `detect-secrets`)
- [ ] OWASP ASVS Level 2 checklist completado
- [ ] Rate limiting verificado con test de carga básico (100 req/min → 429 en la 101)
- [ ] Campos PII cifrados verificados con inspección directa en DB
- [ ] Headers HTTP de seguridad presentes en todas las respuestas
- [ ] Logs de aplicación NO contienen passwords, tokens ni secrets (grep en logs de test)

### Documentación (generada por EM)

- [ ] Swagger UI funcional en `/api/docs` con todos los endpoints del módulo
- [ ] ADR-017, ADR-018, ADR-019, ADR-020 archivados en `docs/adrs/`
- [ ] ADR-022 referenciado y aplicado en la ejecución del módulo
- [ ] `.env.example` completo y documentado
- [ ] Runbook de aprovisionamiento de tenant en `docs/runbooks/`
- [ ] Prompt(s) de ejecución por fase archivados en `docs/prompts/`
- [ ] Informe(s) de fase archivados en `docs/informes/`
- [ ] Informe de cierre del módulo archivado en `docs/informes/`
- [ ] Checklist de salida a producción archivado en `docs/quality/`
- [ ] Este PRD actualizado si surgieron cambios durante implementación

### Operacional (verificada por Sr. Dev Fullstack)

- [ ] `docker compose up` levanta todo el stack en server limpio (sin errores)
- [ ] Migrations corren automáticamente al iniciar
- [ ] Health check `/health` responde con estado de DB y Redis
- [ ] Logs en JSON estructurado visibles en stdout
- [ ] Job de purga de tokens configurado en BullMQ (repeatable, cada 24h)
- [ ] Deploy a producción ejecutado y validado con smoke tests del módulo
- [ ] Flujo funcional real del módulo validado en producción (login, MFA, tenant provisioning, audit log)

### Bloqueo y continuidad

- [ ] Si el módulo encontró un bloqueo técnico, existe documento formal con causa, impacto, opciones y decisión de continuidad
- [ ] Si se movió prioridad a otro módulo, la repriorización quedó aprobada y archivada

---

_PRD generado por: AI-ARCH (Architect Software) — iWana neXt Platform_
_Solicitado y orquestado por: AI-EM (Engineering Manager)_
_Basado en: PRD Master v2.2 y politica ADR-022_
_Fecha: 2026-03-07 | Framework de Gobernanza Multi-IA v2.0_
_Próxima revisión: al cierre del Sprint 1_
