# PRD - MOD09 Programacion / WFM

**Version:** 1.3  
**Estado:** Aprobado  
**Fecha:** 2026-06-24  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md  
**Spec de origen:** docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md  
**Spec complementaria:** docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**ADR aprobado:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md  
**ADR complementario:** docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md  
**ADR de evolucion de boundary:** docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md  
**Plan relacionado:** docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md  
**Plan complementario:** docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md  
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md  
**Prompt complementario:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md  
**Informe vivo relacionado:** docs/informes/INFORME-MOD09-FASE-02-v1.0.md

> Aprobacion CTO registrada: ADR-037 autoriza `WfmModule` como nuevo bounded context para MOD09 Programacion / WFM.
> Consolidacion documental 2026-06-23: este PRD absorbe el alcance funcional que antes estaba separado en un addendum de command center y queda como fuente canonica unica de MOD09.
> Correccion documental 2026-06-24: `Programacion` se reafirma como centro de agendamiento; la OT enriquecida de campo queda fuera de este boundary y se transfiere a MOD11 segun ADR-047. La `WorkOrder` de WFM se interpreta desde ahora como artefacto ligero/transitorio de compatibilidad o handoff.

---

## 1. Contexto y motivacion

iWana neXt necesita un modulo operativo para programar y ejecutar visitas, instalaciones, soporte, retiros y mantenimientos de campo. El PRD maestro define WFM como parte del alcance integral OSS/BSS del ISP y lo ubica como puente entre CRM, Provisioning, Service Assurance e Inventory.

El estado actual del sistema ya prepara este flujo:

- MOD04 gestiona usuarios internos con roles `TECHNICIAN`, `SUPPORT`, `NOC` y `CONTRACTOR`.
- MOD05 CRM define el pipeline `LISTO_PARA_INSTALACION -> INSTALACION_AGENDADA` y referencias operativas `ticketId` / `workOrderId`.
- CRM tiene puertos stub para tickets y work orders, pero no es owner de agenda ni de ejecucion tecnica.
- El PRD maestro exige que Lead-to-Cash y Trouble-to-Resolve generen trabajo de campo cuando corresponde.

MOD09 resuelve esta brecha creando una agenda operativa tenant-aware con Work Orders ligeras/transitorias para continuidad operativa. La primera fase prioriza programacion por horas, dias, semanas y meses, evitando incluir todavia materiales, firma digital, evidencias fotograficas completas, mapa de cuadrillas o app movil nativa.

Desde la aprobacion de MOD11 Ejecucion Operativa / Tareas, queda explicito que MOD09 no absorbe el ownership del trabajo ejecutable transversal. `WfmModule` sigue siendo owner de la agenda (`ScheduleEvent`), la Work Order ligera/transitoria y la supervision operativa. Cuando una tarea u OT de MOD11 requiera compromiso temporal, la agenda se crea o vincula en MOD09 sin mover el ownership del calendario ni de la ejecucion de campo a `WfmModule`.

---

## 2. Alcance en scope / fuera de scope

### En scope Fase 01

- Crear el bounded context `WfmModule` en backend, con subdominio de programacion.
- Crear eventos de agenda por rango horario.
- Consultar agenda por dia, semana, mes y lista mediante filtros por rango.
- Crear o asociar Work Order ligera/transitoria asociada a un evento cuando el handoff operativo aun dependa de WFM.
- Asignar eventos y ordenes a usuarios internos o contratistas autorizados.
- Validar solapamientos por tecnico en eventos activos.
- Reagendar eventos con motivo obligatorio e historial append-only.
- Cambiar estado operativo de eventos y Work Orders.
- Consultar dashboard operativo basico.
- Exponer API REST versionada bajo `/api/v1/wfm`.
- Implementar UI en `apps/portal` con calendario dia/semana/mes/lista.
- Proteger rutas con JWT, RBAC, TenantContext y validacion Zod.
- Cubrir tests unitarios, integracion y E2E basico.

### Fuera de scope Fase 01

- Consumo real de inventario y materiales.
- Equipos instalados/retirados con transferencia automatica de responsabilidad.
- Firma digital del cliente.
- Evidencias fotograficas con Media Assets.
- Check-in/out geolocalizado y geofencing.
- Mapa de cuadrillas por proximidad.
- Portal contratista dedicado.
- App movil nativa.
- Motor SLA completo de Service Assurance.
- Activacion automatica de subscriber, contrato o provisioning desde cierre de OT enriquecida.

### En scope Fase 02 - command center

