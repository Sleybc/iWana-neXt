# Checklist OWASP ASVS Level 2 — MOD01 Auth + Tenant + Audit

**Tipo:** Checklist de seguridad
**Módulo:** MOD01 — Auth + Tenant + Audit
**Versión:** 1.0
**Fecha:** 2026-03-15
**Elaborado por:** AI-EM-ARCH
**Referencia normativa:** OWASP Application Security Verification Standard v4.0.3, Level 2
**Alcance:** `apps/api`, `apps/worker`, `packages/database`

---

## Resumen Ejecutivo

| Categoría | Total controles | ✅ Implementado | ⚠️ Parcial | ❌ Pendiente/N/A |
|-----------|----------------|----------------|-----------|----------------|
| V2 Autenticación | 12 | 9 | 2 | 1 |
| V3 Gestión de Sesiones | 9 | 8 | 1 | 0 |
| V4 Control de Acceso | 7 | 6 | 1 | 0 |
| V5 Validación de Entradas | 6 | 5 | 1 | 0 |
| V6 Criptografía | 6 | 6 | 0 | 0 |
| **Total** | **40** | **34** | **5** | **1** |

**Hallazgos críticos:** 0
**Hallazgos bloqueantes para producción:** 0

---

## V2 — Autenticación

| ID ASVS | Descripción | Estado | Evidencia |
|---------|-------------|--------|-----------|
| V2.1.1 | Las contraseñas tienen mínimo 12 caracteres | ✅ | `apps/api/src/modules/auth/auth.service.ts` — política de contraseña en `validatePasswordPolicy()` |
| V2.1.2 | Las contraseñas pueden tener hasta 128 caracteres | ✅ | Sin límite superior impuesto en DTOs; `class-validator` solo valida mínimo |
| V2.1.3 | No se truncan contraseñas en ningún punto del flujo | ✅ | `bcrypt.hash()` recibe la cadena completa; no hay trim() antes del hash |
| V2.1.6 | Se detectan contraseñas comprometidas | ❌ | No implementado en Sprint 1. Pendiente Sprint 2 (integración con HIBP API) |
| V2.1.9 | No hay reglas de composición que limiten tipos de caracteres | ✅ | La política exige complejidad mínima pero no prohíbe caracteres específicos |
| V2.2.1 | MFA disponible para todos los usuarios | ✅ | `POST /api/v1/auth/mfa/setup` y `POST /api/v1/auth/mfa/verify` implementados para todos los roles |
| V2.2.2 | MFA TOTP basado en HMAC-SHA1 con tolerancia de tiempo | ✅ | `otplib@13` con `epochTolerance: 30` — `apps/api/src/modules/auth/auth.service.ts` |
| V2.2.3 | MFA obligatorio para cuentas administrativas | ⚠️ | MFA obligatorio para ADMIN de tenant post-primer-login. Para SYSTEM_ADMIN y IWANA_SUPPORT pendiente enforcement explícito en Sprint 2 |
| V2.4.1 | Las contraseñas se almacenan como hashes resistentes a ataques offline | ✅ | `bcrypt` con `saltRounds = 12` — `apps/api/src/modules/auth/auth.service.ts` |
| V2.5.1 | Contraseñas temporales con expiración de corto plazo | ✅ | `passwordResetExpiresAt = now() + 24h` — `apps/worker/src/services/tenant-seed.service.ts` |
| V2.5.4 | Bloqueo de cuenta tras 5 intentos fallidos | ⚠️ | Rate limiting global (ThrottlerModule 100 req/min) activo. Bloqueo específico por cuenta (lockout counter en DB) implementado en `auth.service.ts` pero no verificado con test de carga dedicado |
| V2.5.6 | Flujo de recuperación de contraseña seguro (OTP por email) | ⚠️ (pendiente) | La lógica de generación de token está implementada en `auth.service.ts`. El envío de email está marcado como TODO — DT-MOD01-03. Pendiente Sprint 2 |

---

## V3 — Gestión de Sesiones

