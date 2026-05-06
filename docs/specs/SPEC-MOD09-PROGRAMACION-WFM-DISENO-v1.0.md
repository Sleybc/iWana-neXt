# SPEC - MOD09 Programacion / WFM

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Modo activo:** Mixto  
**Autor:** GitHub Copilot  
**Decision aprobada:** Agenda operativa + Work Order ligera como primer corte  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md  
**Referencias relacionadas:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md, docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md, docs/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md, docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md, docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md, docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md

---

## 1. Proposito

MOD09 Programacion / WFM permite programar, consultar y ejecutar la agenda operativa de visitas, instalaciones, soporte, retiros y mantenimientos del ISP. El primer corte aprobado implementa una agenda por horas, dias, semanas y meses, con Work Orders ligeras vinculadas a eventos programados.

El modulo debe servir como puente operativo entre CRM, Service Assurance, Provisioning, Inventory y Users, manteniendo boundaries explicitos. En esta fase no implementa consumo real de inventario, firma digital, evidencias fotograficas completas ni app movil nativa; esas capacidades se dejan preparadas para fases posteriores.

---

## 2. Contexto documental

El PRD maestro define WFM como modulo propio para ordenes de trabajo, cuadrillas, portal contratista, materiales, firma y productividad. Tambien establece que:

- Lead-to-Cash requiere que un dispatcher asigne cuadrilla por proximidad antes de instalacion.
- Trouble-to-Resolve genera OT WFM cuando un ticket requiere trabajo de campo.
- CRM mantiene referencias operativas (`ticketId`, `workOrderId`) pero no debe ser owner de la agenda.
- MOD04 ya provee usuarios internos con roles `TECHNICIAN`, `SUPPORT`, `NOC` y `CONTRACTOR`.
- MOD05 CRM ya define la transicion `LISTO_PARA_INSTALACION -> INSTALACION_AGENDADA`, condicionada a ticket y orden de trabajo vinculados.

Por lo anterior, Programacion / WFM debe ser un bounded context independiente y no una extension interna de CRM.

---

## 3. Alcance

### En scope Fase 1

- Agenda operativa tenant-aware con vistas por dia, semana y mes.
- Programacion por rango horario con validacion de solapamientos por tecnico/cuadrilla.
- Work Order ligera creada o asociada al evento programado.
- Tipos de trabajo iniciales: instalacion, soporte, visita tecnica, retiro y mantenimiento.
- Estados operativos de agenda y Work Order.
- Asignacion a usuarios internos o contratistas autorizados.
- Reagendamiento con motivo obligatorio e historial.
- Vinculos opcionales a expediente, subscriber, ticket, contrato o referencia externa.
- Dashboard operativo basico: trabajos de hoy, atrasados, proximos y carga por tecnico.
- Endpoints REST protegidos con JWT, RBAC y TenantContext.
- Frontend en `apps/portal` para dispatcher, soporte, NOC, tecnico y admin.

### Fuera de scope Fase 1

- Descuento real de materiales de inventario.
- Equipos instalados/retirados con cambio automatico de responsabilidad.
- Firma digital del cliente.
- Evidencias fotograficas completas con Media Assets.
- App movil nativa React Native.
- Mapa de cuadrillas por proximidad geografica.
- Geofencing y check-in/out geolocalizado.
- Control de vehiculos, SOAT o mantenimientos.
- Motor SLA completo de Service Assurance.

---

## 4. Personas y casos de uso

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Dispatcher / Coordinador operativo | ADMIN, NOC, SUPPORT | Programar y reasignar visitas segun carga operativa |
| Tecnico de campo | TECHNICIAN | Ver trabajos asignados por dia y actualizar estado |
| Contratista | CONTRACTOR | Consultar trabajos asignados con acceso limitado |
| Asesor comercial | SALES | Solicitar programacion de instalacion desde expediente listo |
| Agente de soporte | SUPPORT | Programar visita tecnica cuando un caso requiere campo |

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-01 | Dispatcher | Crear evento de agenda con tecnico, horario, tipo y direccion |
| CU-02 | Dispatcher | Ver agenda por dia, semana y mes |
| CU-03 | Dispatcher | Detectar y evitar choques de horario por tecnico |
| CU-04 | Dispatcher | Reagendar visita con motivo y notas |
| CU-05 | Tecnico | Consultar trabajos del dia y cambiar estado operativo |
| CU-06 | Soporte | Crear visita de soporte vinculada a ticket o referencia externa |
| CU-07 | Ventas | Programar instalacion vinculada a expediente listo |
| CU-08 | Admin | Consultar carga y productividad basica por tecnico |

