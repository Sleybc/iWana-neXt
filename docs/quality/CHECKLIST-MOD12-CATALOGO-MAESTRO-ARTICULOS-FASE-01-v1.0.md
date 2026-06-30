# CHECKLIST — MOD12 Catálogo Maestro de Artículos Fase 01

**Versión:** 1.0  
**Fecha:** 2026-06-25

---

## Persistencia

- [x] Enum `inventory_item_kind` creado
- [x] Columnas de compra/inventario/lifecycle en `inventory_items`
- [x] Backfill conservador (`purchasable`, `inventory_controlled`, `asset_controlled`)
- [x] Índices operativos mínimos
- [x] Migración 051 registrada en runner tenant
- [x] Rollback `down()` verificado en código

## API

- [x] `GET /inventory/items` con `search`, `itemKind`, `purchasable`
- [x] `GET /inventory/items/:id`
- [x] `PATCH /inventory/items/:id`
- [x] `GET /inventory/items/catalog/options`
- [x] `POST /inventory/items` ajustado al maestro extendido
- [x] Validaciones cruzadas UoM / asset / reorder
- [x] Guards RBAC en endpoints
- [x] Decoradores OpenAPI

## Portal

- [x] Pestaña Catálogo operativa
- [x] KPIs, filtros, tabla y drawer
- [x] Copy en español sin enums crudos visibles
- [x] Selector de Compras migrado a `catalogOptions`
- [x] Prellenado de unidad y proveedor sugerido

## Tests

- [x] Unit backend `inventory-item.service.spec.ts`
- [x] HTTP backend `inventory.controller.http.spec.ts`
- [x] Frontend `InventoryClient.spec.tsx`
- [x] Frontend `PurchaseRequestComposer.spec.tsx`
- [x] Helpers `purchase-catalog-selector.spec.ts`
- [x] E2E flujo catálogo → compra

## Documentación

- [x] Informe de fase archivado
- [x] Checklist archivado

## Observabilidad

- [x] Eventos `inventory.item-created`
- [x] Eventos `inventory.item-updated`
- [x] Eventos `inventory.catalog-option-requested`
- [x] `preferredSupplierName` en `catalog/options`

## Gates pre-merge

- [x] Typecheck db/api/portal
- [x] Migración 051 aplicada (`migration:tenant:run` en `tenant_iwana`)
- [x] E2E `portal-inventory-scm.spec.ts` (6/6)
- [ ] Revisión de boundary Modulith
- [ ] Sin PII en logs/tests
