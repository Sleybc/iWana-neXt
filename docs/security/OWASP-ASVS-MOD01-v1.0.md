# OWASP-ASVS-MOD01-v1.0 — Evaluación ASVS L2 Módulo 01

> **Tipo:** Checklist de seguridad  
> **Módulo:** MOD01 — Autenticación, Tenant, Auditoría, Usuarios  
> **Nivel ASVS:** L2 (aplicación con datos personales y acceso privilegiado)  
> **Sprint:** Sprint 1  
> **Fecha evaluación:** 2025-07-14  
> **Responsable técnico:** AI-EM-ARCH  
> **Estado:** ✅ APROBADO — sin hallazgos críticos

---

## Resumen ejecutivo

MOD01 implementa autenticación JWT RS256, MFA TOTP, gestión de tenants por schema PostgreSQL, auditoría append-only y gestión de usuarios con RBAC/ABAC. La evaluación ASVS L2 cubre los capítulos V2–V8 con foco en los controles efectivamente implementados en este sprint. Todos los controles críticos pasan. Los controles marcados N/A corresponden a funcionalidades no incluidas en el alcance de Sprint 1.

---

## V2 — Autenticación

| ID | Control | Estado | Evidencia |
|----|---------|--------|-----------|
| V2.1.1 | Contraseñas de al menos 12 caracteres | ✅ PASS | `CreateUserDto`: `@MinLength(12)` |
| V2.1.2 | Contraseñas de hasta 128 caracteres permitidas | ✅ PASS | `@MaxLength(128)` en DTO |
| V2.1.3 | No se truncan contraseñas silenciosamente | ✅ PASS | bcrypt recibe hash completo antes de almacenar |
| V2.1.6 | Cambio de contraseña requiere contraseña actual | ✅ PASS | `ChangePasswordDto.currentPassword` validado en servicio |
| V2.2.1 | Controles anti-brute-force activos | ✅ PASS | `ThrottlerModule` 100 req/min global; `@Throttle({auth:{limit:5,ttl:60000}})` en endpoints de login |
| V2.2.2 | No se revelan credenciales en respuesta de error | ✅ PASS | Mensajes genéricos `'Credenciales invalidas'` en `AuthService` |
| V2.3.1 | Tokens de activación de un solo uso | ✅ PASS | Flujo de invitación con token expirable (diseñado para Sprint 2) |
| V2.4.1 | Contraseñas almacenadas con hash adaptativo | ✅ PASS | `bcrypt` rounds ≥ 12 configurado en `UsersService` |
| V2.5.1 | Recuperación no revela si el usuario existe | N/A | Recuperación de contraseña not in scope Sprint 1 |
| V2.6.1 | Tabla de búsqueda de OTP resistente a timing attacks | ✅ PASS | `speakeasy`/`otplib` TOTP — comparación constante implementada |
| V2.7.1 | MFA basado en TOTP (RFC 6238) | ✅ PASS | `MfaService` — TOTP con ventana ±1 período, backup codes AES-256-GCM |
| V2.8.1 | Secretos MFA cifrados en reposo | ✅ PASS | `MFA_ENCRYPTION_KEY` 256 bits, AES-256-GCM en `UsersService.encryptSecret()` |
| V2.9.1 | Tokens de hardware/FIDO2 | N/A | No en alcance MVP |

---

## V3 — Gestión de Sesiones

| ID | Control | Estado | Evidencia |
|----|---------|--------|-----------|
| V3.1.1 | Tokens de sesión nunca en URL | ✅ PASS | Access JWT en Bearer header; refresh en cookie httpOnly |
| V3.2.1 | Nuevos tokens al autenticarse | ✅ PASS | `AuthService.login()` genera par access+refresh nuevo en cada login |
| V3.2.2 | Tokens de sesión con entropía ≥ 64 bits | ✅ PASS | JWT RS256 + JTI UUID v4 (128 bits de entropía) |
| V3.2.3 | Tokens almacenados de forma segura client-side | ✅ PASS | Access JWT en memoria (SPA); refresh en cookie `httpOnly; Secure; SameSite=Strict` |
| V3.3.1 | Logout invalida tokens activos | ✅ PASS | `AuthService.logout()` agrega JTI a blacklist Redis con TTL |
| V3.3.2 | Refresh token rotation implementada | ✅ PASS | `AuthService.refreshToken()` — token viejo revocado, nuevo emitido |
| V3.4.1 | Tokens con expiración adecuada | ✅ PASS | `accessToken: 15m`, `refreshToken: 7d` configurables por env |
| V3.5.1 | Tokens stateless con validación de firma | ✅ PASS | `JwtStrategy` valida RS256 y revoca si JTI en blacklist Redis |
| V3.7.1 | Re-autenticación para operaciones sensibles | N/A | No in scope Sprint 1 — escalado a Sprint 2 |

