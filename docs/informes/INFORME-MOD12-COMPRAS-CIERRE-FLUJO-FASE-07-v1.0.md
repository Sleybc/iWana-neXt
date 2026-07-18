# INFORME — MOD12 Compras Cierre Flujo Fase 07 v1.0

**Estado:** Listo para revisión G7 CTO  
**Fecha:** 2026-07-14  
**Prompt:** `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-07-v1.0.md`  
**Plan:** `docs/plans/` (Fase 07 en plan maestro MOD12 Compras)  
**Referencia Fase 06:** `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-06-v1.0.md`  
**Ejecutor:** AI-SR-FULL (Protocolo Multiagente v1.2 §3bis)  
**GO merge:** CTO (schema + release) + revisión AI-SEC-ENG

## Resumen

Se completan las dos RFs de Fase 07:

- **RF-07-01 (Editar solicitud):** `PATCH purchasing/requests/:id` — edita cabecera y reemplaza líneas cuando `status ∈ {DRAFT, PENDING_QUOTES}` y sin cotizaciones previas; UI en modo edición reutilizando `PurchaseRequestComposer` con `initialValues`/`onUpdate`.
- **RF-07-02 (Ciclo de vida de OC):** tres endpoints nuevos (`POST .../approve`, `.../cancel`, `.../close`) que completan las transiciones `PENDING_APPROVAL→APPROVED`, `*→CANCELLED`, `FULLY_RECEIVED→CLOSED`; acciones reflejadas en workbench y drawer.

## Allowlist Fase 07 (superficie del commit/PR)

### Database / shared
- `packages/database/src/entities/purchase-order.entity.ts` (`cancellationReason`, `cancelledByUserId`, `closedByUserId`)
- `packages/database/src/migrations/tenant/068_add_purchase_order_resolution.ts`
- `packages/database/src/migrations/tenant/runner.ts` (solo registro 068)

### API inventory/purchasing
- `apps/api/src/modules/inventory/dto/index.ts` (`UpdatePurchaseRequest*`, `CancelPurchaseOrder*` DTOs)
- `apps/api/src/modules/inventory/purchasing.controller.ts` (4 endpoints nuevos + PATCH)
- `apps/api/src/modules/inventory/services/purchasing.service.ts` (`updatePurchaseRequest`, `approvePurchaseOrder`, `cancelPurchaseOrder`, `closePurchaseOrder`)
- `apps/api/src/modules/inventory/tests/purchasing.service.spec.ts` (10 tests nuevos)
- `apps/api/src/modules/inventory/tests/purchasing.http.integration.spec.ts` (5 tests nuevos)

### Portal
- `apps/portal/src/lib/api-client.ts` (`updateRequest`, `approveOrder`, `cancelOrder`, `closeOrder`)
- `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx` (modo edición: `initialValues`, `onUpdate`)
- `apps/portal/src/components/inventory/PurchaseWorkspace.tsx` (`openEditMode`, `handleUpdateRequest`)
- `apps/portal/src/components/inventory/InventoryClient.tsx` (handlers Fase 07)
- `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx` (botones ciclo OC)
- `apps/portal/src/components/inventory/GoodsReceiptPanel.spec.tsx` (fixture fix: 3 campos OC)
- `apps/portal/src/components/inventory/InventoryClient.spec.tsx` (fixture fix)
- `apps/portal/src/components/inventory/purchase-workbench.spec.ts` (fixture fix)

