# Preparación técnica — MOD11 Corrección de OT · T1

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Estado:** Propuesta para decisión; no es encargo ejecutable ni declara GO.
- **Responsable:** AI-SR-FULL (`sr-backend`)
- **Trazabilidad:** plan `docs/plans/2026-09-14-mod11-correccion-ot.md` v1.0; spec `docs/specs/2026-09-14-mod11-correccion-ot-design.md` v1.0; ADR-090 y ADR-068; E3 cerrado en `docs/informes/INFORME-MOD11-ORIGEN-OT-E3-v1.1.md`.
- **Precondición temporal:** lanzar T1 después del GO de E4-datos, como fija `PROMPT-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md`; E3 está cerrado y no se reabre.

## 1. Dictamen

T1 conserva el objetivo de CA-04 a CA-08, pero no está listo para codificar sin una decisión de AI-EM-ARCH sobre la relación entre el puerto síncrono y la coreografía de ADR-068, y sobre el comando que corrige una OT despachada aún no vinculada a agenda. El contrato compartido `execution-orders.ts` v1.4 sigue congelado.

La base aprobada para el caso agendado es el puerto tipado MOD09→MOD11 que recibe el `EntityManager` de la transacción de WFM. E3 ya usa ese puerto para propagar la ventana y demuestra rechazo visible y rollback de la agenda cuando la OT está en ejecución. La extensión debe mantener una sola ruta de escritura de los datos de MOD11, idempotencia por evento y un registro durable para replay; no debe crear un `PATCH` genérico de OT ni permitir que un worker sea un segundo escritor independiente.

**[CONSULTA a AI-EM-ARCH]** ADR-068 asigna a MOD09 la publicación outbox de cambios y a MOD11 su aplicación idempotente; CA-07 necesita rechazo sincrónico y rollback inmediato. El código no tiene outbox/relay de MOD09: el relay actual lee `execution_order_outbox_events`, propiedad de MOD11. Hace falta aprobar el mecanismo durable y el papel del worker antes de despachar T1. La opción recomendada está en §4; requiere confirmar que el evento de replay no introduce una segunda ruta de mutación.

## 2. Hechos vigentes y decisiones ya autorizadas

1. **Ownership para OT agendada.** MOD09 es dueño de ventana, recurso planificado, sitio y compromiso; MOD11 es dueño del estado y ejecución. La corrección de una OT agendada entra desde agenda. No se abre `PATCH` de OT. Fuentes: ADR-090 §D1; ADR-068 decisión 4 y sección “Ownership de compromiso y asignación”; spec §4.1.
2. **Boundary actual.** `apps/api/src/modules/tasks/ports/execution-order-scheduling.port.ts:25-48` declara el puerto tipado y los métodos `linkFromSchedulingWithManager` y `rescheduleFromSchedulingWithManager`. WFM llama al puerto sin importar la entidad ni el servicio de MOD11. E3 añadió al método de reagendamiento los guards de D4 y mantuvo la operación dentro de la transacción de `ScheduleEventsService` (`apps/api/src/modules/wfm/services/schedule-events.service.ts:599-672`).
3. **Guardia de ejecución y rollback.** E3 rechaza `IN_PROGRESS` y `BLOCKED`, y conserva evento y OT anteriores al abortar la transacción. El informe E3 §1–2 certifica esa ruta para `POST /wfm/events/:id/reschedule`; no cubre `PATCH /wfm/events/:id`.
4. **Tipo de trabajo inmutable.** ADR-090 §D2 y spec §4.2 prohíben cambiar `workType`; CA-08 exige respuesta que indique anular y recrear. El vínculo de E3 ya rechaza un desajuste, pero su texto actual solo dice que el tipo no coincide (`execution-orders.service.ts:1161-1165`).
5. **Despacho sin cita.** ADR-090 §D1, enmendado por ADR-091, dice que una OT no vinculada se corrige en el despacho, que es su origen. La ruta vigente `POST /tasks/execution-orders/dispatch` es de creación: no lleva `:id` y crea una OT sin evento ni ventana (`execution-orders.controller.ts:203-229`; `execution-orders.service.ts:830-897`). No existe una ruta de corrección para esa OT. “Entra por el despacho” requiere definir un comando, no repetir el POST de creación.
6. **Fuera de T1.** CA-15 y el reconciliador de deriva pertenecen a T3, plan de corrección §3. E3 v1.1 los enumera como pendientes, pero no los transfiere a T1. `ExecutionOrderProjectionConvergenceService.reconcileOrder()` compara estados de las proyecciones (`apps/api/src/modules/tasks/services/execution-order-projection-convergence.service.ts:285-370`); ampliar esa consulta es trabajo posterior de T3, no parte de esta remediación.

