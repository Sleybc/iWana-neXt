# PRD - MOD11 Ejecucion Operativa / Tareas

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-06-24  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Clasificacion:** Confidencial - Uso interno  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md, docs/specs/2026-06-22-mod11-operaciones-tareas-design.md  
**Referencias relacionadas:** docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md, docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md, docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md, docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md, docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md, docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md

> Nota de numeracion: el PRD maestro vigente no asigna aun un modulo explicito para ejecucion operativa transversal. Se propone `MOD11` por estar libre en el repositorio actual. La incorporacion al mapa maestro requiere aprobacion via ADR.
> Correccion documental 2026-06-24: este PRD evoluciona para cubrir no solo `Task` transversal sino tambien la OT enriquecida de ejecucion de campo, manteniendo a `Programacion` fuera del detalle tecnico y de inventario operativo.

---

## 1. Contexto y motivacion

La plataforma ya tiene owners parciales para piezas del flujo operativo:

- MOD10 Service Assurance maneja tickets, SLA, PQR y contexto del caso.
- MOD09 Programacion / WFM maneja agenda, visitas, Work Orders ligeras/transitorias y despacho tecnico.
- MOD05 CRM maneja expediente y origen comercial-operativo.

Lo que falta es una carpeta operativa transversal para el trabajo concreto que alguien debe ejecutar y para la OT enriquecida de campo. Hoy ese espacio queda repartido entre tickets operativos, `WorkOrderTask` y una OT ligera embebida en WFM, lo que genera ambiguedad entre intake, ejecucion y agenda.

MOD11 Ejecucion Operativa / Tareas busca resolver esa brecha creando una entidad `Task` con:

- responsable activo;
- destinatario explicito;
- agenda opcional;
- origen trazable;
- integracion con ticket, CRM y WFM sin romper boundaries.

Adicionalmente, el corte aprobado por ADR-047 orienta a MOD11 como owner futuro de la `OT` enriquecida cuando exista trabajo de campo confirmado desde `Programacion`.

---

## 2. Alcance

### En scope Fase 01

- Crear un bounded context propio para tareas operativas transversales.
- Crear tareas manuales y tareas originadas desde otros modulos.
- Distinguir claramente `responsable` y `destinatario`.
- Permitir destinatario cliente o interno.
- Mantener un solo responsable activo con historial de reasignaciones.
- Mantener timeline append-only de creacion, asignacion, agenda, bloqueo y cierre.
- Permitir fecha objetivo y agenda opcional.
- Permitir vinculo logico con `ticketId`, `scheduleEventId` y `workOrderId`.
- Exponer API REST bajo `/api/v1/tasks`.
- Exponer UI portal visible como `Operaciones`.
- Preparar ownership de `ExecutionOrder` enriquecida para trabajo de campo, separada de `Programacion`.

### Fuera de scope Fase 01

- Checklist tecnico profundo de cuadrillas o materiales.
- SLA propio de tarea independiente del ticket origen.
- Motor de dependencias complejas entre tareas.
- App movil nativa.
- Automatizaciones IA de priorizacion o sugerencia.
- Orquestacion BPM completa multi-etapa.
- Contabilidad de inventario completa de ERP o almacen.

---

## 3. Personas y casos de uso

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Coordinador operativo | ADMIN, NOC, SUPPORT | Crear, asignar y despachar tareas |
| Analista backoffice | SUPPORT, BILLING, ADMIN | Ejecutar tareas internas no agendables |
| Tecnico | TECHNICIAN | Ver y avanzar tareas asignadas |
| Contratista | CONTRACTOR | Atender tareas autorizadas con ownership estricto |
| Agente de soporte | SUPPORT | Convertir un ticket en trabajo ejecutable |
| Asesor comercial | SALES | Crear o consultar tarea de instalacion originada desde CRM |

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-TSK-01 | Soporte | Crear tarea desde un ticket existente |
| CU-TSK-02 | Operaciones | Crear tarea interna manual sin ticket |
| CU-TSK-03 | Coordinador | Reasignar tarea y dejar historial |
| CU-TSK-04 | Coordinador | Agendar tarea cuando requiere ventana horaria |
| CU-TSK-05 | Tecnico | Ver solo sus tareas activas y actualizar estado |
| CU-TSK-06 | Backoffice | Ejecutar tarea administrativa con destinatario interno |
| CU-TSK-07 | CRM/Operaciones | Crear tarea de instalacion con destinatario cliente |

