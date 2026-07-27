# PROMPT — Paginación numerada · Fase 6: superficies keyset

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH
**Archivo destino:** `docs/prompts/PROMPT-ADR065-OLA6-KEYSET-v1.0.md`
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) — Ola 6

**Emisor:** AI-EM-ARCH
**Destinatario:** AI-SR-FULL (parte A) → AI-FE-PLATFORM (parte B)
**Fecha:** 2026-07-24
**Precondición:** Fase 5 cerrada. Es la fase más cara y la que más riesgo de datos concentra: no se adelanta.
**Skills:** `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `nextjs-app-router-patterns`, `iwana-identity-ui-review`, `testing-patterns`

---

## Parte A — Backend · AI-SR-FULL

**1 · `page` aditivo sobre los 18 endpoints keyset**: commercial (catálogo, bundles, promociones, compatibilidad, reglas y aplicaciones de impuestos), taxation (definiciones), inventory (items, categorías, ubicaciones, activos, balances, salidas, conteos, solicitudes de compra), users y audit ×2.

`cursor` se conserva; `page` y `cursor` siguen siendo excluyentes. Los recursos que la Fase 2 marcó `randomAccess: false` **no reciben `page`**: mantienen solo cursor y devuelven `sortableFields: []`.

**1-bis · Orden por columna en los recursos que lo reciban.** Publica `sortableFields` según la tabla cerrada en la Fase 2, con desempate por `id` en cada orden y un test por columna con valores empatados. En catálogo comercial, esto sustituye los presets `CATALOG_SORT_VALUES` por `sortBy`/`sortDir`; los presets quedan deprecados, no eliminados, hasta el fin del dual-emit.

**2 · Subir al servidor los seis filtros de cliente — bloqueante de la parte B.** Hoy estas tablas filtran sobre el buffer acumulado y por eso desactivan el pie cuando hay filtro activo:

| Filtro en cliente | Endpoint que debe absorberlo |
| --- | --- |
| `PurchaseWorkspace.tsx:230` (`hasActivePurchaseFilters`) | `GET /purchasing/requests` |
| `StockIssuesWorkspace.tsx:112` (`filterStockIssues`) | `GET /inventory/issues` |
| `StockLocationsMatrix.tsx:293` (`hasActiveLocationMatrixFilters`) | `GET /inventory/balances` |
| `StockCountsWorkspace.tsx:117` (filtro por estado) | `GET /inventory/counts` |
| `StockByProductTable.tsx:220` (búsqueda + bajo mínimo) | `GET /inventory/balances` |
| `SuppliersPanel.tsx:155` (búsqueda) | `GET /purchasing/suppliers` |

Sin esto, la página filtrada sale vacía mientras el pie afirma un total que no corresponde. **No hay parche de interfaz: es contrato de API.**

**3 · Endpoint de agregación para la matriz de ubicaciones.** `StockLocationsMatrix` drena hoy hasta **50 páginas × 100 filas** (`inventory-list-pagination.ts:49-91` + `InventoryClient.tsx:606-622`) para calcular ocupación. Ese modelo es incompatible con «página visible». Diseña el endpoint que devuelva la agregación ya calculada, en consulta con AI-PROD-UX sobre qué debe mostrar la matriz.

---

## Parte B — Frontend · AI-FE-PLATFORM

**4 · Migrar las 14 superficies keyset** del portal, por módulo completo: comercial (8), catálogo de inventario (2), existencias por producto, ubicaciones, activos, usuarios.

**5 · Los cuatro side peek derivados por `id`.** Al reemplazar la página, `items.find(i => i.id === detailId)` devuelve `undefined` y **el panel se vacía o se desmonta solo**:

- `StockWorkspace.tsx:90`
- `PendingVisitRequestsView.tsx:301`
- `SchedulingClient.tsx:385`
- `StockTransferDialog.tsx:137`

Solución: cachear el registro seleccionado o cargar el detalle por `id`, no derivarlo de la lista visible. Los que capturan el objeto (`AssuranceClient.tsx:130`, `OperationsClient.tsx:107`, `PurchaseWorkspace.tsx:208`) sobreviven, pero **pierden el ancla visual** al desaparecer la fila resaltada del viewport: revisa el comportamiento.

**6 · Desacoplar los loaders de `InventoryClient.tsx`.** `loadIssuesList` (`:690-740`) reescribe además las metas de items, balances, activos y ubicaciones. Con nueve metas en paralelo y páginas independientes por tabla, ese nudo produce estados inconsistentes.

**7 · Matriz de ubicaciones** contra el endpoint de agregación de la parte A; retirar `drainInventoryBalances` y reescribir o eliminar `inventory-list-pagination.spec.ts`.

## Restricciones

- El bloqueante de filtros es duro: **ninguna de las seis tablas se migra en la parte B antes de que su filtro esté en el servidor**.
- Contrato DS y spec UX normativos.
- Sin regresión en las superficies ya migradas en fases anteriores.
- `nextCursor` sigue conservándose: `visit-requests.service.ts:940-955` depende de él para paginación interna.

## Entregables

1. Los 18 endpoints con `page` aditivo + los 6 filtros en servidor + endpoint de agregación.
2. Las 14 superficies migradas, un PR por módulo.
3. Los 4 side peek corregidos.
4. Loaders de inventario desacoplados.
5. OpenAPI, specs, E2E y evidencia de navegador por módulo.

## Stop/go

- Suites de API y portal verdes; `pnpm build` verde.
- Ninguna tabla filtra en cliente sobre un buffer paginado.
- La matriz no drena páginas.
- Ningún side peek se vacía al cambiar de página.
- `audit-ui.mjs` sin P0/P1 nuevos.

**Escalación a AI-EM-ARCH si:** subir un filtro al servidor cambia la semántica del resultado que el usuario ya conoce, o si el rediseño de la matriz altera lo que la vista comunica.
