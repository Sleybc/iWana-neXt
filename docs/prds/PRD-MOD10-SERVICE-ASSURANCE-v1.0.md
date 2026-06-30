# PRD - MOD10 Service Assurance / Mesa de Ayuda

**Version:** 1.1  
**Estado:** En revisión  
**Fecha:** 2026-06-22  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Clasificacion:** Confidencial - Uso Interno  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md, docs/ideas/mesa_de_ayuda.md  
**Referencias relacionadas:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md, docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md, docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md

> Nota de numeración: el PRD maestro ubica Service Assurance como prioridad 7 del roadmap MVP. El repositorio vigente ya asignó `MOD07` a Taxation y `MOD09` a Programacion / WFM; por consistencia documental este paquete usa `MOD10-SERVICE-ASSURANCE`. Si el CTO decide renumerar módulos, este PRD deberá actualizarse junto con HLD, ADR, plan y prompt.

---

## 1. Contexto y motivacion

Los ISPs operan soporte por WhatsApp, llamadas, CRM, hojas de cálculo y conocimiento informal. Esto produce poca trazabilidad, SLA no medible, escalamientos manuales y mala visibilidad del historial del suscriptor.

MOD10 Service Assurance / Mesa de Ayuda centraliza tickets, SLA, PQR CRC y casos internos/externos. Su principio funcional es: resolver en el menor número de clics posible, con el máximo contexto operativo permitido por los boundaries del sistema.

El módulo debe cubrir tickets ligados a suscriptores, usuarios internos, técnicos, contratistas, partners, sistemas automáticos o necesidades generales. Algunos tickets se resuelven desde soporte o NOC; otros requieren trabajo de campo y deben solicitar una Work Order a WFM mediante evento o puerto tipado, sin que Assurance sea dueño de la agenda ni de las órdenes.

Cuando el caso derive en trabajo ejecutable persistente, MOD10 puede originar o vincular una tarea operativa, pero no debe convertirse en owner de la ejecución transversal propuesta para MOD11. El ticket conserva intake, SLA, comunicación y trazabilidad del caso; la tarea concentra el trabajo concreto.

---

## 2. Alcance

### En scope Fase 01

- Ticketing tenant-aware para casos externos e internos.
- Clasificación inicial: incidente, PQR, consulta, solicitud, soporte interno y tarea operativa como origen operativo del caso.
- Vinculación lógica a requester y subject sin FKs cross-module.
- Asignación a agente, equipo funcional o técnico responsable.
- Estados operativos del ticket y transiciones auditables.
- SLA simple por tipo, prioridad y clasificación PQR/no PQR.
- PQR CRC con timestamps de recepción, respuesta y cierre.
- Timeline del ticket con cambios de estado, comentarios, asignaciones y eventos de SLA.
- Decisión explícita de campo: no requiere campo, requiere diagnóstico, requiere Work Order.
- Emisión documentada de `assurance.field-service-needed` hacia WFM.
- Dashboard operativo: abiertos, SLA en riesgo, vencidos, primera respuesta promedio, tickets por cola.
- UI en `apps/portal` para soporte, NOC, admin, técnico y usuarios autorizados.
- Contratos REST bajo `/api/v1/assurance`.

### Fuera de scope Fase 01

- Diagnóstico automático real de red.
- Correlación NMS -> ticket automático.
- Detección automática de incidente masivo.
- IA para resumen, clasificación o respuesta sugerida.
- Integración WhatsApp Business.
- Portal cliente de autogestión completo.
- Compensaciones automáticas por SLA.
- Lectura directa de tablas CRM, Billing, NMS, WFM o Users.
- Ownership de tareas transversales de ejecución operativa; esa capacidad se propone para MOD11.

---

## 3. Personas y casos de uso

| Persona           | Rol           | Necesidad principal                                                  |
| ----------------- | ------------- | -------------------------------------------------------------------- |
| Agente de soporte | SUPPORT       | Crear, clasificar, responder y cerrar tickets con contexto operativo |
| NOC               | NOC           | Atender incidentes técnicos, escalar a campo y registrar diagnóstico |
| Admin ISP         | ADMIN         | Supervisar colas, SLA, PQR y productividad                           |
| Técnico           | TECHNICIAN    | Consultar tickets asignados o relacionados con OTs propias           |
| Contratista       | CONTRACTOR    | Ver tickets asociados a trabajos asignados, con acceso limitado      |
| Usuario interno   | Empleado ISP  | Reportar necesidades internas o soporte de herramientas              |
| Suscriptor        | Cliente       | Crear y seguir tickets propios desde portal futuro                   |
| Soporte iWana     | IWANA_SUPPORT | Diagnóstico técnico sin acceso a PII ni datos financieros            |

