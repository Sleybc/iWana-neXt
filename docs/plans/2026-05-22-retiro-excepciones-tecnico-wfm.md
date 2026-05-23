# Retiro Excepciones Tecnico WFM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar de WFM la capacidad visible y contractual de Excepciones por tecnico, dejando field operations enfocada en horarios estructurales y cierres especiales.

**Architecture:** El cambio aplica un corte limpio aprobado por ADR-041. WFM conserva agenda, horarios estructurales, cierres especiales y recomendaciones; las reglas personales recurrentes salen del producto WFM y quedan reservadas para RR. HH. futuro.

**Approval:** CTO aprobado el 2026-05-22.

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant por schema, Next.js App Router, Jest, Playwright, pnpm/Turborepo.

---

## Source Artifacts

- ADR: `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md`
- Spec: `docs/specs/2026-05-22-mod09-wfm-field-operations-sin-excepciones-design.md`
- PRD: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- HLD: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Prompt: `docs/prompts/PROMPT-MOD09-RETIRO-EXCEPCIONES-TECNICO-v1.0.md`
- Informe vivo: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`

## File Map

### Frontend portal

- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
- Modify: `apps/portal/src/components/settings/FieldOperationsSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

### Backend API

- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/wfm.module.ts`
- Modify: `apps/api/src/modules/wfm/services/operating-window-resolver.service.ts`
- Delete: `apps/api/src/modules/wfm/services/technician-business-overrides.service.ts`
- Delete: `apps/api/src/modules/wfm/dto/create-technician-business-override.dto.ts`
- Delete: `apps/api/src/modules/wfm/dto/update-technician-business-override.dto.ts`
- Modify: `apps/api/src/modules/wfm/tests/operating-window-resolver.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm.controller.http.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm.tenant-isolation.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm-organization-sites.controller.http.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts`

### Database/package exports

- Delete or deprecate: `packages/database/src/entities/wfm-technician-business-override.entity.ts`
- Modify exports that re-export `WfmTechnicianBusinessOverride`
- Create tenant migration: `packages/database/src/migrations/tenant/<next>_drop_wfm_technician_business_overrides.ts`

### E2E

- Modify: `e2e/tests/portal-settings-empresa.spec.ts`
- Modify: `e2e/tests/portal-settings-wfm-organization-sites.spec.ts`
- Modify: `e2e/tests/portal-settings-federated-shell.spec.ts`

## Task 1: Portal UI sin Excepciones por tecnico

**Files:**

- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
- Modify: `apps/portal/src/components/settings/FieldOperationsSettingsClient.tsx`
- Test: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`

- [ ] **Step 1: Actualizar prueba de ausencia de seccion**

Agregar una expectativa que falle mientras la seccion siga visible:

```tsx
expect(screen.queryByText('Excepciones por técnico')).not.toBeInTheDocument();
expect(screen.queryByText('Nueva excepción')).not.toBeInTheDocument();
```

- [ ] **Step 2: Ejecutar test focalizado y confirmar falla**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/settings/WfmOperatingHoursManager.spec.tsx
```

Expected: FAIL por textos visibles de excepciones.

- [ ] **Step 3: Retirar estado, formulario y handlers de overrides**

En `WfmOperatingHoursManager.tsx`, eliminar:

```ts
WfmTechnicianBusinessOverride
OverrideFormState
createEmptyOverrideForm
const [overrides, setOverrides]
const [overrideForm, setOverrideForm]
const [isSavingOverride, setIsSavingOverride]
overrideSchema
handleSubmitOverride
handleEditOverride
handleDeleteOverride
technicianOptions
recurrenceOptions usado solo por overrides
technicianNameMap usado solo por overrides
```

- [ ] **Step 4: Retirar carga de API de overrides**

Cambiar el `loadManager()` para no llamar `wfmApi.technicianBusinessOverrides.list()` ni `usersApi.list()` si los usuarios ya no se necesitan en esta pantalla.

Expected shape:

```ts
const [[nextCompanyWeek, nextBlackouts], nextDispatchSites] = await Promise.all([
  Promise.all([
    wfmApi.businessHours.getCompany(),
    wfmApi.holidayBlackouts.list(),
  ]),
  wfmApi.dispatchSites.list().catch(() => []),
]);
```

- [ ] **Step 5: Retirar JSX de la seccion**

Eliminar el bloque visible completo cuyo titulo es `Excepciones por técnico`, incluyendo estado vacio, listado y formulario `Nueva excepción`.

- [ ] **Step 6: Actualizar copy de pantalla**

En `FieldOperationsSettingsClient.tsx`, cambiar copy para que no mencione excepciones por tecnico:

```tsx
description="Configura horarios operativos y cierres especiales de la agenda."
```

- [ ] **Step 7: Ejecutar test focalizado y confirmar pase**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/settings/WfmOperatingHoursManager.spec.tsx
```