---

## 5. Modelo funcional

### 5.1 Tipos de trabajo

| Tipo | Uso |
| --- | --- |
| `INSTALLATION` | Instalacion de nuevo servicio |
| `SUPPORT` | Visita de soporte correctivo |
| `TECHNICAL_VISIT` | Visita tecnica diagnostica o preventiva |
| `RETIREMENT` | Retiro de servicio o equipos |
| `MAINTENANCE` | Mantenimiento preventivo o programado |

### 5.2 Estados de agenda

| Estado | Significado |
| --- | --- |
| `DRAFT` | Evento preparado pero aun no confirmado |
| `SCHEDULED` | Trabajo programado y visible para el tecnico |
| `EN_ROUTE` | Tecnico en camino |
| `IN_PROGRESS` | Trabajo iniciado en sitio o remoto |
| `COMPLETED` | Trabajo finalizado |
| `CANCELLED` | Cancelado sin ejecucion |
| `RESCHEDULED` | Reprogramado hacia otro bloque horario |
| `NO_SHOW` | No realizado por ausencia, imposibilidad o novedad |

### 5.3 Estados de Work Order ligera

| Estado | Significado |
| --- | --- |
| `OPEN` | Orden creada y pendiente de ejecucion |
| `ASSIGNED` | Orden asignada a tecnico/cuadrilla |
| `IN_PROGRESS` | En ejecucion |
| `DONE` | Cerrada operativamente |
| `CANCELLED` | Cancelada |

---

## 6. Modelo de datos propuesto

Todas las tablas residen en el schema del tenant y se resuelven mediante `SET LOCAL search_path`, sin schema hardcodeado en entidades.

### 6.1 `schedule_events`

Evento principal de agenda.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `tenant_id` | uuid | FK logica a tenant publico |
| `work_order_id` | uuid nullable | Referencia a `work_orders.id` |
| `type` | enum | Tipo de trabajo |
| `status` | enum | Estado de agenda |
| `title` | varchar(160) | Texto operativo corto |
| `description` | text nullable | Detalle interno |
| `scheduled_start_at` | timestamptz | Inicio programado |
| `scheduled_end_at` | timestamptz | Fin programado |
| `assigned_user_id` | uuid | Usuario tecnico, soporte, NOC o contratista |
| `assigned_team_id` | uuid nullable | Reservado para cuadrillas futuras |
| `address` | varchar(255) nullable | Direccion del trabajo |
| `municipality` | varchar(120) nullable | Municipio |
| `latitude` | numeric nullable | Coordenada opcional |
| `longitude` | numeric nullable | Coordenada opcional |
| `expediente_id` | uuid nullable | Vinculo CRM |
| `subscriber_id` | uuid nullable | Vinculo suscriptor |
| `ticket_id` | varchar(160) nullable | Vinculo Service Assurance o referencia externa |
| `contract_id` | uuid nullable | Vinculo contrato |
| `created_by` | uuid | Actor autenticado |
| `updated_by` | uuid nullable | Ultimo actor |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | Auditoria tecnica |

Indices recomendados:

- `idx_schedule_events_tenant_start`
- `idx_schedule_events_tenant_assigned_start`
- `idx_schedule_events_tenant_status_start`
- `idx_schedule_events_tenant_expediente`
- `idx_schedule_events_tenant_ticket`

### 6.2 `work_orders`

Orden operativa ligera.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `tenant_id` | uuid | Aislamiento |
| `code` | varchar(40) | Consecutivo legible, ej. `WO-20260506-001` |
| `type` | enum | Tipo de trabajo |
| `status` | enum | Estado de la orden |
| `priority` | enum | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| `assigned_user_id` | uuid | Tecnico responsable |
| `scheduled_event_id` | uuid nullable | Vinculo inverso al evento |
| `source_context` | enum | `CRM`, `ASSURANCE`, `PROVISIONING`, `MANUAL` |
| `source_ref` | varchar(160) nullable | ID externo o referencia semantica |
| `summary` | varchar(200) | Resumen operativo |
| `notes` | text nullable | Notas internas |
| `created_by`, `closed_by` | uuid nullable | Trazabilidad |
| `closed_at` | timestamptz nullable | Cierre operativo |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | Auditoria tecnica |

