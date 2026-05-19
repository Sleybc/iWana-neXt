# MOD00 Configuracion Fase 04 Advanced Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden MOD00 with granular permission enforcement, richer audit evidence and operational safeguards for sensitive configuration changes.

**Architecture:** `UserRole` remains the base authorization layer. Access Profiles provide tenant-configurable refinements through a guarded permission catalog. Audit and anti-lockout controls protect critical settings operations.

**Tech Stack:** NestJS guards/decorators, TypeORM, PostgreSQL, Redis only if cache is justified, Jest/Supertest, Next.js App Router, Playwright, pnpm/Turborepo.

---

## Source Artifacts

- ADR: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Prompt: `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-04-v1.0.md`
- Checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-04-v1.0.md`
- Auth ADR: `docs/adrs/ADR-019-JWT-RS256-Refresh-Rotation.md`

## Scope

### Build in Fase 04

- `@Permissions()` decorator and `PermissionsGuard` rollout to approved endpoints.
- Anti-lockout protection for last effective admin/profile.
- Audit enrichment for sensitive changes.
- Optional permission cache only if tests show repeated DB cost.
- Portal evidence UI for permission/profile changes.

### Do not build in Fase 04

- Replace `UserRole`.
- Let tenants create backend roles.
- Add external IAM integrations such as SAML/OIDC/LDAP.
- Store secrets, tokens or credentials in audit payloads.

## File Structure

### Backend

- Create: `apps/api/src/modules/access-control/decorators/permissions.decorator.ts`
- Create: `apps/api/src/modules/access-control/guards/permissions.guard.ts`
- Create: `apps/api/src/modules/access-control/services/effective-permissions.service.ts`
- Create: `apps/api/src/modules/access-control/services/access-governance.service.ts`
- Modify: approved controllers in `apps/api/src/modules/organization/` and `apps/api/src/modules/access-control/`
- Modify: `apps/api/src/modules/audit/` only through public service contracts.

### Database

- Create migration only if needed: `packages/database/src/migrations/tenant/039_access_governance_hardening.ts`
- Prefer using Fase 01 tables unless new audit/index needs are proven.

### Frontend

- Create: `apps/portal/src/components/access-control/EffectivePermissionsPanel.tsx`
- Create: `apps/portal/src/components/access-control/ProfileChangeEvidence.tsx`
- Modify: `apps/portal/src/app/dashboard/settings/access/page.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

### E2E

- Create or modify: `e2e/tests/portal-access-governance.spec.ts`

---

### Task 1: Permission guard foundation

- [ ] **Step 1: Write guard tests**

Assert a user with base role but missing permission is forbidden on guarded endpoints, while ADMIN recovery path remains controlled.

- [ ] **Step 2: Implement decorator**

Create `@Permissions('organization.sites.manage')` metadata decorator.

- [ ] **Step 3: Implement guard**

Guard must run after JWT/Tenant/Roles and resolve effective permissions from tenant context.

- [ ] **Step 4: Validate guard**

Run: `pnpm --filter @iwana/api test -- permissions.guard`

Expected: PASS.

### Task 2: Effective permissions service

- [ ] **Step 1: Write service tests**

Cover active profiles, valid date windows, inactive profiles and base role incompatibility.

- [ ] **Step 2: Implement service**

Read only Access Control tables in tenant schema. Do not read Users internals directly.

- [ ] **Step 3: Optional cache decision**

Use no cache by default. Add Redis cache only with invalidation on profile mutation and documented performance reason.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @iwana/api test -- effective-permissions`

Expected: PASS.

### Task 3: Anti-lockout and audit hardening

- [ ] **Step 1: Write anti-lockout tests**

Assert backend rejects deleting/deactivating the last effective ADMIN access path.

- [ ] **Step 2: Implement governance service**

Centralize last-admin checks before profile/user-profile mutations.

- [ ] **Step 3: Enrich audit**

Record action, actor, target type, target id, oldValue/newValue and permission impact without secrets or tokens.

- [ ] **Step 4: Run API tests**

Run: `pnpm --filter @iwana/api test -- access-governance`

Expected: PASS.

### Task 4: Portal governance UI

- [ ] **Step 1: Show effective permissions**

Add panel that explains effective permissions by profile and base role using Spanish labels.

- [ ] **Step 2: Show change evidence**

Display recent sensitive profile changes if backend endpoint exists; otherwise link to audit view without fake data.

- [ ] **Step 3: Validate UI**

Run: `pnpm --filter @iwana/portal test -- access-control`

Expected: PASS.

### Task 5: E2E and closure

- [ ] **Step 1: Add Playwright governance flow**

Cover profile permission change, effective permission display and blocked last-admin removal.

- [ ] **Step 2: Run targeted checks**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/api test -- permissions access-governance
pnpm test:e2e:portal --grep "Permisos"
```

- [ ] **Step 3: Update report**

Append Fase 04 evidence to `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`.

## Self-review checklist

- `UserRole` remains intact.
- Permissions refine, never replace, base RBAC.
- Last admin path cannot be removed silently.
- Audit payloads contain no secrets or unnecessary PII.
- Cache is omitted unless justified and invalidated.
