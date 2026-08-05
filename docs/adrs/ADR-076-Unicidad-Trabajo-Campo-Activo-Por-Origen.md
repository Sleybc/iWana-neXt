# ADR-076: Unicidad de trabajo de campo activo por unidad de origen

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-08-04
**Autor:** AI-EM-ARCH
**Modo activo:** Mixto
**Modulo principal:** MOD09 Programacion / WFM
**Modulos relacionados:** MOD10 Service Assurance, MOD11 Ejecucion Operativa, MOD05 CRM
**PRD relacionado:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
**Informe relacionado:** docs/informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md
**Spec relacionada:** docs/specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md
**ADRs antecedentes:** ADR-037, ADR-038, ADR-039, ADR-046, ADR-047, ADR-068

---

## Contexto

ADR-039 aprobo `VisitRequest` como inbox operativo de WFM y fijo dos reglas de
implementacion (5 y 6): el agendamiento debe ser idempotente frente a doble submit y
una solicitud en estado terminal no puede generar otro evento activo.

La operacion reporto que `/dashboard/scheduling/pending-visits` permite agendar dos
veces el mismo trabajo real — caso concreto: una instalacion. La auditoria
(INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0) confirmo que el defecto no es
un doble clic sino un hueco de modelo:

- La unicidad se anclo en `visit_requests`, que es un artefacto **previo** a la agenda.
- El indice unico parcial `idx_visit_requests_active_origin_unique`
  (`035_harden_visit_requests_indexes.ts:23-28`) excluye `SCHEDULED` del predicado.
- En consecuencia, **en cuanto el trabajo queda agendado el sistema vuelve a considerar
  que ese origen no tiene solicitud activa**, y cualquier origen puede crear otra.
- Ninguna de las tablas del flujo (`schedule_events`, `work_orders`,
  `execution_orders`) tiene restriccion que impida un segundo trabajo activo para el
  mismo origen. La unica guarda viva es el solape horario por tecnico.

La regla 6 de ADR-039 se cumple en la letra (la *misma* solicitud no genera dos
eventos) pero no en su intencion: una solicitud **nueva** del mismo origen si lo hace.

### Modelo de dominio confirmado con negocio (2026-08-04)

La conversacion con el CTO precisa el dominio y descarta la hipotesis de anclar la
unicidad en el suscriptor:

1. Los tickets son **internos o externos**. Los internos se abren sobre un nodo, un
   tramo de red o una oficina; los externos, sobre un cliente. El modelo ya lo
   representa con `TicketSubjectType`: `NETWORK_NODE`, `DEVICE`, `INTERNAL_AREA`
   frente a `SUBSCRIBER`, `CONTRACT`, `SERVICE`, `EXPEDIENTE`.
2. **No toda tarea de un ticket requiere visita.** Un ticket puede resolverse por
   WhatsApp, correo o telefono. El modelo ya lo representa con `TicketFieldDecision`:
   `NOT_REQUIRED`, `NEEDS_DIAGNOSIS`, `FIELD_SERVICE_REQUIRED`.

De (1) se sigue que el suscriptor **no** puede ser el eje de unicidad: un mismo
suscriptor puede tener legitimamente una instalacion de segundo servicio y un ticket
de soporte simultaneos. Tampoco el nodo: un mismo nodo puede tener una falla de fibra
y un mantenimiento programado a la vez. Bloquear por cualquiera de los dos generaria
falsos positivos permanentes sobre trabajo valido.

De (2) se sigue un segundo defecto, no cubierto por el reporte original: si un ticket
se resuelve por canal remoto o su decision de campo vuelve a `NOT_REQUIRED`, **la
solicitud de visita creada previamente sigue viva en la bandeja**. Alguien la agenda
y se despacha una cuadrilla a un trabajo que ya no existe. Es duplicacion de trabajo
por otra via: no dos visitas para un trabajo, sino una visita para ningun trabajo.

---

## Decision

Se adopta la **unidad de trabajo de origen** como eje de unicidad del trabajo de campo,
y se traslada la garantia de unicidad desde `visit_requests` hacia el trabajo agendado.

