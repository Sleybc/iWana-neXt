# INFORME-MOD06-PLANES-PAGER-PAGE-SIZE-v1.0

**Versión:** 1.1
**Fecha:** 2026-08-19
**Clasificación:** Técnico — Confidencial
**Identificador:** AI-EM-ARCH (Architect + Orchestrator) · ejecución FE-PLATFORM / SR-FULL / SR-QA / DS-OWNER
**Módulo:** MOD06 — Comercial
**Tipo:** Adopción ADR-065 (tabla de planes)

---

## 0. Changelog

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.1 | 2026-08-19 | `PortalPageSizeSelect`: etiqueta «Filas por página» hermana del `Select` (`flex items-center`), no apilada como label de formulario. Aplica a todos los pies numerados del portal. |
| 1.0 | 2026-08-19 | Adopción pager + selector local 5–100 en tabla de planes. |

---

## 1. Contexto

La tabla de planes en `/dashboard/commercial` listaba con cursor in-memory y pie «Cargar más» (`COMMERCIAL_LIST_PAGE_SIZE = 20`). El selector de tamaño y el salto a página N exigen ordinal. El backend híbrido (`page` + `limit`, `randomAccess: true`) ya existía en `CatalogService.findAll`.

Plan canónico: [docs/plans/2026-08-19-comercial-planes-page-size-pager.md](../plans/2026-08-19-comercial-planes-page-size-pager.md). Spec DS enmendada a **v1.2**.

## 2. Alcance aplicado

| Superficie | Cambio |
| --- | --- |
| API catálogo | Conserva modo page. Revertido el override `limit=500`. DTO compartido `@Max(100)`. |
| `PlanCatalogPanel` | Writer único `useTableQueryState`. Siempre envía `page`+`limit`. Sin cursor ni «Cargar más». |
| `PlanCatalogTable` | `PortalTablePager` + selector local `[5,10,20,30,50,100]`. Dual-slot sm/lg. Sin ResultsStrip de conteo. |
| Navegación comercial | Canonicalizar `tab=plans` no borra `page`/`size`. Al salir de planes se limpian. |
| DS | Token global `[10,20,50]` intacto. Sin `{value:'all'}`. |

Fuera de alcance: productos, servicios, bundles, impuestos, orden por columna (`sortableFields` sigue `[]`).

## 3. Decisiones de gobernanza

- **No** «Todos» = 500. El usuario no lo pidió; ADR-064 §8 y ADR-065 §10 siguen vigentes. «Todos» mentiría si `total > 500`.
- **No** mutar `PORTAL_PAGE_SIZE_OPTIONS`. El set 5–100 es override local de esta tabla.
- URL canónica: `size`, no `pageSize`. El aterrizaje **no** conserva `tab=plans`.
- Cero features API nuevas: el frontend envía `page`+`limit` al contrato ya existente.
- Sin ADR nuevo (no cambia stack ni boundary).

**[DESEMPATE] Selector 5/30/100 vs `[10,20,50]`.** AI-PROD-UX objetó 5/30/100 (ADR-065 §7 rechazó TailAdmin 5/8/10; 100 hostil en `sm`). DS-OWNER / FE-PLATFORM / pedido de esta tabla: excepción local vía `options`. Prevalece el pedido de la tabla. El copy default del portal no cambia.

**[DESEMPATE] Módulo a medias (ADR-065 §16).** Planes en pager y productos/servicios en «Cargar más» = dos gramáticas a un clic. Alcance de esta fase: solo planes. Deuda aceptada con fecha: siguiente tramo MOD06 = productos + servicios.

## 4. Evidencia de gates

Ver corrida en la sesión de implementación:

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Jest portal (panel, tabla, CommercialClient, portal-ui, catalog-filter-params) | **GO** | Suites verdes, incluye primer `getPlans` `{ page: 1, limit: 20 }` sin cursor |
| Jest portal v1.1 (`PortalPageSizeSelect` inline + consumidores pager) | **GO** | `portal-ui.spec` (7) + `UsersTable` / `AssuranceTicketsTable` / `PlanCatalogPanel` (label accesible y cambio de tamaño) |
| Jest API catálogo | **GO** | `catalog.service.spec` + `catalog.controller.http.spec` — 48 tests PASS (`limit=999` HTTP 400) |
| Typecheck portal + api | **GO** | `tsc --noEmit` sin errores |
| E2E `portal-commercial-plans-pagination` | **GO** | 1/1 PASS (HTTP mockeado; no aserta `tab=plans` persistente; productos siguen «Cargar más») |

## 5. Deuda registrada

| ID | Ítem | Severidad | Fecha |
| --- | --- | --- | --- |
| MOD06-PAGER-§16 | Productos y servicios del catálogo siguen en cursor + «Cargar más» | Media | 2026-08-19 |
| MOD06-PAGER-UX-SET | Objeción PROD-UX al set local 5/30/100 (no bloquea) | Baja | 2026-08-19 |

Sin deuda crítica/alta nueva. Sin migración de índices. Show All 500 no se reabre sin CTO; si se reabre, H2 de SEC-ENG (Max 500 solo en `CatalogQueryDto`) es obligatorio.

## 6. Seguimiento

- Siguiente tramo MOD06: migrar productos y servicios al mismo pager, limpiando la deuda §16.
- Bundles / tax / compat siguen fuera hasta su propia fase.
