# Design - MOD09 field operations sin excepciones por tecnico

**Version:** 1.0  
**Estado:** Aprobado para ejecucion  
**Fecha:** 2026-05-22  
**Modo activo:** Mixto  
**PRD rector:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**ADR rector:** docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md  
**Aprobacion CTO:** Aprobado el 2026-05-22

---

## 1. Problema

La pantalla de field operations mezcla hoy tres niveles de configuracion distintos:

1. horario base de empresa;
2. cierres especiales y festivos;
3. reglas personales recurrentes por tecnico.

El tercer nivel introduce una responsabilidad que producto ya no quiere dentro de WFM. Aunque tecnicamente funciona, el concepto visible de **Excepciones por tecnico** empuja a Operacion de campo a administrar ausencias personales o disponibilidad individual con semantica propia de un futuro modulo de Recursos Humanos.

El objetivo de este corte no es reemplazar RR. HH. ni modelar permisos. El objetivo es limpiar WFM para que solo exponga reglas estructurales de agenda.

---

## 2. Decision de diseño

La pantalla `field-operations` queda reducida a tres capacidades visibles:

1. horario base de empresa;
2. horario por sede;
3. cierres especiales.

Se retira por completo la seccion **Excepciones por tecnico**.

La UI no deja mensajes transicionales, notas de futura migracion ni referencias visibles a RR. HH. El comportamiento deseado para el usuario es simple: WFM configura ventanas estructurales de trabajo y no administra reglas personales.

---

## 3. Objetivo funcional

El sistema debe seguir resolviendo una ventana operativa efectiva para agendamiento y recomendaciones, pero sin apoyarse en reglas manuales recurrentes por tecnico administradas desde settings.

Resultado esperado:

1. `ScheduleRecommendationsService` solo propone franjas dentro del horario estructural vigente.
2. `ScheduleEventsService` y `VisitRequestsService` solo materializan agenda dentro del horario estructural vigente.
3. la configuracion visible del portal queda alineada con ese modelo.

---

## 4. Precedencia operativa objetivo

La precedencia objetivo de WFM, una vez retiradas las excepciones por tecnico, es:

1. **Cierre especial o festivo**
2. **Horario por sede**
3. **Horario base de empresa**

Interpretacion operativa:

1. un cierre especial siempre bloquea la agenda del contexto aplicable;
2. si no hay cierre especial, el horario por sede puede restringir o especializar el horario general;
3. si no existe regla de sede, aplica el horario base de empresa.

Ejemplo:

- Empresa: 08:00-18:00
- Sede A: 09:00-17:00
- Fecha: festivo

Resultado:

1. si el festivo aplica, no se agenda;
2. si no aplica festivo, la sede A opera en 09:00-17:00;
3. si una sede no tiene regla propia, se usa 08:00-18:00.

Future owner documentado:

Cuando exista RR. HH., las ausencias personales aprobadas entraran por encima de esta precedencia, pero ese contrato no forma parte del alcance de esta spec.

---

## 5. Boundaries y ownership

### 5.1 Ownership vigente

- **WFM** es owner de agenda, ventanas estructurales de operacion, horarios por sede, cierres especiales, recomendaciones y Work Orders.
- **RR. HH. futuro** sera owner conceptual de ausencias personales, permisos, licencias y reglas individuales recurrentes.
- **Organization** mantiene ownership del dato maestro de sedes corporativas segun ADR-040.

### 5.2 Reglas de boundary

1. WFM no debe exponer en settings conceptos de ausencia personal.
2. WFM no debe reintroducir un reemplazo cosmetico de `Excepciones por tecnico`.
3. Si existe disponibilidad individual puntual en servicios internos, no debe promocionarse como configuracion estructural de field operations.
4. Cualquier integracion futura con RR. HH. se tratara por puerto tipado o contrato aprobado, no por lectura directa de datos de otro modulo.

---

## 6. Impacto en el modelo y contratos

### 6.1 UI portal

- retirar bloque de listado, formulario y acciones de Excepciones por tecnico;
- ajustar copy general de la pantalla para hablar solo de horarios y cierres;
- mantener el resto de la experiencia enfocada en reglas estructurales.

### 6.2 API y backend

- retirar endpoints `GET/POST/PATCH/DELETE /wfm/technician-business-overrides`;
- retirar `TechnicianBusinessOverridesService` y DTOs asociados;
- adaptar `OperatingWindowResolverService` para resolver sin overrides personales manuales;
- limpiar el contrato frontend `wfmApi.technicianBusinessOverrides`.

### 6.3 Persistencia

- retirar la entidad `WfmTechnicianBusinessOverride` del source of truth del modulo;
- planificar migracion reversible para la tabla `wfm_technician_business_overrides` y sus indices;
- no confundir este retiro con `TechnicianAvailability`, que sigue siendo una capacidad distinta y puntual.

---

## 7. Impacto en scheduling

`SchedulingClient` y los servicios de recomendacion no deben depender de la existencia de una superficie visible de excepciones personales para validar la ventana operativa.

La regla de este corte es:

1. scheduling sigue respetando cierres especiales y horarios estructurales;
2. cualquier dependencia residual de disponibilidad individual debe quedar encapsulada, no expuesta en settings;
3. el modulo no debe prometer al usuario una capacidad de disponibilidad personal que el producto decidio retirar.

---

## 8. Testing esperado

### Backend

- tests del resolver con precedencia sin overrides personales;
- tests HTTP que validen retiro o ausencia de endpoints de `technician-business-overrides`;
- tests de migracion o cleanup para la tabla retirada.

### Frontend

- tests del manager de field operations sin la seccion eliminada;
- tests del cliente de settings con copy actualizado;
- actualizacion de mocks y contratos en portal.

### E2E

- actualizar flows de `/dashboard/settings/field-operations` para no depender de `/wfm/technician-business-overrides`;
- validar que la pantalla siga cargando con horario base, horario por sede y cierres especiales.

---

## 9. Riesgos y decisiones explicitas

### Riesgos

1. artefactos vigentes aprobados siguen legitimando overrides por tecnico y deben corregirse en el mismo corte documental;
2. puede quedar algun uso interno de disponibilidad individual que requiera encapsulacion temporal;
3. los tests y mocks de settings hoy esperan el endpoint retirado.

### Decisiones explicitas

1. se prefiere corte limpio en UI y contratos expuestos;
2. no se deja copy transicional en field operations;
3. no se diseña RR. HH. en esta spec;
4. `TechnicianAvailability` no se convierte en sustituto visible de la seccion retirada.

---

## 10. Requiere ADR

Si. La decision estructural queda trazada en `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md`.
