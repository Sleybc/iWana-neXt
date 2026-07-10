# MOD00 Calendario operativo - redistribucion de contenedores UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reducir la sensacion de densidad y el desperdicio de espacio en `/dashboard/settings/calendar`, mejorando jerarquia, agrupacion y ritmo visual sin cambiar ownership, contratos ni comportamiento funcional.

**Architecture:** el cambio se limita a frontend portal y a la composicion visual del submodulo de calendario. La ruta sigue siendo unica, pero el shell debe distinguir con claridad bloques principales, capas operativas secundarias y formularios subordinados. El plan reutiliza `PortalPanel`, `PortalSectionHeader`, `PortalAlert`, `PortalEmptyState` y el editor semanal ya estabilizado, evitando introducir patrones visuales paralelos.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, Tailwind v4 CSS-first, `@iwana/ui`, Jest, Playwright, pnpm.

---

## Source Artifacts

- Perfil visual: `docs/roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v1.md`
- ADR rector: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- ADR relacionado: `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md`
- Spec de rediseño vigente: `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`
- Plan previo de refinamiento general: `docs/plans/2026-05-29-mod00-refinamiento-calendario-operativo-jornadas.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Checklist de rediseño: `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`

## Scope

### Entra en este plan

- Redistribucion del shell de calendario para bajar densidad vertical.
- Nueva jerarquia visual entre bloques principales y secundarios.
- Compactacion de contexto repetido: alerts, textos introductorios y contenedores auxiliares.
- Mejor uso del ancho en desktop para horario base y horarios por sede.
- Subordinacion mas clara de formularios en excepciones y cambios puntuales.
- Reduccion de anidacion visual en el bloque WFM.
- Validacion focalizada de portal y E2E del calendario.

### No entra en este plan

- Cambios de API, DTOs, migraciones o ownership.
- Nuevas rutas o tabs persistentes fuera del alcance aprobado.
- Reescritura funcional de `WfmOperatingHoursManager`.
- Nuevos componentes globales en `packages/ui` salvo que una abstraction local demuestre clara repeticion.

## File Structure

- Modify: `apps/portal/src/components/settings/CalendarSettingsClient.tsx`
  Purpose: redistribuir el shell, agrupar bloques y bajar densidad del header.
- Modify: `apps/portal/src/components/settings/CalendarOrganizationHoursPanel.tsx`
  Purpose: priorizar el editor y adelgazar contexto previo.
- Modify: `apps/portal/src/components/settings/CalendarSiteHoursPanel.tsx`
  Purpose: reducir la altura del selector/estado y ganar ancho util.
- Modify: `apps/portal/src/components/settings/CalendarExceptionsPanel.tsx`
  Purpose: reforzar patron list-first y reducir peso del formulario.
- Modify: `apps/portal/src/components/settings/OperationalEventualitiesPanel.tsx`
  Purpose: mismo patron list-first con mejor aire y acciones.
- Modify: `apps/portal/src/components/settings/CalendarWfmPanel.tsx`
  Purpose: quitar sensacion de panel dentro de panel donde sea posible.
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
  Purpose: acompasar espaciado y framing con el nuevo shell, sin tocar logica.
- Modify: `apps/portal/src/components/shared/portal-ui.tsx`
  Purpose: introducir variantes compactas seguras si el patron se repite en 2+ paneles.
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
  Purpose: ajustar copy visible si algun bloque cambia de orden o tono.

### Tests

- Modify: `apps/portal/src/components/settings/CalendarSettingsClient.spec.tsx`
- Modify: `apps/portal/src/components/settings/CalendarOrganizationHoursPanel.spec.tsx`
- Modify: `apps/portal/src/components/settings/CalendarSiteHoursPanel.spec.tsx`
- Modify: `apps/portal/src/components/settings/CalendarExceptionsPanel.spec.tsx`
- Modify: `apps/portal/src/components/settings/OperationalEventualitiesPanel.spec.tsx`
- Modify: `apps/portal/src/components/settings/CalendarWfmPanel.spec.tsx`
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`
- Modify: `e2e/tests/portal-settings-calendar.spec.ts`

