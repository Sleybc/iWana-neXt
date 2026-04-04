# Branding Tenant — Logo y Sello — Implementation Plan

**Version:** 1.0
**Estado:** Cerrado
**Fecha:** 2026-03-17
**Convencion documental:** PLAN-MOD03-BRANDING-LOGO-SELLO-FASE-02-v1.0.md

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que cada tenant configure su logo y sello con variantes clara/oscura, adaptando el sidebar del portal para mostrar la identidad visual del tenant en lugar de los valores hardcodeados de iWana.

**Architecture:** Se añaden 5 columnas a `public.tenants` via migración TypeORM, un nuevo endpoint `PATCH /tenants/me/branding` con DTO self-service y auditoría, y un componente React reutilizable `TenantSeal` que el sidebar consume. Los campos de branding viajan en el DTO `TenantSelfResponseDto` existente sin request adicional.

**Tech Stack:** NestJS + TypeORM + class-validator (backend) · Next.js App Router + React + Zod + react-hook-form (frontend) · PostgreSQL (migración) · Jest + Playwright (tests)

---

## Task 1: Migración TypeORM — columnas de branding en `public.tenants`

**Files:**
- Modify: `packages/database/src/entities/tenant.entity.ts`
- Create: `packages/database/src/migrations/public/AddTenantBrandingColumns.ts` (nombre exacto según convención del repo)

**Contexto:** El repo usa TypeORM con migraciones versionadas manuales. Ver `packages/database/src/data-source.ts` para la configuración. Las migraciones públicas viven en `packages/database/src/migrations/public/`. Consultar `database-migration` skill antes de ejecutar si hay dudas.

**Step 1: Añadir campos a la entidad Tenant**

En `packages/database/src/entities/tenant.entity.ts`, después del campo `economicSector` y antes de `createdAt`, agregar:

```typescript
// ── Branding ─────────────────────────────────────────────────────────────────

/** URL pública HTTPS del logo horizontal — variante clara (fondo blanco/claro) */
@Column({ name: 'logo_light_url', length: 500, nullable: true, type: 'varchar' })
logoLightUrl: string | null;

/** URL pública HTTPS del logo horizontal — variante oscura (fondo dark) */
@Column({ name: 'logo_dark_url', length: 500, nullable: true, type: 'varchar' })
logoDarkUrl: string | null;

/** URL pública HTTPS del sello compacto (ícono 1:1) — variante clara */
@Column({ name: 'seal_light_url', length: 500, nullable: true, type: 'varchar' })
sealLightUrl: string | null;

/** URL pública HTTPS del sello compacto (ícono 1:1) — variante oscura */
@Column({ name: 'seal_dark_url', length: 500, nullable: true, type: 'varchar' })
sealDarkUrl: string | null;

/** Si el tenant elige mostrar su nombre comercial junto al sello en el sidebar */
@Column({ name: 'show_tenant_name', type: 'boolean', default: true })
showTenantName: boolean;
```

**Step 2: Crear migración**

```bash
pnpm --filter @iwana/db migration:generate -- src/migrations/public/AddTenantBrandingColumns
```

Revisar el archivo generado y confirmar que contiene `ADD COLUMN` para las 5 columnas y el correspondiente `DROP COLUMN` en `down()`.

**Step 3: Ejecutar migración en desarrollo**

```bash
pnpm --filter @iwana/db migration:run
```

Expected: `Migration AddTenantBrandingColumns has been executed successfully.`

**Step 4: Verificar typecheck del paquete database**

```bash
pnpm --filter @iwana/db typecheck
```

Expected: sin errores.

**Step 5: Commit**

```bash
git add packages/database/src/entities/tenant.entity.ts packages/database/src/migrations/public/AddTenantBrandingColumns.ts
git commit -m "feat(db): añadir columnas de branding a public.tenants"
```

---

## Task 2: DTO self-service de branding + ampliar TenantSelfResponseDto

**Files:**
- Modify: `apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts`
- Modify: `apps/api/src/modules/tenant/dto/tenant-self.dto.ts`

**Contexto:** Los DTOs self-service están en `tenant-self-update.dto.ts`. Usan `class-validator` + `class-transformer`. El patrón de validación de URLs con `https://` se implementa con `@IsUrl` + opciones restrictivas. Ver DTOs existentes para el estilo.

**Step 1: Añadir `UpdateTenantSelfBrandingDto` en `tenant-self-update.dto.ts`**

Al final del archivo agregar:

