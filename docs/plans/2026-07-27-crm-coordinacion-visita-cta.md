# CRM coordination visit CTA implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `Coordinar visita de instalación` CTA create or reuse the CRM visit request and open the WFM agenda instead of navigating to an in-page anchor.

**Architecture:** The CRM page owns the interaction, loading state, eligibility guard and feedback. It reuses `createCrmVisitRequestAndRoute`, which owns the idempotent Assurance ticket plus WFM request; WFM owns the later technician and slot confirmation. No HTTP contract or persistence change is needed.

**Tech Stack:** Next.js App Router client page, React, TypeScript, Jest + Testing Library, Playwright.

---

### Task 1: Specify the regression at the CRM page boundary

**Files:**

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/expediente-scheduling.spec.ts`

- [x] **Step 1: Mock the existing orchestration at the page boundary**

Add the import and mock beside the existing router mocks:

    import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';

    jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
      createCrmVisitRequestAndRoute: jest.fn(),
    }));

    const createCrmVisitRequestAndRouteMock = jest.mocked(createCrmVisitRequestAndRoute);

- [x] **Step 2: Write the failing page regression test**

Add a ready expediente fixture (`status: 'LISTO_PARA_INSTALACION'`, completeness `overall: 80`, `canTransition: true`) and resolve the orchestration mock with:

    {
      visitRequest: { id: 'vr-001' } as never,
      href: '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    }

Render the page, activate the first `Coordinar visita de instalación` button, and assert:

    expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expedienteId: 'exp-1',
        customerLabel: 'Juan Perez',
        municipality: 'EL_COLEGIO',
        address: 'Calle 1',
        nextAction: 'schedule-now',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    );

- [x] **Step 3: Write the eligibility test**

With the existing default non-eligible fixture, assert the first `Coordinar visita de instalación` button is disabled and the orchestration mock was not called.

- [x] **Step 4: Run the failure first**

Run `pnpm --filter @iwana/portal test -- --runInBand "crm/expedientes/.*/page.spec.tsx"`.

Expected: the new routing assertion fails because the current CTA only pushes `#programacion`.

- [x] **Step 5: Remove the obsolete ancla assertion**

Remove the `buildSchedulingHref` import and its `#programacion` assertion from `expediente-scheduling.spec.ts`. Keep the eligibility and missing-operational-reference tests.

### Task 2: Route the CRM detail CTA through the visit-request orchestration

