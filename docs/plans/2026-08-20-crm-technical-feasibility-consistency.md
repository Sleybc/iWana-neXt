# CRM technical feasibility consistency implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the technical feasibility options with the portal's standard form and selection patterns.

**Architecture:** Keep the existing `TechnicalFeasibilitySection` and API contract. Use the standard `CheckboxCard` group pattern without a secondary primary-technology selector, and normalize the parent section shell to current iWana tokens. Strengthen the shared checkbox focus contract only where required by the approved accessibility review.

**Tech Stack:** Next.js client component, React, TypeScript, `@iwana/ui`, Tailwind v4, Jest Testing Library, Playwright.

---

### Task 1: Redesign the technical options interaction

**Files:**

- Modify: `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.tsx`
- Test: `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.spec.tsx`

- [x] Remove the floating star, tooltip, and secondary primary-technology selector from the checklist.
- [x] Render the candidate group in an iWana soft surface with the standard `CheckboxCard` treatment and a neutral count badge that is visible for zero, one, or multiple options.
- [x] Keep the map before the candidate group so the visual evidence precedes the checklist, per the final product direction.
- [x] Preserve `candidateTechnologies` and `availableTechnology` draft fields and all existing callbacks.
- [x] Keep long labels wrapping, use one column on mobile, and ensure the primary selector is disabled when no candidate is selected.
- [x] Add tests for the neutral count, selector options, primary selection, zero-candidate state, and removal of the obsolete tooltip contract.

### Task 2: Normalize the expediente section shell

**Files:**

- Modify: `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`
- Test: `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.spec.tsx`

- [x] Replace local section radius, shadow, border, and save-button styling with existing iWana surface and `Button` tokens.
- [x] Preserve section layout, save behavior, progress semantics, and `keepMounted` behavior.
- [x] Verify the shell remains consistent for all section types without changing their contents.

### Task 3: Guarantee checkbox focus visibility

**Files:**

- Modify: `packages/ui/src/components/CheckboxCard.tsx`
- Test: `apps/portal/src/components/shared/ui-primitives-a11y.spec.tsx`

- [x] Add the shared visible focus treatment to the native checkbox input without changing its public API.
- [x] Verify the checkbox retains its native semantics, label association, disabled state, and current visual variants.

### Task 4: Update CRM regression coverage

**Files:**

- Modify: `e2e/tests/portal-crm-expedientes.spec.ts`
- Test: `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.spec.tsx`

- [x] Use the actual `tab` role when opening the Gestión tab.
- [x] Cover selecting multiple technical options and preserving the first selected option as the automatic primary recommendation.
- [x] Cover keyboard operation, mobile one-column behavior, and persisted primary selection where the existing fixture supports it.

### Task 5: Validate and document

**Files:**

- Modify: `docs/informes/INFORME-CRM-EXPEDIENTE-SEGMENTO-FASE-IMPLEMENTACION-v1.0.md`

- [x] Run focused portal tests, shared UI tests, typecheck, lint, Prettier, and `audit-ui.mjs` on touched UI files.
- [x] Run the focused CRM E2E if the local environment and authentication fixture are available.
- [x] Record the implementation and evidence in the CRM report, including any pre-existing warnings or authentication limitations.
