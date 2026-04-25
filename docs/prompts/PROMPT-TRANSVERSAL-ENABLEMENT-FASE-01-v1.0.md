# PROMPT — Enablement Operativo: Perfil, Configuración y Alta de Primera Empresa

## Fase 01: Implementación Completa

**Versión:** 1.0
**Estado:** Borrador
**Fecha:** 2026-03-14
**Modo activo:** Mixto (EM + Architect)
**Generado por:** AI-EM-ARCH (Engineering Manager + Architect)
**Destinatario:** Sr. Dev Fullstack
**Nombre de archivo:** `PROMPT-TRANSVERSAL-ENABLEMENT-FASE-01-v1.0.md`

---

## Vínculos de trazabilidad

| Artefacto | Ruta |
|-----------|------|
| **Plantilla base** | docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md |
| **HLD de referencia** | docs/hlds/HLD-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md |
| **PRD MOD01** | docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md |
| **HLD MOD01** | docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md |
| **ADR-016 (Cierre MOD01)** | docs/adrs/ADR-016-Cierre-MOD01-Produccion.md |
| **ADR-023 (TailAdmin)** | docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md |
| **Stack Tecnológico** | docs/prds/Stack_Tecnologico.md |
| **Informe TailAdmin** | docs/informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md |

**Artefactos faltantes:** Ninguno — todos los artefactos fuente están disponibles.

---

## 1. Objetivo exacto de la fase

### Resultado esperado

Convertir la plataforma iWana neXt en un sistema operativamente funcional donde el SYSTEM_ADMIN pueda:

1. Editar su perfil y configurar su seguridad (contraseña, MFA)
2. Crear la primera empresa real (tenant) y verificar que el provisioning completó
3. Obtener y gestionar las credenciales del admin inicial de esa empresa
4. Configurar los parámetros base de la empresa (timezone, moneda, idioma)
5. Gestionar usuarios internos de la empresa creada

### Lo que SÍ entra

- Backend: Nuevo `PlatformUsersModule` (GET/PATCH /me), endpoints de settings de tenant, migración de DB
- Frontend: Pantallas de perfil, seguridad, tenants (lista/crear/settings), usuarios (lista/crear)
- Navegación: Actualización de Sidebar y DropdownUser para rutas funcionales
- api-client: Métodos faltantes para todos los contratos anteriores
- Tests: Unit + integration de contratos nuevos backend, E2E del flujo principal

### Lo que NO entra

- Perfil enriquecido de suscriptores / CRM (MOD02)
- Billing, facturación, métodos de pago (MOD03+)
- PQR / soporte funcional (módulo futuro)
- Upload de avatar / foto de perfil
- Email transaccional (nodemailer)
- Notificaciones en tiempo real
- Portal público comercial

---

## 2. Artefactos de entrada obligatorios

Antes de comenzar, verifica que tienes acceso a:

- [x] `docs/hlds/HLD-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md` — diseño funcional completo
- [x] `docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md` — requerimientos del módulo base
- [x] `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md` — arquitectura del módulo base
- [x] `docs/prds/Stack_Tecnologico.md` — versiones aprobadas
- [x] `docs/adrs/ADR-016-Cierre-MOD01-Produccion.md` — no reabrir MOD01
- [x] `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md` — mantener el shell

---

## 3. Instrucciones para Sr. Dev Fullstack

### FASE F1 — Migración de Base de Datos + Entidad (Backend)

**Archivo:** `packages/database/src/entities/platform-user.entity.ts`

Agregar 4 columnas al entity `PlatformUser`:

```typescript
@Column({ name: 'display_name', length: 150, nullable: true })
displayName: string | null;

@Column({ length: 20, nullable: true })
phone: string | null;

@Column({ length: 50, default: 'America/Bogota' })
timezone: string;

@Column({ length: 10, default: 'es-CO' })
language: string;
```

Generar migración TypeORM:

```bash
pnpm --filter @iwana/db migration:generate -- src/migrations/public/AddPlatformUserProfile
```

Verificar que la migración DOWN hace `DROP COLUMN IF EXISTS` de las 4 columnas.

**Entregable:** Migración reversible. Ejecutar `migration:run` y `migration:revert` para confirmar reversibilidad.

---