### D1. Eje de unicidad: la unidad de origen, no el sujeto

La clave de unicidad de trabajo de campo activo es la tupla:

```
(tenant_id, origin_context, origin_ref, work_type)
```

donde `origin_ref` identifica **la unidad de trabajo de origen**, nunca el sujeto sobre
el que recae:

| Naturaleza | `origin_context` | `origin_ref` ancla en | Sujeto (NO es la clave) |
| --- | --- | --- | --- |
| Instalacion de cliente nuevo | `CRM` | expediente | suscriptor |
| Visita a suscriptor por falla | `ASSURANCE` | ticket externo | suscriptor / contrato |
| Trabajo interno de red u oficina | `ASSURANCE` / `TASKS` | ticket interno | nodo, dispositivo, area |
| Trabajo manual sin ticket | `MANUAL` | ver D4 | — |

Queda **prohibido** ampliar la clave de unicidad con `subscriber_id`, `contract_id` o
la referencia del sujeto interno (`subject_ref_id`). El sujeto es informacion de
contexto para advertir al operador (ver D5), nunca criterio de bloqueo.

### D2. Un solo trabajo de campo activo por unidad de origen

Para una misma unidad de origen y `work_type` no puede existir mas de un trabajo de
campo activo, entendiendo por activo cualquier `ScheduleEvent` no terminal y no
borrado, junto con su `WorkOrder` y su orden de ejecucion MOD11.

La garantia se implanta en tres capas, en este orden de precedencia:

1. **Guarda de dominio en WFM** (obligatoria): antes de crear una solicitud y antes de
   agendarla, el servicio consulta `schedule_events` — tabla de la que WFM es owner —
   por la unidad de origen con estado no terminal, y responde `409` con la referencia
   del trabajo existente. La consulta va precedida de `pg_advisory_xact_lock` con clave
   derivada de la unidad de origen, tomado **al inicio** de la transaccion, para cerrar
   la ventana de concurrencia.
2. **Bloqueo pesimista** en `scheduleVisitRequest`: la lectura de la `VisitRequest`
   pasa a `SELECT ... FOR UPDATE` antes del retorno idempotente.
3. **Restriccion en base** (endurecimiento diferido): indice unico parcial sobre
   `schedule_events` por unidad de origen y tipo, excluyendo estados terminales y
   visitas adicionales declaradas. Ver D3 para su condicion de aplicabilidad.

### D3. La segunda visita legitima es un acto humano explicito y auditado

Ninguna heuristica puede distinguir en los datos "otra instalacion para este
expediente" de "la misma pedida dos veces". La distincion la aporta una persona:

- El caso por defecto se **rechaza** con `409` y devuelve la referencia del trabajo
  existente, para que la superficie ofrezca "ver el trabajo agendado" en lugar de
  crear otro.
- La segunda visita legitima se solicita con una marca explicita en el contrato
  (`isAdditionalVisit` con motivo obligatorio, o `supersedesEventId` cuando reemplaza
  a un trabajo previo). El motivo se persiste, se audita con actor y se propaga a la
  orden de trabajo para que el tecnico sepa por que hay dos.
- La reinstalacion tras cancelar **no requiere excepcion**: los estados terminales
  quedan fuera de todo predicado.

El indice unico de D2.3 solo puede crearse cuando (a) las capas 1 y 2 esten en
produccion y hayan dejado de generar duplicados, y (b) exista migracion previa de
limpieza por tenant. Un `CREATE UNIQUE INDEX` contra datos con duplicados falla, y
`CONCURRENTLY` es incompatible con el envoltorio transaccional de `runInTenantSchema`
(ADR-066 aplica).

### D4. Origenes sin referencia quedan cubiertos

`origin_ref IS NULL` deja hoy el trabajo manual e interno fuera de toda deduplicacion.
Se decide:

- Todo trabajo interno derivado de un ticket usa el **id del ticket** como `origin_ref`.
  El ticket es el contenedor natural del trabajo interno segun el modelo de negocio
  confirmado, y `TicketSubjectType` conserva el nodo, dispositivo o area afectada.
- El trabajo manual sin ticket **no se bloquea**, pero pasa por la advertencia
  territorial de D5. No se le fabrica una referencia sintetica.
