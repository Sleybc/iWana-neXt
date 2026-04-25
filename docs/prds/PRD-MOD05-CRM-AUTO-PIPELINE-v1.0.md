# PRD - MOD05 CRM Auto-Pipeline de Expedientes

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-13  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH (Lead Software Architect Senior)  
**PRD base del módulo:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**Informe relacionado:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-022, ADR-024

---

## 1. Contexto y motivacion

El modelo de Expediente Unico Progresivo ya dispone de 12 estados de pipeline y reglas de transicion manual validadas en backend. Sin embargo, el comportamiento actual depende de acciones explicitas del usuario para mover el expediente entre estados, lo que genera tres fricciones operativas:

1. la captura progresiva de informacion no se refleja automaticamente en el pipeline;
2. la viabilidad tecnica puede cambiar sin que el estado comercial acompañe el cambio real del caso;
3. distintas sesiones del portal pueden observar estados desactualizados hasta que se fuerce una recarga manual.

Este PRD define el ajuste funcional para que el estado del expediente se derive automaticamente del avance real de captura y de la conclusion tecnica, preservando la auditoria existente, el modelo multi-tenant por schema y el bounded context de CRM.

---

## 2. Alcance

### En scope

- Resolver automaticamente el estado del pipeline despues de cada escritura relevante del expediente.
- Aplicar una matriz de avance basada en datos ya existentes en `ExpedienteRecord` y entidades hijas relacionadas.
- Permitir retroceso automatico mixto solo en etapas tempranas del pipeline.
- Mantener `StatusChange` y `AuditLog` como evidencia formal cuando el estado cambie por automatizacion.
- Refrescar automaticamente la vista detalle y la lectura de listado/resumen del portal mediante polling inteligente con los endpoints ya existentes.
- Preservar compatibilidad con el flujo manual de descarte y reactivacion.

### Fuera de scope

- Introducir WebSocket o SSE en esta fase.
- Redefinir el pipeline de 12 estados aprobado en MOD05.
- Automatizar reasignacion de responsable, incentivos o politicas comerciales.
- Cambiar boundaries entre CRM y otros modulos.
- Crear nuevas integraciones externas de cobertura, ticketing o provisioning.

---

## 3. Personas y casos de uso

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Asesor comercial | SALES | Que el estado del expediente avance solo mientras captura informacion del cliente |
| Jefe comercial | ADMIN | Ver el pipeline actualizado sin depender de movimientos manuales inconsistentes |
| Coordinador operativo | ADMIN | Confiar en que la viabilidad tecnica y los datos operativos reflejan la etapa real del caso |

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-AP-01 | Asesor | Crear expediente y verlo en `NUEVO_POTENCIAL` sin pasos adicionales |
| CU-AP-02 | Asesor | Capturar informacion parcial y ver el expediente pasar a `PENDIENTE_DATOS` |
| CU-AP-03 | Asesor | Completar base comercial minima y ver el expediente pasar a `PRECALIFICADO` |
| CU-AP-04 | Asesor | Registrar viabilidad `VALIDATION_REQUIRED` y ver el expediente pasar a `VALIDANDO_COBERTURA` |
| CU-AP-05 | Asesor | Registrar viabilidad `VIABLE` y ver el expediente pasar a `VIABLE_COMERCIALMENTE` |
| CU-AP-06 | Asesor | Seleccionar plan y ver el expediente pasar a `EN_COTIZACION` |
| CU-AP-07 | Usuario concurrente | Observar en portal el nuevo estado sin forzar recarga manual |

---

## 4. Requerimientos funcionales

### RF-AP-01: Resolver estado automatico en backend

El backend debe recalcular el estado objetivo del expediente despues de cada escritura relevante sobre:

- creacion de expediente;
- actualizacion de secciones;
- actualizacion de viabilidad tecnica;
- actualizacion de consentimientos o soportes si afectan reglas del pipeline;
- eventos del modulo que alteren campos usados por la matriz.