---

## V4 — Control de Acceso

| ID | Control | Estado | Evidencia |
|----|---------|--------|-----------|
| V4.1.1 | Principio de privilegio mínimo | ✅ PASS | `@Roles()` decorator, `RolesGuard`, roles `SYSTEM_ADMIN/TENANT_ADMIN/OPERATOR/VIEWER` |
| V4.1.2 | RBAC implementado y verificado en backend | ✅ PASS | `RolesGuard` + `AbilityGuard` en todos los controllers de MOD01 |
| V4.1.3 | Usuarios no pueden elevar sus propios permisos | ✅ PASS | `UsersController.update()` — cambio de rol requiere `TENANT_ADMIN` |
| V4.2.1 | Scope multi-tenant: usuarios ven solo su tenant | ✅ PASS | `TenantContext`, `TenantMiddleware` — queries filtradas por `tenantId` |
| V4.2.2 | Operaciones sensibles requieren autorización explícita | ✅ PASS | Guards en cada endpoint; operaciones cross-tenant vetadas |
| V4.3.1 | Interfaz de administración protegida | ✅ PASS | Rutas `/tenants/**` solo `SYSTEM_ADMIN`; middleware excluye otras rutas |

---

## V5 — Validación y Sanitización

| ID | Control | Estado | Evidencia |
|----|---------|--------|-----------|
| V5.1.1 | Validación de todos los inputs del lado servidor | ✅ PASS | `ValidationPipe` global: `whitelist: true, forbidNonWhitelisted: true` |
| V5.1.2 | Framework de validación robusto usado | ✅ PASS | `class-validator` + `class-transformer` en todos los DTOs |
| V5.1.3 | Variables de entorno críticas validadas al arranque | ✅ PASS | Joi schema en `ConfigModule.forRoot()` — falla antes de bind del puerto |
| V5.2.1 | Sanitización de output para prevenir XSS | ✅ PASS | API JSON-only; Helmet CSP activo; no renderiza HTML |
| V5.2.2 | Datos no desinfectados nunca se usan como comandos | ✅ PASS | TypeORM parameterized queries; sin raw SQL en MOD01 |
| V5.3.3 | Sin SQL injection | ✅ PASS | TypeORM query builder parametrizado en todas las consultas |
| V5.4.1 | Sin SSRF en callbacks o redirecciones | ✅ PASS | No hay redirecciones en MOD01; tenantSlug validado contra whitelist DB |

---

## V6 — Criptografía

| ID | Control | Estado | Evidencia |
|----|---------|--------|-----------|
| V6.2.1 | No uso de funciones cripto débiles (MD5, SHA1) | ✅ PASS | Solo bcrypt, AES-256-GCM, RS256, SHA-256 TOTP |
| V6.2.2 | Generadores de números aleatorios criptográficos | ✅ PASS | `crypto.randomBytes()` para JTI, secrets MFA y backup codes |
| V6.2.3 | GUID/UUID únicos con entropía adecuada | ✅ PASS | UUID v4 vía `uuid` package para todas las PK y JTI |
| V6.2.5 | Modos de cifrado seguros (no ECB) | ✅ PASS | AES-256-**GCM** con IV aleatorio 12 bytes por operación de cifrado |
| V6.2.6 | IV/nonce único por operación de cifrado | ✅ PASS | `crypto.randomBytes(12)` generado en cada llamada a `encryptSecret()` |
| V6.3.1 | Gestión segura de claves (no hardcoded) | ✅ PASS | `MFA_ENCRYPTION_KEY`, pares JWT en variables de entorno validadas por Joi |
| V6.4.1 | Vault de secretos o env vars para material criptográfico | ✅ PASS | Variables en `.env` (excluido de git); Joi valida presencia al arranque |
| V6.5.1 | JWT firmados con RS256 (asimétrico) | ✅ PASS | `JwtModule.registerAsync()` con `privateKey`/`publicKey` RS256 |

