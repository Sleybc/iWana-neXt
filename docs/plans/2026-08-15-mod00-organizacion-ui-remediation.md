# MOD00 Organización UI/UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corregir los hallazgos P1–P3 de `/dashboard/settings/organization` y cambiar el gate G6 de NO-GO a GO con UX iWana, accesibilidad WCAG AA, cobertura suficiente y evidencia visual autenticada.

**Architecture:** la remediación permanece en el portal y consume los contratos de Organización ya existentes; no añade endpoints, migraciones, paquetes ni tokens. El trabajo se ejecuta en carriles secuenciales de contrato UX/DS, pruebas RED, implementación FE y validación QA, con ownership exclusivo por archivo y cierre de AI-EM-ARCH.

**Tech Stack:** Next.js App Router, React 19, TypeScript estricto, React Hook Form, Zod, Tailwind CSS v4, `@iwana/ui`, Jest, Testing Library, Playwright, axe y pnpm.

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-08-15  
**Módulo:** MOD00 Configuración / Organización

---

## Fuentes rectoras

- `AGENTS.md`
- `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- `docs/adrs/ADR-043-Edicion-Atomica-Sede-Capacidades.md`
- `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/specs/2026-05-23-mod00-organization-site-modal-unificado-design.md`
- `docs/specs/2026-05-23-mod00-sedes-nodos-nms-design.md`
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## Alcance cerrado

### Entra

- Estados de carga, vacío, error, recuperación y permisos de Organización.
- Formulario unificado de sede, incluido el campo `country` ya soportado por el cliente tipado.
- Validación accesible entre tabs y error de submit dentro del modal.
- Tabla responsive, badges, contraste, foco y objetivos táctiles.
- Diálogo iWana para dar de baja una sede.
- Copy visible de esta pantalla.
- Pruebas unitarias, cobertura, E2E, axe y evidencia visual autenticada.
- Spec correctiva, prompt versionado e informe vivo.

### No entra

- Cambios en API, OpenAPI, PostgreSQL, migraciones, tenancy o permisos.
- Reactivación de sedes.
- Cambios en navegación global, `PageHeader` o subsecciones distintas de Organización.
- Cambios globales en `PortalDataTableShell` o primitivas de `@iwana/ui`.
- Rediseño de horarios, asignaciones, responsables o consumidores WFM/NMS.

## Protocolo multiagente

| Fase | Responsable | Ownership exclusivo | Revisor / gate |
| --- | --- | --- | --- |
| Contrato | AI-PROD-UX | Spec UX y copy | AI-DS-OWNER + AI-EM-ARCH |
| Prompt | AI-EM-ARCH | Prompt correctivo | AI-EM-ARCH |
| Pruebas RED | AI-SR-QA | Specs Jest/E2E | AI-FE-PLATFORM consume el contrato |
| Implementación | AI-FE-PLATFORM | Componentes portal y labels | AI-DS-OWNER |
| Validación | AI-SR-QA | Cobertura, E2E, axe, capturas | AI-EM-ARCH |
| Cierre | AI-EM-ARCH | Informe vivo, gates y commits | — |

Reglas de coordinación:

1. Ningún agente modifica un archivo propiedad de otro agente mientras su fase esté activa.
2. AI-DS-OWNER revisa y emite veredicto; no escribe componentes.
3. AI-SR-FULL solo confirma por escrito que `country` ya existe en `OrganizationSiteDetail`, `CreateOrganizationSiteDto` y `UpdateOrganizationSiteDto`; no cambia backend.
4. Los agentes no hacen commits concurrentes. AI-EM-ARCH integra y crea un commit al cerrar cada checkpoint verde.
5. No se avanza de pruebas RED a implementación hasta que AI-SR-QA publique los nombres de casos y el fallo esperado.

## Mapa de archivos

### Crear

- `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md` — contrato UX/copy/estados.
- `docs/prompts/PROMPT-MOD00-ORGANIZACION-REMEDIACION-UI-v1.0.md` — encargo versionado de ejecución.
- `apps/portal/src/components/settings/organization-settings-options.ts` — opciones regionales reutilizables y compatibilidad de país.
- `e2e/tests/portal-settings-organization-ui.spec.ts` — matriz visual, responsive y accesibilidad.

### Modificar

- `apps/portal/src/components/settings/OrganizationSettingsClient.tsx` — estado, modal, tabla, permisos y baja.
- `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx` — contrato funcional y accesible.
- `apps/portal/src/components/settings/CompanyProfileForm.tsx` y su spec — copy y superficie Firma.
- `apps/portal/src/components/settings/OperationalSettingsForm.tsx` y su spec — copy, contraste, opciones y superficie Firma.
- `apps/portal/src/components/settings/mod00-settings-labels.ts` — vocabulario aprobado.
- `e2e/tests/portal-settings-organization-access.spec.ts` — flujo funcional y selector del hub.
- `e2e/tests/portal-settings-empresa.spec.ts` — navegación federada vigente.
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` — evidencia y gate final.

---

### Task 1: Congelar el contrato UX/DS y el prompt correctivo