### 3.1 Politica de intake y clasificacion operativa

La captura inicial puede entrar por llamada, WhatsApp, correo, atencion presencial, CRM, Mesa de ayuda o procesos internos. El canal de entrada **no** determina por si solo la entidad de negocio que debe crearse.

Reglas operativas aprobadas:

- Toda solicitud debe poder registrarse primero como captura operativa con canal, resumen, actor, contexto y notas iniciales.
- No toda solicitud debe crear `Ticket`.
- Toda solicitud que derive en trabajo concreto para una persona o area debe terminar en `Task`.
- La agenda se crea solo cuando la `Task` requiere fecha y hora confirmadas.
- La OT se crea solo cuando la `Task` implica ejecucion de campo estructurada.
- La OT enriquecida se crea o activa al confirmarse agenda desde `Programacion`, no durante el intake generico.

Politica de clasificacion inicial:

| Tipo de necesidad | Entidad primaria | Resultado esperado |
| --- | --- | --- |
| Solicitud de informacion comercial | CRM | Oportunidad, seguimiento o actividad comercial |
| Solicitud de instalacion nueva | CRM | Expediente u oportunidad + `Task`; `Ticket` opcional segun control operativo |
| Falla, revision de servicio o incidente | Ticket | Caso formal de soporte + `Task` si alguien debe ejecutar trabajo |
| Correccion de factura o reclamacion administrativa | Ticket | Caso formal de billing/soporte + `Task` interna si aplica |
| Solicitud interna puntual | Task | Trabajo ejecutable sin obligar `Ticket` |

Politica de control:

- `Ticket` se usa cuando el caso requiere cola, prioridad formal, SLA, escalacion, trazabilidad de atencion o cierre auditable.
- `Task` se usa cuando existe trabajo ejecutable con responsable y destinatario.
- `ScheduleEvent` se usa cuando la `Task` requiere programacion.
- `WorkOrder` se usa cuando la `Task` deriva en trabajo tecnico de campo.
- Los equipos y materiales usados en campo se consumen desde la custodia del tecnico/cuadrilla y su destino final se registra en la OT.

---

