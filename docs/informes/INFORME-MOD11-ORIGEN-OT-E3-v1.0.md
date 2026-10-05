# INFORME — MOD11 Origen de OT · E3: agendar una OT existente

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-SR-FULL (`sr-backend`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-v1.0.md`
- **Plan:** `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1
- **Spec:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` §§3.1, 3.4, 3.7; CA-09 a CA-11
- **ADRs:** ADR-091 §D4; ADR-068; ADR-090; ADR-076
- **Contrato congelado:** `packages/shared/src/contracts/operations/execution-orders.ts` v1.4 (sin cambios)

**Estado:** **GO.** CA-09, CA-10 y CA-11 pasan con Jest, verificación contra PostgreSQL real y typecheck. Sin DDL productivo.

---

## 1. Dictamen

MOD09 puede agendar una OT existente en `CREATED` sin abrir otro camino de escritura hacia las tablas de MOD11. El evento se crea únicamente después de que el conflicto de agenda haya pasado; después, el puerto tipado enlaza ambos registros en la misma transacción y el mismo `EntityManager`. La OT conserva su identidad y la guarda de origen de la migración 135 permanece intacta.

El reintento usa `executionOrderId`, que ya identifica la operación de E3, como clave natural. Un reintento exacto devuelve el evento existente después de volver a consultar conflictos. El mismo identificador con otro contenido no se considera replay: no omite el chequeo, no cambia el vínculo y no deja una segunda fila.

## 2. Mecanismo y límites de módulo

- Se reutiliza `ExecutionOrderSchedulingPort`, el puerto tipado existente entre WFM/MOD09 y Tasks/MOD11. No se introduce BullMQ: el evento, el chequeo de conflicto y el vínculo requieren resultado sincrónico y atomicidad en una transacción común.
- `CreateScheduleEventDto` y `CreateScheduleEventSchema` aceptan opcionalmente `executionOrderId`. La combinación con `workOrder` embebida se rechaza para impedir crear trabajo paralelo. La anotación Swagger describe el vínculo.
- `ScheduleEventsService.create()` corre primero `hasConflictWithManager()` dentro del `runInTenantSchema` actual. Si el chequeo encuentra conflicto, no inserta el evento ni llama al puerto MOD11.
- Si no hay conflicto, WFM crea el `ScheduleEvent` y llama `linkFromSchedulingWithManager()` con el mismo manager. MOD11 carga la OT por tenant con `pessimistic_write`, aplica sus guards y persiste el ID del evento, la ventana y, si corresponde, el técnico en el mismo commit.
- Una OT `CREATED` pasa a `ASSIGNED` al recibir técnico y registra su transición. Una OT ya asignada solo acepta el técnico coincidente. Las OT terminales o anuladas, los tipos/sedes incompatibles, la asignación de cuadrilla y los re-vínculos se rechazan con códigos de producto: `EXECUTION_ORDER_ANNULLED`, `EXECUTION_ORDER_ALREADY_SCHEDULED`, `EXECUTION_ORDER_WORK_TYPE_MISMATCH`, `EXECUTION_ORDER_SITE_MISMATCH`, `EXECUTION_ORDER_CREW_ASSIGNMENT_UNSUPPORTED` o `EXECUTION_ORDER_TECHNICIAN_MISMATCH`.
- `reschedule()` también ejecuta el chequeo con el manager transaccional, excluye únicamente el evento que se está moviendo y propaga la nueva ventana por el mismo puerto. La cancelación conserva el camino existente de ADR-068, incluido el asiento de transición y el outbox de MOD11.
- WFM no importa la entidad `ExecutionOrder`, no consulta ni escribe directamente tablas de MOD11. No se crea una segunda OT.

## 3. Reintentos e idempotencia

`executionOrderId` es la clave natural del acto E3: una OT solo puede adquirir un evento inicial. Para reconocer un replay, WFM busca en su propia tabla un evento vigente con ese ID y compara los campos persistidos de agenda (tipo, título, descripción, inicio/fin, técnico, sede organizacional, dirección, municipio, sector, coordenadas y referencias). La comparación refleja las representaciones de PostgreSQL: las coordenadas `numeric(10,7)` se comparan a escala 7 aunque TypeORM las devuelva como strings, y los UUID se normalizan a minúsculas porque PostgreSQL devuelve su forma canónica. Los campos de texto, incluido `ticketId`, conservan comparación exacta y sensible a mayúsculas. Si coinciden, vuelve a ejecutar el conflicto excluyendo solo ese evento y devuelve la misma fila. Cualquier otro evento solapado sigue causando rechazo.

Si el contenido difiere, no se excluye el evento existente. Cuando el nuevo rango está libre, el puerto MOD11 detecta que la OT ya está vinculada y responde `EXECUTION_ORDER_ALREADY_SCHEDULED`; el rollback de `runInTenantSchema` retira el evento candidato. La integración verifica el código de rechazo, conserva el ID del vínculo previo y confirma que sigue habiendo un solo evento y una OT para ese origen.

No se añade un header `Idempotency-Key`, una tabla de claves ni un cambio a `@iwana/shared`: el ID de la OT ya es una identidad durable y natural para esta operación. La concurrencia entre dos primeros intentos no se sometió a una prueba de carrera dedicada. La serialización se protege con el lock pesimista de la OT y el intento perdedor revierte toda su transacción; esa defensa se deriva del código y no se reporta como medición concurrente.

## 4. Evidencia de aceptación y gates

| Criterio / gate | Evidencia final |
| --- | --- |
| CA-09 por negación | PostgreSQL real: intento con el mismo técnico y una ventana ocupada devuelve `BadRequestException`; la OT sigue en `CREATED`, sin evento ni ventana. El conflicto se ejecuta antes de insertar y antes del puerto. |
| CA-10 | PostgreSQL real: después de agendar, el origen conserva una OT; `schedule_events` registra un solo evento enlazado. Un replay exacto devuelve el mismo ID. Payload distinto obtiene `EXECUTION_ORDER_ALREADY_SCHEDULED`, conserva el enlace previo y deja el conteo en uno. |
| CA-11 | PostgreSQL real: `reschedule()` persiste el nuevo intervalo en evento y OT; `cancel()` propaga `CANCELLED` a la OT. |
| PostgreSQL real | `schedule-events.execution-order.postgres.integration.spec.ts`: **1 suite, 1/1 test PASS**, sin skips. Corrida en Postgres 18.3 efímero, en loopback, con una DB vacía y tenant de fixture `test`; **24 migraciones públicas y 131 tenant** aplicadas antes del test. La repetición usa coordenadas con precisión superior a siete decimales y UUIDs uppercase; devuelve el evento previo y mantiene cardinalidad 1. Después del test, lectura de conteos: **0 OT, 0 eventos**. Contenedor `--rm` detenido al terminar. El tenant local `iwana` (2 OT y 2 eventos) se excluyó y no se modificó. |
| `pnpm typecheck` | **8/8 tareas exitosas**. |
| Jest `tasks` con Turbo forzado | `pnpm run test --filter=@iwana/api --force -- -- --runInBand --testPathPattern=modules/tasks` — **35 suites, 706/706 tests**, `Cached: 0` (4 tareas Turbo exitosas). Piso E2: 676. |
| Jest `wfm` con Turbo forzado | `pnpm run test --filter=@iwana/api --force -- -- --runInBand --testPathPattern=modules/wfm` — **19 suites, 242/242 tests**, `Cached: 0` (4 tareas Turbo exitosas). |
| Suite completa | `pnpm run test --force` terminó sola con exit 0: **10/10 tareas Turbo**, `Cached: 0`, 2m48.928s. API: 325 suites aprobadas y 4 omitidas por configuración existente; 4.107 tests aprobados y 15 omitidos. Web: 36 suites / 229 tests; portal: 271 suites / 2.504 tests aprobados y 1 omitido; worker: 15 / 108; shared: 10 / 122; database: 54 / 347; UI: 4 / 30. No hubo fallos. |
| Lint y diff | `pnpm --filter @iwana/api lint`: 0 errores y 7 warnings existentes en otros archivos. `git diff --check`: sin errores (Git mostró aviso de normalización CRLF→LF para el DTO). |

## 5. Cambios y compatibilidad

- `apps/api/src/modules/tasks/ports/execution-order-scheduling.port.ts`: tipos y operaciones de vínculo y reprogramación en el puerto existente.
- `apps/api/src/modules/tasks/services/execution-orders.service.ts`: guards, lock, persistencia versionada y transición al enlazar; propagación de ventana con validación de pertenencia al evento.
- `apps/api/src/modules/tasks/tests/execution-orders.service.spec.ts`: asignación/transition, rechazo del re-vínculo, terminalidad/anulación y propagación.
- `apps/api/src/modules/wfm/dto/create-schedule-event.dto.ts`: campo de entrada aditivo y validación de combinación incompatible.
- `apps/api/src/modules/wfm/services/schedule-events.service.ts`: conflicto sin bypass, creación/vínculo atómicos, replay idempotente con normalización para `numeric(10,7)` y UUID, conflicto y propagación en reprogramación.
- `apps/api/src/modules/wfm/tests/schedule-events.service.spec.ts`: conflicto antes de vincular, camino sin segunda OT y replay con coordenadas escaladas, UUIDs uppercase y texto exacto.
- `apps/api/src/modules/wfm/tests/schedule-events.execution-order.postgres.integration.spec.ts`: flujo vertical real de conflicto, vínculo, replay igual/distinto con coordenadas y UUIDs equivalentes, reprogramación, cancelación y cardinalidad.

No se cambió `execution-orders.ts` v1.4, no se añadió una dependencia, migración o índice, y no se tocaron E4/CA-13, T1 de corrección ni portal. La 135, su unicidad de origen y la unicidad de evento de la OT permanecen sin cambios.

## 6. Deuda por severidad

- **P2 — concurrencia del primer agendamiento:** no se agregó una prueba con dos solicitudes realmente simultáneas. El bloqueo pesimista de la OT y la transacción con rollback impiden que ambas vinculen, pero una prueba de carrera dedicada reforzaría ese límite.
- **P3 — relación 1:1 en la capa de datos:** `schedule_events.execution_order_id` no tiene índice único propio. La ruta protegida usa el puerto y lock de MOD11 para conservar un solo evento por OT; una escritura fuera de esa ruta eludiría esa regla. No se agrega DDL, porque no es imprescindible para la proyección E3 y el encargo congela el DDL salvo necesidad demostrada.
- **P3 — warnings globales de lint:** quedaron siete warnings preexistentes (promesa flotante y `any`) en `apps/api/src/main.ts`, auditoría, utilidades de tests, `execution-order-templates.controller.ts` y `tax-presets.seeder.ts`; ninguno está en archivos tocados por E3.

## 7. Cierre §6 — GO

CA-09 pasa por negación contra PostgreSQL real; CA-10 demuestra una OT y un evento; CA-11 verifica reprogramación y cancelación propagadas. El contrato v1.4 y las guardas existentes no cambiaron. Todos los gates solicitados terminaron con conteos reales y caché cero en Jest de `tasks`, `wfm` y suite completa.

**Dictamen: GO.** Sin `[BLOQUEO]`.
