# INFORME — MOD12 Catálogo Maestro de Artículos Fase 01

**Versión:** 1.0  
**Fecha:** 2026-06-25  
**Estado:** Implementado  
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL)

---

## 1. Resumen

Se evolucionó `inventory_items` al **Catálogo Maestro de Artículos** dentro de MOD12, con persistencia extendida, API de consulta/CRUD, vista **Catálogo** en portal y migración del selector de **Compras** hacia `GET /inventory/items/catalog/options`.

## 2. Entregables implementados

### Backend
- Enum `InventoryItemKind` en `@iwana/shared`.
- Entidad `InventoryItem` refinada con atributos de compra, inventario y lifecycle.
- Migración tenant `051_expand_inventory_item_master_catalog.ts` (reversible, backfill conservador).
- DTOs Zod ampliados con validaciones cruzadas.
- `InventoryItemService`: list con búsqueda/filtros, `getById`, `update`, `listCatalogOptions`.
- Endpoints: `GET/PATCH /inventory/items/:id`, `GET /inventory/items/catalog/options`.
- Tests unitarios e HTTP actualizados.

### Frontend
- Cliente tipado ampliado (`inventoryApi.getItem`, `updateItem`, `listCatalogOptions`).
- Pestaña **Catálogo** con KPIs, filtros, tabla densa y drawer create/edit.
- `PurchaseRequestComposer` consume opciones de catálogo activas/comprables con búsqueda y prellenado de UoM/proveedor.

### E2E
- Flujo: crear artículo en Catálogo → usarlo en solicitud de compra (`portal-inventory-scm.spec.ts`).

## 3. Criterios de aceptación

| ID | Estado | Evidencia |
| --- | --- | --- |
| CA-CAT-01 | Cubierto | Drawer + `POST/PATCH /inventory/items` con campos extendidos |
| CA-CAT-02 | Cubierto | Pestaña Catálogo + filtros `search`/`purchasable` |
| CA-CAT-03 | Cubierto | `listCatalogOptions` filtra `ACTIVE` + `purchasable` |
| CA-CAT-04 | Cubierto | Prellenado UoM y proveedor sugerido en composer |
| CA-CAT-05 | Cubierto | Origen MOD12, sin MOD06 Comercial |
| CA-CAT-06 | Cubierto | Sin FKs cross-module |
| CA-CAT-07 | Cubierto | Migración 051 con `down()` reversible |
| CA-CAT-08 | Cubierto | OpenAPI decorators + cliente tipado |

## 4. Verificación ejecutada

```powershell
corepack pnpm --filter @iwana/shared build
corepack pnpm --filter @iwana/db build
corepack pnpm --filter @iwana/db migration:tenant:run
corepack pnpm --filter @iwana/db typecheck
corepack pnpm --filter @iwana/api typecheck
corepack pnpm --filter @iwana/portal typecheck
corepack pnpm --filter @iwana/api test -- inventory-item.service.spec.ts inventory.controller.http.spec.ts
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx PurchaseRequestComposer.spec.tsx purchase-catalog-selector.spec.ts
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

Resultado: migración 051 en `tenant_iwana`; tests unitarios/HTTP/portal OK; **6/6 E2E** inventario OK.

## 5. Deuda técnica

| Item | Clasificación | Estado |
| --- | --- | --- |
| Eventos `inventory.item-created/updated/catalog-option-requested` | Baja | **Resuelto** — `EventEmitter2` + logs estructurados |
| Nombre de proveedor en `listCatalogOptions` | Baja | **Resuelto** — `preferredSupplierName` vía `SupplierPartyPort` |
| KPI “bajo mínimo” sin agregación server-side | Baja | Pendiente fase posterior (no bloqueante) |

## 6. Bloqueantes

Ninguno.

## 7. Desviaciones

Ninguna aprobada fuera del prompt de ejecución.