- `origin_ref` se normaliza (`trim`) antes de persistir y de comparar.

### D5. El sujeto alimenta la advertencia, no el bloqueo

Cuando la unidad de origen no colisiona pero el **sujeto** si tiene trabajo de campo
activo (mismo suscriptor, mismo nodo, misma sede, o misma zona para trabajo manual),
la superficie advierte sin bloquear y ofrece consolidar la salida. El operador decide.

### D6. La decision de campo del ticket gobierna el ciclo de vida de la solicitud

Una solicitud de visita solo tiene razon de existir mientras su ticket de origen
mantenga `fieldDecision = FIELD_SERVICE_REQUIRED`. Por lo tanto:

- Cuando un ticket pasa a `NOT_REQUIRED` — se resolvio por WhatsApp, correo o
  telefono — o se cierra sin visita, **debe cerrarse la solicitud de visita pendiente
  asociada**, con motivo trazable y sin intervencion manual del coordinador.
- La comunicacion es por el puerto existente MOD10 -> MOD09
  (`AssuranceFieldServicePort`), ampliado con la operacion de retiro. No se permite
  lectura cruzada de tablas.
- `requestFieldService` debe ser idempotente respecto a solicitudes de campo abiertas:
  no puede acumular `TicketWorkOrderLink` append-only sin verificar si ya existe un
  vinculo vivo.

### D7. Cerrar el ciclo de vida del evento (condicion previa)

Los caminos que hoy dejan estados sin salida y **empujan al operador a duplicar** se
corrigen antes que cualquier otra capa:

- Cancelar un evento debe devolver la solicitud a un estado reprogramable y cancelar
  la `WorkOrder` y la orden de ejecucion MOD11 asociadas (exigido por ADR-068).
- `moveToPending` debe conservar el mismo `scheduleEventId` al reagendar, aprovechando
  la idempotencia por evento ya existente en MOD11, en lugar de generar uno nuevo que
  produce una segunda orden.
- Se amplia `ExecutionOrderSchedulingPort` con la operacion de cancelacion desde
  agenda. **Aprobado por el CTO el 2026-08-04** como cambio de contrato entre MOD09 y
  MOD11 bajo ADR-047 y ADR-068.

---

## Consecuencias

### Positivas

- El trabajo de campo pasa a tener una unicidad anclada donde el trabajo existe
  (`schedule_events`), no donde se solicita (`visit_requests`).
- Se cumplen por fin las reglas 5 y 6 de ADR-039 en su intencion.
- La segunda visita legitima sigue siendo posible en los tres tipos de trabajo, con
  trazabilidad de quien la pidio y por que.
- Se elimina la clase de defecto "visita despachada para un ticket ya resuelto por
  canal remoto" (D6), que hoy no tiene ninguna guarda.
- Los caminos sin salida (cancelar evento, mover a pendientes) dejan de empujar al
  operador hacia el duplicado.
- La correccion mas costosa (indice unico) queda condicionada y diferida, no en la
  ruta critica.

### Costos y tradeoffs

- Ampliacion de dos contratos entre modulos: `ExecutionOrderSchedulingPort`
  (cancelacion) y `AssuranceFieldServicePort` (retiro de solicitud).
- La guarda de dominio anade una consulta y un advisory lock por creacion y por
  agendamiento. Coste despreciable frente al de una cuadrilla desplazada dos veces.
- El contrato de listado de la bandeja debe exponer un indicador derivado de trabajo
  activo para que la UI pueda advertir sin N llamadas por fila.
- La suite de tests de `moveToPending` congela hoy el comportamiento defectuoso como
  contrato: debera reescribirse, no adaptarse.

### Riesgos aceptados

- Falso positivo residual: una segunda cuadrilla de refuerzo para el mismo trabajo el
  mismo dia se rechaza por defecto. Se resuelve con la marca explicita de D3, no
  debilitando el predicado.
- Mientras el indice unico de D2.3 no exista, la garantia depende de la capa de
  servicio. Una escritura directa en base la evade. Se acepta de forma transitoria y
  se cierra con el endurecimiento diferido.
