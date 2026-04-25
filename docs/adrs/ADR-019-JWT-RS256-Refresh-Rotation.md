# ADR-019 — JWT RS256 Asimétrico + Refresh Token Rotation

> **Estado:** Aprobado
> **Fecha:** 2026-03-07
> **Tipo:** Backend / Seguridad / Autenticación
> **Autores:** AI-ARCH (Architect Software), AI-EM (Engineering Manager)
> **Revisado y aprobado por:** CTO — 2026-03-15

---

## Contexto

iWana neXt necesita un mecanismo de autenticación stateless que cumpla simultáneamente con:

1. **Seguridad**: los tokens deben poder revocarse ante logout, robo o detección de reuse attack.
2. **Compatibilidad con microservicios**: otros servicios futuros deben poder verificar tokens sin tener acceso al secret de firma.
3. **Multi-tenancy**: cada access token debe incluir el contexto del tenant (`tenantId`, `schemaName`) para que `TenantMiddleware` pueda resolver el schema sin consultar la base de datos en cada request.
4. **Cumplimiento OWASP ASVS L2**: controles V3 (gestión de sesiones) y V2 (autenticación).

La elección del algoritmo de firma y la estrategia de revocación son decisiones de largo plazo: cambiarlas después requeriría invalidar todos los tokens activos de todos los tenants.

---

## Decisión

### 1. Algoritmo de firma: RS256 (RSA-SHA256 asimétrico, 2048-bit)

Se usa RS256 en lugar de HS256 (HMAC-SHA256 simétrico).

**Motivación:**
- Con RS256, la **clave privada** (usada para firmar) nunca sale del `@iwana/api`. Otros servicios (futuros microservicios, servicios de terceros) reciben únicamente la **clave pública** para verificar la firma, sin capacidad de emitir tokens.
- HS256 requiere compartir el mismo secret entre todos los servicios que necesiten verificar tokens, lo que amplía la superficie de ataque.
- Las claves se generan con `openssl genrsa 2048` y se almacenan en `secrets/` (git-ignored). Se cargan en runtime vía `ConfigService`; los saltos de línea literales `\n` del `.env` se normalizan con `.replace(/\\n/g, '\n')`.

### 2. Access Token

| Propiedad | Valor |
|-----------|-------|
| Algoritmo | RS256 |
| TTL | 15 minutos |
| Claims incluidos | `sub` (userId), `email`, `role`, `tenantId`, `schemaName`, `jti` (UUID v4), `iat`, `exp` |
| Transporte | `Authorization: Bearer <token>` en header HTTP |

El claim `jti` (JWT ID) es un UUID único por token que permite la revocación individualizada sin mantener estado global de todos los tokens emitidos.

### 3. Refresh Token

| Propiedad | Valor |
|-----------|-------|
| TTL | 7 días |
| Almacenamiento | Tabla `refresh_tokens` en el schema del tenant (PostgreSQL) |
| Transporte | Cookie `httpOnly`, `sameSite: strict`, `secure: true` |
| Estructura | Cada token tiene `token` (UUID), `userId`, `familyId` (UUID de la familia), `used` (boolean), `expiresAt` |

### 4. Rotación del Refresh Token

En cada uso del refresh token (`POST /api/v1/auth/refresh`):

1. Se verifica que el token existe, no está `used=true` y no ha expirado.
2. Se marca el token actual como `used=true`.
3. Se emite un nuevo refresh token con el mismo `familyId` y un nuevo `token` UUID.
4. Se emite un nuevo access token con `jti` fresco.
5. Se establece la cookie con el nuevo refresh token.

### 5. Detección de Reuse Attack

Si se presenta un refresh token con `used=true` (ya fue rotado), se asume que las credenciales están comprometidas:

1. Se revoca **toda la familia** de refresh tokens con el mismo `familyId` (todos los registros de esa familia se marcan como `used=true` o se eliminan).
2. Se responde `401 Unauthorized`.
3. El usuario debe autenticarse desde cero.

