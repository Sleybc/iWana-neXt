# INFORME — ADR-065 Ola 5 residual · Inventario Activos/Bajas

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Entregado — stop/go pendiente AI-SR-QA  
**Padre:** [INFORME-ADR065-OLA5-COSECHA-OFFSET-v1.0](./INFORME-ADR065-OLA5-COSECHA-OFFSET-v1.0.md)  
**Motivo:** §16 — migrar hermanos del módulo Activos/Bajas en un solo PR para no mezclar gramáticas (pager vs «Cargar más»)

---

## Entregables

| # | Superficie | Anatomía | Specs |
| --- | --- | --- | --- |
| 1 | **Comodatos · `AssetLoansPanel`** | Self-fetch; namespace URL `assetLoans.*`; filtro `status` servidor; `PortalTablePager` + replace de página; sin acumulación | `AssetLoansPanel.spec` (4) |
| 2 | **Bajas · historial `WriteOffsPanel`** | Self-fetch en sección historial; namespace `writeOffHistory.*`; filtro `status` servidor; pager numerado; `historyRevision` desde mutaciones del padre | `WriteOffsPanel.spec` (4) |
| 3 | **Activos · lista `AssetsWorkspace`** | **No migrada a pager** — API `GET /inventory/assets` sigue en **cursor** (`nextCursor` + `total`); conserva «Cargar más» + strip ADR-064 | — |

**Pendientes de aprobación (bajas):** siguen soft-cap página 1 en `InventoryClient` (bandeja operativa, no directorio offset).

**Veredicto local specs:** 8/8 verdes (AssetLoans + WriteOffs). Vida útil ya migrada en Ola 5 padre permanece intacta.

---

## Anatomía (igual que Ola 5 / piloto Ola 4)

- Página: `history.push`; filtros/size: `replace` + reset página 1.
- Pie: `PortalTablePager` + `PortalPageSizeSelect` cuando `total >` opción mínima y `randomAccess`.
- Fallback `PortalTablePagination` si `randomAccess: false`.
- `sortableFields: []` — **no inventados**; FE deriva `ListMeta` con `normalizeListMeta` + `capabilities.randomAccess: true` provisional.
- Mocks: páginas disjuntas; assert sin botón «Cargar más».

---

## Cambios de cableado

- `AssetLoansPanel` deja de ser presentacional controlado; `AssetsWorkspace` / `InventoryClient` ya no poseen estado `loans*` ni «Cargar más» de comodatos.
- Historial de bajas sale de `InventoryClient` (`historyWriteOffs*`); el padre solo mantiene pendientes + `writeOffHistoryRevision` tras crear/aprobar/rechazar.
- Etiquetas de comodato siguen enriquecidas con `assets`/`items` del workspace (API de loans no emite SKU/serial).

---

## Fuera de alcance (sin cambio)

| Superficie | Motivo |
| --- | --- |
| Lista de activos (cursor) | Sin offset servidor — migrar cuando SR-FULL exponga `page`/`limit` en `listAssets` |
| `TasksTable` | E-2 FEED |
| Proveedores / Compras / Conteos (+ Issues / StockByProduct / Locations con filtro cliente) | Ola 6 |
| Web users / audit / tenants | Graduación `@iwana/ui` |
| Pending visits | Envelope + `randomAccess` del servidor |

---

## Checklist residual Ola 5 (actualizado)

- [x] Migrar comodatos (`AssetLoansPanel`) a pager
- [x] Migrar historial WriteOffs a pager
- [x] Vida útil ya en pager (Ola 5 padre)
- [ ] Lista de activos → pager **cuando** BE sea offset (hoy cursor)
- [ ] Pending visits: envelope + `randomAccess`
- [ ] Web users / audit / tenants
- [ ] Evidencia Playwright 1280/375
- [ ] Matchers E2E `page`/`size` inventory
- [ ] `audit-ui.mjs` sin P0/P1 nuevos
- [ ] Gate suite portal / build full

---

## Stop/go FE-PLATFORM

| Gate | Resultado |
| --- | --- |
| Specs AssetLoans + WriteOffs | **GO** (8) |
| Sin mezclar gramática en comodatos/historial/vida útil | Cumplido (pager) |
| Lista activos no inventa offset | Cumplido (sigue «Cargar más») |
| TasksTable / filtro-cliente / web | No tocados |
| Sin commit | Cumplido |

**Veredicto:** residual inventario **GO parcial** — comodatos + historial de bajas listos para gate SR-QA; lista de activos queda explícita hasta offset servidor.