## 3. CA-04–CA-08 tras E3

| Criterio | Cubierto | Pendiente para T1 |
| --- | --- | --- |
| **CA-04 — ventana** | `POST /wfm/events/:id/reschedule` propaga ventana a la OT enlazada por el puerto síncrono. | `PATCH /wfm/events/:id` también acepta `scheduledStartAt`/`scheduledEndAt`, valida conflictos y actualiza el evento en `ScheduleEventsService.update()` (`:447-543`), pero no llama al puerto. Unificar la propagación con el reagendamiento o cerrar esa mutación de ventana. Probar ambos endpoints. |
| **CA-05 — sitio y datos descriptivos** | El vínculo E3 copia sitio, técnico y ventana inicial. | `update()` modifica sitio, dirección, municipio, sector, título y descripción solo en `ScheduleEvent` (`:510-540`). No propaga cambios posteriores. El campo `assignedUserId` requiere resolver su semántica frente a recurso planificado y técnico asignado. |
| **CA-06 — idempotencia** | E3 cubre replay exacto al crear/vincular el evento. | No hay idempotencia demostrada para una secuencia de cambios de agenda ni para replay de eventos de ventana/recurso. Acordar identidad y hash del evento/comando; mismos ID+payload son no-op; mismo ID con payload distinto devuelve conflicto; eventos duplicados y antiguos no vuelven a escribir ni incrementar versión. |
| **CA-07 — rechazo visible** | E3 rechaza y revierte el reagendamiento de OT `IN_PROGRESS`/`BLOCKED`; el vínculo inicial también tiene guardia. | Aplicar la misma regla a cambios de sitio, recurso y descripción desde las dos rutas de agenda y al comando de corrección del despacho. Verificar respuesta visible y rollback de todas las filas/logs/outbox. |
| **CA-08 — tipo de trabajo** | El DTO `UpdateScheduleEventDto` no incluye `type`/`workType` (`apps/api/src/modules/wfm/dto/update-schedule-event.dto.ts:6-27`); el vínculo rechaza mismatch. | Rechazo actual del vínculo no indica “anular y recrear”. El error de validación al enviar un campo no permitido puede ser genérico. Definir cómo dar el mensaje de producto sin convertir `type` en una modificación aceptada ni abrir un contrato engañoso. |

## 4. Mapeo de agenda a OT demostrado por el alta actual

El mapeo debe derivarse de las ramas existentes de creación en `ScheduleEventsService.create()` (`apps/api/src/modules/wfm/services/schedule-events.service.ts:364-386, 408-433`). No se debe inferir equivalencias nuevas por el parecido de los nombres.

