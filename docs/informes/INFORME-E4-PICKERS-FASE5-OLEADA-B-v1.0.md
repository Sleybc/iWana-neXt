# INFORME — E-4 Pickers soft-cap · Fase 5 oleada B

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Plan:** [2026-07-24-pickers-softcap-remediacion.md](../plans/2026-07-24-pickers-softcap-remediacion.md) §Fase 5  
**Contratos:** [UX typeahead](../specs/2026-07-25-picker-typeahead-servidor-ux.md) · [DS SearchablePicker](../specs/2026-07-25-searchable-picker-ds-contrato.md) · [F4 lookups](INFORME-E4-PICKERS-FASE4-LOOKUPS-v1.0.md) · [F5A](INFORME-E4-PICKERS-FASE5-OLEADA-A-v1.0.md)  
**Clasificación:** Uso interno  

---

## Veredicto

Oleada B **entregada**. Prefetches soft-cap silenciosos de ítems/ubicaciones/activos retirados de `InventoryClient`. Pickers de entidad cableados a `SearchablePicker` + lookups F4 inventory. Matriz de balances **sin** forzar SearchablePicker (ya advierte truncamiento). Alias `INVENTORY_PICKER_SOFT_CAP` eliminado. **Sin commit.** Paginación / URL Ola 3 de inventario **preservada**.

---

## 1. Migrado

| Sitio | Antes | Ahora |
| --- | --- | --- |
| `InventoryClient` loaders (assets/issues/counts/requests/writeoffs) | Prefetch `list*(limit: INVENTORY_PICKER_SOFT_CAP)` | Solo listados operativos (page size); sin soft-cap de entidades para pickers |
| Bajas (`WriteOffsPanel`) | Select sobre arrays soft-cap | `InventoryItemPicker` / `InventoryLocationPicker` / `InventoryAssetPicker` |
| Movimientos (`MovementsWorkspace`) | Select item/location | Pickers F4 |
| Conteos create (`StockCountsWorkspace`) | Select bodega soft-cap | `InventoryLocationPicker` (categoría residual soft-cap) |
| Compra mostrador / recepción OC | Select bodega | `InventoryLocationPicker` |
| Ajuste (`StockAdjustmentDialog`) | Select items/locations | Pickers F4 (modal) |
| Kardex filtros | Select soft-cap | Pickers F4 |
| Salidas (`StockIssueComposer`) | Select origen/destino + catálogo client-side | Location pickers + `items/search` typeahead; balances/assets por `locationId` con aviso si truncado |

### API client (portal)

- `inventoryApi.searchItemsForPicker`
- `inventoryApi.searchLocationsForPicker`
- `inventoryApi.searchAssetsForPicker`
- Mapeo `mapPickerSearchResponse({ data, total }) → { items, total }`

### Thin wrappers

- `InventoryItemPicker.tsx`
- `InventoryLocationPicker.tsx`
- `InventoryAssetPicker.tsx`

---

## 2. Matriz de balances (respetado)

`StockLocationsMatrix` / `drainInventoryBalances` **no** migrados a SearchablePicker. Siguen con aviso «Ocupación parcial» + «Cargar más existencias» cuando hay truncamiento. No es picker de entidad.

En salidas, al elegir origen se cargan balances/assets **filtrados por ubicación** (`limit: 100`); si `hasMore`, el composer muestra aviso de existencias parciales (no silencioso a nivel tenant completo).

---

## 3. Residual — grep portal

### `INVENTORY_PICKER_SOFT_CAP`

**0 coincidencias** en `apps/portal/src/` (alias retirado de `inventory-list-pagination.ts`).

### `PICKER_SOFT_CAP` (queda a propósito)

| Archivo | Uso |
| --- | --- |
| `lib/picker-soft-cap.ts` | Constante ADR-064 |
| `InventoryClient` `loadCommercialProductOptions` | Soft-cap comercial embebido en drawer (sin SearchablePicker comercial en B) |
| `InventoryClient` `loadCategories` (fuera panel categorías) | Select categoría — **no hay** `GET /inventory/categories/search` |
| `inventory-list-pagination.ts` | Re-export + `SUPPLIERS_SOFT_CAP_PAGE_SIZE` |
| `api-client` `COMMERCIAL_PICKER_LIMIT` | Límite histórico commercial list |
| Specs / comentarios | Documentación ADR-064 |

### Otros residuales

| Ítem | Motivo |
| --- | --- |
| Categoría en conteos / create product / catalog drawer | Sin endpoint search F4 |
| Producto comercial en `InventoryCatalogDrawer` | Soft-cap `getAdditionalProducts`; migrar a `searchAdditionalProductsForPicker` en micro-ola |
| Filtro `type` en locations/search | Lookup F4 no filtra por tipo; validación de tipo de salida en backend |
| Labels de listados issues/writeoffs sin seed | Truncación de UUID si no hay mapa local (detalle abre con IDs del record) |
| `StockItemDetailDrawer` movimientos `limit: 10` | Fuera de oleada B (igual que F5A) |
| SR-QA CA-PICK-13 tenant >100 | Pendiente post-B |

---

## 4. Ola 3 / Ola 4 — no roto a propósito

- Query URL inventario (`tab`, `custody`, `action`, asset detail pages, cursors listados) intacta.
- No se tocaron primitives de paginación numerada Ola 3 fuera de dejar de pasar soft-cap a pickers.
- Archivos de Ola 4 distintos de InventoryClient: no modificados en esta oleada salvo consumo de pickers en formularios inventory.

---

## 5. Tests / smoke

- Actualizados: `StockAdjustmentDialog.spec`, `MovementsWorkspace.spec`, `StockKardexPanel.spec`.
- Smoke Jest: `inventory-list-pagination`, `SupplierPicker`, ajuste, kardex, movimientos — **PASS**.

---

## 6. Fuera de alcance (respetado)

Sin backend · sin commit · sin forzar SearchablePicker en matriz de balances · sin migrar categorías/comercial embebido sin lookup.
