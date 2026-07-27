# ADR-068: Sincronizacion de OT de ejecucion y proyecciones operativas

**Version:** 1.0  
**Estado:** Aprobado  
**Aprobado por:** CTO (confirmación explícita del 2026-07-27)  
**Fecha:** 2026-07-27  
**Autor:** AI-EM-ARCH  
**Modulos:** MOD11 Ejecucion Operativa / MOD09 Programacion / MOD12 Inventario / Media-Assets transversal / Auditoria transversal  
**Decisiones antecedentes:** `docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md`; `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md` (aprobado)  
**Spec funcional:** `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-coordinador-design.md`  
**Contrato API:** `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md`

---

## Contexto

ADR-047 asigna a MOD09 la agenda y a MOD11 la OT enriquecida. La implementacion actual mantiene, ademas, una `WorkOrder` ligera en WFM y refleja el trabajo en `ScheduleEvent`, `VisitRequest`, `Task` y `ExecutionOrder`. El cierre de una instalacion puede dejar esas representaciones con estados incompatibles y hoy existen accesos directos entre servicios de MOD09 y MOD11.

El consumo de materiales agrega una segunda frontera: ADR-048 asigna a MOD12 el movimiento y la custodia de inventario y establece que MOD11 solicita el movimiento y conserva su referencia. Esta decisión mantiene ese ownership, pero sustituye para la nueva OT la invocación síncrona por una coreografía outbox idempotente. Una transaccion compartida entre repositorios de modulos distintos trasladaria el acoplamiento a la persistencia y no resolveria reintentos ni recuperacion.

La solucion debe preservar:

- modulith con boundaries explicitos;
- aislamiento PostgreSQL por schema;
- consistencia operativa recuperable;
- idempotencia de comandos sensibles;
- auditoria sin PII innecesaria;
- compatibilidad temporal con la `WorkOrder` ligera.

## Decision

1. `ExecutionOrder` de MOD11 es la unica fuente canonica del trabajo ejecutado, sus actividades, evidencias, consumos, resultado y cierre.
2. `ScheduleEvent`, `VisitRequest`, `Task` y la `WorkOrder` ligera son proyecciones o contextos vinculados; no pueden decidir el resultado tecnico de la OT.
3. Las mutaciones originadas en Agenda se limitan a coordinacion: asignar/reasignar, programar/reprogramar, cancelar bajo politica y abrir la OT. Iniciar, registrar y cerrar la ejecucion se realizan contra MOD11 y requieren permiso operativo.
4. MOD09 publica por outbox el compromiso de visita y sus cambios. MOD11 crea o ajusta la OT de forma idempotente; MOD09 no importa `ExecutionOrdersService` ni entidades/repositorios de MOD11.
5. MOD11 publica eventos de dominio tenant-aware mediante outbox persistente en la misma transaccion que cambia la OT. Los consumidores actualizan sus propias proyecciones de manera idempotente.
6. MOD11 solicita consumo/devolucion durante la ejecución mediante `InventoryConsumptionRequestedV1`; MOD12 confirma o rechaza. `ExecutionOrderClosedV1` no ordena movimientos. MOD11 conserva referencias confirmadas y no comparte `EntityManager` con MOD12.
7. Cada mensaje contiene `eventId`, `tenantId`, `aggregateId`, `aggregateVersion`, `occurredAt`, `eventType`, `correlationId` y payload minimo sin PII. Los workers reciben el tenant explicitamente y ejecutan `SET LOCAL search_path` dentro de cada transaccion.
8. La entrega es al menos una vez. Cada consumidor registra `eventId` y version aplicada; duplicados se reconocen sin repetir efectos. Los errores pasan a reintento y, agotada la politica, a una cola de intervencion operativa.
9. Las lecturas de Agenda muestran el estado canonico de MOD11 o una proyeccion con version y fecha de sincronizacion. Si esta atrasada, la UI declara “Actualizacion pendiente” y bloquea decisiones terminales.
10. Los campos y evidencias de una OT terminal son inmutables. Confirmaciones/rechazos tardios de inventario se anexan como settlement tecnico append-only y actualizan una proyeccion de conciliacion; no reescriben resultado, cierre, actividad ni evidencia.
11. Una correccion crea una OT de seguimiento vinculada mediante `supersedesExecutionOrderId` o `followUpOfExecutionOrderId`; no reabre ni altera la evidencia original.
12. La `WorkOrder` ligera se conserva durante la transicion, deja de ser visible como segunda OT y se retira solo cuando telemetria y reconciliacion demuestren que no tiene consumidores activos.
13. Media/Assets (ADR-034/035) conserva el binario, metadata técnica, análisis y lifecycle; MOD11 conserva upload-intent y relación probatoria OT–asset. Auditoría recibe intents durables, pero no decide el resultado de dominio.

