# ADR-020 — Seed Inicial de Tenant + Credenciales Temporales

> ⚠️ **Superado parcialmente por [ADR-057](ADR-057-Credenciales-Iniciales-Por-Tenant.md) (2026-07-19).**
> Los puntos 1 y 4 de §Decisión —contraseña fija de `TENANT_INITIAL_ADMIN_PASSWORD` y login
> genérico `admin@iwana.co`— **ya no rigen**: ambos eran constantes compartidas por todo el
> despliegue. El ADMIN nace ahora bloqueado con un secreto aleatorio que nadie conoce, el email se
> indica al crear la empresa, y la credencial se emite con `regenerate-admin-credentials`, que la
> muestra una sola vez. El resto del ADR —bcrypt 12 rondas, `passwordResetRequired`, ventana de
> 24 h y la regla del punto 7— sigue vigente.

> **Estado:** Superado parcialmente
> **Estado original:** Aprobado
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

El PRD §4 RF-TNT-04 requiere que el flujo de onboarding sea el más automatizado posible, sin intervención del `SYSTEM_ADMIN` para cada nuevo tenant. El sistema debe generar las credenciales iniciales de forma segura y desacoplada del `contactEmail` empresarial, porque ese dato pertenece al perfil de la empresa y no a la identidad operativa del usuario principal.

---

## Decisión

### 1. Generación de credenciales iniciales durante el provisioning

El `TenantProvisioningProcessor` en `@iwana/worker`, después de ejecutar el DDL, llama a `TenantSeedService` que:

1. Toma una contraseña inicial fija desde la variable de entorno `TENANT_INITIAL_ADMIN_PASSWORD`.
2. Valida que esa contraseña cumpla la política mínima del repositorio (10+ caracteres, mayúscula, minúscula, número y caracter especial).
3. Aplica `bcrypt` con 12 rounds para hashear la contraseña antes de persistirla en la tabla `users` del schema del tenant.
4. Crea el ADMIN principal con login genérico fijo `admin@iwana.co`, independiente del `contactEmail` del tenant.
5. Crea el ADMIN con los siguientes flags:
   - `passwordResetRequired = true`
   - `passwordResetExpiresAt = now() + 24h`
6. La contraseña inicial se distribuye por el canal operativo controlado del entorno y debe rotarse en el primer login.
7. La contraseña en texto plano **nunca se persiste ni se registra en logs**.

La operación de seed es **idempotente**: si el usuario ADMIN ya existe en el schema, el seed se omite sin duplicar registros.

### 2. Flujo de primer login

```
ADMIN recibe la contraseña inicial configurada para el entorno
         ↓
POST /api/v1/auth/login (credenciales iniciales)
         ↓
AuthService verifica contraseña + detecta passwordResetRequired=true
         ↓
Access token incluye claim passwordResetRequired=true
         ↓
Frontend detecta el claim en el token y redirige a /auth/change-password
         ↓
ADMIN establece nueva contraseña (mínimo 12 chars, política de complejidad)
         ↓
AuthService verifica que la nueva contraseña no es igual a la inicial
AuthService actualiza el hash, resetea passwordResetRequired=false, resetea passwordResetExpiresAt=null
         ↓
MFA obligatorio: el sistema redirige a /auth/mfa/setup para configurar TOTP
         ↓
ADMIN configura autenticador (Google Authenticator, Authy, etc.)
         ↓
Dashboard del tenant disponible
```

Si el ADMIN intenta usar la contraseña inicial después de expirar la ventana de bootstrap (`passwordResetExpiresAt < now()`), el `AuthService` rechaza el login con `401 Unauthorized` y un mensaje indicando que las credenciales han expirado.

### 2.1. Cambio posterior del email de acceso

Después del primer ingreso, el usuario principal puede cambiar su email de acceso desde Perfil:

- Portal empresarial: `PATCH /api/v1/users/:id/login-email`
- Consola de plataforma: `PATCH /api/v1/platform-users/me/login-email`

El cambio exige la contraseña actual para confirmar la operación. Si quien cambia el email sigue siendo el ADMIN principal del tenant, el sistema sincroniza también `public.tenants.contact_email` para mantener consistencia operativa entre identidad principal y canal de contacto empresarial.

### 3. MFA obligatorio para el rol ADMIN

Después del cambio de contraseña en el primer login, el ADMIN tiene obligación de configurar MFA TOTP antes de acceder al dashboard. Esta restricción se implementa a nivel de `JwtAuthGuard` verificando el claim `mfaSetupRequired` del token.

El secret TOTP se genera con `otplib` y se almacena **cifrado con AES-256-GCM** en la columna `mfa_secret` de la tabla `users` (ver ADR-019 §15 sobre el cifrado de campos PII).

### 4. Regeneración de credenciales por SYSTEM_ADMIN

Cuando el ADMIN pierde o no recibió la credencial inicial, el `SYSTEM_ADMIN` puede regenerar las credenciales via:

```
POST /api/v1/tenants/:id/regenerate-admin-credentials
Headers: Idempotency-Key: <uuid>
```