- Convertir `/dashboard/scheduling` en una entrada de supervision operativa para roles de coordinacion.
- Incorporar una vista `command-center` o equivalente dentro de la superficie actual de scheduling.
- Mostrar KPIs priorizados: trabajos activos, atrasados, proximos, en ruta y en riesgo.
- Exponer alertas operativas derivadas de reglas deterministicas sobre agenda y disponibilidad.
- Mostrar timeline diario por tecnico con foco en supervision, no en edicion drag-and-drop.
- Mostrar carga operativa y banda de saturacion por tecnico.
- Permitir abrir detalle de evento, reagendar y avanzar estados desde la misma superficie existente.
- Reutilizar endpoints actuales de eventos y disponibilidad, extendiendo el dashboard summary solo si es necesario.
- Mantener vistas calendario y lista actuales como vistas secundarias, no eliminarlas.
- Cubrir pruebas backend, frontend y E2E focalizadas de la nueva experiencia.

### Fuera de scope Fase 02 - command center

- Mapa operativo o georreferenciacion visual.
- GPS en tiempo real, WebSocket, SSE o telemetria continua.
- Motor de optimizacion de rutas o sugerencias IA.
- Kanban operacional.
- Capacity planning por zona.
- App movil tecnica, firma, evidencias, materiales o inventario.
- Nuevas tablas persistentes para alertas o timeline.
- Cambio de ruta principal fuera de `/dashboard/scheduling`.

### Guardrails de boundary consolidados

- MOD09 sigue siendo owner de agenda, `ScheduleEvent`, Work Order ligera/transitoria y supervision operativa.
- MOD10 sigue siendo owner de tickets y trazabilidad del caso.
- MOD11 puede originar trabajo ejecutable, agenda opcional y OT enriquecida, pero no reemplaza la agenda como capability de WFM.
- La UI de `Programacion` puede crear agenda directa o agenda derivada de tarea, siempre conservando a MOD09 como owner del evento programado.
- Materiales, equipos usados, evidencias y cierre tecnico profundo quedan fuera de `Programacion` y pertenecen al owner de OT enriquecida definido en ADR-047.

---

## 3. Personas y casos de uso

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Coordinador operativo | ADMIN, NOC, SUPPORT | Programar, reasignar y monitorear trabajos tecnicos |
| Supervisor de tecnicos | ADMIN, NOC | Ver saturacion por tecnico y reordenar trabajo desde la agenda existente |
| Tecnico de campo | TECHNICIAN | Ver agenda propia y actualizar estados de ejecucion |
| Contratista | CONTRACTOR | Consultar y avanzar trabajos asignados con acceso restringido |
| Asesor comercial | SALES | Solicitar programacion de instalacion desde expediente listo |
| Agente de soporte | SUPPORT | Programar visita cuando un caso requiere campo |

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-WFM-01 | Coordinador | Crear evento programado con tecnico, horario, tipo y direccion |
| CU-WFM-02 | Coordinador | Ver agenda por dia, semana, mes y lista |
| CU-WFM-03 | Coordinador | Evitar choque de agenda por tecnico |
| CU-WFM-04 | Coordinador | Reagendar evento con motivo obligatorio |
| CU-WFM-05 | Tecnico | Ver trabajos asignados del dia |
| CU-WFM-06 | Tecnico | Marcar en ruta, iniciar, completar o reportar no realizado |
| CU-WFM-07 | Soporte | Crear visita tecnica vinculada a ticket o referencia externa |
| CU-WFM-08 | Ventas | Programar instalacion vinculada a expediente listo |
| CU-WFM-09 | Admin | Ver resumen de carga por tecnico y trabajos atrasados |
| CU-WFM-10 | Coordinador | Abrir el command center y entender el estado operativo del dia en menos de 10 segundos |
| CU-WFM-11 | Coordinador | Identificar eventos atrasados o en riesgo y abrir su detalle directamente |
| CU-WFM-12 | Supervisor | Ver saturacion por tecnico y filtrar la agenda por responsable |
| CU-WFM-13 | Coordinador | Navegar entre command center, calendario y lista sin perder filtros |
| CU-WFM-14 | Tecnico | Seguir viendo solo su agenda asignada, sin superficie de supervision innecesaria |

---