| CU    | Actor   | Descripcion                                                |
| ----- | ------- | ---------------------------------------------------------- |
| CU-01 | Soporte | Crear ticket para un suscriptor existente                  |
| CU-02 | Soporte | Crear ticket interno sin cliente asociado                  |
| CU-03 | NOC     | Clasificar incidente técnico y decidir si requiere campo   |
| CU-04 | Soporte | Registrar PQR con deadline CRC                             |
| CU-05 | Admin   | Reasignar ticket entre colas o agentes                     |
| CU-06 | Técnico | Ver ticket vinculado a su trabajo y aportar nota operativa |
| CU-07 | Soporte | Solicitar Work Order a WFM cuando el caso requiere visita  |
| CU-08 | Admin   | Revisar dashboard de SLA y tickets vencidos                |

---

## 4. Requerimientos funcionales

| ID        | Requerimiento                                                                                                                              | Prioridad |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| RF-ASS-01 | Crear tickets externos e internos con requester y subject tipados                                                                          | MVP       |
| RF-ASS-02 | Clasificar tickets como incidente, PQR, consulta, solicitud, soporte interno o tarea operativa                                             | MVP       |
| RF-ASS-03 | Gestionar estados: nuevo, clasificado, en proceso, espera cliente, espera interna, requiere campo, escalado, resuelto, cerrado y cancelado | MVP       |
| RF-ASS-04 | Asignar ticket a usuario responsable y cola funcional                                                                                      | MVP       |
| RF-ASS-05 | Registrar comentarios internos y visibles al cliente                                                                                       | MVP       |
| RF-ASS-06 | Mantener timeline append-only de cambios relevantes                                                                                        | MVP       |
| RF-ASS-07 | Calcular SLA de primera respuesta y resolución por política simple                                                                         | MVP       |
| RF-ASS-08 | Registrar PQR CRC con fechas de recepción, respuesta, recurso y cierre                                                                     | MVP       |
| RF-ASS-09 | Marcar si un ticket requiere Work Order y emitir evento hacia WFM                                                                          | MVP       |
| RF-ASS-10 | Vincular ticket con `workOrderId` devuelto o informado por WFM                                                                             | MVP       |
| RF-ASS-11 | Consultar tickets por filtros: estado, prioridad, tipo, requester, cola, responsable, SLA                                                  | MVP       |
| RF-ASS-12 | Dashboard operativo de tickets, SLA y carga por cola                                                                                       | MVP       |
| RF-ASS-13 | Preparar contratos para ticket creado por NMS en fase futura                                                                               | Fase 2    |
| RF-ASS-14 | Macros y respuestas predefinidas                                                                                                           | Fase 2    |
| RF-ASS-15 | Incidentes masivos y agrupación de tickets similares                                                                                       | Fase 2    |
| RF-ASS-16 | IA para resumen, clasificación y respuesta sugerida                                                                                        | Fase 3    |

---

## 5. Requerimientos no funcionales

- Multi-tenant por schema PostgreSQL; entidades sin schema hardcodeado.
- Validación Zod en boundaries HTTP.
- RBAC con `UserRole.*` y ownership para técnicos/contratistas.
- Sin duplicar PII sensible de CRM; guardar IDs lógicos y snapshots mínimos no sensibles.
- Timeline y eventos funcionales deben ser auditables.
- PQR debe preservar evidencia de timestamps y cambios de estado.
- OpenAPI actualizado para todos los endpoints nuevos.
- Pruebas unitarias, integración tenant-aware y E2E portal para flujo mínimo.
- Logs sin documento, teléfonos, correos, direcciones completas ni contenido sensible del ticket.

---

## 6. Modelo de datos borrador

Todas las tablas viven en el schema del tenant.

### `support_tickets`

