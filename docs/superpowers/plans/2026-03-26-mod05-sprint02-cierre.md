# MOD05 Sprint 02 Cierre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los gaps reales restantes de Sprint 02 de MOD05 CRM sobre el estado actual del repo, con cambios mínimos y trazables en backend, frontend, pruebas y documentación viva.

**Architecture:** Se preserva el flujo vigente de `expedientes` como eje principal y solo se corrigen gaps funcionales reales contra PRD v2.0, addendum v2.1, HLD v2.0, ADR-024, sprint plan y prompt Fase 02 v1.1. No se reestructura por alineación literal; se priorizan boundary limpio con MOD03, PII zero-trust, pruebas de cierre y evidencia documental.

**Tech Stack:** NestJS, Next.js App Router, TypeScript, TypeORM, PostgreSQL multi-tenant por schema, Jest, Playwright.

---

### Task 1: Backend - filtros, asignación y summary reales

**Files:**

- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/dto/assign-expediente.dto.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

- [ ] **Step 1: Write the failing controller/service tests**

Add tests for:

```ts
it('propaga assignedTo y documentNumber al listado', async () => {
  await controller.findAll(undefined, undefined, 'Cliente', 1, 20, 'advisor-1', '900123456');

  expect(expedienteServiceMock.findAll).toHaveBeenCalledWith(
    expect.objectContaining({
      assignedTo: 'advisor-1',
      documentNumber: '900123456',
    }),
  );
});

it('calcula el summary desde el servicio sin truncar por limit artificial', async () => {
  expedienteServiceMock.getPipelineSummary.mockResolvedValue({
    data: { NUEVO_POTENCIAL: 1 },
    total: 1,
  });

  const result = await pipelineController.getSummary();

  expect(expedienteServiceMock.getPipelineSummary).toHaveBeenCalled();
  expect(result.total).toBe(1);
});
```

And service tests for:

```ts
it('filtra por assignedTo y documentNumber exacto sin exponer PII', async () => {
  const result = await service.findAll({
    assignedTo: 'advisor-1',
    documentNumber: '900123456',
    page: 1,
    limit: 10,
  });

  expect(result.data[0]?.documentNumberEncrypted).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: FAIL because `assignedTo`, `documentNumber` and `getPipelineSummary` are not fully wired yet.

- [ ] **Step 3: Implement the minimal backend changes**

Implement only:

```ts
// controller
@Query('assignedTo') assignedTo?: string,
@Query('documentNumber') documentNumber?: string,

// service filters
assignedTo?: string;
documentNumber?: string;

if (assignedTo) query.andWhere('expediente.assignedTo = :assignedTo', { assignedTo });

// exact document search after decrypt, keeping current query builder intact
```

Also add a dedicated `getPipelineSummary()` service method and make the pipeline controller use it instead of `findAll({ limit: 1000 })`.

Keep `AssignExpedienteDto` focused; only add runtime validation support if needed for the failing tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: PASS.

---

### Task 2: Frontend - filtros reales, acceso operativo y señales de compliance

**Files:**

- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `apps/portal/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the failing UI/API assertions in the CRM Playwright spec first**

Use the new spec from Task 3 as the frontend red test before changing UI:

```ts
test('lista CRM envía assignedTo y documentNumber en filtros', async ({ page }) => {
  // intercept request and assert query params
});

test('sidebar expone acceso a CRM operativo', async ({ page }) => {
  await expect(page.getByRole('link', { name: /crm/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the new test/spec to verify failure**

Run the targeted Playwright spec once created:

`pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: FAIL before the UI/API changes.

- [ ] **Step 3: Implement the minimal frontend changes**

Implement only:

```ts
// api-client
listExpedientes(filters?: {
  status?: ExpedienteStatus;
  municipality?: string;
  search?: string;
  assignedTo?: string;
  documentNumber?: string;
  page?: number;
  limit?: number;
})
```

In the list page, add compact filters for `assignedTo` and `documentNumber` without rediseñar the screen.

In the detail page, surface existing compliance signals with minimal UI, for example:

- `assignedTo`
- `dataConsentRevoked`

In the sidebar, add the enabled CRM entry pointing to `/dashboard/crm`.

- [ ] **Step 4: Re-run the targeted spec**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: PASS for the new assertions.

---

### Task 3: E2E - flujo vigente CRM y hardening de cierre

**Files:**

- Create: `e2e/tests/portal-crm-expedientes.spec.ts`
- Optionally Modify: `e2e/tests/portal-dashboard-empresa.spec.ts`

- [ ] **Step 1: Write the failing Playwright spec covering the real closure gaps**

Create a mocked E2E spec that proves:

```ts
test('CRM permite crear, listar y abrir detalle del expediente', async ({ page }) => {});
test('CRM oculta PII en listados y mantiene detalle operativo', async ({ page }) => {});
test('CRM permite revocar consentimiento y refleja el hardening visual', async ({ page }) => {});
test('CRM envía filtros assignedTo y documentNumber al backend', async ({ page }) => {});
test('CRM permite registrar intento de contacto y lo refleja en timeline', async ({ page }) => {});
```

Use fake data only, mocking `/api/v1/crm/**` and auth/session like the other portal specs.

- [ ] **Step 2: Run the new E2E spec to verify failure**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: FAIL before the UI/backend contract changes land.

- [ ] **Step 3: Implement only the minimum support required by the spec**

Keep the mocked E2E focused on the current portal flow. Do not create backend-dependent E2E setup if route mocking is enough to prove the gate.

- [ ] **Step 4: Run the targeted E2E again**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: PASS.

---

### Task 4: Documentación viva de cierre Sprint 02

**Files:**

- Modify: `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

- [ ] **Step 1: Add the failing evidence checklist in the report draft**

Before editing, identify the exact gaps being closed in this pass:

```md
- filtros assignedTo/documentNumber
- summary sin truncamiento artificial
- acceso CRM en sidebar
- señales mínimas de compliance en detalle
- evidencia E2E del flujo vigente
```

- [ ] **Step 2: Update the report with only the new closure evidence**

Document:

- what was pending when this execution started
- what was closed now
- what commands were run
- whether Sprint 02 gates are met or which residual risk remains

- [ ] **Step 3: Verify the report content is consistent with the code and tests**

Re-read:

- `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`
- `docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md`
- `docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md`
- `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md`

Expected: report states only the real closure status, not aspirational claims.

---

### Task 5: Verificación final de cierre real

**Files:**

- Verify only

- [ ] **Step 1: Run backend targeted verification**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente-boundary-dto.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run CRM E2E verification**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: PASS.

- [ ] **Step 3: Run a focused build/type verification for the touched apps**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand
pnpm --filter @iwana/portal build
```

- [ ] **Step 4: Report actual closure state with evidence**

State only what the fresh command output proves about Sprint 02 closure and remaining risks.