```typescript
function validateHttpsUrl(url: unknown): boolean {
  if (url === null || url === undefined) return true;
  if (typeof url !== 'string') return false;
  return url.startsWith('https://');
}

export class UpdateTenantSelfBrandingDto {
  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'logoLightUrl debe ser una URL válida.' },
  )
  @MaxLength(500)
  @Validate(
    class implements ValidatorConstraintInterface {
      validate(value: unknown) { return validateHttpsUrl(value); }
      defaultMessage() { return 'Las URLs de branding deben usar HTTPS.'; }
    },
  )
  logoLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl({ require_protocol: true, require_tld: true }, { message: 'logoDarkUrl debe ser una URL válida.' })
  @MaxLength(500)
  logoDarkUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl({ require_protocol: true, require_tld: true }, { message: 'sealLightUrl debe ser una URL válida.' })
  @MaxLength(500)
  sealLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl({ require_protocol: true, require_tld: true }, { message: 'sealDarkUrl debe ser una URL válida.' })
  @MaxLength(500)
  sealDarkUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  showTenantName?: boolean;
}
```

> **Nota importante:** El validador de HTTPS inline no es la forma más limpia — usa `@Matches(/^https:\/\//, { message: 'Las URLs de branding deben usar HTTPS.' })` en cada campo URL en lugar del `@Validate` inline. Más simple y suficiente.

**Step 1 (corregido) — versión limpia:**

```typescript
export class UpdateTenantSelfBrandingDto {
  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl({ require_protocol: true, require_tld: true }, { message: 'logoLightUrl debe ser una URL válida.' })
  @Matches(/^https:\/\//, { message: 'logoLightUrl debe usar HTTPS.' })
  @MaxLength(500)
  logoLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl({ require_protocol: true, require_tld: true }, { message: 'logoDarkUrl debe ser una URL válida.' })
  @Matches(/^https:\/\//, { message: 'logoDarkUrl debe usar HTTPS.' })
  @MaxLength(500)
  logoDarkUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl({ require_protocol: true, require_tld: true }, { message: 'sealLightUrl debe ser una URL válida.' })
  @Matches(/^https:\/\//, { message: 'sealLightUrl debe usar HTTPS.' })
  @MaxLength(500)
  sealLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl({ require_protocol: true, require_tld: true }, { message: 'sealDarkUrl debe ser una URL válida.' })
  @Matches(/^https:\/\//, { message: 'sealDarkUrl debe usar HTTPS.' })
  @MaxLength(500)
  sealDarkUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  showTenantName?: boolean;
}
```

Añadir `Matches` al import de `class-validator` en la cabecera del archivo.

**Step 2: Ampliar `TenantSelfResponseDto` en `tenant-self.dto.ts`**

Añadir los 5 campos de branding al final de la clase `TenantSelfResponseDto`:

```typescript
// Branding del tenant
logoLightUrl: string | null;
logoDarkUrl: string | null;
sealLightUrl: string | null;
sealDarkUrl: string | null;
showTenantName: boolean;
```

**Step 3: Verificar typecheck**

```bash
pnpm --filter @iwana/api typecheck
```

Expected: sin errores (el compilador se quejará de `toSelfResponseDto` hasta el Task 3).

**Step 4: Commit**

```bash
git add apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts apps/api/src/modules/tenant/dto/tenant-self.dto.ts
git commit -m "feat(api): añadir DTOs de branding self-service para tenant"
```

---

## Task 3: Servicio y controlador — método `updateTenantSelfBranding`

**Files:**
- Modify: `apps/api/src/modules/tenant/tenant.service.ts`
- Modify: `apps/api/src/modules/tenant/tenant.controller.ts`

**Contexto:** El patrón ya existe en `updateTenantSelfProfile()` — mismo flujo: buscar tenant, aplicar campos del DTO, guardar, invalidar cache, auditar. `AuditAction.UPDATE` y `entityType: 'TenantBranding'`. El método `toSelfResponseDto()` también necesita los nuevos campos.

**Step 1: Ampliar `toSelfResponseDto()` en `tenant.service.ts`**

Añadir al final del método privado `toSelfResponseDto`, antes del `return`:

```typescript
dto.logoLightUrl = tenant.logoLightUrl ?? null;
dto.logoDarkUrl = tenant.logoDarkUrl ?? null;
dto.sealLightUrl = tenant.sealLightUrl ?? null;
dto.sealDarkUrl = tenant.sealDarkUrl ?? null;
dto.showTenantName = tenant.showTenantName ?? true;
```

**Step 2: Añadir import del nuevo DTO en `tenant.service.ts`**

En el import de `tenant-self-update.dto.ts`:

```typescript
import {
  UpdateTenantSelfProfileDto,
  UpdateTenantSelfSettingsDto,
  UpdateTenantSelfBrandingDto,
} from './dto/tenant-self-update.dto';
```

**Step 3: Añadir método `updateTenantSelfBranding()` en `tenant.service.ts`**

Después de `updateTenantSelfSettings()`, añadir:

```typescript
/**
 * Actualiza URLs de logo, sello y preferencia de visualización del tenant.
 * Solo acepta URLs HTTPS — validado en DTO.
 * Campos de plataforma no están expuestos en este contrato.
 */
async updateTenantSelfBranding(
  tenantId: string,
  dto: UpdateTenantSelfBrandingDto,
  actorUserId?: string,
): Promise<TenantSelfResponseDto> {
  const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
  if (!tenant) {
    throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
  }

  const oldValue = this.toSelfResponseDto(tenant);

  if (dto.logoLightUrl !== undefined) tenant.logoLightUrl = dto.logoLightUrl ?? null;
  if (dto.logoDarkUrl !== undefined) tenant.logoDarkUrl = dto.logoDarkUrl ?? null;
  if (dto.sealLightUrl !== undefined) tenant.sealLightUrl = dto.sealLightUrl ?? null;
  if (dto.sealDarkUrl !== undefined) tenant.sealDarkUrl = dto.sealDarkUrl ?? null;
  if (dto.showTenantName !== undefined) tenant.showTenantName = dto.showTenantName;

  const saved = await this.tenantRepo.save(tenant);
  await this.invalidateTenantCache(saved.id, saved.slug);
  await this.cacheTenant(saved);

  const newValue = this.toSelfResponseDto(saved);

  await this.auditService.log({
    tenantId: saved.id,
    schemaName: saved.schemaName,
    userId: actorUserId ?? null,
    action: AuditAction.UPDATE,
    entityType: 'TenantBranding',
    entityId: saved.id,
    oldValue: oldValue as unknown as Record<string, unknown>,
    newValue: newValue as unknown as Record<string, unknown>,
  });

  return newValue;
}
```

**Step 4: Añadir endpoint en `tenant.controller.ts`**

Añadir el import del nuevo DTO:

```typescript
import {
  UpdateTenantSelfProfileDto,
  UpdateTenantSelfSettingsDto,
  UpdateTenantSelfBrandingDto,
} from './dto/tenant-self-update.dto';
```

Después de `patchMeSettings()` y antes del bloque de administración de plataforma, añadir:

```typescript
/**
 * PATCH /api/v1/tenants/me/branding
 * Actualiza URLs de logo, sello y preferencia de nombre del tenant autenticado.
 * Solo ADMIN puede modificar la identidad visual de la empresa.
 */
@Patch('me/branding')
@Roles(UserRole.ADMIN)
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Actualizar branding del tenant autenticado (logo y sello)' })
@ApiResponse({ status: 200, description: 'Branding actualizado.' })
async patchMeBranding(
  @CurrentUser() user: JwtPayload,
  @Body() dto: UpdateTenantSelfBrandingDto,
): Promise<{ data: TenantSelfResponseDto }> {
  const data = await this.tenantService.updateTenantSelfBranding(user.tenantId!, dto, user.sub);
  return { data };
}
```

**Step 5: Verificar typecheck**

```bash
pnpm --filter @iwana/api typecheck
```

Expected: exit 0, sin errores.

**Step 6: Commit**

```bash
git add apps/api/src/modules/tenant/tenant.service.ts apps/api/src/modules/tenant/tenant.controller.ts
git commit -m "feat(api): implementar PATCH /tenants/me/branding con auditoría"
```

---

## Task 4: Tests backend del nuevo endpoint

**Files:**
- Modify: `apps/api/src/modules/tenant/tenant-self.spec.ts`
- Modify: `apps/api/src/modules/tenant/tenant-settings.spec.ts` (añadir tests de `updateTenantSelfBranding` al servicio)

**Contexto:** El patrón de test del controlador está en `tenant-self.spec.ts`. El patrón de test del servicio está en `tenant-settings.spec.ts`. Ver ambos archivos antes de escribir.

**Step 1: Añadir mock del método en `tenant-self.spec.ts`**

En el objeto `tenantService` del mock, añadir:

```typescript
updateTenantSelfBranding: jest.fn().mockResolvedValue({
  ...tenantSelfData,
  logoLightUrl: null,
  logoDarkUrl: null,
  sealLightUrl: null,
  sealDarkUrl: null,
  showTenantName: true,
}),
```

También actualizar `tenantSelfData` para incluir los campos de branding:

```typescript
const tenantSelfData = {
  // ...campos existentes...
  logoLightUrl: null,
  logoDarkUrl: null,
  sealLightUrl: null,
  sealDarkUrl: null,
  showTenantName: true,
};
```

**Step 2: Añadir bloque de tests del controlador**

```typescript
describe('PATCH /tenants/me/branding', () => {
  it('actualiza branding usando tenantId y actor del JWT', async () => {
    const payload = {
      sealLightUrl: 'https://cdn.empresa.co/seal-light.svg',
      showTenantName: false,
    };

    const result = await controller.patchMeBranding(adminJwt, payload);

    expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
      'tenant-uuid-1',
      payload,
      'user-uuid-admin',
    );
    expect(result.data).toBeDefined();
  });

  it('pasa tenantId del JWT — nunca un id hardcodeado', async () => {
    const otherJwt = { ...adminJwt, tenantId: 'otro-tenant-uuid' };
    await controller.patchMeBranding(otherJwt, {});

    expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
      'otro-tenant-uuid',
      expect.any(Object),
      expect.any(String),
    );
  });
});
```

**Step 3: Añadir tests del servicio en `tenant-settings.spec.ts`**

```typescript
it('updateTenantSelfBranding actualiza solo campos de branding y audita', async () => {
  const tenant = buildTenant({
    logoLightUrl: null,
    sealLightUrl: null,
    showTenantName: true,
  });
  repo.findOne.mockResolvedValue(tenant);
  repo.save.mockImplementation(async (entity) => entity as Tenant);

  const data = await service.updateTenantSelfBranding(
    tenant.id,
    {
      sealLightUrl: 'https://cdn.empresa.co/seal.svg',
      showTenantName: false,
    },
    'actor-1',
  );

  expect(data.sealLightUrl).toBe('https://cdn.empresa.co/seal.svg');
  expect(data.showTenantName).toBe(false);
  expect(data.logoLightUrl).toBeNull(); // no afectado
  expect(auditServiceMock.log).toHaveBeenCalledWith(
    expect.objectContaining({ entityType: 'TenantBranding', userId: 'actor-1' }),
  );
});

it('updateTenantSelfBranding permite null para borrar una URL existente', async () => {
  const tenant = buildTenant({
    sealLightUrl: 'https://cdn.empresa.co/seal.svg',
  });
  repo.findOne.mockResolvedValue(tenant);
  repo.save.mockImplementation(async (entity) => entity as Tenant);

  const data = await service.updateTenantSelfBranding(tenant.id, {
    sealLightUrl: null,
  });

  expect(data.sealLightUrl).toBeNull();
});
```

> **Nota:** Actualizar `buildTenant()` para incluir los nuevos campos con valor `null` por defecto:
> ```typescript
> logoLightUrl: null,
> logoDarkUrl: null,
> sealLightUrl: null,
> sealDarkUrl: null,
> showTenantName: true,
> ```

**Step 4: Ejecutar tests**

```bash
pnpm --filter @iwana/api test --testPathPattern="tenant-self|tenant-settings"
```

Expected: todos en verde.

**Step 5: Ejecutar todos los tests del API**

```bash
pnpm --filter @iwana/api test
```

Expected: todos en verde (número total aumenta con los nuevos tests).

**Step 6: Commit**

```bash
git add apps/api/src/modules/tenant/tenant-self.spec.ts apps/api/src/modules/tenant/tenant-settings.spec.ts
git commit -m "test(api): añadir tests de PATCH /tenants/me/branding"
```

---

## Task 5: Componente `TenantSeal`

**Files:**
- Create: `apps/portal/src/components/layout/TenantSeal.tsx`

**Contexto:** Componente Client. Usa `useTheme` de `next-themes` o la clase `dark` en el `html` para detectar modo oscuro. El sidebar usa Tailwind 4 con tokens `bg-iwana-secondary` y `text-iwana-primary` — usar las mismas clases para el fallback.

**Step 1: Crear el componente**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@iwana/ui';

interface TenantSealProps {
  sealLightUrl: string | null;
  sealDarkUrl: string | null;
  /** Nombre comercial del tenant — usado para generar iniciales del fallback */
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-base',
  md: 'w-10 h-10 text-lg',
  lg: 'w-16 h-16 text-2xl',
} as const;

/** Genera máximo 2 iniciales a partir del nombre comercial */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return (words[0]?.slice(0, 2) ?? '?').toUpperCase();
  }
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Muestra el sello del tenant con fallback de iniciales.
 *
 * - Si hay URL configurada → imagen con la variante correcta según dark mode.
 * - Si la imagen falla o no hay URL → cuadrado con iniciales en colores iWana.
 *
 * Reutilizable en sidebar, documentos, login y cualquier punto que necesite
 * representar la identidad compacta del tenant.
 */
