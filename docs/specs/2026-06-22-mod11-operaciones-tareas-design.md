# Diseno base - MOD11 Ejecucion Operativa / Tareas

**Version:** 1.0  
**Estado:** Aprobado  
**Aprobado por:** CTO  
**Fecha:** 2026-06-22  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Clasificacion:** Uso interno  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md, docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md, docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md

---

## 1. Contexto

El estado actual del repo ya separa parcialmente tres responsabilidades:

- `Assurance` como owner de tickets, SLA y trazabilidad del caso.
- `WFM` como owner de agenda, visitas, Work Orders y despacho tecnico.
- `CRM` como owner del expediente y del origen comercial-operativo.

Sin embargo, falta una unidad transversal de trabajo ejecutable. Hoy algunos flujos usan `SupportTicket` como carpeta operativa y otros dependen de `WorkOrderTask`, pero ninguno de los dos conceptos cubre bien tareas internas, externas, agendables y no agendables con el mismo modelo.

La necesidad aprobada en esta definicion es introducir una entidad `Task` como carpeta operativa principal del trabajo concreto, con responsable y destinatario explicitos.

---

## 2. Problema a resolver

La plataforma necesita modelar de forma consistente:

- trabajo originado por tickets de clientes;
- trabajo interno de operaciones, backoffice o soporte;
- trabajo que requiere agenda;
- trabajo que se ejecuta sin agenda;
- trabajo que puede escalar a `WorkOrder`;
- reasignaciones entre personas, colas o areas con historial.

Si se fuerza todo en `Ticket`, se mezcla intake con ejecucion. Si se fuerza todo en `WorkOrderTask`, WFM termina siendo owner de trabajo que no siempre es agenda ni campo.

---

## 3. Alternativas consideradas

### Opcion 1 - Crear `TasksModule` transversal

`Task` se vuelve la unidad de trabajo ejecutable. `Ticket` queda como intake, SLA y contexto. `WFM` solo participa cuando la tarea requiere agenda o trabajo de campo.

**Ventajas**

- separa claramente caso vs ejecucion;
- sirve para clientes e internos;
- no obliga a pasar por agenda;
- evita convertir `WorkOrderTask` en tarea universal.

**Costo**

- requiere nuevo bounded context;
- exige definir contrato claro con MOD10 y MOD09.

### Opcion 2 - Extender `SupportTicket`

El ticket absorbe responsable, destinatario, agenda opcional y ejecucion.

**Ventajas**

- menor esfuerzo inicial;
- reaprovecha UI y APIs existentes.

**Costo**

- mezcla SLA, comunicacion y trabajo ejecutable;
- vuelve ambiguo el owner del avance operativo fino.

### Opcion 3 - Extender `WorkOrderTask`

WFM absorbe tambien tareas no agendables o no tecnicas.

**Ventajas**

- reutiliza entidades existentes;
- aprovecha relacion con agenda y OT.

**Costo**

- rompe boundary de WFM;
- convierte una subtarea tecnica en entidad universal de negocio.

---

## 4. Decision propuesta

Se recomienda la **Opcion 1**: crear `TasksModule` como nuevo bounded context para MOD11 Ejecucion Operativa / Tareas.

Decisiones de modelado fijadas:

1. La tarea es la carpeta operativa principal del trabajo concreto.
2. La tarea tiene un solo responsable activo, con historial de reasignaciones.
3. La tarea tiene un destinatario explicito, que puede ser cliente o interno.
4. La agenda es una capacidad opcional de la tarea, no su owner.
5. `WorkOrderTask` permanece como subtarea interna de una OT, no como reemplazo de `Task`.

Nombre tecnico propuesto:

- bounded context: `TasksModule`
- entidad principal: `OperationalTask`
- nombre visible en portal: **Operaciones**

---

## 5. Modelo conceptual

Separacion final propuesta:

- `Ticket`: alguien reporta, solicita o escala algo.
- `Task`: trabajo concreto que alguien debe ejecutar.
- `ScheduleEvent`: cuando se hara la tarea, si requiere programacion.
- `WorkOrder`: formalizacion tecnica de campo cuando aplica.

Relaciones principales:

- un `Ticket` puede originar `0..N Tasks`;
- una `Task` puede existir sin `Ticket`;
- una `Task` puede vincular `0..1 ScheduleEvent`;
- una `Task` puede vincular `0..1 WorkOrder`;
- una `WorkOrder` puede mantener `1..N WorkOrderTask`.

---

## 6. Modelo de datos base

### `operational_tasks`

Campos minimos:

- `id`
- `tenant_id`
- `task_number`
- `type`
- `status`
- `priority`
- `title`
- `description`
- `origin_context`
- `origin_ref_id`
- `ticket_id` nullable
- `responsible_type`
- `responsible_ref_id`
- `recipient_type`
- `recipient_ref_id`
- `recipient_label`
- `queue_name` nullable
- `execution_mode`
- `due_at` nullable
- `scheduled_required`
- `schedule_event_id` nullable
- `work_order_id` nullable
- `created_by_user_id`
- `resolved_at` nullable
- `closed_at` nullable
- `created_at`
- `updated_at`

### `task_timeline_events`

Historial append-only de creacion, asignacion, reasignacion, bloqueo, agenda, vinculacion OT y cierre.

