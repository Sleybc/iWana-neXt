# INFORME — MOD11 Origen de OT · E3: remediación de la auditoría

- **Versión:** 1.1
- **Fecha:** 2026-10-05
- **Agente:** AI-SR-FULL (`sr-backend`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-REMEDIACION-v1.0.md`
- **Informe superado:** `docs/informes/INFORME-MOD11-ORIGEN-OT-E3-v1.0.md`
- **Trazabilidad:** ADR-090 §D4; spec `docs/specs/2026-09-14-mod11-correccion-ot-design.md` §4.3 y CA-07; MOD11 Origen de OT E3
- **Contrato congelado:** `packages/shared/src/contracts/operations/execution-orders.ts` v1.4, sin cambios

**Estado: GO (G6 local).** La agenda rechaza vincular o mover la ventana de una OT iniciada. Los rechazos revierten la transacción de WFM y conservan el evento y la ventana anterior. CA-09, CA-10 y CA-11 siguen en verde.

## 1. Cambio de comportamiento

`linkFromSchedulingWithManager` ahora solo permite vincular órdenes en `CREATED`, `ASSIGNED` o `EN_ROUTE`. `rescheduleFromSchedulingWithManager` rechaza órdenes `IN_PROGRESS` y `BLOCKED`. Ambos rechazos usan `ConflictException`, código `EXECUTION_ORDER_IN_EXECUTION` y el mensaje: “Coordina con el técnico antes de modificar la agenda de una orden en curso.”

La guarda se ejecuta después de validar la terminalidad/anulación y antes de modificar la entidad o persistir. El manager sigue siendo el de la transacción iniciada por WFM; no se cambió el boundary entre módulos.

### OTs nacidas por agenda

Antes de esta remediación, una reprogramación de MOD09 no propagaba la ventana a ninguna OT enlazada: el evento se movía y la OT conservaba sus fechas. Ahora la nueva ventana se propaga a la OT enlazada mientras permanezca antes del inicio. Una OT `IN_PROGRESS` o `BLOCKED` rechaza el cambio y el rollback conserva ambas proyecciones.

## 2. Pruebas y gates

| Verificación | Resultado |
| --- | --- |
| Unitarias del servicio de OT | 81/81 PASS. TDD: los cuatro casos nuevos fallaron antes del cambio por aceptación de `IN_PROGRESS`/`BLOCKED`; pasaron tras añadir las guardas. |
| Jest `tasks`, forzado | 35 suites, 712/712 tests PASS; 4/4 tareas Turbo exitosas, `Cached: 0`. |
| Jest `wfm`, forzado | 19 suites, 242/242 tests PASS; 4/4 tareas Turbo exitosas, `Cached: 0`. |
| Integración MOD11/MOD09 en PostgreSQL real | 1 suite, 5/5 tests PASS. Incluye CA-09/10/11, rechazo de reprogramación en ambos estados y rollback del evento al intentar vincular una OT iniciada. |
| PostgreSQL de integración | Contenedor efímero PostgreSQL 18.3, DB vacía, tenant fixture aislado; 24 migraciones públicas y 131 tenant. Tras la suite: 0 OTs, 0 eventos, 0 logs de reprogramación, 0 transiciones y 0 eventos outbox. Contenedor `--rm` detenido y eliminado. |
| `pnpm typecheck` | 8/8 tareas exitosas. |
| `git diff --check` | Sin errores. |

Los tests de integración comparan los valores persistidos del evento y la OT contra su snapshot anterior al rechazo, y comprueban que no se añade un log de reprogramación. Para el vínculo, consultan la transacción confirmada y verifican cero eventos y la OT todavía sin `schedule_event_id` ni ventana.

## 3. T1 de corrección de OT

**Absorbido:** la propagación de la ventana planificada del evento MOD09 a la OT MOD11 ya vinculada, antes de iniciar la ejecución y en la misma transacción.

**Sigue pendiente de T1:**

- propagación de sitio y datos de ubicación;
- propagación del recurso/técnico asignado;
- emisión de `VisitWindowChangedV1` y la ruta/evento de cambios de recurso;
- reemplazo de los handlers no-op correspondientes del worker;
- reconciliador que detecte deriva de ventana, recurso o sitio.

La prueba de carrera P2 para dos primeros agendamientos y el índice único P3 sobre `schedule_events.execution_order_id` permanecen como deuda de E3 v1.0; esta remediación no cambia DDL.

## 4. Alcance y compatibilidad

Cambios limitados a las dos guardas y sus pruebas unitarias/de integración, más este informe. No se modificó el contrato compartido v1.4, no hubo migraciones ni cambios OpenAPI. CA-09 continúa rechazando el conflicto antes de vincular; CA-10 conserva una OT y el replay idempotente; CA-11 mantiene la propagación en una OT previa al inicio y la cancelación desde agenda.

**G6.5** (corrida Linux por SHA) y **G7** (despliegue) no son parte de esta sesión.
