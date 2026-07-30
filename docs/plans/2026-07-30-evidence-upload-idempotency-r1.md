# Evidence upload intent idempotency R1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /api/v1/tasks/execution-orders/:id/evidence-assets` replay-safe by OT/tenant/idempotency key while preserving the Media/quarantine pipeline.

**Architecture:** The controller will pass `Idempotency-Key` and `If-Match` through the existing command context. The service will use the existing tenant-scoped reliability record with operation `execution_order.evidence_asset`, fingerprinting OT, actor and a server-side file digest; replay will resolve the original upload intent receipt before version validation. The first request will validate `If-Match`, create one tenant upload intent, call Media once, link the asset, and complete the idempotency record with the intent identifier. The idempotency record is linked to the upload intent before the Media call so concurrent retries cannot reserve a second intent. No Media boundary or quarantine behavior changes.

**Tech Stack:** NestJS, TypeScript, TypeORM, PostgreSQL tenant schemas, Jest/Supertest, shared TypeScript contracts, JSON OpenAPI.

---

### Task 1: Add red tests for the frozen R1 behavior

**Files:**
- Modify: `apps/api/src/modules/tasks/tests/execution-orders.evidence.service.spec.ts`
- Modify: `apps/api/src/modules/tasks/tests/execution-orders.controller.http.spec.ts`

- [ ] **Step 1: Add service tests for first request, replay, fingerprint conflict, and first-request version conflict.**
  Use the existing tenant test double and mock manager. Assert that a replay returns the original receipt, does not call Media or save a second upload intent, and ignores a stale retry `If-Match`; assert that a distinct file fingerprint with the same key returns `409 IDEMPOTENCY_CONFLICT`; assert that a first request with stale `If-Match` returns `409 VERSION_CONFLICT` before Media is called.

- [ ] **Step 2: Add HTTP tests that prove header propagation and required-header errors.**
  Extend the controller service mock with `createEvidenceAssetReceipt`, send both headers on multipart requests, assert the exact service context, and cover missing `Idempotency-Key` and missing `If-Match` with `400`.

- [ ] **Step 3: Run the focused tests and verify the new tests fail for the missing behavior.**
  Run `pnpm --filter @iwana/api exec jest src/modules/tasks/tests/execution-orders.evidence.service.spec.ts src/modules/tasks/tests/execution-orders.controller.http.spec.ts --runInBand`.

### Task 2: Implement controller/service idempotency without changing Media

**Files:**
- Modify: `apps/api/src/modules/tasks/execution-orders.controller.ts`
- Modify: `apps/api/src/modules/tasks/services/execution-orders.service.ts`
- Modify: `apps/api/src/modules/tasks/dto/execution-orders.dto.ts`

- [ ] **Step 1: Read both headers in `createEvidenceAsset` and pass `commandContext(ifMatch, idempotencyKey, correlationId)` to the service.**
  Keep the multipart file validation and `202` response unchanged.

- [ ] **Step 2: Extend `createEvidenceAssetReceipt` to accept the command context and enforce the existing required-header policy.**
  Compute a non-PII SHA-256 fingerprint from the uploaded bytes plus stable file metadata, then call `beginCommand` with operation `execution_order.evidence_asset` and `{ executionOrderId: id, fileFingerprint }`. Resolve a replay by loading the original upload intent from `receipt.resourceRef`; return the existing receipt without calling Media and without applying `If-Match` again. On a new request, validate `If-Match` before creating the upload intent, then keep the current create → Media → link sequence.

- [ ] **Step 3: Complete the generic idempotency record after the asset link.**
  Use `finishCommand` with the upload intent ID as `resourceRef`, the current OT version as the stored version, and no outbox event. Preserve the existing failed-intent update if Media rejects the upload. Ensure no idempotency record is created when version validation fails.

- [ ] **Step 4: Align the DTO declaration with the already-canonical Zod shape.**
  Change `RegisterEvidenceDto.capturedAt` to `capturedAt?: string | null` without changing runtime validation.

### Task 3: Align shared contract and OpenAPI

**Files:**
- Verify/modify: `packages/shared/src/contracts/operations/execution-orders.ts`
- Modify: `apps/api/openapi/tasks-execution-orders.v1.json`

- [ ] **Step 1: Preserve the shared `RegisterEvidenceCommand.capturedAt?: string | null` contract and add/adjust focused contract coverage if needed.**

- [ ] **Step 2: Document `If-Match` as required for `POST .../evidence-assets`.**
  Reference the existing `IfMatch` and `IdempotencyKey` parameters, document replay semantics and `409` idempotency/version errors, and keep the multipart schema and Media/quarantine description consistent with the implementation.

### Task 4: Report evidence and verify the complete change

**Files:**
- Create: `docs/informes/INFORME-MOD11-R1-BACKEND-v1.0.md` (dated R1 backend evidence; avoid staging unrelated edits already present in the living report)

- [ ] **Step 1: Run focused API tests, shared tests, typecheck, lint, and the relevant Swagger contract test.**
  Use the repository's pnpm scripts and capture exit status plus Jest test totals.

- [ ] **Step 2: Inspect the diff for boundary, tenant, PII, Media/quarantine, and contract regressions.**

- [ ] **Step 3: Commit only the intended backend/shared/OpenAPI/tests/report files with message `fix(operations): make evidence upload intent idempotent`.**
