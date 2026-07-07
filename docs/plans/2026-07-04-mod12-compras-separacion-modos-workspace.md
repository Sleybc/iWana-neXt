# MOD12 Compras Separacion de Modos Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar la bandeja operativa y la creacion de solicitudes en dos modos explicitos dentro de la pestana `Compras`, preservando el workspace hibrido y mejorando foco, jerarquia y responsive.

**Architecture:** La implementacion se concentra en `PurchaseWorkspace` como orquestador de modos y en `PurchaseRequestComposer` como canvas de captura. No requiere cambios backend; el trabajo principal es de composicion de pantalla, estado UI, variantes de layout y pruebas de modo/flujo.

**Tech Stack:** Next.js App Router, React, TypeScript strict, `@iwana/ui`, primitives del portal, Jest, Testing Library, pnpm.

---

## File Map

- Modify `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseWorkspaceSummary.tsx` only if the summary must hide or adapt in create mode
- Modify `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseRequestsToolbar.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseRequestsTable.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseCatalogBulkTable.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseSuggestionList.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseSelectionBar.tsx` if the create-mode footer and selection bar need hierarchy adjustments
- Modify `apps/portal/src/components/inventory/InventoryClient.tsx`
- Create `apps/portal/src/components/inventory/PurchaseCreateModeHeader.tsx`
- Create `apps/portal/src/components/inventory/PurchaseCreateModeShell.tsx`
- Modify `apps/portal/src/components/inventory/InventoryClient.spec.tsx`
- Modify `apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx`
- Create `docs/informes/INFORME-MOD12-COMPRAS-SEPARACION-MODOS-v1.0.md`

---

## Task 1: Freeze create-mode behavior with failing workspace tests

**Files:**
- Modify: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Add a failing test that hides the full request tray when create mode opens**

Add a test that:

- enters `Compras`,
- opens `Nueva solicitud`,
- asserts that the create header is visible,
- asserts that `Bandeja de solicitudes` is no longer rendered as the main panel while the mode is active.

- [ ] **Step 2: Add a failing test that returns cleanly from create mode to the tray**

Add a test that:

- opens create mode,
- clicks `Volver a la bandeja`,
- verifies the main tray panel becomes visible again,
- verifies create-mode-specific header is gone.

- [ ] **Step 3: Add a failing mobile test for two real steps**

Add a test that:

- forces mobile media,
- opens `Nueva solicitud`,
- verifies step 1 content is visible,
- advances to step 2,
- verifies review/justification content is visible,
- verifies the tray is not visible during either step.

- [ ] **Step 4: Run the focused workspace tests**

Run:

```powershell
pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx
```

Expected:

- create-mode assertions fail because the current workspace still renders tray and composer as competing surfaces;
- mobile step assertions fail because the current flow is a single scrollable experience.

- [ ] **Step 5: Add failing tests for orchestration safety**

Cover at least:

- desktop keeps an entry CTA visible for `Nueva solicitud`,
- create error keeps the user in create mode,
- returning to tray preserves active filters,
- create and workbench do not coexist as dominant surfaces.

---