export function TenantSeal({
  sealLightUrl,
  sealDarkUrl,
  name,
  size = 'sm',
  className,
}: TenantSealProps) {
  const [isDark, setIsDark] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Detectar dark mode observando la clase 'dark' en el elemento html
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setIsDark(html.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Resetear error si cambian las URLs
  useEffect(() => {
    setImgError(false);
  }, [sealLightUrl, sealDarkUrl]);

  const activeUrl = isDark
    ? (sealDarkUrl ?? sealLightUrl)
    : (sealLightUrl ?? sealDarkUrl);

  const sizeClass = SIZE_CLASSES[size];

  if (activeUrl && !imgError) {
    return (
      <img
        src={activeUrl}
        alt={`Sello de ${name}`}
        onError={() => setImgError(true)}
        className={cn(
          sizeClass,
          'shrink-0 rounded-md object-contain',
          className,
        )}
      />
    );
  }

  // Fallback: iniciales con colores iWana — idéntico al "iW" actual del sidebar
  return (
    <div
      aria-hidden="true"
      className={cn(
        sizeClass,
        'shrink-0 rounded-md bg-iwana-secondary flex items-center justify-center',
        className,
      )}
    >
      <span className="text-iwana-primary font-bold leading-none">
        {getInitials(name)}
      </span>
    </div>
  );
}
```

**Step 2: Verificar typecheck del portal**

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: exit 0.

**Step 3: Commit**

```bash
git add apps/portal/src/components/layout/TenantSeal.tsx
git commit -m "feat(portal): añadir componente TenantSeal con fallback de iniciales"
```

---

## Task 6: Adaptar el Sidebar para usar `TenantSeal`

**Files:**
- Modify: `apps/portal/src/components/layout/Sidebar.tsx`

**Contexto:** El sidebar actualmente recibe `desktopCollapsed`, `setDesktopCollapsed`, `mobileOpen`, `setMobileOpen` como props. Los datos del tenant (`name`, `sealLightUrl`, etc.) deben llegar via props nuevas para no hacer fetch dentro del sidebar. Ver cómo el layout del portal pasa props al sidebar — probablemente en `apps/portal/src/app/dashboard/layout.tsx`.

**Step 1: Revisar cómo el layout instancia el Sidebar**

Leer `apps/portal/src/app/dashboard/layout.tsx` antes de modificar. El objeto `TenantSelf` ya se carga en el layout — agregar `profile` como prop del sidebar es el mínimo cambio.

**Step 2: Ampliar `SidebarProps`**

```typescript
import { TenantSeal } from './TenantSeal';
import type { TenantSelf } from '@/lib/api-client';

interface SidebarProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  /** Datos del tenant autenticado — para mostrar sello y nombre en el header del sidebar */
  profile?: TenantSelf | null;
}
```

**Step 3: Reemplazar el bloque "Logo expandido" en el sidebar**

Reemplazar el bloque `{/* Logo expandido */}` (el `<Link>` que contiene el `div` con "iW" y el span "iWana Empresa") por:

```tsx
{/* Marca del tenant — expandido */}
<Link
  href="/dashboard"
  className={cn('flex items-center gap-3 min-w-0', desktopCollapsed && 'lg:hidden')}
>
  <TenantSeal
    sealLightUrl={profile?.sealLightUrl ?? null}
    sealDarkUrl={profile?.sealDarkUrl ?? null}
    name={profile?.name ?? 'iW'}
    size="sm"
    className="shrink-0"
  />
  {(profile?.showTenantName ?? true) && (
    <span className="text-lg font-bold tracking-tight text-white truncate">
      {profile?.name ?? 'iWana Empresa'}
    </span>
  )}
</Link>
```

Reemplazar el bloque `{/* Icono solo — colapsado desktop */}` por:

```tsx
{/* Sello solo — colapsado desktop */}
<Link
  href="/dashboard"
  className={cn('hidden items-center justify-center', desktopCollapsed && 'lg:flex')}
  aria-label="Ir al dashboard"
>
  <TenantSeal
    sealLightUrl={profile?.sealLightUrl ?? null}
    sealDarkUrl={profile?.sealDarkUrl ?? null}
    name={profile?.name ?? 'iW'}
    size="sm"
  />
