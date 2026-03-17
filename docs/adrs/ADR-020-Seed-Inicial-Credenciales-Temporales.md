# ADR-020 — Seed Inicial de Tenant + Credenciales Temporales

> **Estado:** Aprobado
> **Fecha:** 2026-03-07
> **Tipo:** Backend / Operacional / Seguridad
> **Autores:** AI-ARCH (Architect Software), AI-EM (Engineering Manager)
> **Revisado y aprobado por:** CTO — 2026-03-15

---

## Contexto

Al provisionar un nuevo tenant en iWana neXt, el schema PostgreSQL recién creado está vacío. El primer usuario ADMIN del tenant necesita credenciales para acceder al sistema antes de que pueda crear sus propios usuarios.

Existen varias opciones para entregar esas credenciales iniciales:

1. El `SYSTEM_ADMIN` de la plataforma las ingresa manualmente al crear el tenant.
2. El sistema genera credenciales temporales automáticamente durante el provisioning y las entrega por email.
3. Se genera un enlace de activación (sin contraseña inicial) que el ADMIN usa para establecer su propia contraseña.

El PRD §4 RF-TNT-04 requiere que el flujo de onboarding sea el más automatizado posible, sin intervención del `SYSTEM_ADMIN` para cada nuevo tenant. El sistema debe generar y entregar las credenciales iniciales por email de forma segura.

---

## Decisión

### 1. Generación de credenciales temporales durante el provisioning

El `TenantProvisioningProcessor` en `@iwana/worker`, después de ejecutar el DDL, llama a `TenantSeedService` que:

1. Genera una contraseña temporal aleatoria (alfanumérica, mínimo 16 caracteres, criptográficamente segura con `crypto.randomBytes`).
2. Aplica `bcrypt` con 12 rounds para hashear la contraseña antes de persistirla en la tabla `users` del schema del tenant.
3. Crea el ADMIN con los siguientes flags:
   - `passwordResetRequired = true`
   - `passwordResetExpiresAt = now() + 24h`
4. Entrega las credenciales temporales por el canal operativo disponible del entorno.
5. La contraseña en texto plano **nunca se persiste ni se registra en logs**.

La operación de seed es **idempotente**: si el usuario ADMIN ya existe en el schema, el seed se omite sin duplicar registros.

### 2. Flujo de primer login

```
ADMIN recibe email con contraseña temporal
         ↓
POST /api/v1/auth/login (credenciales temporales)
         ↓
AuthService verifica contraseña + detecta passwordResetRequired=true
         ↓
Access token incluye claim passwordResetRequired=true
         ↓
Frontend detecta el claim en el token y redirige a /auth/change-password
         ↓
ADMIN establece nueva contraseña (mínimo 12 chars, política de complejidad)
         ↓
AuthService verifica que la nueva contraseña no es igual a la temporal
AuthService actualiza el hash, resetea passwordResetRequired=false, resetea passwordResetExpiresAt=null
         ↓
MFA obligatorio: el sistema redirige a /auth/mfa/setup para configurar TOTP
         ↓
ADMIN configura autenticador (Google Authenticator, Authy, etc.)
         ↓
Dashboard del tenant disponible
```

Si el ADMIN intenta usar credenciales temporales expiradas (`passwordResetExpiresAt < now()`), el `AuthService` rechaza el login con `401 Unauthorized` y un mensaje indicando que las credenciales han expirado.

### 3. MFA obligatorio para el rol ADMIN

Después del cambio de contraseña en el primer login, el ADMIN tiene obligación de configurar MFA TOTP antes de acceder al dashboard. Esta restricción se implementa a nivel de `JwtAuthGuard` verificando el claim `mfaSetupRequired` del token.

El secret TOTP se genera con `otplib` y se almacena **cifrado con AES-256-GCM** en la columna `mfa_secret` de la tabla `users` (ver ADR-019 §15 sobre el cifrado de campos PII).

### 4. Regeneración de credenciales por SYSTEM_ADMIN

Cuando el ADMIN pierde o no recibió el email inicial, el `SYSTEM_ADMIN` puede regenerar las credenciales via:

```
POST /api/v1/tenants/:id/regenerate-admin-credentials
Headers: Idempotency-Key: <uuid>
```

