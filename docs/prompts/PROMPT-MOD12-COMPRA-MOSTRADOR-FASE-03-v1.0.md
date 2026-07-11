# PROMPT - MOD12 Compra de Mostrador (Ingreso Directo) Fase 03

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-11
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH
**Aprobado por:** CTO
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL)
**Plan:** docs/plans/2026-07-11-mod12-compras-mostrador-fase-03.md
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRA-MOSTRADOR-FASE-03-v1.0.md`

---

## 1. Objetivo exacto

Incorporar a MOD12 el **ingreso directo de inventario por compra de mostrador**: una entrada de stock con proveedor elegido a mano, factura/soporte y costo, que impacta inventario fisico y de sistema en un solo paso, **sin** crear solicitud ni orden de compra, conforme a ADR-050.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`
- `docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md`
- `docs/plans/2026-07-11-mod12-compras-mostrador-fase-03.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md`
- `.github/instructions/api.instructions.md`
- `.github/instructions/database.instructions.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/portal.instructions.md`
- `.github/instructions/testing.instructions.md`
- Referencia de reuso: `apps/api/src/modules/inventory/services/goods-receipt.service.ts`, `stock-ledger.service.ts`, `serialized-asset.service.ts`; `apps/portal/src/components/inventory/GoodsReceiptPanel.tsx`, `SupplierPicker.tsx`.

## 3. Alcance exacto

### Si entra

- Nuevo origen de movimiento `COUNTER_PURCHASE`.
- Migracion tenant que agrega el valor al enum PG `stock_movement_origin`, reversible segun estrategia documentada.
- Servicio dedicado `CounterPurchaseService` (`counter-purchase.service.ts`) que reutiliza `StockLedgerService.recordMovementWithManager` y `SerializedAssetService`, en paralelo a `GoodsReceiptService` (no reutiliza este ultimo por estar acoplado a OC): entrada positiva a bodega destino, creacion de `StockLot`, activos serializados y transiciones a `AVAILABLE`, valorizacion con `unitCost`, idempotencia.
- DTO Zod + endpoint `POST /inventory/counter-purchases` (roles ADMIN/NOC/SUPPORT).
- Panel de portal "Ingreso directo / Compra de mostrador" (proveedor manual, lineas de catalogo, costo, lote, seriales, bodega, fecha, factura).
- Resolucion de nombre de proveedor por query service (no exponer `partyRefId`).
- OpenAPI, tests unit e integracion, textos en espanol.

### No entra

- RFQ / solicitud de cotizacion (fase separada, ADR propio).
- Orden de compra implicita o solicitud automatica.
- Tope de monto por compra de mostrador (mejora futura).
- Valorizacion contable / DIAN / costo promedio.
- Portal proveedor.

## 4. Restricciones no negociables

1. Mantener el ingreso dentro de MOD12; no crear bounded context nuevo.
2. Mover stock solo por `StockLedgerService`; no escribir saldos ni lotes fuera del ledger.
3. No crear `PurchaseRequest`, `SupplierQuote`, `PurchaseRequestLineAward` ni `PurchaseOrder`.
4. No reutilizar `GoodsReceiptService` (esta acoplado a OC); crear camino de ingreso propio.
5. No duplicar maestro de proveedor; referenciar MOD08 Parties por `partyRefId`, sin FK cross-module.
6. No exponer `partyRefId` como texto visible en UI.
7. Multi-tenant estricto: `TenantContext.getOrThrow()` + `runInTenantSchema`; nunca hardcodear schema.
8. Migracion reversible con `up()`/`down()`; documentar la limitacion de reversa de `ALTER TYPE ADD VALUE`.
9. Idempotencia obligatoria en el ingreso (`idempotencyKey`).
10. No romper endpoints existentes; actualizar cliente, OpenAPI y tests.

## 5. Entregables tecnicos obligatorios

### Shared
- `COUNTER_PURCHASE` en `packages/shared/src/enums/inventory/stock-movement-origin.enum.ts`.

### Database
- Migracion tenant `packages/database/src/migrations/tenant/058_add_counter_purchase_origin.ts` (o siguiente numero libre) que agrega el valor al tipo `stock_movement_origin`, idempotente, con estrategia de `down()` documentada.

### Backend (apps/api)
- `CounterPurchaseService.record(input, actor)` en `counter-purchase.service.ts`, reutilizando `StockLedgerService` y `SerializedAssetService` para creacion de lote y activos serializados.
- `CreateCounterPurchaseSchema` + DTO clase en `apps/api/src/modules/inventory/dto/`.
- Endpoint `POST /inventory/counter-purchases` en `inventory.controller.ts`.
- Validaciones: al menos una linea; cantidad > 0; seriales = cantidad para items serializados/activo fijo; bodega destino existente; proveedor requerido.

### Frontend (apps/portal)
- Panel de ingreso directo integrado en el modulo Inventario (sub-vista de Compras o pestana propia), con `SupplierPicker`, selector de catalogo, y resumen previo al registro.
- Cliente API en `lib/api-client.ts`.
- Feedback de exito con numero de movimiento generado.

### Tests
- Unit: ingreso simple no serializado, ingreso serializado con seriales, idempotencia (doble POST = un movimiento), validaciones de error.
- Integracion HTTP del endpoint.
- Cobertura >= 80% en core.

## 6. Criterio stop/go

- **GO otorgado:** ADR-050 Aprobado por CTO (2026-07-11). Ejecucion de la Fase 03 habilitada.
- **STOP** si aparece necesidad de crear objetos de flujo de compras, tope de monto, o valorizacion contable: escalar a AI-EM-ARCH, no improvisar.

## 7. Definicion de hecho (DoD)

- Lint + typecheck + tests verdes; cobertura core >= 80%.
- Migracion aplica y revierte segun estrategia documentada.
- OpenAPI actualizada; sin PII en logs.
- Ingreso verificado extremo a extremo: la compra impacta saldo (`StockBalance`) y crea activos serializados `AVAILABLE` cuando corresponde.
- Informe vivo del modulo actualizado al cierre.
