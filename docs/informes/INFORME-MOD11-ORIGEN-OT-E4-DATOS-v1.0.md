# INFORME — MOD11 Origen de OT · E4, parte de datos

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-SR-FULL (`sr-backend`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md`
- **Trazabilidad:** spec `docs/specs/2026-09-14-mod11-origen-ot-design.md` §3.5, §3.7, CA-12 y CA-13; ADR-091 §D5
- **Contrato congelado:** `packages/shared/src/contracts/operations/execution-orders.ts` v1.4, sin cambios
- **DDL:** ninguno escrito ni propuesto

**Dictamen: GO del alcance de datos, con dos salvedades que no son defectos del código y que requieren decisión del orquestador (§7).** Las tres condiciones de GO del §3 del encargo están demostradas con evidencia; ninguna condición de NO-GO se da.

1. El orden `planned_window_start_at DESC NULLS FIRST, id DESC` lo sirve el índice `idx_execution_orders_tenant_window_start` sin `Sort` (EXPLAIN real, §1).
2. El inventario de lectores de `schedule_event_id` está completo y cada uno declara su conducta ante NULL, con test (§3).
3. La paginación es estable contra Postgres real: 5 de 5 tests verdes, sin omitidos (§2).

Salvedades: (a) `pnpm typecheck` global falla solo en `apps/portal`, por trabajo ajeno en curso (§4); (b) mi corrida de integración dejó la base de desarrollo `tenant_iwana` con deriva de esquema respecto de `typeorm_migrations` (§6). Esta última la causó la ejecución del test tal como está escrito y no pude repararla (§6).

## 1. EXPLAIN contra Postgres real (CA-12, orden)

**Entorno.** PostgreSQL 18.3 del contenedor `iwana_postgres_dev` (127.0.0.1:5433, base `dbiw`), la base de desarrollo del proyecto. Se usó la tabla real `tenant_iwana.execution_orders`, con el esquema y los índices reales (migración 130 aplicada). Parámetros por defecto del servidor: `enable_seqscan=on`, `enable_sort=on`, `random_page_cost=4`, `default_statistics_target=100`.

**Siembra.** Dentro de una transacción `BEGIN ... ROLLBACK`: 200 000 filas del tenant real (30 % con `planned_window_start_at` NULL, 2 % anuladas) más 40 000 de otro tenant, luego `ANALYZE`. Total 240 002 filas, 60 000 sin ventana. Al terminar, `ROLLBACK`: conteo final 2 (las dos filas reales) y 0 filas con el prefijo de siembra. No se usó `SET enable_seqscan` ni ningún otro `SET` de planner. El único `SET LOCAL` fue `search_path`.

**SQL.** La consulta es la que genera `list()` (obtenida con `getQueryAndParameters()` del query builder real con `skip/take` y sin joins, así que es un `LIMIT/OFFSET` directo), con `tenant_id` e `is_annulled = false`, ordenada por `planned_window_start_at DESC NULLS FIRST, id DESC`. En la consulta A van las 37 columnas proyectadas; en B, B2 y D solo `id` y `planned_window_start_at`, para aislar el plan de ordenación.

### A. Página 1 (`LIMIT 20 OFFSET 0`)

```
 Limit  (cost=0.42..3.50 rows=20 width=1907) (actual time=0.023..0.052 rows=20.00 loops=1)
   Buffers: shared hit=24
   ->  Index Scan using idx_execution_orders_tenant_window_start on execution_orders "order"  (cost=0.42..30224.21 rows=196576 width=1907) (actual time=0.022..0.050 rows=20.00 loops=1)
         Index Cond: (tenant_id = '6bc66d88-d0db-4aaf-ae00-0d019cd00fff'::uuid)
         Filter: (NOT is_annulled)
         Rows Removed by Filter: 1
         Index Searches: 1
         Buffers: shared hit=24
 Planning:
   Buffers: shared hit=179
 Planning Time: 0.796 ms
 Execution Time: 0.097 ms
```

### B. Página profunda dentro del bloque de NULL (`LIMIT 20 OFFSET 40000`)

```
 Limit  (cost=6150.47..6153.54 rows=20 width=24) (actual time=18.142..18.152 rows=20.00 loops=1)
   Buffers: shared hit=43256
   ->  Index Scan using idx_execution_orders_tenant_window_start on execution_orders "order"  (cost=0.42..30224.21 rows=196576 width=24) (actual time=0.014..17.290 rows=40020.00 loops=1)
         Index Cond: (tenant_id = '6bc66d88-d0db-4aaf-ae00-0d019cd00fff'::uuid)
         Filter: (NOT is_annulled)
         Rows Removed by Filter: 2834
         Index Searches: 1
         Buffers: shared hit=43256
 Planning Time: 0.052 ms
 Execution Time: 18.200 ms
```

### B2. Página que cruza la frontera NULL a con ventana (`LIMIT 20 OFFSET 55990`)

Esta corrida se hizo en el otro tenant de desarrollo, `tenant_test_s2_live` (tabla vacía, misma forma e índices), con la misma siembra de 240 000 filas bajo `BEGIN ... ROLLBACK` (0 filas de residuo). Hubo que usarlo porque `tenant_iwana` quedó con NOT NULL tras mi corrida de integración (§6) y ya no admite sembrar OT sin ventana. La página devuelve 10 filas NULL y 10 con ventana, verificado.

```
 Limit  (cost=18411.29..18417.86 rows=20 width=24) (actual time=100.451..100.466 rows=20.00 loops=1)
   Buffers: shared hit=116801 read=5381 dirtied=266 written=3484
   ->  Index Scan using idx_execution_orders_tenant_window_start on execution_orders "order"  (cost=0.42..64799.83 rows=197064 width=24) (actual time=0.038..99.091 rows=56010.00 loops=1)
         Index Cond: (tenant_id = '6bc66d88-d0db-4aaf-ae00-0d019cd00fff'::uuid)
         Filter: (NOT is_annulled)
         Rows Removed by Filter: 4000
         Index Searches: 1
         Buffers: shared hit=116801 read=5381 dirtied=266 written=3484
 Planning Time: 0.379 ms
 Execution Time: 100.497 ms
```

### D. Control negativo: `NULLS LAST` (no coincide con el índice)

Demuestra que la prueba discrimina: con el orden contrario, el planner sí necesita `Sort`. Aquí se omiten las líneas de `Buffers`, `Workers` y `Planning` por brevedad; A, B y B2 van completos.

```
 Limit  (cost=9282.55..9284.88 rows=20 width=24) (actual time=15.811..20.934 rows=20.00 loops=1)
   ->  Gather Merge  (cost=9282.55..32177.18 rows=196577 width=24) (actual time=15.809..20.929 rows=20.00 loops=1)
         ->  Sort  (cost=8282.53..8487.29 rows=81907 width=24) (actual time=12.487..12.489 rows=17.00 loops=3)
               Sort Key: planned_window_start_at DESC NULLS LAST, id DESC
               Sort Method: top-N heapsort  Memory: 26kB
               ->  Parallel Seq Scan on execution_orders "order"  (cost=0.00..6103.01 rows=81907 width=24) (actual time=0.011..9.071 rows=65334.00 loops=3)
                     Filter: ((NOT is_annulled) AND (tenant_id = '6bc66d88-d0db-4aaf-ae00-0d019cd00fff'::uuid))
 Execution Time: 21.080 ms
```

### Lectura

- **A, B y B2 usan el índice 130 sin nodo `Sort`, con el planner por defecto.** El índice se define `(tenant_id, planned_window_start_at DESC, id DESC)`. En PostgreSQL `DESC` implica `NULLS FIRST`, de modo que la cláusula explícita `NULLS FIRST` coincide con el orden físico del índice. Eso implica que el cambio en `list()` fija por escrito una semántica que ya era la efectiva (no cambia el orden devuelto). Lo nuevo es que ahora está declarada, y que D confirma que `NULLS LAST` sí habría degradado el plan.
- La misma corrida se repitió en `tenant_test_s2_live` con la siembra completa (A a F) y dio los mismos planes (índice, sin `Sort` en A y B; `Sort` en D).
- **Observaciones fuera de alcance, sin acción.** (1) La consulta E (rol restringido, filtro por técnico/pool) recorre el índice completo (200 000 filas filtradas, 67 a 78 ms) cuando el filtro no encuentra coincidencias: no es sensible a `NULLS FIRST` y es anterior a este cambio. (2) El coste de `OFFSET` es lineal (43 256 buffers en B). (3) Con filtro `organizationSiteId` (F) el planner elige el índice por sitio más un `Sort` pequeño, que es lo esperado por la selectividad. (4) Los tiempos no son un benchmark: es un contenedor local con datos sintéticos.

Si el índice no hubiera servido el orden, el encargo pedía `[BLOQUEO]` sin DDL. No es el caso: **sin `[BLOQUEO]`**.

## 2. Test de integración de paginación contra Postgres real (CA-12)

Comando: `E2E_TENANT_SLUG=iwana pnpm --filter api test:integration -- --runTestsByPath src/modules/tasks/tests/execution-orders.dispatch.postgres.integration.spec.ts --verbose`. Sonda del globalSetup: "PostgreSQL alcanzable en 127.0.0.1:5433/dbiw".

```
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
  √ H1 central contra base: el rechazo no inserta y el origen sigue libre
  √ CA-05: el despacho persiste CREATED sin evento, ventana ni técnico, con sitio
  √ E4 CA-12: pagina sin huecos ni duplicados al mezclar OTs con y sin ventana (90 ms)
  √ CA-07: assign() sobre la OT despachada persiste ASSIGNED + técnico en base
  √ Guarda compartida: dos despachos del mismo origen dejan una sola OT
```

Cero omitidos. El test E4 crea 3 OT con ventana (dos con la misma hora de inicio, para forzar el desempate por `id`) y 3 sin ventana, pagina con `limit: 2` y compara la concatenación de páginas contra `ORDER BY planned_window_start_at DESC NULLS FIRST, id DESC` ejecutado directo en SQL: igualdad exacta y 6 ids distintos.

Límite: el test verifica la paginación sobre 6 filas, no sobre volumen. El volumen y el índice los cubre el EXPLAIN del §1. Tampoco ejercitó la frontera NULL a con ventana con `NULLS LAST` como contraste (no hice la mutación contra la base de integración, ver §6).

## 3. Inventario de lectores de `schedule_event_id` (CA-13)

Método: búsqueda exhaustiva de `schedule_event_id` y `scheduleEventId` en `apps/worker/src` y `apps/api/src/modules/tasks`, más `packages/shared/src` (los payloads de eventos operativos no portan el campo) y una búsqueda de otros módulos que lean `execution_orders` (`wfm`, `assurance`, `organization`, `inventory`, `health`): ninguno lee `schedule_event_id` de la OT; WFM solo lo escribe a través del puerto `ExecutionOrderSchedulingPort`.

| # | Lector | Archivo:línea | Conducta declarada ante NULL | Test que la prueba |
| --- | --- | --- | --- | --- |
| 1 | Consumidor de eventos: lectura de la OT antes de proyectar `Started`, `Blocked`, `Closed`, `FollowUpRequired` | `apps/worker/src/processors/execution-order-events.processor.ts:167-193` | Se lee el vínculo una sola vez. NULL se omite de forma explícita y se registra `schedule_projection_skipped` (debug, clave=valor). OT inexistente: `UnrecoverableError`, rollback, ninguna proyección | `it.each` "omite ScheduleEvent explícitamente ante schedule_event_id NULL..." (4 tipos de evento, incluye el log); "con schedule_event_id presente proyecta ScheduleEvent y no registra la omisión"; "OT inexistente al proyectar..." |
| 2 | `applyExecutionOrderStarted` | `...processor.ts:295` | NULL: no actualiza `schedule_events`; VisitRequest y Task sí convergen | el `it.each` anterior; caso con vínculo en los tests ADR-068 de la matriz |
| 3 | `applyExecutionOrderBlocked` | `...processor.ts:334` | ídem | ídem |
| 4 | `applyExecutionOrderClosed` | `...processor.ts:402` | ídem (los resultados EXECUTED/CANCELLED siguen proyectando VisitRequest y Task) | ídem |
| 5 | `applyExecutionOrderFollowUp` | `...processor.ts:443` | ídem | ídem |
| 6 | Resto de handlers: `Cancelled`, `Annulled`, `VisitScheduled`, `VisitWindowChanged`, `Inventory*` | `...processor.ts:~226-247` | No leen ni necesitan el campo (acusan recibo o son de otros dominios). El lookup solo corre para los 4 eventos de `SCHEDULE_PROJECTED_EXECUTION_EVENTS` | **Añadido:** `it.each` "ExecutionOrderCancelledV1 / ExecutionOrderAnnulledV1 no consulta schedule_event_id" |
| 7 | Relay del outbox | `apps/worker/src/services/execution-order-relay.service.ts` (sin referencias al campo) | **No lee el campo.** Solo mueve filas de `execution_order_outbox_events` a BullMQ; nunca consulta `execution_orders`; el payload del envelope no porta el vínculo. Conducta declarada en el docstring de la clase (**añadido**) | `execution-order-relay.service.spec.ts`: "retransmite el envelope del agregado sin consultar el vínculo de agenda" (aserta que ninguna consulta contiene `schedule_event_id` ni `execution_orders`) |
| 8 | Otros procesadores/servicios del worker: `execution-order-dlq`, `execution-order-tombstone`, `execution-order-relay.processor`, `expired-schedule-events` | sin referencias al campo (búsqueda) | No lectores. `expired-schedule-events` opera sobre `schedule_events` sin unir `execution_orders` | no aplica (no hay lectura) |
| 9 | Reconciliador, `reconcileOrder` | `apps/api/src/modules/tasks/services/execution-order-projection-convergence.service.ts:291-312, 354-366` | NULL: no consulta `schedule_events`, `expectedScheduleStatus = null`, no cuenta como discrepancia; VisitRequest y Task se siguen comparando; el log marca `omitido` | `execution-order-projection-convergence.service.spec.ts`: "omite de forma explícita ScheduleEvent cuando schedule_event_id es NULL" |
| 10 | Reconciliador, conteo por tenant (`countTenantDiscrepancies`) | `...convergence.service.ts:507-541` | NULL: la columna de agenda no genera discrepancia; Visit y Task sí | "no cuenta como discrepancia una proyección de agenda no aplicable a una OT sin evento" |
| 11 | `TasksService.linkScheduleEvent` | `apps/api/src/modules/tasks/services/tasks.service.ts:457` | Es el campo de la **Task**, no el de la OT. NULL es el estado previo al primer vínculo y se permite establecerlo; uno distinto ya vinculado devuelve 409 (no sobrescribe en silencio) | "links a task with no prior schedule event..." y "rejects schedule link when task already has a different event linked" |
| 12 | Guarda de idempotencia por evento, `createFromScheduling` | `execution-orders.service.ts:971-980` | `if (input.scheduleEventId)`: sin evento no hay idempotencia por evento; la deduplicación la hace la guarda de origen | `execution-orders.dispatch.spec.ts` (CA-05/CA-06); integración "CA-05: el despacho persiste CREATED sin evento..." |
| 13 | Persistencia al crear | `execution-orders.service.ts:1018` | `scheduleEventId ?? null`: el nulo se persiste a propósito | integración CA-05 (lee la fila con SQL crudo) |
| 14 | `linkFromSchedulingWithManager` | `execution-orders.service.ts:1153-1188` | NULL: primer vínculo permitido. No-NULL: 409 `EXECUTION_ORDER_ALREADY_SCHEDULED` | `execution-orders.service.spec.ts`: "vincula una OT CREATED, la asigna..." (parte de `scheduleEventId: null`) y "rechaza una OT ya vinculada en vez de cambiar su evento en silencio" |
| 15 | `rescheduleFromSchedulingWithManager` | `execution-orders.service.ts:1254` | NULL: 409 `EXECUTION_ORDER_EVENT_MISMATCH` sin mutar ventana ni versión | "rechaza explícitamente reagendar una OT sin schedule_event_id" |
| 16 | `cancelFromScheduling` | `execution-orders.service.ts:1300` | NULL: 409 `EXECUTION_ORDER_EVENT_MISMATCH` | "rechaza explícitamente cancelar desde agenda una OT sin schedule_event_id" |
| 17 | Proyección de listado y detalle | `execution-orders.service.ts:3248`; `execution-orders.controller.ts:293` | `eventId: scheduleEventId ?? null` y `window: null` si falta ventana | `execution-orders.service-list.spec.ts`: "serializa explícitamente una OT sin evento ni ventana en la bandeja"; `controller.http.spec.ts`: "GET /:id con OT sin ventana responde 200 con schedule nulo" |
| 18 | UPDATE con `options.scheduling` | `execution-orders.service.ts:3675` | Solo escribe el valor ya validado en memoria; no ramifica por NULL | cubierto por 14 a 16 |

Resultado: **ningún lector queda sin declarar.** La rama de `execution-orders.service.ts` que asume un evento sin protegerlo no existe: las tres que lo comparan (14 a 16) tratan el NULL de forma explícita.

### Relay: decisión con evidencia

El relay **no lee `schedule_event_id`**: la búsqueda no encuentra el campo en el archivo, sus únicas consultas son sobre `public.tenants` y `execution_order_outbox_events`, y ningún payload de evento operativo en `packages/shared` lo lleva. La decisión es no añadirle lógica de NULL (sería código muerto) y dejar la conducta fijada de dos maneras: docstring de la clase y la aserción del spec sobre las consultas emitidas. El cambio previo en el spec ya tenía esa aserción; yo agregué el docstring.

### Nivel del log de omisión: debug se mantiene, con formato estructurado

Evaluación (skill de apoyo `observability-engineer`):

- **No sube a `warn` ni `error`:** NULL es el estado normal de toda OT despachada sin cita (ADR-091 §D5). Hasta 4 líneas por OT durante su ciclo de vida alertarían falsos positivos.
- **No sube a `log` (info):** volumen proporcional a las OT sin agenda, sin valor operativo por evento.
- **Por qué debug basta:** el logger por defecto de Nest (`NestFactory.create(WorkerModule)` en `main.ts`, sin `logger` configurado) emite `debug`, y el worker no tiene configuración de niveles que lo silencie. Si un despliegue lo apagara, la omisión dejaría de verse pero no deja de estar declarada ni probada.
- **Lo que sí faltaba era correlación:** el mensaje anterior no traía el evento ni el tipo. Ahora es `schedule_projection_skipped reason=schedule_event_id_null event=<eventId> type=<eventType> ot=<aggregateId> tenant=<tenantId>`: clave estable, sin PII (solo IDs), buscable. Un test fija el formato.
- **Métrica:** no se añadió. El worker solo tiene telemetría en el relay y no hay infraestructura de contadores para el consumidor. Si el CTO la quisiera, es una decisión de plataforma, no de este encargo.

## 4. Gates (en frío)

| Gate | Resultado |
| --- | --- |
| `pnpm typecheck --force` (Cached: 0) | **Rojo global, solo por `@iwana/portal`.** `api`, `worker`, `db`, `shared`, `storage`, `ui`, `web`, `portal-b0-browser`: verdes (con `--continue`: 8 de 9 tareas). El portal falla con errores TS2724/TS7006 (`execution-order-console-types.ts`, `ExecutionOrderMomentContainer.tsx`) y, en la segunda corrida, TS2322 en `use-execution-order-console.spec.ts`: el conjunto de errores cambió entre corridas, es trabajo ajeno en curso en archivos sin commit. Fuera de alcance y no tocado |
| jest `tasks` (`jest --no-cache src/modules/tasks`) | 35 de 35 suites, **717 tests** (umbral ≥ 712) |
| jest `wfm` (`jest --no-cache src/modules/wfm`) | 19 de 19 suites, **242 tests** (umbral ≥ 242) |
| jest worker (`jest --no-cache`) | 15 de 15 suites, **117 tests** (113 previos + 4 míos) |
| eslint y prettier de los 3 archivos que toqué | sin hallazgos |
| integración de paginación (§2) | 5 de 5 |

`--no-cache` de jest evita la caché de transformación de jest; `typecheck` se corrió con `--force` de turbo (`Cached: 0 cached`).

## 5. Cambios de esta sesión

Hay trabajo previo sin commit en el árbol, que audité y no rehice: `NULLS FIRST` en `list()`, el manejo de NULL en convergencia, `tasks.service.ts`, `execution-orders.service.ts` y el worker, y el test de paginación. Solo yo modifiqué tres archivos de código:

- `apps/worker/src/processors/execution-order-events.processor.ts`: el log de omisión pasa a clave=valor correlacionable (§3).
- `apps/worker/src/processors/execution-order-events.processor.spec.ts`: +4 tests (log de omisión, camino con vínculo sin log de omisión, OT inexistente, `Cancelled`/`Annulled` sin lookup). Se normalizó a LF con prettier: el archivo tenía finales de línea mezclados.
- `apps/worker/src/services/execution-order-relay.service.ts`: solo docstring (sin cambio de comportamiento).

No toqué `apps/portal` ni `apps/portal-b0-browser`.

## 6. Verdad sobre lo que no pude ejecutar o dejé alterado

**Deriva de esquema en `tenant_iwana` (dev), causada por mi corrida de integración.** El spec `execution-orders.dispatch.postgres.integration.spec.ts` aplica la migración 135 (`up`) en `beforeAll` y su `down` en `afterAll`, bajo la premisa de que el tenant de integración "conserva el esquema pre-E1". Esa premisa está desfasada: antes de mi corrida `tenant_iwana` ya estaba en estado post-135 (lo capturé con `\d`: `schedule_event_id` y las ventanas nulables, índice parcial `uq_execution_orders_tenant_schedule_event ... WHERE schedule_event_id IS NOT NULL`, e `uq_execution_orders_active_origin_unique`), y `tenant_iwana.typeorm_migrations` registra `ExecutionOrderOriginIdentity1350000000000`. El `down` de `afterAll` lo revirtió. Estado actual verificado: `schedule_event_id` NOT NULL, índice único no parcial y sin `uq_execution_orders_active_origin_unique`, mientras `typeorm_migrations` sigue diciendo "aplicada". Las 2 OT reales no se tocaron.

Intenté reaplicar la `up` de la 135 (idempotente, la misma que ejecuta el test) con un script puntual y **el sistema de permisos lo denegó**. No intenté otra vía. Consecuencias hasta que se repare: el despacho de OT sin cita contra esa base falla por NOT NULL, y el test de integración sigue pasando porque su propio `beforeAll` vuelve a aplicar la 135. Reparación sugerida, a decisión del dueño de la base: reaplicar la `up` de la 135 sobre `tenant_iwana`. A mediano plazo, el spec debería respetar el estado previo del tenant (o usar un schema aislado, como el spec de la 135) en lugar de revertir incondicionalmente. Es un hallazgo de infraestructura de pruebas, fuera del alcance de este encargo.

Otros límites:

- No hice prueba de mutación del test de paginación contra la base (cambiar a `NULLS LAST` y verlo fallar) para no volver a mover el esquema de desarrollo. La discriminación del orden la respalda el control D del EXPLAIN y la comparación directa contra SQL del test.
- La verificación de B2 se hizo en `tenant_test_s2_live` y no en `tenant_iwana` (causa arriba).
- Los planes de PostgreSQL son los de la versión 18.3 con datos sintéticos de 240 000 filas; no se midió con el volumen ni la distribución de producción.
- Al empezar encontré un contenedor ajeno en marcha, `mod11-e4-postgres-20261005` (puerto 55433, tenant `tenant_mod11_e4`, tabla vacía). No lo usé ni lo modifiqué.
- El conteo de 117 en worker no incluye tests de integración del worker (`test:integration` del worker no se corrió: no estaba en el alcance).

## 7. Decisiones que quedan al orquestador

1. Autorizar la reparación de `tenant_iwana` (reaplicar la 135) o decidir otra vía, y si se corrige el spec de integración para que no revierta migraciones ya aplicadas.
2. Aceptar el GO de datos con el `pnpm typecheck` global en rojo por el portal, o condicionar el cierre a que el trabajo en curso de portal quede verde.