### Lifecycle de evidencia

- MOD11 autoriza la OT y crea un upload-intent tenant-aware con `intentId`; Media/Assets genera `mediaAssetId` y object key determinista.
- Media persiste el estado interno `QUARANTINED`, expuesto en el recibo público como `PENDING_ANALYSIS`, almacena el objeto privado y ejecuta análisis asíncrono. Solo `AVAILABLE` puede vincularse; `REJECTED` y `EXPIRED` no se sirven.
- La consulta del recibo `202` se realiza por el endpoint OT-scoped; no se expone un asset genérico sin reautorizar tenant, OT y evidencia.
- Media mantiene el estado de análisis; MOD11 guarda el vínculo lógico sin FK cross-schema. Un claim opaco evita reutilizar el mismo asset en otra relación probatoria.
- Las ventanas PostgreSQL↔MinIO se recuperan mediante object key idempotente, compensación y reconciliador de metadata/objeto/vínculo. Nunca se declara `AVAILABLE` si falta alguno de los controles exigidos.
- Los assets huérfanos se detectan por ausencia de claim al vencer el TTL aprobado, se soft-deletean con auditoría y se eliminan físicamente mediante job posterior.
- ADR-034 y ADR-035 muestran `Estado: Aprobado` pero conservan una sección “Pendiente de aprobación”. G1 debe confirmar la decisión humana y reconciliar esa metadata; ADR-068 no presume el resultado.

### Ownership de compromiso y asignacion

- MOD09 es owner de ventana, recurso planificado y compromiso de visita.
- MOD11 es owner del ejecutor efectivo y su autorización durante la ejecución.
- Al crear la OT, MOD11 copia como asignación inicial el recurso elegible comunicado por MOD09.
- Reprogramar o reasignar antes de iniciar actualiza la OT por evento idempotente.
- Una visita en ejecución no se reasigna silenciosamente: MOD09 solicita excepción y MOD11 acepta/rechaza según estado y permiso.
- Cancelar antes de iniciar cancela la OT; durante ejecución exige comando de excepción en MOD11; después del cierre genera seguimiento, nunca reapertura.

## Eventos minimos

| Evento | Owner | Consumidores esperados | Efecto |
| --- | --- | --- | --- |
| `VisitScheduledV1` | MOD09 | MOD11 | Crear una única OT por visita/sitio |
| `VisitWindowChangedV1` | MOD09 | MOD11 | Actualizar ventana antes de ejecución o abrir excepción |
| `VisitResourceChangedV1` | MOD09 | MOD11 | Actualizar recurso planificado antes de ejecución o abrir excepción |
| `VisitCancelledV1` | MOD09 | MOD11 | Cancelar si estado lo permite o registrar conflicto |
| `ExecutionOrderStartedV1` | MOD11 | MOD09 | Evento/solicitud/tarea pasan a ejecucion |
| `ExecutionOrderBlockedV1` | MOD11 | MOD09 | Mantener visita activa y mostrar alerta |
| `InventoryConsumptionRequestedV1` | MOD11 | MOD12 | Solicitar movimiento idempotente durante ejecución |
| `ExecutionOrderClosedV1` | MOD11 | MOD09, MOD10 | Proyectar resultado; no dispara inventario |
| `ExecutionOrderFollowUpRequiredV1` | MOD11 | MOD09, MOD10 | Crear necesidad de nueva visita sin reabrir la OT |
| `InventoryMovementConfirmedV1` | MOD12 | MOD11 | Anexar settlement y completar consistencia de consumo |
| `InventoryMovementRejectedV1` | MOD12 | MOD11 | Anexar rechazo y excepción; nunca falsear cierre material |

Los nombres definitivos, el envelope y los payloads discriminados se materializan como contrato compartido durante G3 y se congelan en G4 junto con el OpenAPI. G2 aprueba alcance UX/DS y no congela eventos. No se autoriza añadir un broker nuevo: se usa el baseline Redis/BullMQ y persistencia PostgreSQL.

## Matriz de convergencia

| Resultado canonico MOD11 | ScheduleEvent | VisitRequest | Task |
| --- | --- | --- | --- |
| En ejecucion | `IN_PROGRESS` | `IN_EXECUTION` | `IN_PROGRESS` |
| Bloqueada | `IN_PROGRESS` + alerta | `IN_EXECUTION` | `BLOCKED` |
| Ejecutada / con observaciones | `COMPLETED` | `CLOSED` | `RESOLVED` |
| Requiere seguimiento | `COMPLETED` | `REQUIRES_RESCHEDULE` | `PENDING_INTERNAL` |
| No ejecutada | `COMPLETED` | `REQUIRES_RESCHEDULE` | `READY` |
| Cancelada | `CANCELLED` | `CANCELLED` | `CANCELLED` |