| MOD09 al crear | MOD11 hoy | Regla propuesta para una actualización |
| --- | --- | --- |
| `organizationSiteId` | `organizationSiteId` | Propagar para la OT enlazada si la regla de alcance y su impacto sobre asignación quedan aprobados. |
| `assignedUserId` | `assignedTechnicianId` inicial | Mantener la vía aprobada de asignación. Aclarar si el recurso agenda puede ser cuadrilla; `VisitResourceChangedV1` admite `TECHNICIAN`/`CREW`, mientras el puerto E3 solo recibe `assignedTechnicianId`. |
| `scheduledStartAt` / `scheduledEndAt` | `plannedWindowStartAt` / `plannedWindowEndAt` | Ya implementado en reagendamiento E3; conectar también el PATCH que admite fechas. |
| `address`, `municipality`, `sector` | Campos homónimos de la OT | Propagar con actualización de nulos explícita, guardia D4 y evento/versionado acordados. |
| `title` | `customerDisplayLabel`; también `workSummary` en la rama sin `WorkOrder` | `title → customerDisplayLabel` está demostrado en ambas ramas de alta. **No** sobrescribir automáticamente `workSummary`: cuando hay `WorkOrder`, su `summary` es el valor inicial de MOD11. Decidir si una corrección de título también debe actualizar el resumen en esa rama. |
| `description` | `workInstructions` si no hay `WorkOrder`; fallback de instrucciones cuando existe | Preservar la semántica de `WorkOrder.notes ?? description`. El PATCH actual no edita `WorkOrder`; acordar si `description` debe actualizar instrucciones y cómo se evita pisar notas del trabajo. |
| `type` | `workType` | Inmutable después del alta. Rechazar con mensaje accionable; nunca incluirlo como campo editable de T1. |
| refs de agenda (`ticketId`, `subscriberId`, etc.) | Algunos se copian al alta | CA-05 no declara su corrección. Mantener fuera del alcance salvo decisión expresa y mapeo campo por campo. |

**[CONSULTA a producto/AI-EM-ARCH]** La alta prueba `title → customerDisplayLabel`; solo la rama sin `WorkOrder` prueba `title → workSummary`. No hay evidencia que permita cambiar `workSummary` o `workInstructions` de una OT existente sin distinguir el origen del valor actual. La decisión debe nombrar cada destino y el tratamiento de `null`; no inferir “título = cliente” como regla nueva ni sobrescribir un resumen de `WorkOrder`.

## 5. Mecanismo propuesto y límites de contrato

### 5.1 OT con evento de agenda

- Mantener `ExecutionOrderSchedulingPort` como único punto MOD09→MOD11. Ampliar su contrato interno con un método de actualización de snapshot, tipado y limitado a campos autorizados; no pasar entidades WFM ni usar SQL MOD09 contra `execution_orders`.
- `ScheduleEventsService.update()` y `.reschedule()` deben cargar/bloquear el evento dentro de `runInTenantSchema`, validar conflictos, y llamar al puerto con el mismo `EntityManager` y tenant autenticado. MOD11 vuelve a bloquear la OT, confirma `scheduleEventId`, no anulada/no terminal y estado preinicio, valida tipo/versiones y persiste mediante su servicio. Cualquier error aborta toda la transacción y mantiene evento, OT y logs sin cambios.
- Usar un `eventId`/`commandId` estable y hash canónico del snapshot. Registrar en outbox/inbox en la misma transacción que el cambio que hace de escritor. Replay exacto no cambia filas/versiones; mismo ID con contenido distinto responde conflicto; eventos atrasados no pisan una versión más nueva. No aceptar `tenantId` o schema desde el body: usar contexto verificado y `SET LOCAL search_path` existente.

### 5.2 Outbox, worker y replay

ADR-068 §Decision 4 y §Relay exige que MOD09 publique cambios por outbox y MOD11 los aplique idempotentemente. E3, en cambio, satisface la atomicidad y el rechazo sincrónico de CA-07 por puerto. La estrategia a decidir es:

1. MOD09 sigue siendo autor del snapshot/evento; el registro de outbox pertenece a MOD09 y se escribe en la transacción de agenda. No reutilizar `execution_order_outbox_events` como outbox de MOD09 ni permitir escrituras directas de MOD09 a tablas de MOD11.
2. El puerto síncrono valida/aplica el snapshot de MOD11 dentro de esa transacción para poder dar rechazo D4 y rollback inmediatamente. La entrega/replay posterior lleva el mismo `eventId`, fuente y snapshot; el consumidor reconoce la aplicación ya confirmada, registra inbox y solo repara si el mismo evento está pendiente de aplicación por una razón verificable. No debe existir una mutación alternativa con payload distinto.
3. El worker conserva dedupe por `eventId` y orden por versión, además de contexto tenant explícito. Si la decisión es que el worker sea el único escritor eventual, hay que cambiar el criterio de rechazo visible/rollback de CA-07 o definir un protocolo de aceptación síncrona antes del commit; no asumir que un evento posterior puede revertir una agenda ya confirmada.

