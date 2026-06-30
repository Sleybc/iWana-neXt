# Web Platform Iwana Full-Stack Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinear toda la consola administrativa `apps/web` con la identidad iWana y cerrar las brechas full stack de shell, dashboard, empresas, usuarios, auditoria, perfil, settings, auth y search.

**Architecture:** La remediacion se ejecuta sobre el stack actual, sin reescribir la consola. Se consolidan primitivas compartidas en `apps/web`, se normalizan contratos API donde hoy hay asimetrias y se usa el backend existente como base para construir una portada y flujos mas operativos. Cuando falte un dato estructural, la solucion preferida es un facade o DTO dedicado, no logica heuristica duplicada en cliente.

**Tech Stack:** Next.js App Router · React · TypeScript estricto · `@iwana/ui` · NestJS · TypeORM · PostgreSQL multi-tenant por schema · Jest · Testing Library · Playwright · pnpm

**Informe base:** `docs/informes/INFORME-TRANSVERSAL-WEB-PLATAFORMA-AUDITORIA-UI-v1.0.md`  
**PRD/HLD de referencia:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`, `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`, `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`

---

## Mapa de archivos

| Area | Archivos a crear o modificar |
|---|---|
| Vocabulario y shared UI | `apps/web/src/lib/platform-ui-copy.ts` (create), `apps/web/src/components/shared/PlatformTenantPicker.tsx` (create), `apps/web/src/components/layout/Sidebar.tsx`, `TopHeader.tsx`, `PageHeader.tsx` |
| Dashboard y empresas | `apps/web/src/components/dashboard/DashboardClient.tsx`, `TenantsTable.tsx`, `SystemStatusPanel.tsx`, `apps/web/src/app/(protected)/tenants/page.tsx`, `apps/web/src/components/tenants/TenantCreateForm.tsx`, `TenantSettingsPageClient.tsx`, `apps/web/src/lib/api-client.ts` |
| Usuarios y auditoria | `apps/web/src/app/(protected)/users/page.tsx`, `apps/web/src/app/(protected)/audit-logs/page.tsx`, `apps/web/src/components/audit/AuditLogsTable.tsx`, `AuditSummary.tsx`, `apps/api/src/modules/audit/audit.controller.ts`, `platform-audit.controller.ts`, `audit-query.service.ts`, `apps/web/src/lib/api-client.ts` |
| Perfil, settings y auth | `apps/web/src/components/profile/ProfileForm.tsx`, `apps/web/src/app/(protected)/profile/page.tsx`, `apps/web/src/components/settings/PlatformBrandingSettings.tsx`, `SecuritySettings.tsx`, `apps/web/src/components/auth/PlatformLoginExperience.tsx`, `LoginForm.tsx`, `apps/web/src/app/auth/forgot-password/page.tsx` |
| Search y overview | `apps/web/src/components/search/GlobalSearch.tsx`, `GlobalSearchOverlay.tsx`, `useGlobalSearch.ts`, `apps/api/src/modules/search/search.controller.ts`, `search.service.ts` |
| Tests | `apps/web/src/components/search/GlobalSearch.spec.tsx`, `apps/web/src/components/dashboard/TenantsTable.spec.tsx`, `apps/web/src/components/profile/ProfileForm.spec.tsx`, `apps/web/src/app/(protected)/settings/page.spec.tsx`, `apps/api/src/modules/audit/*.spec.ts`, `apps/api/src/modules/search/*.spec.ts` |
| Documentacion | `docs/informes/INFORME-TRANSVERSAL-WEB-PLATAFORMA-AUDITORIA-UI-v1.0.md`, `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (si algun cambio impacta settings), `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md` (si se agrega facade/DTO nuevo) |

---

## Task 1: Consolidar vocabulario, shell y primitivas compartidas

**Files:**
- Create: `apps/web/src/lib/platform-ui-copy.ts`
- Create: `apps/web/src/components/shared/PlatformTenantPicker.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/layout/TopHeader.tsx`
- Modify: `apps/web/src/components/layout/PageHeader.tsx`
- Modify: `apps/web/src/app/(protected)/users/page.tsx`
- Modify: `apps/web/src/app/(protected)/audit-logs/page.tsx`

- [ ] **Step 1.1: Crear el diccionario visible de plataforma**

Crear `apps/web/src/lib/platform-ui-copy.ts` con un baseline como este:

```ts
export const PLATFORM_UI_COPY = {
  navigation: {
    home: 'Centro de control',
    tenants: 'Empresas',
    users: 'Usuarios internos',
    audit: 'Auditoria',
    settings: 'Plataforma',
    profile: 'Mi cuenta',
  },
  dashboard: {
    title: 'Centro de control',
    subtitle: 'Vista general de la operacion y gobierno de plataforma',
  },
} as const;
```

- [ ] **Step 1.2: Extraer el selector compartido de empresa**

Crear `apps/web/src/components/shared/PlatformTenantPicker.tsx` usando la logica duplicada actual de `UsersPage` y `AuditLogsPage`:

```tsx
export function PlatformTenantPicker(props: {
  tenants: TenantListItem[];
  value: string;
  onChange: (slug: string) => void;
  ariaLabel?: string;
}) {
  // mover aqui la logica open/openUpward/outside click/escape
}
```

Expected: `UsersPage` y `AuditLogsPage` dejan de declarar `function TenantSelect(...)` local.

- [ ] **Step 1.3: Reescribir labels del shell con el nuevo vocabulario**

Actualizar `Sidebar.tsx` y `TopHeader.tsx` para importar `PLATFORM_UI_COPY` y reemplazar labels visibles. Ejemplo:

```ts
{ href: '/dashboard', label: PLATFORM_UI_COPY.navigation.home, icon: LayoutDashboard }
```

- [ ] **Step 1.4: Normalizar la direccion visual del shell**

Aplicar estos criterios en `Sidebar.tsx` y `TopHeader.tsx`:

```tsx
// objetivo
// 1. menos gris neutro
// 2. superficies suaves iWana
// 3. estados activos mas claros
// 4. header menos generico y con search como pieza central
```

No agregar hex nuevos si ya existe token equivalente en `@iwana/ui` o `globals.css`.

- [ ] **Step 1.5: Sustituir el selector duplicado en usuarios y auditoria**

Reemplazar el bloque local `TenantSelect` en:

- `apps/web/src/app/(protected)/users/page.tsx`
- `apps/web/src/app/(protected)/audit-logs/page.tsx`

por:

```tsx
<PlatformTenantPicker
  tenants={tenants}
  value={tenantSlug}
  onChange={handleTenantChange}
  ariaLabel="Seleccionar empresa"
/>
```

- [ ] **Step 1.6: Verificar tipado del bloque base**

Run: `pnpm --filter @iwana/web typecheck`  
Expected: 0 errores nuevos en shell, users o audit.

- [ ] **Step 1.7: Commit**

```bash
git add apps/web/src/lib/platform-ui-copy.ts apps/web/src/components/shared/PlatformTenantPicker.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/TopHeader.tsx apps/web/src/components/layout/PageHeader.tsx apps/web/src/app/'(protected)'/users/page.tsx apps/web/src/app/'(protected)'/audit-logs/page.tsx
git commit -m "refactor(web): consolidate platform vocabulary and shared tenant picker"
```

---

## Task 2: Reconstruir la portada y el directorio de empresas sobre datos operativos reales

**Files:**
- Modify: `apps/web/src/components/dashboard/DashboardClient.tsx`
- Modify: `apps/web/src/components/dashboard/SystemStatusPanel.tsx`
- Modify: `apps/web/src/components/dashboard/TenantsTable.tsx`
- Modify: `apps/web/src/app/(protected)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(protected)/tenants/page.tsx`
- Modify: `apps/web/src/components/tenants/TenantCreateForm.tsx`
- Modify: `apps/web/src/components/tenants/TenantSettingsPageClient.tsx`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 2.1: Eliminar la promesa rota de la columna `Suscriptores`**

Actualizar `TenantsTable.tsx` para reemplazar la columna vacia por un dato soportado hoy, preferiblemente `Ultima actualizacion` o `Contacto principal`.

```tsx
// quitar
<th>Suscriptores</th>
<td>—</td>

// reemplazar por un dato real del DTO actual
```

- [ ] **Step 2.2: Convertir el dashboard en una home de plataforma**

Reescribir `DashboardClient.tsx` para que:

- use `PLATFORM_UI_COPY.dashboard.title`
- consuma `platformAuditApi.list({ limit: 10 })` para actividad reciente
- use un cliente `healthApi.get()` si el endpoint `/health` ya esta disponible
- deje de derivar la actividad reciente solo desde `tenant.updatedAt`

Snippet orientador:

```ts
const [health, setHealth] = useState<PlatformHealth | null>(null);
const [recentAudit, setRecentAudit] = useState<PlatformAuditLogEntry[]>([]);
```

- [ ] **Step 2.3: Exponer `healthApi` en el cliente web**

Agregar en `apps/web/src/lib/api-client.ts` un cliente pequeno:

```ts
export const healthApi = {
  get: () => request<{ status: 'ok'; timestamp?: string }>('/health'),
};
```

Si el endpoint devuelve otra forma, ajustar el tipo al contrato real del controller.

- [ ] **Step 2.4: Mejorar el create flow de empresa**

En `TenantCreateForm.tsx`, fortalecer tres puntos:

- microcopy mas operativo
- resumen lateral menos formulario y mas pre-flight
- transicion clara entre `PROVISIONING`, `ACTIVE` y `PROVISIONING_FAILED`

Patron objetivo:

```tsx
<TenantCreateSummary
  name={allValues.name ?? ''}
  slug={allValues.slug ?? ''}
  contactEmail={allValues.contactEmail ?? ''}
  provisioningStatus={provisioningStatus}
  sections={sectionCompleteness}
/>
```

pero con copy orientado a puesta en marcha, no solo completitud.

- [ ] **Step 2.5: Hacer coherente la pantalla de configuracion de empresa**

Actualizar `TenantSettingsPageClient.tsx` para que el subtitulo deje de ser solo `Empresa: X` y refleje accion operativa:

```tsx
subtitle={tenantName ? `Administra identidad, parametros y seguridad base de ${tenantName}` : 'Administra la empresa'}
```

- [ ] **Step 2.6: Verificar pruebas focalizadas del directorio**

Run: `pnpm --filter @iwana/web test src/components/dashboard/TenantsTable.spec.tsx --passWithNoTests`  
Expected: pruebas existentes verdes o actualizadas al nuevo contrato visible.

- [ ] **Step 2.7: Commit**

```bash
git add apps/web/src/components/dashboard/DashboardClient.tsx apps/web/src/components/dashboard/SystemStatusPanel.tsx apps/web/src/components/dashboard/TenantsTable.tsx apps/web/src/app/'(protected)'/dashboard/page.tsx apps/web/src/app/'(protected)'/tenants/page.tsx apps/web/src/components/tenants/TenantCreateForm.tsx apps/web/src/components/tenants/TenantSettingsPageClient.tsx apps/web/src/lib/api-client.ts
git commit -m "feat(web): rebuild platform home and tenant directory around real operational data"
```

---

## Task 3: Normalizar el contrato de auditoria y unificar experiencia de usuarios/auditoria

**Files:**
- Modify: `apps/api/src/modules/audit/audit.controller.ts`
- Modify: `apps/api/src/modules/audit/platform-audit.controller.ts`
- Modify: `apps/api/src/modules/audit/audit-query.service.ts`
- Create: `apps/api/src/modules/audit/dto/audit-list-response.dto.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/app/(protected)/audit-logs/page.tsx`
- Modify: `apps/web/src/app/(protected)/users/page.tsx`
- Modify: `apps/web/src/components/audit/AuditLogsTable.tsx`
- Modify: `apps/web/src/components/audit/AuditSummary.tsx`

- [ ] **Step 3.1: Crear un DTO unico de respuesta paginada para auditoria**

Crear `apps/api/src/modules/audit/dto/audit-list-response.dto.ts`:

```ts
export class AuditListResponseDto<TEntry> {
  data: TEntry[];
  nextCursor: string | null;
}
```

- [ ] **Step 3.2: Hacer que auditoria tenant y plataforma devuelvan la misma forma**

Actualizar ambos controllers para responder:

```ts
return {
  data: entries,
  nextCursor,
};
```

Expected: `platform-audit` y `audit-logs` comparten contrato de lectura.

- [ ] **Step 3.3: Adaptar `auditApi` del frontend**

En `apps/web/src/lib/api-client.ts`, migrar:

```ts
export const auditApi = {
  list: (...) => request<AuditLogEntry[]>(...)
}
```

a:

```ts
export const auditApi = {
  list: (...) =>
    request<{ data: AuditLogEntry[]; nextCursor: string | null }>(...)
}
```

- [ ] **Step 3.4: Simplificar `AuditLogsPage` con un solo modelo de tabla**

Refactorizar `useAuditTable` para que tenant y plataforma consuman el mismo shape:

```ts
type AuditListResult = { data: BaseAuditEntry[]; nextCursor: string | null | undefined };
```

Eliminar casts como `as unknown as BaseAuditEntry[]`.

- [ ] **Step 3.5: Reforzar el contexto operativo en usuarios**

Actualizar `UsersPage` para que el header y toolbar expresen claramente el contexto de empresa seleccionada:

```tsx
<PageHeader
  title="Usuarios internos"
  subtitle={tenantSlug ? `Gestiona acceso interno de ${selectedTenantName}` : 'Selecciona una empresa para continuar'}
/>
```

Agregar empty state cuando no haya empresa activa seleccionable.

- [ ] **Step 3.6: Ejecutar pruebas de backend y frontend del cambio de contrato**

Run:

```bash
pnpm --filter @iwana/api test -- audit
pnpm --filter @iwana/web typecheck
```

Expected:
- tests audit en verde
- sin errores nuevos en `api-client.ts` ni `AuditLogsPage`

- [ ] **Step 3.7: Commit**

```bash
git add apps/api/src/modules/audit apps/web/src/lib/api-client.ts apps/web/src/app/'(protected)'/audit-logs/page.tsx apps/web/src/app/'(protected)'/users/page.tsx apps/web/src/components/audit/AuditLogsTable.tsx apps/web/src/components/audit/AuditSummary.tsx
git commit -m "refactor(audit): normalize tenant and platform audit contracts and unify platform context flows"
```

---

## Task 4: Reordenar perfil, configuracion y branding como sistema de cuenta y plataforma

**Files:**
- Modify: `apps/web/src/app/(protected)/profile/page.tsx`
- Modify: `apps/web/src/components/profile/ProfileForm.tsx`
- Modify: `apps/web/src/app/(protected)/settings/page.tsx`
- Modify: `apps/web/src/components/settings/PlatformBrandingSettings.tsx`
- Modify: `apps/web/src/components/settings/SecuritySettings.tsx`
- Modify: `apps/web/src/components/profile/ProfileForm.spec.tsx`
- Modify: `apps/web/src/app/(protected)/settings/page.spec.tsx`

- [ ] **Step 4.1: Migrar `ProfileForm` a primitives del design system**

Reemplazar inputs nativos y hardcodes principales por `Input`, `Select`, `Alert` y tokens existentes.

Patron objetivo:

```tsx
<Input label="Nombres" {...register('firstName')} error={errors.firstName?.message} />
```

Eliminar clases como:

```ts
shadow-[0_4px_24px_rgba(0,0,0,0.06)]
rounded-[24px]
```

si ya existe equivalente semantico.

- [ ] **Step 4.2: Separar visualmente `Mi cuenta` de `Plataforma`**

En `profile/page.tsx` y `settings/page.tsx`, reforzar esta IA:

- `Mi cuenta` = datos propios, correo y contraseña del usuario de plataforma
- `Plataforma` = branding, seguridad global visible y parametros compartidos

Actualizar titulos/subtitulos para que no compitan entre si.

- [ ] **Step 4.3: Simplificar branding para administracion operativa**

En `PlatformBrandingSettings.tsx`, bajar exposicion tecnica:

- evitar mostrar rutas/directorios cuando no aporten
- mantener upload + preview + fallback
- mover inputs de URL directa a disclosure secundario realmente avanzado

Snippet orientador:

```tsx
<details>
  <summary>Opciones avanzadas de origen del activo</summary>
  <div className="mt-2 space-y-3">
    <Input label="URL del activo" {...register('logoUrl')} />
    <p className={FORM_HELP_CLASS}>Usa esta opcion solo si el archivo ya existe en una ruta aprobada.</p>
  </div>
</details>
```

pero con copy menos tecnico.

- [ ] **Step 4.4: Reutilizar el patron ya corregido en `SecuritySettings`**

No reabrir lo ya saneado; usar `SecuritySettings.tsx` como patron de:

- feedback accesible
- bloques internos consistentes
- CTA clara por accion

Solo ajustar copy y jerarquia si hace falta para el conjunto de `settings`.

- [ ] **Step 4.5: Actualizar pruebas de perfil y settings**

Run:

```bash
pnpm --filter @iwana/web test src/components/profile/ProfileForm.spec.tsx --passWithNoTests
pnpm --filter @iwana/web test "src/app/(protected)/settings/page.spec.tsx"
```

Expected: coverage focalizada verde tras la migracion de primitives.

- [ ] **Step 4.6: Commit**

```bash
git add apps/web/src/app/'(protected)'/profile/page.tsx apps/web/src/components/profile/ProfileForm.tsx apps/web/src/app/'(protected)'/settings/page.tsx apps/web/src/components/settings/PlatformBrandingSettings.tsx apps/web/src/components/settings/SecuritySettings.tsx apps/web/src/components/profile/ProfileForm.spec.tsx apps/web/src/app/'(protected)'/settings/page.spec.tsx
git commit -m "refactor(web): align profile and platform settings with iwana account system"
```

---

## Task 5: Sistematizar auth y buscador global

**Files:**
- Modify: `apps/web/src/components/auth/PlatformLoginExperience.tsx`
- Modify: `apps/web/src/components/auth/LoginForm.tsx`
- Modify: `apps/web/src/app/auth/forgot-password/page.tsx`
- Modify: `apps/web/src/components/search/GlobalSearch.tsx`
- Modify: `apps/web/src/components/search/GlobalSearchOverlay.tsx`
- Modify: `apps/web/src/components/search/useGlobalSearch.ts`
- Modify: `apps/api/src/modules/search/search.service.ts`
- Modify: `apps/api/src/modules/search/search.controller.ts`

- [ ] **Step 5.1: Extraer estilos repetidos del login a constantes mas sistemicas**

En `LoginForm.tsx`, agrupar clases por rol y reducir hardcodes visuales dispersos. Objetivo:

```ts
const authFieldClass =
  'h-14 w-full rounded-2xl border border-slate-200 bg-iwana-surface-soft pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-iwana-secondary-700/25 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';
const authPrimaryButtonClass =
  'mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-iwana-secondary px-5 text-lg font-bold text-iwana-primary transition-colors hover:bg-iwana-secondary-600 disabled:opacity-70';
```

pero apoyados en tokens iWana y no en multiples hex nuevos.

- [ ] **Step 5.2: Refinar el mensaje de recuperacion administrada**

Actualizar `auth/forgot-password/page.tsx` para que el flujo:

- explique que no existe autoservicio
- diga exactamente que debe hacer un admin
- mantenga tono de seguridad sin sonar bloqueante

- [ ] **Step 5.3: Convertir `GlobalSearch` en comando de navegacion**

Mejoras minimas:

- hint correcto para `Ctrl` y `Cmd`
- empty state con sugerencias de navegacion
- grupos mas claros en overlay
- selected state mas evidente

Ejemplo:

```tsx
const shortcutLabel = navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K';
```

- [ ] **Step 5.4: Enriquecer resultados desde el backend si falta contexto**

Si `search.service.ts` hoy devuelve items demasiado planos, extender el DTO para incluir:

```ts
{
  subtitle?: string;
  badge?: string;
}
```

Mantener el cambio aditivo y tipado extremo a extremo.

- [ ] **Step 5.5: Verificar login y search**

Run:

```bash
pnpm --filter @iwana/web test src/components/auth/PlatformLoginExperience.spec.tsx
pnpm --filter @iwana/web test src/components/search/GlobalSearch.spec.tsx
pnpm --filter @iwana/api test -- search
```

Expected: login/search en verde con el contrato actualizado.

- [ ] **Step 5.6: Commit**

```bash
git add apps/web/src/components/auth/PlatformLoginExperience.tsx apps/web/src/components/auth/LoginForm.tsx apps/web/src/app/auth/forgot-password/page.tsx apps/web/src/components/search/GlobalSearch.tsx apps/web/src/components/search/GlobalSearchOverlay.tsx apps/web/src/components/search/useGlobalSearch.ts apps/api/src/modules/search/search.service.ts apps/api/src/modules/search/search.controller.ts
git commit -m "feat(web): systematize auth surfaces and upgrade global search as platform command"
```

---

## Task 6: Cerrar verificacion full stack y documentacion viva

**Files:**
- Modify: `docs/informes/INFORME-TRANSVERSAL-WEB-PLATAFORMA-AUDITORIA-UI-v1.0.md`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (si se tocan settings de plataforma)
- Modify: `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md` (solo si se agrega facade/DTO/endpoint nuevo)

- [ ] **Step 6.1: Ejecutar typecheck y lint del paquete web**

Run:

```bash
pnpm --filter @iwana/web typecheck
pnpm --filter @iwana/web lint
```

Expected: 0 errores.

- [ ] **Step 6.2: Ejecutar pruebas focalizadas del backend afectado**

Run:

```bash
pnpm --filter @iwana/api test -- tenant
pnpm --filter @iwana/api test -- users
pnpm --filter @iwana/api test -- audit
pnpm --filter @iwana/api test -- platform-branding
pnpm --filter @iwana/api test -- platform-users
pnpm --filter @iwana/api test -- search
```

Expected: suites afectadas en verde.

- [ ] **Step 6.3: Ejecutar pruebas focalizadas del frontend afectado**

Run:

```bash
pnpm --filter @iwana/web test --passWithNoTests
```

Expected: unit tests del paquete web en verde.

- [ ] **Step 6.4: Ejecutar smoke E2E minimo de plataforma**

Run:

```bash
pnpm test:e2e
```

Si el workspace no tiene spec E2E de `apps/web` para home, tenants, users, audit y settings, crear al menos un smoke posterior a esta fase.

- [ ] **Step 6.5: Actualizar cierre documental**

Actualizar el informe transversal con:

- cambios realmente ejecutados
- decisiones tomadas
- riesgos que quedaron en backlog

Si se introdujo un contrato nuevo en audit o search, registrar el cambio en `HLD-MOD01-ARQUITECTURA-v1.0.md`.

- [ ] **Step 6.6: Commit**

```bash
git add docs/informes/INFORME-TRANSVERSAL-WEB-PLATAFORMA-AUDITORIA-UI-v1.0.md docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md
git commit -m "docs(web): close platform remediation with verification and traceability"
```

---

## Self-review vs auditoria

| Hallazgo base | Task que lo cubre | Estado |
|---|---|---|
| Shell generico y poco iWana | Task 1 | ✅ |
| Home no operativa | Task 2 | ✅ |
| Tabla de empresas con promesa rota | Task 2 | ✅ |
| Selector de empresa duplicado | Task 1 | ✅ |
| Contrato desigual de auditoria | Task 3 | ✅ |
| Perfil/settings fragmentados | Task 4 | ✅ |
| Auth y search no sistematizados | Task 5 | ✅ |
| Trazabilidad transversal insuficiente | Task 6 + informe | ✅ |
