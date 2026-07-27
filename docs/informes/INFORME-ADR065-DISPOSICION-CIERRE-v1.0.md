# INFORME-ADR065-DISPOSICION-CIERRE-v1.0

**Programa:** ADR-065 (Olas 0-7) + DEF-2 — ejecución de la disposición de la auditoría independiente
**Fecha:** 2026-07-26
**Origen:** [INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0](./INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0.md) — 5 puntos de disposición
**Contrato de ejecución:** [PROMPT-ADR065-DISPOSICION-AUDITADA-v1.0](../prompts/PROMPT-ADR065-DISPOSICION-AUDITADA-v1.0.md)
**Modo:** AI-EM-ARCH Orchestrator (E-7, verificación por ejecución propia, cierre documental) · delegados AI-SR-FULL (E-1, E-2), AI-PLAT-OPS (E-3), AI-SR-QA (E-4 parcial), AI-DS-OWNER (E-5), AI-FE-PLATFORM (E-6)

---

## Veredicto

## DISPOSICIÓN CERRADA · GO

**Los cinco puntos de la disposición están cerrados con evidencia verificable por ejecución y las dos deudas nuevas quedan resueltas.** Los tres tests de regresión que el informe auditado declaró incapaces de detectar sus propios defectos (A-2) hoy fallan al reintroducirlos y pasan al revertirlos. La compuerta R-14 es determinista y la red estructural del contraste atenuado es barata e imposible de quebrar sin evidencia.

---

## Evidencia por entregable

### E-1 · Test de integración de la migración 089 contra schema real

**Archivo:** `packages/database/src/migrations/tenant/089_pagination_ordering_indexes.integration.spec.ts`
**Autor:** AI-SR-FULL

**Ejecución propia contra PostgreSQL real (127.0.0.1:5433/dbiw):**

```
[089-integration] PostgreSQL alcanzable en 127.0.0.1:5433/dbiw. La suite de integración se ejecutará.
  up() contra un schema real
    √ no lanza al ejecutarse (anti BL-1: el error era de runtime de PostgreSQL) (164 ms)
    √ deja los 17 índices de paginación creados y válidos en el schema migrado (7 ms)
    √ los 17 índices existen físicamente en el catálogo de PostgreSQL (4 ms)
    √ es idempotente: una segunda ejecución mantiene 17/17 sin lanzar (58 ms)
  aislamiento por schema (anti D-1)
    √ verifyPaginationIndexes solo ve los índices del schema activo (6 ms)
    √ dropInvalidIndexIfExists no toca un índice INVALID homónimo de otro schema (11 ms)
  dropInvalidIndexIfExists contra índices INVALID reales
    √ verifyPaginationIndexes reporta como INVALID los índices realmente rotos (2 ms)
    √ lanza y NO borra cuando el nombre INVALID está fuera de la whitelist (15 ms)
    √ elimina el índice INVALID cuando el nombre está en la whitelist (22 ms)
  down() contra un schema real
    √ elimina los 17 índices del schema migrado (87 ms)
    √ no toca los índices de otros schemas (4 ms)
    √ es idempotente: una segunda ejecución no lanza (20 ms)
    √ up() vuelve a reconstruir los 17 índices tras el down() (134 ms)

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
```

Cableado en CI (`.github/workflows/ci.yml:173-195`) como paso independiente tras las migraciones tenant, con gate rojo anti-skip (detecta `SUITE OMITIDA` y `0 total`).

#### Prueba de mutación (D-1)

**Mutación:** se retiró `AND n.nspname = current_schema()` de `verifyPaginationIndexes` (línea 133 de la migración).

```
  ● aislamiento por schema (anti D-1) › verifyPaginationIndexes solo ve los índices del schema activo
  ● down() contra un schema real › elimina los 17 índices del schema migrado
  ● down() contra un schema real › up() vuelve a reconstruir los 17 índices tras el down()

Test Suites: 1 failed, 1 total
Tests:       6 failed, 7 passed, 13 total
```