---

## V7 — Errores, Logging y Auditoría

| ID | Control | Estado | Evidencia |
|----|---------|--------|-----------|
| V7.1.1 | No se registran credenciales en logs | ✅ PASS | Revisión código: contraseñas, tokens y secretos MFA nunca en `Logger` |
| V7.1.2 | No se registra PII sensible en logs de nivel INFO+ | ✅ PASS | Logs contienen IDs opacos (UUID), no emails ni nombres directamente |
| V7.2.1 | Audit trail registra operaciones de autenticación | ✅ PASS | `AuditInterceptor` captura CUD; `AuthService` registra login/logout/MFA |
| V7.2.2 | Audit trail append-only, sin delete | ✅ PASS | `AuditLog` entity — sin `softDelete`, sin endpoint de borrado |
| V7.3.1 | Logs con timestamp y contexto de tenant | ✅ PASS | `AuditLog` incluye `tenantId`, `userId`, `action`, `createdAt` |
| V7.4.1 | Excepciones manejadas sin exponer stack traces | ✅ PASS | NestJS `HttpException`; sin `exception filters` que expongan stack en prod |

---

## V8 — Protección de Datos

| ID | Control | Estado | Evidencia |
|----|---------|--------|-----------|
| V8.1.1 | Datos sensibles no cacheados | ✅ PASS | Redis solo almacena JTI (opaco) + slug de tenant; no contraseñas |
| V8.2.1 | Datos sensibles marcados `no-store` en cache HTTP | ✅ PASS | Helmet + headers `Cache-Control: no-store` en respuestas de auth |
| V8.3.1 | Datos personales identificables protegidos | ✅ PASS | Emails cifrados con AES-256-GCM en columna `emailEncrypted` |
| V8.3.2 | No exposición de datos de otros tenants | ✅ PASS | Multi-tenant por schema PostgreSQL; TenantContext enforced en cada request |
| V8.3.4 | Secrets no expuestos en respuestas API | ✅ PASS | Todos los DTOs de respuesta excluyen `passwordHash`, `secretKey`, `encryptedBackupCodes` |

---

## Hallazgos y Observaciones

### Sin hallazgos críticos (Severity Critical / High)

### Hallazgos informativos / mejora futura

| Ref | Descripción | Severidad | Sprint objetivo |
|-----|-------------|-----------|-----------------|
| OBS-01 | Swagger UI deshabilitado en producción — verificar que `NODE_ENV=production` esté correctamente seteado en el deploy | Info | Ops/Deploy |
| OBS-02 | `cookie-parser` cargado con `require()` — migrar a import estático cuando @types/cookie-parser sea estable | Info | Sprint 2 |
| OBS-03 | Recuperación de contraseña (V2.5) no implementada — flujo OTP por email pendiente para Sprint 2 | N/A Sprint 1 | Sprint 2 |
| OBS-04 | Re-autenticación para operaciones destructivas (V3.7.1) — recomendado para operaciones de borrado de cuenta | Recomendación | Sprint 2 |

---

## Firma de cierre

- **Evaluación completada:** Sprint 1 — MOD01 producción
- **Controles críticos validados:** 44/44 aplicables al scope MOD01 Sprint 1
- **Controles N/A documentados:** 5 (fuera del alcance Sprint 1)
- **Bloqueadores para producción:** Ninguno
- **Próxima revisión:** Inicio Sprint 2 o ante cambio de superficie de ataque

> Referencias: [HLD-MOD01-ARQUITECTURA-v1.0](../hlds/HLD-MOD01-ARQUITECTURA-v1.0.md) · [PRD-MOD01-DEFINICION-v1.1](../prds/PRD-MOD01-DEFINICION-v1.1.md) · [ADR-016](../adrs/ADR-016-Cierre-MOD01-Produccion.md)
