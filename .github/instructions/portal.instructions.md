---
description: "Use when working on apps/portal tenant-aware screens, auth flows, dashboard, portal navigation, or tenant self-service integrations. Covers tenant-safe frontend rules specific to the enterprise portal."
applyTo: "apps/portal/**"
---

# Portal Tenant-Aware Instructions

Referencia maestra: `AGENTS.md`.

- `apps/portal` es la consola empresarial tenant-aware; no mezclarla con la consola de plataforma de `apps/web`.
- Consumir contratos self-service del tenant autenticado; no usar endpoints globales de plataforma como atajo.
- Mantener la separacion entre sesion autenticada completa y tokens temporales de MFA o flujos intermedios.
- No poblar estado global de usuario con tokens de alcance limitado.
- La navegacion visible del portal no debe apuntar a rutas inexistentes; usar placeholders controlados o retirar accesos.
- Los dashboards y pantallas del portal deben usar copy empresarial, no copy de suscriptor residencial ni copy de plataforma.
- Las pantallas del portal deben sentirse como herramientas operativas iWana: superficies limpias, jerarquia evidente, bordes y sombras suaves, acciones claras y sin decoracion que compita con la tarea.
- Reutilizar `PortalPanel`, `PortalSectionHeader`, `PortalActionToolbar`, `PortalAlert`, `PortalEmptyState` y `PortalResultsStrip` antes de crear variantes locales. Si un patron se repite en dos pantallas, promoverlo a primitive o utility compartida.
- **Tablas operativas (ADR-065 Aprobado 2026-07-24, supersede ADR-064 §§2/3/5/9):** anatomia `PortalPanel` → filtros → `PortalResultsStrip` → `portalDataTableShellClassName` solo en la grilla. Paginacion servidor obligatoria, `limit` 20; no materializar listados unbounded. **El pie lo decide el servidor via `meta.capabilities.randomAccess`, no la pantalla:** `true` → `PortalTablePager` (Anterior · 1…N · Siguiente + `PortalPageSizeSelect` + conteo «Mostrando 21–40 de 128 usuarios» en el pie; nav omitida si `totalPages <= 1`); `false` → `PortalTablePagination` («Cargar mas» solo si `hasMore`, conteo en `PortalResultsStrip`). **Una tabla monta un pie o el otro, nunca los dos (P1).** Un solo conteo visible por tabla; sin ornamento de fin. `page`/`pageSize`/`sort`/filtros en URL (`push` al cambiar pagina, `replace` para filtros). Numeros ghost sin borde, targets 44px, lima prohibido en el pager. **Orden por columna:** las columnas ordenables las declara `meta.capabilities.sortableFields` — nunca una lista local; ordenable → `PortalDataTableSortableHead` con `aria-sort` y ciclo `asc → desc → sin orden`; no ordenable → `PortalDataTableHead` sin control ni `aria-sort`; un solo icono y estado activo tambien por peso (WCAG 1.4.1); bajo `sm` el orden sale del encabezado a la barra de filtros; `sortBy`/`sortDir` en URL y vuelven a pagina 1. Excepciones (preview ≤10, matrices estaticas, pickers) documentadas en el modulo. Ver `docs/adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md`, `docs/specs/2026-07-24-paginacion-numerada-ds-contrato.md` y receta DataTable en `iwana-identity-ui-review`.
- Si una pantalla depende de datos aun no disponibles, renderizar estado vacio o `no disponible`; no inventar metricas.
- Respetar gating por rol y tenancy en componentes, loaders y llamadas del `api-client`.
- Mantener accesibilidad WCAG AA en formularios, alertas, loaders y estados de error del portal.