| Campo                                    | Tipo                  | Notas                                                                                                   |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                                     | uuid                  | PK                                                                                                      |
| `tenant_id`                              | uuid                  | Aislamiento lógico                                                                                      |
| `code`                                   | varchar(40)           | Consecutivo por tenant, ej. `TK-20260509-001`                                                           |
| `type`                                   | enum                  | `INCIDENT`, `PQR`, `QUESTION`, `REQUEST`, `INTERNAL_SUPPORT`, `OPERATIONAL_TASK`                        |
| `status`                                 | enum                  | Flujo operativo del ticket                                                                              |
| `priority`                               | enum                  | `LOW`, `NORMAL`, `HIGH`, `URGENT`, `CRITICAL`                                                           |
| `source`                                 | enum                  | `MANUAL`, `PORTAL`, `EMAIL`, `NMS`, `WFM`, `MIGRATION`, `INTERNAL`                                      |
| `requester_type`                         | enum                  | `SUBSCRIBER`, `EMPLOYEE`, `TECHNICIAN`, `CONTRACTOR`, `PARTNER`, `SYSTEM`, `EXTERNAL`                   |
| `requester_ref_id`                       | varchar(160) nullable | ID lógico del solicitante                                                                               |
| `subject_type`                           | enum nullable         | `SUBSCRIBER`, `CONTRACT`, `SERVICE`, `NETWORK_NODE`, `DEVICE`, `WORK_ORDER`, `INTERNAL_AREA`, `GENERAL` |
| `subject_ref_id`                         | varchar(160) nullable | ID lógico del objeto afectado                                                                           |
| `queue`                                  | enum                  | `SUPPORT`, `NOC`, `BILLING`, `OPERATIONS`, `SALES`, `ADMIN`, `IWANA_SUPPORT`                            |
| `assigned_user_id`                       | uuid nullable         | Responsable actual                                                                                      |
| `summary`                                | varchar(200)          | Resumen operativo                                                                                       |
| `description`                            | text nullable         | Detalle controlado                                                                                      |
| `field_decision`                         | enum                  | `NOT_REQUIRED`, `NEEDS_DIAGNOSIS`, `FIELD_SERVICE_REQUIRED`                                             |
| `work_order_id`                          | uuid nullable         | Referencia WFM si aplica                                                                                |
| `sla_policy_id`                          | uuid nullable         | Política aplicada                                                                                       |
| `first_response_due_at`                  | timestamptz nullable  | SLA primera respuesta                                                                                   |
| `resolution_due_at`                      | timestamptz nullable  | SLA resolución                                                                                          |
| `first_responded_at`                     | timestamptz nullable  | Evidencia                                                                                               |
| `resolved_at`                            | timestamptz nullable  | Evidencia                                                                                               |
| `closed_at`                              | timestamptz nullable  | Cierre                                                                                                  |
| `created_by`, `updated_by`               | uuid nullable         | Actor autenticado                                                                                       |
| `created_at`, `updated_at`, `deleted_at` | timestamptz           | Auditoría técnica                                                                                       |

### `ticket_comments`

Comentarios internos o visibles al cliente. Campo `visibility`: `INTERNAL`, `REQUESTER_VISIBLE`.

### `ticket_timeline_events`

Historial append-only. Registra creación, clasificación, asignación, comentario, transición, SLA, escalamiento y vínculos WFM.

### `ticket_sla_policies`

Políticas configurables por tenant para tipo, prioridad y cola. Fase 01 puede sembrar defaults editables por admin.

### `ticket_pqr_records`

Extensión uno-a-uno para tickets `PQR`: tipo PQR, fecha recepción, deadline respuesta, deadline recurso, canal, estado regulatorio y evidencia textual mínima.

### `ticket_work_order_links`

Vínculos entre ticket y Work Order. Permite historial cuando una solicitud de campo se cancela, reintenta o reemplaza.

---

## 7. Contratos de API borrador

Base path: `/api/v1/assurance`.