</Link>
```

**Step 4: Pasar `profile` desde el layout**

En `apps/portal/src/app/dashboard/layout.tsx` (o donde se instancie `<Sidebar>`), pasar el perfil del tenant:

```tsx
<Sidebar
  desktopCollapsed={desktopCollapsed}
  setDesktopCollapsed={setDesktopCollapsed}
  mobileOpen={mobileOpen}
  setMobileOpen={setMobileOpen}
  profile={profile}  // TenantSelf | null — ya cargado en el layout
/>
```

**Step 5: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: exit 0.

**Step 6: Commit**

```bash
git add apps/portal/src/components/layout/Sidebar.tsx apps/portal/src/app/dashboard/layout.tsx
git commit -m "feat(portal): adaptar sidebar para mostrar sello y nombre del tenant"
```

---

## Task 7: Formulario `BrandingForm` en settings

**Files:**
- Create: `apps/portal/src/components/settings/BrandingForm.tsx`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

**Contexto:** El patrón de formulario está en `CompanyProfileForm.tsx` — mismo esquema: `useForm` + `zodResolver` + estados `serverError`/`success` + `canEdit`. `tenantSelfApi` en `api-client.ts` sigue el mismo patrón de los otros métodos.

**Step 1: Añadir método `updateBranding` en `api-client.ts`**

Añadir la interfaz y el método al objeto `tenantSelfApi`:

```typescript
export interface UpdateTenantSelfBrandingDto {
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  sealLightUrl?: string | null;
  sealDarkUrl?: string | null;
  showTenantName?: boolean;
}

// En tenantSelfApi:
/** Actualiza el branding del tenant autenticado (logo, sello, preferencia de nombre). */
updateBranding: (dto: UpdateTenantSelfBrandingDto, tenantSlug?: string) =>
  request<TenantSelf>(
    '/tenants/me/branding',
    { method: 'PATCH', body: JSON.stringify(dto) },
    tenantSlug,
  ),
```

También ampliar la interfaz `TenantSelf` con los nuevos campos:

```typescript
export interface TenantSelf {
  // ...campos existentes...
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  sealLightUrl: string | null;
  sealDarkUrl: string | null;
  showTenantName: boolean;
}
```

**Step 2: Crear `BrandingForm.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { TenantSeal } from '@/components/layout/TenantSeal';

const httpsUrl = z
  .string()
  .trim()
  .url('Ingresa una URL válida.')
  .startsWith('https://', 'La URL debe usar HTTPS.')
  .max(500, 'Máximo 500 caracteres.');

const brandingSchema = z.object({
  logoLightUrl: httpsUrl.optional().or(z.literal('')),
  logoDarkUrl: httpsUrl.optional().or(z.literal('')),
  sealLightUrl: httpsUrl.optional().or(z.literal('')),
  sealDarkUrl: httpsUrl.optional().or(z.literal('')),
  showTenantName: z.boolean(),
});

type BrandingFormValues = z.infer<typeof brandingSchema>;

interface BrandingFormProps {
  profile: TenantSelf;
  canEdit: boolean;
  onUpdated: (updated: TenantSelf) => void;
}

function nullable(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Muestra un preview inline de la imagen con fallback de texto de error */
function ImagePreview({ url, label }: { url: string; label: string }) {
  const [error, setError] = useState(false);

  useEffect(() => setError(false), [url]);

  if (!url.trim()) return null;

  return (
    <div className="mt-2 flex items-center gap-3">
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          No se pudo cargar — verifica la URL y que sea HTTPS.
        </p>
      ) : (
        <>
          <div className="h-10 w-10 shrink-0 rounded-md border border-gray-200 bg-white p-1 dark:border-dark-border dark:bg-dark-surface-3">
            <img
              src={url}
              alt={label}
              onError={() => setError(true)}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="h-10 w-10 shrink-0 rounded-md border border-gray-700 bg-gray-900 p-1">
            <img
              src={url}
              alt={`${label} dark`}
              onError={() => setError(true)}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Vista previa claro / oscuro
          </p>
        </>
      )}
    </div>
  );
}

