# Portal Settings Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar visualmente `apps/portal:/dashboard/settings` para mejorar jerarquía, navegación, densidad operativa y escalabilidad, sin cambiar contratos API ni boundaries.

**Architecture:** La implementación conserva la navegación principal de settings y añade una segunda capa de navegación interna para el dominio `Marca`, reforzando además el bloque superior como resumen ejecutivo del módulo. La solución se apoya en refactors locales en `apps/portal/src/components/settings`, sin introducir librerías nuevas ni mover lógica de negocio fuera de su bounded context.

**Tech Stack:** Next.js App Router, React 19, TypeScript estricto, Tailwind CSS v4, `@iwana/ui`, Jest, Testing Library.

---

## 0. Artefactos obligatorios de contexto

Leer antes de ejecutar:

- [docs/specs/2026-05-07-portal-settings-redesign-design.md](../specs/2026-05-07-portal-settings-redesign-design.md)
- [docs/roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md)
- [apps/portal/src/components/settings/SettingsClient.tsx](../../apps/portal/src/components/settings/SettingsClient.tsx)
- [apps/portal/src/components/settings/BrandingForm.tsx](../../apps/portal/src/components/settings/BrandingForm.tsx)
- [apps/portal/src/components/settings/PlanCatalogManager.tsx](../../apps/portal/src/components/settings/PlanCatalogManager.tsx)
- [apps/portal/src/components/settings/AdditionalProductsManager.tsx](../../apps/portal/src/components/settings/AdditionalProductsManager.tsx)
- [apps/portal/src/components/settings/CoverageCheckSection.tsx](../../apps/portal/src/components/settings/CoverageCheckSection.tsx)

## 1. File structure lock

### Files to create

- `apps/portal/src/components/settings/SettingsSubTabs.tsx`
- `apps/portal/src/components/settings/settings-branding-navigation.ts`
- `apps/portal/src/components/settings/SettingsSectionPanel.tsx`
- `apps/portal/src/components/settings/SettingsClient.spec.tsx`

### Files to modify

- `apps/portal/src/components/settings/SettingsClient.tsx`
- `apps/portal/src/components/settings/SettingsOverviewPanel.tsx`
- `apps/portal/src/components/settings/BrandingForm.tsx`
- `apps/portal/src/components/settings/PlanCatalogManager.tsx`
- `apps/portal/src/components/settings/AdditionalProductsManager.tsx`
- `apps/portal/src/components/settings/AdditionalServicesManager.tsx`
- `apps/portal/src/components/settings/CoverageCheckSection.tsx`
- `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

### Files to test

- `apps/portal/src/components/settings/SettingsClient.spec.tsx`
- `apps/portal/src/components/settings/BrandingForm.spec.tsx`
- `apps/portal/src/components/settings/PlanCatalogManager.spec.tsx`
- `apps/portal/src/components/settings/AdditionalProductsManager.spec.tsx`
- `apps/portal/src/components/settings/AdditionalServicesManager.spec.tsx`

---

### Task 1: Crear navegación secundaria del dominio Marca

**Files:**
- Create: `apps/portal/src/components/settings/settings-branding-navigation.ts`
- Create: `apps/portal/src/components/settings/SettingsSubTabs.tsx`
- Test: `apps/portal/src/components/settings/SettingsClient.spec.tsx`

- [ ] **Step 1: Escribir el test fallido para la navegación secundaria**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsSubTabs } from './SettingsSubTabs';

describe('SettingsSubTabs', () => {
  it('should render branding sub-sections and switch active item', () => {
    const onChange = jest.fn();

    render(
      <SettingsSubTabs
        items={[
          { id: 'identity', label: 'Identidad visual' },
          { id: 'plans', label: 'Planes' },
          { id: 'products', label: 'Productos' },
          { id: 'coverage', label: 'Cobertura' },
        ]}
        activeTab="identity"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Planes' }));
    expect(onChange).toHaveBeenCalledWith('plans');
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para verificar que falle**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx`
Expected: FAIL porque `SettingsSubTabs` no existe.

- [ ] **Step 3: Crear la constante de navegación de Marca**

