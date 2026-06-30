# Diseno - MOD09 Programacion como Centro de Agendamiento y MOD11 como Owner de OT de Ejecucion

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-24  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Trazabilidad principal:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  
**ADRs relacionados:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md, docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md, docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md  

---

## 1. Objetivo

Formalizar el rediseño operativo y arquitectonico donde:

- `Programacion` deja de ser owner de la ejecucion detallada;
- `Programacion` pasa a ser el centro unico de agendamiento para toda la operacion de campo;
- la `Orden de Trabajo` enriquecida vive en un bounded context separado de ejecucion;
- la trazabilidad de equipos y materiales cubre el recorrido desde bodega hasta tecnico, OT y destino final.

---

## 2. Problema a resolver

El estado actual del repo resuelve bien la coordinacion de visitas, pero no expresa con suficiente claridad el ownership de la ejecucion real en campo.

Hoy conviven tres tensiones:

1. `WfmModule` ya es owner aprobado de agenda y de una `WorkOrder` ligera.
2. `MOD11` ya existe como owner aprobado de ejecucion operativa transversal.
3. La necesidad de negocio para OT de campo supera la capacidad de una OT ligera embebida en agenda.

La OT requerida por operacion debe poder contener:

- tecnico o cuadrilla responsable;
- cliente, direccion y contexto del sitio;
- trabajo a realizar;
- actividades desarrolladas en campo;
- equipos y materiales usados;
- novedades y evidencias;
- resultado y cierre tecnico.

Ese volumen funcional convierte a la OT en un owner de ejecucion, no en un atributo secundario de agenda.

---

## 3. Decision central

Se adopta el siguiente principio rector:

**Programacion coordina. La OT ejecuta. Inventario custodia y traza.**

Implicaciones:

- `MOD09 / WFM` conserva ownership de solicitud de visita, agenda, despacho, asignacion, reprogramacion, supervision y capacidad.
- `MOD11` evoluciona desde `TasksModule` hacia owner del trabajo ejecutable y de la OT enriquecida.
- la `WorkOrder` ligera actual de WFM se mantiene solo como artefacto transitorio de compatibilidad o puente de handoff;
- la OT enriquecida no debe vivir en `Programacion`.

---

## 4. Ownership objetivo por bounded context

| Capa | Owner | Responsabilidad |
| --- | --- | --- |
| Caso comercial | CRM | oportunidad, expediente, contexto comercial, readiness |
| Caso de soporte | Assurance | ticket, SLA, PQR, seguimiento del caso |
| Trabajo operativo transversal | MOD11 | tarea ejecutable, OT enriquecida, handoff operativo |
| Coordinacion de visita | MOD09 | solicitud de visita, agenda, despacho, reasignacion, reprogramacion |
| Stock y custodia fisica | Inventario / Almacen | bodega, saldos, custodia por tecnico/cuadrilla, transferencias |

### Regla obligatoria

- `Programacion` no captura actividades de campo, equipos usados ni cierre tecnico.
- `MOD11` no decide agenda global ni conflictos de franja.
- `Inventario` no decide agenda ni cierre de OT; persiste y audita movimientos de stock/custodia.

---

## 5. Objetos canonicos del flujo

### 5.1 Caso origen

Objeto owner del negocio. Puede ser CRM, Ticket, Task u otro modulo aprobado.

### 5.2 Solicitud de visita

Objeto owner de coordinacion operativa.

Campos minimos esperados:

- `originContext`
- `originRef`
- `originLabel`
- `workType`
- `priority`
- `title`
- `description`
- `address`
- `municipality`
- `sector`
- `requestedWindowStartAt`
- `requestedWindowEndAt`

### 5.3 Evento de agenda

Objeto owner del compromiso temporal.

Responde:

- quien va;
- cuando va;
- desde que sede o cuadrilla operativa;
- cual es la franja confirmada.

