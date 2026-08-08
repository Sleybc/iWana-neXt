# PROMPT — MOD01: primer ingreso con cambio forzado de contraseña

**Código:** MOD01-PRIMER-INGRESO · **Versión:** 1.0 · **Fecha:** 2026-08-08
**Emisor:** AI-EM-ARCH (modo Orchestrator) · **Destinatario:** AI-SR-FULL
**Revisión obligatoria:** AI-SEC-ENG antes de merge (toca superficie de autenticación — `AGENTS.md`)

---

## 1. Qué se pide

Una credencial de arranque para la **consola de plataforma** (`apps/web`, puerto 3001, tabla `public.platform_users`) que, en el primer ingreso, **obligue a cambiar la contraseña** antes de dar acceso a nada.

**Decisiones ya tomadas por el CTO — no reabrir:**

| Decisión | Valor |
| --- | --- |
| Superficie | Solo consola de plataforma. El portal de tenant queda fuera de este alcance |
| Qué cambia el usuario | **Solo la contraseña.** El email queda fijo como identidad |

## 2. Estado verificado del sistema (no re-derivar)

- **No existe** ningún `mustChangePassword` ni equivalente. `grep` sobre `apps/api/src` y `packages/database/src` → 0 resultados.
- **`UserStatus.PENDING_VERIFICATION` NO sirve para esto.** Ya significa «pendiente de verificar el email por token», y `auth.service.ts:764` (`verifyEmail`) lo promueve a `ACTIVE`. Reutilizarlo haría que verificar el email cancele la obligación de cambiar la contraseña. **Usar un campo propio.**
- Endpoints existentes que hay que **encadenar, no recrear**: `POST /api/v1/auth/platform/login` (`auth.controller.ts:117`) y `POST /api/v1/auth/change-password` (`auth.controller.ts:314`).
- Las variables `PLATFORM_SUPER_ADMIN_EMAIL` / `PLATFORM_SUPER_ADMIN_PASSWORD` ya existen y las consume `scripts/dev-reset-platform-admin.mjs`.
- Los `platform_users` tienen **MFA obligatorio** (`mfaEnabled` siempre true) con flujo `mfaSetupRequired` ya implementado.

## 3. Diseño a implementar

### 3.1 Modelo

Campo nuevo en `public.platform_users`: `must_change_password BOOLEAN NOT NULL DEFAULT false`.

Migración pública nueva, clase con sufijo timestamp de 13 dígitos **posterior a `1784419212000`** (la 024), registrada al final de `packages/database/src/migrations/public/index.ts`. El spec `migration-order.spec.ts` falla si la lista y el directorio divergen.

`DEFAULT false` y no `true`: los usuarios existentes no deben quedar bloqueados por una migración.

### 3.2 Bootstrap

Quien crea el admin de arranque (`dev-reset-platform-admin.mjs` y el seed equivalente) lo crea con `must_change_password = true`.

**Rechazo en producción:** la credencial de arranque no puede usarse en `NODE_ENV=production`. Fail-fast con mensaje explícito, en la línea del resto de validaciones Joi de `app.module.ts`. Una credencial conocida en producción es un defecto, no una comodidad.

### 3.3 Orden respecto a MFA

**Contraseña primero, MFA después.** Razón: la contraseña de arranque es conocida por diseño; vincular un segundo factor a una cuenta cuya primera credencial es pública amplía la ventana en vez de cerrarla. Si el usuario tiene `must_change_password = true` **y** `mfaSetupRequired`, el cambio de contraseña va primero.

### 3.4 Alcance del token intermedio

Mientras `must_change_password` sea `true`, el token emitido por el login **no debe dar acceso a la consola**: solo al endpoint de cambio de contraseña.

**Reutilizar el patrón que ya existe en el repo**, no inventar otro: el portal maneja un token de alcance acotado para el setup de MFA (`iwana.portal.mfa-setup-token`, ver `CLAUDE.md` → gotchas). Sigue esa forma para la consola de plataforma.

### 3.5 Cambio de contraseña

Al completarse con éxito, en la misma transacción: `must_change_password = false` e invalidación de los tokens emitidos antes. La política de contraseña es la que ya aplique el endpoint existente — no inventes una nueva ni la relajes para el primer ingreso.

## 4. Riesgo específico con precedente en este repo — leer antes de escribir código

Las migraciones `074_redact_leaked_temporary_passwords` (tenant) y `012` (público) existen porque **el `AuditInterceptor` escribió `temporaryPassword` en claro en el audit trail** y hubo que redactarlo retroactivamente sobre una tabla append-only protegida por trigger.

Obligatorio en este trabajo:

1. Verificar que la denylist de `apps/api/src/modules/audit/audit-sanitize.policy.ts` cubre `password`, `newPassword`, `currentPassword` y `temporaryPassword`. Si falta alguno, añadirlo **en el mismo commit**.
2. El evento sí se audita (`PASSWORD_CHANGED` o el que exista), **los valores nunca**.
3. Extender `audit-direct-log-pii-keys.arch.spec.ts` para que falle si un campo de credencial nuevo escapa a la sanitización.

No es una recomendación: es reincidencia si vuelve a pasar.

## 5. Gotcha de serialización — causa conocida de fallo silencioso

`CLAUDE.md` lo documenta: **el controlador de auth debe propagar explícitamente `mfaRequired` / `mfaSetupRequired`, porque NestJS descarta los campos omitidos al serializar.** El nuevo indicador (`passwordChangeRequired` o como lo llames) tiene exactamente el mismo problema: si no se propaga explícitamente en el DTO de respuesta, el frontend nunca se entera y el usuario entra sin cambiar nada — con el backend creyendo que sí lo exigió.

Test que lo cubra a nivel de contrato HTTP, no solo de servicio.

## 6. Frontend

`apps/web`: al recibir el indicador en la respuesta del login, redirigir a la pantalla de cambio de contraseña y **no permitir navegar a ninguna otra ruta** hasta completarlo. Sin el guard de navegación, el indicador es decorativo.

## 7. Entregables y gates

- Migración + registro en `index.ts` + spec.
- Cambios en `auth.service` / `auth.controller` + tests unitarios y de contrato HTTP.
- Sanitización verificada y arch spec extendido.
- Pantalla y guard en `apps/web`.
- `test`, `typecheck`, `lint`, `build` en verde, reportados textualmente.
- Evidencia manual del flujo completo: login con la credencial de arranque → forzado a cambiar → cambio → acceso normal → segundo login sin forzar.

## 8. Stop / Go

**STOP y emitir `[BLOQUEO]` si:** el cambio exige tocar el flujo de MFA más allá del orden descrito en §3.3, o si la política de contraseña existente resulta incompatible con el primer ingreso.

**GO** para todo lo demás dentro de este alcance.
