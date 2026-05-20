# PRD - MOD09 Programacion / WFM

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md  
**Spec de origen:** docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**ADR aprobado:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md  
**Plan relacionado:** docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md  
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md

> Aprobacion CTO registrada: ADR-037 autoriza `WfmModule` como nuevo bounded context para MOD09 Programacion / WFM.

---

## 1. Contexto y motivacion

iWana neXt necesita un modulo operativo para programar y ejecutar visitas, instalaciones, soporte, retiros y mantenimientos de campo. El PRD maestro define WFM como parte del alcance integral OSS/BSS del ISP y lo ubica como puente entre CRM, Provisioning, Service Assurance e Inventory.

El estado actual del sistema ya prepara este flujo:

- MOD04 gestiona usuarios internos con roles `TECHNICIAN`, `SUPPORT`, `NOC` y `CONTRACTOR`.
- MOD05 CRM define el pipeline `LISTO_PARA_INSTALACION -> INSTALACION_AGENDADA` y referencias operativas `ticketId` / `workOrderId`.
- CRM tiene puertos stub para tickets y work orders, pero no es owner de agenda ni de ejecucion tecnica.
- El PRD maestro exige que Lead-to-Cash y Trouble-to-Resolve generen trabajo de campo cuando corresponde.

MOD09 resuelve esta brecha creando una agenda operativa tenant-aware con Work Orders ligeras. La primera fase prioriza programacion por horas, dias, semanas y meses, evitando incluir todavia materiales, firma digital, evidencias fotograficas completas, mapa de cuadrillas o app movil nativa.

---

## 2. Alcance en scope / fuera de scope

### En scope Fase 01

- Crear el bounded context `WfmModule` en backend, con subdominio de programacion.
- Crear eventos de agenda por rango horario.
- Consultar agenda por dia, semana, mes y lista mediante filtros por rango.
- Crear Work Order ligera asociada a un evento.
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
- Activacion automatica de subscriber, contrato o provisioning desde cierre de OT.

---

## 3. Personas y casos de uso

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Coordinador operativo | ADMIN, NOC, SUPPORT | Programar, reasignar y monitorear trabajos tecnicos |
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

---

## 4. Requerimientos funcionales

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-WFM-01 | Crear eventos de agenda con tipo, horario, tecnico, direccion y referencias operativas opcionales. | MVP |
| RF-WFM-02 | Crear o asociar una Work Order ligera al evento programado. | MVP |
| RF-WFM-03 | Listar eventos por rango temporal para vistas dia, semana, mes y lista. | MVP |
| RF-WFM-04 | Filtrar agenda por tecnico, tipo, estado, municipio y referencia. | MVP |
| RF-WFM-05 | Rechazar solapamientos activos por tecnico, salvo override administrativo documentado si se habilita. | MVP |
| RF-WFM-06 | Reagendar eventos con motivo obligatorio, notas opcionales e historial append-only. | MVP |
| RF-WFM-07 | Cambiar estado de agenda: `DRAFT`, `SCHEDULED`, `EN_ROUTE`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`, `NO_SHOW`. | MVP |
| RF-WFM-08 | Cambiar estado de Work Order ligera: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `DONE`, `CANCELLED`. | MVP |
| RF-WFM-09 | Restringir visibilidad de `TECHNICIAN` y `CONTRACTOR` solo a trabajos asignados. | MVP |
| RF-WFM-10 | Consultar dashboard summary con trabajos de hoy, atrasados, proximos y carga por tecnico. | MVP |
| RF-WFM-11 | Registrar disponibilidad/bloqueos puntuales de tecnico. | MVP |
| RF-WFM-12 | Exponer contrato para que CRM reemplace el stub de Work Order sin acceso directo a tablas WFM. | MVP |
| RF-WFM-13 | Emitir o preparar eventos de dominio para integraciones futuras con Inventory y Service Assurance. | Fase 2 |
| RF-WFM-14 | Soportar evidencias, firma y materiales de trabajo. | Fase 2 |
| RF-WFM-15 | Soportar mapa operativo y geofencing. | Fase 3 |

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

---

## 6. Modelo de datos borrador

### Entidades Fase 01

| Entidad | Tabla | Proposito |
| --- | --- | --- |
| `ScheduleEvent` | `schedule_events` | Bloque horario de agenda operativa |
| `WorkOrder` | `work_orders` | Orden de trabajo ligera |
| `WorkOrderTask` | `work_order_tasks` | Tarea interna ejecutable de la orden |
| `ScheduleRescheduleLog` | `schedule_reschedule_logs` | Historial de reagendamientos |
| `TechnicianAvailability` | `technician_availability` | Bloqueos o disponibilidad puntual |

Campos, indices y enums quedan detallados en `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md` y en el HLD MOD09.

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
| GET | `/events` | Listar eventos por rango y filtros |
| POST | `/events` | Crear evento con Work Order ligera opcional |
| GET | `/events/:id` | Obtener detalle de evento |
| PATCH | `/events/:id` | Actualizar evento editable |
| PATCH | `/events/:id/status` | Cambiar estado operativo |
| POST | `/events/:id/reschedule` | Reagendar evento |
| DELETE | `/events/:id` | Cancelar logicamente evento |
| GET | `/work-orders` | Listar ordenes |
| GET | `/work-orders/:id` | Obtener detalle de orden |
| PATCH | `/work-orders/:id/status` | Cambiar estado de orden |
| GET | `/dashboard/summary` | Resumen operativo |
| GET | `/technicians/availability` | Consultar disponibilidad/bloqueos |
| POST | `/technicians/availability` | Crear bloqueo o disponibilidad puntual |

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

---

## 10. Definition of Done

- ADR-037 aprobado por CTO antes de ejecucion productiva.
- HLD y PRD MOD09 en estado aprobado o aprobado para ejecucion.
- Migracion tenant reversible creada y validada.
- Backend NestJS con endpoints REST protegidos y OpenAPI actualizado.
- Frontend Next.js en portal con agenda dia/semana/mes/lista.
- Validacion Zod en create/update/status/reschedule/availability.
- Tests unitarios e integracion backend cubren reglas core.
- Tests frontend cubren formularios, labels, filtros y ownership visible.
- E2E Playwright cubre crear, reagendar y completar evento.
- Sin PII real, secretos ni logs sensibles.
- Informe de fase actualizado en `docs/informes/`.
- Evidencia de calidad registrada en `docs/quality/`.
