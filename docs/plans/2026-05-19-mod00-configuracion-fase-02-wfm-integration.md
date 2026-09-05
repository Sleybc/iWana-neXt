# MOD00 Configuracion Fase 02 WFM Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **ESTADO: EJECUTADO Y SUPERADO** — cierre documental 2026-09-02
>
> Este plan fue ejecutado por completo: ver checklist aprobado `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-02-v1.0.md` (100% marcado) y seccion 10 del informe `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (alcance, validaciones y criterios en verde). Codigo entregado en commit `b6e5e69f` (adapter WFM sobre `OrganizationSiteReadPort`, migracion tenant `038_map_wfm_operating_sites_to_organization_sites`, ruta portal `/dashboard/settings/field-operations`, E2E `portal-settings-wfm-organization-sites.spec.ts`).
>
> Posteriormente fue **superado** por planes aprobados del mismo control plane: Fases 03-05 (shell federado, permisos granulares, unificacion de sedes) y el retiro estructural de `WfmOperatingSite` (`docs/plans/2026-05-22-retiro-wfm-operating-sites.md`, migracion tenant `039_replace_wfm_operating_sites_with_organization_sites`).
>
> **No re-ejecutar:** reintroduciria la capa de mapping `WfmOperatingSite` ya retirada y regresionaria el codebase. Gates re-verificados el 2026-09-02, todos en verde:
>
> - `pnpm --filter @iwana/api test -- wfm-organization-sites` — 4/4 PASS
> - `pnpm --filter @iwana/db typecheck` — PASS
> - `pnpm --filter @iwana/api typecheck` — PASS
> - `pnpm --filter @iwana/portal typecheck` — PASS
> - `pnpm --filter @iwana/portal test -- settings wfm` — 302/302 PASS

**Goal:** Connect WFM with MOD00 Organization/Sites through approved ports and gradual compatibility, without breaking existing Work Orders or schedules.

**Architecture:** WFM remains owner of scheduling, visit requests, work orders and execution. MOD00 Organization remains owner of tenant sites. Integration happens through `OrganizationSiteReadPort` and an additive mapping/compatibility layer.

**Tech Stack:** NestJS, TypeORM, PostgreSQL schema-per-tenant, Zod, Jest/Supertest, Next.js App Router, Playwright, pnpm/Turborepo.

---

## Source Artifacts

- ADR: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Prompt: `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-02-v1.0.md`
- Checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-02-v1.0.md`
- WFM PRD: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- WFM HLD: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- WFM ADR: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`

## Scope

### Build in Fase 02

- Adapter WFM to consume active `OrganizationSite` records with `TECH_DISPATCH`.
- Additive mapping between legacy `WfmOperatingSite` and `OrganizationSite`.
- UI relocation of field operations settings under MOD00 settings navigation.
- Backfill command or migration path that preserves legacy references.
- Tests for compatibility and no direct cross-module table reads.

### Do not build in Fase 02

- Delete `WfmOperatingSite`.
- Rewrite Work Orders or scheduling algorithms.
- Implement Inventory, Billing, HR or NMS.
- Make WFM write Organization/Sites directly.

## File Structure

### Backend

- Modify: `apps/api/src/modules/wfm/wfm.module.ts`
- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/services/operating-window-resolver.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-recommendations.service.ts`
- Create: `apps/api/src/modules/wfm/services/wfm-organization-sites.adapter.ts`
- Create: `apps/api/src/modules/wfm/services/wfm-operating-site-mapping.service.ts`
- Create: `apps/api/src/modules/wfm/dto/wfm-organization-site.dto.ts`
- Create or modify tests under `apps/api/src/modules/wfm/**/*.spec.ts`

### Database

- Create migration: `packages/database/src/migrations/tenant/038_map_wfm_operating_sites_to_organization_sites.ts`
- Modify entity if approved: `packages/database/src/entities/wfm-operating-site.entity.ts`
- Prefer mapping table if nullable column increases coupling.

### Frontend

- Modify: `apps/portal/src/components/settings/settings-navigation.ts`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
- Create: `apps/portal/src/app/dashboard/settings/field-operations/page.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

### E2E

- Create or modify: `e2e/tests/portal-settings-wfm-organization-sites.spec.ts`

---

### Task 1: Compatibility contract

- [x] **Step 1: Write WFM adapter tests**

Assert WFM lists only active organization sites with `TECH_DISPATCH`, keeps legacy operating sites readable and never requires WFM to query organization tables directly.

Run: `pnpm --filter @iwana/api test -- wfm-organization-sites`

Expected: FAIL before adapter exists.

- [x] **Step 2: Implement adapter**

Create `wfm-organization-sites.adapter.ts` that depends on `OrganizationSiteReadPort`, not repositories from Organization internals.

- [x] **Step 3: Register adapter**

Register the provider in `WfmModule` through an explicit port binding approved by the HLD.

- [x] **Step 4: Re-run tests**

Run: `pnpm --filter @iwana/api test -- wfm-organization-sites`

Expected: PASS.

### Task 2: Database mapping

- [x] **Step 1: Choose mapping strategy**

Prefer table `wfm_operating_site_organization_site_mappings` with `tenant_id`, `wfm_operating_site_id`, `organization_site_id`, timestamps and unique active indexes.

- [x] **Step 2: Write reversible migration**

Create tenant migration `038_map_wfm_operating_sites_to_organization_sites.ts` with safe `up` and `down`.

- [x] **Step 3: Add backfill path**

Backfill from active WFM operating sites to Organization sites only if Fase 01 tables exist. Document skipped records.

- [x] **Step 4: Validate database**

Run: `pnpm --filter @iwana/db typecheck`

Expected: PASS.

### Task 3: WFM read path

- [x] **Step 1: Update resolver tests**

Assert schedule recommendations can use `organizationSiteId` while legacy `operatingSiteId` continues working.

- [x] **Step 2: Implement read compatibility**

Update resolver/services to accept both identifiers and prefer `organizationSiteId` for new calls.

- [x] **Step 3: Preserve history**

Ensure historical visit requests and Work Orders still render their original operating site label.

- [x] **Step 4: Run WFM tests**

Run: `pnpm --filter @iwana/api test -- wfm`

Expected: PASS or unrelated failures documented.

### Task 4: Portal relocation

- [x] **Step 1: Add route**

Create `/dashboard/settings/field-operations` and mount the existing WFM operating hours manager there.

- [x] **Step 2: Update navigation**

Add `Operacion de campo` under settings and keep any legacy tab/path redirect or compatibility link.

- [x] **Step 3: Add labels**

Show organization sites as source of dispatch location when available. Do not expose raw enum values.

- [x] **Step 4: Run portal tests**

Run: `pnpm --filter @iwana/portal test -- settings wfm`

Expected: PASS.

### Task 5: E2E and documentation

- [x] **Step 1: Add Playwright coverage**

Cover ADMIN opening field operations settings, selecting an organization dispatch site and confirming legacy WFM settings remain readable.

- [x] **Step 2: Run targeted checks**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
pnpm test:e2e:portal --grep "Operacion de campo"
```

Expected: PASS or unrelated failures documented.

- [x] **Step 3: Update report**

Append Fase 02 implementation evidence to `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`.

## Self-review checklist

- WFM does not read Organization tables directly.
- Legacy WFM data remains visible.
- Mapping is reversible.
- Portal navigation remains stable.
- No Inventory/Billing/HR behavior is introduced.