## 4. Requerimientos funcionales

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-WFM-01 | Crear eventos de agenda con tipo, horario, tecnico, direccion y referencias operativas opcionales. | MVP |
| RF-WFM-02 | Crear, asociar o mantener una Work Order ligera/transitoria al evento programado mientras el handoff hacia MOD11 aun requiera compatibilidad operativa. | MVP |
| RF-WFM-03 | Listar eventos por rango temporal para vistas dia, semana, mes y lista. | MVP |
| RF-WFM-04 | Filtrar agenda por tecnico, tipo, estado, municipio y referencia. | MVP |
| RF-WFM-05 | Rechazar solapamientos activos por tecnico sin excepciones administrativas recurrentes en WFM. | MVP |
| RF-WFM-06 | Reagendar eventos con motivo obligatorio, notas opcionales e historial append-only. | MVP |
| RF-WFM-07 | Cambiar estado de agenda: `DRAFT`, `SCHEDULED`, `EN_ROUTE`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`, `NO_SHOW`. | MVP |
| RF-WFM-08 | Cambiar estado de Work Order ligera solo como compatibilidad transitoria de WFM, sin absorber el ciclo de vida final de la OT enriquecida. | MVP |
| RF-WFM-09 | Restringir visibilidad de `TECHNICIAN` y `CONTRACTOR` solo a trabajos asignados. | MVP |
| RF-WFM-10 | Consultar dashboard summary con trabajos de hoy, atrasados, proximos y carga por tecnico. | MVP |
| RF-WFM-11 | Registrar disponibilidad/bloqueos puntuales de tecnico solo como control operativo interno de agenda; no como permisos, licencias ni excepciones recurrentes visibles en configuracion. | MVP |
| RF-WFM-12 | Exponer contrato para que CRM reemplace el stub de Work Order sin acceso directo a tablas WFM. | MVP |
| RF-WFM-13 | Emitir o preparar eventos de dominio para integraciones futuras con Inventory y Service Assurance. | Fase 2 |
| RF-WFM-14 | Integrarse con el owner de OT enriquecida para reflejar evidencias, firma y materiales sin convertir a WFM en owner de esos datos. | Fase 2 |
| RF-WFM-15 | Soportar mapa operativo y geofencing. | Fase 3 |
| RF-WFM-16 | Rechazar crear, reagendar o agendar visita con `scheduledStartAt` anterior al instante actual. | Operativo |
| RF-WFM-17 | La UI debe ofrecer una vista operacional priorizada para supervision dentro de la ruta actual de scheduling. | MVP |
| RF-WFM-18 | El dashboard summary debe exponer contadores priorizados y carga por tecnico suficiente para supervision diaria. | MVP |
| RF-WFM-19 | El sistema debe derivar alertas operativas sin persistencia nueva, usando reglas sobre estado, horario y disponibilidad. | MVP |
| RF-WFM-20 | La vista timeline debe mostrar eventos por tecnico para el dia seleccionado, con posicion temporal y severidad visual. | MVP |
| RF-WFM-21 | Un coordinador debe poder abrir el detalle de un evento desde KPI, alerta o timeline. | MVP |
| RF-WFM-22 | La vista debe resaltar tecnicos con banda de saturacion `LOW`, `MEDIUM` o `HIGH`. | MVP |
| RF-WFM-23 | La experiencia debe mantener filtros sincronizados entre vista operacional, calendario y lista. | MVP |
| RF-WFM-24 | Los roles `TECHNICIAN` y `CONTRACTOR` no deben ver indicadores globales ni alertas fuera de su ownership aprobado. | MVP |
| RF-WFM-25 | El command center debe renderizar estados vacios y cobertura parcial sin romper la experiencia. | MVP |
| RF-WFM-26 | La supervision operativa no debe introducir drag-and-drop, mapa ni algoritmos de dispatch automatico en esta fase. | MVP |

---

## 5. Requerimientos no funcionales

| ID | Requerimiento | Criterio |
| --- | --- | --- |
| RNF-WFM-01 | Multi-tenancy por schema | Todas las tablas operan en schema tenant via `SET LOCAL search_path`. |
| RNF-WFM-02 | Boundaries Modulith | MOD09 no lee tablas de CRM, Assurance, Provisioning ni Inventory. Usa puertos/eventos. |
| RNF-WFM-03 | Seguridad | JWT + RBAC + regla de ownership para tecnicos/contratistas. |
| RNF-WFM-04 | Validacion | Zod en todos los boundaries de entrada. |
| RNF-WFM-05 | Auditoria | CUD auditable y reagendamientos append-only. |
| RNF-WFM-06 | Privacidad | No duplicar PII de suscriptores; usar referencias logicas y campos operativos minimos. |
| RNF-WFM-07 | Rendimiento | Listado por rango con indices por tenant, fecha, tecnico y estado. |
| RNF-WFM-08 | Accesibilidad UI | Portal WCAG 2.2 AA, textos visibles en espanol y tablas con `align-middle`. |
| RNF-WFM-09 | Migraciones | TypeORM migrations reversibles; prohibido `synchronize: true`. |
| RNF-WFM-10 | Observabilidad | Logs sin PII, errores semanticos y metricas basicas preparadas para dashboard. |
| RNF-WFM-11 | Sin cambio de boundary | Todo sigue dentro de `WfmModule` y `apps/portal`; no se abre ADR nuevo por command center. |
| RNF-WFM-12 | Sin nueva infraestructura runtime | No introducir WebSocket, SSE, colas nuevas ni dependencias de mapa. |
| RNF-WFM-13 | Rendimiento de supervision | La vista operacional debe cargar sobre la misma base de consultas ya aprobada para scheduling. |
| RNF-WFM-14 | Resiliencia | Si summary o availability fallan, la pantalla debe degradarse con estado parcial, sin caida total. |
| RNF-WFM-15 | Seguridad de ownership | Roles restringidos solo consumen datos ya permitidos por ownership backend. |

---

## 6. Modelo de datos borrador

### Entidades Fase 01

| Entidad | Tabla | Proposito |
| --- | --- | --- |
| `ScheduleEvent` | `schedule_events` | Bloque horario de agenda operativa |
| `WorkOrder` | `work_orders` | Orden de trabajo ligera |
| `WorkOrderTask` | `work_order_tasks` | Tarea interna ejecutable de la orden |
| `ScheduleRescheduleLog` | `schedule_reschedule_logs` | Historial de reagendamientos |
| `TechnicianAvailability` | `technician_availability` | Bloqueos o disponibilidad puntual de agenda, sin representar permisos o licencias formales |

Campos, indices y enums quedan detallados en `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md` y en el HLD MOD09.

### Extensiones derivadas Fase 02

La Fase 02 no agrega tablas nuevas ni altera el modelo persistente de MOD09.

Se autorizan extensiones aditivas del contrato `WfmDashboardSummary`, incluyendo:

- `activeCount`
- `atRiskCount`
- `enRouteCount`
- `alerts[]`
- campos adicionales en `technicianLoad[]` para banda de saturacion, conteo vencido y minutos programados

Las alertas del command center son derivadas y no persistentes.

### Enums compartidos sugeridos

- `WfmWorkType`
- `ScheduleEventStatus`
- `WorkOrderStatus`
- `WorkOrderTaskStatus`
- `WorkOrderPriority`
- `WorkOrderSourceContext`
- `TechnicianAvailabilityType`

---

## 7. Contratos de API borrador

Rutas recomendadas bajo `/api/v1/wfm`.

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/events` | Listar eventos por rango y filtros; fuente canonica de calendario, lista y timeline diario |
| POST | `/events` | Crear evento con Work Order ligera opcional |
| GET | `/events/:id` | Obtener detalle de evento |
| PATCH | `/events/:id` | Actualizar evento editable |
| PATCH | `/events/:id/status` | Cambiar estado operativo |
| POST | `/events/:id/reschedule` | Reagendar evento |
| DELETE | `/events/:id` | Cancelar logicamente evento |
| GET | `/work-orders` | Listar ordenes |
| GET | `/work-orders/:id` | Obtener detalle de orden |
| PATCH | `/work-orders/:id/status` | Cambiar estado de orden |
| GET | `/dashboard/summary` | Resumen operativo y KPIs priorizados del command center |
| GET | `/technicians/availability` | Consultar disponibilidad/bloqueos y cruces simples de supervision |
| POST | `/technicians/availability` | Crear bloqueo o disponibilidad puntual |

