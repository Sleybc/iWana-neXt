# INFORME-PORTAL-PAGINACION-TABLAS-UNIVERSAL-v1.0

**Módulo:** Portal — norma transversal DataTable  
**Fase:** Remediación deuda ADR-064 **cerrada**  
**Modo:** AI-EM-ARCH Orchestrator + protocolo multiagente  
**Fecha:** 2026-07-24  
**ADR:** [ADR-064](../adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md)  
**Plan:** [2026-07-24-portal-table-pagination-universal.md](../plans/2026-07-24-portal-table-pagination-universal.md)

---

## Veredicto

**GO.** Paginación P0 + deuda P1 remediada. Excepciones ADR documentadas (pickers, page+limit, detalle).

## Remediación deuda

| Ítem | Estado |
| --- | --- |
| Filtros comercial + TaxCatalog + categorías (API) | **Cerrada** — [SR-FULL](93b4db07-d6c7-4eb1-b85e-7a723bf5ce31) |
| FE adoptar filtros/TaxCatalog/categorías | **Cerrada** — [FE-PLATFORM](ca19a34f-81da-4e45-bd9c-9f5f0590f17b) |
| Matriz balances + homogeneizar + pickers | **Cerrada** — [FE-PLATFORM](9b8a54c4-d009-44e1-be3a-1ea59883486e) |
| Sort comercial servidor `?sort=` | **Cerrada** — [FE-PLATFORM](127c9f64-31d8-48fd-99cf-360e00fe21fa) |

## Excepciones / residual menor (no bloquean)

- Pickers: `PICKER_SOFT_CAP=100` (ADR selectores)
- Tenants web: API sin `total` → strip «N empresas cargadas»
- Tasks/Assurance: page+limit con UI load-more — OK
- `StockItemDetailDrawer` prev/next — detalle, no listado operativo

## Norma vigente

Cursor (o page++) + «Cargar más», `limit` 20; conteo en `PortalResultsStrip`; footer solo si `hasMore`; sin «Fin de resultados». Filtros y sort de catálogo en servidor.

> **Superada parcialmente el mismo día.** Por instrucción del CTO (2026-07-24), [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) hace de la paginación numerada el default de las tablas operativas y supersede ADR-064 §§2/3/5/9. La norma descrita arriba **sigue vigente** para los recursos que el contrato declara con `capabilities.randomAccess: false` (feeds cronológicos y colas de alto volumen). Programa sucesor: [INFORME-PORTAL-PAGINACION-NUMERADA-v1.0](INFORME-PORTAL-PAGINACION-NUMERADA-v1.0.md).
