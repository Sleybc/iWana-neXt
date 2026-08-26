# Plan — Paginación numerada de la tabla de planes (MOD06)

**Fecha:** 2026-08-19
**Estado:** Ejecutado (2026-08-19)
**Orquestador:** AI-EM-ARCH (Architect + Orchestrator) · ejecución AI-FE-PLATFORM + AI-SR-FULL + AI-SR-QA + AI-DS-OWNER
**Módulo:** MOD06 — Comercial
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) · cota [ADR-064](../adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md) §8
**Specs:** [contrato DS v1.2](../specs/2026-07-24-paginacion-numerada-ds-contrato.md) · [spec UX](../specs/2026-07-24-paginacion-numerada-ux.md)

---

## Objetivo

Migrar la tabla de planes de `/dashboard/commercial` (aterrizaje, `tab=plans` no persiste) de cursor + «Cargar más» a pager numerado ADR-065, con selector **local** 5 / 10 / 20 / 30 / 50 / 100. Default 20. Sin «Todos». Tope API 100.

Fuera de alcance: productos, servicios, bundles, impuestos. Siguen cursor + «Cargar más».

## Decisiones

| Punto | Decisión |
| --- | --- |
| Page + limit | Aprobado. Catálogo es directorio (`ORDER BY name, id`); `randomAccess: true` ya existe. |
| Selector 5–100 | Override local vía `options`. Token global intacto `[10, 20, 50]`. |
| «Todos» = 500 | Rechazado. ADR-064 §8 y ADR-065 §10. |
| Subir `MAX_LIMIT` a 500 | Rechazado y revertido. El DTO es compartido; `findAll` cubre PLAN/PRODUCT/SERVICE. |
| URL | `page` y `size` (no `pageSize`). No persistir `tab=plans`. |
| Writer URL | Solo `useTableQueryState`. El panel siempre envía `page` (también `1`). |
| `{value:'all'}` | Revertido. No forma parte del contrato DS. |
| ADR nuevo | No. No hay cambio de stack ni boundary. |

## Contrato de esta fase

- Query API: `page` (1-based) + `limit` ∈ {5,10,20,30,50,100}; default 20; excluyente con `cursor`.
- HTTP `limit=999` → 400 (`@Max(100)`). El servicio clampa a 100 si se llama directo.
- UI: `PortalTablePager` + `PortalPageSizeSelect` con opciones locales. Nunca ambos pies.
- Al salir de planes, limpiar `page` y `size` en la navegación de módulo.

## Deuda aceptada

ADR-065 §16: el módulo comercial queda con dos gramáticas (planes en pager, productos/servicios en «Cargar más»). Siguiente tramo MOD06 = productos + servicios al mismo pager. Bundles/tax siguen fuera.

Objeción AI-PROD-UX al set 5/30/100 (prefiere solo `[10,20,50]`) queda registrada: prevalece el pedido de esta tabla como excepción local.