### 5.4 Orden de trabajo de ejecucion

Objeto owner del trabajo real en campo.

Responde:

- que se hace;
- con que recursos se hace;
- que se encontro;
- que se uso;
- que quedo instalado, consumido, devuelto o pendiente.

---

## 6. Ciclo de vida ideal end-to-end

1. El caso nace en su modulo owner.
2. Si requiere atencion en campo, se crea `solicitud de visita`.
3. `Programacion` completa contexto faltante y despacha.
4. Al confirmar agenda, se crea o activa la `OT` en MOD11.
5. El tecnico o cuadrilla ejecuta la OT.
6. La OT registra actividades, materiales/equipos y resultado.
7. `Programacion` refleja el estado resumido de la ejecucion sin absorber el detalle.

### Estados recomendados de Programacion

- `PENDING`
- `READY_TO_SCHEDULE`
- `SCHEDULED`
- `IN_EXECUTION`
- `REQUIRES_RESCHEDULE`
- `CLOSED`
- `CANCELLED`

### Estados recomendados de OT

- `CREATED`
- `ASSIGNED`
- `EN_ROUTE`
- `IN_PROGRESS`
- `BLOCKED`
- `COMPLETED`
- `COMPLETED_WITH_OBSERVATIONS`
- `NOT_EXECUTED`
- `CANCELLED`

---

## 7. Regla de creacion de OT

La OT enriquecida **no** debe crearse al momento de intake general del caso.

La OT debe crearse cuando exista compromiso operativo real:

- tecnico o cuadrilla asignada;
- fecha/hora confirmada;
- ventana de servicio definida;
- contexto suficiente para ejecutar.

### Motivo

Antes de la agenda confirmada existe una necesidad operativa. Despues de la agenda confirmada existe trabajo comprometido para ejecutar.

---

## 8. Modelo funcional de la OT enriquecida

La OT debe soportar como minimo:

- `executionOrderNumber`
- `originContext`
- `originRefId`
- `visitRequestId`
- `scheduleEventId`
- `assignedTechnicianId` o `assignedCrewId`
- `customerId` o `subscriberId`
- `customerDisplayLabel`
- `serviceAddress`
- `municipality`
- `sector`
- `workType`
- `workSummary`
- `workInstructions`
- `plannedWindowStartAt`
- `plannedWindowEndAt`
- `status`

### Secciones funcionales de la OT

1. **Resumen**
   - numero OT
   - origen
   - cliente
   - sitio
   - prioridad
   - ventana comprometida

2. **Trabajo a realizar**
   - descripcion operativa
   - checklist o actividades esperadas
   - dependencias o advertencias

3. **Ejecucion en campo**
   - actividades realizadas
   - novedades
   - tiempos relevantes
   - observaciones tecnicas

4. **Equipos y materiales**
   - items instalados
   - items consumidos
   - items no usados
   - devoluciones
   - seriales o identificadores cuando aplique

5. **Resultado**
   - ejecutado
   - ejecutado con observaciones
   - no ejecutado
   - requiere seguimiento
   - cancelado

---

## 9. Regla de inventario y trazabilidad

La OT puede consumir directamente el inventario previamente cargado al tecnico o cuadrilla.

### Ownership

- `Inventario / Almacen` sigue siendo owner del stock y de la custodia.
- `OT` es owner de la decision operativa de uso dentro del trabajo ejecutado.

### Cadena de trazabilidad objetivo

1. `Bodega`
2. `Salida de almacen`
3. `Asignacion a tecnico/cuadrilla`
4. `Seleccion en OT`
5. `Uso en campo`
6. `Destino final`

### Destinos finales permitidos

- `INSTALLED_AT_CUSTOMER`
- `INTERNAL_CONSUMPTION`
- `RETURNED_TO_TECHNICIAN_STOCK`
- `RETURNED_TO_WAREHOUSE`
- `DAMAGED_OR_LOST`

