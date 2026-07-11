# MOD12 Compras Compra de Mostrador (Ingreso Directo) Fase 03 Implementation Plan

**Estado:** Aprobado
**Aprobado por:** CTO
**ADR:** docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md
**Prompt:** docs/prompts/PROMPT-MOD12-COMPRA-MOSTRADOR-FASE-03-v1.0.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar a MOD12 el ingreso directo de inventario por compra de mostrador: una entrada de stock con proveedor elegido a mano, factura/soporte y costo, que impacta inventario fisico y de sistema en un solo paso, sin crear solicitud ni orden de compra. Conforme a ADR-050.

**Architecture:** Todo dentro de `apps/api/src/modules/inventory` y `apps/portal/src/components/inventory`, sin nuevo bounded context. El ingreso es un movimiento de stock de entrada por `StockLedgerService`. Se crea un servicio dedicado `CounterPurchaseService` que reutiliza `StockLedgerService.recordMovementWithManager` y `SerializedAssetService`, en paralelo a `GoodsReceiptService` (que queda acoplado a OC y no se toca). Proveedor referenciado por `party_ref_id` (MOD08 Parties) sin FK cross-module.

**Tech Stack:** NestJS, TypeScript strict, TypeORM, PostgreSQL tenant schema, Zod, OpenAPI, Next.js App Router, Jest, Supertest, Playwright, pnpm.

**Precondicion:** ADR-050 en estado Aprobado por CTO. Numeracion de migraciones tenant: usar el siguiente numero libre (se asume `058`). Verificar el numero mas alto real antes de crear.

---

## File Map

- Modify `packages/shared/src/enums/inventory/stock-movement-origin.enum.ts` (agregar `COUNTER_PURCHASE`).
- Create `packages/database/src/migrations/tenant/058_add_counter_purchase_origin.ts`.
- Create `apps/api/src/modules/inventory/services/counter-purchase.service.ts`.
- Modify `apps/api/src/modules/inventory/dto/index.ts` (`CreateCounterPurchaseSchema` + DTO).
- Modify `apps/api/src/modules/inventory/inventory.controller.ts` (endpoint).
- Modify `apps/api/src/modules/inventory/inventory.module.ts` (registrar servicio).
- Create `apps/api/src/modules/inventory/tests/counter-purchase.service.spec.ts`.
- Create/Update `apps/api/src/modules/inventory/tests/counter-purchase.http.integration.spec.ts`.
- Modify `apps/portal/src/lib/api-client.ts` (cliente + tipos).
- Create `apps/portal/src/components/inventory/CounterPurchasePanel.tsx`.
- Modify `apps/portal/src/components/inventory/InventoryClient.tsx` (integrar sub-vista/pestana).
- Update `e2e/tests/portal-inventory-scm.spec.ts`.
- Update phase report/checklist en `docs/informes/` y `docs/quality/`.

## Task 1: Origen de movimiento y migracion

**Files:**
- Modify: `packages/shared/src/enums/inventory/stock-movement-origin.enum.ts`
- Create: `packages/database/src/migrations/tenant/058_add_counter_purchase_origin.ts`

- [ ] **Step 1: Verificar numeracion de migraciones tenant**
  - Confirmar el numero mas alto en `packages/database/src/migrations/tenant/` y ajustar `058` si hay colision.
- [ ] **Step 2: Agregar `COUNTER_PURCHASE`** al enum `StockMovementOrigin`.
- [ ] **Step 3: Migracion `058`** que ejecuta `ALTER TYPE stock_movement_origin ADD VALUE IF NOT EXISTS 'COUNTER_PURCHASE'`, idempotente.
  - Documentar en el `down()` la limitacion de PostgreSQL (no se puede remover un valor de enum directamente): estrategia de reversa = recrear el tipo excluyendo el valor solo si ninguna fila lo usa; en caso contrario `down()` no-op documentado.
  - Tener en cuenta que `ALTER TYPE ... ADD VALUE` no corre dentro de una transaccion en versiones antiguas de PG; seguir el patron de migraciones de enum del repo.
