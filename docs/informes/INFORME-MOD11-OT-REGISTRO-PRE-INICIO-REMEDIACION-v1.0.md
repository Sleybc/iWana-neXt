# INFORME-MOD11-OT-REGISTRO-PRE-INICIO-REMEDIACION-v1.0

**Módulo:** MOD11 Ejecución operativa / órdenes de trabajo
**Fase:** Remediación — registro pre-inicio habilitado en bloques 3/4/5 del drawer de OT (track backend B1)
**Versión:** 1.0
**Estado:** Implementado (backend). Pendiente: B2 (frontend), B3 (QA), integración
**Fecha:** 2026-08-31
**Prompt de origen:** `docs/prompts/PROMPT-MOD11-OT-REGISTRO-PRE-INICIO-REMEDIACION-v1.0.md`
**Responsable implementación:** AI-SR-FULL
**Alcance de este informe:** track B1 (backend). No cubre B2 ni B3.

---

## 1. Síntoma

Con la OT sin iniciar (p. ej. `ASSIGNED`), el drawer en `/dashboard/operations?executionOrderId=…` mostraba los formularios de "Trabajo realizado", "Equipos y materiales" y "Evidencia y conformidad" operativos, mientras el bloque 2 (Checklist) estaba atenuado con el alert "Inicia la ejecución para habilitar el checklist".

Por detrás, el backend aceptaba y persistía registro pre-inicio, con auto-promoción silenciosa a `IN_PROGRESS` sin evento.

## 2. Causa raíz

1. `computeAllowedActions` entregaba `START + REGISTER_ACTIVITY + REGISTER_ITEM_USAGE + REGISTER_EVIDENCE` en CREATED/ASSIGNED/EN_ROUTE (`execution-orders.service.ts:1862-1867` en el estado previo). Nacida en `8e853420` sin justificación registrada.
2. `registerFieldWork` y `registerItemUsage` aceptaban registro pre-inicio y **auto-promovían silenciosamente** la OT a `IN_PROGRESS` (asignando además `startedAt`) **sin emitir `ExecutionOrderStartedV1`** → divergencia de proyecciones ADR-068: el reconciliador espera SCHEDULED para CREATED/ASSIGNED/EN_ROUTE mientras la OT canónica ya estaba IN_PROGRESS, hasta el próximo evento (BLOCK/CLOSE).
3. `registerEvidence` persistía pre-inicio sin promover (`assertMutable` solo bloquea terminales).
4. Conformidad: la spec congelada v1 ya declaraba la precondición "Registrar actividad: OT en progreso/bloqueada" (`docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md:112-113`). La implementación la contradecía.

Regla de producto aplicada: **nada se registra en la OT hasta pulsar "Iniciar ejecución"**. La única transición a IN_PROGRESS es `start()` (idempotente, emite `ExecutionOrderStartedV1`).

## 3. Cambios (archivo:línea, estado final)

### 3.1 Política `allowedActions`

| Archivo | Línea | Cambio |
| --- | --- | --- |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` | 1856 (case CREATED/ASSIGNED/EN_ROUTE, `:1851-1857`) | Pre-inicio entrega **solo `['START']`** para técnico asignado o pool sin asignar. IN_PROGRESS, BLOCKED, terminales y supervisión: sin cambios. |

### 3.2 Guarda de precondición de registro

| Archivo | Línea | Cambio |
| --- | --- | --- |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` | `:2486-2509` | Nueva guarda privada `assertRegistrationActive(order)`: exige `status ∈ {IN_PROGRESS, BLOCKED}`; en caso contrario lanza `ConflictException` (409) con código `EXECUTION_ORDER_NOT_STARTED` y mensaje accionable en español ("Inicia la ejecución antes de registrar información en esta orden de trabajo."). `assertMutable` **no se tocó**: los demás comandos conservan su semántica. |
| ídem | `:729` | Llamada en `registerFieldWork` (tras `assertVersion` + `assertMutable`, antes de persistir). |
| ídem | `:858` | Llamada en `registerItemUsage` (antes de `assertCustodyAssignment`, que queda intacta). |
| ídem | `:1228` | Llamada en `registerEvidence` (antes de la verificación del upload-intent). |