No hay productor/relay de outbox MOD09 en las rutas inspeccionadas; el relay existente consulta `execution_order_outbox_events` (`apps/worker/src/services/execution-order-relay.service.ts:55, 195-200`). Una outbox MOD09 propia probablemente requiere migración en el schema tenant. Esa proyección y su `down()` reversible necesitan aprobación arquitectónica y de datos antes de incluir DDL. La tabla de outbox MOD11 no es una alternativa válida por boundary.

### 5.3 Corrección de una OT despachada sin evento

**Propuesta pendiente, no endpoint autorizado:** comando de supervisión `POST /tasks/execution-orders/:id/dispatch-corrections` para una OT despachada que siga con `schedule_event_id IS NULL`. Es un comando específico sobre el acto de origen, no un `PATCH` genérico. Debe rechazar una OT ya enlazada y enviar su corrección por MOD09.

Payload candidato, sujeto a aprobación de producto/seguridad y a congelación de API:

```json
{
  "expectedVersion": 3,
  "reason": "Corrección de los datos del despacho",
  "organizationSiteId": "<uuid>",
  "customerDisplayLabel": "<texto>",
  "serviceAddress": "<texto o null>",
  "municipality": "<texto o null>",
  "sector": "<texto o null>",
  "workSummary": "<texto>",
  "workInstructions": "<texto o null>"
}
```

La ruta exigiría el permiso/rol de supervisión vigente, validación de alcance sobre la sede y concurrencia (`If-Match` o `expectedVersion`, escoger uno). Un `commandId`/`Idempotency-Key` ligado al hash canónico evita doble efecto; reutilización con payload distinto da `409`. El servicio MOD11 debe limitarlo a `CREATED`, `ASSIGNED` o `EN_ROUTE`, no anulada/terminal y aún sin evento. Excluir `workType`, estado, resultado, ventanas y técnico: el tipo exige anular/recrear; técnico reutiliza el comando de asignación existente; una ventana pasa por MOD09 al agendarse. Debe auditar CUD.

**[CONSULTA a AI-EM-ARCH]** Aprobar/descartar la ruta, su permiso, motivo obligatorio y política de concurrencia/idempotencia; ADR-090 define el dueño y el momento, pero no fija superficie HTTP, campos del comando, OpenAPI ni si el motivo es obligatorio. No implementar con el endpoint de creación `POST /dispatch`, porque no corrige una OT existente.

## 6. Versionado y ownership requerido para el encargo formal

- **Contrato congelado actual:** `packages/shared/src/contracts/operations/execution-orders.ts` v1.4. No editarlo en preparación ni reutilizar silenciosamente un payload V1 con campos nuevos.
- **Eventos:** conservar intactos `VisitWindowChangedV1` y `VisitResourceChangedV1` (`:464-474`). Para los campos de sitio/datos descriptivos, proponer un evento aditivo `VisitScheduleDetailsChangedV1` con payload mínimo y aprobado. Publicar el contrato como v1.5 (o una versión mayor si el orquestador juzga que hay incompatibilidad); actualizar unión, schema/type maps, productor, worker, pruebas de contrato y OpenAPI donde aplique. No incluir `workType`.
- **Comando de despacho:** si se aprueba el POST propuesto, añadir tipos de request/receipt en `@iwana/shared`, Zod/DTO y OpenAPI versionada. Congelar la forma en v1.5 antes de implementar. Si se decide que no hace falta superficie HTTP y hay un comando existente autorizado, documentar su ruta y contrato exactos antes de T1.
- **Ownership de implementación:** `sr-backend` es responsable de WFM service/DTO/controller, puerto tipado y adaptador MOD11, productor/outbox aprobado, worker/relay e integración. `AI-EM-ARCH` aprueba la resolución de outbox y la API; `AI-DATA-ENG` consulta el schema/tenant outbox; `AI-SEC-ENG` revisa permiso/alcance del comando nuevo; `sr-qa` verifica criterio↔pruebas. No importar entidades/servicios MOD11 desde WFM ni escribir tablas MOD11 desde MOD09.
- **Secuencia:** encargo T1 formal únicamente tras GO E4-datos y con baseline de conteos de tasks/WFM/worker actualizado. El plan hermano de corrección §8 aún conserva el orden anterior `E3 → T1 → T3 → E4`; el encargo debe declarar que el gate E4-datos precede a T1 o el orquestador debe corregir/versionar ese espejo. T3 no se absorbe.

