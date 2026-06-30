# Informe - MOD12 Inventario / SCM Fase 01

**Version:** 1.0  
**Fecha:** 2026-06-25  
**Estado:** Completada — deuda técnica DT-INV-01 a DT-INV-04 resuelta  
**Modo activo:** Ejecucion  
**Responsable:** Sr. Dev Fullstack (AI-SR-FULL)  
**Prompt:** docs/prompts/PROMPT-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md  
**Plan:** docs/plans/2026-06-25-mod12-inventario-scm-fase-01.md

---

## 1. Resumen ejecutivo

Se implementó el MVP end-to-end de MOD12 Inventario / SCM Fase 01 siguiendo ADR-048, PRD, HLD y el plan aprobado. El módulo queda aislado como bounded context propio con ledger inmutable, compras, recepción, stock, seriales, transferencias, salidas operativas, comodato vía puerto MOD11, retornos y bajas.

ADR-048 está **aprobado por CTO** — no se requirió autorización de ejecución controlada.

## 2. Entregables implementados

### Shared / Database

| Artefacto | Estado |
| --- | --- |
| Enums en `packages/shared/src/enums/inventory/*` | Completado |
| 16 entidades TypeORM MOD12 | Completado |
| Migración `047_create_inventory_scm_module.ts` | Completado |
| Registro en `entities/index.ts` y `runner.ts` | Completado |

### Backend (`apps/api/src/modules/inventory`)

| Componente | Estado |
| --- | --- |
| `InventoryModule` registrado en `app.module.ts` | Completado |
| Servicios: items, locations, ledger, balance, seriales, compras, recepción, lifecycle, dashboard | Completado |
| `InventoryMovementPort` + integración MOD11 | Completado |
| Controladores `/inventory` y `/purchasing` con Swagger | Completado |
| DTOs Zod + RBAC `UserRole.*` | Completado |
| Tests unitarios, HTTP e integración (26 tests) | Completado |

### Frontend (`apps/portal`)

| Componente | Estado |
| --- | --- |
| `/dashboard/inventory` | Completado |
| `InventoryClient` con tabs operativos | Completado |
| Componentes de compras, bodegas, activos, transferencias | Completado |
| `inventory-labels.ts` — sin enums crudos | Completado |
| Navegación sidebar "Inventario" | Completado |
| `inventoryApi` / `purchasingApi` en api-client | Completado |
| Tests `InventoryClient.spec.tsx` (3 tests) | Completado |

### E2E

| Artefacto | Estado |
| --- | --- |
| `e2e/tests/portal-inventory-scm.spec.ts` | Completado — 3 tests PASS (dashboard, navegación, ciclo compra→recepción→transferencia→retorno) |

## 3. Criterios de aceptación

| ID | Criterio | Evidencia |
| --- | --- | --- |
| CA-INV-01 | Solicitud de compra y cotizaciones | `purchasing.service.spec.ts`, `PurchaseDesk.tsx`, E2E |
| CA-INV-02 | OC con consecutivo por tenant | `PurchasingService.createPurchaseOrderFromRequest` |
| CA-INV-03 | Recepción crea lotes, saldos y seriales | `goods-receipt.service.ts`, tests |
| CA-INV-04 | Serial/MAC único por tenant | `serialized-asset.service.spec.ts` |
| CA-INV-05 | Transferencia actualiza ledger y custodia | `stock-ledger.service.spec.ts`, `StockTransferDialog` |
| CA-INV-06 | OT instala en comodato vía puerto | `inventory-movement.port.spec.ts` |
| CA-INV-07 | MOD11 recibe `stockMovementId` | `execution-order-inventory.service.ts` delega al puerto |
| CA-INV-08 | Venta directa con referencia comercial | `StockLedgerService` origen `SALE` |
| CA-INV-09 | Consumo interno con motivo y centro de costo | endpoint `movements/internal-consumption` |
| CA-INV-10 | Retorno con clasificación | endpoint `returns` |
| CA-INV-11 | Baja con motivo, actor y aprobación | endpoint `write-offs` |
| CA-INV-12 | Dashboard operativo | `InventoryDashboard`, `GET /inventory/dashboard` |
| CA-INV-13 | OpenAPI | decoradores Swagger en controladores |
| CA-INV-14 | Tests focalizados en verde | ver sección 4 |

## 4. Comandos de verificación

```powershell
corepack pnpm --filter @iwana/api test -- inventory
# 8 suites, 26 tests PASS

corepack pnpm --filter @iwana/portal test -- GoodsReceiptPanel InventoryClient
# 5 tests PASS

corepack pnpm --filter @iwana/db typecheck
# PASS

corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
# 3 tests PASS
```

## 5. Deuda técnica identificada

| ID | Descripción | Severidad | Estado |
| --- | --- | --- | --- |
| DT-INV-01 | `GoodsReceiptPanel` requería `purchaseOrderLineId` manual | Media | **Resuelto** — `GET /purchasing/orders/:id` con líneas + precarga en UI |
| DT-INV-02 | `WriteOffStatus` sin enum PostgreSQL | Baja | **Resuelto** — migración `048_harden_inventory_write_off_status.ts` |
| DT-INV-03 | Integration tests tenant-aware pendientes | Media | **Resuelto** — `purchasing.flow.integration.spec.ts` |
| DT-INV-04 | E2E con mocks HTTP — no valida backend real | Baja | **Resuelto** — `purchasing.http.integration.spec.ts` (ciclo HTTP tenant-aware) + E2E ampliado con flujo OC→recepción→transferencia→retorno |

## 6. Bloqueantes

Ninguno. ADR-048 aprobado. Boundaries respetados.

## 7. Decision de stop/go

**GO** para merge. Fase 01 cerrada sin deuda técnica abierta.

---

_Informe generado durante ejecución de PROMPT-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md_
