# CRM WFM coordinate normalization implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the CRM installation CTA from sending PostgreSQL `numeric` coordinates as strings to the WFM visit-request endpoint.

**Architecture:** Normalize coordinates at `createCrmVisitRequestAndRoute`, the shared CRM-to-WFM boundary. The existing `parseOptionalCoordinate` helper accepts both API runtime representations (`number` and decimal `string`) and produces finite numbers. A pair outside WFM's geographic ranges, invalid, or incomplete is sent as `null`, preserving WFM's optional location contract without broadening it to numeric strings.

**Tech Stack:** Next.js App Router, TypeScript, Jest, Testing Library.

---

### Task 1: Capture the real API representation at the orchestration boundary

**Files:**

- Modify: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts`

- [x] **Step 1: Write the failing regression test**

Invoke `createCrmVisitRequestAndRoute` with a valid CRM UUID and runtime coordinates cast as strings:

```ts
await createCrmVisitRequestAndRoute({
  expedienteId: 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9',
  customerLabel: 'Cliente de prueba',
  municipality: 'EL_COLEGIO',
  address: 'Calle 1',
  latitude: '4,7110000',
  longitude: '-74,0721000',
  nextAction: 'schedule-now',
});

expect(visitRequestsCreateMock).toHaveBeenCalledWith(
  expect.objectContaining({ latitude: 4.711, longitude: -74.0721 }),
);
```

- [x] **Step 2: Verify the red state**

Run:

```powershell
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/visit-request-origin-orchestration.spec.ts
```

Expected: the test fails because the unmodified orchestration forwards the coordinate strings.

### Task 2: Normalize only at the CRM-to-WFM contract boundary

**Files:**

- Modify: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts`

- [x] **Step 1: Widen the runtime input type without changing WFM DTO types**

Allow `latitude` and `longitude` in the CRM orchestration input to be `number | string | null` because API data from PostgreSQL `numeric` can arrive as either representation.

- [x] **Step 2: Reuse the canonical parser before `wfmApi.visitRequests.create`**

```ts
const latitude = parseOptionalCoordinate(input.latitude);
const longitude = parseOptionalCoordinate(input.longitude);

latitude: latitude ?? null,
longitude: longitude ?? null,
```

Import `parseOptionalCoordinate` from `./scheduling-ui`. Do not change the WFM API DTO or relax server validation.

- [x] **Step 3: Verify green**

Run the Task 1 command again. Expected: pass; the WFM mock receives numeric coordinates.

### Task 3: Verify invalid coordinates do not form an invalid WFM payload

**Files:**

- Modify: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts`

- [x] **Step 1: Add an invalid-coordinate test**

Use `latitude: 'sin coordenada'` and `longitude: '-74.0721'`; assert the WFM client receives `latitude: null` and `longitude: null`. Repeat with an out-of-range pair such as `latitude: '91'` and assert the same atomic nulling behavior.

- [x] **Step 2: Run focused verification**

```powershell
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/visit-request-origin-orchestration.spec.ts
pnpm --filter @iwana/portal typecheck
```

Expected: both commands exit 0.

### Task 4: Update traceability and perform final gates

**Files:**

- Modify: `docs/informes/INFORME-MOD09-BUGFIX-CTA-COORDINACION-v1.0.md`

- [x] **Step 1: Record root cause and resolution**

Document the PostgreSQL `numeric` string representation, WFM's strict numeric DTO validation, the boundary normalization, and the tests run.

- [x] **Step 2: Review the scoped diff**

```powershell
git diff --check -- apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts docs/informes/INFORME-MOD09-BUGFIX-CTA-COORDINACION-v1.0.md
```

Expected: no whitespace errors.
