# PROMPT — Paginación catálogo comercial (Ola 2)

**Emisor:** AI-EM-ARCH  
**Destinatarios:** AI-SR-FULL (API) → AI-FE-PLATFORM (UI)  
**Fecha:** 2026-07-24  
**Precondición:** ADR-064 aprobado; Ola 1 (primitive) preferible pero no bloqueante si FE mockea hasMore

## SR-FULL

Extender listados de catálogo comercial usados por portal (`/commercial/catalog?type=PLAN` y equivalentes productos/servicios/bundles/promos/reglas/impuestos según ola) con:

- `limit` (default 20, max documentado)
- cursor / `nextCursor` + **`total`** en meta (o page documentada — homogeneizar a cursor si es barato)

OpenAPI actualizado. Tests de servicio. Si omiten limit → default acotado (no unbounded).

## FE-PLATFORM

- Paneles SIN_COTA: primera página + `PortalResultsStrip` (`{total} planes` etc.) + `PortalTablePagination` solo si `hasMore`; reset cursor al filtrar.
- Anatomía PortalPanel → filtros → strip → shell.

## DoD

- Con 200 planes simulados, la primera respuesta no trae 200 al FE.
- Strip refleja `total`; «Cargar más» concatena; sin pie ornamental.
- Tests API + FE scoped.
