# CRM to WFM Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el flujo CRM -> WFM para que `SALES` y Operaciones puedan agendar instalación con recomendaciones reales, fallback consistente y sincronización visible.

**Architecture:** Se reemplaza la dependencia del listado global de usuarios por un endpoint WFM acotado a recursos operativos activos. El frontend de pendientes CRM usa esa fuente, limita candidatos elegibles y muestra éxito parcial visible cuando la agenda queda creada pero fallan sincronizaciones auxiliares.

**Tech Stack:** NestJS, Next.js App Router, TypeScript estricto, Jest, Supertest.

---

### Task 1: Backend WFM eligible assignees

**Files:**
- Modify: `apps/api/src/modules/wfm/wfm.module.ts`
- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm.controller.http.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/visit-requests.service.spec.ts`
- Modify: `apps/api/src/modules/users/users.module.ts` only if import/export wiring is needed

- [ ] Add a WFM endpoint restricted to `ADMIN`, `NOC`, `SUPPORT`, `SALES` that returns only active `isOperationalResource === true` tenant users.
- [ ] Reuse `UsersService` or a narrow read path instead of broadening `/users` permissions.
- [ ] Filter out deleted or inactive users in the returned payload.
- [ ] Enforce in visit-request recommendation/schedule flows that `assignedUserId` and `candidateUserIds` belong to eligible operational resources.
- [ ] Return explicit `400` messages when a non-operational assignee/candidate is attempted.
- [ ] Cover controller authorization and service validation with tests.

### Task 2: Frontend CRM-assisted scheduling flow

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Modify: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
- Modify: `apps/portal/src/components/scheduling/scheduling-ui.ts` only if role helpers need alignment
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx`

- [ ] Add a portal API client method for the new WFM eligible-assignees endpoint.
- [ ] Replace `usersApi.list()` inside `PendingVisitRequestsView` with the WFM-scoped source.
- [ ] Ensure recommendation candidates and manual technician options use only operational assignees.
- [ ] Prevent the `SALES` path from showing a broken fallback; if `SALES` cannot access detailed agenda, hide or replace the CTA with explanatory copy.
- [ ] Preserve the detailed-agenda CTA only for roles with real agenda access.
- [ ] Update tests to assert the recommendation-first UI, the `SALES` assisted mode, and the fallback behavior.

### Task 3: Visible partial-success feedback after scheduling

**Files:**
- Modify: `apps/portal/src/components/scheduling/scheduling-visit-request-sync.ts`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx` if shared helper behavior affects agenda handoff
- Add or Modify: `apps/portal/src/components/scheduling/scheduling-visit-request-sync.spec.ts`

- [ ] Keep the main scheduling action successful when WFM agenda creation succeeds.
- [ ] Accumulate auxiliary failures from Assurance linking, CRM operational refs linking, and expediente transition.
- [ ] Return a success message with appended warnings when those auxiliary syncs fail.
- [ ] Surface that warning in the pending-visits flow without masking the agenda creation success.
- [ ] Add focused tests for full success and partial-success cases.

### Task 4: Verification and regression closure

**Files:**
- Modify only if small fixes are required from regression findings

- [ ] Run targeted backend tests for WFM controller/service coverage.
- [ ] Run targeted portal tests for pending-visits, recommendation panel, and any shared helper touched.
- [ ] Fix broken expectations so tests describe the current product behavior rather than the old side panel.
- [ ] Re-review that `SALES` can complete the assisted path end-to-end without depending on `/users` or unauthorized agenda access.