Expected: PASS.

## Task 2: Portal API client sin contrato de overrides

**Files:**

- Modify: `apps/portal/src/lib/api-client.ts`
- Test: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`

- [ ] **Step 1: Retirar tipos frontend**

Eliminar interfaces:

```ts
WfmTechnicianBusinessOverride
CreateWfmTechnicianBusinessOverrideDto
UpdateWfmTechnicianBusinessOverrideDto
```

- [ ] **Step 2: Retirar namespace API**

Eliminar de `wfmApi`:

```ts
technicianBusinessOverrides: {
  list
  create
  update
  remove
}
```

- [ ] **Step 3: Actualizar mocks de tests portal**

Eliminar del mock `wfmApiMock` el objeto `technicianBusinessOverrides` y cualquier `mockResolvedValue([])` asociado.

- [ ] **Step 4: Typecheck portal**

Run:

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: PASS sin referencias a `technicianBusinessOverrides`.

## Task 3: Backend controller sin endpoints publicos

**Files:**

- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Test: `apps/api/src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts`

- [ ] **Step 1: Escribir prueba de endpoint retirado**

Ajustar o crear expectativa para que `GET /api/v1/wfm/technician-business-overrides` ya no exista.

Expected behavior recomendado:

```ts
await request(app.getHttpServer())
  .get('/api/v1/wfm/technician-business-overrides')
  .set(authHeaders)
  .expect(404);
```

- [ ] **Step 2: Ejecutar prueba y confirmar falla inicial**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts
```

Expected: FAIL si endpoint aun responde.

- [ ] **Step 3: Retirar endpoints del controller**

Eliminar los metodos decorados con:

```ts
@Get('technician-business-overrides')
@Post('technician-business-overrides')
@Patch('technician-business-overrides/:id')
@Delete('technician-business-overrides/:id')
```

Eliminar imports e inyeccion de `TechnicianBusinessOverridesService`, `CreateTechnicianBusinessOverrideDto` y `UpdateTechnicianBusinessOverrideDto`.

- [ ] **Step 4: Ejecutar prueba y confirmar pase**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts
```

Expected: PASS.

## Task 4: Backend module y servicio retirados

**Files:**

- Modify: `apps/api/src/modules/wfm/wfm.module.ts`
- Delete: `apps/api/src/modules/wfm/services/technician-business-overrides.service.ts`
- Delete: `apps/api/src/modules/wfm/dto/create-technician-business-override.dto.ts`
- Delete: `apps/api/src/modules/wfm/dto/update-technician-business-override.dto.ts`
- Modify tests that provide `TechnicianBusinessOverridesService`

- [ ] **Step 1: Retirar provider y entidad del modulo**

En `wfm.module.ts`, eliminar imports y referencias a:

```ts
WfmTechnicianBusinessOverride
TechnicianBusinessOverridesService
```

- [ ] **Step 2: Eliminar servicio y DTOs**

Borrar archivos de servicio y DTOs listados.

- [ ] **Step 3: Actualizar tests con providers obsoletos**

Eliminar providers mock de `TechnicianBusinessOverridesService` en:

```text
apps/api/src/modules/wfm/tests/wfm-organization-sites.controller.http.spec.ts
apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts
apps/api/src/modules/wfm/tests/wfm.tenant-isolation.spec.ts
apps/api/src/modules/wfm/tests/wfm.controller.http.spec.ts
```

- [ ] **Step 4: Typecheck API**

Run:

```bash
pnpm --filter @iwana/api typecheck
```

Expected: PASS.

## Task 5: Resolver sin precedencia de override tecnico

**Files:**

- Modify: `apps/api/src/modules/wfm/services/operating-window-resolver.service.ts`
- Test: `apps/api/src/modules/wfm/tests/operating-window-resolver.service.spec.ts`

- [ ] **Step 1: Actualizar pruebas de precedencia**

Eliminar casos que esperan `TECHNICIAN_OVERRIDE`. Agregar casos para:

```ts
expect(result.source).toBe('HOLIDAY_BLACKOUT');
expect(result.status).toBe('CLOSED');
```

cuando existe blackout aplicable.

- [ ] **Step 2: Cambiar contrato de salida**

Eliminar `TECHNICIAN_OVERRIDE` de `OperatingWindowResult['source']`.

- [ ] **Step 3: Eliminar busqueda de override**

Retirar del resolver:

```ts
findTechnicianOverride
toOverrideResult
sortBySiteSpecificity si queda sin uso
import WfmTechnicianBusinessOverride
```

El flujo debe iniciar por `findHolidayBlackout()` y luego resolver horarios estructurales.

- [ ] **Step 4: Ejecutar tests del resolver**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/operating-window-resolver.service.spec.ts
```