### RF-AP-02: Matriz de estado automatica

El estado objetivo debe resolverse en este orden:

| Orden | Estado objetivo | Regla base |
| --- | --- | --- |
| 1 | NUEVO_POTENCIAL | Expediente recien creado sin base suficiente de identificacion/contacto para avanzar |
| 2 | PENDIENTE_DATOS | Existe captura parcial pero faltan datos base para precalificacion |
| 3 | PRECALIFICADO | Ya existen documento, contacto y ubicacion minima para continuar |
| 4 | VALIDANDO_COBERTURA | `feasibility = VALIDATION_REQUIRED` |
| 5 | VIABLE_COMERCIALMENTE | `feasibility = VIABLE` |
| 6 | EN_COTIZACION | Existe `interestedPlanId` valido |
| 7 | PENDIENTE_DECISION | Existe cotizacion/propuesta emitida y el caso espera definicion comercial |
| 8 | LISTO_PARA_INSTALACION | Existen direccion de instalacion y contacto en sitio |
| 9 | INSTALACION_AGENDADA | Existen ticket y orden de trabajo vinculados |

### RF-AP-03: Politica de retroceso mixto

El recálculo automatico puede mover el expediente hacia atras solo entre los estados:

- `NUEVO_POTENCIAL`
- `PENDIENTE_DATOS`
- `PRECALIFICADO`
- `VALIDANDO_COBERTURA`
- `VIABLE_COMERCIALMENTE`

Desde `EN_COTIZACION` en adelante no debe existir retroceso automatico, salvo regla explicita aprobada en una iteracion posterior.

### RF-AP-04: Preservar descarte y reactivacion

`DESCARTADO` y `reactivate` se mantienen como flujos manuales. La automatizacion no debe reactivar ni descartar expedientes por si sola.

### RF-AP-05: Auditoria del cambio automatico

Si el estado cambia por automatizacion:

- se debe actualizar `status`, `previousStatus` y `statusChangedAt`;
- se debe crear un registro en `StatusChange`;
- se debe registrar `AuditLog` con causa explicita de cambio automatico.

### RF-AP-06: Actualizacion automatica del portal

El portal debe refrescar automaticamente:

- la vista detalle de expediente abierta en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`;
- el listado y el resumen del pipeline cuando existan cambios detectados por polling.

La fase base debe usar polling inteligente y no un canal realtime dedicado.

---

## 5. Requerimientos no funcionales

| RNF | Descripcion | Criterio |
| --- | --- | --- |
| RNF-AP-01 | Multi-tenancy | Todo recálculo debe ejecutarse en el schema resuelto por request o flujo aprobado |
| RNF-AP-02 | Auditoria | Todo cambio automatico de estado deja rastro en `StatusChange` y `AuditLog` |
| RNF-AP-03 | Seguridad | No exponer tenant, schema ni datos sensibles adicionales al cliente |
| RNF-AP-04 | Performance | El recálculo no debe degradar perceptiblemente el guardado de secciones ni el listado |
| RNF-AP-05 | UX | El portal no debe hacer reload de página completo para reflejar el nuevo estado |
| RNF-AP-06 | Consistencia | La decision de estado debe vivir en backend como fuente de verdad |

---

## 6. Modelo de datos borrador

No se requiere una nueva entidad para esta fase.

Se reutilizan:

- `ExpedienteRecord` como fuente principal de campos para la matriz de estado;
- `StatusChange` como historial inmutable del pipeline;
- `AuditLog` para evidencia de automatizacion;
- `Quote` o entidad equivalente ya existente para detectar `PENDIENTE_DECISION` cuando aplique.

El ajuste principal es de dominio y orquestacion, no de modelo relacional. Si durante la implementacion se propone persistir metadata adicional del recálculo, dicha decision debe justificarse como ajuste menor compatible con el HLD vigente.

---

## 7. Contratos de API borrador

### Contratos que se preservan

- `POST /api/v1/crm/expedientes`
- `PATCH /api/v1/crm/expedientes/:id/sections/:section`
- `PATCH /api/v1/crm/expedientes/:id/status`
- `GET /api/v1/crm/expedientes/:id`
- `GET /api/v1/crm/expedientes`
- `GET /api/v1/crm/pipeline/summary`

### Comportamiento contractual esperado

1. Toda mutacion relevante debe devolver el expediente ya recalculado o dejarlo disponible inmediatamente en la siguiente lectura.
2. `GET /crm/expedientes/:id` debe reflejar el estado recalculado sin requerir una accion manual adicional.
3. `GET /crm/expedientes` y `GET /crm/pipeline/summary` deben reflejar el nuevo estado en ciclos de polling del portal.

No se define un endpoint nuevo para esta fase.

---

## 8. Criterios de aceptacion

- CA-AP-01: un expediente creado con solo nombre y canal queda en `NUEVO_POTENCIAL`.
- CA-AP-02: si el expediente tiene captura parcial pero carece de direccion, municipio, documento o contacto minimo, queda en `PENDIENTE_DATOS`.
- CA-AP-03: si el expediente cumple datos base de precalificacion, pasa a `PRECALIFICADO` sin transicion manual.
- CA-AP-04: si `feasibility = VALIDATION_REQUIRED`, el expediente queda en `VALIDANDO_COBERTURA`.
- CA-AP-05: si `feasibility = VIABLE`, el expediente queda en `VIABLE_COMERCIALMENTE`.
- CA-AP-06: si existe `interestedPlanId`, el expediente puede avanzar a `EN_COTIZACION`.
- CA-AP-07: un expediente ya en `EN_COTIZACION` o superior no retrocede automaticamente a estados tempranos por perdida de datos menores.
- CA-AP-08: cada cambio automatico de estado genera trazabilidad en historial y auditoria.
- CA-AP-09: el portal refleja el nuevo estado sin recarga manual en detalle y en lectura de listado/resumen bajo polling.

---

## 9. Dependencias y riesgos

### Dependencias

- `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`
- `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
- `apps/api/src/modules/crm/expedientes/`
- `apps/portal/src/app/dashboard/crm/expedientes/`
- `packages/shared/src/enums/crm/expediente-status.enum.ts`
- `packages/shared/src/enums/crm/technical-viability-result.enum.ts`

### Riesgos

1. una matriz demasiado agresiva puede causar cambios de estado inesperados para el negocio;
2. el retroceso automatico mal acotado puede romper flujos posteriores a cotizacion;
3. si el polling es demasiado frecuente, el costo de red y render puede subir sin necesidad;
4. si el recálculo se distribuye en varias capas, la fuente de verdad puede quedar inconsistente.

### Mitigacion recomendada

- encapsular la decision de estado en un servicio unico de dominio;
- limitar retrocesos automaticos a estados tempranos;
- usar polling con intervalo razonable y evitar reload completo;
- cubrir reglas con pruebas unitarias, integracion y una E2E minima del portal.

---

## 10. Definition of Done

- Existe un servicio de backend autoritativo para resolver el estado automatico del expediente.
- El recálculo ocurre despues de las mutaciones relevantes del modulo sin romper tenancy.
- La politica de retroceso mixto queda implementada y probada.
- `StatusChange` y `AuditLog` registran los cambios automaticos de estado.
- El portal actualiza detalle y lectura de listado/resumen por polling inteligente.
- Hay pruebas unitarias backend para la matriz de estados.
- Hay pruebas de integracion o HTTP para el comportamiento de recálculo.
- Hay al menos una prueba portal o E2E que valide el cambio visible de estado.
- Se actualiza el informe vivo relacionado en `docs/informes/` con evidencia de ejecucion.
- No se introducen violaciones de boundary, tenancy ni seguridad.