## 7. Matriz de pruebas y gates para T1

| Criterio | Prueba requerida |
| --- | --- |
| **CA-04** | Unitarias y PostgreSQL real: cambio de ventana por `POST reschedule` y por `PATCH update`; ambas dejan evento y OT iguales. Conflicto de agenda no cambia ninguna de las dos. |
| **CA-05** | PostgreSQL: sitio, dirección, municipio y sector cambian juntos; técnico/recurso según mapping aprobado; nulos limpian ambos snapshots. Cubrir `title`, resumen e instrucciones con y sin `WorkOrder` según decisión. |
| **CA-06** | Replay exacto con mismo `eventId` conserva conteo, versión y auditoría; mismo ID/diferente payload da conflicto; entrega duplicada y fuera de orden no pisa actualización nueva. Probar el inbox/outbox con reintento real o harness integrado. |
| **CA-07** | Por ambas mutaciones de agenda, una OT `IN_PROGRESS`/`BLOCKED` rechaza visiblemente y no cambia evento, OT, log ni outbox; repetir para terminal/anulada según guards existentes. El comando de despacho solo actúa antes de iniciar. |
| **CA-08** | Intento de cambiar tipo de trabajo por agenda y por comando responde error de dominio que indique “anular y recrear”; no modifica el snapshot ni expone un campo editable. Verificar HTTP/OpenAPI si el cambio de validación alcanza el boundary. |
| **Aislamiento** | PostgreSQL efímero/tenant de integración, una OT de test y un schema aislado; confirmar sin filas residuales. Probar tenant/contexto y que el payload no elige schema. Si se aprueba DDL, migración manual reversible `up/down` en ese entorno. |

Gates a fijar en el prompt formal: `pnpm typecheck`; Jest de `tasks`, `wfm` y `worker` con conteos reales y `Cached: 0` —al menos preservar las bases posteriores a E4 y los pisos E3 de tasks 712 y WFM 242—; integración PostgreSQL real con conteo y verificación de filas; `git diff --check`; auditoría de OpenAPI/contrato si se aprueban cambios públicos. Añadir prueba de carrera si se agrega outbox/índice o se exige garantía concurrente; no declarar GO por pruebas unitarias solamente.

## 8. Pendientes de decisión y salida

- **[CONSULTA] Arquitectura:** confirmar puerto transaccional + outbox de MOD09/replay y rol del handler para conservar D4 inmediato sin doble escritor, o indicar una alternativa aprobada y su cambio a CA-07.
- **[CONSULTA] Producto:** fijar mapping de título/descripción a snapshot existente, campos corregibles exactos y copy de rechazo de tipo.
- **[CONSULTA] API/seguridad:** aprobar o descartar `POST /tasks/execution-orders/:id/dispatch-corrections`, payload, permiso, motivo y control de versión/idempotencia; autorizar versionado/OpenAPI.
- **[CONSULTA] Datos:** confirmar si existe mecanismo durable MOD09 reutilizable; de lo contrario, aprobar el análisis de DDL para un outbox de MOD09 con migración reversible.
- **T3:** reconciliador de deriva para ventana, recurso y sitio continúa fuera de T1 (plan de corrección §3, CA-15).

No se modificó producción, contratos, migraciones ni pruebas. No se ejecutaron tests: este documento prepara alcance y decisiones; no afirma implementación ni verificación.