- Los duplicados ya existentes en datos productivos no se corrigen solos: requieren
  migracion de limpieza con inventario previo por tenant.

---

## Reglas de implementacion

1. La clave de unicidad es `(tenant_id, origin_context, origin_ref, work_type)`.
   Prohibido incorporar `subscriber_id`, `contract_id` o `subject_ref_id` a la clave.
2. La guarda de dominio consulta unicamente tablas de las que WFM es owner. Prohibida
   la lectura cruzada hacia CRM, Assurance, Tasks o Inventario.
3. Toda guarda que hoy exista solo en el cliente debe existir en el servidor. La
   verificacion de cliente se conserva como mejora de experiencia, jamas como control.
4. El advisory lock se toma al inicio de la transaccion, antes de cualquier lectura de
   validacion, con clave derivada de la unidad de origen.
5. El rechazo por duplicado devuelve `409` con la referencia operativa del trabajo
   existente — nunca un UUID como informacion principal (ADR-039 regla 7).
6. La segunda visita legitima exige marca explicita y motivo persistido; queda
   auditada con actor.
7. Cancelar o mover a pendientes debe dejar el conjunto solicitud + evento + orden de
   trabajo + orden de ejecucion en estado consistente dentro de la misma transaccion.
8. El indice unico sobre `schedule_events` no se crea hasta cumplir D3; su migracion
   incluye limpieza previa y es reversible.
9. Ningun cambio de este ADR puede impedir: reinstalar tras cancelar, atender varios
   tickets simultaneos del mismo suscriptor, ni abrir varios tickets sobre el mismo
   nodo. Debe existir test de no regresion para los tres casos **antes** de implantar
   cualquier guarda.
10. OpenAPI, migraciones reversibles, pruebas backend/frontend y evidencia documental
    son obligatorias.

---

## Alternativas consideradas

### A1: Incluir `SCHEDULED` en el predicado del indice actual

Descartada. Impediria para siempre la reinstalacion y la segunda visita legitima. El
indice actual no esta mal escrito: esta anclado en la tabla equivocada.

### A2: Anclar la unicidad en el suscriptor o en el nodo

Descartada por el modelo de negocio confirmado en la seccion de contexto. Produciria
falsos positivos permanentes sobre trabajo valido y no cubre el trabajo interno sin
suscriptor.

### A3: Clave de idempotencia de request (`Idempotency-Key`)

Parcialmente valida y no adoptada como palanca principal. Cubre reenvios de red, no
intenciones humanas separadas por horas o dias — que es el caso reportado. Puede
adoptarse despues como capacidad transversal, con ADR propio.

### A4: Elevar el nivel de aislamiento a SERIALIZABLE

Descartada. Obligaria a manejar `40001` en todo el modulith y a revisar la interaccion
con pgBouncer. La serializacion debe ser puntual y explicita, no global.

---

## Aprobacion requerida

Si.

Motivo:

- Reinterpreta el alcance de las reglas 5 y 6 de ADR-039.
- Amplia el contrato `ExecutionOrderSchedulingPort` entre MOD09 y MOD11 (ADR-047,
  ADR-068).
- Amplia el contrato `AssuranceFieldServicePort` entre MOD10 y MOD09 (ADR-038).
- Introduce restriccion de base diferida sobre `schedule_events` con migracion de
  limpieza previa.

**Estado de aprobacion:** **aprobado por el CTO el 2026-08-05** en su totalidad.

El 2026-08-04 el CTO ya habia fijado el eje de unicidad por unidad de origen (D1) y
autorizado la ampliacion del puerto de ordenes de ejecucion (D7). La aprobacion del
2026-08-05 cubre el resto del cuerpo del ADR y se emite sobre la implementacion ya
auditada (ver INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0).

El endurecimiento diferido de D2.3 —indice unico parcial sobre `schedule_events`— queda
aprobado en su decision pero **no ejecutado**: mantiene las condiciones de aplicabilidad
descritas en D3.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md
- docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md
- docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md
- docs/adrs/ADR-066-Migraciones-No-Transaccionales-Runner.md
- docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md
- docs/informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md
- docs/specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md
