# INFORME — ADR-065 Ola 6 · FE Activos / Conteos / Proveedores

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Entregado — stop/go pendiente AI-SR-QA  
**Padre BE:** [INFORME-ADR065-OLA6-KEYSET-v1.0](./INFORME-ADR065-OLA6-KEYSET-v1.0.md) (v1.1)  
**Motivo:** Parte B residual — migrar lista de activos (desbloqueada por `page` en `/inventory/assets`) + alinear Conteos y Proveedores al pager numerado Ola 4/5.

---

## Resumen ejecutivo

Las tres superficies pasan a **self-fetch** con `useTableQueryState` + `PortalTablePager`. Se integró el trabajo parcial de filtros servidor (status conteos, search proveedores) en URL namespaced, sin filtrar buffer cliente. `sortableFields: []` — no inventados.

---

## Entregables

| # | Superficie | Namespace URL | Filtros servidor | Specs |
| --- | --- | --- | --- | --- |
| 1 | **Lista activos** · `AssetsWorkspace` | `assets.*` | — | `AssetsWorkspace.spec` (2) |
| 2 | **Conteos** · `StockCountsWorkspace` | `counts.*` | `status` | `StockCountsWorkspace.spec` (4) |
| 3 | **Proveedores** · `SuppliersPanel` | `suppliers.*` | `search` (debounce 300 ms) | `SuppliersPanel.spec` (2) |

**Veredicto local specs:** 8/8 verdes.

---

## Anatomía (paridad Ola 4/5)

- Página: `history.push`; filtros/size: `replace` + reset página 1.
- Pie: `PortalTablePager` + `PortalPageSizeSelect` cuando `total >` opción mínima y `randomAccess`.
- Fallback `PortalTablePagination` si `randomAccess: false`.
- `normalizeListMeta` + `capabilities.randomAccess` desde envelope / dual-emit suppliers.
- Replace de página (conjuntos disjuntos); sin botón «Cargar más».

---

## Cableado

- `api-client`: `page` en `listAssets` / `listCounts`; `SupplierProfileListResult.meta?` (dual-emit).
- `InventoryClient`: deja de poseer load-more/cursor de assets/counts/suppliers; usa `*ListRevision` para refresh tras mutaciones; bootstrap de assets preview del dashboard intacto (`enrichmentAssets` → comodatos).
- Filtros servidor de otra Parte B (status/search) **conservados** y movidos a URL via `useTableQueryState`.

---

## Fuera de alcance

| Ítem | Motivo |
| --- | --- |
| Catálogo comercial pager | Otra tanda / no pedido aquí |
| Matriz ubicaciones / `drainInventoryBalances` | Agregación BE pendiente |
| `sortableFields` poblados | Sin p95 |
| Commit | Orden orquestador |

---

## Stop/go FE-PLATFORM

| Gate | Resultado |
| --- | --- |
| Specs Assets + Counts + Suppliers | **GO** (8) |
| Sin «Cargar más» en las 3 listas | Cumplido |
| Filtros servidor no revertidos | Cumplido |
| `sortableFields: []` | Cumplido |
| Sin commit | Cumplido |

**Veredicto:** **GO** Parte B residual activos/conteos/proveedores — listo para gate SR-QA.