Este mecanismo implementa el control ASVS **V3.3.3** (detección de refresh token theft).

### 6. JTI Blacklist en Redis

Al hacer logout (`POST /api/v1/auth/logout`):

1. El `jti` del access token se almacena en Redis con TTL igual al tiempo restante hasta `exp` del token.
2. `JwtAuthGuard` verifica en Redis si el `jti` está en la blacklist antes de considerar el token válido.
3. El refresh token del usuario se revoca en PostgreSQL.

Esto permite revocar access tokens antes de su expiración natural sin mantener estado permanente en Redis, ya que las entradas expiran automáticamente al vencer el TTL del token original.

---

## Alternativas Consideradas

### HS256 simétrico
- **Descartado.** Requiere compartir el secret entre todos los servicios verificadores. Incompatible con arquitecturas de microservicios donde solo el emisor debe poder firmar.

### Tokens de sesión en Redis (stateful)
- **Descartado.** Rompe el modelo stateless que permite escalar el API horizontalmente sin coordinación entre instancias. Redis se convierte en SPOF para cada request autenticado.

### Refresh tokens en Redis (sin PostgreSQL)
- **Descartado.** Redis no ofrece las garantías de durabilidad de PostgreSQL para datos de sesión de largo plazo. Una pérdida de datos Redis (sin persistencia configurada) invalidaría todas las sesiones activas.

---

## Consecuencias

### Positivas
- La clave privada nunca abandona `@iwana/api`; futuros microservicios solo necesitan la clave pública.
- La rotación de refresh tokens limita la ventana de uso de un token robado a una sola verificación.
- El reuse attack se detecta automáticamente y revoca toda la familia comprometida.
- La JTI blacklist en Redis permite logout efectivo con overhead mínimo (una consulta Redis por request autenticado).
- Cumple OWASP ASVS L2 controles V3.2.1, V3.2.2, V3.3.3.

### Restricciones
- Redis debe estar disponible para que la blacklist funcione. Sin Redis, el JwtAuthGuard no puede verificar revocaciones y debe fallar de forma segura (rechazar el request).
- La tabla `refresh_tokens` crece con cada sesión; se necesita un job de limpieza periódica para eliminar tokens expirados (deuda técnica DT-MOD01-04).
- La normalización `\n` en las claves PEM debe aplicarse consistentemente en todos los entornos (dev, staging, prod).

---

## Implementación

| Componente | Ubicación |
|-----------|-----------|
| Generación de claves | `scripts/generate-secrets.sh` (git-ignored) |
| Carga de claves PEM | `apps/api/src/modules/auth/auth.module.ts` (vía `ConfigService`) |
| Emisión de tokens | `apps/api/src/modules/auth/auth.service.ts` → `signTokens()` |
| Verificación JWT | `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` |
| Rotación refresh | `apps/api/src/modules/auth/auth.service.ts` → `refresh()` |
| Reuse attack detection | `apps/api/src/modules/auth/auth.service.ts` → `refresh()` |
| JTI blacklist | `apps/api/src/modules/auth/auth.service.ts` → `logout()` + `JwtAuthGuard` |
| Entidad refresh token | `packages/database/src/entities/refresh-token.entity.ts` |

---

## Referencias

- OWASP ASVS 4.0 — V3 Session Management (V3.2.1, V3.2.2, V3.3.3, V3.5.3)
- RFC 7519 — JSON Web Token (JWT)
- RFC 7517 — JSON Web Key (JWK)
- [ADR-020 Seed Inicial + Credenciales Temporales](./ADR-020-Seed-Inicial-Credenciales-Temporales.md)
- [PRD-MOD01-Auth-Tenant-Audit-v1.0](../prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md) §4 RF-AUTH-01 a RF-AUTH-06
- [INFORME-MOD01-SPRINT-01-v1.0](../informes/INFORME-MOD01-SPRINT-01-v1.0.md) §2.5, D9, D10, D11, D15