`start()` no pasa por la guarda nueva: el registro interno de actividad `'START'` (`:673-684`, actividad opcional con `note`) escribe `ExecutionOrderActivity` directamente vía `manager.save` dentro de `start()`, sin invocar `registerFieldWork`. Cubierto por spec dedicado (ver §4).

### 3.3 Eliminación de la auto-promoción

| Archivo | Línea previa | Cambio |
| --- | --- | --- |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` | `:730-736` (`registerFieldWork`) | Eliminada la rama `CREATED/ASSIGNED → IN_PROGRESS` (con asignación de `startedAt`). No queda código muerto. |
| ídem | `:869-875` (`registerItemUsage`) | Ídem. |

Sin eventos nuevos: `registerFieldWork` y `registerEvidence` no emiten eventos (igual que antes); `registerItemUsage` sigue emitiendo únicamente `InventoryConsumptionRequestedV1` vía outbox. El catálogo ADR-068 no cambia.

### 3.4 Specs actualizados y nuevos (TDD)

| Archivo | Línea | Cambio |
| --- | --- | --- |
| `apps/api/src/modules/tasks/tests/execution-orders.task3.spec.ts` | `:130-143` | Filas técnico asignado CREATED/ASSIGNED/EN_ROUTE: aserción exacta `['START']`, sin `REGISTER_*`. |
| ídem | `:285-294` | Contratista asignado en ASSIGNED: solo `START`. |
| ídem | `:343-383` | Matriz 9 estados × roles: filas CREATED/ASSIGNED/EN_ROUTE × técnico → `['START']`; aserción exacta `:486` intacta. |
| ídem | `:490-762` | **Nuevo describe** "guarda de registro pre-inicio (remediación MOD11)": 3 comandos × 3 estados pre-inicio → 409 `EXECUTION_ORDER_NOT_STARTED` y **cero persistencia** (ninguna llamada a `set()`); IN_PROGRESS/BLOCKED → éxito para los 3 comandos con `status` y `startedAt` **sin mutar** (`persisted[0] = { status, startedAt: null }`); `registerItemUsage` emite solo `InventoryConsumptionRequestedV1`; `registerEvidence` no emite eventos; `start()` en ASSIGNED es la única vía a IN_PROGRESS, emite `ExecutionOrderStartedV1` y registra la actividad `'START'` sin pasar por la guarda. |
| `apps/api/src/modules/tasks/tests/execution-orders.service.spec.ts` | `:481` | Consumo exitoso desde custodia: fixture `ASSIGNED` → `IN_PROGRESS` (el éxito en ASSIGNED dependía de la auto-promoción eliminada). |
| `apps/api/src/modules/tasks/tests/execution-order-projection-convergence.service.spec.ts` | `:253-272` | **Nuevo** "OT pre-inicio (ASSIGNED) sin iniciar mantiene proyecciones SCHEDULED sin divergencia": con la auto-promoción eliminada, canónico ASSIGNED ⇄ proyecciones SCHEDULED → `hasDiscrepancy === false`. |

Specs de evidencia revisados: `execution-orders.evidence.service.spec.ts` usa por defecto `IN_PROGRESS` (`:72`) y sus casos negativos usan estados terminales; ningún spec de evidencia registraba pre-inicio → sin cambios necesarios. `execution-orders.task8.spec.ts` y `execution-orders.controller.http.spec.ts` operan en IN_PROGRESS o mockean la política → sin cambios.

### 3.5 OpenAPI

Los decoradores de los tres endpoints (`execution-orders.controller.ts:272-290, :292-317, :421-439`) **no enumeran códigos de error** (no usan `@ApiResponse` con códigos), por lo que no se tocaron, según la condición del prompt §5.4.

El contrato publicado `apps/api/openapi/tasks-execution-orders.v1.json` ya declaraba respuesta `409` (`$ref: Conflict`) en los tres endpoints. Se actualizó documentalmente (sin cambio de forma: sin paths, schemas estructurales ni DTOs nuevos):

| Línea | Cambio |
| --- | --- |
| `:132` | Descripción del response `Conflict`: añade la precondición de ejecución iniciada. |
| `:178` | Enum de `ExecutionOrderError.code`: se añade `EXECUTION_ORDER_NOT_STARTED` (aditivo; refleja el código que la API ya devuelve). |

Sin cambios de forma en `@iwana/shared`: enum `ExecutionOrderAllowedAction` y todos los DTOs intactos.

## 4. Evidencia de corridas

### 4.1 TDD — rojo antes del fix (implementación pendiente)

```text
FAIL src/modules/tasks/tests/execution-orders.task3.spec.ts
Tests:       19 failed, 62 passed, 81 total
```

19 fallos = 9 (3 comandos × 3 estados pre-inicio, 409 esperado) + filas de política/matriza nueva + test de única vía a IN_PROGRESS. Todos fallaban por la razón correcta (la API vieja permitía registro pre-inicio y ofertaba `REGISTER_*`).

### 4.2 Verde tras la implementación

```text
pnpm --filter @iwana/api exec jest src/modules/tasks --silent
Test Suites: 22 passed, 22 total
Tests:       501 passed, 501 total
Time:        20.66 s
```

Incluye en verde: `execution-orders.task3.spec.ts` (81 tests), `execution-orders.service.spec.ts`, `execution-orders.evidence.service.spec.ts`, `execution-orders.task8.spec.ts`, `execution-orders.controller.http.spec.ts`, `execution-orders.controller.contract.spec.ts`, `tasks.swagger.spec.ts` y `execution-order-projection-convergence.service.spec.ts` (10 tests, incluido el nuevo de convergencia).

### 4.3 Monorepo

```text
pnpm typecheck → Tasks: 8 successful, 8 total (0 errores)
pnpm lint      → Tasks: 8 successful, 8 total — 0 errors, 7 warnings preexistentes
                 (execution-order-templates.controller.ts, tax-presets.seeder.ts; archivos no tocados)
