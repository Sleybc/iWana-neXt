# Plan — Paginación universal de tablas operativas (portal)

**Fecha:** 2026-07-24  
**Estado:** Aprobado · Ejecución P0 + remediación deuda **cerradas**  
**Orquestador:** AI-EM-ARCH  
**ADR:** [ADR-064](../adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md) (**Aprobado** CTO 2026-07-24)  
**Consultas:** PROD-UX CA-PAG · DS-OWNER portal-ui action-only (desempate: sin `endLabel`) · inventario Explore

---

## Objetivo

Una sola norma: tablas operativas del portal paginan en servidor (cursor + «Cargar más», `limit` default 20); conteo solo en `PortalResultsStrip`; footer solo si `hasMore` con acción única. CA UX: **CA-PAG-01…10** (spec PROD-UX).

## Olas

### Ola 0 — Gobierno (esta sesión)

- [x] ADR-064 propuesto (+ enmiendas + desempate DS)
- [x] Receta / Firma §2.3 / `portal.instructions.md` / informe / prompts 1–4
- [x] **Aprobación CTO** (2026-07-24)

### Ola 1 — Primitive + Users

- [x] Cerrada por [FE-PLATFORM](364df1c9-cd5f-4f20-ace6-e2da27561547) — `PortalTablePagination` + Users sin ornamento; 20/20 tests.

### Ola 2 — Comercial catálogo (P0)

- [x] **2a API** — [SR-FULL](3a64c66f-e606-4e2f-8872-3a603a1038b2): cursor + `limit` 20/max 100 + `meta.{nextCursor,total}` en catalog/bundles/promos (+ P1 compat/tax). 105 tests.
- [x] **2b FE** — envelope + filtros servidor + TaxCatalog/categorías + sort `?sort=` ([FE-PLATFORM](5982ad60-90bf-49b3-af1e-21eca0f8b4d6), [ca19a34f](ca19a34f-81da-4e45-bd9c-9f5f0590f17b), [127c9f64](127c9f64-31d8-48fd-99cf-360e00fe21fa)).

### Ola 3 — Resto inventario

Fuente: inventario Explore (sesión). **Trampa soft-cap:** API con `page:1, limit:N` sin UI de siguiente página = truncado silencioso (P1).

| Prioridad | Superficie | Gap |
| --- | --- | --- |
| P0 | Inventory: productos/catálogo, stock, matriz, activos (+ locations/issues/counts/requests API) | **3a+3b + deuda cerradas** — [SR-FULL](c4d84907-f9a5-4b0c-9cbc-b9ec776cf7e3) · [FE-PLATFORM](ac68ed81-433f-4e75-8f9b-08cf89aca6cc) · matriz [9b8a54c4](9b8a54c4-d009-44e1-be3a-1ea59883486e) |
| P0 | Operations `tasksApi.list` + PurchaseWorkspace | **Cerrado** — [FE-PLATFORM](4cbfa1ca-c7c3-4ae6-a50b-1ac0a989c2ae) |
| P1 | Homogeneizar subscribers/kardex/useful-life/visits/web tenants | **Cerrado** — [FE-PLATFORM](9b8a54c4-d009-44e1-be3a-1ea59883486e) |
| P1 | Categorías inventario; filtros/sort comercial; TaxCatalog | **Cerrado** — [SR-FULL](93b4db07-d6c7-4eb1-b85e-7a723bf5ce31) · FE adopción/sort |
| P1 | Assurance tickets | **Cerrado** — [FE-PLATFORM](26857cbf-24f8-4475-a929-139c1f9acb5f) + CA-PAG-08 |
| P2 | Settings / scheduling events / coverage | Excepción o paginar (fuera de esta remediación) |
| — | PREVIEW ≤10 / timelines / pickers soft-cap | Excepción ADR |

Prompt: `docs/prompts/PROMPT-TRANSVERSAL-PAGINACION-TABLAS-OLA3-INVENTARIO-v1.0.md`

### Ola 4 — Gate QA

- [x] **Cerrada** — [SR-QA](27d526a2-10e1-459f-87a4-140a61375097): **GO-CON-DEUDA** (sin P0). P1: Assurance CA-PAG-08 empty. Specs 60 OK.

Prompt: `docs/prompts/PROMPT-TRANSVERSAL-PAGINACION-TABLAS-OLA4-QA-v1.0.md`

## DoD global

- ADR-064 Aprobado.
- Comercial P0 no materializa catálogo completo.
- Users sin pie ornamental.
- Soft-caps sin UI de avance cerrados o documentados como deuda P1.
- Informe vivo con evidencia por ola.
