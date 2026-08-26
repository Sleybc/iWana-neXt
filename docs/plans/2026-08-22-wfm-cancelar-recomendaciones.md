# WFM Cancelar recomendaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local cancel action that clears calculated recommendations and their selection while preserving step-one search criteria and manual scheduling state.

**Architecture:** `VisitRequestRecommendationPanel` exposes an optional `onCancelRecommendations` callback and renders the secondary action only when recommendations exist. `PendingVisitRequestsView` and `SchedulingClient` own the callback implementation because they own the recommendation arrays and selected IDs. No API request is made when cancelling.

**Tech Stack:** Next.js, React 19, TypeScript strict, `@iwana/ui`, Jest Testing Library, pnpm.

---

### Task 1: Add the panel cancellation contract and UI

**Files:**

- Modify: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
- Test: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx`

- [ ] **Step 1: Add the failing panel test**

Extend `buildPanelProps` with `onCancelRecommendations: noop` and add a test with two recommendation fixtures. Assert that `Cancelar recomendaciones` is rendered, invoke it, and assert the callback is called once. Keep the existing empty-list test and assert the button is absent there.

```tsx
it('permite cancelar las recomendaciones calculadas', () => {
  const onCancelRecommendations = jest.fn();
  const recommendation = {
    technicianId: 'tech-1',
    scheduledStartAt: '2026-07-15T15:00:00.000Z',
    scheduledEndAt: '2026-07-15T17:00:00.000Z',
    score: 90,
    distanceKm: 1.2,
    totalScheduledMinutes: 120,
    labels: [],
  };

  render(
    <VisitRequestRecommendationPanel
      {...buildPanelProps({
        recommendations: [recommendation],
        selectedRecommendationId: 'tech-1::2026-07-15T15:00:00.000Z',
        onCancelRecommendations,
      })}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar recomendaciones' }));

  expect(onCancelRecommendations).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
pnpm.cmd --filter @iwana/portal exec jest src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx --runInBand
```

Expected: FAIL because the prop and button do not exist yet.

- [ ] **Step 3: Implement the panel callback and action**

Add this optional prop beside `onSelectRecommendation`:

```tsx
onCancelRecommendations?: () => void;
```

Destructure it in the component. In the recommendations branch, after the mapped list, render the secondary button only when the callback exists:

```tsx
{
  onCancelRecommendations ? (
    <div className="flex justify-end border-t border-gray-100 pt-2 dark:border-dark-border">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancelRecommendations}
        aria-label="Cancelar recomendaciones"
      >
        Cancelar recomendaciones
      </Button>
    </div>
  ) : null;
}
```

The action must be inside the `recommendations.length > 0` branch, so it cannot appear in the existing empty state.

- [ ] **Step 4: Run the panel tests to verify they pass**

Run the command from Step 2. Expected: all tests in `VisitRequestRecommendationPanel.spec.tsx` pass.

### Task 2: Clear recommendation state in both owners

**Files:**

- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`

- [ ] **Step 1: Add the pending-inbox clear handler**

In `PendingVisitRequestsView`, add a handler near `resetRecommendationState`:

```tsx
function handleCancelRecommendations() {
  setRecommendations([]);
  setSelectedRecommendationId(null);
  setRecommendationError(null);
}
```

Pass it to the panel:

```tsx
onCancelRecommendations = { handleCancelRecommendations };
```

Do not call `resetRecommendationState`, because that also clears `manualSelectionDraft`, which is outside the cancellation scope.

- [ ] **Step 2: Add the scheduling-client clear handler**

In `SchedulingClient`, add a local handler near `renderPendingDispatchPanel`:

```tsx
const handleCancelPendingRecommendations = () => {
  setPendingVisitRecommendations([]);
  setSelectedPendingRecommendationId(null);
  setPendingRecommendationError(null);
};
```

Pass it to the panel instance:

```tsx
onCancelRecommendations = { handleCancelPendingRecommendations };
```

Do not clear `pendingManualSelectionDraft`.

- [ ] **Step 3: Run portal typecheck**

Run:

```powershell
pnpm.cmd --filter @iwana/portal typecheck
```

Expected: exit code 0.

### Task 3: Regression validation and documentation

**Files:**

- Modify: `docs/informes/INFORME-MOD09-BUGFIX-SALIDA-DIRECTA-CONTROLES-IWANA-v1.0.md`

- [ ] **Step 1: Run the focused scheduling tests**

Run:

```powershell
pnpm.cmd --filter @iwana/portal exec jest src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx src/components/shared/TimeFieldSelect.spec.tsx src/components/scheduling/DispatchDrawerPortal.spec.tsx --runInBand
```

Expected: all tests in the three suites pass.

- [ ] **Step 2: Run formatting and lint**

Run:

```powershell
pnpm.cmd exec prettier --check apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx apps/portal/src/components/scheduling/SchedulingClient.tsx
pnpm.cmd --filter @iwana/portal exec eslint src/components/scheduling/VisitRequestRecommendationPanel.tsx src/components/scheduling/PendingVisitRequestsView.tsx src/components/scheduling/SchedulingClient.tsx
```

Expected: Prettier passes; ESLint has zero errors. Existing hook warnings may remain and must be reported, not suppressed as part of this change.

- [ ] **Step 3: Update the live report**

Add the cancellation behavior and the final test/typecheck results to `INFORME-MOD09-BUGFIX-SALIDA-DIRECTA-CONTROLES-IWANA-v1.0.md`.

- [ ] **Step 4: Run diff validation**

Run:

```powershell
git diff --check -- apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx apps/portal/src/components/scheduling/SchedulingClient.tsx docs/informes/INFORME-MOD09-BUGFIX-SALIDA-DIRECTA-CONTROLES-IWANA-v1.0.md
```

Expected: no output and exit code 0.