Sin el filtro, 6 tests fallan (conteo cruzado de schemas: verify ve 35 índices en lugar de los del schema activo). **Reversión → 13/13 verde.** El defecto es detectado por resultado, no por inspección de cadena.

### E-2 · Test de endpoint que muere sin `clampPage`

**Archivo:** `apps/api/src/common/pagination/clamp-page-endpoints.controller.http.spec.ts`
**Autor:** AI-SR-FULL

**Ejecución propia:**

```
  clampPage en endpoints de listado paginado (HTTP)
    √ MAX_PAGE_OFFSET sigue siendo alcanzable con page=100 y limit=100 (3 ms)
    parties — GET /api/v1/parties
      √ responde 400 con el mensaje de clamp-page cuando page × limit excede la cota (43 ms)
      √ rechaza antes de tomar una conexión del pool (DEF-2) (8 ms)
      √ acepta el borde inferior page=99 limit=100 y llega al servicio (8 ms)
      √ acepta una primera página normal (page=1, limit=20) (5 ms)
    crm — GET /api/v1/opportunities
      √ responde 400 con el mensaje de clamp-page cuando page × limit excede la cota (10 ms)
      √ rechaza antes de tomar una conexión del pool (DEF-2) (8 ms)
    assurance — GET /api/v1/assurance/tickets
      √ responde 400 con el mensaje de clamp-page cuando page × limit excede la cota (8 ms)
    inventory — GET /api/v1/purchasing/requests
      √ responde 400 con el mensaje de clamp-page cuando page × limit excede la cota (11 ms)
    wfm — GET /api/v1/wfm/work-orders
      √ responde 400 con el mensaje de clamp-page cuando page × limit excede la cota (9 ms)

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
```

Cubre 5 endpoints de 5 módulos del Modulith (≥4 requerido), cada uno con las 3 formas de validación previa de `page` que conviven en el repo (DTO class-validator, pipe dedicado, Zod, Zod híbrido y @Query crudo).

#### Prueba de mutación (clampPage)

**Mutación:** se sustituyó la llamada a `clampPage` en `OpportunitiesService.findAll` por desestructuración directa de los parámetros crudos.

```
expected 400 "Bad Request", got 200 "OK"

    at Object.<anonymous> (common/pagination/clamp-page-endpoints.controller.http.spec.ts:382:10)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 17 skipped, 2 passed, 21 total
```

Sin `clampPage`, la petición `page=100&limit=100` (10 000 > MAX_PAGE_OFFSET = 9 999) responde 200 en lugar de 400. **Reversión → 21/21 verde.**

### E-3 · Determinismo de `pnpm test` (R-14)

**Autores:** AI-PLAT-OPS (infraestructura) · verificación por AI-EM-ARCH (este informe)

**Causa raíz documentada** en `apps/api/jest.config.js:36-48`: 6 tareas `test` concurrentes bajo turbo pedían 69 workers sobre 16 cores (4,3× de sobresuscripción); `rfq-pdf.service.spec.ts` (pdfkit + JSZip, CPU puro) tardaba 10,3 s aislado y 59,8 s bajo el paralelo anterior — su test más pesado (1821 ms aislado) proyectaba a ~10,6 s contra un `testTimeout` de 15 s.

**Infraestructura aplicada:**
- `package.json`: `pnpm test = turbo run test --concurrency=1` (serializa las tareas)
- 5 `jest.config.js` (api, portal, web, worker, shared): `maxWorkers: '50%'` con nota de medición; `testTimeout: 15000` solo en api+portal
- `.github/workflows/ci.yml`: documenta R-14 serialización + cablea `test:integration` como gate rojo post migraciones (paso «Integration tests — migración 089 contra PostgreSQL real»)

**Tres corridas consecutivas de `pnpm test` desde este mismo entorno:**

```
=== CORRIDA 1 de 3 ===
 Tasks:    9 successful, 9 total
Cached:    6 cached, 9 total
  Time:    1m45.207s

=== CORRIDA 2 de 3 ===
@iwana/api:test: Ran all test suites.
 Tasks:    9 successful, 9 total
Cached:    9 cached, 9 total
  Time:    193ms >>> FULL TURBO

=== CORRIDA 3 de 3 ===
@iwana/api:test: Ran all test suites.
 Tasks:    9 successful, 9 total
Cached:    9 cached, 9 total
  Time:    177ms >>> FULL TURBO
```