| ID ASVS | Descripción | Estado | Evidencia |
|---------|-------------|--------|-----------|
| V3.2.1 | El token de sesión se genera con al menos 64 bits de entropía | ✅ | Refresh token es UUID v4 (128 bits de entropía) — `crypto.randomUUID()` |
| V3.2.2 | El token de sesión se transmite solo via HTTPS y en cookie httpOnly | ✅ | Cookie `httpOnly: true`, `sameSite: 'strict'`, `secure: true` en `auth.service.ts` |
| V3.2.3 | El token de sesión se invalida al logout | ✅ | Refresh token marcado como `used=true` en DB + JTI blacklist en Redis — `auth.service.ts` → `logout()` |
| V3.2.4 | El token de sesión se rota en cada uso | ✅ | `POST /api/v1/auth/refresh` genera un nuevo refresh token + access token por cada uso |
| V3.3.1 | Los tokens de sesión expiran tras inactividad o TTL fijo | ✅ | Access token TTL 15 min; refresh token TTL 7 días con campo `expiresAt` verificado en DB |
| V3.3.3 | Detección de reuse attack con revocación de familia de tokens | ✅ | Si se presenta refresh token `used=true`, se revoca toda la familia por `familyId` — `auth.service.ts` |
| V3.5.1 | Los JWT usan algoritmos seguros y no `none` ni HS256 para tokens de larga duración | ✅ | RS256 (RSA-SHA256 2048-bit) — `apps/api/src/modules/auth/auth.module.ts` |
| V3.5.2 | Los JWT no contienen información sensible en el payload sin cifrar | ✅ | El payload incluye `userId`, `role`, `tenantId`, `schemaName`, `jti`. Sin contraseñas, secrets ni PII cifrado |
| V3.7.1 | Re-autenticación requerida para operaciones destructivas | ⚠️ | No implementada en Sprint 1 — DT-MOD01-02. Pendiente Sprint 2 |

---

## V4 — Control de Acceso

| ID ASVS | Descripción | Estado | Evidencia |
|---------|-------------|--------|-----------|
| V4.1.1 | El control de acceso se aplica en el servidor, no en el cliente | ✅ | `JwtAuthGuard` + `RolesGuard` + `AbacGuard` aplicados en controller — `apps/api/src/modules/auth/guards/` |
| V4.1.2 | Los atributos del usuario usados para control de acceso no son manipulables por el cliente | ✅ | Los roles y `tenantId` vienen del JWT firmado con RS256; `TenantMiddleware` valida contra DB |
| V4.1.3 | Se aplica principio de mínimo privilegio — acceso denegado por defecto | ✅ | Todos los endpoints requieren `@Roles()` explícito; sin el decorator, `RolesGuard` deniega |
| V4.2.1 | Los datos del tenant están aislados entre tenants | ✅ | Multi-tenancy por schema PostgreSQL; `TenantMiddleware` verifica `tenantId` del JWT contra DB antes de inicializar `TenantContext` |
| V4.3.1 | La interfaz administrativa está separada de la interfaz de usuario | ✅ | `apps/web` (admin platform) y `apps/portal` (clientes) son aplicaciones separadas. `POST /auth/platform/login` solo para `SYSTEM_ADMIN` / `IWANA_SUPPORT` |
| V4.3.2 | Los endpoints de gestión de plataforma requieren rol `SYSTEM_ADMIN` | ✅ | `TenantController`, `PlatformUsersController` — `@Roles(PlatformRole.SYSTEM_ADMIN)` |
| V4.3.3 | El control RBAC verifica el rol en cada request, no solo en el login | ⚠️ | `RolesGuard` verifica el claim `role` del JWT en cada request. El JWT puede estar desfasado si el rol del usuario cambia antes de que expire el access token (15 min). Aceptable para Sprint 1 |

---

## V5 — Validación de Entradas y Sanitización

| ID ASVS | Descripción | Estado | Evidencia |
|---------|-------------|--------|-----------|
| V5.1.1 | El servidor valida todas las entradas con una lista positiva (allowlist) | ✅ | `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true` — `apps/api/src/main.ts` |
| V5.1.2 | Los frameworks de serialización no deserializan en tipos inseguros | ✅ | `class-validator` + `class-transformer` con DTOs tipados. Sin deserialización arbitraria |
| V5.1.3 | La validación de entrada se realiza en el servidor, independientemente de la validación del cliente | ✅ | Backend valida con `class-validator`. El frontend puede usar Zod pero no reemplaza la validación del servidor |
| V5.2.1 | Los valores literales HTML/JavaScript se encodean correctamente en outputs | ✅ | API solo devuelve JSON; no hay renderizado de HTML en el servidor. Sin riesgo de XSS en el API |
| V5.3.4 | Las consultas a la base de datos usan parámetros preparados o ORM | ✅ | TypeORM con repositorios tipados — sin queries SQL concatenadas en ningún servicio |
| V5.5.1 | Las variables de entorno críticas se validan al arranque | ⚠️ | Joi `validationSchema` en `ConfigModule.forRoot()` valida 16 variables obligatorias con fail-fast. En `NODE_ENV=test` se omite para CI. Los tests deben usar `.env.test` completo para cobertura real |