### Regla operativa

El tecnico no deberia pedir materiales "desde cero" dentro de la OT cuando ya posee custodia operativa. La OT primero debe ofrecer consumo desde inventario asignado al tecnico/cuadrilla.

---

## 10. Integracion entre MOD09, MOD11 e Inventario

### Eventos o contratos minimos recomendados

- `wfm.schedule.confirmed`
- `wfm.schedule.reassigned`
- `wfm.schedule.rescheduled`
- `operations.execution-order.created`
- `operations.execution-order.started`
- `operations.execution-order.completed`
- `operations.execution-order.not-executed`
- `operations.execution-order.cancelled`
- `inventory.technician-stock.consumed`
- `inventory.asset.installed-at-customer`

### Reglas

1. `Programacion` confirma agenda y dispara creacion/activacion de OT.
2. `MOD11` crea la OT enriquecida.
3. `MOD11` registra consumo de inventario asignado al tecnico/cuadrilla.
4. `Inventario` persiste movimiento y actualiza custodia/destino.
5. `Programacion` solo muestra resultado resumido de OT.

---

## 11. UX objetivo de Programacion

`Programacion` debe tener foco en coordinacion:

- `Pendientes por agendar`
- `Agenda`
- `Despacho`
- `Riesgos / reprogramaciones`
- `Carga por tecnico/cuadrilla`

### Acciones primarias permitidas

- agendar
- reasignar
- reprogramar
- cancelar coordinacion
- abrir OT
- ver estado resumido de ejecucion

### Acciones que no deben vivir aqui

- registrar trabajo realizado
- instalar equipos
- consumir materiales
- diligenciar cierre tecnico profundo
- manejar seriales como flujo principal

---

## 12. Formularios esperados

### En Programacion

1. `Solicitud manual de visita`
2. `Completar contexto`
3. `Despachar / agendar`
4. `Reprogramar`
5. `Resolver sin visita`

### En MOD11 OT

1. `Crear/activar OT desde agenda`
2. `Detalle de OT`
3. `Registro de trabajo de campo`
4. `Equipos y materiales usados`
5. `Cierre tecnico`

---

## 13. Impacto sobre artefactos actuales

### MOD09

Debe actualizarse para dejar explicito que:

- WFM sigue siendo owner de agenda;
- la `WorkOrder` actual es ligera/transitoria;
- materiales, evidencias y ejecucion detallada salen del boundary.

### MOD11

Debe ampliarse para dejar explicito que:

- no solo maneja `Task` transversal;
- tambien es owner de OT enriquecida de campo;
- integra inventario por custodia del tecnico/cuadrilla y no por stock directo de agenda.

### ADR

Se requiere ADR nuevo porque la decision modifica ownership real entre MOD09 y MOD11 respecto a OT.

---

## 14. Criterios de aceptacion del diseno

1. `Programacion` queda definida como centro de agendamiento y no de ejecucion.
2. La OT enriquecida queda separada de la agenda y asignada a un owner claro.
3. La trazabilidad de inventario cubre bodega -> tecnico/cuadrilla -> OT -> destino final.
4. La agenda puede abrir OT sin absorber sus campos de ejecucion.
5. El diseno no rompe modulith, multi-tenancy por schema ni ownership de CRM/Assurance.
6. La documentacion deja claro que la `WorkOrder` ligera actual de WFM no es el modelo final de OT de campo.

---

## 15. Recomendacion final

Se recomienda ejecutar el cambio en dos planos coordinados:

1. **Documental y de boundary**
   - ADR
   - ajuste PRD/HLD
   - plan y prompt

2. **Implementacion**
   - preservar MOD09 como scheduling hub;
   - evolucionar MOD11 como owner de OT de ejecucion;
   - integrar Inventario como owner de custodia y movimientos;
   - desactivar gradualmente el rol estructural de la `WorkOrder` ligera actual de WFM.
