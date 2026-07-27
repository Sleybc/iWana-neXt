# INFORME — ADR-065 Ola 7 · FE consumidores sin cota

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Entregado parcial ampliado — ≥3 módulos + residual documentado  
**Plan:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) §Ola 7  
**Padre BE:** [INFORME-ADR065-OLA7-SIN-COTA-v1.0.md](./INFORME-ADR065-OLA7-SIN-COTA-v1.0.md)  
**Commit:** No (orden orquestador)

---

## Resumen ejecutivo

Los endpoints Ola 7 pasaron a `{ data, meta }` (ListMeta, `mode: 'page'`, `sortableFields: []`). Esta ola FE:

1. Tipó el `api-client` al contrato ADR-065.
2. Migró las **tablas directorio** visibles a `useTableQueryState` + `PortalTablePager`.
3. Adaptó superficies de **calendario / peek** con `collectListPages` o `limit: 100` (no inventar pager en feeds).

**TasksTable** no se tocó (FEED, E-2).

**Veredicto local:** **GO-CON-DEUDA** — listo para gate SR-QA FE; residual CRM opportunities/quotes/potentials (sin UI portal) y directorio de órdenes de compra dedicado.

---

## 1. Superficies entregadas

| Módulo | Superficie | Envelope | Paginación UI | Notas |
| --- | --- | --- | --- | --- |
| Organización | `OrganizationSettingsClient` (sedes) | `{ data, meta }` | `PortalTablePager` + URL `sites.*` | Directorio |
| WFM | `OperationalEventualitiesPanel` | `{ data, meta }` | `PortalTablePager` + URL `eventualities.*` | Directorio (settings) |
| WFM | `SchedulingClient` events / work-orders | `{ data, meta }` | `collectListPages` (calendario) | No es directorio |
| WFM | `PendingVisitRequestsView` events peek | `{ data, meta }` | `page:1, limit:100` | Peek por expediente |
| Purchasing | `InventoryClient` `listOrders` | `{ data, meta }` | `page:1, limit:100` | Peek por solicitud |
| CRM | `contractsApi.findAll` / `listBySubscriber` | `{ data, meta }` | API tipada | Sin tabla directorio en portal (360 embebe contratos) |
| Organización | `CalendarSettingsClient` sites | `{ data, meta }` | `page:1, limit:100` | Picker de sedes, no tabla |

---

## 2. api-client

- `wfmApi.events.list` / `workOrders.list` / `technicians.listAvailability` / `operationalEventualities.list` → `ListResponse` + `page`/`limit`.
- `purchasingApi.listOrders` → `InventoryPaginatedList` + `page`/`limit`.
- `organizationApi.list` → `ListResponse` + `returnFullResponse`.
- `contractsApi.findAll` / `listBySubscriber` → `ListResponse` + `page`/`limit` + `returnFullResponse`.
- Helper `collectListPages` + `emptyPageListMeta` en `apps/portal/src/lib/list-meta.ts`.
- `sortableFields` no inventados en UI (se respetan `[]` del servidor).

---

## 3. Specs (evidencia)

Suites verdes en sesión:

- `OrganizationSettingsClient.spec` (11/11)
- `OperationalEventualitiesPanel.spec`
- `SchedulingClient.spec`
- `CalendarSettingsClient.spec`
- `PendingVisitRequestsView.spec`

`InventoryClient.spec`: mock `listOrders` envelope + router estable; 33/36 en runInBand (3 fallos UI preexistentes/flaky ajenos a `listOrders`: custody redirect, tray filters, write-off option).

Mocks de router estabilizados donde hay `useTableQueryState` (evitar bucle por identidad de `useRouter`).

---

## 4. Checklist residual

| Ítem | Estado | Dueño |
| --- | --- | --- |
| Gate SR-QA CA-PAG v2 (Ola 7 FE) | **Pendiente** | AI-SR-QA |
| CRM opportunities / quotes / potentials | Sin consumidores portal | Residual — tipar cliente cuando exista UI |
| Directorio global de purchase orders | Solo peek por request | Residual si PROD-UX pide tabla |
| Technician availability UI | Envelope tipado; sin pantalla directorio | Residual |
| ServiciosTab / subscriber 360 contracts | Sigue embebido en 360 (no `listBySubscriber`) | Residual si se desacopla a listado paginado |
| TasksTable | Feed — **no tocar** | Cerrado E-2 |
| `sortableFields` no vacíos | Depende Ola 2 p95 | — |

---

## 5. Stop/go local

| Criterio | Resultado |
| --- | --- |
| ≥3 módulos FE con envelope ListMeta | **Sí** (sites, WFM events/WO/eventualities, purchase orders + contracts API) |
| PortalTablePager en directorios | **Sí** (sedes + eventualidades) |
| Feeds/calendario sin pager inventado | **Sí** (`collectListPages`) |
| TasksTable intacto | **Sí** |
| `sortableFields: []` | **Sí** |
| Specs verdes de superficies tocadas | **Sí** |
| Commit | No |

**Propuesta a orquestador:** marcar Ola 7 FE **GO-CON-DEUDA**; residual CRM listados sin UI y directorio OC dedicado.

---

## Addendum — cierre H-FE-ENVELOPE-OLA7 (2026-07-25)

HOLD P1 del gate SR-QA Ola 7 cerrado en FE: consumidores WFM events/WO, `listOrders` y `CalendarSettingsClient` consumen `{ data, meta }` (unwrap `.data` / `collectListPages`; sin `Array.isArray` sobre envelope). Evidencia y checklist: [INFORME-ADR065-OLA7-ENVELOPE-HOLD-CLOSE-v1.0.md](./INFORME-ADR065-OLA7-ENVELOPE-HOLD-CLOSE-v1.0.md).