Agregar estados a `VisitRequestStatus` requiere migracion tenant versionada y reversible. Mientras la migracion no este aplicada, el adaptador de compatibilidad no puede presentar `SCHEDULED` como equivalente a “trabajo terminado”.

Persistencia minima exigida:

- unicidad tenant-aware de una OT por `scheduleEventId`;
- version monotona para control optimista;
- outbox por schema tenant;
- inbox/registro de eventos procesados por consumidor;
- registro idempotente con hash de intención;
- tombstone idempotente no-PII con HMAC versionado después de expirar el recibo;
- settlement append-only para confirmaciones MOD12;
- upload-intent y vínculo OT–media en MOD11; estado de análisis y claim opaco en Media/Assets;
- estrategia expand/contract reversible para ampliar `VisitRequestStatus`.

### Relay outbox tenant-aware

- `apps/worker` opera el relay; no el request HTTP.
- El scanner enumera tenants activos desde el registro confiable del schema `public`.
- Por tenant abre transaccion, aplica `SET LOCAL search_path`, toma lotes con lease/lock y publica jobs con `tenantId` y `eventId`.
- La fila se marca publicada solo despues de enqueue exitoso. Si hay crash antes del enqueue queda pendiente; si ocurre despues de enqueue y antes del mark puede duplicarse, y el inbox lo neutraliza.
- Leases expirados vuelven a ser elegibles; no se borra el outbox hasta cumplir la retencion aprobada.
- El worker consumidor resuelve `schemaName` desde el registro confiable usando `tenantId`; nunca acepta schema desde payload externo.
- Retry, backoff, DLQ y re-drive preservan `eventId`/`correlationId`. El re-drive exige permiso operativo y auditoria.
- Las pruebas cubren crash-window commit→enqueue, enqueue→mark, duplicado, evento fuera de orden y tenant suspendido.

## Consecuencias

### Positivas

- Una sola verdad de ejecucion y cierre.
- Boundary MOD09/MOD11/MOD12 verificable.
- Reintentos y recuperacion sin duplicar consumos.
- Auditoria correlacionable y proyecciones reconciliables.
- Transicion gradual sin borrar de inmediato el legado.

### Costos y tradeoffs

- Se introduce consistencia eventual entre la OT y sus proyecciones.
- Se requieren outbox, consumidores idempotentes, reconciliador y observabilidad.
- Habra una etapa temporal con modelo legado oculto.
- Las consultas de Agenda deben comunicar retrasos de sincronizacion.

### Riesgos aceptados

- Una proyeccion puede quedar atrasada temporalmente; no puede habilitar una accion terminal durante ese lapso.
- El cierre tecnico puede quedar “pendiente de conciliacion de inventario”; el resultado no se pierde ni se duplica.

## Controles obligatorios

- Autorizacion por permiso y pertenencia/asignacion; conocer un UUID no concede acceso.
- Clave idempotente obligatoria para iniciar, registrar consumo, evidencias y cerrar.
- Evidencias con hash, tipo, actor, fecha y referencia de almacenamiento; nunca base64 en logs.
- DTOs minimizados por rol; entidades, direcciones y textos libres no se devuelven ni auditan en crudo.
- Idempotency key ligada a hash canonico de tenant, actor, operacion y payload; reutilización distinta produce `409`.
- Custodia de cuadrilla valida tipo, `responsibleRefId`, membresia y vigencia.
- Sin fallback que fabrique un movimiento de inventario; fallos MOD12→MOD11 quedan reconciliables.
- Pipeline verificable con rate limit por actor/tenant y TLS en el ingress efectivo.
- Metricas de lag, reintentos, dead letters, discrepancias de estado y conciliaciones.
- Pruebas multi-tenant negativas y de duplicacion/concurrencia.

## Alternativas descartadas

- **Transaccion unica cruzando repositorios de MOD09, MOD11 y MOD12:** rompe boundaries y no resuelve efectos asincronos.
- **Sincronizacion directa servicio-a-servicio sin outbox:** puede perder eventos despues del commit.
- **Mantener dos OT visibles y mutables:** perpetua la ambiguedad funcional.
- **Convertir el sistema en microservicios:** no es necesario ni pertenece al baseline.

## Aprobacion requerida

[ESCALACION AL CTO] Este ADR modifica el patron de integracion entre bounded contexts y la politica de seguridad/idempotencia de operaciones sensibles. Ningun agente puede implementar Fase 01 o posteriores hasta registrar su aprobacion y congelar el contrato correspondiente.

## Referencias

- `AGENTS.md`
- `docs/prds/Stack_Tecnologico.md`
- `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- `docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md`
- `docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md`
- `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`
- `docs/plans/2026-07-27-mod09-mod11-ot-instalacion-redesign.md`