### 6.3 `work_order_tasks`

Tareas internas de una Work Order. En Fase 1 puede existir una tarea por defecto, pero el modelo queda listo para multiples tareas.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `tenant_id` | uuid | Aislamiento |
| `work_order_id` | uuid | Referencia a Work Order |
| `title` | varchar(160) | Nombre de tarea |
| `description` | text nullable | Detalle |
| `status` | enum | `PENDING`, `IN_PROGRESS`, `DONE`, `CANCELLED` |
| `arrival_at` | timestamptz nullable | Llegada registrada |
| `departure_at` | timestamptz nullable | Salida registrada |
| `result_notes` | text nullable | Resultado operativo |
| `created_at`, `updated_at` | timestamptz | Auditoria tecnica |

### 6.4 `schedule_reschedule_logs`

Historial append-only de reagendamientos.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `tenant_id` | uuid | Aislamiento |
| `schedule_event_id` | uuid | Evento afectado |
| `from_start_at`, `from_end_at` | timestamptz | Bloque anterior |
| `to_start_at`, `to_end_at` | timestamptz | Nuevo bloque |
| `reason` | varchar(120) | Motivo obligatorio |
| `notes` | text nullable | Detalle |
| `changed_by` | uuid | Actor autenticado |
| `created_at` | timestamptz | Momento del cambio |

### 6.5 `technician_availability`

Disponibilidad y bloqueos por tecnico. En Fase 1 cubre bloqueos manuales; horarios recurrentes pueden ir a Fase 2 si el alcance se aprieta.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `tenant_id` | uuid | Aislamiento |
| `user_id` | uuid | Tecnico/contratista |
| `type` | enum | `AVAILABLE`, `BLOCKED`, `TIME_OFF` |
| `starts_at`, `ends_at` | timestamptz | Rango |
| `reason` | varchar(160) nullable | Motivo |
| `created_by` | uuid | Actor autenticado |
| `created_at`, `updated_at` | timestamptz | Auditoria tecnica |

---

## 7. API propuesta

Rutas bajo `/api/v1/wfm`.

| Metodo | Ruta | Uso | Roles |
| --- | --- | --- | --- |
| GET | `/events` | Listar agenda por rango, tecnico, tipo, estado | ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR |
| POST | `/events` | Crear evento y Work Order ligera opcional | ADMIN, NOC, SUPPORT, SALES |
| GET | `/events/:id` | Detalle del evento | ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR |
| PATCH | `/events/:id` | Editar datos no cerrados | ADMIN, NOC, SUPPORT |
| PATCH | `/events/:id/status` | Cambiar estado operativo | ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR |
| POST | `/events/:id/reschedule` | Reagendar con motivo | ADMIN, NOC, SUPPORT |
| DELETE | `/events/:id` | Cancelacion logica | ADMIN, NOC, SUPPORT |
| GET | `/work-orders` | Listar ordenes | ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR |
| GET | `/work-orders/:id` | Detalle de orden | ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR |
| PATCH | `/work-orders/:id/status` | Avance de orden | ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR |
| GET | `/dashboard/summary` | KPIs operativos basicos | ADMIN, NOC, SUPPORT |
| GET | `/technicians/availability` | Disponibilidad por rango | ADMIN, NOC, SUPPORT |
| POST | `/technicians/availability` | Crear bloqueo o disponibilidad | ADMIN, NOC, SUPPORT |

Reglas de autorizacion adicionales:

- `TECHNICIAN` y `CONTRACTOR` solo consultan o actualizan eventos/ordenes asignados a su usuario.
- `SALES` puede crear solicitud de instalacion desde expediente, pero no reasignar tecnicos ni cerrar OT.
- `SYSTEM_ADMIN` aplica solo si las reglas existentes del API permiten operacion cross-tenant; no debe saltarse TenantContext.
- Usar siempre `UserRole.*` en `@Roles()`.

---

## 8. Integraciones y boundaries

### CRM

CRM no debe leer tablas de Programacion directamente. La integracion debe usar puerto tipado o evento.

