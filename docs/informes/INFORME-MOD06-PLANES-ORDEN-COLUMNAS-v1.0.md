# INFORME-MOD06-PLANES-ORDEN-COLUMNAS-v1.0

**Versión:** 1.2
**Fecha:** 2026-08-19
**Clasificación:** Técnico — Confidencial
**Identificador:** AI-FE-PLATFORM + AI-SR-FULL (ejecución)
**Módulo:** MOD06 — Comercial
**Tipo:** UX de tabla operativa (orden por columna)

---

## 1. Contexto

Tras columnas visibles, el operador pedía **ordenar cada columna** al hacer clic (ascendente / descendente). El pager de planes ya era modo `page`; el catálogo publicaba `sortableFields: []` y el encabezado no era clicable.

## 2. Alcance aplicado

| Superficie | Cambio |
| --- | --- |
| `CatalogQueryDto` / `CatalogService.findAll` | `sortBy` + `sortDir` en modo page y `type=PLAN`. Publica `PLAN_CATALOG_SORTABLE_FIELDS`. Campo inválido → orden default `name ASC`. |
| `commercialApi.getPlans` | Propaga `sortBy`/`sortDir`. |
| `PlanCatalogTable` | `PortalDataTableSortableHead` si el campo está en `sortableFields`. Ciclo del primitive: sin orden → asc → desc → sin orden. Select **Ordenar por** bajo `sm`. Acciones y menú Columnas no ordenan. |
| `useTableQueryState` | Estado en URL (`sortBy`, `sortDir`); `replace` + reset a página 1. |
| `CommercialClient` | Al salir de planes limpia `sortBy`/`sortDir` junto a `page`/`size`. |

Fuera de alcance: productos, servicios, modo cursor, índices nuevos.

## 3. Decisiones

- El orden es **de servidor** sobre el conjunto filtrado, no de la página visible.
- Nombres lógicos ADR-065: `name`, `downloadSpeedMbps`, `basePrice`, `installationFee`, `isActive`, `technology`, `description`, `createdAt`, `updatedAt`.
- Precio e instalación: subconsulta a `catalog_price_history` vigente RESIDENTIAL (`NULLS LAST`). Velocidad/tecnología: subconsulta a `plan_details` (sin JOIN).
- **v1.1:** no usar `leftJoin` + `skip`/`take`/`getMany()` para ordenar. TypeORM envuelve en `SELECT DISTINCT` y pide `distinctAlias.pld_technology`, columna ausente → 500. El clic del portal sí enviaba `sortBy`; las filas no cambiaban porque el catch conserva datos stale.
- **v1.2 UX:** `sort` en `useTableQueryState` se memoriza (el objeto nuevo en cada render re-disparaba `loadPlans` y parpadeaba). Encabezados de planes en `text-sm` sentence case, alineados a la izquierda con las celdas; el botón ordenable es `w-full` sin `align=right`. Planes deja de cargarse con `next/dynamic` (el fallback skeleton parpadeaba al cambiar la URL).
- Sin ADR nuevo (el contrato ya está en ADR-065 y en el DS de paginación).
- Índices dedicados para precio/velocidad/fechas quedan como deuda; el volumen típico de planes no bloquea el ORDER BY.

## 4. Evidencia de gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Jest API `catalog.service` | **GO** | 40 tests PASS (subconsulta `technology` / `downloadSpeedMbps`, sin `leftJoin`) |
| Jest API `catalog.controller.http` | **GO** | propaga `sortBy`/`sortDir` |
| Jest portal helper + tabla + panel + client | **GO** | 34 tests PASS |
| Typecheck api + portal | **GO** | `tsc --noEmit` sin errores |
| Auditoría UI mecánica | **GO** | `audit-ui.mjs` sin hallazgos en tabla/panel |

## 5. Deuda registrada

- Productos y servicios siguen con `sort` preset + cursor; no heredan orden por columna.
- Publicar `createdAt`/`updatedAt`/`basePrice` sin índice compuesto tenant+columna: revisar p95 si el catálogo crece.
- Sort de planes combinado con filtros que sí joinean (`category`/`model`/`charge`) no es el camino del listado PLAN; si se mezclara, TypeORM podría reintroducir DISTINCT sobre el ORDER BY subquery.

## 6. Incidente v1.1 (protocolo)

| Rol | Resultado |
| --- | --- |
| AI-SR-FULL | Causa raíz SQL DISTINCT; fix subconsulta `plan_details`. |
| AI-FE-PLATFORM | FE OK: clic → URL → `getPlans`. Sin cambios de portal. |