**Responsable:** AI-PROD-UX, seguido por AI-DS-OWNER y AI-EM-ARCH.

**Files:**
- Create: `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`
- Create: `docs/prompts/PROMPT-MOD00-ORGANIZACION-REMEDIACION-UI-v1.0.md`

- [ ] **Step 1: Escribir la spec correctiva con los estados cerrados**

La spec debe fijar literalmente esta matriz:

```markdown
| Estado | Superficie | Copy / acción |
| --- | --- | --- |
| Carga inicial | Skeleton de dos paneles y tabla | `Cargando información de la empresa y sus sedes.` |
| Actualización | Contenido conservado con `aria-busy=true` | Sin reemplazar por vacío |
| Vacío editable | `PortalEmptyState` | `Aún no hay sedes registradas. Crea la primera para organizar la operación de tu empresa.` + `Crear primera sede` |
| Vacío solo lectura | `PortalEmptyState` | `Aún no hay sedes registradas. Una persona administradora puede crear la primera.` |
| Solo lectura | Aviso informativo | `Puedes consultar las sedes, pero no modificarlas.` |
| Permiso denegado | `PortalAlert` controlado | `No tienes permisos para consultar las sedes.` |
| Permisos no disponibles | `PortalAlert` + reintento | `No pudimos confirmar tus permisos para gestionar sedes.` |
| Error de listado | `PortalAlert` + reintento | `No pudimos cargar las sedes. Intenta nuevamente.` |
| Error de submit | `PortalAlert` dentro del diálogo | Conservar datos y foco dentro del diálogo |
```

La misma spec debe congelar este copy:

```markdown
- Page subtitle: `Revisa los datos de tu empresa, sus preferencias regionales y las sedes registradas.`
- Panel: `Preferencias regionales`.
- Panel description: `Zona horaria, país, idioma y moneda usados en el portal.`
- Form group: `Ubicación y contacto del sitio`.
- Form help: `Completa estos datos para ubicar la sede y dejar un contacto operativo local.`
- Services help: `Selecciona los servicios que opera esta sede.`
- Services count: `{seleccionados} de {total} servicios seleccionados`.
- Empty services: `Aún no has seleccionado servicios para esta sede.`
- Company field: `Dígito de verificación (DV)`.
- Company field: `País de registro`.
```

- [ ] **Step 2: Congelar el contrato visual sin nuevos tokens**

AI-DS-OWNER añade a la spec este contrato:

```markdown
- CTA principal: `Button size="lg"`.
- Reintentos: `Button variant="link"` con `min-h-11`.
- Acciones de fila: `Button size="sm"` con `min-h-11`.
- Selecciones: `CheckboxCard`.
- Estado activo: `Badge variant="success"`.
- Estado inactivo y servicios: `Badge variant="neutral"`.
- Encabezados de tabla: `PortalDataTableHead`.
- Contraste secundario: `text-gray-500 dark:text-gray-400`.
- Error: `text-red-600 dark:text-red-400`.
- Superficies: `shadow-iwana-card` o `PortalPanel`.
- Eyebrows: `portal-eyebrow` o `portal-eyebrow-muted`.
- Tabla móvil: scroll horizontal local; no cambiar el shell global.
```

- [ ] **Step 3: Crear el prompt de ejecución desde la plantilla oficial**

El prompt debe declarar:

```markdown
# PROMPT MOD00 Organización — Remediación UI

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
**PRD:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**ADR:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**Spec:** `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`
**Plan:** `docs/plans/2026-08-15-mod00-organizacion-ui-remediation.md`
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

Ejecutar exclusivamente la remediación UI/UX de `/dashboard/settings/organization`.
No crear endpoints, migraciones, tokens, paquetes ni cambios globales del design system.
Aplicar TDD, cobertura >=80 % en las cuatro métricas, E2E autenticado y axe A/AA.
```

- [ ] **Step 4: Validar gobernanza documental**

Run:

```powershell
pnpm audit:doc-locations
pnpm audit:adr-citations
```

Expected: ambos comandos terminan con exit code 0.

- [ ] **Step 5: Checkpoint de integración**

AI-EM-ARCH revisa que spec y prompt no contradigan ADR-040 ni las dos specs aprobadas. Después integra:

```powershell
git add docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md docs/prompts/PROMPT-MOD00-ORGANIZACION-REMEDIACION-UI-v1.0.md
git commit -m "docs: define organization ui remediation contract"
```

---

### Task 2: Escribir las pruebas RED de estados, permisos y errores

**Responsable:** AI-SR-QA.