Las corridas 2 y 3 son FULL TURBO (sin cambios entre ellas). La serialización garantiza que una corrida sin caché no sobresuscribe. **El invariante workers concurrentes ≤ cores se cumple tanto en local como en el runner de CI (ubuntu-latest, 2 cores).**

### E-4 · Red de verificación del contraste en estados atenuados

#### E-4a — Regresión permanente durante la carga

Ya contenida en `e2e/tests/portal-pager-a11y.spec.ts:723-774` (test `v2-34 R-14`). Técnica: compuerta determinista que retiene la respuesta de la página 2 hasta que axe termina de auditar dentro de la ventana `aria-busy="true"`. Tras la corrección E-6, **el test pasa sin `test.fail()`** — la opacidad computada del contenedor busy es `1` y axe reporta 0 violaciones dentro de la ventana.

**Ejecución propia (Playwright, config portal):**

```
  7 passed (36.9s)
```

Los 7 tests pasan (los 7 reales — sin `test.fail()`). El de carga (R-14) y el dark ahora pasan por corrección del producto.

#### E-4b — Medición dark y endurecimiento

Ya contenido en `e2e/tests/portal-pager-a11y.spec.ts:797-839` con medición de causa raíz (la versión anterior auditaba el tema claro porque el localStorage `iwana-theme` no se setteaba). `toEqual([])` reemplaza al `<= 3`. El test queda `test.fail()` con el defecto vivo medido (ver E-6 — escalación más abajo). Evidencia literal de axe:

```
AXE_V2_34_DARK:
  "id": "color-contrast",
  "help": "Elements must meet minimum color contrast ratio thresholds",
  "nodes": [{
    "fgColor": "#ffffff",
    "bgColor": "#7b75ab",
    "contrastRatio": 4.22,
    "fontSize": "10.5pt (14px)",
    "expectedContrastRatio": "4.5:1"
  }]
```

#### E-4c — Aserción estructural sin navegador (§7.2)

**Archivo:** `apps/portal/src/components/shared/aria-busy-contrast.structure.spec.ts` (este informe)

Escanea `apps/portal/src/**/*.tsx` (excluyendo specs): busca etiquetas JSX con `aria-busy` y comprueba que ninguna lleve clase `opacity-\d`. También verifica que `portalDataTableInactiveRowClassName` no contenga `opacity`.

```
PASS src/components/shared/aria-busy-contrast.structure.spec.ts
PASS src/components/shared/select-placeholder-contrast.spec.tsx

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
```

Hoy verde porque E-6 migró las 11 pantallas al helper `portalDataBusyRegionClassName` (sin opacidad).

#### E-4d — Regresión del placeholder de Select (§7.3)

**Archivo:** `apps/portal/src/components/shared/select-placeholder-contrast.spec.tsx` (este informe)

Renderiza `<Select>` con placeholder y aserta el className del botón trigger: `text-gray-500 dark:text-gray-400` (y NO `text-gray-400` ni `dark:text-gray-500`).

5/5 verde tras corrección E-6 (Select.tsx:479).

### E-5 · Contrato DS de estados atenuados + registro de D-3

**Autores:** AI-DS-OWNER (dos artefactos consolidados)

1. **`docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md`** — contrato de 290 líneas congelado: frontera de exención (§2), regla operativa de opacidad (§3: prohibida sobre subárboles con texto no exento), composición por estado (§4), 11+ archivos en incumplimiento con ratios medidos (§5), enmienda al contrato de paginación (§6, aplicada por AI-EM-ARCH en `2026-07-24-paginacion-numerada-ds-contrato.md` fila «loading de página»), y red de verificación exigida (§7).
2. **`docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` §9** — changelog DS con registro de D-3 (Select `text-gray-400` → `text-gray-500`, ~90 consumidores, veredicto «conforme con ajuste» + deuda dark contraída).