eslint sobre los 4 archivos modificados → sin problemas
```

## 5. Criterios de aceptación (alcance B1)

| CA | Verificación | Evidencia |
| --- | --- | --- |
| **CA-1** — pre-inicio entrega `allowedActions` sin `REGISTER_*` (solo `START` técnico/pool; supervisión sin cambio) | ✅ Verificado | `execution-orders.task3.spec.ts` — filas pre-inicio (`:135`), contratista (`:285`), matriz (`:343-383`); filas de supervisión y terminales intactas y en verde. |
| **CA-2** — `field-work` / `item-usage` / `evidence` pre-inicio → 409 `EXECUTION_ORDER_NOT_STARTED`; IN_PROGRESS y BLOCKED → éxito | ✅ Verificado | Guarda `:2486-2509` + llamadas `:729/:858/:1228`; specs 3×3 pre-inicio (`task3.spec :492-671`) y éxitos en IN_PROGRESS/BLOCKED (`:673-746`). |
| **CA-3** — ningún comando de registro muta `status` ni `startedAt`; `start()` única transición a IN_PROGRESS y emite `ExecutionOrderStartedV1` | ✅ Verificado | Specs de no-mutación (`persisted[0].status`, `startedAt: null` y objeto de orden inalterado); test de `start()` única vía (`task3.spec:748`); sin auto-promoción en el código (sección 3.3). |
| **CA-6** — specs de convergencia ADR-068 en verde; sin divergencia inducible por registro | ✅ Verificado | Suite de convergencia 10/10 en verde; nuevo test "sin auto-promoción → sin divergencia" (`execution-order-projection-convergence.service.spec.ts:253-272`). |

CA-4, CA-5 y CA-7 (drawer portal y suites de portal) corresponden a los tracks B2/B3; fuera del alcance de este informe.

## 6. Nota de flujo MOD11–MOD12

`InventoryConsumptionRequestedV1` ya **no se emite pre-inicio**: el consumo se rechaza con 409 antes de crear el uso ni encolar el evento al outbox. MOD12 deja de recibir solicitudes de consumo originadas en OTs no iniciadas; la saga de reconciliación de inventario no ve requests huérfanas de este origen. En IN_PROGRESS/BLOCKED el flujo es idéntico al anterior (emisión vía outbox, respuesta 202 con recibo PENDING).

Complemento: con la auto-promoción eliminada desaparece la única fuente de divergencia ADR-068 inducible por registro (canónico IN_PROGRESS sin `ExecutionOrderStartedV1` frente a proyecciones SCHEDULED).

## 7. Deuda residual

**Ninguna** (esperada por el prompt). Notas de trazabilidad:

- El working tree contiene cambios **preexistentes de otros tracks** (p. ej. `ExecutionOrderDrawer.spec.tsx` del track B2, bloque `requirements` del JSON OpenAPI y archivos de access-control/crm/users de trabajos anteriores). Este track solo modificó los archivos listados en §3; no se reverte ni altera trabajo ajeno.
- La nota de contrato v1.x (precondición de estado para `item-usage` y `evidence`, fin de la auto-promoción silenciosa) la registra AI-EM-ARCH post-merge en `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md`, según §1 del prompt (fuera de este track).

## 8. Blockeos

Ninguno. El criterio stop/go (§11 del prompt) no se activó: no hay consumidor de registro pre-inicio con justificación documentada vigente (la spec `:112-113` exige lo contrario) y ningún flujo fuera del módulo tasks dependía de la auto-promoción (suite tasks completa 501/501 en verde, incluidos worker-facing y convergencia).

---

## 9. Verificación QA (B3)

**Agente:** AI-SR-QA · **Fecha:** 2026-08-31 · **Alcance:** verificación de integración de B1 (backend) y B2 (frontend) contra PROMPT-MOD11 §7/§10. Sin reimplementación; defectos reportados con evidencia. Cambios de QA en sesión: solo tests (ver §9.3, H1).

### 9.1 Matriz criterio ↔ test

| CA | Spec(s) que lo cubren | Test(s) | Estado |
| --- | --- | --- | --- |
| **CA-1** — pre-inicio `allowedActions` sin `REGISTER_*` (solo `START` técnico/pool; supervisión sin cambio) | `apps/api/src/modules/tasks/tests/execution-orders.task3.spec.ts` | `estado CREATED/ASSIGNED/EN_ROUTE: solo START` (`:134-143`, aserción exacta `['START']` + no `REGISTER_*`); `estado ASSIGNED: solo START` contratista (`:291`); matriz 9 estados × roles con `expected: ['START']` en filas pre-inicio técnico (`:334-383`, run `:463`); filas supervisión/terminales intactas (`:198-332`) | ✅ Verde |
| **CA-2** — 3 comandos × pre-inicio → 409 `EXECUTION_ORDER_NOT_STARTED`; IN_PROGRESS/BLOCKED → éxito | `execution-orders.task3.spec.ts` | describe `comandos de registro en estado pre-inicio → 409 EXECUTION_ORDER_NOT_STARTED` (`:600-667`): 9 tests (`registerFieldWork|registerItemUsage|registerEvidence rechaza estado CREATED/ASSIGNED/EN_ROUTE`), cada uno con cero persistencia; describe `comandos de registro con ejecución iniciada → éxito sin mutar la OT` (`:669-746`): 6 tests (3 comandos × IN_PROGRESS/BLOCKED) | ✅ Verde |
| **CA-3** — sin mutación de `status`/`startedAt` por registro; `start()` única vía a IN_PROGRESS y emite `ExecutionOrderStartedV1` | `execution-orders.task3.spec.ts` | éxitos de `:669-746` afirman `persisted[0] = { status, startedAt: null }` y eventos correctos (item-usage solo `InventoryConsumptionRequestedV1`; field-work/evidence sin eventos); `start() es la única vía a IN_PROGRESS: emite ExecutionOrderStartedV1 y registra la actividad START sin pasar por la guarda` (`:748-767`). Ningún test permite que un comando de registro emita `ExecutionOrderStartedV1` ni mute `status`/`startedAt` | ✅ Verde |
| **CA-4** — drawer pre-inicio sin inputs/botones de envío en bloques 3/4/5; hint por bloque; lista en lectura | `apps/portal/src/components/operations/ExecutionOrderDrawer.spec.tsx` + E2E | describe `Pre-inicio — bloques 3/4/5 en solo lectura con hint` (`:1339-1396`): `muestra hint por bloque y oculta los formularios de registro (CREATED/ASSIGNED/EN_ROUTE)` (sin `Registrar actividad`/`Registrar material`/`Adjuntar evidencia`, listas visibles), `mantiene los estados vacíos visibles junto al hint pre-inicio`, `no muestra los hints pre-inicio cuando la ejecución ya inició`; E2E `operaciones pre-inicio — bloques 3/4/5 en solo lectura con hints y única CTA de inicio` (`e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts:887`) | ✅ Verde (unit + E2E) |
| **CA-5** — checklist atenuado con hint en CREATED/ASSIGNED/EN_ROUTE (incluido EN_ROUTE tras corrección de `hasStarted`) | `ExecutionOrderDrawer.spec.tsx` | describe `Checklist gate` → `deshabilita el checklist antes de iniciar (CREATED/ASSIGNED/EN_ROUTE)` (`:1280-1299`, it.each incluye EN_ROUTE); `activa el checklist cuando la ejecución ya inició` (`:1301`); `permite ver el checklist en estado terminal sin el gate` (`:1322`). Normalización en `ExecutionOrderDrawer.tsx:349-357` verificada en código | ✅ Verde |
| **CA-6** — convergencia ADR-068 en verde; sin divergencia inducible por registro | `apps/api/src/modules/tasks/tests/execution-order-projection-convergence.service.spec.ts` | `OT pre-inicio (ASSIGNED) sin iniciar mantiene proyecciones SCHEDULED sin divergencia` (`:253-272`); suite completa 10/10 | ✅ Verde |
| **CA-7** — lint, typecheck y suites tasks/portal en verde; sin cambio de forma en `@iwana/shared` | Corridas §9.2 | typecheck 8/8, lint 8/8 (0 errores); suites en verde; partes congeladas del contrato intactas (§9.3, H3) | ✅ Verde |

### 9.2 Totales de corrida

| Suite | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api exec jest src/modules/tasks --silent` | 22 suites, **501/501 tests** en verde (27,2 s) |
| `pnpm --filter @iwana/portal exec jest src/components/operations --silent` | 6 suites, **160/160 tests** en verde (40,4 s) |
| `pnpm typecheck` | 8/8 tasks successful, 0 errores |
| `pnpm lint` | 8/8 tasks successful, 0 errores, 7 warnings preexistentes (archivos no tocados por la remediación) |
| E2E portal (`portal-field-flow-ticket-ot-inventory.spec.ts`, config `playwright.portal.config.ts`) | 3 tests: **2 passed** (flujo crítico operaciones + pre-inicio nuevo), 1 failed (H2, ambiental) |