## 4. Requerimientos funcionales

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-TSK-01 | Crear tareas manuales o derivadas de otro modulo con `originContext` y `originRefId`. | MVP |
| RF-TSK-02 | Registrar `responsable` y `destinatario` como conceptos separados. | MVP |
| RF-TSK-03 | Permitir destinatario cliente, prospecto, usuario interno, area interna o tercero autorizado. | MVP |
| RF-TSK-04 | Mantener un unico responsable activo con historial de handoff. | MVP |
| RF-TSK-05 | Gestionar estados `OPEN`, `READY`, `SCHEDULED`, `IN_PROGRESS`, `PENDING_EXTERNAL`, `PENDING_INTERNAL`, `BLOCKED`, `RESOLVED`, `CANCELLED`. | MVP |
| RF-TSK-06 | Permitir fecha objetivo y prioridad sin obligar agenda. | MVP |
| RF-TSK-07 | Vincular tarea con `ticketId` sin leer tablas de MOD10. | MVP |
| RF-TSK-08 | Vincular tarea con `scheduleEventId` y `workOrderId` sin leer tablas de MOD09. | MVP |
| RF-TSK-09 | Registrar timeline append-only para creacion, asignacion, agenda, bloqueo, reasignacion y cierre. | MVP |
| RF-TSK-10 | Restringir visibilidad de tecnicos y contratistas a tareas propias o autorizadas. | MVP |
| RF-TSK-11 | Preparar integracion para que un ticket pueda originar varias tareas. | MVP |
| RF-TSK-12 | Preparar integracion para dependencias entre tareas y automatizaciones futuras. | Fase 2 |
| RF-TSK-13 | No obligar creacion de `Ticket` para solicitudes comerciales, consultas simples o tareas internas puntuales. | MVP |
| RF-TSK-14 | Exigir que toda solicitud con trabajo ejecutable tenga `Task` con `responsable` y `destinatario` separados. | MVP |
| RF-TSK-15 | Crear agenda solo cuando `executionMode` sea `SCHEDULED` o `FIELD_SERVICE`, o cuando `scheduledRequired` sea verdadero. | MVP |
| RF-TSK-16 | Permitir que una instalacion originada desde CRM cree `Ticket` automaticamente cuando el tenant requiera control formal del caso, sin volver `Ticket` obligatorio para todos los escenarios CRM. | MVP |
| RF-TSK-17 | Crear o activar OT enriquecida cuando `Programacion` confirme agenda para trabajo de campo. | MVP |
| RF-TSK-18 | Registrar actividades realizadas, novedades y cierre tecnico en OT sin absorber agenda. | MVP |
| RF-TSK-19 | Consumir equipos y materiales desde la custodia del tecnico/cuadrilla y registrar destino final del item. | MVP |

---

## 5. Requerimientos no funcionales

- Multi-tenant por schema PostgreSQL, sin schema hardcodeado.
- Boundaries Modulith estrictos: sin lectura directa de tablas MOD10, MOD09 o MOD05.
- JWT, RBAC y ownership por responsable activo.
- Validacion Zod en todos los boundaries HTTP.
- Sin PII sensible duplicada; guardar IDs logicos y labels operativos minimos.
- Timeline auditable y append-only.
- OpenAPI actualizado para todos los endpoints nuevos.
- Textos visibles en espanol, sentence case.
- Tests unitarios, integracion tenant-aware y E2E focalizado.
- Sin romper ownership de Inventario/Almacen sobre stock y custodia.

---

## 6. Modelo de datos borrador

### `operational_tasks`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `tenant_id` | uuid | aislamiento tenant |
| `task_number` | varchar(30) | consecutivo legible por tenant |
| `type` | enum | tipo de tarea |
| `status` | enum | estado operativo |
| `priority` | enum | prioridad |
| `title` | varchar(200) | resumen |
| `description` | text nullable | detalle controlado |
| `origin_context` | enum | `ASSURANCE`, `CRM`, `WFM`, `BILLING`, `MANUAL`, `SYSTEM` |
| `origin_ref_id` | varchar(160) nullable | referencia logica del origen |
| `ticket_id` | varchar(160) nullable | referencia MOD10 |
| `responsible_type` | enum | `USER`, `TEAM`, `QUEUE` |
| `responsible_ref_id` | varchar(160) | responsable activo |
| `recipient_type` | enum | cliente o interno |
| `recipient_ref_id` | varchar(160) nullable | referencia logica del destinatario |
| `recipient_label` | varchar(160) nullable | label operativo no sensible |
| `queue_name` | varchar(80) nullable | cola visible si aplica |
| `execution_mode` | enum | inmediata, fecha objetivo, agendada o campo |
| `due_at` | timestamptz nullable | fecha objetivo |
| `scheduled_required` | boolean | indica si debe programarse |
| `schedule_event_id` | uuid nullable | referencia MOD09 |
| `work_order_id` | uuid nullable | referencia MOD09 |
| `resolved_at` | timestamptz nullable | evidencia |
| `closed_at` | timestamptz nullable | evidencia |
| `created_by_user_id` | uuid | actor creador |
| `created_at` | timestamptz | auditoria |
| `updated_at` | timestamptz | auditoria |

