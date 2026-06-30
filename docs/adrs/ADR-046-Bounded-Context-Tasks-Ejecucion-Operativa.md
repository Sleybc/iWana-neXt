# ADR-046: Bounded Context Tasks / Ejecucion Operativa

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-22  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD11 Ejecucion Operativa / Tareas  
**PRD relacionado:** docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  
**Spec de origen:** docs/specs/2026-06-22-mod11-operaciones-tareas-design.md

---

## Contexto

El repositorio actual ya tiene dos boundaries aprobados relacionados:

- ADR-038 define `AssuranceModule` como owner de tickets, SLA y PQR.
- ADR-037 define `WfmModule` como owner de agenda, Work Orders y despacho tecnico.

Ambos cubren partes del flujo operativo, pero dejan una brecha entre el caso reportado y el trabajo concreto que alguien debe ejecutar. En la practica, hoy ese espacio se cubre parcialmente con tickets operativos o con `WorkOrderTask`, generando ambiguedad:

- `Ticket` mezcla intake con ejecucion.
- `WorkOrderTask` es demasiado tecnica para tareas no agendables o no de campo.

La necesidad aprobada en definicion funcional es contar con una unidad transversal de trabajo ejecutable, con responsable y destinatario explicitos, sin mover esa responsabilidad a MOD10 ni MOD09.

---

## Decision

Se propone crear `TasksModule` como nuevo bounded context para MOD11 Ejecucion Operativa / Tareas.

El modulo seria owner de:

- `OperationalTask`
- `TaskTimelineEvent`
- `TaskAssignmentHistory`

La API externa se expondria bajo `/api/v1/tasks`.

El nombre visible en portal seria **Operaciones**.

`TasksModule` se integrara con:

- `AssuranceModule` para origen o referencia de tickets;
- `WfmModule` para agenda (`ScheduleEvent`) y OT (`WorkOrder`);
- `CrmModule` para tareas de origen comercial-operativo.

---

## Alternativas consideradas

### A1: Mantener toda la ejecucion dentro de `AssuranceModule`

Descartada. MOD10 es owner de intake, SLA, PQR y comunicacion del caso. Llevar toda la ejecucion ahi mezcla responsabilidades y dificulta la evolucion de tareas internas no ligadas a tickets.

### A2: Convertir `WorkOrderTask` en tarea universal

Descartada. MOD09 es owner de agenda y OT. `WorkOrderTask` es una subtarea tecnica de una orden, no un contenedor transversal de trabajo para clientes, backoffice y operaciones internas.

### A3: Crear `TasksModule` como bounded context propio

Elegida y aprobada. Separa caso, ejecucion y agenda; preserva los boundaries aprobados y deja un owner claro para el trabajo operativo.

---

## Consecuencias

### Positivas

- Se separa claramente caso vs ejecucion.
- La tarea puede existir con o sin ticket.
- La agenda queda como capacidad opcional de la tarea.
- WFM no absorbe trabajo no agendable.
- Assurance no absorbe ownership de ejecucion transversal.

### Costos y tradeoffs

- Se agrega un nuevo bounded context tenant-aware.
- Se requiere contrato de integracion con MOD10 y MOD09.
- El PRD maestro debera actualizarse tras aprobacion.
- La UX debera decidir convivencia entre `Mesa de ayuda` y `Operaciones`.

### Riesgos aceptados

- En Fase 01 puede coexistir `OPERATIONAL_TASK` en MOD10 por compatibilidad operativa.
- Habra un periodo de transicion documental entre implementado actual y boundary propuesto.

---

## Reglas de implementacion

1. MOD11 no debe leer tablas de MOD10, MOD09 ni MOD05.
2. `AssuranceModule` sigue siendo owner de tickets.
3. `WfmModule` sigue siendo owner de agenda y Work Orders.
4. `WorkOrderTask` no reemplaza `OperationalTask`.
5. Toda entrada externa debe validarse con Zod.
6. Las referencias cross-module deben ser IDs logicos.
7. No duplicar PII sensible del destinatario en MOD11.

---

## Estado de aprobacion

**Aprobado por CTO** el 2026-06-23.

`TasksModule` queda autorizado como nuevo bounded context y `MOD11` habilitado en el mapa maestro para ejecucion productiva Fase 01.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md
- docs/specs/2026-06-22-mod11-operaciones-tareas-design.md
- docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md