### 9.3 Hallazgos

- **H1 — [Corregido en sesión · severidad media] Fixture E2E fijaba la distribución vieja de `allowedActions`.** `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts:144-150` declaraba `['START','REGISTER_ACTIVITY','REGISTER_ITEM_USAGE','REGISTER_EVIDENCE','CLOSE']` para una OT `ASSIGNED`, y el handler del mock de `start` no actualizaba `allowedActions`. El flujo crítico solo pasaba porque el mock conservaba `REGISTER_*` tras iniciar. Corregido por QA a la matriz §4.1 del prompt: fixture pre-inicio `['START']` y handler de start con distribución IN_PROGRESS (`REGISTER_*` + `BLOCK` + `CLOSE`). Con el fixture obsoleto, el drawer renderizaba los formularios de bloques 3/4/5 **deshabilitados** junto a los hints (defensa en profundidad por `isPreStart`); con el contrato real eso no ocurre (los formularios se desmontan al estrecharse `allowedActions`). El flujo crítico y el nuevo test pre-inicio pasan con el fixture corregido. Cambio test-only; sin impacto en código productivo.
- **H2 — [Abierto · ambiental · severidad baja · preexistente] Test E2E `agenda abre el resumen de la OT…` falla de forma consistente** en esta sesión: la config reutiliza el dev server activo en 3002 (Turbopack, badge "Cache disabled"), mientras la suite está diseñada para servidor webpack (`playwright.portal.config.ts`, comentario del `webServer`; primera compilación de rutas excede el timeout del test). Fallaba antes de cualquier cambio de QA, no toca el drawer ni comandos de registro → no atribuible a B1/B2/B3. Recomendación: ejecutar la suite portal E2E en CI con servidor webpack fresco (o `PW_FORCE_FRESH_SERVER=1` con el puerto libre) y re-verificar ese test ahí.
- **H3 — Contrato: sin cambio de forma en las partes congeladas.** El diff de `packages/shared/src/contracts/operations/execution-orders.ts` vs HEAD existe pero es del **track paralelo "plantilla aplicada"** (`requirements?` en `ExecutionOrderTemplateReference`, `UpdateActivityCommand`, `ExecutionOrderTemplateSummary` — ver `INFORME-MOD11-OT-PLANTILLA-APLICADA-FIX-v1.0.md`): enum `ExecutionOrderAllowedAction`, DTOs `Register*` y `allowedActions` intactos (las únicas menciones en el diff son líneas de contexto de hunks). `openapi/tasks-execution-orders.v1.json` suma exactamente `EXECUTION_ORDER_NOT_STARTED` al enum de `ExecutionOrderError.code` y la descripción del `Conflict` (§3.5 de este informe); el bloque `requirements` del mismo JSON corresponde igualmente al track paralelo.

### 9.4 Estado E2E

Ejecutado (stack ya levantado; E2E autocontenido con mocks de ruta y sesión sembrada — no depende del API real):

- **`escenario operaciones — cierre OT con firma e inventario en sitio cliente`** (flujo crítico, OT `ASSIGNED` → "Iniciar ejecución" → registro → cierre): **PASS** con el fixture corregido.
- **`operaciones pre-inicio — bloques 3/4/5 en solo lectura con hints y única CTA de inicio`** (nuevo, caso original del prompt §7.2): **PASS** — OT `ASSIGNED` abierta por `?executionOrderId=…`: sin `Registrar actividad`/`Registrar material`/`Adjuntar evidencia`, tres hints visibles, hint del checklist, `Iniciar ejecución` como CTA.
- **`agenda abre el resumen de la OT…`**: FAIL ambiental (H2).

### 9.5 Veredicto

**GO** para el criterio de salida de fase: CA-1 a CA-7 cubiertos por tests en verde en sus niveles unit/integración, E2E del caso original en verde, sin defecto crítico abierto. Condicionado a: H1 ya resuelto en sesión (incluido en los totales); H2 es deuda ambiental preexistente fuera del alcance de esta remediación — se recomienda seguimiento en CI, no bloquea.
