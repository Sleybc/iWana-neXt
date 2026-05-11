# MOD10 hallazgos finales - design spec

**Fecha:** 2026-05-09  
**Estado:** En revision  
**Modulo:** MOD10 Service Assurance / Mesa de ayuda

## Objetivo

Corregir los hallazgos abiertos de Fase 01 sin expandir el alcance del bounded context: validacion externa consistente con Zod, reglas de resolucion/PQR alineadas al baseline documental, dashboard con carga por cola, evidencia verificable de OpenAPI y explicitacion del modo degradado de la integracion WFM.

## Alcance aprobado

1. Aplicar validacion Zod en el boundary HTTP de `AssuranceController` para `body` y `query` relevantes, manteniendo DTOs para OpenAPI y tipado.
2. Endurecer `TicketsService.transitionStatus()` para:
   - exigir `notes` al pasar a `RESOLVED`;
   - rechazar cierre de PQR cuando el registro regulatorio no este completo.
3. Cambiar el calculo de deadline PQR en `SlaService` de minutos corridos a 15 dias habiles lunes-viernes, sin festivos nacionales en esta fase.
4. Extender `AssuranceDashboardService` y su contrato para exponer `byQueue`.
5. Agregar evidencia automatizada de OpenAPI sin versionar artefactos generados.
6. Mantener la integracion WFM por puerto/cola con fallback, pero dejando explicito el modo degradado en codigo y documentacion viva.

## Diseno tecnico

### 1. Boundary de validacion

- Crear un pipe Zod reutilizable en `apps/api/src/common/pipes/` o una ubicacion equivalente ya usada por el repo.
- Usar el pipe en `AssuranceController` sobre:
  - `listTickets`
  - `createTicket`
  - `transitionTicketStatus`
  - `addComment`
  - `assignTicket`
  - `requestFieldService`
  - `linkWorkOrder`
  - `updateTicket`
  - `createSlaPolicy`
- El servicio puede conservar validaciones defensivas minimas, pero la semantica de input invalido debe resolverse en el boundary.

### 2. Reglas de negocio RESOLVED / PQR

- `RESOLVED` debe exigir una nota operativa no vacia.
- El cierre de un ticket tipo `PQR` debe comprobar que el artefacto/registo regulatorio asociado esta completo antes de permitir `RESOLVED` o `CLOSED`, segun el flujo actual implementado.
- El timeline debe conservar `notes` y el rechazo debe ser semantico (`BadRequestException`).

### 3. SLA y plazo PQR

- Mantener SLA general por minutos para politicas normales.
- Cambiar solo `calculatePqrDeadline()` para sumar 15 dias habiles L-V.
- La implementacion debe ser deterministica y testeable con fechas controladas.

### 4. Dashboard

- Extender `AssuranceDashboardSummary` con `byQueue: Record<string, number>`.
- Contabilizar colas solo para tickets activos (mismo criterio que `byPriority` y `byType`).
- Mantener compatibilidad del resto del payload.

### 5. OpenAPI y WFM

- Agregar una verificacion automatizada que ejercite la generacion/lectura del documento OpenAPI y falle si el modulo `assurance` no queda expuesto correctamente.
- En `assurance-field-service.adapter.ts`, mantener el fallback cuando no exista queue, pero hacer el mensaje de log explicitamente degradado para no parecer integracion completa downstream.

## Pruebas requeridas

1. HTTP/controller:
   - assign sin `assignedUserId` ni `queueName` devuelve error semantico;
   - `RESOLVED` sin nota es rechazado.
2. Servicio:
   - PQR no puede cerrar sin completitud regulatoria;
   - `calculatePqrDeadline()` respeta dias habiles L-V;
   - dashboard incluye `byQueue`.
3. Evidencia:
   - verificacion automatizada de OpenAPI;
   - actualizacion de informe y checklist con estado real de WFM/OpenAPI/criterios parciales.

## Agentes a desplegar

1. **Backend MOD10**: validacion Zod, reglas RESOLVED/PQR, SLA habil, dashboard `byQueue`, pruebas backend.
2. **Evidencia MOD10**: OpenAPI verificable, explicitacion WFM degradado, actualizacion de informe/checklist.

## Fuera de alcance

- Integrar festivos oficiales de Colombia al plazo habil PQR.
- Implementar consumidor downstream real de WFM en esta fase.
- Versionar artefactos OpenAPI generados en el repo.