**Files:**
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`

- [ ] **Step 1: Añadir la prueba que impide el falso vacío durante carga**

Usar una promesa diferida para `organizationApi.list()`:

```tsx
it('keeps the sites skeleton visible until the initial list request settles', async () => {
  const { organizationApi } = jest.requireMock('@/lib/api-client') as {
    organizationApi: { list: jest.Mock };
  };
  let resolveList!: (value: unknown) => void;
  organizationApi.list.mockReturnValue(new Promise((resolve) => (resolveList = resolve)));

  render(<OrganizationSettingsClient />);

  expect(await screen.findByRole('status', { name: 'Cargando sedes' })).toBeInTheDocument();
  expect(screen.queryByText('Aún no hay sedes registradas.')).not.toBeInTheDocument();

  resolveList({
    data: [],
    meta: emptyPageListMeta({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasMore: false,
    }),
  });
  expect(await screen.findByText(/Aún no hay sedes registradas/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Añadir pruebas para permisos diferenciados**

```tsx
it('omits the complete actions column for an admin with read-only permissions', async () => {
  const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
    accessControlApi: { getMyEffectivePermissions: jest.Mock };
  };
  accessControlApi.getMyEffectivePermissions.mockResolvedValue({
    userId: 'user-1',
    role: UserRole.ADMIN,
    effectivePermissions: [AccessPermissionKey.ORGANIZATION_SITES_READ],
    recoveryPermissions: [],
    profileSources: [],
  });

  render(<OrganizationSettingsClient />);

  expect(await screen.findByText('Sede centro')).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
  expect(screen.getByText('Puedes consultar las sedes, pero no modificarlas.')).toBeInTheDocument();
});

it('shows a recoverable state when effective permissions cannot be loaded', async () => {
  const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
    accessControlApi: { getMyEffectivePermissions: jest.Mock };
  };
  accessControlApi.getMyEffectivePermissions.mockRejectedValue(new Error('internal permissions'));

  render(<OrganizationSettingsClient />);

  expect(await screen.findByText('No pudimos confirmar tus permisos para gestionar sedes.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reintentar permisos' })).toBeVisible();
  expect(screen.queryByText('internal permissions')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Añadir pruebas de sanitización y error localizado en el modal**

```tsx
it('never exposes an internal API message when site loading fails', async () => {
  const { ApiError, organizationApi } = jest.requireMock('@/lib/api-client') as {
    ApiError: new (status: number, message: string) => Error;
    organizationApi: { list: jest.Mock };
  };
  organizationApi.list.mockRejectedValue(new ApiError(500, 'relation tenant_42.organization_sites missing'));

  render(<OrganizationSettingsClient />);

  expect(await screen.findByText('No pudimos cargar las sedes. Intenta nuevamente.')).toBeInTheDocument();
  expect(screen.queryByText(/tenant_42|organization_sites/i)).not.toBeInTheDocument();
});

it('keeps a controlled save error inside the open site dialog', async () => {
  const { organizationApi } = jest.requireMock('@/lib/api-client') as {
    organizationApi: { create: jest.Mock };
  };
  organizationApi.create.mockRejectedValue(new Error('database payload'));

  render(<OrganizationSettingsClient />);
  fireEvent.click(await screen.findByRole('button', { name: 'Crear sede' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Nombre'), { target: { value: 'Sede norte' } });
  fireEvent.change(dialog.getByLabelText('Código'), { target: { value: 'NORTE' } });
  fireEvent.change(dialog.getByLabelText('Coordenadas'), {
    target: { value: '4.7110, -74.0721' },
  });
  fireEvent.change(dialog.getByLabelText('Nombre de contacto'), {
    target: { value: 'Contacto operativo' },
  });
  fireEvent.change(dialog.getByLabelText('Teléfono de contacto'), {
    target: { value: '+573001112233' },
  });
  fireEvent.click(dialog.getByRole('button', { name: 'Crear sede' }));

  expect(await dialog.findByText('No pudimos crear la sede. Revisa la información e intenta nuevamente.')).toBeVisible();
  expect(dialog.queryByText('database payload')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Ejecutar y publicar el RED esperado**

Run:

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/OrganizationSettingsClient.spec.tsx --runInBand
```

Expected: FAIL únicamente por ausencia del nuevo skeleton, estado de permisos, columna condicional y error dentro del diálogo.

---

### Task 3: Implementar el modelo de estado y la sanitización

**Responsable:** AI-FE-PLATFORM.

**Files:**
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`

- [ ] **Step 1: Sustituir estados ambiguos por estados independientes**

Agregar:

```tsx
type PermissionsState = 'loading' | 'granted' | 'read-only' | 'denied' | 'unavailable';

const [permissionsState, setPermissionsState] = useState<PermissionsState>('loading');
const [isSitesInitialLoading, setIsSitesInitialLoading] = useState(true);
const [siteDialogError, setSiteDialogError] = useState<string | null>(null);
```

En `loadSites()`, marcar la primera petición y no limpiar contenido durante refresh:

```tsx
const initialLoad = !hasLoadedSitesOnceRef.current;
if (initialLoad) setIsSitesInitialLoading(true);
if (!initialLoad) setIsSitesRefreshing(true);

try {
  const response = await organizationApi.list({ page: sitesPage, limit: sitesPageSize });
  setSites(response.data);
  hasLoadedSitesOnceRef.current = true;
} catch (loadError) {
  if (initialLoad) setSites([]);
  setSitesError(mapSitesError(loadError));
} finally {
  setIsSitesInitialLoading(false);
  setIsSitesRefreshing(false);
}
```

- [ ] **Step 2: Mapear permisos sin convertir fallos en autorización**

En `loadOrganization()` resolver:

```tsx
if (permissionsResult.status === 'rejected') {
  setPermissionsState('unavailable');
  setHasManageSitesPermission(false);
} else if (!permissionsResult.value?.effectivePermissions.includes(
  AccessPermissionKey.ORGANIZATION_SITES_READ,
)) {
  setPermissionsState('denied');
  setCanReadSites(false);
} else if (!permissionsResult.value.effectivePermissions.includes(
  AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
)) {
  setPermissionsState('read-only');
  setCanReadSites(true);
} else {
  setPermissionsState('granted');
  setCanReadSites(true);
  setHasManageSitesPermission(true);
}
```

Un estado `unavailable` permite cargar sedes en lectura, pero no habilita mutaciones.

- [ ] **Step 3: Sanitizar todos los errores visibles**

Reemplazar retornos de `error.message` por copy controlado:

```tsx
function mapOrganizationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Tu sesión expiró. Inicia sesión nuevamente.';
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permisos para consultar esta sección.';
  }
  return 'No pudimos cargar la información de la empresa. Intenta nuevamente.';
}

function mapSitesError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permisos para consultar las sedes.';
  }
  return 'No pudimos cargar las sedes. Intenta nuevamente.';
}

function mapSiteSubmitError(editing: boolean, error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Ya existe una sede con ese código. Usa uno diferente.';
  }
  return editing
    ? 'No pudimos actualizar la sede. Revisa la información e intenta nuevamente.'
    : 'No pudimos crear la sede. Revisa la información e intenta nuevamente.';
}
```

- [ ] **Step 4: Usar primitivas accesibles en carga y recuperación**

Renderizar carga inicial:

```tsx
<div role="status" aria-live="polite" aria-label="Cargando sedes" className="space-y-4">
  <span className="sr-only">Cargando información de la empresa y sus sedes.</span>
  <PortalSkeletonBlock className="h-14" />
  <PortalSkeletonBlock className="h-56" />
</div>
```

Usar `Button` para reintentos:

```tsx
<Button type="button" variant="link" size="lg" onClick={() => void loadSites()}>
  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
  Reintentar sedes
</Button>
```

- [ ] **Step 5: Ejecutar la suite hasta GREEN**

Run:

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/OrganizationSettingsClient.spec.tsx --runInBand
```

Expected: los casos de Task 2 pasan y no se rompe la suite previa.

- [ ] **Step 6: Checkpoint de integración**

```powershell
git add apps/portal/src/components/settings/OrganizationSettingsClient.tsx apps/portal/src/components/settings/mod00-settings-labels.ts apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx
git commit -m "fix: harden organization settings states and errors"
```

---

### Task 4: Corregir el formulario, país y validación entre tabs

**Responsables:** AI-SR-QA escribe RED; AI-FE-PLATFORM implementa.

**Files:**
- Create: `apps/portal/src/components/settings/organization-settings-options.ts`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`

- [ ] **Step 1: Añadir pruebas RED para país, errores accesibles y foco**

```tsx
it('hydrates country and sends it in the unified site payload', async () => {
  const { organizationApi } = jest.requireMock('@/lib/api-client') as {
    organizationApi: { get: jest.Mock; update: jest.Mock };
  };
  organizationApi.get.mockResolvedValue(organizationDetail);

  render(<OrganizationSettingsClient />);
  fireEvent.click(await screen.findByRole('button', { name: /Editar sede Sede centro/i }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByLabelText('País')).toHaveValue('CO');
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }));

  await waitFor(() => {
    expect(organizationApi.update).toHaveBeenCalledWith(
      'site-1',
      expect.objectContaining({ country: 'CO' }),
    );
  });
});

it('returns to information and focuses the first invalid field from services', async () => {
  render(<OrganizationSettingsClient />);
  fireEvent.click(await screen.findByRole('button', { name: 'Crear sede' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('tab', { name: 'Servicios' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Crear sede' }));

  expect(await dialog.findByRole('tab', { name: 'Información de la sede', selected: true })).toBeVisible();
  expect(dialog.getByLabelText('Nombre')).toHaveFocus();
  expect(dialog.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
});
```

- [ ] **Step 2: Crear el catálogo regional reutilizable**

```ts
import type { SelectOption } from '@iwana/ui';

export const ORGANIZATION_COUNTRY_OPTIONS: SelectOption[] = [
  { value: 'CO', label: 'Colombia' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'MX', label: 'México' },
  { value: 'PE', label: 'Perú' },
  { value: 'US', label: 'Estados Unidos' },
];

export function countryOptionsWithCurrent(value?: string | null): SelectOption[] {
  const current = value?.trim().toUpperCase();
  if (!current || ORGANIZATION_COUNTRY_OPTIONS.some((option) => option.value === current)) {
    return ORGANIZATION_COUNTRY_OPTIONS;
  }
  return [...ORGANIZATION_COUNTRY_OPTIONS, { value: current, label: current }];
}
```

- [ ] **Step 3: Añadir `country` al formulario y al payload**

```tsx
const siteFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(160, 'Máximo 160 caracteres.'),
  code: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(40, 'Máximo 40 caracteres.')
    .regex(/^[A-Z0-9_-]+$/u, 'Usa mayúsculas, números, guion o guion bajo.'),
  siteType: z.nativeEnum(OrganizationSiteType),
  address: z.string().trim().max(240, 'Máximo 240 caracteres.').optional(),
  municipality: z.string().trim().max(120, 'Máximo 120 caracteres.').optional(),
  department: z.string().trim().max(120, 'Máximo 120 caracteres.').optional(),
  country: z.string().trim().length(2, 'Selecciona el país de la sede.'),
  coordinates: z.string().trim().min(1, 'Las coordenadas son requeridas.')
    .refine((value) => parseCoordinatePair(value) !== null,
      'Usa el formato "latitud, longitud" o "latitud; longitud" si usas coma decimal.'),
  contactName: z.string().trim().min(1, 'El nombre de contacto es requerido.').max(160),
  contactPhone: z.string().trim().min(1, 'El teléfono de contacto es requerido.').max(32),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});

function createDefaultSiteFormValues(country = 'CO'): SiteFormValues {
  return {
    name: '',
    code: '',
    siteType: OrganizationSiteType.OFFICE,
    address: '',
    municipality: '',
    department: '',
    country,
    coordinates: '',
    contactName: '',
    contactPhone: '',
    isPrimary: false,
    isActive: true,
  };
}

function toSiteFormValues(site: OrganizationSiteDetail): SiteFormValues {
  return {
    name: site.name,
    code: site.code,
    siteType: site.siteType,
    address: site.address ?? '',
    municipality: site.municipality ?? '',
    department: site.department ?? '',
    country: site.country,
    coordinates: formatCoordinatePair(site.latitude, site.longitude),
    contactName: site.contactName ?? '',
    contactPhone: site.contactPhone ?? '',
    isPrimary: site.isPrimary,
    isActive: site.isActive,
  };
}
```

El payload debe incluir:

```tsx
country: values.country.trim().toUpperCase(),
```

Al crear, usar `profile?.countryCode ?? settings?.country ?? 'CO'` como default.

- [ ] **Step 4: Usar las APIs de error de `Input` y `Select`**

Ejemplo obligatorio para cada campo:

```tsx
<Input
  id="site-name"
  label="Nombre"
  required
  requiredIndicator
  error={errors.name?.message}
  {...register('name')}
/>

<Controller
  name="country"
  control={control}
  render={({ field }) => (
    <Select
      id="site-country"
      label="País"
      required
      options={countryOptionsWithCurrent(field.value)}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      onBlur={field.onBlur}
      ref={field.ref}
      error={errors.country?.message}
    />
  )}
/>
```

Eliminar los `<label>` y `<p>` de error duplicados que rodean estas primitivas.

- [ ] **Step 5: Cambiar al tab correcto y enfocar el primer error**

Desestructurar `setFocus` y usar un invalid handler:

```tsx
const {
  control,
  register,
  handleSubmit,
  reset,
  setError: setFieldError,
  setFocus,
  formState: { errors },
} = useForm<SiteFormValues>({
  resolver: zodResolver(siteFormSchema),
  defaultValues: createDefaultSiteFormValues(),
});

const onInvalid: SubmitErrorHandler<SiteFormValues> = (formErrors) => {
  setDialogTab('informacion');
  const firstField = ['name', 'code', 'siteType', 'country', 'coordinates', 'contactName', 'contactPhone']
    .find((field) => formErrors[field as keyof SiteFormValues]);
  if (firstField) requestAnimationFrame(() => setFocus(firstField as keyof SiteFormValues));
};

<form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
```

- [ ] **Step 6: Agrupar el contenido y reemplazar checkboxes locales**

Usar encabezados `Datos básicos`, `Ubicación y contacto del sitio` y `Estado de la sede`. Reemplazar selecciones booleanas y capacidades por:

```tsx
<CheckboxCard
  label="Marcar como sede principal"
  description="Identifica esta sede como referencia principal de la empresa."
  {...register('isPrimary')}
/>
```

En Servicios mostrar:

```tsx
<Badge variant="neutral">
  {draftCapabilities.length} de {capabilityOptions.length} servicios seleccionados
</Badge>
{draftCapabilities.length === 0 ? (
  <p className="text-sm text-gray-500 dark:text-gray-400">
    Aún no has seleccionado servicios para esta sede.
  </p>
) : null}
```

- [ ] **Step 7: Renderizar el error de submit dentro del diálogo**

```tsx
{siteDialogError ? (
  <PortalAlert
    variant="error"
    live="assertive"
    title="No fue posible guardar la sede"
    description={siteDialogError}
  />
) : null}
```

Limpiar `siteDialogError` al abrir/cerrar, no al perder el foco. Un request fallido no cierra el diálogo ni resetea el formulario.

- [ ] **Step 8: Ejecutar la suite y typecheck**

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/OrganizationSettingsClient.spec.tsx --runInBand
pnpm --filter @iwana/portal typecheck
```

Expected: PASS.

- [ ] **Step 9: Checkpoint de integración**

```powershell
git add apps/portal/src/components/settings/organization-settings-options.ts apps/portal/src/components/settings/OrganizationSettingsClient.tsx apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx
git commit -m "fix: make organization site form accessible"
```

---

### Task 5: Aplicar el contrato visual, responsive y diálogo de baja

**Responsable:** AI-FE-PLATFORM. **Revisor:** AI-DS-OWNER.

**Files:**
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/CompanyProfileForm.tsx`
- Modify: `apps/portal/src/components/settings/OperationalSettingsForm.tsx`
- Modify: specs de esos tres componentes

- [ ] **Step 1: Escribir pruebas RED para tabla y baja**

```tsx
it('uses semantic badges and only offers deactivation for active sites', async () => {
  render(<OrganizationSettingsClient />);
  expect(await screen.findByText('Sede centro')).toBeInTheDocument();
  expect(screen.getByText('Activa')).toHaveClass('text-success-700');
  expect(screen.getByText('Gestión administrativa')).toHaveClass('text-gray-600');
});

it('confirms site deactivation in an iWana dialog', async () => {
  const { organizationApi } = jest.requireMock('@/lib/api-client') as {
    organizationApi: { delete: jest.Mock };
  };
  render(<OrganizationSettingsClient />);
  fireEvent.click(await screen.findByRole('button', { name: /Dar de baja sede Sede centro/i }));

  const dialog = within(screen.getByRole('dialog', { name: '¿Dar de baja «Sede centro»?' }));
  expect(dialog.getByText(/información histórica se conservará/)).toBeVisible();
  fireEvent.click(dialog.getByRole('button', { name: 'Dar de baja' }));

  await waitFor(() => expect(organizationApi.delete).toHaveBeenCalledWith('site-1'));
});
```

- [ ] **Step 2: Adoptar las primitivas de tabla y badges**

Importar `Badge`, `PortalDataTableHead` y las clases compartidas. La estructura debe quedar:

```tsx
<thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
  <tr>
    <PortalDataTableHead>Sede</PortalDataTableHead>
    <PortalDataTableHead>Tipo</PortalDataTableHead>
    <PortalDataTableHead>Ubicación</PortalDataTableHead>
    <PortalDataTableHead>Servicios</PortalDataTableHead>
    <PortalDataTableHead>Estado</PortalDataTableHead>
    {canManageSites ? <PortalDataTableHead>Acciones</PortalDataTableHead> : null}
  </tr>
</thead>
```

El `<table>` existente queda envuelto por `<div className="overflow-x-auto">`, recibe
`className="min-w-[56rem] divide-y divide-gray-200 dark:divide-dark-border"`, y su shell
recibe `aria-busy={isSitesRefreshing}`. El `tbody` adopta `portalDataTableBodyClassName`
y sus celdas `portalDataTableCellClassName`; el pager conserva su posición actual.

Servicios y estado:

```tsx
<Badge variant="neutral">{getOrganizationSiteCapabilityLabel(capability)}</Badge>
<Badge variant={site.isActive ? 'success' : 'neutral'}>
  {site.isActive ? 'Activa' : 'Inactiva'}
</Badge>
```

- [ ] **Step 3: Corregir objetivos táctiles y foco**

```tsx
<Button type="button" size="lg" onClick={openCreateDialog}>
  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
  Crear sede
</Button>

<Button
  type="button"
  variant="secondary"
  size="sm"
  className="min-h-11"
  onClick={() => void openEditDialog(site.id)}
>
  Editar sede
</Button>
```

Todos los reintentos usan `Button`; no queda ningún `<button>` local para recuperación.

- [ ] **Step 4: Sustituir `window.confirm` por `Dialog`**

Agregar `sitePendingDeactivation` y `isDeactivating`. Solo asignar una sede activa:

```tsx
{site.isActive ? (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="min-h-11"
    onClick={() => setSitePendingDeactivation(site)}
  >
    Dar de baja sede<span className="sr-only"> {site.name}</span>
  </Button>
) : null}
```

El diálogo usa el copy congelado y llama `organizationApi.delete(site.id)` solo al confirmar.

- [ ] **Step 5: Corregir superficies, contraste y eyebrows**

Aplicar exactamente:

```tsx
// CompanyProfileForm y OperationalSettingsForm
className="shadow-iwana-card"

// Eyebrows
className="portal-eyebrow"

// Texto secundario
className="text-gray-500 dark:text-gray-400"

// Error
className="text-red-600 dark:text-red-400"
```

Cambiar copy visible:

```ts
pageSubtitle: 'Revisa los datos de tu empresa, sus preferencias regionales y las sedes registradas.',
operationalTitle: 'Preferencias regionales',
operationalDescription: 'Zona horaria, país, idioma y moneda usados en el portal.',
```

En Company Profile usar `Dígito de verificación (DV)` y `País de registro`. Corregir todas las variantes `Minimo`/`Maximo`.

- [ ] **Step 6: Ejecutar validaciones focalizadas**

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/OrganizationSettingsClient.spec.tsx src/components/settings/CompanyProfileForm.spec.tsx src/components/settings/OperationalSettingsForm.spec.tsx --runInBand
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
```

Expected: PASS sin warnings nuevos.

- [ ] **Step 7: Revisión DS y checkpoint**

AI-DS-OWNER ejecuta la auditoría mecánica y revisa el diff. No aprueba si quedan `shadow-sm`, badges locales, `text-gray-400` en light, `text-red-600` sin dark override o targets menores de 44 px.

```powershell
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/settings/OrganizationSettingsClient.tsx apps/portal/src/components/settings/CompanyProfileForm.tsx apps/portal/src/components/settings/OperationalSettingsForm.tsx
```

Expected: 0 hallazgos deterministas y 0 heurísticos en el alcance.

```powershell
git add apps/portal/src/components/settings/OrganizationSettingsClient.tsx apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx apps/portal/src/components/settings/CompanyProfileForm.tsx apps/portal/src/components/settings/CompanyProfileForm.spec.tsx apps/portal/src/components/settings/OperationalSettingsForm.tsx apps/portal/src/components/settings/OperationalSettingsForm.spec.tsx apps/portal/src/components/settings/mod00-settings-labels.ts
git commit -m "fix: align organization settings with iwana ui"
```

---

### Task 6: Cerrar cobertura, E2E, axe y evidencia visual

**Responsable:** AI-SR-QA.

**Files:**
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`
- Modify: `e2e/tests/portal-settings-organization-access.spec.ts`
- Modify: `e2e/tests/portal-settings-empresa.spec.ts`
- Create: `e2e/tests/portal-settings-organization-ui.spec.ts`

- [ ] **Step 1: Corregir fixtures y navegación obsoleta**

En los registries E2E usar:

```ts
{
  key: 'access',
  label: 'Perfiles y autenticación',
  description: 'Administra perfiles de acceso y políticas de autenticación.',
  route: '/dashboard/settings/access',
}
```

La navegación del hub debe ser:

```ts
await page.goto('/dashboard/settings');
await page.getByRole('link', { name: /Perfiles y autenticación/i }).click();
await expect(page).toHaveURL(/\/dashboard\/settings\/access$/);
```

No usar el link global `Usuarios y accesos`, cuyo destino correcto es `/dashboard/users`.

- [ ] **Step 2: Completar cobertura unitaria por comportamiento**

Agregar casos para:

```text
- loading inicial y refresh silencioso
- NONE de sedes editable y read-only
- permisos denied, unavailable y read-only
- errores 401, 403, 409 y 500 sanitizados
- país default, hidratado y enviado
- invalid submit desde Servicios
- error de submit preservando valores
- contador 0/N y N/N
- sede inactiva sin acción de baja
- confirmación y cancelación de baja
- columna Acciones condicional
- reintentos de organización, permisos y sedes
```

Ejecutar cobertura focalizada:

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/OrganizationSettingsClient.spec.tsx src/components/settings/CompanyProfileForm.spec.tsx src/components/settings/OperationalSettingsForm.spec.tsx --runInBand --coverage --collectCoverageFrom="src/components/settings/{OrganizationSettingsClient,CompanyProfileForm,OperationalSettingsForm}.tsx"
```

Expected: líneas, ramas, funciones y statements >=80 % para el conjunto y ningún archivo crítico por debajo de 80 % en líneas.

- [ ] **Step 3: Implementar la matriz E2E de Organización**

`portal-settings-organization-ui.spec.ts` debe mockear sesión tenant ADMIN, perfil, settings,
permisos y endpoints de sedes. La implementación queda cerrada por esta matriz:

| Test | Acción | Aserciones obligatorias |
| --- | --- | --- |
| Admin CRUD | Crear, editar y dar de baja desde el modal | POST/PATCH incluyen `country` y `capabilities`; DELETE ocurre solo después del diálogo; la tabla se refresca |
| Solo lectura | Cargar con `ORGANIZATION_SITES_READ` sin manage | No existe columnheader `Acciones`, no existe `Crear sede`, aparece el aviso de solo lectura |
| Error de submit | Responder 500 al POST | El diálogo sigue abierto, conserva valores, muestra copy controlado y no muestra el body interno |
| Validación entre tabs | Enviar vacío desde Servicios | Información queda seleccionada, Nombre recibe foco y `aria-invalid=true` |

El primer test debe incluir esta aserción de payload:

```ts
expect(createRequestBody).toEqual(
  expect.objectContaining({
    country: 'CO',
    capabilities: [OrganizationSiteCapability.ADMIN_OFFICE],
  }),
);
```

- [ ] **Step 4: Ejecutar responsive y WCAG en claro y oscuro**

Parametrizar:

```ts
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

const themes = ['light', 'dark'] as const;
```

Por combinación verificar:

```ts
await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
const createSiteBox = await page.getByRole('button', { name: 'Crear sede' }).boundingBox();
expect(createSiteBox?.height).toBeGreaterThanOrEqual(44);
const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
expect(results.violations).toEqual([]);
await expect(page).toHaveScreenshot(`organization-${viewport.name}-${theme}.png`, {
  fullPage: true,
});
```

La tabla puede desplazarse dentro de su wrapper; la página no puede tener overflow horizontal.

- [ ] **Step 5: Ejecutar E2E focalizado**

```powershell
pnpm exec playwright test e2e/tests/portal-settings-organization-access.spec.ts e2e/tests/portal-settings-empresa.spec.ts e2e/tests/portal-settings-organization-ui.spec.ts --config=playwright.portal.config.ts
```

Expected: todas las pruebas verdes, axe con 0 violaciones A/AA y snapshots actuales aprobados.

- [ ] **Step 6: Inspección visual autenticada real**

Abrir `http://localhost:3002/dashboard/settings/organization` con una sesión tenant ADMIN real y comprobar:

```text
- claro y oscuro
- 390x844, 1024x768 y 1440x900
- carga, vacío, con datos y error
- teclado completo y foco visible
- scroll interno de tabla
- targets táctiles >=44 px
- modal de crear, editar y dar de baja
```

Las capturas históricas del settings anterior no cuentan como evidencia.

---

### Task 7: Cerrar gates, informe vivo y entrega

**Responsable:** AI-EM-ARCH.

**Files:**
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

- [ ] **Step 1: Ejecutar el gate técnico final**

```powershell
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm --filter @iwana/portal test -- --runInBand
pnpm exec playwright test e2e/tests/portal-settings-organization-access.spec.ts e2e/tests/portal-settings-empresa.spec.ts e2e/tests/portal-settings-organization-ui.spec.ts --config=playwright.portal.config.ts
pnpm audit:doc-locations
pnpm audit:adr-citations
pnpm sync:agents:check
git diff --check
```

Expected: exit code 0 en todos los comandos.

- [ ] **Step 2: Registrar evidencia en el informe vivo**

Agregar una sección `Remediación UI/UX Organización — 2026-08-15` con:

```markdown
- Hallazgos cerrados: P0, P1, P2 y P3.
- Archivos funcionales modificados.
- Cobertura final: statements, branches, functions y lines.
- Suites Jest ejecutadas y total de pruebas.
- Suites E2E ejecutadas y total de pruebas.
- Resultado axe por viewport y tema.
- Evidencia visual autenticada vigente.
- Veredicto AI-PROD-UX.
- Veredicto AI-DS-OWNER.
- Gate G6: GO o NO-GO con causa concreta.
```

G6 permanece NO-GO si falta cualquiera de estos puntos: E2E verde, cobertura >=80 %, axe sin violaciones, contraste conforme o evidencia visual autenticada.

- [ ] **Step 3: Revisar scope y worktree**

```powershell
git status --short
git diff --stat
git diff -- docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md docs/prompts/PROMPT-MOD00-ORGANIZACION-REMEDIACION-UI-v1.0.md apps/portal/src/components/settings e2e/tests docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
```

Expected: no hay archivos fuera del alcance ni cambios ajenos revertidos.

- [ ] **Step 4: Commit de cierre**

```powershell
git add apps/portal/src/components/settings e2e/tests/portal-settings-organization-access.spec.ts e2e/tests/portal-settings-empresa.spec.ts e2e/tests/portal-settings-organization-ui.spec.ts docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md docs/prompts/PROMPT-MOD00-ORGANIZACION-REMEDIACION-UI-v1.0.md docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
git commit -m "fix: complete organization settings ui remediation"
```

## Criterios de aceptación finales

- [ ] No aparece un empty state antes de terminar la carga inicial.
- [ ] Los errores internos nunca se muestran al usuario.
- [ ] Los errores de submit permanecen dentro del diálogo y conservan datos.
- [ ] Guardar desde Servicios lleva al primer error de Información y lo enfoca.
- [ ] País se hidrata y se envía en creación/edición.
- [ ] Solo lectura no renderiza la columna Acciones.
- [ ] Sedes inactivas no ofrecen Dar de baja.
- [ ] Tabla móvil usa scroll interno sin overflow de página.
- [ ] Todos los controles interactivos alcanzan al menos 44 px.
- [ ] Claro y oscuro cumplen WCAG AA.
- [ ] Cobertura >=80 % en las cuatro métricas.
- [ ] Unit, E2E, lint, typecheck y auditorías documentales están verdes.
- [ ] Existe evidencia visual autenticada vigente.
- [ ] AI-PROD-UX y AI-DS-OWNER emiten GO.
- [ ] AI-EM-ARCH registra G6=GO en el informe vivo.

## Self-review del plan

- [x] Los hallazgos P1–P3 tienen una tarea y una prueba asociada.
- [x] Los contratos y tipos usados existen en el repositorio.
- [x] No se propone backend, migración, token, paquete ni primitive global.
- [x] El ownership evita edición concurrente de archivos compartidos.
- [x] Los comandos usan pnpm y rutas reales del monorepo.
- [x] El cierre actualiza el informe existente en vez de duplicarlo.
