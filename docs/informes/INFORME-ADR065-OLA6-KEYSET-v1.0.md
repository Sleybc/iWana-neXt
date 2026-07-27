# INFORME — ADR-065 Ola 6 · Superficies keyset (Parte A backend)

**Versión:** 1.1  
**Fecha:** 2026-07-25  
**Autor:** AI-SR-FULL  
**Estado:** Entregado parcial — filtros + `page` prioritarios ampliados; residual abajo  
**Prompt:** `docs/prompts/PROMPT-ADR065-OLA6-KEYSET-v1.0.md`  
**Kickoff:** [INFORME-ADR065-OLA5-COSECHA-OFFSET-v1.0](./INFORME-ADR065-OLA5-COSECHA-OFFSET-v1.0.md) (diferidas por filtro cliente)  
**Clasificación:** Uso interno  
**Commit:** No (orden orquestador)

---

## Resumen ejecutivo

Se subieron a servidor los filtros que bloqueaban la migración FE de Proveedores, Compras, Conteos, Salidas, Existencias-por-producto y Matriz de ubicaciones (filtros de lista).  
`page` aditivo + `ListMeta` completo pasó de **2** a **7** endpoints prioritarios (+ catálogo comercial).  
**No** se inventó p95 ni se tocó UI portal. Endpoint de agregación de matriz y resto de commercial/keyset quedan documentados como residual.

**Addendum v1.1 (Parte A residual):** suppliers (ListMeta dual-emit), counts, items, assets, commercial catalog.

---

## 1. Filtros servidor (bloqueante Parte B)

| Superficie FE | Endpoint | Antes | Ahora |
| --- | --- | --- | --- |
| `SuppliersPanel` búsqueda | `GET /purchasing/suppliers` | `search` ya existía (código + party) | + `purchasing_contact_name` / `purchasing_contact_email` ILIKE |
| `PurchaseWorkspace` | `GET /purchasing/requests` | status/type/priority/area | + `search`, + `kpiPreset` (`pendingQuotes`…`overdue`) |
| `StockIssuesWorkspace` | `GET /inventory/issues` | type/status/locationIds | + `search` (id, nombres bodega, refs, costCenter) |
| `StockCountsWorkspace` | `GET /inventory/counts` | `status` ya existía | Confirmado + OpenAPI/spec; FE debe pasar `status` |
| `StockByProductTable` | `GET /inventory/items` (grano correcto) | `search` ya existía | + `belowMinimum` (+ `stockLocationId` opcional). **Nota:** el prompt mapeaba a balances; el overview pagina **ítems**, no filas de balance |
| `StockLocationsMatrix` filtros lista | `GET /inventory/locations` | type/status | + `search`, `custody=mobile`, `statusGroup=inactive_group`, `withStock` |

### Semántica `kpiPreset` (paridad portal)

| Valor | SQL |
| --- | --- |
| `pendingQuotes` | `status IN (DRAFT, PENDING_QUOTES)` (ignora `status` puntual) |
| `pendingApproval` / `readyForPo` / `pendingReceipt` | status correspondiente si no viene `status` |
| `urgent` | `priority = URGENT` si no viene `priority` |
| `overdue` | `needed_by_date < CURRENT_DATE` y status ∉ terminales |

### Semántica `belowMinimum`

Disponible agregado de `stock_balances` (opcionalmente acotado por `stockLocationId`) ≤ 0 **o** &lt; `minimum_stock` — equivalente a estados FE `out` ∪ `below-minimum`.

---

## 2. `page` aditivo / ListMeta

| Endpoint | Cursor | `page` | Meta |
| --- | --- | --- | --- |
| `GET /purchasing/requests` | sí | sí (excluyente) | `buildPageMeta` / `buildCursorMeta` (`randomAccess: true`, `sortableFields: []`) |
| `GET /inventory/issues` | sí | sí (excluyente) | igual |
| `GET /purchasing/suppliers` | no (offset nativo) | sí (default 1) | `buildPageMeta` + **dual-emit** planos `total`/`page`/`limit` (compat FE actual) |
| `GET /inventory/counts` | sí | sí (excluyente) | ListMeta completo |
| `GET /inventory/items` | sí | sí (excluyente) | ListMeta completo |
| `GET /inventory/assets` | sí | sí (excluyente) | ListMeta completo — desbloquea lista activos diferida Ola 5 |
| `GET /commercial/catalog` | sí | sí (excluyente) | ListMeta completo (envelope H-11 intacto) |