### FASE F2 — PlatformUsersModule (Backend)

**Crear:** `apps/api/src/modules/platform-users/`

Estructura:

```
apps/api/src/modules/platform-users/
├── platform-users.module.ts
├── platform-users.controller.ts
├── platform-users.service.ts
└── dto/
    ├── platform-user-response.dto.ts
    └── update-platform-user.dto.ts
```

#### Controller: `PlatformUsersController`

- Prefijo: `platform-users`
- Guards: `JwtAuthGuard`, `RolesGuard`
- Roles: `PlatformRole.SYSTEM_ADMIN`, `PlatformRole.IWANA_SUPPORT`

**Endpoint 1: `GET /api/v1/platform-users/me`**

```typescript
@Get('me')
@Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
@ApiOperation({ summary: 'Obtener perfil del usuario de plataforma autenticado' })
async getMyProfile(@CurrentUser() user: JwtPayload): Promise<{ data: PlatformUserResponseDto }>
```

Implementación en servicio: buscar PlatformUser por `user.sub`, mapear a DTO excluyendo `passwordHash`, `mfaSecret`, `emailHash`. El email **no se descifra** para esta respuesta — solo se retorna el `displayName`, `role`, `status` y campos de perfil.

**Endpoint 2: `PATCH /api/v1/platform-users/me`**

```typescript
@Patch('me')
@Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
@ApiOperation({ summary: 'Actualizar perfil propio del usuario de plataforma' })
async updateMyProfile(
  @CurrentUser() user: JwtPayload,
  @Body() dto: UpdatePlatformUserDto,
): Promise<{ data: PlatformUserResponseDto }>
```

#### DTO: `UpdatePlatformUserDto`

```typescript
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdatePlatformUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Formato de teléfono inválido (E.164)' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;  // Validar contra lista IANA en el servicio

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;  // 'es-CO' | 'en-US'
}
```

#### DTO: `PlatformUserResponseDto`

```typescript
export class PlatformUserResponseDto {
  id: string;
  role: PlatformRole;
  status: UserStatus;
  mfaEnabled: boolean;
  displayName: string | null;
  phone: string | null;
  timezone: string;
  language: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Servicio: `PlatformUsersService`

- Inyectar `@InjectRepository(PlatformUser)` — schema público, NO usar `runInTenantSchema`
- Inyectar `AuditService` para registrar cambios (entityType: 'PlatformUser', action: 'UPDATE')
- Método `getProfile(userId: string)`: buscar por id, mapear a DTO
- Método `updateProfile(userId: string, dto: UpdatePlatformUserDto)`: actualizar solo campos presentes, auditar, retornar DTO

#### Registro en AppModule

Importar `PlatformUsersModule` en `AppModule`.

#### Tests

Archivo: `apps/api/src/modules/platform-users/platform-users.service.spec.ts`

Casos mínimos:
- `getProfile` retorna datos sin campos sensibles
- `getProfile` lanza 404 si el usuario no existe
- `updateProfile` actualiza solo campos enviados
- `updateProfile` valida formato de phone
- `updateProfile` registra auditoría

Archivo: `apps/api/src/modules/platform-users/platform-users.controller.spec.ts` (HTTP integration)

Casos mínimos:
- `GET /platform-users/me` retorna 200 con perfil
- `GET /platform-users/me` retorna 401 sin token
- `PATCH /platform-users/me` retorna 200 con cambios parciales
- `PATCH /platform-users/me` retorna 400 con phone inválido

---

### FASE F3 — Endpoints de Settings del Tenant (Backend)

**Ampliar:** `apps/api/src/modules/tenant/`

#### Nuevos DTOs

Archivo: `apps/api/src/modules/tenant/dto/tenant-settings.dto.ts`

```typescript
import { IsOptional, IsString, MaxLength, IsInt, Min, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TenantFeaturesDto {
  @IsOptional()
  @IsBoolean()
  billing?: boolean;

  @IsOptional()
  @IsBoolean()
  mfa_required_all?: boolean;
}

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;  // ISO 4217

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;  // ISO 3166-1 alpha-2

  @IsOptional()
  @IsInt()
  @Min(0)
  maxSubscribers?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantFeaturesDto)
  features?: TenantFeaturesDto;
}