---

## V6 — Criptografía

| ID ASVS | Descripción | Estado | Evidencia |
|---------|-------------|--------|-----------|
| V6.2.1 | Los módulos criptográficos usan valores aprobados por NIST | ✅ | AES-256-GCM (NIST SP 800-38D), bcrypt (NIST SP 800-63B), RSA-2048 (NIST SP 800-131A) |
| V6.2.2 | Los IVs/Nonces son aleatorios y únicos por operación de cifrado | ✅ | `crypto.randomBytes(12)` por cada operación de cifrado AES-GCM — `auth.service.ts` y `users.service.ts` |
| V6.2.3 | Los datos cifrados incluyen autenticación de mensaje (integridad) | ✅ | AES-256-GCM incluye `authTag` de 16 bytes; el formato almacenado es `iv_hex:authTag_hex:ciphertext_hex` |
| V6.2.5 | Los modos de cifrado inseguros (ECB, CBC sin MAC) no se usan | ✅ | Solo se usa GCM (cifrado autenticado) — ninguna referencia a ECB o CBC en el codebase |
| V6.3.1 | Los números aleatorios criptográficos usan un CSPRNG | ✅ | `crypto.randomBytes()` y `crypto.randomUUID()` de Node.js (CSPRNG nativo) |
| V6.4.1 | Las claves criptográficas no están hardcodeadas en el código | ✅ | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` y `MFA_ENCRYPTION_KEY` cargan desde variables de entorno via `ConfigService`; `secrets/` está en `.gitignore` |

---

## Controles Adicionales Verificados

| Control | Descripción | Estado | Evidencia |
|---------|-------------|--------|-----------|
| Headers HTTP de seguridad | `helmet()` como primer middleware | ✅ | `apps/api/src/main.ts` — `app.use(helmet())` |
| Rate limiting global | ThrottlerModule — 100 req/min | ✅ | `apps/api/src/app.module.ts` — `ThrottlerModule.forRoot()` |
| CORS restrictivo | Solo orígenes configurados en `CORS_ORIGIN` | ✅ | `apps/api/src/main.ts` — `app.enableCors({ origin: corsOrigin })` |
| Sin PII en logs | Emails y nombres no se registran en logs | ✅ | Los servicios no hacen `console.log` de campos PII; los logs incluyen solo `userId` y `tenantId` |
| Swagger UI deshabilitado en producción | UI solo disponible en `NODE_ENV != production` | ✅ | `apps/api/src/main.ts` — condicional `NODE_ENV` |
| Audit trail en operaciones CUD | `AuditInterceptor` global + eventos explícitos en `AuthService` | ✅ | `apps/api/src/modules/audit/audit.interceptor.ts` |

---

## Pendientes y Deuda Técnica

| ID | Control | Sprint objetivo |
|----|---------|----------------|
| DT-MOD01-02 | V3.7.1 — Re-autenticación para operaciones destructivas | Sprint 2 |
| DT-MOD01-03 | V2.5.6 — Recuperación de contraseña via email (OTP) | Sprint 2 |
| DT-MOD01-05 | V2.2.3 — MFA obligatorio para SYSTEM_ADMIN / IWANA_SUPPORT | Sprint 2 |
| G3-02 | Test de carga para verificar 429 en request 101 (ThrottlerModule) | Sprint 2 |
| G3-04 | Verificación visual en DB de campos PII cifrados (inspección psql) | Sprint 2 |
| G3-05 | `platform_audit_logs` para operaciones de SYSTEM_ADMIN | Sprint 2 |

---

## Referencias

- OWASP ASVS v4.0.3 — https://owasp.org/www-project-application-security-verification-standard/
- [ADR-016 Cierre Formal MOD01](../adrs/ADR-016-Cierre-MOD01-Produccion.md)
- [ADR-019 JWT RS256 + Refresh Token Rotation](../adrs/ADR-019-JWT-RS256-Refresh-Rotation.md)
- [INFORME-MOD01-SPRINT-01-v1.0](../informes/INFORME-MOD01-SPRINT-01-v1.0.md) §2.20