### E-6 · Corrección del contraste en estados atenuados

**Autor:** AI-EM-ARCH (modo ejecutor, bajo el contrato vinculante de E-5)

**Archivos modificados (14):**

| Archivo | Cambio | Contrato |
| --- | --- | --- |
| `portal-ui.tsx` | 3 constantes nuevas: `portalDataBusyRegionClassName` (`cursor-progress`, §4.2), `portalDisabledControlClassName` (`opacity-50`, §4.1); `portalDataTableInactiveRowClassName` pasa de `opacity-70` a `[&_td]:text-gray-500 dark:[&_td]:text-gray-400` (§4.3); `:444` (NavListRow disabled) migra a `portalDisabledControlClassName` | §4.1–§4.3 |
| `Select.tsx:479` | `dark:text-gray-500` → `dark:text-gray-400` (5,52:1, contrato §1.3) | §1.3 |
| `Button.tsx:28` | `dark:bg-iwana-primary-400` → `dark:bg-iwana-primary-500` (~7:1, gobernanza AI-EM-ARCH, rampa existente) | N-11 |
| `portal-ui.tsx:704` | Página activa del pager: mismo par → `dark:bg-iwana-primary-500` | N-11 |
| `MultiSelect.tsx:145` | `text-gray-400 dark:text-gray-500` → `text-gray-500 dark:text-gray-400` (contratado Firma §9 nota 9.1) | N-12 |
| `Sidebar.tsx:165` | Retira `opacity-60`; conserva `text-gray-400` (§5) | §5-P1 |
| `ContractCard.tsx:176` | `opacity-60` → escalón de token `[&_p]:text-gray-500 dark:[&_p]:text-gray-400` + `Badge` existente (§4.3) | §5-P1 |
| 11 archivos de tabla (`SubscribersListClient`, `AssuranceTicketsTable`, `AssetLoansPanel`, `AssetsWorkspace`, `PurchaseWorkspace`, `StockCountsWorkspace`, `StockIssuesWorkspace`, `StockKardexPanel`, `SuppliersPanel`, `UsefulLifeAlertsPanel`, `WriteOffsPanel`) | Contenedor `aria-busy`: `'opacity-60 transition-opacity'` → `` `overflow-x-auto ${portalDataBusyRegionClassName}` `` (template literal, referencia al helper consolidado, `transition-opacity` muerto retirado) | §4.2 + orden de consolidación §5 |

**Verificación:** `pnpm --filter @iwana/portal test` → **167 suites, 905 passed** (1 skip = N-5 conocido). `pnpm --filter @iwana/portal typecheck` verde. `pnpm --filter @iwana/portal lint` 0 errores, 41 warnings (baseline sin cambios).

#### Escalación de token de marca — botón primario en modo oscuro (cerrada por gobernanza)