## Task 2: Introduce explicit mode orchestration in PurchaseWorkspace

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseCreateModeShell.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseCreateModeHeader.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseRequestsToolbar.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseRequestsTable.tsx`

- [ ] **Step 1: Add an explicit workspace mode model**

Refactor `PurchaseWorkspace` to use a mode state such as:

- `tray`
- `create`

Use a single source of truth so that:

- tray content renders only in `tray`,
- create shell renders only in `create`.

Recommended naming:

- `workspaceMode: 'inbox' | 'create'`

- [ ] **Step 2: Build a dedicated create-mode shell**

Create `PurchaseCreateModeShell.tsx` to own:

- top create header,
- create canvas container,
- spacing and max-width rules,
- optional mobile step framing.

This shell must not know tray internals.

- [ ] **Step 3: Build a create-mode header**

Create `PurchaseCreateModeHeader.tsx` with:

- title `Nueva solicitud de compra`,
- secondary copy,
- `Volver a la bandeja`,
- optional lightweight draft count.

The header should be visually lighter than a page hero and denser than a generic modal header.

- [ ] **Step 4: Wire transitions**

In `PurchaseWorkspace`:

- `Nueva solicitud` opens `create` mode;
- `Volver a la bandeja` returns to `tray` mode;
- successful submit returns to `tray` mode;
- create mode should close any competing workbench selection surface.

- [ ] **Step 5: Restore a desktop-visible creation entry point**

Today the toolbar CTA is hidden in `xl`. The fullstack must:

- keep one desktop-visible CTA for `Nueva solicitud`,
- reuse the same handler from toolbar and empty state,
- avoid split-only assumptions where the composer is always mounted.

- [ ] **Step 6: Keep the workbench drawer from competing with create mode**

Enforce one dominant surface:

- when entering create mode, close or suppress the selected request workbench;
- when a request is selected from tray mode, do not show create mode.

- [ ] **Step 7: Preserve tray filters and KPI state**

The fullstack must hide tray surfaces without resetting:

- `filters`,
- KPI preset,
- result counts,
- tray continuity on return.

- [ ] **Step 8: Run the workspace test slice again**

Run:

```powershell
pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx
```

Expected:

- tray/create mode tests move closer to green;
- mobile step test still fails until the composer is split into steps.

---

## Task 3: Reshape PurchaseRequestComposer for takeover mode

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx`

- [ ] **Step 1: Add a `mode` or `presentation` prop for create takeover**

Introduce a prop that lets the composer render as:

- embedded panel legacy variant when needed,
- create takeover variant for the new workspace mode.

The new variant should assume it is the primary canvas, not a secondary panel.

- [ ] **Step 2: Make the request header compact and subordinate**

Reduce the visual weight of `Datos de la solicitud` so it behaves as context, not as the first dominant block.

Expected layout behavior:

- compact header row or compact grid,
- `Agregar productos` becomes the first dominant area,
- justification remains near closing actions.

- [ ] **Step 3: Split mobile into two explicit steps**

Add create-step state such as:

- `capture`
- `review`

Rules:

- step 1 shows compact request context + product capture;
- step 2 shows selected lines + justification + summary;
- step navigation is explicit and visible;
- CTA remains sticky and safe.

- [ ] **Step 4: Keep desktop as one focused canvas**

Desktop should still show capture and review in one flow, but:

- no tray panel nearby,
- stronger hierarchy between capture and review,
- sticky footer preserved.

- [ ] **Step 5: Add or update focused composer tests**

Cover:

- create takeover header actions,
- mobile step transition,
- dominant `Agregar productos` visibility,
- absence of tray-specific competing content.

- [ ] **Step 6: Run the composer and workspace tests**

Run:

```powershell
pnpm --filter @iwana/portal test -- PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx
```

Expected:

- create-mode tests pass;
- mobile step tests pass;
- existing capture tests remain green.

---

## Task 4: Make create success and error outcomes explicit

**Files:**
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Refactor the create-request contract so the parent can tell success from failure**

Current behavior catches the error in `InventoryClient` and does not rethrow, which makes `PurchaseWorkspace` unable to distinguish success from failure.

Implement one of these approved approaches:

- rethrow on error after setting UI error state, or
- return an explicit outcome object such as `{ ok: boolean; requestId?: string }`.

Preferred option:

- explicit outcome object, because it keeps the parent flow deterministic.

- [ ] **Step 2: Update `PurchaseWorkspace` to close create mode only on verified success**

Rules:

- success returns to tray mode,
- failure keeps the user in create mode,
- the error remains visible in the composer.

- [ ] **Step 3: Add regression tests for success and failure**

Cover:

- failed create does not exit create mode,
- successful create exits create mode,
- newly refreshed tray remains visible after success.

- [ ] **Step 4: Run the affected suite**

Run:

```powershell
pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx PurchaseRequestComposer.spec.tsx
```