Infra:

- `inventoryHybridPaginationZod` — endpoints que implementan `page`
- `inventoryListPaginationZod` — sin `page` (evita footgun en el resto)
- `assertExclusivePageCursor` → 400 si ambos
- `buildCursorMeta` acepta `randomAccess` / `sortableFields` opcionales

**No medido p95** → `sortableFields` permanece `[]` (regla Ola 2 / ADR-065 §18).

---

## 3. OpenAPI + tests

| Artefacto | Resultado |
| --- | --- |
| `inventory.swagger.spec` | params `page` en items/counts/assets; `belowMinimum`, `search` issues/locations |
| `purchasing.swagger.spec` | params `search`, `kpiPreset`, `page` requests; `page` + ListMeta suppliers |
| `catalog` controller/service | `page` en `CatalogQueryDto`; ListMeta en `findAll` |
| `inventory-ola6-filters.spec.ts` | schemas híbridos + page mode counts + page mode requests |
| Specs tocados stock-issue / inventory-item / supplier-profile / catalog | verdes (sesión) |

---

## 4. Checklist residual (sin big-bang)

### Parte A — Backend

- [x] `page` + ListMeta prioritarios: suppliers, counts, items, assets, catalog (+ piloto requests/issues)
- [ ] Resto keyset: categorías, ubicaciones, balances, bundles/promos/compat/tax, users, audit×2
- [ ] Recursos `randomAccess: false` (feeds): **no** recibir `page`; mantener cursor + `sortableFields: []`
- [ ] Orden por columna / `sortableFields` poblados tras p95 real (Ola 2 deuda)
- [ ] Endpoint de **agregación** para matriz de ubicaciones (ocupación sin drenar 50×100) — consulta AI-PROD-UX pendiente; filtros de lista ya en `/locations`
- [ ] Dual-emit legacy `{ nextCursor, total }` → ListMeta en categorías/ubicaciones/balances/commercial restante (hoy ListMeta completo en 7 + catalog)
- [ ] Cosecha dual-emit planos en `GET /purchasing/suppliers` cuando FE lea solo `meta`

### Parte B — FE (fuera de esta sesión; desbloqueado por filtros + page)

- [ ] Migrar UIs diferidas Ola 5 pasando filtros al query string (no filtrar buffer)
- [ ] Lista activos: consumir `page`/`meta` de `/inventory/assets`
- [ ] Matriz: consumir agregación cuando exista; retirar `drainInventoryBalances`
- [x] Side peeks: cachear registro / detail-by-id (`StockWorkspace`, `PendingVisitRequestsView`, `SchedulingClient`, `StockTransferDialog`) — [INFORME-ADR065-OLA6-SIDE-PEEKS-v1.0](./INFORME-ADR065-OLA6-SIDE-PEEKS-v1.0.md)
- [ ] Desacoplar loaders `InventoryClient` (metas cruzadas)

### Coordinación EM-ARCH

- [ ] Si agregación de matriz cambia el mensaje de la vista → escalar PROD-UX
- [ ] Graduación `@iwana/ui` / web tables (usuarios/audit) — sin disparar desde esta ola

---

## 5. Stop/go local

| Gate | Estado |
| --- | --- |
| Filtros 6 superficies bloqueantes en contrato API | **GO** (conteos ya estaban; resto añadidos/ampliados) |
| `page` en 18 keyset | **Parcial** (7 inventory/purchasing + 1 catalog ≈ 8/18+) |
| Agregación matriz | **Pendiente** (documentado; no big-bang) |
| p95 / sortableFields | **No inventados** |
| OpenAPI + Jest mínimos | **GO** (suites tocadas) |
| UI portal | No tocada |
| Commit | No |

**Veredicto:** **GO parcial Parte A residual** — FE-PLATFORM puede migrar Proveedores (meta dual-emit), Conteos, Ítems, Activos y Catálogo comercial con pager numerado; agregación de matriz y resto keyset siguen en residual.