```ts
export const SETTINGS_BRANDING_NAVIGATION = [
  { id: 'identity', label: 'Identidad visual' },
  { id: 'plans', label: 'Planes' },
  { id: 'products', label: 'Productos' },
  { id: 'coverage', label: 'Cobertura' },
] as const;

export type BrandingSettingsTabId = (typeof SETTINGS_BRANDING_NAVIGATION)[number]['id'];
```

- [ ] **Step 4: Implementar `SettingsSubTabs` con accesibilidad de tabs**

```tsx
'use client';

import { cn } from '@iwana/ui';

export function SettingsSubTabs({ items, activeTab, onChange }: Props) {
  return (
    <div role="tablist" aria-label="Secciones de marca" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeTab}
          onClick={() => onChange(item.id)}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition',
            item.id === activeTab
              ? 'bg-iwana-primary text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Ejecutar la prueba para verificar que pase**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/settings-branding-navigation.ts apps/portal/src/components/settings/SettingsSubTabs.tsx apps/portal/src/components/settings/SettingsClient.spec.tsx
git commit -m "feat: add settings branding sub-navigation"
```

---

### Task 2: Reforzar SettingsClient como orquestador de dominios y subdominios

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Create: `apps/portal/src/components/settings/SettingsSectionPanel.tsx`
- Test: `apps/portal/src/components/settings/SettingsClient.spec.tsx`

- [ ] **Step 1: Escribir el test fallido para el comportamiento de subtab en Marca**

```tsx
it('should show branding sub-tabs only when branding tab is active', async () => {
  render(<SettingsClient />);

  fireEvent.click(screen.getByRole('tab', { name: /Marca/i }));

  expect(await screen.findByRole('tab', { name: 'Identidad visual' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Planes' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar la prueba para verificar que falle**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx`
Expected: FAIL porque la subnavegación aún no se renderiza.

- [ ] **Step 3: Crear `SettingsSectionPanel` para unificar superficie y spacing interno**

```tsx
export function SettingsSectionPanel({ title, description, toolbar, children }: Props) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 dark:border-dark-border/80 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h3>
          {description ? <p className="text-sm text-slate-500 dark:text-gray-400">{description}</p> : null}
        </div>
        {toolbar ? <div className="flex flex-wrap gap-2">{toolbar}</div> : null}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Refactorizar `SettingsClient` para incluir estado `activeBrandingTab` y render condicional**

```tsx
const [activeBrandingTab, setActiveBrandingTab] = useState<BrandingSettingsTabId>('identity');

