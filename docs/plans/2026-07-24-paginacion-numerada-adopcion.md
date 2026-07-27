# Plan — Adopción de paginación numerada en tablas operativas

**Fecha:** 2026-07-24
**Estado:** **Aprobado** · Olas 0–7 **ejecutadas** (GO / GO-CON-DEUDA) · HOLD envelope **cerrado** · Deuda viva documentada · [consolidación](../informes/INFORME-ADR065-SESION-CONSOLIDACION-2026-07-25-v1.0.md) · [SR-QA Ola 7](../informes/INFORME-ADR065-OLA7-SR-QA-GATE-v1.0.md)
**Orquestador:** AI-EM-ARCH (modo Architect + Orchestrator)
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (**Aprobado** CTO 2026-07-24) — supersede [ADR-064](../adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md) §§2/3/5/9
**Specs:** [UX](../specs/2026-07-24-paginacion-numerada-ux.md) · [contrato DS](../specs/2026-07-24-paginacion-numerada-ds-contrato.md)
**Consultas:** AI-PROD-UX · AI-DS-OWNER · AI-FE-PLATFORM · AI-SR-FULL (2026-07-24) — cuatro veredictos GO-CON-ENMIENDAS

---

## Objetivo

Sustituir «Cargar más» por navegación numerada (Anterior · 1…N · Siguiente + selector de tamaño + conteo de rango en el pie) **y añadir orden por encabezado de columna** como default de las tablas operativas de `apps/portal` y `apps/web`, con el modo de acceso y las columnas ordenables **declarados por el servidor** (`meta.capabilities.randomAccess` y `sortableFields`), cerrando de paso los cuatro defectos preexistentes que la paginación numerada vuelve visibles.

Criterios de aceptación: **CA-PAG v2-01…v2-36** y **CA-ORD-01…14** (spec UX §4 y §4-bis).

> **Enmienda de alcance (2026-07-24).** El orden por columna se añadió después de la primera versión de este plan, por observación del CTO. **No crea una ola nueva**: se reparte en las olas existentes, porque comparte contrato de API, índices, estado en URL y primitive de tabla con la paginación. El costo crece en las Olas 1 y 2 — 34 de los 35 endpoints no aceptan `sort` hoy, y cada columna ordenable publicada cuesta un índice por tenant.

## Regla de convivencia

**Migración por módulo completo.** Ningún módulo queda mitad numerado y mitad «Cargar más». Big-bang prohibido (ADR-065 §16).

---

## Olas

### Ola 0 — Gobierno · AI-EM-ARCH

| Entregable | Estado |
| --- | --- |
| ADR-065 v1.1 | **Aprobado por el CTO (2026-07-24)** |
| Spec UX (CA-PAG v2, copy congelado, mobile, casos límite) | Escrita |
| Contrato DS (`PortalTablePager`, `PortalPageSizeSelect`, receta, estados) | Escrito |
| Este plan + prompts de ejecución por fase | Escrito |
| ADR-064 marcado superado en §§2/3/5/9 | Pendiente |
| `portal.instructions.md` · `component-recipes.md` §2 · Firma §2.3 | Pendiente |
| Informe vivo v2.0 | Pendiente |

**Stop/go: superado.** El CTO firmó ADR-065 v1.1 el 2026-07-24. La norma es efectiva y el merge gate ahora exige lo contrario que antes: tabla operativa nueva o remediada que no cumpla la anatomía de ADR-065 = rechazo.

**E-1 / ADR-066 cerrado** (flag `transactional` en runner). Ola 2 usa migración **089_*** con `transactional = false`.

### Ola 1 — Contrato único + deuda crítica de backend · AI-SR-FULL

Prompt: `docs/prompts/PROMPT-ADR065-OLA1-CONTRATO-API-v1.0.md`

