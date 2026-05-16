# ADR-039: Bandeja de visitas pendientes como inbox operativo de WFM

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-15  
**Autor:** AI-EM-ARCH  
**Modo activo:** Mixto  
**Modulo:** MOD09 Programacion / WFM  
**PRD relacionado:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**Spec relacionada:** docs/specs/SPEC-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md  
**ADRs relacionados:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md, docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md  
**Idea de producto:** docs/ideas/módulo_WFM.md

---

## Contexto

MOD09 ya es owner de agenda, Work Orders, disponibilidad tecnica y recomendaciones territoriales. MOD10 Assurance ya permite solicitar trabajo de campo desde un ticket, pero el contrato actual solo marca el ticket como `FIELD_SERVICE_REQUESTED`, crea un vinculo append-only sin Work Order y publica un job `assurance-field-service` sin consumidor activo en `apps/worker`.

El flujo CRM hacia Programacion ya puede crear o buscar un ticket de instalacion, abrir el formulario WFM, crear evento + Work Order y vincular referencias operativas. Sin embargo, ese flujo esta concentrado en un modal y no escala bien para 10, 20 o mas tecnicos ni para una semana futura de disponibilidad.

La necesidad nueva es unificar tres origenes de agendamiento:

- CRM: instalaciones de clientes nuevos desde expedientes listos.
- Assurance / Mesa de ayuda: tickets de clientes activos que requieren visita de campo.
- Manual / red: soportes internos, mantenimientos o tareas operativas sin cliente directo.

Resolverlo como mas campos dentro del modal actual ampliaria deuda UX y acoplamiento. Resolverlo como lectura directa desde WFM hacia tablas de CRM o Assurance violaria los boundaries aprobados.

## Decision

Se adopta una **bandeja de visitas pendientes** como inbox operativo dentro de `WfmModule`.

WFM sera owner de una nueva entidad tenant-aware `VisitRequest` o `WfmVisitRequest`, persistida en tabla `visit_requests`, que representa una solicitud programable antes de que exista un `ScheduleEvent` y una `WorkOrder`.

La solicitud de visita sera el punto comun de entrada para CRM, Assurance y flujos manuales. Cada origen enviara referencias logicas y, cuando sea permitido, un snapshot operativo minimo de ubicacion: direccion, municipio, sector/vereda y coordenadas. WFM no leera tablas de otros bounded contexts para completar esos datos.

El agendamiento definitivo ocurrira dentro de WFM mediante una operacion transaccional que:

1. valida que la solicitud esta lista para programar,
2. calcula o recibe la franja seleccionada,
3. crea `ScheduleEvent`,
4. crea `WorkOrder` ligera cuando aplique,
5. actualiza la solicitud a `SCHEDULED`,
6. deja referencias logicas hacia el origen para sincronizacion posterior por puerto, evento o llamada del portal.

La UI principal sera una vista de despacho semanal: bandeja de pendientes + matriz de disponibilidad por tecnico + panel de recomendacion, no un modal ampliado.

## Consecuencias

### Positivas

- WFM conserva ownership claro sobre agenda y Work Orders.
- CRM y Assurance pueden solicitar visitas sin conocer tablas internas de WFM.
- Se reduce la presion sobre `ScheduleEventForm` y el modal deja de ser la superficie principal de decision.
- La bandeja permite priorizar por SLA, origen, municipio, sector, carga y disponibilidad semanal.
- El scoring territorial ya implementado se reutiliza como base de Smart Dispatch explicable.
- La experiencia queda alineada con la vision de WFM como command center operativo.

### Costos y tradeoffs

- Se requiere nueva tabla tenant-aware, migracion reversible y DTOs/servicios nuevos.
- Se requiere ampliar el contrato Assurance -> WFM o crear consumidor de cola para materializar solicitudes.
- Los flujos con origen Assurance pueden iniciar en `NEEDS_CONTEXT` si el ticket no trae ubicacion operativa suficiente.
- CRM debe cambiar gradualmente de abrir directamente el modal a crear/abrir una solicitud de visita.
- El portal tendra una pantalla mas compleja que exige pruebas visuales, de estado vacio y de roles.

### Riesgos aceptados

- No se implementa mapa, drag-and-drop, realtime ni optimizacion de rutas en este corte.
- La ubicacion operativa se almacena como snapshot minimo en WFM para despacho, igual que `schedule_events`; no debe incluir telefono, documento, email ni datos sensibles.
- El flujo manual puede crear solicitudes sin origen externo; debe quedar auditado por actor autenticado.

## Reglas de implementacion

1. `VisitRequest` pertenece a WFM y reside en schema tenant.
2. No usar FKs cross-module hacia CRM, Assurance, Users, Contracts o Provisioning.
3. No leer tablas de otros bounded contexts desde servicios WFM.
4. Los origenes deben comunicarse por REST versionado, puerto tipado o evento/BullMQ.
5. El agendamiento de una solicitud debe ser idempotente frente a doble submit.
6. Una solicitud `SCHEDULED`, `CANCELLED` o `REJECTED` no puede generar otro evento activo.
7. La UI no debe exponer UUIDs tecnicos como informacion principal; usar labels operativos y referencias cortas.
8. OpenAPI, migraciones, pruebas backend/frontend y evidencia documental son obligatorias.

## Aprobacion CTO

ADR aprobado por CTO el 2026-05-15 para ejecucion productiva controlada.

La aprobacion cubre el cambio de patron de integracion entre CRM, Assurance y WFM, y la introduccion de `VisitRequest` como nueva entidad owner dentro de MOD09.

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md
- docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md
- docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md
- docs/ideas/módulo_WFM.md