El comportamiento es idéntico al seed inicial en términos de seguridad de credencial: nueva contraseña temporal y nuevo `passwordResetExpiresAt` de 24h. La regeneración ya no depende de `contactEmail`; el backend identifica al ADMIN principal como el primer `UserRole.ADMIN` vigente del tenant y devuelve su email de acceso actual. En el estado actual del repositorio, la respuesta del endpoint devuelve la credencial temporal una sola vez al `SYSTEM_ADMIN` llamante y se cachea por idempotencia en Redis durante la misma ventana operativa.

La operación usa **Redis para idempotencia**: la respuesta se cachea temporalmente por `Idempotency-Key`. Un retry del cliente recibe exactamente la misma credencial sin mutar otra vez el usuario ni generar una segunda contraseña distinta.

---

## Alternativas Consideradas

### Enlace de activación (sin contraseña inicial)
- **No seleccionada para Sprint 1.** Requiere un mecanismo de tokens de un solo uso con expiración y un endpoint de activación adicional. Es la opción más segura a largo plazo pero aumenta la complejidad del Sprint 1. Queda como mejora para Sprint 2.

### Contraseña definida por SYSTEM_ADMIN al crear el tenant
- **Descartada.** Introduce riesgo de que el SYSTEM_ADMIN conozca la contraseña del ADMIN del tenant, violando el principio de privilegio mínimo y la separación de responsabilidades entre la plataforma y el cliente.

### Contraseña fija hardcodeada en código o documentos (ej: `ChangeMe123!`)
- **Descartada permanentemente.** Viola OWASP ASVS V2.1.1 y es un vector de ataque trivial. Si se necesita una contraseña inicial fija por operación, debe inyectarse por entorno y nunca versionarse en texto plano.

---

## Consecuencias

### Positivas
- El onboarding de un nuevo tenant es completamente automatizado: el SYSTEM_ADMIN solo necesita crear el tenant; el resto del flujo ocurre sin intervención.
- La contraseña inicial mantiene una ventana de uso limitada (24h) y fuerza rotación en el primer ingreso.
- MFA obligatorio para ADMIN desde el primer login establece una postura de seguridad sólida desde el inicio.
- La idempotencia de regeneración previene la creación accidental de múltiples credenciales en caso de retries del cliente.

### Restricciones
- La entrega inicial de credenciales depende del canal operativo habilitado en el entorno. Mientras el email no sea el mecanismo estable, el `SYSTEM_ADMIN` debe usar la regeneración controlada para exponer la credencial de manera puntual al cliente.
- El `contactEmail` del tenant sigue siendo obligatorio para el perfil empresarial, pero ya no bloquea el onboarding ni define el login inicial. Un error en ese dato afecta la comunicación comercial, no la creación del usuario principal.
- Cuando exista envío de email operativo, sus fallos no deben abortar el provisioning si el schema y el seed ya quedaron consistentes.

### Deuda técnica reconocida
- **DT-MOD01-05**: El envío automático de credenciales iniciales desde el provisioning todavía no es el mecanismo operativo estable. Mientras ese camino se completa, el workaround soportado es `POST /api/v1/tenants/:id/regenerate-admin-credentials` con `Idempotency-Key`. Consultar logs del worker para obtener contraseñas temporales o la contraseña inicial no está permitido.

---

## Implementación

| Componente | Ubicación |
|-----------|-----------|
| Bootstrap de contraseña inicial por entorno | `apps/worker/src/services/tenant-seed.service.ts` |
| Login genérico inicial | `apps/worker/src/services/tenant-seed.service.ts` |
| Flag `passwordResetRequired` | `packages/database/src/entities/user.entity.ts` |
| Campo `passwordResetExpiresAt` | `packages/database/src/entities/user.entity.ts` |
| Detección en login | `apps/api/src/modules/auth/auth.service.ts` → `login()` |
| Claim en access token | `apps/api/src/modules/auth/auth.service.ts` → `signTokens()` |
| Endpoint regeneración | `apps/api/src/modules/tenant/tenant.controller.ts` → `regenerateAdminCredentials()` |
| Idempotencia Redis | `apps/api/src/modules/auth/auth.service.ts` → `regenerateAdminCredentials()` |
| Cambio de email de acceso tenant | `apps/api/src/modules/users/users.controller.ts` → `changeLoginEmail()` |
| Cambio de email de acceso plataforma | `apps/api/src/modules/platform-users/platform-users.controller.ts` → `updateMyLoginEmail()` |

---

## Referencias

- OWASP ASVS 4.0 — V2.1 Password Security Requirements
- [ADR-019 JWT RS256 + Refresh Token Rotation](./ADR-019-JWT-RS256-Refresh-Rotation.md)
- [ADR-017 Provisioning Schema BullMQ](./ADR-017-Provisioning-Schema-BullMQ.md)
- [PRD-MOD01-Auth-Tenant-Audit-v1.0](../prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md) §4 RF-TNT-04, RF-AUTH-08
- [INFORME-MOD01-SPRINT-01-v1.0](../informes/INFORME-MOD01-SPRINT-01-v1.0.md) §2.12, §2.13, D12, D13
