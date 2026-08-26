# INFORME-MOD06-PLANES-COLUMNAS-TABLA-v1.0

**Versión:** 1.1
**Fecha:** 2026-08-19
**Clasificación:** Técnico — Confidencial
**Identificador:** AI-FE-PLATFORM (ejecución) · consulta DS-OWNER (menú local, no pie)
**Módulo:** MOD06 — Comercial
**Tipo:** UX de tabla operativa (columnas visibles)

---

## 0. Changelog

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.1 | 2026-08-19 | «Columnas» sale del `<th>` extra: misma fila que el chip «Sin precio vigente», a la derecha, fuera de la grilla. |
| 1.0 | 2026-08-19 | Menú local de columnas visibles con persistencia `localStorage`. |

---

## 1. Contexto

Tras la paginación numerada de planes, el operador pedía **sumar o quitar columnas** según los datos de la tabla. El portal no tenía column picker; ADR-065 reserva el pie a conteo + tamaño + nav.

## 2. Alcance aplicado

| Superficie | Cambio |
| --- | --- |
| `plan-catalog-columns.ts` | Resolución pura: core on, extras auto (`technology`, `description`), fechas solo con override. Persistencia `localStorage` `iwana.portal.commercial.plan-table-columns`. |
| `PlanCatalogTable.tsx` | Menú **Columnas** en la fila del chip «Sin precio vigente» (derecha, fuera de la tarjeta de chips y fuera del shell). Plan y Acciones bloqueadas. Al mostrar Tecnología se oculta la sublínea bajo el nombre. Sin `<th>` extra ni celdas `aria-hidden`. |
| `PortalTablePager` | **Sin cambios.** |

Fuera de alcance: productos, servicios, primitive global, URL, API, orden por columna.

## 3. Decisiones

- El control **no** va al pie (ADR-065 §5 / contrato DS §3).
- v1.1: tampoco ocupa una columna de la grilla. Vive como chrome de vista, hermano del chip de filtro, no dentro de `portalFilterChipGroupClassName`.
- No se extrae primitive de portal-ui hasta un segundo consumidor.
- Override de usuario gana al auto. Creado/Actualizado no se auto-muestran (el API siempre manda fechas).
- Sin ADR (no cambia stack ni boundary).

## 4. Evidencia de gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Jest `PlanCatalogTable` + `PlanCatalogPanel` (v1.1) | **GO** | 24 tests PASS, incluye «coloca Columnas en la fila del chip, fuera de la grilla» |
| Jest `plan-catalog-columns` + tabla + panel (v1.0) | **GO** | 30 tests PASS (corrida original) |
| Typecheck portal (v1.0) | **GO** | `tsc --noEmit` sin errores |

## 5. Deuda registrada

Ninguna nueva de esta fase. El menú es local a planes; productos/servicios siguen con columnas fijas.