export function BrandingForm({ profile, canEdit, onUpdated }: BrandingFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      logoLightUrl: profile.logoLightUrl ?? '',
      logoDarkUrl: profile.logoDarkUrl ?? '',
      sealLightUrl: profile.sealLightUrl ?? '',
      sealDarkUrl: profile.sealDarkUrl ?? '',
      showTenantName: profile.showTenantName,
    },
  });

  useEffect(() => {
    reset({
      logoLightUrl: profile.logoLightUrl ?? '',
      logoDarkUrl: profile.logoDarkUrl ?? '',
      sealLightUrl: profile.sealLightUrl ?? '',
      sealDarkUrl: profile.sealDarkUrl ?? '',
      showTenantName: profile.showTenantName,
    });
  }, [profile, reset]);

  const watchedSealLight = watch('sealLightUrl') ?? '';
  const watchedSealDark = watch('sealDarkUrl') ?? '';
  const watchedLogoLight = watch('logoLightUrl') ?? '';
  const watchedLogoDark = watch('logoDarkUrl') ?? '';
  const watchedShowName = watch('showTenantName');

  const onSubmit = async (values: BrandingFormValues) => {
    setServerError(null);
    setSuccess(null);

    try {
      const updated = await tenantSelfApi.updateBranding({
        logoLightUrl: nullable(values.logoLightUrl),
        logoDarkUrl: nullable(values.logoDarkUrl),
        sealLightUrl: nullable(values.sealLightUrl),
        sealDarkUrl: nullable(values.sealDarkUrl),
        showTenantName: values.showTenantName,
      });

      onUpdated(updated);
      setSuccess('Logo y sello actualizados correctamente.');
    } catch {
      setServerError('No fue posible guardar el branding. Intenta de nuevo.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo y Sello</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configura la identidad visual del tenant. Las imágenes deben estar publicadas en HTTPS.
          Formatos recomendados: SVG o PNG con fondo transparente.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">

          {/* Sello */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Sello (ícono compacto)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Proporción 1:1. Se usa en el menú lateral y próximamente como favicon y en documentos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <Input
                  id="sealLightUrl"
                  label="URL variante clara"
                  placeholder="https://cdn.tuempresa.co/seal-light.svg"
                  disabled={!canEdit}
                  error={errors.sealLightUrl?.message}
                  {...register('sealLightUrl')}
                />
                <ImagePreview url={watchedSealLight} label="Sello claro" />
              </div>
              <div>
                <Input
                  id="sealDarkUrl"
                  label="URL variante oscura"
                  placeholder="https://cdn.tuempresa.co/seal-dark.svg"
                  disabled={!canEdit}
                  error={errors.sealDarkUrl?.message}
                  {...register('sealDarkUrl')}
                />
                <ImagePreview url={watchedSealDark} label="Sello oscuro" />
              </div>
            </div>

            {/* Preview del sidebar */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
              <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Así quedaría en el menú lateral:
              </p>
              <div className="flex items-center gap-3 rounded-lg bg-iwana-primary px-3 py-2 w-fit">
                <TenantSeal
                  sealLightUrl={watchedSealLight || null}
                  sealDarkUrl={watchedSealDark || null}
                  name={profile.name}
                  size="sm"
                />
                {watchedShowName && (
                  <span className="text-sm font-bold text-white truncate max-w-[140px]">
                    {profile.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Logo horizontal */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Logo horizontal
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Proporción 3:1 a 5:1. Se usará próximamente en documentos y en la página de acceso del portal.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <Input
                  id="logoLightUrl"
                  label="URL variante clara"
                  placeholder="https://cdn.tuempresa.co/logo-light.svg"
                  disabled={!canEdit}
                  error={errors.logoLightUrl?.message}
                  {...register('logoLightUrl')}
                />
                <ImagePreview url={watchedLogoLight} label="Logo claro" />
              </div>
              <div>
                <Input
                  id="logoDarkUrl"
                  label="URL variante oscura"
                  placeholder="https://cdn.tuempresa.co/logo-dark.svg"
                  disabled={!canEdit}
                  error={errors.logoDarkUrl?.message}
                  {...register('logoDarkUrl')}
                />
                <ImagePreview url={watchedLogoDark} label="Logo oscuro" />
              </div>
            </div>
          </div>

          {/* Opciones de visualización */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary accent-iwana-primary disabled:cursor-not-allowed"
                {...register('showTenantName')}
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Mostrar nombre comercial junto al sello en el menú lateral
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Si se desactiva, el menú solo muestra el sello (o las iniciales) sin texto.
                </p>
              </div>
            </label>
          </div>

          {serverError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {serverError}
            </p>
          )}
          {success && !serverError && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              {success}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canEdit
                ? 'Solo se guardan URLs HTTPS válidas. Deja el campo vacío para eliminar una imagen.'
                : 'Tu rol puede consultar la configuración de branding, pero no modificarla.'}
            </p>
            {canEdit && (
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={isSubmitting || !isDirty}
              >
                Guardar logo y sello
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Añadir `BrandingForm` en `SettingsClient.tsx`**

Importar y añadir al final del bloque de formularios:

```tsx
import { BrandingForm } from './BrandingForm';

// En el JSX, después de <SecuritySettingsCard>:
<BrandingForm profile={profile} canEdit={canEdit} onUpdated={setProfile} />
```

**Step 4: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: exit 0.

**Step 5: Commit**

```bash
git add apps/portal/src/components/settings/BrandingForm.tsx apps/portal/src/components/settings/SettingsClient.tsx apps/portal/src/lib/api-client.ts
git commit -m "feat(portal): añadir BrandingForm con preview en tiempo real"
```

---

## Task 8: Test E2E del flujo de branding

**Files:**
- Modify: `e2e/tests/portal-settings-empresa.spec.ts`

**Contexto:** El patrón de mocks está en el archivo existente. Agregar el handler de `PATCH /tenants/me/branding` al router de mocks y un nuevo test.

**Step 1: Añadir handler en `setupSettingsMocks`**

En el bloque de `page.route`, después del handler de `PATCH /tenants/me/settings`, añadir:

```typescript
if (url.includes('/tenants/me/branding') && method === 'PATCH') {
  const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
  // Aplicar cambios al tenantProfile
  if ('sealLightUrl' in body) Object.assign(tenantProfile, { sealLightUrl: body.sealLightUrl });
  if ('sealDarkUrl' in body) Object.assign(tenantProfile, { sealDarkUrl: body.sealDarkUrl });
  if ('logoLightUrl' in body) Object.assign(tenantProfile, { logoLightUrl: body.logoLightUrl });
  if ('logoDarkUrl' in body) Object.assign(tenantProfile, { logoDarkUrl: body.logoDarkUrl });
  if ('showTenantName' in body) Object.assign(tenantProfile, { showTenantName: body.showTenantName });

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: tenantProfile }),
  });
  return;
}
```

También actualizar el fixture `tenantProfile` con los nuevos campos:

```typescript
const tenantProfile = {
  // ...campos existentes...
  logoLightUrl: null,
  logoDarkUrl: null,
  sealLightUrl: null,
  sealDarkUrl: null,
  showTenantName: true,
};
```

**Step 2: Añadir test**

```typescript
test('ADMIN puede guardar sello y desactivar nombre en sidebar', async ({ page }) => {
  await setupSettingsMocks(page, 'ADMIN');
  await setAuthSession(page, 'ADMIN');

  await page.goto('/dashboard/settings');
  await page.waitForLoadState('networkidle');

  // Scroll hasta la sección de branding
  await page.getByRole('heading', { name: 'Logo y Sello' }).scrollIntoViewIfNeeded();

  // Llenar URL del sello (variante clara)
  await page.getByLabel('URL variante clara').nth(0).fill('https://cdn.test-isp.co/seal.svg');

  // Desactivar nombre en sidebar
  await page.getByRole('checkbox', {
    name: /mostrar nombre comercial/i,
  }).uncheck();

  await page.getByRole('button', { name: 'Guardar logo y sello' }).click();

  await expect(page.getByText('Logo y sello actualizados correctamente.')).toBeVisible();
});
```

**Step 3: Ejecutar typecheck final**

```bash
pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal typecheck
```

Expected: ambos exit 0.

**Step 4: Ejecutar todos los tests backend**

```bash
pnpm --filter @iwana/api test
```

Expected: todos en verde.

**Step 5: Commit final**

```bash
git add e2e/tests/portal-settings-empresa.spec.ts
git commit -m "test(e2e): añadir test de branding en portal settings"
```

---

## Resumen de archivos modificados/creados

| Acción | Archivo |
|---|---|
| Modify | `packages/database/src/entities/tenant.entity.ts` |
| Create | `packages/database/src/migrations/public/AddTenantBrandingColumns.ts` |
| Modify | `apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts` |
| Modify | `apps/api/src/modules/tenant/dto/tenant-self.dto.ts` |
| Modify | `apps/api/src/modules/tenant/tenant.service.ts` |
| Modify | `apps/api/src/modules/tenant/tenant.controller.ts` |
| Modify | `apps/api/src/modules/tenant/tenant-self.spec.ts` |
| Modify | `apps/api/src/modules/tenant/tenant-settings.spec.ts` |
| Create | `apps/portal/src/components/layout/TenantSeal.tsx` |
| Modify | `apps/portal/src/components/layout/Sidebar.tsx` |
| Create | `apps/portal/src/components/settings/BrandingForm.tsx` |
| Modify | `apps/portal/src/components/settings/SettingsClient.tsx` |
| Modify | `apps/portal/src/lib/api-client.ts` |
| Modify | `e2e/tests/portal-settings-empresa.spec.ts` |
