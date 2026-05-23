# MOD00 Organization modal unificado de sede y servicios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** unificar en una sola operación la creación y edición de sedes con sus servicios activos, reduciendo saturación visual en Organization y asegurando persistencia atómica tenant-aware.

**Architecture:** el backend de MOD00 absorbe `capabilities` como parte opcional de `CreateOrganizationSiteDto` y `UpdateOrganizationSiteDto`, y persiste el set activo dentro de la misma transacción de `OrganizationService`. El portal mueve la edición de servicios al mismo modal de sede con tabs, elimina el guardado lateral como flujo primario y conserva el endpoint separado solo como compatibilidad transitoria.

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant por schema, class-validator, OpenAPI, Next.js App Router, React Hook Form, Zod, Jest, Supertest, Testing Library, Playwright, pnpm.

---

## Source Artifacts

- ADR rector: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- ADR de integración: `docs/adrs/ADR-043-Edicion-Atomica-Sede-Capacidades.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Spec: `docs/specs/2026-05-23-mod00-organization-site-modal-unificado-design.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## Scope

### Build now

- Extender DTOs y cliente tipado para aceptar `capabilities` opcional.
- Persistir sitio y capacidades en una sola transacción cuando el payload incluya la propiedad.
- Reestructurar el modal de sede con tabs `Informacion de la sede` y `Servicios`.
- Eliminar el guardado lateral `Guardar servicios` como flujo primario de portal.
- Mantener `PUT /organization/sites/:siteId/capabilities` como endpoint legacy deprecado.
- Actualizar pruebas HTTP, unitarias de servicio, frontend y documentación viva.

### Do not build now

- Cambios a horarios, responsables o asignaciones de sede.
- Cambios de ownership entre MOD00 y WFM.
- Eliminación física inmediata del endpoint legacy de capacidades.
- Reemplazo de `UserRole` o cambios de permisos fuera de los existentes.

## File Structure

### Backend

- Modify: `apps/api/src/modules/organization/dto/organization-site.dto.ts`
- Modify: `apps/api/src/modules/organization/organization.controller.ts`
- Modify: `apps/api/src/modules/organization/organization.service.ts`
- Modify: `apps/api/src/modules/organization/organization.controller.http.spec.ts`
- Modify: `apps/api/src/modules/organization/organization.service.spec.ts`

### Portal

- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/components/settings/OrganizationSiteDialog.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`
- Optional create: `apps/portal/src/components/settings/OrganizationSiteDialog.spec.tsx`

### Docs

- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

---

### Task 1: Extender contratos backend para sede + servicios

**Files:**
- Modify: `apps/api/src/modules/organization/dto/organization-site.dto.ts`
- Modify: `apps/api/src/modules/organization/organization.controller.http.spec.ts`

- [ ] **Step 1: Escribir la prueba HTTP que demuestre el nuevo contrato**

Agregar casos para `POST /api/v1/organization/sites` y `PATCH /api/v1/organization/sites/:id` aceptando `capabilities` en el body.

```ts
it('POST /api/v1/organization/sites acepta capabilities opcional', async () => {
  organizationServiceMock.create.mockResolvedValue({ id: 'site-1', capabilities: [OrganizationSiteCapability.NOC] });

  await request(app.getHttpServer())
    .post('/api/v1/organization/sites')
    .set('Authorization', 'Bearer admin-token')
    .send({
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      capabilities: [OrganizationSiteCapability.NOC],
    })
    .expect(201);
});

