# INFORME — Cierre HOLD H-FE-ENVELOPE-OLA7

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Cerrado  
**Origen:** [INFORME-ADR065-OLA7-SR-QA-GATE-v1.0.md](./INFORME-ADR065-OLA7-SR-QA-GATE-v1.0.md) · HOLD **H-FE-ENVELOPE-OLA7**  
**Padre FE:** [INFORME-ADR065-OLA7-FE-v1.0.md](./INFORME-ADR065-OLA7-FE-v1.0.md)  
**Commit:** No (orden orquestador)

---

## Veredicto

| Campo | Valor |
| --- | --- |
| **HOLD** | **H-FE-ENVELOPE-OLA7** |
| **Estado** | **CERRADO** |
| Severidad previa | P1 · HOLD release BE Ola 7 + portal |
| Paridad FE ↔ BE `{ data, meta }` | **Sí** en los 4 consumidores citados |

Release conjunto Ola 7 BE + portal ya no queda bloqueado por array plano en estos listados.

---

## Checklist de consumidores (gate → cierre)

| Consumidor | Antes (gate) | Después | Evidencia |
| --- | --- | --- | --- |
| `wfmApi.events.list` | Tipado/`Array.isArray` sobre respuesta | `ListResponse` + `page`/`limit`; `collectListPages` en agenda; `.data.find` en peek expediente | `SchedulingClient`, `PendingVisitRequestsView` + specs |
| `wfmApi.workOrders.list` | Array plano | `ListResponse` + `collectListPages` → `.data` | `SchedulingClient` + spec (assert `page`/`limit`) |
| `purchasingApi.listOrders` | Array plano | `InventoryPaginatedList` + `ordersResponse.data` (`page:1, limit:100`) | `InventoryClient` + mock envelope en spec |
| `CalendarSettingsClient` / `organizationApi.list` | `setSites(response)` como array | `list({ page:1, limit:100 })` → `sitesResult.value.data` | Spec: call args + sedes renderizadas |

No queda `Array.isArray` sobre el envelope crudo de estos endpoints. `Array.isArray` residual en scheduling aplica solo a `eligibleAssignees` / técnicos (aún array plano BE).

---

## api-client (contrato)

- `events.list` / `workOrders.list` → `ListWfmScheduleEventsResponse` / `ListWfmWorkOrdersResponse` (`ListResponse`) + query `page`/`limit` + `returnFullResponse`.
- `purchasingApi.listOrders` → `InventoryPaginatedList<PurchaseOrderRecord>` + `page`/`limit`.
- `organizationApi.list` → `ListResponse<OrganizationSiteSummary>` + `page`/`limit`.
- Helper `collectListPages` en `apps/portal/src/lib/list-meta.ts` (calendario / peeks; no directorio con pager).

---

## Specs (sesión de cierre)

| Suite | Resultado |
| --- | --- |
| `list-meta.spec` (incl. `collectListPages`) | PASS |
| `CalendarSettingsClient.spec` | PASS |
| `SchedulingClient.spec` | PASS |
| `PendingVisitRequestsView.spec` | PASS |

Regresiones añadidas en cierre: assert `organizationApi.list({ page:1, limit:100 })` + sedes desde `.data`; assert `events.list` / `workOrders.list` con `page`/`limit` y título desde envelope; tests unitarios de `collectListPages`.

---

## Fuera de alcance (sin cambio)

- Directorio global de purchase orders con `PortalTablePager` (sigue peek por solicitud).
- CA-PAG UI en WFM events/WO (calendario / feed, no tabla directorio).
- CRM opportunities / quotes / potentials sin UI portal.
- TasksTable (FEED E-2).

---

## Señal a orquestador / SR-QA

Marcar **H-FE-ENVELOPE-OLA7** como **cerrado** en la matriz de deuda del gate Ola 7. Condición 1 del addendum «subir a GO» del gate queda satisfecha en FE; el veredicto global del programa sigue sujeto a la demás deuda P1/P2 (D-AGG, D-P95, evidencia E2E, etc.).
