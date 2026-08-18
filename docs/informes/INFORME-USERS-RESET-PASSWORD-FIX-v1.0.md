# INFORME - Users Bugfix: contraseña temporal no permitía ingresar

**Version:** 1.0
**Estado:** Cerrado — Verificado con tests unitarios
**Fecha:** 2026-08-18
**Modo activo:** Ejecutor
**Autor:** AI-EM-ARCH (ejecutor)
**Modulo:** Users / Auth (MOD02)
**Severidad:** P1 (credencial temporal válida rechazada en login)
**Impacto colateral:** Cuentas con bloqueo o expiración heredados no podían ingresar con la clave temporal emitida desde la consola web

---

## 1. Síntoma

Desde `apps/web` (consola de plataforma, modal de gestión de usuario → "Generar contraseña temporal") se emitía correctamente una contraseña temporal, pero al ingresarla en el login del portal el usuario **no podía entrar**.

**Flujo del botón:**

1. `apps/web/src/components/users/UserManagementModal.tsx:342` → `usersApi.resetPassword(tenantSlug, user.id, {}, crypto.randomUUID())`
2. `PATCH /users/:id/password` → `apps/api/src/modules/users/users.controller.ts:391`
3. `UsersService.resetPassword()` — `apps/api/src/modules/users/users.service.ts`

---

## 2. Causa raíz

`UsersService.resetPassword()` rotaba el hash y activaba `passwordResetRequired`, pero **no reiniciaba el resto del estado de credencial**. El login de tenant (`AuthService.login`, `apps/api/src/modules/auth/auth.service.ts:331-449`) tiene dos compuertas que rechazan el ingreso aunque la contraseña sea correcta:

- **Bloqueo** (`auth.service.ts:362-368`): `lockedUntil > now` → 401 "Cuenta bloqueada temporalmente…" **antes de comparar la contraseña**. El reset no limpiaba `failedLoginAttempts` ni `lockedUntil`.
- **Expiración de credencial temporal** (`auth.service.ts:387-391` + `hasExpiredTemporaryPassword`, `:1446-1452`): `passwordResetRequired && passwordResetExpiresAt < now` → 401 "Las credenciales temporales expiraron…". El reset no limpiaba `passwordResetExpiresAt`: cuentas que habían pasado por `regenerateTenantAdminCredentials` (`auth.service.ts:1262-1270`, flujo bootstrap de soporte con expiración de 24h — aplica al *administrador principal del tenant*) conservaban el timestamp vencido, y **toda** clave temporal nueva fallaba al ingresar.

Además (defensa en profundidad), un `passwordResetToken` de recuperación previo seguía canjeable tras un reset administrativo.

**Precedente del mismo bug en el repo:** `buildInitialUserState` (`users.service.ts:226-232`, H-04) documenta exactamente esta falla para la resurrección de usuarios — se corrigió en `create()` pero nunca en `resetPassword()`.

---

## 3. Corrección aplicada

**Archivo:** `apps/api/src/modules/users/users.service.ts` — método `resetPassword()`

Tras rotar el hash, se reinicia el estado de credencial completo (mismo contrato que `buildInitialUserState` y `AuthService.regenerateTenantAdminCredentials`):

```ts
user.passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
user.passwordResetRequired = true;
// Estado heredado que bloquearía el primer ingreso con la clave nueva.
user.passwordResetToken = null;
user.passwordResetTokenExpiresAt = null;
user.passwordResetExpiresAt = null;
user.failedLoginAttempts = 0;
user.lockedUntil = null;
```

**Decisión de diseño:** se **limpia** la expiración (null) en vez de fijar una nueva de 24h, por consistencia con `create()` del mismo módulo y con el docstring de `hasExpiredTemporaryPassword` (la expiración es concepto exclusivo del bootstrap de soporte). Docstring del método actualizado con la explicación.

No se modificó `AuthService.login` ni `regenerateTenantAdminCredentials` (su comportamiento era el correcto y sirvió de modelo). No hay cambios de UX.

---

## 4. Evidencia de verificación

### 4.1 Tests unitarios

`apps/api/src/modules/users/users.service.spec.ts`, `describe('resetPassword()')`:

- Test existente extendido: el payload guardado lleva `passwordResetRequired: true` + los cinco campos de estado limpiados.
- **Test de regresión nuevo**: entidad con `lockedUntil` futuro, `failedLoginAttempts: 5`, token de recuperación vigente y `passwordResetExpiresAt` pasado → tras `resetPassword()`, todo queda limpio (reproduce el login que fallaba).

```bash
pnpm --filter @iwana/api exec jest src/modules/users/users.service.spec.ts
# → 60 passed, 60 total

pnpm --filter @iwana/api exec jest src/modules/users
# → 14 suites passed, 251 tests passed

pnpm --filter @iwana/api exec jest src/modules/auth/auth.service.spec.ts
# → 93 passed, 93 total (auth no se tocó; compuertas intactas)
```

### 4.2 Typecheck

```bash
pnpm --filter @iwana/api typecheck  # → Verde, sin errores
```

### 4.3 Verificación funcional pendiente (entorno vivo)

Con el fix desplegado: regenerar la contraseña temporal de la cuenta afectada desde la consola web y hacer login en el portal → debe redirigir a `auth/change-password` (`apps/portal/src/components/auth/AuthProvider.tsx:110` ya gestiona `passwordResetRequired`). No requiere migración de datos: el reset escribe el estado limpio al emitir.

Si urge desbloquear una cuenta antes del deploy, SQL puntual sobre el schema del tenant y reintento con la última clave emitida:

```sql
UPDATE users
SET "lockedUntil" = NULL, "failedLoginAttempts" = 0, "passwordResetExpiresAt" = NULL
WHERE id = '<user-id>';
```

---

## 5. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/modules/users/users.service.ts` | `resetPassword()` reinicia estado de credencial completo + docstring |
| `apps/api/src/modules/users/users.service.spec.ts` | Test extendido + test de regresión del bug |