Expected: PASS.

## Task 6: Database cleanup

**Files:**

- Delete or deprecate: `packages/database/src/entities/wfm-technician-business-override.entity.ts`
- Modify package exports in `packages/database/src/**`
- Create: `packages/database/src/migrations/tenant/<next>_drop_wfm_technician_business_overrides.ts`

- [ ] **Step 1: Localizar exports de entidad**

Run:

```bash
rg "WfmTechnicianBusinessOverride|wfm-technician-business-override" packages/database/src
```

Expected: lista acotada de entity y exports.

- [ ] **Step 2: Retirar entity de exports y metadata TypeORM**

Eliminar referencias a `WfmTechnicianBusinessOverride` del paquete database y cualquier lista de entidades.

- [ ] **Step 3: Crear migracion reversible**

La migracion debe hacer backup estructural antes del drop o conservar rollback con recreacion de tabla. Patron minimo:

```ts
export class DropWfmTechnicianBusinessOverridesXXXXXXXXXXXX implements MigrationInterface {
  name = 'DropWfmTechnicianBusinessOverridesXXXXXXXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "wfm_technician_business_overrides"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wfm_technician_business_overrides" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "organization_site_id" uuid,
        "override_date" date,
        "weekday" varchar,
        "start_time" time,
        "end_time" time,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "reason" varchar(180),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}
```

- [ ] **Step 4: Typecheck database**

Run:

```bash
pnpm --filter @iwana/db typecheck
```

Expected: PASS.

## Task 7: E2E y mocks sin endpoint retirado

**Files:**

- Modify: `e2e/tests/portal-settings-empresa.spec.ts`
- Modify: `e2e/tests/portal-settings-wfm-organization-sites.spec.ts`
- Modify: `e2e/tests/portal-settings-federated-shell.spec.ts`

- [ ] **Step 1: Retirar route mocks de endpoint eliminado**

Eliminar handlers para:

```ts
/wfm/technician-business-overrides
```

- [ ] **Step 2: Agregar asercion visual negativa**

En el flujo de field operations, agregar:

```ts
await expect(page.getByText('Excepciones por técnico')).toHaveCount(0);
await expect(page.getByText('Nueva excepción')).toHaveCount(0);
```

- [ ] **Step 3: Ejecutar E2E focalizado**

Run:

```bash
pnpm exec playwright test -c e2e/playwright.portal.config.ts --grep "field operations|settings"
```

Expected: PASS o skip documentado si el entorno E2E requiere credenciales no disponibles.

## Task 8: Barrido final

**Files:**

- Entire repo source, excluding generated outputs

- [ ] **Step 1: Barrer referencias fuente**

Run:

```bash
rg "technician-business-overrides|technicianBusinessOverrides|WfmTechnicianBusinessOverride|Excepciones por técnico|Nueva excepción" apps packages e2e docs --glob '!**/.next/**' --glob '!**/dist/**' --glob '!**/coverage/**'
```

Expected: solo referencias historicas en ADR/spec/plan/prompt de retiro o ninguna referencia runtime.

- [ ] **Step 2: Ejecutar verificaciones focalizadas**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/operating-window-resolver.service.spec.ts src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts
pnpm --filter @iwana/portal test -- --runInBand src/components/settings/WfmOperatingHoursManager.spec.tsx
```

Expected: PASS.

- [ ] **Step 3: Actualizar informe vivo y evidencia quality**

Agregar en `docs/informes/INFORME-MOD09-FASE-02-v1.0.md` una correccion posterior con comandos ejecutados y resultado. Crear o actualizar evidencia en `docs/quality/` si el repo ya tiene checklist activo para MOD09.

## Self-review checklist

- La UI no menciona excepciones por tecnico.
- No quedan endpoints publicos de `technician-business-overrides`.
- El resolver no da prioridad a reglas personales manuales.
- Las migraciones son reversibles.
- `TechnicianAvailability` no se promociona como sustituto visible.
- PRD, HLD, ADR, spec, plan, prompt e informe vivo quedan alineados.