export class TenantSettingsResponseDto {
  tenantId: string;
  timezone: string;
  currency: string;
  language: string;
  country: string;
  maxSubscribers: number;
  features: {
    billing: boolean;
    mfa_required_all: boolean;
  };
}
```

#### TenantController — 2 endpoints nuevos

Agregar en `TenantController`:

```typescript
/**
 * GET /api/v1/tenants/:id/settings
 * Retorna la configuración funcional normalizada del tenant.
 */
@Get(':id/settings')
@Roles(PlatformRole.SYSTEM_ADMIN)
@ApiOperation({ summary: 'Obtener configuración funcional del tenant' })
async getSettings(
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ data: TenantSettingsResponseDto }>

/**
 * PATCH /api/v1/tenants/:id/settings
 * Actualiza configuración funcional del tenant con validación explícita.
 */
@Patch(':id/settings')
@Roles(PlatformRole.SYSTEM_ADMIN)
@ApiOperation({ summary: 'Actualizar configuración funcional del tenant' })
async updateSettings(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateTenantSettingsDto,
): Promise<{ data: TenantSettingsResponseDto }>
```

#### TenantService — 2 métodos nuevos

```typescript
/**
 * Lee el JSONB settings y aplica defaults para campos faltantes.
 * Defaults Colombia: timezone 'America/Bogota', currency 'COP',
 * language 'es-CO', country 'CO'.
 */
async getSettings(tenantId: string): Promise<TenantSettingsResponseDto>

/**
 * Aplica merge del DTO sobre settings existentes y persiste.
 * Audita el cambio completo (oldValue / newValue).
 */
async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto): Promise<TenantSettingsResponseDto>
```

**Defaults a aplicar cuando el JSONB no tiene el campo:**

| Campo | Default |
|-------|---------|
| timezone | `'America/Bogota'` |
| currency | `'COP'` |
| language | `'es-CO'` |
| country | `'CO'` |
| features.billing | `false` |
| features.mfa_required_all | `false` |

#### Tests

Archivo: `apps/api/src/modules/tenant/tenant-settings.spec.ts`

Casos mínimos:
- `getSettings` retorna defaults cuando JSONB está vacío
- `getSettings` retorna valores mergeados cuando JSONB tiene datos parciales
- `updateSettings` actualiza solo campos enviados
- `updateSettings` registra auditoría con oldValue/newValue
- `GET /tenants/:id/settings` retorna 404 si tenant no existe
- `PATCH /tenants/:id/settings` valida formato de currency

---

### FASE F4 — Layout Group Protegido (Frontend)

**Reorganizar:** `apps/web/src/app/`

Crear un layout group `(protected)` que encapsule todas las rutas que requieren autenticación y shell TailAdmin:

```
apps/web/src/app/
├── (protected)/
│   ├── layout.tsx           ← Mover contenido de dashboard/layout.tsx actual aquí
│   ├── dashboard/
│   │   └── page.tsx         ← Dashboard existente (mover)
│   ├── profile/
│   │   └── page.tsx         ← NUEVO
│   ├── settings/
│   │   └── page.tsx         ← NUEVO
│   ├── tenants/
│   │   ├── page.tsx         ← NUEVO: Lista
│   │   ├── new/
│   │   │   └── page.tsx     ← NUEVO: Crear
│   │   └── [id]/
│   │       └── settings/
│   │           └── page.tsx ← NUEVO: Config empresa
│   └── users/
│       └── page.tsx         ← NUEVO: Gestión usuarios
├── auth/                    ← Queda fuera del grupo protegido (sin shell)
│   ├── login/page.tsx
│   └── mfa/verify/page.tsx
├── layout.tsx               ← Root layout (sin cambios)
└── page.tsx                 ← Home redirect (sin cambios)
```

**Layout del grupo protegido** (`(protected)/layout.tsx`):
- Mover el contenido del actual `dashboard/layout.tsx` (Sidebar, TopHeader, AuthProvider check)
- Agregar verificación de autenticación: si `!isAuthenticated && !isLoading`, redirigir a `/auth/login`
- Todas las pantallas dentro del grupo heredan el shell automáticamente

**IMPORTANTE:** Verificar que el redirect de `/` → `/dashboard` siga funcionando después de la reorganización.

---

### FASE F5 — api-client Ampliado + Navegación Corregida (Frontend)

#### api-client — Nuevos métodos

Archivo: `apps/web/src/lib/api-client.ts`

```typescript
// Agregar:

export const platformUsersApi = {
  me: () => request<PlatformUserProfile>('/platform-users/me'),

  updateMe: (data: UpdatePlatformUserPayload) =>
    request<PlatformUserProfile>('/platform-users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// Interfaces
export interface PlatformUserProfile {
  id: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  displayName: string | null;
  phone: string | null;
  timezone: string;
  language: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePlatformUserPayload {
  displayName?: string;
  phone?: string;
  timezone?: string;
  language?: string;
}

// Ampliar tenantApi existente:
export const tenantApi = {
  // ... mantener list existente ...

  getOne: (id: string) =>
    request<TenantListItem>(`/tenants/${encodeURIComponent(id)}`),

  create: (data: CreateTenantPayload) =>
    request<TenantListItem>('/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSettings: (id: string) =>
    request<TenantSettings>(`/tenants/${encodeURIComponent(id)}/settings`),

  updateSettings: (id: string, data: UpdateTenantSettingsPayload) =>
    request<TenantSettings>(`/tenants/${encodeURIComponent(id)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  regenerateCredentials: (id: string, idempotencyKey: string) =>
    request<AdminCredentials>(`/tenants/${encodeURIComponent(id)}/regenerate-admin-credentials`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
};

export interface CreateTenantPayload {
  name: string;
  slug: string;
  contactEmail: string;
  maxSubscribers?: number;
  settings?: Record<string, unknown>;
}

export interface TenantSettings {
  tenantId: string;
  timezone: string;
  currency: string;
  language: string;
  country: string;
  maxSubscribers: number;
  features: {
    billing: boolean;
    mfa_required_all: boolean;
  };
}

export interface UpdateTenantSettingsPayload {
  timezone?: string;
  currency?: string;
  language?: string;
  country?: string;
  maxSubscribers?: number;
  features?: {
    billing?: boolean;
    mfa_required_all?: boolean;
  };
}

export interface AdminCredentials {
  message: string;
  adminEmail: string;
  temporaryPassword: string;
  expiresAt: string;
}

// NUEVO: API de usuarios (opera en contexto de tenant vía header)
export const usersApi = {
  list: (tenantSlug: string, params?: { cursor?: string; limit?: number; status?: string; role?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.role) searchParams.set('role', params.role);
    const query = searchParams.toString();
    return request<UserListItem[]>(`/users${query ? `?${query}` : ''}`, {
      headers: { 'X-Tenant-Slug': tenantSlug },
    });
  },

  create: (tenantSlug: string, data: CreateUserPayload, idempotencyKey: string) =>
    request<UserListItem & { temporaryPassword?: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'Idempotency-Key': idempotencyKey,
      },
    }),

  getOne: (tenantSlug: string, userId: string) =>
    request<UserListItem>(`/users/${encodeURIComponent(userId)}`, {
      headers: { 'X-Tenant-Slug': tenantSlug },
    }),

  update: (tenantSlug: string, userId: string, data: UpdateUserPayload, idempotencyKey: string) =>
    request<UserListItem>(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'Idempotency-Key': idempotencyKey,
      },
    }),
};

export interface UserListItem {
  id: string;
  role: string;
  status: string;
  tenantId: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  passwordResetRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  email: string;
  role: string;
  password?: string;
}

export interface UpdateUserPayload {
  status?: string;
  role?: string;
}

// Agregar endpoint change-password y MFA para settings de seguridad:
// Ya existe authApi — agregar:
// authApi.changePassword (usa POST /auth/change-password existente)
// authApi.mfaSetup (usa POST /auth/mfa/setup existente)
// authApi.mfaDisable (usa POST /auth/mfa/disable existente)
```

Agregar los métodos de auth faltantes en `authApi`:

```typescript
// Agregar dentro de authApi:
changePassword: (currentPassword: string, newPassword: string) =>
  request<{ message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  }),

mfaSetup: () =>
  request<{ secret: string; qrCode: string }>('/auth/mfa/setup', {
    method: 'POST',
  }),

mfaDisable: (password: string, code: string) =>
  request<{ message: string }>('/auth/mfa/disable', {
    method: 'POST',
    body: JSON.stringify({ password, code }),
  }),
```

#### AuthProvider — Ampliar refreshProfile

Archivo: `apps/web/src/components/auth/AuthProvider.tsx`

Después de guardar el perfil, la pantalla debe llamar `refreshProfile()` para actualizar el `displayName` en el header. El ContentsProvider actual ya expone `refreshProfile()` — solo hay que invocarlo desde `ProfileForm.onSuccess`.

Opcionalmente, mejorar `toAuthUser()` para usar el `displayName` real si está disponible en el JWT o en una llamada adicional a `/platform-users/me`. Si el JWT no incluye `displayName`, hacer un fetch a `/platform-users/me` en el bootstrap del AuthProvider.

#### Sidebar — Corregir navegación

Archivo: `apps/web/src/components/layout/Sidebar.tsx`

NavItems actualizados:

```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenants', label: 'Empresas', icon: Building2 },
  { href: '/users', label: 'Usuarios', icon: Users },
  { href: '/audit', label: 'Auditoría', icon: ShieldAlert },
  { href: '/settings', label: 'Configuración', icon: Settings },
];
```

**Nota:** El label de `Tenants` cambia a `Empresas` para usar terminología de negocio, no técnica.

#### DropdownUser — Corregir rutas

Archivo: `apps/web/src/components/layout/DropdownUser.tsx`

Las rutas ya apuntan a `/profile`, `/settings` y `/support`. Hay que verificar que con el layout group `(protected)` las rutas sigan resolviendo correctamente. Si se usa layout group, las rutas quedan como `/profile` (no `/(protected)/profile`), así que no deberían necesitar cambio.

---

### FASE F6 — Pantalla de Perfil del Superusuario (Frontend)

**Crear:** `apps/web/src/app/(protected)/profile/page.tsx`

Contenido:
- `PageHeader` con título "Mi perfil" y subtítulo "Administrador de plataforma"
- Formulario `ProfileForm` con campos: displayName, phone, timezone, language
- Sección de seguridad con links/botones a: cambiar contraseña y gestionar MFA
- Estados: loading (skeleton), error (banner), éxito (toast o badge)

**Crear:** `apps/web/src/components/profile/ProfileForm.tsx`

```typescript
'use client';

// Patrón: react-hook-form + zodResolver
// 1. Cargar datos con platformUsersApi.me() al montar
// 2. Popular formulario con datos existentes
// 3. Al submit: platformUsersApi.updateMe(data)
// 4. On success: refreshProfile() del AuthProvider + feedback visual
// 5. On error: mostrar mensaje de error del servidor
```

Campos del formulario:
- **Nombre visible** (`displayName`): input text, max 150 chars
- **Teléfono** (`phone`): input text, placeholder "+57...", validar E.164
- **Zona horaria** (`timezone`): select con zonas IANA de Colombia + principales
- **Idioma** (`language`): select con 'es-CO' (default) y 'en-US'

Schema Zod para validación cliente:

```typescript
import { z } from 'zod';

export const profileSchema = z.object({
  displayName: z.string().max(150).optional().or(z.literal('')),
  phone: z.string().max(20).regex(/^\+?[1-9]\d{1,14}$/, 'Formato E.164 inválido').optional().or(z.literal('')),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
});
```

**Crear:** `apps/web/src/components/settings/SecuritySettings.tsx`

Sección de seguridad incluida en `/settings`:
- **Cambiar contraseña**: formulario con `currentPassword`, `newPassword`, `confirmPassword`
  - Reutilizar `changePasswordSchema` de `packages/shared/src/schemas/auth.schema.ts`
  - Al éxito: feedback + recomendación de re-login
- **MFA**: mostrar estado (habilitado/deshabilitado) + botón de setup si no está habilitado + botón de disable si está habilitado
  - Setup: reutiliza flujo `authApi.mfaSetup()` → mostrar QR → verificar código
  - Disable: requiere password actual + código TOTP

**Crear:** `apps/web/src/app/(protected)/settings/page.tsx`

Contenido:
- `PageHeader` con título "Configuración" y subtítulo "Seguridad y preferencias"
- Componente `SecuritySettings`

---

### FASE F7 — Pantallas de Tenants / Empresas (Frontend)

#### 7A — Lista de empresas

**Crear:** `apps/web/src/app/(protected)/tenants/page.tsx`

- `PageHeader` con título "Empresas" + botón "Nueva empresa" que navega a `/tenants/new`
- Reutilizar y ampliar `TenantsTable` existente (en `apps/web/src/components/dashboard/TenantsTable.tsx`):
  - Agregar columna de acciones: "Configurar" → `/tenants/:id/settings`
  - Agregar `TenantStatusBadge` con colores por estado (ACTIVE=verde, PROVISIONING=amarillo, FAILED=rojo, SUSPENDED=naranja)
  - Mantener paginación existente

#### 7B — Crear empresa

**Crear:** `apps/web/src/app/(protected)/tenants/new/page.tsx`

**Crear:** `apps/web/src/components/tenants/TenantCreateForm.tsx`

Formulario:
- **Nombre** (`name`): input text, max 255 chars, requerido
- **Slug** (`slug`): input text, regex `^[a-z][a-z0-9-]{0,54}$`, auto-generado desde nombre (kebab-case), editable, requerido
- **Email de contacto** (`contactEmail`): input email, requerido
- **Máximo suscriptores** (`maxSubscribers`): input number, opcional, default 0

Schema Zod:

```typescript
export const tenantCreateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  slug: z.string().min(1).max(55).regex(/^[a-z][a-z0-9-]{0,54}$/, 'Solo letras minúsculas, números y guiones'),
  contactEmail: z.string().email('Email inválido').max(255),
  maxSubscribers: z.number().int().min(0).optional(),
});
```

Flujo post-submit:
1. `tenantApi.create(data)` → obtener tenant con `status: PROVISIONING`
2. Mostrar pantalla de estado con polling (cada 3s) a `tenantApi.getOne(id)` hasta que status cambie
3. Si `ACTIVE` → mostrar éxito + botón "Obtener credenciales admin"
4. Si `PROVISIONING_FAILED` → mostrar error + botón de retry/contacto
5. Al obtener credenciales: `tenantApi.regenerateCredentials(id, uuid())` → mostrar `CredentialsModal`

**Crear:** `apps/web/src/components/tenants/CredentialsModal.tsx`

Modal que muestra las credenciales temporales (email + password + expiración):
- Texto de advertencia: "Estas credenciales se muestran una sola vez"
- Botón "Copiar contraseña" (clipboard API)
- Botón "Cerrar" que oculta la modal
- **NO persistir credenciales en localStorage ni en estado global**

**Crear:** `apps/web/src/components/tenants/TenantStatusBadge.tsx`

Badge reutilizable que mapea `TenantStatus` a variante visual:

```typescript
const statusConfig = {
  ACTIVE: { label: 'Activo', variant: 'success' },
  PROVISIONING: { label: 'Provisionando...', variant: 'warning' },
  PROVISIONING_FAILED: { label: 'Error', variant: 'destructive' },
  SUSPENDED: { label: 'Suspendido', variant: 'warning' },
  INACTIVE: { label: 'Inactivo', variant: 'secondary' },
};
```

#### 7C — Configuración de empresa

**Crear:** `apps/web/src/app/(protected)/tenants/[id]/settings/page.tsx`

**Crear:** `apps/web/src/components/tenants/TenantSettingsForm.tsx`

Formulario:
- **Zona horaria** (`timezone`): select IANA (America/Bogota, etc.)
- **Moneda** (`currency`): select ISO 4217 (COP, USD, etc.)
- **Idioma** (`language`): select
- **País** (`country`): select ISO 3166-1 (CO, etc.)
- **Máximo suscriptores** (`maxSubscribers`): input number
- **Features**: checkboxes para `billing` y `mfa_required_all`

Cargar datos con `tenantApi.getSettings(id)`. Guardar con `tenantApi.updateSettings(id, data)`.

---

### FASE F8 — Pantalla de Gestión de Usuarios Internos (Frontend)

**Crear:** `apps/web/src/app/(protected)/users/page.tsx`

En esta fase, la gestión de usuarios opera sobre un tenant seleccionado. La pantalla debe:
1. Mostrar un selector de tenant (dropdown con lista de tenants activos)
2. Al seleccionar tenant: cargar usuarios con `usersApi.list(tenant.slug)`
3. Mostrar tabla paginada con columnas: rol, estado, MFA, último login, acciones
4. Botón "Crear usuario" → modal `UserCreateModal`

**Crear:** `apps/web/src/components/users/UsersTable.tsx`

Tabla con:
- Columnas: rol, estado (badge), MFA (sí/no), último login, acciones
- Paginación cursor-based (next/prev)
- Acciones por fila: cambiar rol, cambiar estado, ver detalle

**Crear:** `apps/web/src/components/users/UserCreateModal.tsx`

Modal con formulario:
- **Email** (`email`): input email, requerido
- **Rol** (`role`): select con enum `UserRole` (14 roles)
- **Contraseña** (`password`): input password, opcional (si se omite se genera temporal)

Al crear exitosamente:
- Si se generó password temporal: mostrar en modal similar a `CredentialsModal`
- Cerrar modal y refrescar tabla

---

### FASE F9 — Tests E2E + Informe (Testing + Documentación)

#### Test E2E principal

Archivo: `e2e/tests/web/admin-bootstrap.spec.ts`

Flujo de prueba:

```typescript
test('SYSTEM_ADMIN puede completar bootstrap operativo', async ({ page }) => {
  // 1. Login como SYSTEM_ADMIN
  // 2. Navegar a /profile → verificar que carga
  // 3. Editar displayName → guardar → verificar actualización en header
  // 4. Navegar a /tenants/new → crear empresa de prueba
  // 5. Esperar provisioning → verificar status ACTIVE
  // 6. Regenerar credenciales admin → verificar modal con datos
  // 7. Navegar a configuración de la empresa → modificar timezone → guardar
  // 8. Navegar a /users → seleccionar tenant → verificar tabla
  // 9. Crear usuario interno → verificar feedback con credenciales temporales
});
```

#### Informe documental

Crear o actualizar: `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

Contenido mínimo:
- Fecha y modo activo
- Resumen de cambios (backend, frontend, DB, tests)
- Archivos creados/modificados
- Resultados de tests (verde/rojo, cobertura)
- Pendientes y deuda técnica documentada
- Referencia a HLD y este prompt

---

## 4. Restricciones no negociables

1. **No romper boundaries del modulith** — `PlatformUsersModule` no accede a tablas de `AuthModule` directamente; si necesita lógica de auth, la importa como servicio exportado.
2. **No acceder a tablas de otro módulo directamente** — users, audit y tenant usan sus propios repos.
3. **No usar credenciales ni datos reales** — tests con factories, sin PII.
4. **No omitir pruebas** — cada contrato nuevo tiene tests.
5. **No reabrir MOD01** — el informe de cierre (ADR-016) permanece cerrado. Este trabajo se documenta como enablement transversal.
6. **No cambiar stack** — seguir Next.js App Router + Tailwind 4 + @iwana/ui existente.
7. **No persistir credenciales temporales en frontend** — se muestran una vez y se descartan.
8. **Comentar en español** las validaciones, flujos de negocio y decisiones técnicas no triviales.

---

## 5. Entregables técnicos obligatorios

| Entregable | Ubicación |
|-----------|-----------|
| Migración TypeORM reversible | `packages/database/src/migrations/public/` |
| PlatformUser entity ampliada | `packages/database/src/entities/platform-user.entity.ts` |
| PlatformUsersModule completo | `apps/api/src/modules/platform-users/` |
| DTOs de settings de tenant | `apps/api/src/modules/tenant/dto/tenant-settings.dto.ts` |
| Endpoints settings en TenantController | `apps/api/src/modules/tenant/tenant.controller.ts` |
| api-client ampliado | `apps/web/src/lib/api-client.ts` |
| Layout group (protected) | `apps/web/src/app/(protected)/layout.tsx` |
| 6 pantallas nuevas | `apps/web/src/app/(protected)/{profile,settings,tenants/*,users}/` |
| 8 componentes nuevos | `apps/web/src/components/{profile,settings,tenants,users}/` |
| Sidebar y DropdownUser actualizados | `apps/web/src/components/layout/` |
| Tests backend (unit + integration) | `apps/api/src/modules/platform-users/*.spec.ts`, `tenant-settings.spec.ts` |
| Test E2E | `e2e/tests/web/admin-bootstrap.spec.ts` |
| OpenAPI actualizada (automática con @nestjs/swagger) | Verificar en `/api/v1/docs` |

---

## 6. Entregables documentales obligatorios

| Documento | Acción |
|-----------|--------|
| `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md` | Crear al finalizar |
| `docs/hlds/HLD-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md` | Ya creado — actualizar si cambia algo |
| OpenAPI (Swagger) | Verificar que los nuevos endpoints aparecen |

---

## 7. Criterios de aceptación

| ID | Criterio | Verificación |
|----|----------|-------------|
| CA-01 | El SYSTEM_ADMIN puede editar displayName, phone, timezone y language desde `/profile` | Manual + E2E |
| CA-02 | El displayName actualizado se refleja en el header/DropdownUser tras guardar | Manual + E2E |
| CA-03 | El SYSTEM_ADMIN puede cambiar su contraseña desde `/settings` | Manual |
| CA-04 | El SYSTEM_ADMIN puede gestionar MFA desde `/settings` | Manual |
| CA-05 | El SYSTEM_ADMIN puede crear una empresa desde `/tenants/new` con nombre, slug y email | Manual + E2E |
| CA-06 | La UI muestra el estado del provisioning (PROVISIONING → ACTIVE o FAILED) | Manual + E2E |
| CA-07 | El SYSTEM_ADMIN puede regenerar credenciales del admin de la empresa y verlas una sola vez | Manual + E2E |
| CA-08 | El SYSTEM_ADMIN puede configurar timezone, moneda y features de la empresa | Manual + E2E |
| CA-09 | La pantalla de gestión de usuarios lista usuarios del tenant seleccionado con paginación | Manual + E2E |
| CA-10 | El SYSTEM_ADMIN puede crear un usuario interno y recibir credenciales temporales | Manual + E2E |
| CA-11 | Sidebar y DropdownUser no tienen rutas muertas | Manual |
| CA-12 | Loading, error y empty states están cubiertos en todas las pantallas nuevas | Manual |
| CA-13 | Tests backend >= 80% cobertura en contratos nuevos | `pnpm test --coverage` |
| CA-14 | Test E2E del flujo completo pasa en verde | `pnpm test:e2e` |
| CA-15 | OpenAPI refleja los endpoints nuevos | Verificar `/api/v1/docs` |
| CA-16 | Dark mode funcional en todas las pantallas nuevas | Manual |
| CA-17 | Migraciones reversibles verificadas | `migration:run` + `migration:revert` |

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si:

- La migración rompe el schema público existente o los datos de `PlatformUser` actuales
- El layout group `(protected)` rompe la navegación actual de login → dashboard → MFA
- Los guards de `POST /tenants` dejan de funcionar tras las modificaciones
- Aparece una violación de boundaries entre `PlatformUsersModule` y otros módulos

### Documentar causa en:

- `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

### Escalar a:

- AI-EM-ARCH en primera instancia
- CTO si el bloqueo requiere decisión de stack, boundaries o seguridad

---

## 9. Criterio de salida de la fase

- [ ] Backend validado: GET/PATCH /platform-users/me + GET/PATCH /tenants/:id/settings funcionales
- [ ] Frontend validado: 6 pantallas funcionales con loading/error/empty states
- [ ] Base de datos validada: migración ejecutada y revertida exitosamente
- [ ] Tests en verde: unit + integration + E2E
- [ ] Navegación limpia: sin rutas muertas en Sidebar ni DropdownUser
- [ ] OpenAPI actualizada
- [ ] Informe documental archivado en `docs/informes/`

---

## 10. Orden de ejecución recomendado

```
F1 (DB)  ─────────────┐
                       ├─→ F5 (api-client) ─→ F6 (Profile) ─→ F9 (E2E + informe)
F2 (PlatformUsers BE) ─┤                     F7 (Tenants) ──┤
                       │                     F8 (Users) ─────┘
F3 (Settings BE) ──────┤
                       │
F4 (Layout FE) ────────┘
```

**F1, F2, F3 y F4 son paralelizables** entre sí.
**F5** depende de F2 + F3.
**F6, F7, F8** dependen de F4 + F5.
**F9** depende de todo lo anterior.
