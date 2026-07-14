# MOD12 Compras Cierre Fase 06 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Rol:** AI-SR-FULL (backend) + AI-FE-PLATFORM (frontend) bajo Protocolo Multiagente v1.2 §3bis.
> **No commits** salvo petición explícita del usuario.

**Goal:** Cerrar el flujo "Trabajar solicitud" de punta a punta: adjudicación UI, reject/cancel (tests + UI), estados terminales y pulido — conforme a `PROMPT-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md`.

**Architecture:** Conservar parcial §3.2 backend ya en árbol (migración 067, reject/cancel, `cancelActiveForRequest`). Completar tests BE, enriquecer detalle RFQ, y cablear FE sobre contrato API existente (`createAwards`, `reject`, `cancel`).

**Tech Stack:** NestJS + TypeORM + Zod DTOs · Next.js portal · Jest/Supertest · Playwright E2E

**Tracks paralelos (contratos congelados):**

| Track | Owner | Trabaja contra |
| --- | --- | --- |
| Backend | AI-SR-FULL | Contratos reject/cancel/awards ya en controller |
| Frontend | AI-FE-PLATFORM | Mismos contratos + mocks tipados en `api-client` |

---

## Estado auditado (2026-07-14)

### Ya implementado (§3.2 backend — conservar)
- `067_add_purchase_request_resolution.ts` + registro en `runner.ts`
- Entity `resolutionReason` / `resolvedByUserId`
- DTOs `RejectPurchaseRequest` / `CancelPurchaseRequest`
- `RfqService.cancelActiveForRequest`
- `PurchasingService.reject/cancel` + `resolvePurchaseRequest`
- Endpoints `POST requests/:id/reject|cancel` con OpenAPI y roles

### Pendiente
- Tests unit/HTTP reject/cancel
- N+1 awards en `getRequestDetail` + `displayName` en invitaciones
- Pestana `awards` + `AwardLinesPanel` + handlers
- UI reject/cancel + moneda + declinación editable + nombre proveedor
- Affirmación next-action terminales
- Informe Fase 06 + evidencia quality

---

### Task 1: Backend — tests reject/cancel + cascada RFQ

**Files:**
- Modify: `apps/api/src/modules/inventory/tests/purchasing.service.spec.ts`
- Modify: `apps/api/src/modules/inventory/tests/purchasing.http.integration.spec.ts` (o nuevo `purchasing.reject-cancel.http.spec.ts` si queda más limpio)
- Test: mismos

- [ ] **Step 1:** Unit `rejectPurchaseRequest` — PENDING_QUOTES → REJECTED; setea reason/actor; cancela RFQ activa; líneas no comprometidas → REJECTED; ORDERED intactas
- [ ] **Step 2:** Unit `cancelPurchaseRequest` — APPROVED → CANCELLED; 400 desde CONVERTED_TO_PO; reason min length
- [ ] **Step 3:** HTTP — POST reject con RFQ → RFQ CANCELLED + invitaciones INVITED→CANCELLED; cancel desde CONVERTED_TO_PO → 400
- [ ] **Step 4:** Correr Jest scoped y confirmar verde

Run: `cd apps/api && npx jest src/modules/inventory/tests/purchasing.service.spec.ts src/modules/inventory/tests/purchasing.http.integration.spec.ts --no-coverage`

---

### Task 2: Backend — N+1 awards + displayName invitaciones

**Files:**
- Modify: `apps/api/src/modules/inventory/services/purchasing-query.service.ts`
- Modify: `apps/api/src/modules/inventory/tests/purchasing.service.spec.ts` (describe PurchasingQueryService)
- Modify tipos portal si hace falta: `PurchaseRfqInvitationRecord.displayName?`

- [ ] **Step 1:** Tras cargar `lines`, awards con `where: { tenantId, purchaseRequestLineId: In(lineIds) }` (si `lineIds` vacío → `[]`)
- [ ] **Step 2:** Tras cargar invitaciones, `getSupplierSummariesBatch(partyRefIds)` y mapear `{ ...invitation, displayName }`
- [ ] **Step 3:** Test unitario: awards filtrados por línea; invitations con displayName

---

### Task 3: Frontend — api-client + next-action + moneda

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/inventory/purchase-workbench.ts`
- Modify: `apps/portal/src/components/inventory/purchase-workbench.spec.ts`
- Modify: `apps/portal/src/components/inventory/inventory-labels.ts`

- [ ] **Step 1:** `rejectRequest` / `cancelRequest` + DTOs; `displayName?` en invitation
- [ ] **Step 2:** Tab `awards` entre `approval` y `orders`; labels
- [ ] **Step 3:** `getPurchaseNextAction`: APPROVED + líneas awardables sin adjudicar → `awards`; REJECTED/CANCELLED → null; CONVERTED_TO_PO sin pendiente recepción → null
- [ ] **Step 4:** Constante `PURCHASE_CURRENCY_OPTIONS = ['COP','USD','EUR']` en inventory-labels

---

### Task 4: Frontend — AwardLinesPanel + workbench wiring

**Files:**
- Create: `apps/portal/src/components/inventory/AwardLinesPanel.tsx`
- Create: `apps/portal/src/components/inventory/AwardLinesPanel.spec.tsx`
- Modify: `PurchaseRequestWorkbenchDrawer.tsx`, `PurchaseWorkspace.tsx`, `InventoryClient.tsx` (+ specs)

- [ ] **Step 1:** Panel por línea awardable (`inventoryItemId`): SupplierPicker (sugerir quotes), qty (bloqueada si `requestType ≠ PROJECT`), quote opcional, notas; listar awards existentes
- [ ] **Step 2:** Botón footer "Adjudicar líneas" + `handleCreateAwards`
- [ ] **Step 3:** Tests panel + InventoryClient

---

### Task 5: Frontend — reject/cancel + pulido RFQ/quotes

**Files:**
- Modify: `PurchaseRequestWorkbenchDrawer.tsx`, `RfqInvitationsPanel.tsx`, handlers InventoryClient

- [ ] **Step 1:** Botones Rechazar (PENDING_*) / Cancelar (no terminal ni CONVERTED_TO_PO) con textarea + mínimos 10/5
- [ ] **Step 2:** Select moneda en quote submit y create RFQ
- [ ] **Step 3:** Textarea motivo declinación; render `displayName` (fallback "Proveedor invitado" solo si falta)

---

### Task 6: Verificación + informe

**Files:**
- Create: `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-06-v1.0.md`
- Create/update: evidencia en `docs/quality/` si el repo ya tiene patrón

- [ ] Lint/typecheck scoped portal+api
- [ ] Tests verdes
- [ ] Informe con decisión de conservar parcial, cobertura, isolation, DoD

---

## STOP / escalación EM-ARCH

- Relajar `validateLineAward`
- Columnas más allá de 067
- RBAC nuevo
- Cambiar `createPurchaseOrderFromRequest`
