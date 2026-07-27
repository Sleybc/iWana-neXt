# PROMPT — Paginación resto inventario portal (Ola 3)

**Emisor:** AI-EM-ARCH  
**Destinatarios:** AI-SR-FULL · AI-FE-PLATFORM (por gap)  
**Fecha:** 2026-07-24  
**Precondición:** ADR-064 Aprobado; Ola 1 (primitive) preferible  
**Entrada:** inventario en `docs/plans/2026-07-24-portal-table-pagination-universal.md` §Ola 3

## Alcance

Remediar superficies **SIN_COTA** / **DUDOSO** fuera de Comercial Ola 2, en orden P0→P2 del plan.

Por cada superficie:

1. Gap API → SR-FULL: `limit` default 20 + cursor/page + `total`; OpenAPI; tests.
2. FE → FE-PLATFORM: anatomía canónica; `PortalResultsStrip`; `PortalTablePagination` si cursor/load-more; reset al filtrar.
3. Homogeneizar YA_PAGINA con prev/next a strip + contrato documentado (no forzar cursor si page ya es PRD — documentar excepción de UI numerada solo si PRD lo exige; si no, preferir load-more).
4. PREVIEW: declarar excepción en informe del módulo (≤10).

## Restricciones

- No tokens nuevos. Español. Boundaries modulith. Sin PII en logs/tests.

## DoD

- Ninguna superficie P0 SIN_COTA sin cota en API+FE.
- Informe vivo actualizado con checklist por archivo.