Primer contrato recomendado:

- `WorkOrderReferencePort.ensureReference()` se reemplaza o complementa con un adapter real hacia MOD09.
- Al crear una instalacion desde expediente, MOD09 devuelve `workOrderId` y `scheduleEventId`.
- CRM conserva `workOrderId` como referencia operativa y puede avanzar a `INSTALACION_AGENDADA` si tambien cumple el contrato de ticket definido por CRM.

### Service Assurance futuro

Cuando exista Assurance, un ticket que requiere campo debe emitir `assurance.field-service-needed`, consumido por MOD09 para crear evento/OT.

### Provisioning futuro

Provisioning debe emitir `provisioning.work-order-created` o invocar un puerto de scheduling cuando una orden de activacion requiere instalacion fisica.

### Inventory futuro

MOD09 emitira eventos al cierre:

- `wfm.materials-consumed`
- `wfm.equipment-installed`
- `wfm.equipment-returned`

En Fase 1 estos eventos pueden quedar fuera del alcance o emitirse como contratos documentados sin consumidores reales.

### Media Assets futuro

Evidencias fotograficas deben usar Media Assets / StoragePort, no blobs en tablas WFM.

---

## 9. UI propuesta en portal

Ruta sugerida: `/dashboard/scheduling`.

### Pantalla principal

- Toolbar con tabs: Dia, Semana, Mes, Lista.
- Filtros: tecnico, tipo, estado, municipio, rango.
- Boton primario: Programar trabajo.
- Calendario con bloques horarios y colores por tipo/estado.
- Panel lateral de detalle con datos de cliente/referencia, tecnico, horario, estado y acciones.

### Lista operativa

- Tabla densa para trabajos de hoy y atrasados.
- Columnas: hora, tipo, estado, tecnico, direccion, referencia, acciones.
- Celdas con `align-middle` por defecto.

### Formulario programar trabajo

- Tipo de trabajo.
- Fecha, hora inicio, hora fin.
- Tecnico o contratista.
- Direccion y municipio.
- Referencia CRM/ticket/contrato opcional.
- Prioridad y notas.
- Validacion de choque antes de guardar.

### Experiencia tecnico

- Vista filtrada a trabajos asignados.
- Acciones permitidas: en ruta, iniciar, completar, no realizada.
- Sin acceso a reasignacion global.

---

## 10. Reglas de negocio

1. Un tecnico no puede tener dos eventos activos que se solapen en el tiempo, salvo override administrativo documentado.
2. Un evento `COMPLETED`, `CANCELLED` o `NO_SHOW` no puede editarse salvo notas administrativas permitidas.
3. Todo reagendamiento requiere motivo obligatorio y registra bloque anterior y bloque nuevo.
4. La duracion minima de un evento es 15 minutos.
5. La fecha fin debe ser posterior a la fecha inicio.
6. Las consultas de agenda siempre requieren rango temporal explicito o default seguro.
7. Las operaciones se ejecutan dentro del tenant autenticado.
8. El cierre de Work Order no activa subscriber ni contrato por si solo; esa orquestacion pertenece a CRM/Provisioning segun el flujo aprobado.
9. Los tecnicos y contratistas no ven trabajos de otros usuarios salvo rol administrativo.
10. Las referencias cross-module son IDs logicos, no FK cross-schema ni lectura directa de tablas externas.

---

## 11. Seguridad, privacidad y auditoria

- No almacenar PII innecesaria del suscriptor en MOD09; usar referencias y campos operativos minimos.
- Telefonos o datos sensibles deben permanecer en el owner del dominio correspondiente; si se requiere telefono de contacto en OT, evaluar cifrado o lectura controlada por puerto.
- Validacion Zod en todos los boundaries de entrada.
- Auditoria CUD via AuditModule e historial explicito de reagendamientos.
- RBAC por rol y regla de ownership para tecnicos/contratistas.
- No hardcodear tenant, schema ni IDs de usuario.
- No usar `synchronize: true`; toda tabla via migracion reversible.

---

## 12. Testing esperado

### Backend

- Unit tests de reglas de solapamiento.
- Unit tests de transiciones de estado.
- Unit tests de RBAC/ownership para tecnico y contratista.
- Integration tests tenant-aware para asegurar aislamiento por schema.
- Tests de creacion, reagendamiento, cancelacion y dashboard summary.