Los contratos de excepciones recurrentes por tecnico en settings quedan fuera del alcance vigente de WFM segun ADR-041. Las ausencias personales aprobadas pertenecen al future owner de Recursos Humanos.

Regla de contrato consolidada:

- no crear endpoint nuevo si la necesidad puede resolverse ampliando `GET /dashboard/summary` y reutilizando `GET /events`;
- si se requieren query params para supervision diaria, deben ser aditivos y compatibles hacia atras.

Todos los endpoints deben documentarse con Swagger/OpenAPI y usar DTOs tipados con validacion Zod.

---

## 8. Criterios de aceptacion

| CA | Criterio |
| --- | --- |
| CA-WFM-01 | Un usuario ADMIN/NOC/SUPPORT puede crear un evento programado con Work Order ligera. |
| CA-WFM-02 | El backend rechaza un evento que se solapa con otro evento activo del mismo tecnico. |
| CA-WFM-03 | La agenda se consulta por rango para vistas dia, semana y mes. |
| CA-WFM-04 | Un tecnico solo ve y avanza trabajos asignados a su usuario. |
| CA-WFM-05 | Un contratista solo ve y avanza trabajos asignados a su usuario. |
| CA-WFM-06 | Reagendar exige motivo y crea registro en `schedule_reschedule_logs`. |
| CA-WFM-07 | Un evento puede avanzar hasta `COMPLETED` y su Work Order hasta `DONE`. |
| CA-WFM-08 | El dashboard summary muestra trabajos de hoy, atrasados, proximos y carga por tecnico. |
| CA-WFM-09 | Los datos de un tenant no aparecen al consultar desde otro schema. |
| CA-WFM-10 | La UI del portal permite crear, filtrar, reagendar y completar un evento basico. |
| CA-WFM-11 | OpenAPI refleja todos los endpoints nuevos. |
| CA-WFM-12 | Tests backend, frontend y E2E focalizados quedan en verde. |
| CA-WFM-13 | El backend y el portal rechazan persistir o confirmar agendas con inicio en el pasado. |
| CA-WFM-14 | Un usuario ADMIN/NOC/SUPPORT puede abrir una vista operacional con KPIs y alertas sobre la agenda existente. |
| CA-WFM-15 | La vista timeline del dia agrupa eventos por tecnico y permite abrir el detalle de un evento. |
| CA-WFM-16 | La UI resalta tecnicos con saturacion alta usando datos del summary sin requerir infraestructura nueva. |
| CA-WFM-17 | Las alertas se calculan con reglas deterministicas y no requieren tabla nueva. |
| CA-WFM-18 | Un `TECHNICIAN` no visualiza KPIs globales ni alertas fuera de su ownership. |
| CA-WFM-19 | Si falla una fuente secundaria, la pantalla informa cobertura parcial y mantiene operativa la vista. |
| CA-WFM-20 | Calendario y lista actuales siguen disponibles y comparten filtros con la nueva vista. |
| CA-WFM-21 | El flujo consolidado permite que WFM siga creando o vinculando agenda aunque el trabajo se origine en CRM, soporte o MOD11. |