- Contrato `ListMeta` / `ListResponse<T>` en `packages/shared/src/dto/pagination.dto.ts`.
- Helper común en `apps/api/src/common/pagination/`; **retirar** las tres utilidades duplicadas (`commercial/utils/commercial-pagination.ts`, `inventory/utils/inventory-pagination.ts`, `taxation/utils/taxation-pagination.ts`).
- **DEF-1** desempate por `id` en las 7 órdenes que no lo tienen.
- **DEF-2** clamp `page * limit <= 10_000` en los 35 endpoints.
- **DEF-3** arreglo del keyset de auditoría (`id < cursor` sobre UUID aleatorio).
- **DEF-4 backend**: `slaBreachStatus` de assurance bajado a SQL; retirar la paginación in-memory de `expediente.service.ts:666-669`.
- **Orden:** `sortBy` + `sortDir` con lista blanca por recurso; `sortableFields` y `sort` en `meta`; desempate por `id` **también en el orden elegido**; los presets de `CATALOG_SORT_VALUES` en dual-emit hacia deprecación.
- Dual-emit de un sprint + OpenAPI (`ListMetaDto` compartido, `@ApiQuery` de `page`, `sortBy` y `sortDir`, campos planos `deprecated`).

**Stop/go:** suite de API verde; OpenAPI actualizado; grep sin utilidades duplicadas.

### Ola 2 — Índices · AI-SR-FULL + AI-PLAT-OPS

Prompt: `docs/prompts/PROMPT-ADR065-OLA2-INDICES-v1.0.md`

- Decisión previa de plataforma: `CREATE INDEX` bloqueante con ventana **vs.** modo no transaccional en `packages/database/src/migrations/tenant/runner.ts:225`.
- Migración tenant `089_pagination_ordering_indexes.ts`, manual y reversible, ~14 índices (`transactional = false`; 087 = hash expedientes, 088 = backfill hash).

- **Orden:** aquí se **cierra la lista blanca** de columnas ordenables. Una columna solo se publica en `sortableFields` si tiene índice de soporte y su p95 de página profunda ordenada se mantiene bajo 1,5 s. Tope de 3-5 por tabla. Es el punto donde la ambición de columnas se ajusta al plan de consulta real, con medición y no con criterio.

**Stop/go:** `pnpm db:migrate:all` y revert verificados; p95 de página profunda medido y registrado por recurso **y por orden ofrecido** — alimenta `randomAccess` y `sortableFields`.

### Ola 3 — Infraestructura y primitives de frontend · AI-FE-PLATFORM

Prompt: `docs/prompts/PROMPT-ADR065-OLA3-FE-INFRA-v1.0.md`

- `useTableQueryState` (`push` al cambiar de página, `replace` para filtros/búsqueda/tamaño).
- Portar `mergeUrlSearchParams` a `apps/portal/src/lib/`.
- Unificar las tres familias de envelope de `api-client.ts` y las 13 firmas legacy `page`/`limit`.
- Auditoría de `<Suspense>` sobre todo consumidor de `useSearchParams`.
- Contrato de namespacing de query params para `InventoryClient` (~9 tablas bajo una URL).
- `PortalTablePager` + `PortalPageSizeSelect` según contrato DS; `PortalResultsStrip` gana `controls?`.
- **Orden:** `PortalDataTableSortableHead` sobre `PortalDataTableHead`; `useTableQueryState` gana `sortBy`/`sortDir` (`replace` + reset a página 1); variante mobile del orden en la barra de filtros, reutilizando el `Select` que ya existe en Comercial.

**Stop/go:** `pnpm build` de portal y web verde (el fallo de `<Suspense>` solo aparece en build de producción); specs de los primitives cubriendo la matriz de estados.

### Ola 4 — Piloto extremo a extremo · AI-FE-PLATFORM + AI-SR-QA

Prompt: `docs/prompts/PROMPT-ADR065-OLA4-PILOTO-v1.0.md`

Superficie: **Suscriptores** (`SubscribersListClient.tsx`) — ya es offset en servidor y hoy no tiene estado en URL, así que ejercita el camino completo.

Valida **paginación y orden juntos**: es la única forma de descubrir la interacción entre orden, página y filtro antes de replicarla.

**Stop/go: gate de AI-SR-QA** sobre CA-PAG v2 **y CA-ORD**. Si el patrón no convence aquí, se corrige antes de replicarlo treinta veces.

### Ola 5 — Cosecha de superficies ya offset · AI-FE-PLATFORM

Prompt: `docs/prompts/PROMPT-ADR065-OLA5-COSECHA-OFFSET-v1.0.md`