### Docs
- `docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (actualización Fase 07)
- `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-07-v1.0.md`
- `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-07-v1.0.md` (este archivo)
- `docs/quality/CHECKLIST-MOD12-COMPRAS-CIERRE-FLUJO-FASE-07-v1.0.md`
- `docs/security/SECURITY-REVIEW-MOD12-COMPRAS-CIERRE-FASE-07-v1.0.md`

## Entregables técnicos

### Database
- Migración tenant `068` aditiva/reversible: `cancellation_reason text null`, `cancelled_by_user_id uuid null`, `closed_by_user_id uuid null` en `purchase_orders`.

### Backend
| Método | Endpoint | Estado fuente → destino | Guard |
| --- | --- | --- | --- |
| PATCH | `purchasing/requests/:id` | DRAFT/PENDING_QUOTES → mismo | `@Roles(ADMIN, NOC, SUPPORT)` |
| POST | `purchasing/orders/:id/approve` | PENDING_APPROVAL → APPROVED | `@Roles(ADMIN, NOC, SUPPORT)` |
| POST | `purchasing/orders/:id/cancel` | DRAFT/PENDING_APPROVAL/APPROVED → CANCELLED | `@Roles(ADMIN, NOC, SUPPORT)` |
| POST | `purchasing/orders/:id/close` | FULLY_RECEIVED → CLOSED | `@Roles(ADMIN, NOC, SUPPORT)` |

Todos usan `ParseUUIDPipe`, `ZodValidationPipe`, `runInTenantSchema` + `withTransaction`.

### Portal
- `PurchaseRequestComposer` acepta `initialValues` (lazy `useState`) y `onUpdate`; modo edición habilitado; tipo de solicitud bloqueado en edición.
- `PurchaseWorkspace` gestiona `editingDetail` y `handleUpdateRequest`; `key` prop fuerza remount al cambiar entre crear/editar.
- `InventoryClient` conecta handlers Fase 07 con re-throw para mantener modo edición en error.
- Workbench drawer expone botones contextuales de ciclo de OC según estado.

## Evidencia de verificación

| Comando | Resultado |
| --- | --- |
| `npx jest src/modules/inventory --no-coverage` | **185/185 PASS** (26 suites) |
| `pnpm --filter @iwana/api lint` | **OK** (0 warnings) |
| `pnpm --filter @iwana/portal lint` | **OK** (0 warnings) |
| Typecheck (api + portal) | pendiente confirmación CI |

## Revisión de seguridad (schema 068)

Ver `docs/security/SECURITY-REVIEW-MOD12-COMPRAS-CIERRE-FASE-07-v1.0.md`.

## DoD → G7

| Criterio | Estado |
| --- | --- |
| RF-07-01 edición de solicitud | Implementado |
| RF-07-02 ciclo de vida OC (approve/cancel/close) | Implementado |
| Tests: 185/185 PASS | Cumple |
| Lint API + Portal | Cumple |
| Boundaries Modulith | Cumple |
| Multi-tenant (`TenantContext` + `runInTenantSchema`) | Cumple |
| Migración 068 aditiva + `down()` + runner | Cumple |
| Allowlist de archivos (sin mezcla de otras fases) | Cumple |
| SEC-ENG formal | Pendiente revisión |
| GO CTO | Pendiente |

## Fuera de alcance

Fase 08 (reorden bajo demanda), Fase 09 (métricas de proveedor), evaluación de proveedores (RF-INV-24).

## Addendum post-auditoría Existencias G5 (2026-07-18)

Transferencias desde la auditoría de Existencias Fase 01 que tocan superficie F07 / continuidad compras:

| Ítem | Acción | Estado |
| --- | --- | --- |
| H2 — `purchasing.http.integration.spec.ts` 400 vs 201 | Payload de cotización actualizado a `lines[{ purchaseRequestLineId, unitCost }]` (contrato post–cotización por línea) | ✅ Remediado; suite PASS |
| Fix colateral Existencias — `purchase-workbench.ts` / `PurchaseWorkspace` | Al abrir workbench sin `initialTab`, se usa la pestaña sugerida por `getPurchaseNextAction` (p. ej. Adjudicación) | ✅ Registrado (origen: suite portal Existencias / adjudicación) |
| O1 — `rfq-pdf.service.spec.ts` flaky bajo carga paralela | Pasa aislada; contención probable en generación PDF | Abierto — vigilar en CI |