### `task_assignment_history`

Historial de handoff para conservar responsable anterior, nuevo responsable, motivo y actor.

Enums sugeridos:

- `TaskType`: `CUSTOMER_SUPPORT`, `INTERNAL_OPERATION`, `INSTALLATION`, `FIELD_VISIT`, `BACKOFFICE`, `COLLECTION`, `REVIEW`
- `TaskStatus`: `OPEN`, `READY`, `SCHEDULED`, `IN_PROGRESS`, `PENDING_EXTERNAL`, `PENDING_INTERNAL`, `BLOCKED`, `RESOLVED`, `CANCELLED`
- `TaskRecipientType`: `SUBSCRIBER`, `PROSPECT`, `INTERNAL_USER`, `INTERNAL_AREA`, `CONTRACTOR`, `EXTERNAL_PARTY`
- `TaskResponsibleType`: `USER`, `TEAM`, `QUEUE`
- `TaskExecutionMode`: `IMMEDIATE`, `DUE_DATE`, `SCHEDULED`, `FIELD_SERVICE`

---

## 7. Flujos objetivo

### Ticket externo -> tarea operativa

1. `Assurance` crea o recibe un ticket.
2. Soporte decide que el caso requiere trabajo concreto.
3. `Assurance` crea una `Task` ligada al ticket.
4. La tarea se asigna a un responsable.
5. Si requiere agenda, `TasksModule` solicita o vincula `ScheduleEvent`.
6. Si requiere campo, se vincula o genera `WorkOrder`.

### Tarea interna sin ticket

1. Un usuario interno crea una tarea manual desde `Operaciones`.
2. Se define destinatario interno y responsable activo.
3. La tarea se resuelve sin pasar por `Assurance`.

### CRM / instalacion

1. `CRM` o `WFM` origina contexto operativo.
2. Se crea una tarea `INSTALLATION`.
3. El destinatario es el cliente o prospecto.
4. El responsable inicial es Operaciones / Programacion.
5. Si aplica, se agenda y se asocia a OT.

### Politica de intake unificado

La captura inicial puede llegar por llamada, WhatsApp, correo, atencion presencial, CRM, Mesa de ayuda o procesos internos. El canal de entrada no define por si solo si el sistema debe crear `CRM`, `Ticket`, `Task`, `ScheduleEvent` u `WorkOrder`.

Politica aprobada:

- no toda solicitud crea `Ticket`;
- toda solicitud con trabajo ejecutable debe terminar en `Task`;
- `ScheduleEvent` solo se crea cuando la tarea requiere fecha y hora confirmadas;
- `WorkOrder` solo se crea cuando existe trabajo tecnico de campo;
- `responsable` y `destinatario` deben mantenerse separados desde el origen.

### UI objetivo para creacion desde Programacion

La superficie actual de agenda no debe seguir modelando "crear evento" como si fuera equivalente a "crear tarea". La UI objetivo pasa a ser un flujo task-first:

1. crear `Task`;
2. decidir si requiere control formal por `Ticket`;
3. decidir si requiere agenda;
4. crear o vincular `ScheduleEvent` y `WorkOrder` solo cuando aplique.

El detalle visual y de comportamiento del modal objetivo se baja en el spec complementario:

- `docs/specs/2026-06-23-mod11-crear-tarea-agenda-opcional-design.md`

---

## 8. Boundaries e integraciones

- `TasksModule` no lee tablas de `Assurance`, `CRM` ni `WFM`.
- `Assurance` no es owner de tareas ejecutables.
- `WFM` no es owner de tareas transversales.
- Las referencias cross-module son IDs logicos y contratos tipados.
- El estado del ticket no debe duplicar el estado fino de la tarea.
- El cierre de una tarea puede informar al ticket, pero no lo reemplaza.

Contratos iniciales esperados:

- `POST /api/v1/tasks`
- `GET /api/v1/tasks`
- `GET /api/v1/tasks/:id`
- `PATCH /api/v1/tasks/:id`
- `POST /api/v1/tasks/:id/assign`
- `POST /api/v1/tasks/:id/link-schedule-event`
- `POST /api/v1/tasks/:id/link-work-order`
- `POST /api/v1/tasks/:id/transition`

---

## 9. Migracion conceptual desde el estado actual

1. Mantener `OPERATIONAL_TASK` en MOD10 como origen operativo existente, sin romper lo ya construido.
2. Introducir MOD11 como owner de ejecucion transversal para nuevas implementaciones.
3. Mantener `WorkOrderTask` exclusivamente como subtarea tecnica de OT.
4. Integrar CRM -> Ticket -> Task -> Agenda sin acceso directo entre tablas de modulos.

---

## 10. Supuestos y pendientes

Supuestos elegidos:

- `MOD11` queda libre y se usa para evitar colision con paquetes vigentes.
- El nombre visible recomendado es **Operaciones**.
- La tarea acepta creacion manual y creacion desde otros modulos desde la Fase 01.

Pendientes que requieren aprobacion posterior:

- aprobar ADR del nuevo boundary;
- actualizar PRD maestro con MOD11 cuando exista autorizacion CTO;
- decidir si el portal muestra `Operaciones` como modulo propio o como bandeja integrada con Mesa de ayuda.