### Frontend

- Tests unitarios de helpers de calendario, labels y filtros.
- Tests de formulario con validaciones Zod.
- E2E Playwright para crear, reagendar y completar evento basico.

---

## 13. Plan de ejecucion sugerido

### Fase 0 - Gobierno documental

1. Crear PRD MOD09.
2. Crear HLD MOD09.
3. Crear ADR de bounded context Programacion / WFM.
4. Crear prompt de ejecucion basado en la plantilla oficial.

### Fase 1 - Backend MVP

1. Crear enums y contratos compartidos en `@iwana/shared`.
2. Crear entidades tenant-aware y migracion reversible en `packages/database`.
3. Crear `WfmModule` en `apps/api`.
4. Implementar servicios de eventos, Work Orders, disponibilidad y dashboard.
5. Implementar endpoints REST con Swagger, Zod, guards y roles.
6. Agregar adapter real para el puerto CRM de Work Order si aplica en esta fase.
7. Cubrir tests unitarios e integracion.

### Fase 2 - Portal MVP

1. Agregar cliente API en `apps/portal`.
2. Crear ruta `/dashboard/scheduling`.
3. Construir calendario dia/semana/mes/lista.
4. Crear formulario programar/reagendar.
5. Crear vista tecnico filtrada por trabajos asignados.
6. Agregar pruebas frontend y E2E basico.

### Fase 3 - Integracion CRM

1. Desde expediente listo para instalacion, crear agenda/OT.
2. Persistir `workOrderId` en CRM via flujo autorizado.
3. Habilitar transicion a `INSTALACION_AGENDADA` cuando existan referencias requeridas.
4. Agregar timeline CRM con evento de programacion.

### Fase 4 - WFM extendido

1. Materiales consumidos.
2. Equipos instalados/retirados.
3. Evidencias con Media Assets.
4. Firma digital o excepcion justificada.
5. Check-in/out geolocalizado.
6. KPIs avanzados y mapa operativo.

---

## 14. Riesgos y decisiones pendientes

| Riesgo / decision | Impacto | Recomendacion |
| --- | --- | --- |
| Nombre final del bounded context: Scheduling vs WFM | Resuelto | ADR-037 aprueba `WfmModule` con subdominio scheduling. |
| Ausencia de Service Assurance real | Bajo en Fase 1 | Permitir `ticketId` como referencia externa sin validar contra tabla inexistente. |
| CRM exige `ticketId` y `workOrderId` para `INSTALACION_AGENDADA` | Medio | Definir si MOD09 genera solo Work Order o tambien una referencia ticket stub para instalaciones. |
| Disponibilidad recurrente de tecnicos | Medio | Iniciar con bloqueos puntuales y agenda efectiva; recurrencia en Fase 2. |
| Datos de contacto en OT | Alto privacidad | Evitar duplicar PII; usar referencias y resolver detalles por puerto autorizado. |

---

## 15. Criterios de aceptacion Fase 1

1. Un admin/soporte/NOC puede crear un evento programado con Work Order ligera.
2. El sistema rechaza solapamientos por tecnico en el mismo rango horario.
3. Se puede consultar agenda por dia, semana y mes mediante rango temporal.
4. Un tecnico solo ve sus trabajos asignados.
5. Un evento puede reagendarse con motivo obligatorio y queda registro historico.
6. Un trabajo puede avanzar por estados hasta completado.
7. El dashboard muestra trabajos de hoy, atrasados, proximos y carga por tecnico.
8. La persistencia es tenant-aware y no cruza datos entre schemas.
9. Las rutas estan protegidas por JWT, roles y validacion de entrada.
10. La integracion con CRM queda documentada y lista para reemplazar el stub de Work Order.

---

## 16. Preguntas para revision de producto

1. ¿El nombre funcional visible sera "Programacion", "Agenda operativa" o "Ordenes de trabajo"?
2. ¿La Fase 1 debe exigir ticket para instalaciones o basta con Work Order vinculada al expediente?
3. ¿Los contratistas usaran el mismo portal empresarial en Fase 1 o se difiere un portal contratista dedicado?
4. ¿La programacion debe permitir override administrativo de solapamientos desde el MVP?
5. ¿Se requiere consecutivo por tenant configurable para Work Orders desde Fase 1?