**Files:**

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/expediente-scheduling.ts`

- [x] **Step 1: Add the helper and submit state**

Replace the `buildSchedulingHref` import with `createCrmVisitRequestAndRoute` and add:

    const [isCoordinatingInstallation, setIsCoordinatingInstallation] = useState(false);

- [x] **Step 2: Implement one guarded handler before `handleTransition`**

    const handleCoordinateInstallation = async () => {
      if (!expediente || !canCoordinateInstallationVisit || isCoordinatingInstallation) return;

      try {
        setIsCoordinatingInstallation(true);
        setActionMessage(null);
        const result = await createCrmVisitRequestAndRoute({
          expedienteId: expediente.id,
          customerLabel: expediente.fullName,
          municipality: expediente.municipality ?? undefined,
          address: expediente.address ?? undefined,
          latitude: expediente.latitude ?? null,
          longitude: expediente.longitude ?? null,
          nextAction: 'schedule-now',
        });
        router.push(result.href);
      } catch (coordinationError) {
        setActionMessageTone('error');
        setActionMessage(
          coordinationError instanceof ApiError
            ? coordinationError.message
            : 'No fue posible coordinar la visita de instalación. Intenta de nuevo.',
        );
      } finally {
        setIsCoordinatingInstallation(false);
      }
    };

- [x] **Step 3: Wire every entry to the handler**

For the two visible CTAs replace the hash navigation with:

    onClick={() => void handleCoordinateInstallation()}
    disabled={!canCoordinateInstallationVisit || isCoordinatingInstallation}

In the `INSTALACION_AGENDADA` transition recovery, preserve the informational message and call `void handleCoordinateInstallation()` instead of pushing the ancla URL.

- [x] **Step 4: Remove the obsolete helper**

Delete `buildSchedulingHref` from `expediente-scheduling.ts`, then run `rg -n "buildSchedulingHref" apps/portal/src`. Expected: no matches.

- [x] **Step 5: Verify green**

Run `pnpm --filter @iwana/portal test -- --runInBand "crm/expedientes/.*/page.spec.tsx" src/components/crm/expedientes/expediente-scheduling.spec.ts src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx src/components/scheduling/visit-request-origin-orchestration.spec.ts`.

Expected: PASS; the page sends the CRM request and opens the agenda URL.

### Task 3: Prove the user flow in portal E2E

**Files:**

- Modify: `e2e/tests/portal-crm-expedientes.spec.ts`

- [x] **Step 1: Add an installation-ready CRM fixture**

Create a fixture from `mockExpediente` with `status: 'LISTO_PARA_INSTALACION'`, `pipelineProgress: 80`, and `completenessOverall: 80`. For this test, the expediente endpoint returns `installationReadiness` with `status: 'READY_COMPLETE'`, `canTransition: true`, and an empty `missingRequirements` list.

- [x] **Step 2: Mock and capture the two orchestration requests**

In `setupCrmMocks`, add route handlers for `POST /api/v1/assurance/tickets/find-or-create-installation` and `POST /api/v1/wfm/visit-requests`. Capture the visit-request `postDataJSON()` and return a response whose `id` is `vr-crm-001`.

- [x] **Step 3: Add the E2E regression**

    test('admin coordina una instalación desde el detalle CRM', async ({ page }) => {
      await setAuthSession(page);
      await setupCrmMocks(page);

      await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
      await page.getByRole('button', { name: 'Coordinar visita de instalación' }).first().click();

      await expect(page).toHaveURL(
        /\/dashboard\/scheduling\/agenda\?source=pending-visits&visitRequestId=vr-crm-001/,
      );
      expect(capturedVisitRequestPayload).toMatchObject({
        originContext: 'CRM',
        expedienteId: mockExpediente.id,
        workType: 'INSTALLATION',
      });
    });

- [x] **Step 4: Run the E2E regression**

Run `pnpm test:e2e:portal -- portal-crm-expedientes.spec.ts -g "coordina una instalación desde el detalle CRM"`.

Expected: PASS, including the Assurance/WFM sequence and the selected agenda handoff.

### Task 4: Perform UI, type, and documentation gates

**Files:**

- Create: `docs/informes/INFORME-MOD09-BUGFIX-CTA-COORDINACION-v1.0.md`

- [x] **Step 1: Audit the changed UI**

Run `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs "apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx"`.

Expected: no new deterministic P0/P1 findings. Preserve the iWana Button primitives, Spanish labels, focus behavior, disabled state, and operational feedback.

- [x] **Step 2: Typecheck and lint portal**

Run:

    pnpm --filter @iwana/portal typecheck
    pnpm --filter @iwana/portal lint

Expected: both exit with code 0.

- [x] **Step 3: Create the implementation report**

Create `docs/informes/INFORME-MOD09-BUGFIX-CTA-COORDINACION-v1.0.md` with version, status, date, approved-design traceability, root cause, files changed, commands/results, identity evidence, and the explicit out-of-scope `SALES` Assurance permission alignment.

- [x] **Step 4: Review the final diff**

Run:

    git diff --check
    git diff -- "apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx" "apps/portal/src/components/crm/expedientes/expediente-scheduling.ts" "apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx" "e2e/tests/portal-crm-expedientes.spec.ts" docs/informes/INFORME-MOD09-BUGFIX-CTA-COORDINACION-v1.0.md

Expected: no whitespace errors and changes limited to the approved behavior, tests, and report.