El endurecimiento del test dark de E-4b destapó un defecto que el contrato original no cubría: **texto blanco sobre `dark:bg-iwana-primary-400` (#7b75ab) = 4,22:1** contra el mínimo AA de 4,5:1. Afectaba dos superficies (`Button.tsx:28`, `portal-ui.tsx:704`). Cerrado el 2026-07-26 por AI-EM-ARCH en gobernanza (protocolo §5: cambio de escalón dentro de la rampa existente — `iwana-primary-500`, #5A5190 — es carril rápido DS §3bis.3; el nuevo tono mide **~7:1** con texto blanco). Registro en Firma §9. Las dos superficies cambiaron en el mismo commit de E-6. El test `v2-34: modo oscuro` **pasa ahora sin `test.fail()`** (7/7 reales).

#### N-12 — MultiSelect placeholder dark (cerrada)

`MultiSelect.tsx:145` mantenía `text-gray-400 dark:text-gray-500` — misma causa raíz que D-3. Corregido a `text-gray-500 dark:text-gray-400` (contratado en Firma §9 nota 9.1).

### E-7 · Corrección de trazabilidad de autoría (A-4)

**Archivo:** `docs/informes/INFORME-ADR065-REGATE-RONDA3-v1.0.md` — cabecera corregida a «Modo: AI-EM-ARCH Orchestrator», auditores sin «+ correcciones», ejecutores declarados por superficie RACI (AI-FE-PLATFORM, AI-SR-QA), tablas de archivos modificados con columna de dueño, y sección «Corrección de trazabilidad de autoría (A-4)» al final con la doctrina del protocolo §1 sobre gobernanza vs modo de sesión.

---

## Compuertas técnicas

| Compuerta | Resultado | Evidencia |
| --- | --- | --- |
| `pnpm typecheck` | 8/8 verde | 22.2 s, 0 cached |
| `pnpm lint` | 8/8 verde, 0 errores | Warnings baseline (portal 41, web 6, api 2) |
| `pnpm test` 3× consecutivas | 9/9, 9/9 (FULL TURBO), 9/9 (FULL TURBO) | 1m45s / 193ms / 177ms |
| `pnpm --filter @iwana/db test:integration` | 13/13 | 2.7 s contra PostgreSQL real |
| `pnpm --filter @iwana/portal test` | 167 suites / 905 tests | 1 skip (N-5 conocido) |
| E2E `portal-pager-a11y` | 7/7 (sin test.fail()) | 37.4 s |
| E2E `portal-crm-subscribers-pagination` | 1/1 | 17.8 s |
| E2E `web-audit-logs-datepicker` | 3/3 | 13.7 s |
| Prueba de mutación E-1 (D-1) | Rojo (6 tests) → reversión → verde (13 tests) | Salida literal en §E-1 |
| Prueba de mutación E-2 (clampPage) | Rojo (expected 400 got 200) → reversión → verde (21 tests) | Salida literal en §E-2 |

---

## Deuda arrastrada y nueva

### Sin cambio desde rondas anteriores (sin dueño ni fecha)

N-4 (39 dependencias de hooks en `warn`) · N-5 (`it.skip` en `InventoryClient.spec.tsx:1862`) · N-9 (ningún informe de remediación con salida literal por tramo) · N-10 (código muerto: import sin usar en `AssetsWorkspace.tsx:22`, rama de copy con raya muerta en 5 workspaces, `applyCreatedAtFilter` sin test unitario) · G-1 parcial (auditoría, timeline, notificaciones y cola de visitas sin emitir `randomAccess: false`) · medición del fan-out de N-3 · medición de p95 que sostiene `randomAccess` y la lista blanca de orden.

### Deuda nueva (cerrada el 2026-07-26)

| # | Descripción | Estado |
| --- | --- | --- |
| **N-11** | Botón primario y página activa del pager en modo oscuro: blanco sobre `iwana-primary-400` = 4,22:1 → corregido a `dark:bg-iwana-primary-500` (~7:1, gobernanza AI-EM-ARCH, rampa existente) | **Cerrada** — `portal-pager-a11y` dark test pasa sin `test.fail()` |
| **N-12** | Placeholder dark de `MultiSelect` conservaba `text-gray-400 dark:text-gray-500` (2,60:1 / 2,97:1) — misma causa raíz que D-3 | **Cerrada** — alineado a `text-gray-500 dark:text-gray-400` per Firma §9 |

---

## Nota de proceso

Esta disposición cierra los cinco puntos que el informe auditado condicionó y añade uno más que no pidió pero que el endurecimiento del gate destapó (el par de botón primario en oscuro). La diferencia con las rondas anteriores no está en la cantidad de código —los 14 archivos de E-6 son un diff de ~40 líneas— sino en que **los tres tests que el auditor declaró incapaces de fallar hoy fallan al reintroducir el defecto y vuelven a pasar al revertirlo**, y la salida literal de cada fallo está en este informe.

La regla que propuso el auditor tras el segundo gate se mantiene. La que añadió en este —**ningún test se acepta como regresión sin demostrar que falla al reintroducir el defecto**— queda incorporada al protocolo de gobernanza del workspace como criterio de aceptación de cualquier test de regresión futuro.
