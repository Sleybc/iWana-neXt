# ADR-057: Credenciales iniciales por tenant — fin de la contraseña compartida

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-19
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano (2026-07-19)
**Supersede:** [ADR-020](ADR-020-Seed-Inicial-Credenciales-Temporales.md) §Decisión puntos 1 y 4

---

## Contexto

[ADR-020](ADR-020-Seed-Inicial-Credenciales-Temporales.md) decidió que el seed creara el ADMIN de cada tenant con una contraseña leída de `TENANT_INITIAL_ADMIN_PASSWORD` y el login genérico fijo `admin@iwana.co`. El objetivo era legítimo: automatizar el onboarding sin intervención del `SYSTEM_ADMIN` en cada alta (PRD §4 RF-TNT-04).

La implementación cumplió esa decisión al pie de la letra, y por eso el defecto no es de código sino de la decisión misma. **Ambos valores son constantes compartidas por todo el despliegue:**

- Quien conociera `TENANT_INITIAL_ADMIN_PASSWORD` podía entrar a **cualquier empresa recién creada** durante su ventana de 24 h, antes que su dueño legítimo. El valor estaba en `.env.development`, versionado en git.
- Todos los primeros administradores compartían la identidad `admin@iwana.co`, de modo que no había forma de saber quién administra cada empresa, y el email había que cambiarlo a mano tras cada alta.

El propio ADR-020 §Decisión punto 7 promete que *"la contraseña en texto plano nunca se persiste ni se registra en logs"*. Esa promesa **se incumplía**: el saneado de `AuditInterceptor` no cubría `temporaryPassword`, y el endpoint que exponía la credencial la devolvía dentro de `{data:{…}}`. Se encontraron 4 filas con la contraseña en claro en `platform_audit_logs` y en `<schema>.audit_logs`. Corregido y redactado en los commits `06395a8c`, `cd142c66` y `ed15b2b1`.

ADR-020 §Contexto ya había evaluado tres alternativas y descartado la manual por exigir intervención en cada alta. Este ADR conserva ese criterio: la automatización se mantiene, lo que cambia es de dónde sale la credencial.

## Decisión

### 1. El ADMIN inicial nace bloqueado

`TenantSeedService` crea el ADMIN con un secreto **aleatorio generado en el worker** (`crypto.randomBytes(32)`, bcrypt 12 rondas) que **nadie conoce**: no se devuelve, no se registra y no viaja por la cola. La cuenta existe, es inaccesible, y conserva `passwordResetRequired = true`.

`TENANT_INITIAL_ADMIN_PASSWORD` desaparece del sistema.

### 2. La credencial se emite, no se consulta

`POST /tenants/:id/regenerate-admin-credentials` pasa de vía de recuperación a **camino primario**. Ya existía, ya generaba aleatorio, ya tenía `Idempotency-Key` y ya estaba probado: genera la contraseña contra la base y la devuelve **una sola vez**.

`POST /tenants/:id/bootstrap-admin-credentials` se elimina. Consultaba la contraseña fija re-derivándola del entorno; sin contraseña fija no queda nada que consultar.

### 3. El email del administrador se indica al crear la empresa

`adminEmail` es campo obligatorio de `CreateTenantDto`, distinto de `contactEmail` —aquel es el contacto comercial, este la identidad de acceso—, y se persiste en `public.tenants.admin_email` (migración 013, nullable por los tenants anteriores al campo).

Se persiste en lugar de quedarse en el DTO por dos razones: el reintento de provisioning debe reconstruir el payload del job sin volver a pedírselo al operador, y saber quién administra cada empresa es metadato legítimo del registro.

### 4. La credencial no viaja por la cola

Se evaluó que la API generase la contraseña y pasara su hash en el payload del job. **Se descarta.**

`POST /tenants` responde 201 **antes** de que el worker actúe, así que la contraseña entregada en esa respuesta sería una predicción sobre comportamiento futuro. Cuatro formas de falsificarla, todas alcanzables: el seed retorna `{created:false}` en silencio si el ADMIN ya existe; el `jobId` deduplica y con `removeOnFail: false` un job muerto puede aplicarse con su payload viejo; el provisioning puede fallar dejando al operador con una credencial de un usuario inexistente; y el `expiresAt` divergiría entre el calculado por la API y el que fija el worker.

Emitir la credencial después **elimina el transporte** en vez de endurecerlo, y garantiza por construcción que la contraseña mostrada es la que está en la base.

## Consecuencias

**Positivas**
- Desaparece el secreto compartido: comprometer un despliegue deja de comprometer todas sus empresas futuras.
- Cada empresa estrena administrador con identidad propia y trazable.
- La emisión de una credencial es un acto explícito y atribuible de un `SYSTEM_ADMIN`, no un valor que existe en silencio durante 24 h.
- La promesa de ADR-020 §7 pasa a ser cierta: la contraseña no se persiste ni se registra en ningún punto.

**Negativas / costo**
- Un paso operativo más en el alta: crear la empresa y después emitir la credencial. El formulario lo mitiga ofreciendo el botón en cuanto el tenant queda `ACTIVE`.
- Los runbooks que decían "usa `TENANT_INITIAL_ADMIN_PASSWORD`" quedan obsoletos.

**Riesgos**
- Si el operador cierra el modal sin copiar la contraseña, debe regenerarla — y regenerar invalida la anterior. Es el comportamiento correcto para un secreto de un solo uso, pero requiere que el copy lo diga con claridad.
- El envío por email —alternativa 2 de ADR-020, que entregaría la credencial solo a su dueño— sigue siendo el destino deseable y no está integrado (`MailerService` en modo dev). Cuando lo esté, conviene revisar si sustituye al modal.

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Positivo: elimina una vía de acceso cruzado entre empresas. No toca aislamiento por schema |
| **Seguridad** | Es el objetivo del ADR |
| **Escala** | Sin impacto |
| **Regulación** | Favorable a Ley 1581: una credencial atribuible a quien la emite es mejor trazable que una compartida |

## Alternativas descartadas

| Alternativa | Motivo |
| --- | --- |
| **El operador teclea la contraseña al crear la empresa** (opción 1 de ADR-020) | Reintroduce intervención manual en cada alta y expone la credencial a contraseñas débiles elegidas a mano. Nota: es más segura de lo que parece —el body de la petición **no** se audita, solo la respuesta— pero el criterio de automatización de ADR-020 sigue siendo válido |
| **Derivar por tenant, p. ej. `HMAC(secreto, tenantId)`** | Permitiría conservar el endpoint de consulta sin almacenar nada, pero la credencial seguiría siendo función determinista de **un solo secreto**: la misma vulnerabilidad con un paso más |
| **Aleatoria almacenada en claro o de forma reversible** | Cambia una debilidad por otra mayor |
| **Hash de la credencial en el payload del job** | Ver §Decisión punto 4 |

## Referencias

- Commits: `06395a8c` (saneado de auditoría), `cd142c66` (rastro de idempotencia), `ed15b2b1` (redacción de lo filtrado), `48e2a7be` (esta decisión)
- `apps/worker/src/services/tenant-seed.service.ts`
- `apps/api/src/modules/auth/auth.service.ts` → `regenerateTenantAdminCredentials`
- `packages/shared/src/contracts/queue-payloads.ts`
- Migración `packages/database/src/migrations/public/013_add_tenant_admin_email.ts`