it('PATCH /api/v1/organization/sites/:id acepta capabilities vacio', async () => {
  organizationServiceMock.update.mockResolvedValue({ id: 'site-1', capabilities: [] });

  await request(app.getHttpServer())
    .patch('/api/v1/organization/sites/243f5a18-4adc-4ca5-8cce-f55b70a3412e')
    .set('Authorization', 'Bearer admin-token')
    .send({ capabilities: [] })
    .expect(200);
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falle por contrato inexistente**

Run: `pnpm --filter @iwana/api test -- organization.controller.http.spec.ts`

Expected: FAIL porque el DTO aún no acepta `capabilities` o porque el mock no recibe la propiedad.

- [ ] **Step 3: Extender el DTO con validación explícita**

Agregar `capabilities` opcional y validaciones equivalentes a las del endpoint legacy.

```ts
@ApiPropertyOptional({ enum: OrganizationSiteCapability, isArray: true, maxItems: 32 })
@IsOptional()
@IsEnum(OrganizationSiteCapability, { each: true })
capabilities?: OrganizationSiteCapability[];
```

Mantener la semántica documentada:

- `undefined` conserva el estado actual en `PATCH`.
- `[]` limpia servicios cuando la propiedad esté presente.

- [ ] **Step 4: Marcar el endpoint legacy como deprecado en controller**

Anotar el endpoint `PUT /sites/:siteId/capabilities` con summary o comentario deprecado sin retirarlo.

```ts
@ApiOperation({ summary: 'Reemplazar el set activo de capacidades de una sede (deprecated: use create/update con capabilities)' })
```

- [ ] **Step 5: Ejecutar la prueba y verificar que pase**

Run: `pnpm --filter @iwana/api test -- organization.controller.http.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/organization/dto/organization-site.dto.ts apps/api/src/modules/organization/organization.controller.ts apps/api/src/modules/organization/organization.controller.http.spec.ts
git commit -m "feat: extend organization site dto with capabilities"
```

### Task 2: Hacer atómica la persistencia de sede y capacidades

**Files:**
- Modify: `apps/api/src/modules/organization/organization.service.ts`
- Modify: `apps/api/src/modules/organization/organization.service.spec.ts`

- [ ] **Step 1: Escribir pruebas de servicio para create/update con capabilities**

Cubrir create con servicios, update con servicios, update sin `capabilities` y update con array vacío.

```ts
it('should persist capabilities during create when provided', async () => {
  const manager = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((entity, value) => value),
    save: jest.fn().mockImplementation(async (_entity, value) => value),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, callback) =>
    callback({ manager }),
  );

  jest.spyOn(service as never, 'loadSiteDetail').mockResolvedValue({
    id: 'site-1',
    capabilities: [OrganizationSiteCapability.NOC],
  } as never);

  await service.create({
    name: 'Sede norte',
    code: 'NORTE',
    siteType: OrganizationSiteType.OFFICE,
    capabilities: [OrganizationSiteCapability.NOC],
  });

  expect(manager.delete).toHaveBeenCalled();
  expect(manager.save).toHaveBeenCalled();
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar el fallo**

Run: `pnpm --filter @iwana/api test -- organization.service.spec.ts`

Expected: FAIL porque `create()` y `update()` todavía no tocan capacidades.

- [ ] **Step 3: Extraer un helper interno para reemplazar capacidades dentro de la transacción**

Implementar una función privada reutilizable, por ejemplo `replaceCapabilitiesInTransaction(manager, tenantId, siteId, capabilities)`.

```ts
private async replaceCapabilitiesInTransaction(
  manager: EntityManager,
  tenantId: string,
  siteId: string,
  capabilities: OrganizationSiteCapability[],
) {
  await manager.delete(OrganizationSiteCapabilityEntity, { tenantId, siteId });

  if (capabilities.length === 0) {
    return;
  }

  await manager.save(
    OrganizationSiteCapabilityEntity,
    capabilities.map((capability) =>
      manager.create(OrganizationSiteCapabilityEntity, {
        tenantId,
        siteId,
        capability,
        isEnabled: true,
      }),
    ),
  );
}
```

- [ ] **Step 4: Integrar el helper en create y update con semántica explícita**

```ts
if (dto.capabilities !== undefined) {
  await this.replaceCapabilitiesInTransaction(qr.manager, ctx.tenantId, saved.id, dto.capabilities);
}
```

Para `update`, usar la misma condición para no romper compatibilidad cuando la propiedad no se envíe.

- [ ] **Step 5: Consolidar la auditoría principal**

Después de `loadSiteDetail`, registrar `newValue` u `oldValue/newValue` con `capabilities` ya resueltas en el snapshot sanitizado.

```ts
newValue: this.sanitizeSiteForAudit(after),
```

- [ ] **Step 6: Ejecutar la suite focalizada**

Run: `pnpm --filter @iwana/api test -- organization.service.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/organization/organization.service.ts apps/api/src/modules/organization/organization.service.spec.ts
git commit -m "feat: persist organization site capabilities atomically"
```

### Task 3: Extender el cliente tipado del portal

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Actualizar las interfaces tipadas del portal**

Agregar `capabilities?: OrganizationSiteCapability[]` a los DTOs del cliente.

```ts
export interface CreateOrganizationSiteDto {
  name: string;
  code: string;
  siteType: OrganizationSiteType;
  address?: string | null;
  municipality?: string | null;
  department?: string | null;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  isPrimary?: boolean;
  isActive?: boolean;
  capabilities?: OrganizationSiteCapability[];
}
```

- [ ] **Step 2: Mantener el endpoint legacy, pero dejar de usarlo en el flujo primario**

No borrar `organizationApi.replaceCapabilities()`. Solo asegurar que `create()` y `update()` ya soportan el payload completo.

- [ ] **Step 3: Ejecutar typecheck focalizado del portal**

Run: `pnpm --filter @iwana/portal typecheck`

Expected: PASS o errores únicamente en el siguiente task de UI aún no implementado.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/lib/api-client.ts
git commit -m "feat: extend portal organization dto contracts"
```

### Task 4: Extraer el modal unificado con tabs

**Files:**
- Create: `apps/portal/src/components/settings/OrganizationSiteDialog.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Optional create: `apps/portal/src/components/settings/OrganizationSiteDialog.spec.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`

- [ ] **Step 1: Escribir prueba de frontend para el flujo unificado**

Cubrir que el modal muestra tabs y que el submit envía también `capabilities`.

```tsx
it('should submit selected capabilities from the same site dialog', async () => {
  const { organizationApi } = jest.requireMock('@/lib/api-client') as {
    organizationApi: { create: jest.Mock };
  };

  render(<OrganizationSettingsClient />);

  fireEvent.click(await screen.findByRole('button', { name: 'Crear sede' }));

  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Nombre'), { target: { value: 'Sede norte' } });
  fireEvent.change(dialog.getByLabelText('Código'), { target: { value: 'NORTE' } });
  fireEvent.click(dialog.getByRole('tab', { name: 'Servicios' }));
  fireEvent.click(dialog.getByLabelText('Gestión administrativa'));
  fireEvent.click(dialog.getByRole('button', { name: 'Crear sede' }));

  await waitFor(() => {
    expect(organizationApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: [OrganizationSiteCapability.ADMIN_OFFICE],
      }),
    );
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar el fallo**

Run: `pnpm --filter @iwana/portal test -- OrganizationSettingsClient`

Expected: FAIL porque el diálogo actual no tiene tabs ni envía `capabilities` en `onSubmit()`.

- [ ] **Step 3: Extraer el diálogo a un componente enfocado**

Crear `OrganizationSiteDialog.tsx` con props mínimas.

```tsx
interface OrganizationSiteDialogProps {
  open: boolean;
  editingSiteId: string | null;
  defaultValues: SiteFormValues;
  draftCapabilities: OrganizationSiteCapability[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onCapabilitiesChange: (capabilities: OrganizationSiteCapability[]) => void;
  onSubmit: (values: SiteFormValues) => Promise<void> | void;
}
```

El componente debe contener:

- `DialogHeader` existente;
- tabs `Informacion de la sede` y `Servicios`;
- el formulario base actual;
- checkboxes de `capabilityOptions` dentro del tab `Servicios`.

- [ ] **Step 4: Hidratar y enviar `draftCapabilities` desde el submit principal**

En `OrganizationSettingsClient`, integrar el payload completo:

```ts
const payload: CreateOrganizationSiteDto | UpdateOrganizationSiteDto = {
  name: values.name.trim(),
  code: values.code.trim().toUpperCase(),
  siteType: values.siteType,
  address: values.address?.trim() || null,
  municipality: values.municipality?.trim() || null,
  department: values.department?.trim() || null,
  isPrimary: values.isPrimary,
  isActive: values.isActive,
  capabilities: draftCapabilities,
};
```

Al abrir creación, resetear `draftCapabilities` a `[]`. Al abrir edición, hidratarlo con `selectedSite.capabilities`.

- [ ] **Step 5: Ejecutar pruebas del diálogo y del cliente**

Run: `pnpm --filter @iwana/portal test -- OrganizationSettingsClient OrganizationSiteDialog`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/OrganizationSiteDialog.tsx apps/portal/src/components/settings/OrganizationSettingsClient.tsx apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx apps/portal/src/components/settings/OrganizationSiteDialog.spec.tsx
git commit -m "feat: unify organization site dialog and services"
```

### Task 5: Simplificar la vista principal de Organization

**Files:**
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`

- [ ] **Step 1: Escribir prueba de regresión visual/funcional de la vista**

Cubrir que ya no aparece el botón lateral `Guardar servicios` y que el panel lateral deja de ser el editor primario de servicios.

```tsx
it('should not render the separate save services action anymore', async () => {
  render(<OrganizationSettingsClient />);

  expect(await screen.findByText('Sede centro')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar servicios' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo**

Run: `pnpm --filter @iwana/portal test -- OrganizationSettingsClient`

Expected: FAIL mientras el panel lateral siga presente.

- [ ] **Step 3: Reducir la pantalla a tabla + acciones relevantes**

Quitar el bloque lateral de edición persistente y mantener acciones por sede desde tabla o cabecera contextual mínima.

```tsx
<PortalPanel
  title="Sedes registradas"
  description="Revisa y administra las sedes de tu empresa."
>
  {/* tabla existente */}
</PortalPanel>
```

Si se conserva una superficie secundaria, que sea solo de contexto resumido o acciones, no un editor duplicado de servicios.

- [ ] **Step 4: Eliminar el flujo primario `handleSaveCapabilities()`**

Remover o degradar la función para que el portal principal no dependa del endpoint separado.

```ts
// Eliminar handleSaveCapabilities del flujo principal de UI
```

- [ ] **Step 5: Ejecutar la suite del componente**

Run: `pnpm --filter @iwana/portal test -- OrganizationSettingsClient`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/OrganizationSettingsClient.tsx apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx
git commit -m "refactor: simplify organization settings layout"
```

### Task 6: Validación integrada y cierre documental

**Files:**
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

- [ ] **Step 1: Ejecutar validaciones integradas**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/api test -- organization
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal test -- OrganizationSettingsClient
```

Expected: PASS.

- [ ] **Step 2: Ejecutar validación E2E focalizada si el entorno está disponible**

Run:

```bash
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-organization-access.spec.ts
```

Expected: PASS, o bloqueo documentado si falta servidor/mocks del entorno.

- [ ] **Step 3: Actualizar el informe vivo con evidencia real**

Agregar en la sección 21 del informe:

- archivos implementados;
- comandos ejecutados;
- deprecación del endpoint legacy;
- deuda residual si el endpoint legacy se conserva por compatibilidad.

- [ ] **Step 4: Commit**

```bash
git add docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
git commit -m "docs: record organization modal unification rollout"
```

## Self-review checklist

- [ ] El plan cubre extensión de DTOs, persistencia atómica, UI unificada, compatibilidad legacy y pruebas.
- [ ] `capabilities` omitido y `capabilities: []` tienen tareas explícitas.
- [ ] No se introduce ningún cambio fuera de MOD00 Organization.
- [ ] El endpoint legacy queda deprecado, no eliminado.
- [ ] La vista principal deja de depender del editor lateral como flujo primario.
