# MFA Required Toggle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Añadir un campo `mfa_required` por usuario y toggles en UI (creación de empresa y creación/edición de usuario) para controlar si el MFA es obligatorio, reemplazando la lógica hardcodeada por rol.

**Architecture:** Se añade columna `mfa_required boolean DEFAULT false` a la tabla `users` de cada tenant via migración. El enforcement de MFA en `auth.service.ts` pasa de consultar `MFA_REQUIRED_ROLES[]` a leer `user.mfaRequired`. Los DTOs de usuario exponen el campo y los formularios frontend añaden un toggle con default `false`.

**Tech Stack:** TypeORM (migración tenant), NestJS DTOs (class-validator), React/react-hook-form, Zod, Tailwind.

**Diseño aprobado:** `docs/plans/2026-03-17-mfa-required-toggle-design.md`

---

## Task 1: Migración de base de datos — columna `mfa_required` en tenant schemas

**Files:**
- Create: `packages/database/src/migrations/tenant/004_add_mfa_required_to_users.ts`

**Contexto:** Las migraciones de tenant siguen el patrón de `003_add_user_profile_fields.ts` — iteran todos los schemas activos y usan `IF NOT EXISTS` para ser idempotentes.

**Step 1: Crear el archivo de migración**

```typescript
import { DataSource } from 'typeorm';
import { runInTenantSchema } from '../../data-source';

/**
 * Migración retroactiva de schemas de tenant — Campo mfa_required en users.
 *
 * Agrega columna `mfa_required` a la tabla `users` en TODOS los schemas
 * de tenant activos. Default false — no cambia el comportamiento de usuarios existentes.
 *
 * Uso:
 *   pnpm --filter @iwana/db migration:tenant:run
 */
export async function runMigration(dataSource: DataSource): Promise<void> {
  const tenants = (await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  )) as Array<{ id: string; schema_name: string }>;

  if (tenants.length === 0) {
    console.log('[tenant-migration] No hay tenants activos. Nada que migrar.');
    return;
  }

  console.log(`[tenant-migration] Migrando ${tenants.length} tenant(s)...`);

  const results: { schema: string; success: boolean; error?: string }[] = [];

  for (const tenant of tenants) {
    try {
      await runInTenantSchema(dataSource, tenant.schema_name, async (qr) => {
        await qr.query(`
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT false
        `);
      });
      results.push({ schema: tenant.schema_name, success: true });
      console.log(`[tenant-migration] ✓ ${tenant.schema_name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ schema: tenant.schema_name, success: false, error: message });
      console.error(`[tenant-migration] ✗ ${tenant.schema_name}: ${message}`);
    }
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    throw new Error(`Migración parcialmente fallida: ${failed.length}/${tenants.length} schemas.`);
  }

  console.log(`[tenant-migration] Completado. ${tenants.length} schema(s) migrados exitosamente.`);
}