Las 13 restantes que **no necesitan backend nuevo**: tareas, tickets, kárdex, vida útil, préstamos, proveedores, bajas, compras, conteos, visitas, y las 4 tablas de `apps/web` (que además pierden su `cursorHistory` en memoria).

Los recursos que la Ola 2 marcó `randomAccess: false` **no migran**: adoptan el contrato nuevo conservando «Cargar más», y devuelven `sortableFields: []`.

Cada tabla que migra declara sus columnas ordenables **leyendo `sortableFields`**, nunca con una lista local. En Comercial, el `<Select>` de orden deja de ser el camino propio del módulo y pasa a ser la variante mobile del contrato único. Consolidación pendiente en esta ola: el paginador numerado a mano de `SeguimientoTab.tsx:246-281` adopta `PortalTablePager` o se documenta como excepción de preview.

### Ola 6 — Superficies keyset · AI-SR-FULL → AI-FE-PLATFORM

Prompt: `docs/prompts/PROMPT-ADR065-OLA6-KEYSET-v1.0.md`

- `page` aditivo sobre los 18 endpoints keyset (inventory, commercial, taxation, users, audit).
- **Bloqueante:** subir al servidor los 6 filtros de cliente antes de tocar esas UIs.
- Rediseño de la matriz de ubicaciones (hoy drena 50 páginas × 100 filas) → endpoint de agregación.
- Los 4 side peek derivados por `id` que se vacían solos al reemplazar la página.

### Ola 7 — Grupo sin cota y gate final · AI-SR-FULL + AI-SR-QA

Paginar desde cero los 9 endpoints sin cota alguna (purchase orders, wfm events, work-orders, opportunities, quotes, contracts, potentials, organization sites) — violación viva de ADR-064 §8, vigente e independiente de esta decisión.

Gate final SR-QA sobre CA-PAG v2 completo.

---

## RACI

| Ola | R | A | C | I |
| --- | --- | --- | --- | --- |
| 0 | AI-EM-ARCH | CTO | PROD-UX, DS-OWNER, FE-PLATFORM, SR-FULL | todos |
| 1 | AI-SR-FULL | AI-EM-ARCH | SEC-ENG (DEF-2), DATA-ENG | FE-PLATFORM |
| 2 | AI-SR-FULL | AI-EM-ARCH | AI-PLAT-OPS | SR-QA |
| 3 | AI-FE-PLATFORM | AI-EM-ARCH | DS-OWNER, PROD-UX | SR-QA |
| 4 | AI-FE-PLATFORM | AI-SR-QA | PROD-UX | CTO |
| 5 | AI-FE-PLATFORM | AI-EM-ARCH | DS-OWNER | SR-QA |
| 6 | AI-SR-FULL → AI-FE-PLATFORM | AI-EM-ARCH | PROD-UX (matriz) | SR-QA |
| 7 | AI-SR-FULL | AI-SR-QA | — | CTO |

El aprobador de un gate nunca es el productor del artefacto.

## Costo

| Bloque | Estimación |
| --- | --- |
| Backend (Olas 1, 2, 6, 7) | 5-7 semanas-persona |
| Frontend (Olas 3, 4, 5, 6) | ~79 días-persona (rango 65-90) |
| Calendario | 9-16 semanas con un ingeniero de FE; 9-10 con dos en paralelo y backend adelantado |

## DoD global

- ADR-065 aprobado por el CTO y ADR-064 marcado superado en §§2/3/5/9.
- Un solo envelope en `@iwana/shared` consumido por los 35 endpoints; tres utilidades duplicadas retiradas.
- DEF-1 a DEF-4 cerrados y verificados.
- `page`, `pageSize`, `sort`, filtros y búsqueda en la URL en toda tabla operativa.
- Ninguna tabla monta los dos pies; ningún módulo con dos gramáticas.
- CA-PAG v2-01…v2-36 y CA-ORD-01…14 verificados por SR-QA.
- Ninguna columna publicada en `sortableFields` sin índice de soporte; ninguna tabla con lista de orden local.
- `aria-sort` presente en todo encabezado ordenable — hoy no existe en el repo.
- Evidencia de navegador a 1280 px y 375 px, claro y oscuro, por ola.
- Informe vivo actualizado con evidencia por ola.
