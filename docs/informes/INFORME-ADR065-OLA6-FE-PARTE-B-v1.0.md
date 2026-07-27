# INFORME — ADR-065 Ola 6 · Parte B FE (parcial)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Entregado parcial — filtros servidor + pager en requests/issues  
**Padre:** [INFORME-ADR065-OLA6-KEYSET-v1.0](./INFORME-ADR065-OLA6-KEYSET-v1.0.md)  
**Prompt:** `docs/prompts/PROMPT-ADR065-OLA6-KEYSET-v1.0.md` Parte B  
**Commit:** No (orden orquestador)

---

## Resumen ejecutivo

Se retiraron los filtros en cliente de las 6 superficies bloqueantes y se cablearon query params al contrato Ola 6 Parte A.  
`PurchaseWorkspace` y `StockIssuesWorkspace` migraron a **self-fetch** + `useTableQueryState` + `PortalTablePager` (page + ListMeta).  
Conteos, proveedores, existencias-por-producto y filtros de lista de ubicaciones pasan filtros al servidor y conservan «Cargar más»/cursor donde aún no hay `page`.  
**Matriz:** sin endpoint de agregación → aviso UI + se mantiene `drainInventoryBalances` (no se inventó matriz nueva).  
`sortableFields` permanece `[]` (no inventados).

---

## 1. Superficies

| Superficie | Filtros servidor | Paginación | Notas |
| --- | --- | --- | --- |
| `PurchaseWorkspace` | `search`, `kpiPreset`, status/type/priority | `PortalTablePager` + URL `purchaseRequests.*` | Self-fetch; KPI page-local |
| `StockIssuesWorkspace` | `search`, type, status | `PortalTablePager` + URL `stockIssues.*` | Self-fetch; KPI page-local |
| `StockCountsWorkspace` | `status` (URL `counts.status`) | Cursor «Cargar más» (self-fetch) | Sin `page` en BE — no inventado |
| `SuppliersPanel` | `search` vía padre | Soft-cap page++ «Cargar más» | Ya tenía `page` offset |
| `StockByProductTable` | `search`, `belowMinimum`, `stockLocationId` | Cursor «Cargar más» | Ítems API (no balances) |
| `StockLocationsMatrix` | `search`, type, status/statusGroup, custody, withStock | Cursor «Cargar más» | Aviso agregación pendiente |

---

## 2. api-client

Ampliado tipado + serialización:

- `ListPurchaseRequestsParams`: `search`, `kpiPreset`, `page`
- `ListStockIssuesParams`: `search`, `page`
- `ListInventoryItemsParams`: `belowMinimum`, `stockLocationId`
- `ListStockLocationsParams`: `search`, `custody`, `statusGroup`, `withStock`

---

## 3. InventoryClient

- Deja de alimentar listas de compras/salidas (self-fetch en workspaces).
- `listRevision` para refresco post-mutación.
- Loaders de counts / suppliers / items / locations envían filtros Ola 6.
- Matriz (subvista stock + tab bodegas vía filtros compartidos): sigue drenando balances.

---

## 4. Residual / fuera de alcance esta sesión

- [ ] Endpoint de agregación de ocupación → retirar `drainInventoryBalances`
- [ ] `page` + ListMeta en counts / items / locations / suppliers ListMeta
- [x] Side peeks (`StockWorkspace`, peeks derivados por id) — ver [INFORME-ADR065-OLA6-SIDE-PEEKS-v1.0](./INFORME-ADR065-OLA6-SIDE-PEEKS-v1.0.md)
- [ ] Desacoplar loaders metas cruzadas restantes
- [ ] Graduación web users/audit
- [ ] Conteos KPI globales (hoy page-local)

---

## 5. Specs

| Spec | Expectativa |
| --- | --- |
| `PurchaseWorkspace.spec` | listRequests `{ page, limit }`; sin «Cargar más» |
| `StockIssuesWorkspace.spec` | listIssues `{ page, limit }`; empty + create |
| `StockByProductTable.spec` | sin filtro cliente search/below-min |
| `StockCountsWorkspace.spec` | intacto + status servidor opcional |
| Helpers `purchase-filters` / `issue-filters` / `location-matrix-filters` | se conservan para specs/helpers |

---

## 6. Stop/go local

| Gate | Estado |
| --- | --- |
| Filtros 6 superficies sin buffer mentiroso | **GO** |
| Pager requests + issues | **GO** |
| Cursor honesto en resto | **GO** |
| Matriz sin inventar agregación | **GO** (aviso + drain) |
| sortableFields | `[]` |
| Commit | No |

**Veredicto:** **GO parcial Parte B** — desbloqueado por Parte A; residual agregación/pager restante/side peeks.