### `task_timeline_events`

Historial append-only.

### `task_assignment_history`

Historial de responsable anterior, nuevo responsable, motivo y actor.

---

## 7. Contratos de API borrador

Base path: `/api/v1/tasks`.

| Metodo | Ruta | Uso | Roles |
| --- | --- | --- | --- |
| GET | `/tasks` | Listar tareas con filtros | ADMIN, SUPPORT, NOC, TECHNICIAN, CONTRACTOR |
| POST | `/tasks` | Crear tarea | ADMIN, SUPPORT, NOC, SALES |
| GET | `/tasks/:id` | Detalle de tarea | ADMIN, SUPPORT, NOC, TECHNICIAN, CONTRACTOR |
| PATCH | `/tasks/:id` | Editar campos abiertos permitidos | ADMIN, SUPPORT, NOC |
| POST | `/tasks/:id/assign` | Asignar o reasignar responsable | ADMIN, SUPPORT, NOC |
| POST | `/tasks/:id/transition` | Cambiar estado | ADMIN, SUPPORT, NOC, TECHNICIAN |
| POST | `/tasks/:id/link-schedule-event` | Asociar agenda existente | ADMIN, SUPPORT, NOC |
| POST | `/tasks/:id/link-work-order` | Asociar OT existente | ADMIN, SUPPORT, NOC |

Reglas de acceso:

- `TECHNICIAN` y `CONTRACTOR` solo ven tareas asignadas a su responsable activo.
- `SALES` puede crear tareas solo en flujos autorizados del origen comercial.
- Los endpoints no deben exponer datos sensibles del cliente.

---

## 8. Criterios de aceptacion

1. Un usuario autorizado puede crear una tarea manual sin ticket.
2. Un ticket puede originar una tarea sin que MOD11 lea tablas MOD10.
3. La tarea diferencia responsable y destinatario.
4. El destinatario puede ser cliente o interno.
5. La tarea conserva historial de reasignacion.
6. Una tarea puede existir sin agenda.
7. Una tarea puede vincularse a agenda y OT sin que MOD11 lea tablas MOD09.
8. Tecnicos y contratistas no ven tareas ajenas.
9. OpenAPI refleja endpoints y contratos nuevos.
10. Tests backend, frontend y E2E focalizados quedan en verde o con bloqueo documentado.
11. Una solicitud de informacion comercial puede registrarse sin crear `Ticket`.
12. Una solicitud con trabajo ejecutable no puede completarse sin `Task`.
13. La UI de agenda no puede obligar fecha y hora para tareas con `executionMode` inmediato o con solo fecha objetivo.

---

## 9. Dependencias y riesgos

| Dependencia / riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Nuevo bounded context no aprobado | Alto | Requiere ADR-046 y decision CTO antes de ejecucion productiva |
| Solapamiento conceptual con MOD10 | Alto | Definir que ticket es intake y task es ejecucion |
| Solapamiento conceptual con MOD09 | Alto | Mantener `WorkOrderTask` como subtarea de OT y no como tarea universal |
| Duplicacion de estados entre ticket y tarea | Medio | Separar estado del caso vs estado del trabajo |
| Riesgo de PII en labels o descripcion | Alto | Sanitizar logs, labels y contratos |
| PRD maestro aun sin MOD11 | Medio | Mantener trazabilidad local y actualizar master tras aprobacion |

---

## 10. Definition of Done

- ADR-046 emitido y revisado.
- Spec, PRD, HLD e informe de definicion alineados.
- Boundary `TasksModule` definido sin contradiccion con ADR-037 y ADR-038.
- Modelo de datos borrador validado para multi-tenant por schema.
- Contratos REST y reglas de acceso definidos.
- Trazabilidad explicita con MOD10 y MOD09.
- Sin PII real ni secretos en artefactos.