| Metodo | Ruta                                 | Uso                               | Roles                                                      |
| ------ | ------------------------------------ | --------------------------------- | ---------------------------------------------------------- |
| GET    | `/tickets`                           | Listar tickets con filtros        | ADMIN, SUPPORT, NOC, TECHNICIAN, CONTRACTOR, IWANA_SUPPORT |
| POST   | `/tickets`                           | Crear ticket                      | ADMIN, SUPPORT, NOC, SALES, TECHNICIAN                     |
| GET    | `/tickets/:id`                       | Detalle                           | ADMIN, SUPPORT, NOC, TECHNICIAN, CONTRACTOR, IWANA_SUPPORT |
| PATCH  | `/tickets/:id`                       | Editar campos abiertos permitidos | ADMIN, SUPPORT, NOC                                        |
| PATCH  | `/tickets/:id/status`                | Transicionar estado               | ADMIN, SUPPORT, NOC, TECHNICIAN                            |
| POST   | `/tickets/:id/comments`              | Agregar comentario                | ADMIN, SUPPORT, NOC, TECHNICIAN, CONTRACTOR                |
| POST   | `/tickets/:id/assign`                | Asignar responsable/cola          | ADMIN, SUPPORT, NOC                                        |
| POST   | `/tickets/:id/request-field-service` | Solicitar OT a WFM                | ADMIN, SUPPORT, NOC                                        |
| POST   | `/tickets/:id/link-work-order`       | Asociar Work Order existente      | ADMIN, SUPPORT, NOC                                        |
| GET    | `/dashboard/summary`                 | KPIs operativos                   | ADMIN, SUPPORT, NOC                                        |
| GET    | `/sla-policies`                      | Listar políticas SLA              | ADMIN, SUPPORT, NOC                                        |
| POST   | `/sla-policies`                      | Crear política SLA                | ADMIN                                                      |

Reglas de acceso:

- Técnicos y contratistas solo ven tickets asignados a ellos o vinculados a una Work Order propia según contrato WFM.
- IWANA_SUPPORT solo accede a metadatos técnicos y diagnóstico permitido; no debe ver contenido con PII ni financiero.
- El portal cliente futuro solo podrá consultar tickets propios mediante endpoint específico fuera de Fase 01.

---

## 8. Criterios de aceptacion

1. Un usuario SUPPORT/NOC/ADMIN puede crear ticket externo o interno.
2. El ticket conserva requester y subject tipados sin FKs cross-module.
3. Un ticket PQR calcula y persiste deadlines CRC iniciales.
4. Un ticket no PQR calcula SLA de primera respuesta y resolución.
5. Las transiciones inválidas son rechazadas con error semántico.
6. Comentarios internos no se marcan como visibles al solicitante por defecto.
7. La decisión `FIELD_SERVICE_REQUIRED` emite evento o contrato hacia WFM.
8. Un `workOrderId` puede asociarse al ticket sin leer tablas WFM.
9. El timeline registra creación, asignación, comentarios, transiciones y solicitud de campo.
10. Técnicos/contratistas no ven tickets ajenos.
11. Dashboard muestra abiertos, en riesgo, vencidos y carga por cola.
12. Tests unitarios, integración tenant-aware y E2E focalizado quedan ejecutados o bloqueados con evidencia.

---

## 9. Dependencias y riesgos

| Dependencia / riesgo                          | Impacto | Mitigacion                                                                   |
| --------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Nuevo bounded context                         | Alto    | ADR-038 debe ser aprobado antes de ejecución productiva                      |
| Separación futura ticket vs tarea operativa   | Alto    | Mantener el ticket como owner del caso y referenciar MOD11 para ejecución    |
| Numeración documental difiere del PRD maestro | Medio   | Usar MOD10 y dejar nota de trazabilidad                                      |
| WFM ya existe como owner de Work Orders       | Alto    | Assurance solo solicita o vincula OT; no agenda ni ejecuta trabajos          |
| PII de clientes en tickets                    | Alto    | Guardar referencias y contenido mínimo; sanitizar logs                       |
| PQR CRC requiere precisión legal              | Alto    | Basarse en PRD vigente y marcar cambios normativos como verificación oficial |
| UI puede volverse demasiado compleja          | Medio   | Fase 01 con lista operativa, kanban simple y drawer                          |
| Integraciones NMS/WhatsApp no listas          | Bajo    | Diferir a Fase 02 como fuentes futuras                                       |

---

## 10. Definition of Done

- ADR-038 aprobado por CTO antes de ejecución productiva.
- PRD, HLD, spec, plan y prompt alineados.
- Backend NestJS con `AssuranceModule` y endpoints `/api/v1/assurance`.
- Migraciones TypeORM reversibles para tablas tenant.
- UI portal `/dashboard/assurance` operativa y en español.
- OpenAPI actualizado.
- Tests backend y frontend focalizados en verde.
- E2E portal para crear, clasificar, comentar y solicitar campo.
- Informe de fase en `docs/informes/` y checklist en `docs/quality/`.
- Sin acceso directo a tablas de otros módulos.
- Sin PII real ni secretos en código, tests, logs o documentación.