### Docs

- Modify: `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Modify: `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`

## Task 1: Replantear el shell sin cambiar la ruta

**Files:**
- Modify: `apps/portal/src/components/settings/CalendarSettingsClient.tsx`
- Test: `apps/portal/src/components/settings/CalendarSettingsClient.spec.tsx`

- [ ] **Step 1: Escribir el test que exprese la nueva jerarquia del shell**

```tsx
it('prioriza horarios estructurales y relega capas operativas secundarias', async () => {
  render(<CalendarSettingsClient />);

  expect(await screen.findByText('Horario base de la empresa')).toBeInTheDocument();
  expect(screen.getByText('Horarios por sede')).toBeInTheDocument();
  expect(screen.getByText('Cierres por fecha y aperturas especiales')).toBeInTheDocument();
  expect(screen.getByText('Programación de visitas')).toBeInTheDocument();
  expect(screen.getByText('Cambios puntuales de disponibilidad')).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar el test para fijar baseline**

Run: `pnpm --filter @iwana/portal test -- CalendarSettingsClient`
Expected: PASS o falla controlada solo si el nuevo orden visual aun no se refleja en el spec.

- [ ] **Step 3: Reorganizar `CalendarSettingsClient` en grupos visuales con distinto peso**

```tsx
<div className="space-y-8">
  <section className="space-y-6">
    <CalendarOrganizationHoursPanel ... />
    <CalendarSiteHoursPanel ... />
  </section>

  <section className="space-y-6">
    <CalendarExceptionsPanel ... />
    <CalendarWfmPanel />
    <OperationalEventualitiesPanel ... />
  </section>
</div>
```

- [ ] **Step 4: Compactar el header para que el estado operativo deje de sentirse como otro panel**

```tsx
<PageHeader
  title={CALENDAR_SETTINGS_COPY.pageTitle}
  subtitle={CALENDAR_SETTINGS_COPY.pageSubtitle}
  actions={...}
/>

<div className="rounded-2xl border border-gray-200/80 bg-iwana-surface-soft/90 px-4 py-2.5">
  <p className="portal-eyebrow text-iwana-secondary-700">
    {CALENDAR_SETTINGS_COPY.pageStatusEyebrow}
  </p>
  <p className="mt-1 text-sm text-gray-700">{operationalStatusSummary}</p>
</div>
```

- [ ] **Step 5: Reejecutar el test del shell**

Run: `pnpm --filter @iwana/portal test -- CalendarSettingsClient`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/CalendarSettingsClient.tsx apps/portal/src/components/settings/CalendarSettingsClient.spec.tsx
git commit -m "refactor: rebalance calendar shell layout"
```

## Task 2: Dar prioridad al contenido editable en horario base y sede

**Files:**
- Modify: `apps/portal/src/components/settings/CalendarOrganizationHoursPanel.tsx`
- Modify: `apps/portal/src/components/settings/CalendarSiteHoursPanel.tsx`
- Test: `apps/portal/src/components/settings/CalendarOrganizationHoursPanel.spec.tsx`
- Test: `apps/portal/src/components/settings/CalendarSiteHoursPanel.spec.tsx`

- [ ] **Step 1: Escribir tests para verificar que el editor aparece antes que el contexto redundante**

```tsx
it('mantiene visible el editor semanal como tarea principal del panel', () => {
  render(<CalendarOrganizationHoursPanel ... />);

  expect(screen.getByTestId('bh-layout-desktop')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar la suite focalizada**

Run: `pnpm --filter @iwana/portal test -- CalendarOrganizationHoursPanel CalendarSiteHoursPanel`
Expected: PASS.

- [ ] **Step 3: Reducir el peso de las alerts persistentes y convertir parte del contexto en microcopy ligero**

```tsx
<div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-iwana-surface-soft/70 px-4 py-3">
  <div>
    <p className="portal-eyebrow">{CALENDAR_SETTINGS_COPY.organizationStatusTitle}</p>
    <p className="mt-1 text-sm text-gray-700">{CALENDAR_SETTINGS_COPY.organizationStatusDescription}</p>
  </div>
</div>
```

- [ ] **Step 4: Hacer el selector de sede mas toolbar y menos bloque introductorio**

```tsx
<div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft/70 p-4 md:flex-row md:items-end md:justify-between">
  <div className="min-w-0 md:max-w-sm">
    <p className="portal-eyebrow">{CALENDAR_SETTINGS_COPY.siteSelectorLabel}</p>
    <p className="mt-1 text-sm text-gray-600">{CALENDAR_SETTINGS_COPY.siteSelectorHint}</p>
  </div>
  <select className={inputClassName} ... />
</div>
```

- [ ] **Step 5: Reejecutar los tests focalizados**

Run: `pnpm --filter @iwana/portal test -- CalendarOrganizationHoursPanel CalendarSiteHoursPanel`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/CalendarOrganizationHoursPanel.tsx apps/portal/src/components/settings/CalendarSiteHoursPanel.tsx apps/portal/src/components/settings/CalendarOrganizationHoursPanel.spec.tsx apps/portal/src/components/settings/CalendarSiteHoursPanel.spec.tsx
git commit -m "refactor: prioritize calendar core editing surfaces"
```

## Task 3: Convertir excepciones y eventualidades en superficies list-first reales

**Files:**
- Modify: `apps/portal/src/components/settings/CalendarExceptionsPanel.tsx`
- Modify: `apps/portal/src/components/settings/OperationalEventualitiesPanel.tsx`
- Test: `apps/portal/src/components/settings/CalendarExceptionsPanel.spec.tsx`
- Test: `apps/portal/src/components/settings/OperationalEventualitiesPanel.spec.tsx`

- [ ] **Step 1: Escribir tests para fijar el patron listado primero, formulario despues**

```tsx
it('muestra primero el listado y mantiene el formulario cerrado por defecto', () => {
  render(<CalendarExceptionsPanel ... />);

  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.queryByTestId('exception-form')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar la suite focalizada**

Run: `pnpm --filter @iwana/portal test -- CalendarExceptionsPanel OperationalEventualitiesPanel`
Expected: PASS.

- [ ] **Step 3: Reemplazar el bloque dashed por una accion secundaria mas ligera con formulario en region separada**

```tsx
<div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="portal-eyebrow">{CALENDAR_SETTINGS_COPY.exceptionsCreateTitle}</p>
      <p className="mt-1 text-sm text-gray-600">{CALENDAR_SETTINGS_COPY.exceptionsFormDescription}</p>
    </div>
    <Button variant="secondary" ...>{CALENDAR_SETTINGS_COPY.exceptionsShowFormAction}</Button>
  </div>

  {showForm ? <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft/60 p-4">...</div> : null}
</div>
```

- [ ] **Step 4: Dar mas aire a tablas y badges sin subir mucho la altura**

```tsx
<tbody className="divide-y divide-gray-100 bg-white">
  <tr>
    <td className="px-4 py-3.5 text-sm">...</td>
  </tr>
</tbody>
```

- [ ] **Step 5: Reejecutar tests focalizados**

Run: `pnpm --filter @iwana/portal test -- CalendarExceptionsPanel OperationalEventualitiesPanel`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/CalendarExceptionsPanel.tsx apps/portal/src/components/settings/OperationalEventualitiesPanel.tsx apps/portal/src/components/settings/CalendarExceptionsPanel.spec.tsx apps/portal/src/components/settings/OperationalEventualitiesPanel.spec.tsx
git commit -m "refactor: subordinate secondary calendar forms"
```

## Task 4: Reducir la anidacion visual de WFM

**Files:**
- Modify: `apps/portal/src/components/settings/CalendarWfmPanel.tsx`
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
- Modify: `apps/portal/src/components/shared/portal-ui.tsx`
- Test: `apps/portal/src/components/settings/CalendarWfmPanel.spec.tsx`
- Test: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`

- [ ] **Step 1: Escribir un test que congele la presencia de un solo framing dominante para WFM**

```tsx
it('mantiene el contenido WFM contextualizado sin duplicar capas de panel innecesarias', async () => {
  render(<CalendarWfmPanel />);
  expect(await screen.findByText('Horario operativo para visitas')).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar la suite WFM focalizada**

Run: `pnpm --filter @iwana/portal test -- CalendarWfmPanel WfmOperatingHoursManager`
Expected: PASS.

- [ ] **Step 3: Adelgazar el panel wrapper o mover parte del framing al manager para evitar panel dentro de panel**

```tsx
<PortalPanel
  eyebrow={WFM_SETTINGS_COPY.headerEyebrow}
  title={WFM_SETTINGS_COPY.panelTitle}
  description={WFM_SETTINGS_COPY.headerDescription}
  contentClassName="space-y-3"
>
  <WfmOperatingHoursManager canEdit={canEdit} compactFraming />
</PortalPanel>
```

- [ ] **Step 4: Reducir alerts persistentes dentro del manager cuando solo repiten contexto ya dado por el wrapper**

```tsx
{showInlineContext ? (
  <PortalAlert variant="info" title={WFM_SETTINGS_COPY.contextTitle} description={WFM_SETTINGS_COPY.contextDescription} />
) : null}
```

- [ ] **Step 5: Reejecutar la suite WFM focalizada**

Run: `pnpm --filter @iwana/portal test -- CalendarWfmPanel WfmOperatingHoursManager`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/CalendarWfmPanel.tsx apps/portal/src/components/settings/WfmOperatingHoursManager.tsx apps/portal/src/components/shared/portal-ui.tsx apps/portal/src/components/settings/CalendarWfmPanel.spec.tsx apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx
git commit -m "refactor: simplify wfm calendar framing"
```

## Task 5: Validacion integrada y cierre documental

**Files:**
- Modify: `e2e/tests/portal-settings-calendar.spec.ts`
- Modify: `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Modify: `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`

- [ ] **Step 1: Actualizar el E2E para verificar el nuevo ritmo visual y la lectura list-first**

```ts
test('ADMIN ve primero horarios estructurales y luego capas operativas secundarias', async ({ page }) => {
  await page.goto('/dashboard/settings/calendar');

  await expect(page.getByText('Horario base de la empresa')).toBeVisible();
  await expect(page.getByText('Horarios por sede')).toBeVisible();
  await expect(page.getByText('Programación de visitas')).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar validacion del portal**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: exit 0.

- [ ] **Step 3: Ejecutar el barrido focalizado de pruebas unitarias**

Run: `pnpm --filter @iwana/portal test -- CalendarSettingsClient CalendarOrganizationHoursPanel CalendarSiteHoursPanel CalendarExceptionsPanel CalendarWfmPanel WfmOperatingHoursManager OperationalEventualitiesPanel`
Expected: PASS.

- [ ] **Step 4: Ejecutar el E2E del calendario**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts`
Expected: PASS.

- [ ] **Step 5: Actualizar spec, informe y checklist con evidencia real**

```md
- Shell reagrupado por capas operativas.
- Superficies secundarias subordinadas.
- Validacion portal y Playwright en verde.
```

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/portal-settings-calendar.spec.ts docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md
git commit -m "docs: close calendar distribution redesign iteration"
```

## Self-review checklist

- [ ] El shell comunica mejor diferencia entre estructura operativa y capas secundarias.
- [ ] Horario base y sede ganan ancho util sin duplicar contexto previo.
- [ ] Excepciones y eventualidades priorizan consulta sobre alta.
- [ ] WFM ya no se percibe como panel dentro de panel.
- [ ] No se cambiaron endpoints, permisos, ownership ni contratos.
- [ ] La evidencia final incluye typecheck, Jest focalizado y Playwright.
