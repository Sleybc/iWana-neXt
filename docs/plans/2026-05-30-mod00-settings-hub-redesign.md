# MOD00 Settings Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/dashboard/settings` into an operational settings hub with normalized copy, clearer hierarchy, a priority card, and subordinated future capabilities.

**Architecture:** Keep the existing route and data loading model in `SettingsClient`, but introduce a view-model layer for hub cards so UI copy and emphasis no longer depend on raw registry payloads. Refactor `SettingsSectionGrid` to split recommended, operable, restricted, and future sections while reusing portal primitives and keeping tests focused on visible behavior.

**Tech Stack:** Next.js App Router, React, TypeScript, Jest, Testing Library, portal shared primitives, Tailwind v4 utilities.

---

### Task 1: Lock the new hub behavior in tests

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsClient.spec.tsx`
- Modify: `apps/portal/src/components/settings/SettingsSectionGrid.spec.tsx`

- [ ] **Step 1: Write the failing test for normalized future labels and guided CTA**

```tsx
it('muestra capacidades futuras con copy normalizado y sin labels legacy', async () => {
  render(<SettingsClient />);

  expect(await screen.findByText('Facturación')).toBeInTheDocument();
  expect(screen.getByText('Inventario')).toBeInTheDocument();
  expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  expect(screen.queryByText('Inventory')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing test for the priority card**

```tsx
it('muestra una recomendación prioritaria antes de la grilla principal', async () => {
  render(<SettingsClient />);

  expect(await screen.findByText('Recomendado ahora')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Revisar accesos/i })).toHaveAttribute(
    'href',
    '/dashboard/settings/access',
  );
});
```

- [ ] **Step 3: Write the failing test for restricted guidance**

```tsx
it('muestra una salida operativa cuando la sección está restringida', () => {
  render(
    <SettingsSectionGrid
      sections={[restrictedAccessSection]}
      effectivePermissions={[AccessPermissionKey.SETTINGS_READ]}
    />,
  );

  expect(screen.getByText(/Solicita apoyo a una persona administradora/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the focused tests to confirm they fail**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/settings/SettingsClient.spec.tsx src/components/settings/SettingsSectionGrid.spec.tsx`

Expected: FAIL showing missing `Facturación`, missing `Recomendado ahora`, and missing restricted guidance.

### Task 2: Normalize hub labels and descriptions before render

**Files:**
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
- Modify: `apps/portal/src/components/settings/SettingsSectionGrid.tsx`

- [ ] **Step 1: Add a hub-specific copy map to the settings labels file**

```ts
export const SETTINGS_HUB_SECTION_COPY = {
  organization: {
    title: 'Perfil empresarial y organización',
    description: 'Datos de la empresa, configuración base y sedes registradas.',
    action: 'Revisar empresa',
    emphasis: 'primary',
  },
  access: {
    title: 'Usuarios y acceso',
    description: 'Perfiles de acceso, autenticación y control de quién puede usar cada área.',
    action: 'Revisar accesos',
    emphasis: 'primary',
  },
  calendar: {
    title: 'Calendario operativo y jornadas',
    description: 'Horarios de atención, jornadas por sede y cambios puntuales de operación.',
    action: 'Revisar calendario',
    emphasis: 'secondary',
  },
  branding: {
    title: 'Marca',
    description: 'Imagen institucional y activos visuales de la empresa.',
    action: 'Revisar marca',
    emphasis: 'secondary',
  },
  billing: {
    title: 'Facturación',
    description:
      'Aquí podrás revisar y ajustar la configuración de facturación cuando esta capacidad esté disponible.',
  },
  inventory: {
    title: 'Inventario',
    description:
      'Aquí podrás administrar reglas y parámetros de inventario cuando esta capacidad esté disponible.',
  },
  integrations: {
    title: 'Integraciones',
    description:
      'Aquí podrás conectar y revisar integraciones empresariales cuando estén habilitadas.',
  },
} as const;
```

- [ ] **Step 2: Build a local view-model mapper inside the grid component**

```ts
function resolveSectionPresentation(section: SettingsSection) {
  const key = section.key.toLowerCase() as keyof typeof SETTINGS_HUB_SECTION_COPY;
  const override = SETTINGS_HUB_SECTION_COPY[key];

  return {
    ...section,
    title: override?.title ?? section.label,
    description: override?.description ?? section.description,
    actionLabel: 'action' in (override ?? {}) ? override.action : SETTINGS_HUB_COPY.openSectionAction,
    emphasis: 'emphasis' in (override ?? {}) ? override.emphasis : 'secondary',
  };
}
```

- [ ] **Step 3: Render titles, descriptions, and CTA labels from the view model**

```tsx
const presentation = resolveSectionPresentation(section);

<p className="text-base font-semibold text-gray-900 transition group-hover:text-iwana-primary dark:text-white">
  {presentation.title}
</p>
<p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
  {presentation.description}
</p>
<p className="text-sm font-medium text-iwana-primary">{presentation.actionLabel}</p>
```

- [ ] **Step 4: Run the same focused tests**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/settings/SettingsClient.spec.tsx src/components/settings/SettingsSectionGrid.spec.tsx`

Expected: some tests still fail, but legacy labels no longer appear in rendered output.

### Task 3: Add the priority card and stronger top-level hierarchy

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`

- [ ] **Step 1: Add copy for the new header summary and priority card**

```ts
priorityEyebrow: 'Recomendado ahora',
priorityTitle: 'Refuerza el acceso de tu empresa',
priorityDescription:
  'Activa reglas de acceso y revisa quién puede entrar, aprobar cambios o administrar la operación.',
priorityAction: 'Revisar accesos',
pageSubtitle:
  'Revisa las áreas clave de tu empresa, prioriza pendientes y entra directo a la sección que necesitas.',
```

- [ ] **Step 2: Insert a priority panel before the sections grid**

```tsx
<PortalPanel
  eyebrow={SETTINGS_HUB_COPY.priorityEyebrow}
  title={SETTINGS_HUB_COPY.priorityTitle}
  description={SETTINGS_HUB_COPY.priorityDescription}
  className="border-iwana-primary/15 bg-iwana-surface-soft"
  actions={
    <Link href="/dashboard/settings/access" className="...">
      {SETTINGS_HUB_COPY.priorityAction}
    </Link>
  }
/>
```

- [ ] **Step 3: Keep loading and error states aligned with the new layout**

```tsx
if (authLoading || isLoading) {
  return (
    <div className="space-y-6">
      <PageHeader ... />
      <SettingsSkeleton />
    </div>
  );
}
```

- [ ] **Step 4: Run the focused tests again**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/settings/SettingsClient.spec.tsx src/components/settings/SettingsSectionGrid.spec.tsx`

Expected: the new priority-card expectations pass, while layout-specific expectations may still fail.

### Task 4: Reorganize the grid into primary and future sections

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsSectionGrid.tsx`
- Modify: `apps/portal/src/components/settings/SettingsUnavailableState.tsx`

- [ ] **Step 1: Split sections into operable/restricted and future groups**

```ts
const presentedSections = sections.map(resolveSectionPresentation);
const mainSections = presentedSections.filter((section) => section.status === SettingsSectionStatus.AVAILABLE);
const futureSections = presentedSections.filter((section) => section.status !== SettingsSectionStatus.AVAILABLE || !section.route);
```

- [ ] **Step 2: Give the main grid better responsive behavior and emphasis classes**

```tsx
<div className="grid gap-4 md:grid-cols-2 xl:items-start">
  {mainSections.map((section) => {
    const emphasisClassName = section.emphasis === 'primary'
      ? 'border-iwana-primary/15 bg-white'
      : 'border-gray-200 bg-white';
```

- [ ] **Step 3: Render future sections in a secondary container**

```tsx
{futureSections.length > 0 ? (
  <div className="mt-6 space-y-3">
    <PortalSectionHeader
      eyebrow="Más opciones"
      title="Próximas capacidades"
      description="Estas áreas aparecerán aquí cuando estén listas para usarse en el portal."
    />
    <div className="grid gap-3 md:grid-cols-2">
      {futureSections.map(...)}
    </div>
  </div>
) : null}
```

- [ ] **Step 4: Compress the unavailable state visual weight**

```tsx
className={cn(
  'rounded-2xl border border-dashed border-gray-200 bg-iwana-surface-soft/80 p-4 dark:border-dark-border dark:bg-dark-surface-3/80',
  className,
)}
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/settings/SettingsClient.spec.tsx src/components/settings/SettingsSectionGrid.spec.tsx`

Expected: the grid renders normalized primary cards first and future capabilities as subordinated items.

### Task 5: Improve restricted messaging and final polish

**Files:**
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
- Modify: `apps/portal/src/components/settings/SettingsSectionGrid.tsx`

- [ ] **Step 1: Replace the generic restricted message with an actionable one**

```ts
restrictedMessage:
  'Tu perfil no puede administrar esta área ahora. Solicita apoyo a una persona administradora si necesitas usarla.',
```

- [ ] **Step 2: Apply the new restricted copy in the restricted card**

```tsx
<p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
  {SETTINGS_HUB_COPY.restrictedMessage}
</p>
```

- [ ] **Step 3: Run the focused tests one more time**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/settings/SettingsClient.spec.tsx src/components/settings/SettingsSectionGrid.spec.tsx`

Expected: PASS.

### Task 6: Validate the touched slice end-to-end

**Files:**
- Modify: none

- [ ] **Step 1: Run the same focused tests through the repo test runner**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/settings/SettingsClient.spec.tsx src/components/settings/SettingsSectionGrid.spec.tsx`

Expected: PASS.

- [ ] **Step 2: Run a narrow type or lint check for the touched files**

Run: `pnpm --filter @iwana/portal exec eslint src/components/settings/SettingsClient.tsx src/components/settings/SettingsSectionGrid.tsx src/components/settings/SettingsUnavailableState.tsx src/components/settings/mod00-settings-labels.ts`

Expected: PASS.

- [ ] **Step 3: Manually verify the route in the browser**

Check: `/dashboard/settings`

Expected:
- no `Billing` or `Inventory` legacy labels in visible UI;
- a priority card above the main grid;
- future capabilities visibly subordinated;
- two-column layout before `xl` in wider viewports.