{activeTab === 'branding' ? (
  <div className="space-y-4">
    <SettingsSubTabs
      items={SETTINGS_BRANDING_NAVIGATION}
      activeTab={activeBrandingTab}
      onChange={setActiveBrandingTab}
    />

    {activeBrandingTab === 'identity' ? (
      <BrandingForm profile={profile} canEdit={canEdit} onUpdated={setProfile} />
    ) : null}
  </div>
) : null}
```

- [ ] **Step 5: Ejecutar test focalizado y typecheck parcial**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx`
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/SettingsClient.tsx apps/portal/src/components/settings/SettingsSectionPanel.tsx apps/portal/src/components/settings/SettingsClient.spec.tsx
git commit -m "feat: orchestrate settings sections with branding sub-tabs"
```

---

### Task 3: Evolucionar el overview superior a resumen ejecutivo

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsOverviewPanel.tsx`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`

- [ ] **Step 1: Definir bloques de resumen con señales operativas explícitas**

```ts
const overviewItems = [
  {
    id: 'security',
    label: 'Seguridad base',
    value: settings.features.mfa_required_all ? 'MFA obligatoria activa' : 'Revisión requerida',
    tone: settings.features.mfa_required_all ? 'success' : 'warning',
  },
  {
    id: 'branding',
    label: 'Identidad visual',
    value: profile.logoLightUrl || profile.logoDarkUrl ? 'Configurada' : 'Pendiente',
    tone: profile.logoLightUrl || profile.logoDarkUrl ? 'info' : 'warning',
  },
];
```

- [ ] **Step 2: Reestructurar el layout del overview para que tenga lectura ejecutiva y CTA contextual**

```tsx
<section className="grid gap-4 rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2 lg:grid-cols-[1.4fr_1fr] lg:items-start">
  <div className="space-y-4">
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700">Estado actual</p>
      <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Configura la operación base de tu empresa</h2>
    </header>
  </div>
  <div className="grid gap-3 sm:grid-cols-2">
    {overviewItems.map((item) => (
      <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-dark-border dark:bg-dark-surface-3">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
        <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">{item.value}</p>
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 3: Validar visualmente que el overview ya no se sienta como hero genérico**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

Manual check: abrir `/dashboard/settings` y confirmar que el primer viewport muestra contexto + salud + dirección de acción antes del contenido de formularios.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/components/settings/SettingsOverviewPanel.tsx apps/portal/src/components/settings/SettingsClient.tsx
git commit -m "feat: redesign settings overview as executive summary"
```

---

### Task 4: Reorganizar BrandingForm como sistema de identidad visual

**Files:**
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx`
- Test: `apps/portal/src/components/settings/BrandingForm.spec.tsx`

- [ ] **Step 1: Escribir prueba o ampliar spec existente para validar nueva agrupación semántica**

```tsx
it('should render identity sections for seal, logo, favicon and login background', () => {
  render(<BrandingForm profile={profileFixture} canEdit onUpdated={jest.fn()} />);

  expect(screen.getByText('Sello compacto')).toBeInTheDocument();
  expect(screen.getByText('Logo horizontal')).toBeInTheDocument();
  expect(screen.getByText('Favicon')).toBeInTheDocument();
  expect(screen.getByText('Fondo del login')).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar test para verificar comportamiento actual**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/BrandingForm.spec.tsx`
Expected: usar el fallo o snapshot roto como señal para el refactor.

- [ ] **Step 3: Envolver BrandingForm en `SettingsSectionPanel` y separar bloques internos por intención**

```tsx
<SettingsSectionPanel
  title="Identidad visual"
  description="Administra los activos de marca y la metadata pública del portal empresarial."
  toolbar={
    canEdit ? (
      <Button type="submit" loading={isSubmitting}>
        <Save className="h-4 w-4" aria-hidden="true" />
        Guardar identidad visual
      </Button>
    ) : null
  }
>
  <div className="space-y-6">
    <section className="space-y-4">...</section>
    <section className="space-y-4">...</section>
  </div>
</SettingsSectionPanel>
```

- [ ] **Step 4: Mejorar preview y microcopy sin tocar lógica API**

```tsx
<div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-dark-border dark:bg-dark-surface-3">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vista previa</p>
  <TenantSeal ... />
</div>
```

- [ ] **Step 5: Ejecutar tests y typecheck**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/BrandingForm.spec.tsx`
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/BrandingForm.tsx apps/portal/src/components/settings/BrandingForm.spec.tsx apps/portal/src/components/settings/SettingsSectionPanel.tsx
git commit -m "feat: regroup branding form as identity system"
```

---

### Task 5: Aislar managers densos por subdominio activo

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/PlanCatalogManager.tsx`
- Modify: `apps/portal/src/components/settings/AdditionalProductsManager.tsx`
- Modify: `apps/portal/src/components/settings/AdditionalServicesManager.tsx`
- Modify: `apps/portal/src/components/settings/CoverageCheckSection.tsx`

- [ ] **Step 1: Renderizar cada manager solo bajo su subtab correspondiente**

```tsx
{activeBrandingTab === 'plans' ? <PlanCatalogManager canEdit={canEdit} /> : null}
{activeBrandingTab === 'products' ? (
  <div className="space-y-6">
    <AdditionalProductsManager canEdit={canEdit} />
    <AdditionalServicesManager canEdit={canEdit} />
  </div>
) : null}
{activeBrandingTab === 'coverage' ? <CoverageCheckSection canEdit={canEdit} /> : null}
```

- [ ] **Step 2: Dar a cada manager una cabecera consistente con toolbar y descripción**

```tsx
<SettingsSectionPanel
  title="Catálogo de planes"
  description="Define la oferta base comercial visible para la empresa."
>
  {existingManagerContent}
</SettingsSectionPanel>
```

- [ ] **Step 3: Reducir cardificación redundante dentro de los managers**

```tsx
<div className="space-y-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">...</div>
  <div className="overflow-hidden rounded-2xl border border-slate-200">...</div>
</div>
```

- [ ] **Step 4: Ejecutar tests existentes de managers**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/PlanCatalogManager.spec.tsx src/components/settings/AdditionalProductsManager.spec.tsx src/components/settings/AdditionalServicesManager.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Ejecutar typecheck**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/SettingsClient.tsx apps/portal/src/components/settings/PlanCatalogManager.tsx apps/portal/src/components/settings/AdditionalProductsManager.tsx apps/portal/src/components/settings/AdditionalServicesManager.tsx apps/portal/src/components/settings/CoverageCheckSection.tsx
git commit -m "feat: isolate settings managers by branding subdomain"
```

---

### Task 6: Ajuste responsive y accesibilidad del módulo

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsTabs.tsx`
- Modify: `apps/portal/src/components/settings/SettingsSubTabs.tsx`
- Modify: `apps/portal/src/components/settings/SettingsOverviewPanel.tsx`
- Modify: `apps/portal/src/components/settings/CoverageNodeTable.tsx`
- Modify: `apps/portal/src/components/settings/CoverageZoneTable.tsx`

- [ ] **Step 1: Aplicar focus-visible consistente a tabs y subtabs**

```tsx
className={cn(
  'rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-secondary focus-visible:ring-offset-2',
  ...
)}
```

- [ ] **Step 2: Reforzar el comportamiento mobile del overview y tabs**

```tsx
<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">...</div>
<div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">...</div>
```

- [ ] **Step 3: Revisar tablas para que el scroll horizontal sea controlado y no agresivo**

```tsx
<div className="overflow-x-auto rounded-2xl border border-slate-200">
  <table className="min-w-[720px] text-sm">...</table>
</div>
```

- [ ] **Step 4: Ejecutar typecheck, lint y prueba focalizada**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

Run: `pnpm --filter @iwana/portal lint`
Expected: PASS.

- [ ] **Step 5: Validación manual obligatoria**

Revisar en navegador:

- `http://localhost:3002/dashboard/settings` desktop `1440x900`
- `http://localhost:3002/dashboard/settings` mobile `390x844`
- navegación por teclado en tabs y subtabs
- que `Marca` muestre una sola superficie activa a la vez

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/SettingsTabs.tsx apps/portal/src/components/settings/SettingsSubTabs.tsx apps/portal/src/components/settings/SettingsOverviewPanel.tsx apps/portal/src/components/settings/CoverageNodeTable.tsx apps/portal/src/components/settings/CoverageZoneTable.tsx
git commit -m "feat: harden responsive and accessibility for settings redesign"
```

---

### Task 7: Cierre documental y evidencia

**Files:**
- Modify: `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

- [ ] **Step 1: Agregar addendum de ejecución en informe vivo**

```md
### Addendum correctivo 2026-05-07 — Rediseño visual de configuración empresarial en portal

Se ejecutó el rediseño visual de `/dashboard/settings` en `apps/portal` con foco en jerarquía, densidad operativa y navegación por subdominios. La pestaña `Marca` dejó de actuar como contenedor monolítico y ahora separa identidad visual, catálogo de planes, productos y cobertura mediante navegación secundaria explícita.

Validación ejecutada:

- `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx src/components/settings/BrandingForm.spec.tsx`
- `pnpm --filter @iwana/portal typecheck`
- `pnpm --filter @iwana/portal lint`
```

- [ ] **Step 2: Ejecutar paquete final de validación**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx src/components/settings/BrandingForm.spec.tsx src/components/settings/PlanCatalogManager.spec.tsx src/components/settings/AdditionalProductsManager.spec.tsx src/components/settings/AdditionalServicesManager.spec.tsx`
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck && pnpm --filter @iwana/portal lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md
git commit -m "docs: record portal settings visual redesign execution"
```

---

## 2. Self-review checklist

- El plan cubre overview, tabs, subnavegación, branding, managers, responsive, accesibilidad y documentación.
- No deja placeholders funcionales ni pasos vagos.
- Mantiene alcance visual sin invadir APIs, permisos o boundaries.
- Define archivos exactos y comandos verificables.

## 3. Handoff operativo

Orden recomendado de ejecución:

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7

Riesgos a vigilar durante ejecución:

- que `BrandingForm` no mezcle refactor visual con cambio de contrato;
- que los managers no dupliquen wrappers visuales al integrarse bajo subtabs;
- que mobile conserve usabilidad al colapsar navegación secundaria.