Expected:

- no false-positive close on failed create;
- success path remains green.

---

## Task 5: Remove mobile dependence on wide tables as the primary pattern

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseCatalogBulkTable.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseSuggestionList.tsx`

- [ ] **Step 1: Add a mobile-friendly presentation strategy for catalog capture**

Do not rely on a horizontal table as the only primary pattern in mobile create mode.

Recommended direction:

- keep desktop table,
- add compact stacked row cards or compressed list rows on mobile,
- preserve selection affordance and labels.

- [ ] **Step 2: Add a mobile-friendly review pattern for selected lines**

For mobile review:

- use compact row blocks or accordion-like rows,
- keep quantity visible and editable,
- preserve remove and selection actions without forcing horizontal scroll.

- [ ] **Step 3: Preserve desktop density**

Desktop can remain tabular where appropriate, but mobile must get the alternative presentation automatically.

- [ ] **Step 4: Verify no functional regression in selection or draft editing**

Run:

```powershell
pnpm --filter @iwana/portal test -- PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx
```

Expected:

- selection and draft interactions still pass;
- no tests rely on the old mobile-wide-table assumption.

---

## Task 6: Tighten create-mode exit and unsaved-work behavior

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Define draft-exit guard behavior**

If the user tries to leave create mode with a non-empty draft:

- show a simple confirm path in this phase;
- permit direct exit only when the draft is empty.

- [ ] **Step 2: Ensure submit success resets mode correctly**

On successful submit:

- clear create mode state,
- return to tray mode,
- leave the user in the purchases workspace,
- refresh the tray if needed.

This step must reuse the explicit success contract from Task 4, not infer success from lack of thrown error.

- [ ] **Step 3: Add test coverage for guarded exit and success return**

Add tests that verify:

- empty draft exits directly;
- non-empty draft triggers confirmation path;
- successful create returns to tray mode.

- [ ] **Step 4: Run the affected suite**

Run:

```powershell
pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx PurchaseRequestComposer.spec.tsx
```

Expected:

- exit and success flow pass with no create/tray mode overlap.

---

## Task 7: Final verification, docs and handoff evidence

**Files:**
- Create: `docs/informes/INFORME-MOD12-COMPRAS-SEPARACION-MODOS-v1.0.md`
- Verify all files from Tasks 1-6

- [ ] **Step 1: Run the targeted portal suite**

Run:

```powershell
pnpm --filter @iwana/portal test -- purchase-request-draft.spec.ts purchase-suggestions.spec.ts purchase-request-submit.spec.ts PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx
```

Expected:

- PASS for all targeted tests;
- no tray/create overlap regressions.

- [ ] **Step 2: Run typecheck for the portal slice**

Run:

```powershell
pnpm --filter @iwana/portal typecheck
```

Expected:

- PASS with no create-mode prop typing regressions.

- [ ] **Step 3: Write execution evidence**

Create `docs/informes/INFORME-MOD12-COMPRAS-SEPARACION-MODOS-v1.0.md` with:

- resumen del cambio,
- decisiones implementadas,
- evidencia de pruebas,
- riesgos residuales,
- follow-ups fuera de fase.

- [ ] **Step 4: Spec-to-plan reconciliation**

Validate the implementation against:

- `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md`
- `docs/specs/2026-07-02-mod12-compras-captura-masiva-design.md`
- `docs/specs/2026-07-04-mod12-compras-separacion-modos-workspace-design.md`

Confirm no gap in:

- separation of tray and create modes,
- explicit success/error orchestration,
- dominant `Agregar productos`,
- mobile two-step flow,
- return to tray mode,
- preservation of tray context,
- non-competing surfaces.

---

## Residual Follow-ups (Not in this phase)

- ruta dedicada para `Nueva solicitud` si el producto necesita deep-linking;
- draft persistente o autosave;
- mejor gestion de filtros/seleccion persistente del catalogo;
- simplificacion adicional de la cabecera compacta si sigue pesando demasiado.