- [ ] **Step 4: Build `@iwana/db`** y correr `migration:tenant:run`; verificar aplicacion.

## Task 2: CounterPurchaseService y DTO

**Files:**
- Create: `apps/api/src/modules/inventory/services/counter-purchase.service.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`

- [ ] **Step 1: DTO Zod `CreateCounterPurchaseSchema`**: proveedor (`partyRefId` uuid), numero de factura/soporte, fecha, `destinationLocationId`, `notes?`, `idempotencyKey?`, y `lines[]` con `itemId`, `quantityReceived`, `unitCost`, `lotNumber?`, `serialNumbers[]?`, `condition?`.
- [ ] **Step 2: `CounterPurchaseService.record(input, actor)`** dentro de `runInTenantSchema` + transaccion:
  - Validar bodega destino existe y proveedor presente.
  - Por cada linea: validar cantidad > 0; para items serializados/activo fijo, seriales = cantidad.
  - Crear `StockLot` por linea (patron de `GoodsReceiptService`).
  - Para serializados, crear activos con `SerializedAssetService.createReceivedAssetWithManager` (guardar factura en `purchaseOrderRef`, `purchaseDate`), transicion a `AVAILABLE` en la bodega destino.
  - Construir `movementLines` (cantidad positiva, `unitCost`) y postear via `StockLedgerService.recordMovementWithManager` con `origin: COUNTER_PURCHASE`, `originContext: 'inventory.counter-purchase'`, `originRefId: partyRefId`, `idempotencyKey`.
- [ ] **Step 3: Idempotencia**: `idempotencyKey` derivada (proveedor + factura) si no se provee; el ledger ya deduplica por clave.
- [ ] **Step 4: Unit tests** (Task 5) cubren ingreso simple, serializado, idempotencia y validaciones.

## Task 3: Endpoint, modulo y OpenAPI

**Files:**
- Modify: `apps/api/src/modules/inventory/inventory.controller.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

- [ ] **Step 1: Endpoint `POST /inventory/counter-purchases`** con `@Roles(ADMIN, NOC, SUPPORT)`, `ZodValidationPipe`, `@ApiOperation`, `@CurrentUser`.
- [ ] **Step 2: Registrar `CounterPurchaseService`** en `inventory.module.ts`.
- [ ] **Step 3: Actualizar OpenAPI** (contrato del nuevo endpoint).

## Task 4: Portal (panel de ingreso directo)

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/components/inventory/CounterPurchasePanel.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`

- [ ] **Step 1: Cliente API** `inventoryApi.createCounterPurchase` + tipos.
- [ ] **Step 2: `CounterPurchasePanel`** reutilizando el patron de `GoodsReceiptPanel` + `SupplierPicker`: selector de proveedor manual, lineas desde catalogo (item, cantidad, costo, lote, seriales), bodega destino, fecha, factura, resumen previo al registro. Textos en espanol; no exponer `partyRefId`.
- [ ] **Step 3: Integrar** como sub-vista dentro de Compras o pestana propia en `InventoryClient.tsx`; feedback de exito con numero de movimiento generado.
- [ ] **Step 4: E2E** del ingreso directo en `portal-inventory-scm.spec.ts` (opcional segun cobertura de la fase).

## Task 5: Tests y cierre

**Files:**
- Create: `apps/api/src/modules/inventory/tests/counter-purchase.service.spec.ts`
- Create/Update: `apps/api/src/modules/inventory/tests/counter-purchase.http.integration.spec.ts`

- [ ] **Step 1: Unit** ingreso simple no serializado (afecta `StockBalance`), ingreso serializado (crea activos `AVAILABLE`), idempotencia (doble registro = un movimiento), validaciones de error (sin lineas, cantidad 0, seriales != cantidad, bodega inexistente).
- [ ] **Step 2: Integracion HTTP** del endpoint.
- [ ] **Step 3: Verificacion extremo a extremo**: la compra impacta saldo y crea activos serializados cuando corresponde.
- [ ] **Step 4: Cierre**: lint + typecheck + tests; cobertura core >= 80%; actualizar informe vivo y checklist.