async function main() {
  const { AppDataSource } = await import('../../data-source');
  await AppDataSource.initialize();
  try {
    await runMigration(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

**Step 2: Verificar que el archivo compila**

```bash
pnpm --filter @iwana/db typecheck
```
Expected: sin errores de TypeScript.

**Step 3: Commit**

```bash
git add packages/database/src/migrations/tenant/004_add_mfa_required_to_users.ts
git commit -m "feat(db): añadir migración mfa_required a tabla users en schemas de tenant"
```

---

## Task 2: Entidad User — añadir columna `mfaRequired`

**Files:**
- Modify: `packages/database/src/entities/user.entity.ts`

**Contexto:** La entidad no lleva `schema:` en `@Entity()` — PostgreSQL la resuelve vía `search_path`. La columna va después de `mfaSecret` (línea ~73).

**Step 1: Añadir el campo a la entidad**

En `user.entity.ts`, después de la columna `mfaSecret`:

```typescript
/**
 * Si true, el usuario debe completar el setup de MFA antes de acceder.
 * El admin lo define al crear el usuario o puede cambiarlo después.
 * Default false — no fuerza MFA por defecto.
 */
@Column({ name: 'mfa_required', default: false })
mfaRequired: boolean;
```

**Step 2: Verificar que compila**

```bash
pnpm --filter @iwana/db typecheck
```
Expected: sin errores.

**Step 3: Commit**

```bash
git add packages/database/src/entities/user.entity.ts
git commit -m "feat(db): añadir campo mfaRequired a entidad User"
```

---

## Task 3: Backend — DTOs de usuario

**Files:**
- Modify: `apps/api/src/modules/users/dto/user.dto.ts`

**Contexto:** `CreateUserDto`, `UpdateUserDto` y `UserResponseDto` usan class-validator. `IsBoolean` ya está disponible en el paquete.

**Step 1: Añadir `IsBoolean` al import de class-validator**

Al inicio del archivo, el import de class-validator actualmente incluye varios decoradores. Añadir `IsBoolean`:

```typescript
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
```

**Step 2: Añadir `mfaRequired` a `CreateUserDto`**

Al final de la clase, después del campo `avatarUrl`:

```typescript
/** Si true, el usuario deberá configurar MFA en su primer ingreso. Default false. */
@ApiPropertyOptional({ default: false })
@IsOptional()
@IsBoolean()
mfaRequired?: boolean;
```

**Step 3: Añadir `mfaRequired` a `UpdateUserDto`**

Al final de la clase, después de `avatarUrl`:

```typescript
/** Cambia si se requiere MFA para este usuario. */
@ApiPropertyOptional()
@IsOptional()
@IsBoolean()
mfaRequired?: boolean;
```

**Step 4: Añadir `mfaRequired` a `UserResponseDto`**

Después del campo `mfaEnabled`:

```typescript
@ApiProperty()
mfaRequired: boolean;
```

**Step 5: Verificar que compila**

```bash
pnpm --filter @iwana/api typecheck
```
Expected: sin errores.

**Step 6: Commit**

```bash
git add apps/api/src/modules/users/dto/user.dto.ts
git commit -m "feat(users): añadir campo mfaRequired a DTOs de usuario"
```

---

## Task 4: Backend — UsersService (create y update) + toDto

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

**Contexto:** El método `create()` tiene dos ramas: usuario nuevo (línea ~203) y restauración de soft-delete (línea ~161). El método `toDto()` mapea la entidad al DTO de respuesta. El método `update()` aplica los campos del DTO al usuario.

**Step 1: Actualizar rama de usuario nuevo en `create()`**

En el bloque `qr.manager.create(User, { ... })` (línea ~203), añadir el campo:

```typescript
mfaRequired: dto.mfaRequired ?? false,
```

**Step 2: Actualizar rama de restauración soft-delete en `create()`**

En el bloque que asigna campos sobre `existing` (después de `existing.mfaEnabled = false`), añadir:

```typescript
existing.mfaRequired = dto.mfaRequired ?? false;
```

**Step 3: Actualizar `toDto()` para exponer `mfaRequired`**

Buscar el método `toDto()` en el servicio. Añadir el campo al objeto retornado:

```typescript
mfaRequired: user.mfaRequired,
```

**Step 4: Actualizar `update()` para aplicar `mfaRequired`**

En el método `update()`, donde se construye el objeto de actualización, añadir:

```typescript
...(dto.mfaRequired !== undefined ? { mfaRequired: dto.mfaRequired } : {}),
```

**Step 5: Verificar tests existentes no se rompen**

```bash
pnpm --filter @iwana/api test -- --testPathPattern=users.service
```
Expected: todos los tests pasan (el nuevo campo tiene default `false` y no afecta tests existentes).

**Step 6: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(users): propagar mfaRequired en create/update/toDto del servicio de usuarios"
```

---

## Task 5: Backend — Reemplazar enforcement hardcodeado en auth.service

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`

**Contexto:** La constante `MFA_REQUIRED_ROLES` está definida en la línea ~51. El enforcement está en la línea ~281 dentro del método `login()`.

**Step 1: Eliminar la constante `MFA_REQUIRED_ROLES`**

Eliminar la línea:
```typescript
const MFA_REQUIRED_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT];
```

**Step 2: Reemplazar el bloque de enforcement**

Buscar y reemplazar:
```typescript
if (MFA_REQUIRED_ROLES.includes(user.role as UserRole) && !user.mfaEnabled) {
```
Por:
```typescript
if (user.mfaRequired && !user.mfaEnabled) {
```

**Step 3: Verificar que `UserRole` ya no se importa solo por `MFA_REQUIRED_ROLES`**

Revisar si `UserRole` se usa en otro lugar del archivo. Si no, eliminarlo del import. Si se usa, dejarlo.

**Step 4: Verificar que compila**

```bash
pnpm --filter @iwana/api typecheck
```

**Step 5: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "feat(auth): reemplazar MFA_REQUIRED_ROLES hardcodeado por user.mfaRequired"
```

---

## Task 6: Tests de auth.service — actualizar enforcement MFA

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.spec.ts`

**Contexto:** Los tests que verifican `mfaSetupRequired=true` para ADMIN/NOC/ACCOUNTANT (líneas ~1216, ~1238, ~1255) crean usuarios con esos roles pero **sin** `mfaRequired: true` — ahora el enforcement depende del campo, no del rol.

**Step 1: Actualizar los tests que esperan `mfaSetupRequired=true`**

En cada test de la serie (ADMIN sin MFA, NOC sin MFA, ACCOUNTANT sin MFA), añadir `mfaRequired: true` al mock del usuario:

```typescript
// Antes:
mockUserRepository.findOne.mockResolvedValue({
  ...baseUser,
  role: UserRole.ADMIN,
  mfaEnabled: false,
  mfaSecret: null,
});

// Después:
mockUserRepository.findOne.mockResolvedValue({
  ...baseUser,
  role: UserRole.ADMIN,
  mfaEnabled: false,
  mfaSecret: null,
  mfaRequired: true,  // <-- añadir
});
```

**Step 2: Actualizar el test de SUPPORT (no debe forzar MFA)**

El test de SUPPORT (línea ~1272) ya espera `mfaSetupRequired` falsy. Verificar que el mock tiene `mfaRequired: false` (o sin el campo — default false). No necesita cambio si el mock no incluye el campo.

**Step 3: Actualizar el test de ADMIN con MFA ya configurado**

El test de la línea ~1293 espera `mfaRequired=true` (login normal). Verificar que el mock tiene `mfaEnabled: true` — ese caso no cambia.

**Step 4: Ejecutar los tests de auth**

```bash
pnpm --filter @iwana/api test -- --testPathPattern=auth.service
```
Expected: todos los tests pasan.

**Step 5: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "test(auth): actualizar tests de enforcement MFA para usar user.mfaRequired"
```

---

## Task 7: Tests de users.service — añadir caso mfaRequired

**Files:**
- Modify: `apps/api/src/modules/users/users.service.spec.ts`

**Contexto:** Los tests de `create()` verifican que el usuario se crea correctamente. Añadir un test que verifique que `mfaRequired: true` se persiste cuando se envía en el DTO.

**Step 1: Añadir test para `mfaRequired: true` en create**

En el describe de `create()`, añadir:

```typescript
it('persiste mfaRequired=true cuando se envía en el DTO', async () => {
  // Arrange: mock que captura el objeto guardado
  let savedUser: Partial<User> | null = null;
  mockQueryRunner.manager.findOne.mockResolvedValue(null); // no existe
  mockQueryRunner.manager.create.mockImplementation((_entity, data) => {
    savedUser = data;
    return data;
  });
  mockQueryRunner.manager.save.mockResolvedValue({ id: 'new-id', ...savedUser });

  const dto: CreateUserDto = {
    email: 'nuevo@test.com',
    role: UserRole.NOC,
    mfaRequired: true,
  };

  await service.create(dto);

  expect(savedUser).toMatchObject({ mfaRequired: true });
});

it('persiste mfaRequired=false por defecto si no se envía', async () => {
  let savedUser: Partial<User> | null = null;
  mockQueryRunner.manager.findOne.mockResolvedValue(null);
  mockQueryRunner.manager.create.mockImplementation((_entity, data) => {
    savedUser = data;
    return data;
  });
  mockQueryRunner.manager.save.mockResolvedValue({ id: 'new-id', ...savedUser });

  const dto: CreateUserDto = {
    email: 'otro@test.com',
    role: UserRole.SUPPORT,
  };

  await service.create(dto);

  expect(savedUser).toMatchObject({ mfaRequired: false });
});
```

**Step 2: Ejecutar tests de users**

```bash
pnpm --filter @iwana/api test -- --testPathPattern=users.service
```
Expected: todos los tests pasan.

**Step 3: Commit**

```bash
git add apps/api/src/modules/users/users.service.spec.ts
git commit -m "test(users): añadir tests para campo mfaRequired en create()"
```

---

## Task 8: Frontend — api-client.ts (interfaces)

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

**Contexto:** `UserListItem`, `CreateUserPayload` y `UpdateUserPayload` necesitan el nuevo campo.

**Step 1: Añadir `mfaRequired` a `UserListItem`**

Después de `mfaEnabled: boolean`:

```typescript
mfaRequired: boolean;
```

**Step 2: Añadir `mfaRequired` a `CreateUserPayload`**

Al final del interface:

```typescript
mfaRequired?: boolean;
```

**Step 3: Añadir `mfaRequired` a `UpdateUserPayload`**

Al final del interface:

```typescript
mfaRequired?: boolean;
```

**Step 4: Verificar que compila**

```bash
pnpm --filter @iwana/web typecheck
```
Expected: sin errores.

**Step 5: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(web): añadir mfaRequired a interfaces de usuario en api-client"
```

---

## Task 9: Frontend — TenantCreateForm (toggle mfaRequiredAll)

**Files:**
- Modify: `apps/web/src/components/tenants/TenantCreateForm.tsx`

**Contexto:** El formulario tiene secciones con tabs (basico, legal, direccion, contacto). El toggle va en la sección "Básico", al final de los campos, antes del botón submit. El schema Zod `tenantCreateSchema` debe incluir el nuevo campo. El payload se envía como `settings: { features: { mfa_required_all: ... } }` — verificar cómo se construye el payload en `onSubmit`.

**Step 1: Añadir `mfaRequiredAll` al schema Zod**

En `tenantCreateSchema`, al final del objeto:

```typescript
mfaRequiredAll: z.boolean().default(false),
```

**Step 2: Añadir el campo al `defaultValues`**

En `useForm`, en `defaultValues`:

```typescript
mfaRequiredAll: false,
```

**Step 3: Añadir el toggle en la sección "Básico"**

Al final del bloque `activeSection === 'basico'`, antes de cerrar el `</div>`, añadir:

```tsx
<div className="rounded-lg border border-gray-200 p-3 dark:border-dark-border">
  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
    Seguridad
  </p>
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      className="rounded"
      {...register('mfaRequiredAll')}
    />
    Requerir verificación en dos pasos (MFA) a todos los usuarios
  </label>
  <p className="mt-1 text-xs text-gray-400">
    Si se activa, cada usuario será redirigido al setup de MFA en su primer ingreso.
  </p>
</div>
```

**Step 4: Incluir el valor en el payload de `onSubmit`**

En la construcción del `payload` dentro de `onSubmit`, añadir:

```typescript
settings: {
  features: {
    mfa_required_all: values.mfaRequiredAll ?? false,
  },
},
```

**Nota:** Verificar si la API de creación de tenants acepta `settings` en el payload. Si no existe ese campo en `CreateTenantDto` del backend, se deberá añadir también. Consultar `apps/api/src/modules/tenant/dto/` para verificar.

**Step 5: Verificar que compila**

```bash
pnpm --filter @iwana/web typecheck
```
Expected: sin errores.

**Step 6: Commit**

```bash
git add apps/web/src/components/tenants/TenantCreateForm.tsx
git commit -m "feat(tenants): añadir toggle mfa_required_all en formulario de creación de empresa"
```

---

## Task 10: Frontend — UserCreateModal (toggle mfaRequired)

**Files:**
- Modify: `apps/web/src/components/users/UserCreateModal.tsx`

**Contexto:** El modal usa `react-hook-form` con `zodResolver`. El toggle va en la sección "Credenciales", después del campo de contraseña.

**Step 1: Añadir `mfaRequired` al schema Zod**

En `createUserSchema`, al final del objeto:

```typescript
mfaRequired: z.boolean().default(false),
```

**Step 2: Añadir al tipo y a `defaultValues`**

El tipo `CreateUserFormValues` se infiere de Zod — se actualiza automáticamente.

En `useForm`, en `defaultValues`:

```typescript
mfaRequired: false,
```

**Step 3: Añadir el toggle en la sección "Credenciales"**

Después del bloque del campo `password` (antes de cerrar el `</div>` de credenciales):

```tsx
<div>
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      className="rounded"
      {...register('mfaRequired')}
    />
    Requerir verificación en dos pasos (MFA)
  </label>
  <p className="mt-1 text-xs text-gray-400">
    Si se activa, el usuario será redirigido al setup de MFA en su primer ingreso.
  </p>
</div>
```

**Step 4: Incluir en el payload de `onSubmit`**

En la construcción del `payload`, añadir:

```typescript
mfaRequired: values.mfaRequired ?? false,
```

**Step 5: Verificar que compila**

```bash
pnpm --filter @iwana/web typecheck
```

**Step 6: Commit**

```bash
git add apps/web/src/components/users/UserCreateModal.tsx
git commit -m "feat(users): añadir toggle mfaRequired en modal de creación de usuario"
```

---

## Task 11: Frontend — UserManagementModal (toggle editable mfaRequired)

**Files:**
- Modify: `apps/web/src/components/users/UserManagementModal.tsx`

**Contexto:** El modal usa estado local (no react-hook-form). Los campos como `role`, `status`, `firstName` etc. son `useState`. El `handleSave` construye `UpdateUserPayload` manualmente.

**Step 1: Añadir estado local para `mfaRequired`**

Al inicio del componente, junto a los demás `useState`:

```typescript
const [mfaRequired, setMfaRequired] = useState(user?.mfaRequired ?? false);
```

**Step 2: Inicializar desde el detalle cargado**

En el `useEffect` que llama `usersApi.getOne()`, después de `setAvatarUrl(current.avatarUrl ?? '')`:

```typescript
setMfaRequired(current.mfaRequired ?? false);
```

**Step 3: Limpiar al cerrar**

En el `useEffect` de limpieza (`if (!open)`), añadir:

```typescript
setMfaRequired(false);
```

**Step 4: Incluir en el payload de `handleSave`**

En la construcción de `UpdateUserPayload`:

```typescript
mfaRequired,
```

**Step 5: Añadir el toggle en el JSX**

Buscar la sección donde se muestran los campos editables (role, status). Añadir el toggle en un bloque de "Seguridad":

```tsx
<div>
  <label className={LABEL_CLASS}>Seguridad</label>
  <label className="flex items-center gap-2 text-sm mt-1">
    <input
      type="checkbox"
      className="rounded"
      checked={mfaRequired}
      onChange={(e) => setMfaRequired(e.target.checked)}
    />
    Requerir verificación en dos pasos (MFA)
  </label>
  {detail?.mfaEnabled && (
    <p className="mt-1 text-xs text-gray-400">
      MFA actualmente configurado. Desactivar este toggle no elimina el MFA ya configurado.
    </p>
  )}
</div>
```

**Step 6: Verificar que compila**

```bash
pnpm --filter @iwana/web typecheck
```

**Step 7: Commit**

```bash
git add apps/web/src/components/users/UserManagementModal.tsx
git commit -m "feat(users): añadir toggle mfaRequired editable en modal de gestión de usuario"
```

---

## Task 12: Verificación del CreateTenantDto en el backend

**Files:**
- Check: `apps/api/src/modules/tenant/dto/create-tenant.dto.ts` (o similar)

**Contexto:** El Task 9 asume que la API de creación de tenants acepta un campo `settings`. Verificar que `CreateTenantDto` lo incluye. Si no, añadirlo.

**Step 1: Revisar el DTO**

```bash
# Buscar el DTO de creación de tenant
grep -n "settings\|features\|mfa_required_all" apps/api/src/modules/tenant/dto/
```

Si `settings` no existe en el DTO, añadirlo siguiendo el mismo patrón de `UpdateTenantSettingsDto`.

**Step 2: Si hay cambios, verificar**

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/api test -- --testPathPattern=tenant
```

**Step 3: Commit si hubo cambios**

```bash
git add apps/api/src/modules/tenant/dto/
git commit -m "feat(tenants): aceptar settings.features en CreateTenantDto"
```

---

## Task 13: Verificación final integral

**Step 1: Correr todos los tests de la API**

```bash
pnpm --filter @iwana/api test
```
Expected: todos los tests pasan.

**Step 2: Correr typecheck del monorepo**

```bash
pnpm typecheck
```
Expected: sin errores.

**Step 3: Levantar el stack en dev y verificar manualmente**

```bash
pnpm dev
```

Verificar en `http://localhost:3001`:
1. Crear empresa → sección "Básico" → toggle MFA visible y desactivado por defecto.
2. Ir a Usuarios → "Crear usuario" → sección "Credenciales" → toggle MFA visible.
3. Abrir un usuario existente → toggle MFA editable y refleja el valor actual.
4. Crear un usuario con `mfaRequired: true` → hacer login con ese usuario en `http://localhost:3002` → debe redirigir a `/auth/mfa/setup`.
5. Crear un usuario ADMIN con `mfaRequired: false` → hacer login → NO debe redirigir a MFA setup.

**Step 4: Commit final si todo está bien**

```bash
git commit --allow-empty -m "chore: verificación integral toggle mfa_required completada"
```
