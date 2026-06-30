# Diseño: Toggle MFA requerido por tenant y por usuario

**Fecha:** 2026-03-17
**Estado:** Aprobado
**Módulo:** MOD01 — Auth / Users / Tenants

## Contexto

El flujo actual fuerza el setup de MFA a los roles `ADMIN`, `NOC` y `ACCOUNTANT` mediante una constante hardcodeada `MFA_REQUIRED_ROLES` en `auth.service.ts`. Esto bloquea las pruebas en entornos de desarrollo donde el MFA aún no está configurado.

Se requiere una opción configurable para habilitar/deshabilitar el MFA obligatorio, tanto a nivel de empresa (tenant) como a nivel de usuario individual.

## Decisión de diseño

**Opción A seleccionada:** campo `mfa_required` (boolean) en la entidad `User`.

## Cambios por capa

### 1. Base de datos

- Nueva columna: `mfa_required  boolean  NOT NULL  DEFAULT false` en la tabla `users` (schema por tenant).
- Migración TypeORM: `AddMfaRequiredToUsers` en `packages/database/src/migrations/`.

### 2. Backend — Entidad

Archivo: `packages/database/src/entities/user.entity.ts`

```ts
@Column({ name: 'mfa_required', default: false })
mfaRequired: boolean;
```

### 3. Backend — Lógica de enforcement (auth.service.ts)

Reemplazar:
```ts
if (MFA_REQUIRED_ROLES.includes(user.role as UserRole) && !user.mfaEnabled) {
```
Por:
```ts
if (user.mfaRequired && !user.mfaEnabled) {
```

La constante `MFA_REQUIRED_ROLES` queda obsoleta y se elimina.

### 4. Backend — DTOs (users/dto/user.dto.ts)

`CreateUserDto`:
```ts
@IsOptional()
@IsBoolean()
mfaRequired?: boolean;
```

`UpdateUserDto`: mismo campo opcional.

`UserResponseDto`: exponer `mfaRequired: boolean`.

### 5. Backend — UsersService (create)

Al construir el usuario:
```ts
user.mfaRequired = dto.mfaRequired ?? false;
```

Al restaurar usuario soft-deleted: igual, `existing.mfaRequired = dto.mfaRequired ?? false`.

### 6. Backend — TenantService

Cuando se crea un tenant con `settings.features.mfa_required_all = true`, el usuario admin inicial del provisioning nace con `mfaRequired = true`.

### 7. Frontend — TenantCreateForm

Archivo: `apps/web/src/components/tenants/TenantCreateForm.tsx`

En la sección "Básico", añadir toggle:
- Label: "Requerir verificación en dos pasos (MFA) a todos los usuarios"
- Campo Zod: `mfaRequiredAll: z.boolean().default(false)`
- Se envía como `settings: { features: { mfa_required_all: values.mfaRequiredAll } }`
- Default: `false`

### 8. Frontend — UserCreateModal

Archivo: `apps/web/src/components/users/UserCreateModal.tsx`

En la sección "Credenciales", añadir toggle:
- Label: "Requerir verificación en dos pasos (MFA)"
- Campo Zod: `mfaRequired: z.boolean().default(false)`
- Nota informativa: "Si se activa, el usuario será redirigido al setup de MFA en su primer ingreso."
- Se envía como `mfaRequired` en el payload.
- Default: `false`

### 9. Frontend — UserManagementModal

Archivo: `apps/web/src/components/users/UserManagementModal.tsx`

Añadir toggle para editar `mfaRequired` de un usuario existente vía `PATCH /users/:id`.

## Flujo resultante

```
Login usuario con mfaRequired=true y mfaEnabled=false
  → auth.service detecta mfaRequired && !mfaEnabled
  → emite token scope='mfa-setup'
  → portal redirige a /auth/mfa/setup

Login usuario con mfaRequired=false
  → login normal, sin importar el rol
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `packages/database/src/entities/user.entity.ts` | Añadir columna `mfaRequired` |
| `packages/database/src/migrations/` | Nueva migración `AddMfaRequiredToUsers` |
| `apps/api/src/modules/auth/auth.service.ts` | Reemplazar enforcement por `user.mfaRequired` |
| `apps/api/src/modules/users/dto/user.dto.ts` | Añadir `mfaRequired` a Create/Update/ResponseDto |
| `apps/api/src/modules/users/users.service.ts` | Asignar `mfaRequired` en create/restore |
| `apps/api/src/modules/tenant/tenant.service.ts` | Propagar `mfa_required_all` al usuario admin inicial |
| `apps/web/src/components/tenants/TenantCreateForm.tsx` | Toggle `mfaRequiredAll` |
| `apps/web/src/components/users/UserCreateModal.tsx` | Toggle `mfaRequired` |
| `apps/web/src/components/users/UserManagementModal.tsx` | Toggle editable `mfaRequired` |
| `apps/api/src/modules/auth/auth.service.spec.ts` | Actualizar tests de enforcement MFA |
| `apps/api/src/modules/users/users.service.spec.ts` | Tests para `mfaRequired` en create |

## Tests a actualizar

- `auth.service.spec.ts`: cambiar los tests que usan `MFA_REQUIRED_ROLES` para usar `user.mfaRequired`.
- `users.service.spec.ts`: añadir caso `mfaRequired: true` en create.
