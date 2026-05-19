# MOD00 Configuracion Fase 03 Federated Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the federated settings shell so each module exposes configuration surfaces through contracts while preserving domain ownership.

**Architecture:** MOD00 owns navigation, grouping, UX consistency and orchestration metadata. Each bounded context owns its own settings data and endpoints. Future modules can appear as unavailable, but no fake forms are allowed.

**Tech Stack:** NestJS, OpenAPI, Next.js App Router, TypeScript strict, Tailwind v4, Jest, Playwright, pnpm/Turborepo.

---

## Source Artifacts

- ADR: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Prompt: `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-03-v1.0.md`
- Checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-03-v1.0.md`
- Commercial ADR: `docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md`
- Taxation ADR: `docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md`
- WFM ADR: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`

## Scope

### Build in Fase 03

- Settings shell with sections, owners and availability states.
- Backend configuration registry endpoint for visible settings modules.
- Portal pages for available sections: Organization, Access, Field Operations, Commercial basics if owner endpoint exists.
- Placeholder states for future modules with no fake persistence.
- Tests for registry, navigation, authorization and empty/unavailable states.

### Do not build in Fase 03

- Implement Inventory, Billing, HR, NMS or Accounting internals.
- Move domain tables into MOD00.
- Create cross-module SQL reads.
- Add hidden settings JSON blobs.

## File Structure

### Backend

- Create or modify: `apps/api/src/modules/configuration/configuration.module.ts`
- Create or modify: `apps/api/src/modules/configuration/configuration.controller.ts`
- Create: `apps/api/src/modules/configuration/services/settings-registry.service.ts`
- Create: `apps/api/src/modules/configuration/dto/settings-section.dto.ts`
- Create: `apps/api/src/modules/configuration/schemas/settings-section.schema.ts`
- Modify: `apps/api/src/app.module.ts`

### Shared

- Create: `packages/shared/src/enums/configuration/settings-section-key.enum.ts`
- Create: `packages/shared/src/enums/configuration/settings-section-status.enum.ts`
- Modify: `packages/shared/src/enums/index.ts`

### Frontend

- Modify: `apps/portal/src/app/dashboard/settings/page.tsx`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/settings-navigation.ts`
- Create: `apps/portal/src/components/settings/SettingsSectionGrid.tsx`
- Create: `apps/portal/src/components/settings/SettingsUnavailableState.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

### E2E

- Create or modify: `e2e/tests/portal-settings-federated-shell.spec.ts`

---

### Task 1: Settings registry backend

- [ ] **Step 1: Write controller tests**

Assert `/api/v1/configuration/settings-sections` returns visible sections with `key`, `label`, `ownerModule`, `status`, `route` and `requiredPermissions`.

- [ ] **Step 2: Implement shared enums**

Add stable section keys such as `organization`, `access`, `security`, `branding`, `field_operations`, `commercial`, `billing`, `inventory`, `integrations`.

- [ ] **Step 3: Implement registry service**

Return only metadata. Do not read module-owned tables.

- [ ] **Step 4: Validate backend**

Run: `pnpm --filter @iwana/api test -- configuration`

Expected: PASS.

### Task 2: Portal settings shell

- [ ] **Step 1: Add API client method**

Add `configurationApi.settingsSections.list()` with typed response.

- [ ] **Step 2: Build section grid**

Render cards or rows for settings sections with clear status labels: `Disponible`, `Proximamente`, `No configurado`.

- [ ] **Step 3: Preserve routes**

Keep `/dashboard/settings` as entry point and link to existing Organization, Access and Field Operations routes.

- [ ] **Step 4: Validate frontend**

Run: `pnpm --filter @iwana/portal test -- settings`

Expected: PASS.

### Task 3: Federated owner contract

- [ ] **Step 1: Document owner map**

Keep owner metadata in code and report: MOD00 for shell, WFM for field operations, Commercial for commercial settings, future modules for future surfaces.

- [ ] **Step 2: Add guardrails**

Unavailable modules must not show writable forms or fake success states.

- [ ] **Step 3: Add tests**

Assert unavailable modules render informational state and no submit buttons.

### Task 4: E2E and documentation

- [ ] **Step 1: Add Playwright shell flow**

Cover ADMIN opening settings, seeing available sections and opening Organization, Access and Field Operations.

- [ ] **Step 2: Add future module assertion**

Cover Inventory/Billing as unavailable without writable controls.

- [ ] **Step 3: Run targeted checks**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
pnpm test:e2e:portal --grep "Configuracion"
```

- [ ] **Step 4: Update report**

Append Fase 03 evidence to `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`.

## Self-review checklist

- MOD00 owns shell, not every setting value.
- Future modules are not faked.
- Navigation is stable and readable.
- Tests cover unavailable states.
- No cross-module SQL reads are introduced.