El comportamiento es idéntico al seed inicial en términos de seguridad de credencial: nueva contraseña temporal y nuevo `passwordResetExpiresAt` de 24h. En el estado actual del repositorio, la respuesta del endpoint devuelve la credencial temporal una sola vez al `SYSTEM_ADMIN` llamante y se cachea por idempotencia en Redis durante la misma ventana operativa.

La operación usa **Redis para idempotencia**: la respuesta se cachea temporalmente por `Idempotency-Key`. Un retry del cliente recibe exactamente la misma credencial sin mutar otra vez el usuario ni generar una segunda contraseña distinta.

---

## Alternativas Consideradas

### Enlace de activación (sin contraseña inicial)
- **No seleccionada para Sprint 1.** Requiere un mecanismo de tokens de un solo uso con expiración y un endpoint de activación adicional. Es la opción más segura a largo plazo pero aumenta la complejidad del Sprint 1. Queda como mejora para Sprint 2.

### Contraseña definida por SYSTEM_ADMIN al crear el tenant
- **Descartada.** Introduce riesgo de que el SYSTEM_ADMIN conozca la contraseña del ADMIN del tenant, violando el principio de privilegio mínimo y la separación de responsabilidades entre la plataforma y el cliente.

### Contraseña por defecto fija (ej: `ChangeMe123!`)
- **Descartada permanentemente.** Viola OWASP ASVS V2.1.1 y es un vector de ataque trivial si el email inicial no llega o es interceptado.

---

## Consecuencias

### Positivas
- El onboarding de un nuevo tenant es completamente automatizado: el SYSTEM_ADMIN solo necesita crear el tenant; el resto del flujo ocurre sin intervención.
- Las credenciales temporales tienen una ventana de uso limitada (24h), reduciendo el riesgo si el email es interceptado.
- MFA obligatorio para ADMIN desde el primer login establece una postura de seguridad sólida desde el inicio.
- La idempotencia de regeneración previene la creación accidental de múltiples credenciales en caso de retries del cliente.

### Restricciones
- La entrega inicial de credenciales depende del canal operativo habilitado en el entorno. Mientras el email no sea el mecanismo estable, el `SYSTEM_ADMIN` debe usar la regeneración controlada para exponer la credencial de manera puntual al cliente.
- El `contactEmail` del tenant debe ser válido y accesible; si hay error tipográfico, el onboarding queda bloqueado hasta que el SYSTEM_ADMIN regenere las credenciales con un email corregido. Esto requiere que el frontend valide el formato del email antes de crear el tenant.
- Cuando exista envío de email operativo, sus fallos no deben abortar el provisioning si el schema y el seed ya quedaron consistentes.

### Deuda técnica reconocida
- **DT-MOD01-05**: El envío automático de credenciales iniciales desde el provisioning todavía no es el mecanismo operativo estable. Mientras ese camino se completa, el workaround soportado es `POST /api/v1/tenants/:id/regenerate-admin-credentials` con `Idempotency-Key`. Consultar logs del worker para obtener contraseñas temporales no está permitido.

---

## Implementación

| Componente | Ubicación |
|-----------|-----------|
| Generación de contraseña temporal | `apps/worker/src/services/tenant-seed.service.ts` |
| Flag `passwordResetRequired` | `packages/database/src/entities/user.entity.ts` |
| Campo `passwordResetExpiresAt` | `packages/database/src/entities/user.entity.ts` |
| Detección en login | `apps/api/src/modules/auth/auth.service.ts` → `login()` |
| Claim en access token | `apps/api/src/modules/auth/auth.service.ts` → `signTokens()` |
| Endpoint regeneración | `apps/api/src/modules/tenant/tenant.controller.ts` → `regenerateAdminCredentials()` |
| Idempotencia Redis | `apps/api/src/modules/auth/auth.service.ts` → `regenerateAdminCredentials()` |

---

## Referencias

- OWASP ASVS 4.0 — V2.1 Password Security Requirements
- [ADR-019 JWT RS256 + Refresh Token Rotation](./ADR-019-JWT-RS256-Refresh-Rotation.md)
- [ADR-017 Provisioning Schema BullMQ](./ADR-017-Provisioning-Schema-BullMQ.md)
- [PRD-MOD01-Auth-Tenant-Audit-v1.0](../prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md) §4 RF-TNT-04, RF-AUTH-08
- [INFORME-MOD01-SPRINT-01-v1.0](../informes/INFORME-MOD01-SPRINT-01-v1.0.md) §2.12, §2.13, D12, D13