---

## 9. Dependencias y riesgos

| Dependencia / riesgo | Estado | Mitigacion |
| --- | --- | --- |
| ADR-037 requerido por nuevo bounded context | Aprobado CTO | Ejecutar Fase 01 bajo el boundary `WfmModule`. |
| Service Assurance aun no existe | Controlado | Aceptar `ticketId` como referencia externa sin validacion real. |
| Inventory aun no existe | Controlado | No implementar materiales en Fase 01. |
| CRM exige `ticketId` + `workOrderId` para `INSTALACION_AGENDADA` | Medio | Fase 01 crea `workOrderId`; ticket puede permanecer referencia externa/stub hasta Assurance. |
| PII de contacto en agenda | Alto | No duplicar telefonos/documentos; resolver por puerto futuro si se requiere. |
| Solapamientos por timezone | Medio | Persistir `timestamptz`; UI usa zona local del navegador; backend valida instantes UTC. |
| Portal contratista dedicado no existe | Bajo | Reusar portal empresarial con ownership estricto en Fase 01. |
| Summary actual insuficiente para supervision | Controlado | Ampliar `WfmDashboardSummary` sin romper consumidores existentes. |
| Roles restringidos viendo mas de lo debido | Alto | Reusar ownership backend y gating UI explicito en command center. |
| Confusion entre agenda y tarea tras MOD11 | Medio | Mantener explicitamente que agenda pertenece a MOD09 y trabajo ejecutable transversal a MOD11. |

---

## 10. Definition of Done

- ADR-037 aprobado por CTO antes de ejecucion productiva.
- HLD y PRD MOD09 en estado aprobado o aprobado para ejecucion.
- Migracion tenant reversible creada y validada.
- Backend NestJS con endpoints REST protegidos y OpenAPI actualizado.
- Frontend Next.js en portal con agenda dia/semana/mes/lista y command center liviano de supervision.
- Validacion Zod en create/update/status/reschedule/availability.
- Tests unitarios e integracion backend cubren reglas core.
- Tests frontend cubren formularios, labels, filtros y ownership visible.
- E2E Playwright cubre crear, reagendar y completar evento.
- E2E y pruebas focalizadas cubren command center, filtros compartidos y restriccion por rol.
- Sin PII real, secretos ni logs sensibles.
- Informe de fase actualizado en `docs/informes/`.
- Evidencia de calidad registrada en `docs/quality/`.
