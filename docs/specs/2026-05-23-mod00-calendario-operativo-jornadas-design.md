# Design - MOD00 Calendario operativo y jornadas

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-23  
**Modo activo:** Mixto  
**Origen:** Refinamiento de producto sobre horarios de empresa, sedes, despacho tecnico, eventualidades operativas e insumo futuro para RR. HH.  
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`  
**ADR relacionado:** `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md`  
**ADR propuesto:** `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md`  
**Spec reemplazada:** `docs/specs/2026-05-22-mod00-horarios-organization-wfm-design.md`  
**PRD rector:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
**HLD relacionado:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
**Plan de ejecucion:** `docs/plans/2026-05-23-mod00-configuracion-fase-06-calendario-operativo-jornadas.md`  
**Prompt operativo:** `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-06-v1.0.md`  
**Checklist:** `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md`

---

## 1. Objetivo

Crear la seccion **Calendario operativo y jornadas** dentro de `/dashboard/settings` para que el administrador del tenant gestione en un solo lugar la configuracion temporal que condiciona la operacion diaria:

1. horario base de empresa;
2. horarios por sede;
3. festivos, cierres y aperturas especiales;
4. ventana tecnica consumida por programacion WFM;
5. eventualidades operativas puntuales;
6. evidencia base para un futuro modulo de RR. HH. sin implementar nomina, permisos, licencias ni vacaciones en este corte.

El cambio busca que el usuario final deje de saltar entre Organizacion y Despacho tecnico para entender horarios, y que el sistema preserve boundaries claros entre MOD00/Organization, MOD09/WFM y RR. HH. futuro.

---

## 2. Decision de diseno

Se aprueba evolucionar el diseño anterior de horarios hacia una seccion top-level de settings:

```text
/dashboard/settings/calendar
```

Nombre visible:

```text
Calendario operativo y jornadas
```

La seccion centraliza la experiencia de usuario, pero no fusiona ownership de datos:

- **Organization** conserva ownership de sede, horario base comercial/operativo, horario por sede y excepciones de calendario empresarial.
- **WFM** conserva ownership de agenda tecnica, programacion, Work Orders, disponibilidad/bloqueos puntuales operativos y reglas estructurales necesarias para recomendar franjas.
- **RR. HH. futuro** sera owner de ausencias personales, licencias, incapacidades, vacaciones, permisos laborales, control formal de jornada y cumplimiento laboral.

Esta decision no crea un calendario transversal comun ni una tabla unica compartida por todos los modulos. Si en el futuro se decide crear un motor comun de calendarios cross-module, se requiere ADR nuevo.

---

## 3. Problema actual

El estado actual genera friccion por cuatro motivos:

1. `/dashboard/settings/organization` mezcla perfil empresarial, configuracion operativa, sedes, capacidades, horario base, horarios por sede y festivos.
2. `/dashboard/settings/field-operations` vuelve a presentar horarios y cierres desde el angulo WFM, duplicando la carga cognitiva.
3. La UI obliga al usuario a entender boundaries internos para resolver una pregunta operacional simple: cuando trabaja la empresa, cuando trabaja una sede y cuando se puede programar un tecnico.
4. Las eventualidades reales de operacion no estan modeladas de forma visible: entrada anticipada, salida extendida, falla fuera de horario, visita extraordinaria o bloqueo puntual.

El resultado es una experiencia dificil de usar y un modelo incompleto para el futuro control de jornadas.

---

## 4. Boundaries y ownership

### 4.1 Organization

Organization es owner de:

- sedes organizacionales;
- capacidades de sede;
- horario base del tenant;
- override semanal por sede;
- festivos, cierres y aperturas especiales de empresa o sede.

Organization no debe leer ni escribir tablas internas de WFM.

### 4.2 WFM

WFM es owner de:

- programacion tecnica;
- recomendaciones de agenda;
- eventos programados;
- Work Orders;
- disponibilidad/bloqueos puntuales operativos de tecnicos;
- eventualidades operativas nacidas en la ejecucion o planeacion tecnica.

WFM puede consumir sedes por puerto tipado aprobado, no por acceso directo a tablas de Organization.

### 4.3 RR. HH. futuro

RR. HH. sera owner de:

- licencias;
- incapacidades;
- vacaciones;
- permisos;
- ausencias personales;
- contratos laborales;
- control formal de jornada semanal;
- clasificacion laboral de horas ordinarias, suplementarias, dominicales o festivas cuando aplique.

La referencia de jornada maxima semanal de 42 horas en Colombia queda como criterio de dominio para RR. HH. futuro y requiere verificacion con fuente oficial antes de automatizar alertas o cumplimiento normativo.

---

## 5. Conceptos funcionales

### 5.1 Horario base de empresa

Define la semana operativa normal del tenant.

Ejemplo de negocio:

```text
Domingo a domingo, 08:00-17:00
```

Este horario sirve como base para sedes que no tengan override y como referencia para programacion tecnica.

### 5.2 Horario por sede

Una sede puede especializar el horario base cuando opera diferente.

Ejemplos:

- NOC con ventana extendida;
- base tecnica que trabaja domingos;
- oficina comercial que solo atiende lunes a sabado;
- nodo o punto operativo con horario reducido.

La sede se crea y mantiene en Organizacion, pero su horario se edita desde **Calendario operativo y jornadas**.

### 5.3 Festivos, cierres y aperturas especiales

Representan cambios por fecha que afectan a toda la empresa o a una sede.

Ejemplos:

- festivo nacional;
- cierre de oficina por mantenimiento;
- apertura extraordinaria de un punto de atencion;
- cierre de una base tecnica por contingencia local.

### 5.4 Eventualidad operativa puntual

Representa una variacion operacional concreta, acotada en el tiempo y trazable.

Ejemplos:

- cliente pide visita a las 07:00;
- falla inicia a las 15:00 y termina a las 20:00;
- tecnico entra antes por una emergencia;
- tecnico extiende salida por una orden de trabajo;
- NOC bloquea una franja por contingencia;
- operacion habilita disponibilidad extra para un tecnico o cuadrilla.

No representa licencias, vacaciones, incapacidades ni permisos laborales. Es evidencia operacional.

### 5.5 Ausencia laboral aprobada

Representa una ausencia personal o laboral formal. No se crea en WFM ni en Calendario operativo y jornadas durante este corte.

Ejemplos:

- licencia;
- incapacidad;
- vacaciones;
- permiso personal;
- ausencia aprobada por RR. HH.

Cuando RR. HH. exista, WFM debera consumir estas ausencias por puerto tipado o contrato aprobado para excluir al tecnico de la programacion.

---

## 6. Reglas de resolucion

### 6.1 Resolucion operacional para agendamiento

La precedencia objetivo para programar una visita tecnica o resolver disponibilidad operacional sera:

1. ausencia aprobada por RR. HH. futuro;
2. cierre, festivo o apertura especial aplicable;
3. eventualidad operativa puntual;
4. horario por sede;
5. horario base de empresa;
6. sin configuracion.

En el MVP, como RR. HH. no existe, la primera capa se documenta como future owner y no se implementa.

### 6.2 Resolucion comercial o institucional

Para atencion, recaudo o apertura de sede, la precedencia sera:

1. excepcion por fecha de sede;
2. excepcion por fecha empresa;
3. override semanal de sede;
4. horario base empresa;
5. sin configuracion.

### 6.3 Resolucion de jornada futura

RR. HH. futuro consumira datos operativos, pero no hereda automaticamente decisiones laborales desde WFM. El modulo HCM debera clasificar y validar:

- horas programadas;
- horas ejecutadas;
- eventualidades operativas;
- ausencias aprobadas;
- reglas contractuales;
- limites regulatorios aplicables.

---

## 7. Modelo de datos objetivo

### 7.1 Organization existente o aprobado

#### `organization_company_business_hours`

Horario base semanal del tenant.

#### `organization_site_business_hours`

Override semanal completo por sede.

#### `organization_business_hours_exceptions`

Excepciones por fecha para empresa o sede.

### 7.2 WFM existente

#### `technician_availability`

Actualmente cubre disponibilidad o bloqueo puntual por tecnico:

- `tenant_id`
- `user_id`
- `type`: `AVAILABLE`, `BLOCKED`, `TIME_OFF`
- `starts_at`
- `ends_at`
- `reason`
- `created_by`

Este modelo puede soportar una primera version operativa, pero no es suficiente como modelo final de eventualidades porque no tiene sede, origen, referencia operativa, estado ni marca de revision laboral.

### 7.3 Modelo recomendado para MVP de eventualidades

Se recomienda crear una capacidad explicita de eventualidades operativas, sin mezclarla semanticamente con licencias o ausencias personales:

#### `wfm_operational_eventualities`

Campos sugeridos:

- `id`
- `tenant_id`
- `technician_user_id` nullable
- `organization_site_id` nullable
- `type`: `EXTRA_AVAILABILITY`, `OPERATIONAL_BLOCK`, `SHIFT_EXTENSION`, `EARLY_START`, `EMERGENCY_RESPONSE`
- `starts_at`
- `ends_at`
- `reason`
- `origin`: `MANUAL`, `VISIT_REQUEST`, `SCHEDULE_EVENT`, `WORK_ORDER`, `NOC_INCIDENT`
- `origin_ref_id` nullable
- `requires_hr_review`
- `status`: `ACTIVE`, `CANCELLED`
- `created_by`
- `created_at`
- `updated_at`

Reglas:

- `starts_at < ends_at`;
- si `technician_user_id` existe, debe apuntar a usuario tecnico o contratista del tenant;
- si `organization_site_id` existe, debe apuntar a sede activa del tenant;
- `requires_hr_review` no calcula cumplimiento laboral; solo marca evidencia para HCM futuro;
- no se registran licencias, vacaciones, incapacidades ni permisos en esta tabla.

Si el equipo decide acelerar el MVP reutilizando `technician_availability`, debe documentarlo como transicion tecnica y no exponerlo como ausencia laboral.

---

## 8. API objetivo

### 8.1 Secciones federadas

Agregar una seccion nueva al shell federado:

```text
key: calendar
label: Calendario operativo y jornadas
route: /dashboard/settings/calendar
ownerModule: MOD00 / Organization + MOD09 / WFM
```

Permisos iniciales:

- lectura: `settings.read` + permisos de lectura aplicables;
- gestion de horarios Organization: `organization.hours.manage`;
- gestion operativa WFM: `wfm.schedule.manage`.

Si se requiere permiso nuevo para eventualidades, se recomienda:

```text
wfm.eventualities.manage
```

o ampliar formalmente `wfm.schedule.manage` si el catalogo de permisos prefiere menos granularidad en MVP.

### 8.2 Organization

Mantener o consumir desde la nueva seccion:

- `GET /organization/business-hours/company`
- `PUT /organization/business-hours/company`
- `PUT /organization/sites/:siteId/business-hours`
- `DELETE /organization/sites/:siteId/business-hours`
- `GET /organization/business-hours/exceptions`
- `POST /organization/business-hours/exceptions`
- `PATCH /organization/business-hours/exceptions/:exceptionId`
- `DELETE /organization/business-hours/exceptions/:exceptionId`

### 8.3 WFM

Mantener o evolucionar:

- `GET /wfm/business-hours/company`
- `PUT /wfm/business-hours/company`
- `GET /wfm/holiday-blackouts`
- `POST /wfm/holiday-blackouts`
- `PATCH /wfm/holiday-blackouts/:id`
- `DELETE /wfm/holiday-blackouts/:id`

Para eventualidades operativas, opcion recomendada:

- `GET /wfm/operational-eventualities`
- `POST /wfm/operational-eventualities`
- `PATCH /wfm/operational-eventualities/:id`
- `POST /wfm/operational-eventualities/:id/cancel`

Alternativa transitoria:

- reutilizar `GET /wfm/technicians/availability`
- reutilizar `POST /wfm/technicians/availability`

La alternativa transitoria no debe modelar ausencias laborales ni reintroducir la seccion retirada por ADR-041.

### 8.4 Puerto futuro HCM

Cuando exista RR. HH., WFM debera depender de un puerto tipado, por ejemplo:

```text
HcmAbsenceReadPort
```

Responsabilidad:

- listar ausencias aprobadas por tecnico y rango;
- informar indisponibilidad laboral formal;
- no exponer internals de HCM a WFM.

---

## 9. Diseno de UI

### 9.1 `/dashboard/settings`

Agregar tarjeta visible:

```text
Calendario operativo y jornadas
```

Descripcion recomendada:

```text
Gestiona horarios base, sedes, cierres, aperturas y eventualidades operativas que alimentan la programacion y el control futuro de jornadas.
```

### 9.2 `/dashboard/settings/organization`

Debe quedar enfocada en:

- perfil empresarial;
- configuracion operativa general;
- sedes;
- detalle de sede;
- capacidades.

Debe retirar editores principales de:

- horario base;
- horario por sede;
- festivos y cierres.

Puede mostrar un resumen compacto de calendario con enlace a `/dashboard/settings/calendar`.

### 9.3 `/dashboard/settings/field-operations`

Debe quedar enfocada en WFM operativo:

- reglas y vistas propias de programacion;
- agenda tecnica;
- estado de operacion;
- enlaces o resumen hacia calendario cuando necesite editar horarios.

No debe duplicar editores de horario que vivan en **Calendario operativo y jornadas**.

### 9.4 `/dashboard/settings/calendar`

Estructura recomendada:

1. **Horario base empresa**
   - semana base del tenant;
   - CTA guardar;
   - lectura clara de dias abiertos/cerrados.

2. **Horarios por sede**
   - listado de sedes;
   - estado: usa base o tiene horario propio;
   - editor de override semanal;
   - accion para volver a horario base.

3. **Festivos, cierres y aperturas especiales**
   - empresa o sede;
   - fecha puntual o recurrente;
   - cerrado o abierto con ventana especifica.

4. **Despacho tecnico**
   - ventana tecnica consumida por WFM;
   - cierres tecnicos si permanecen como concepto WFM;
   - copy claro de que afecta programacion, no atencion comercial.

5. **Eventualidades operativas**
   - formulario simple para registrar disponibilidad extra, bloqueo o extension;
   - filtros por fecha, tecnico, sede y tipo;
   - indicador `requiere revision RR. HH.`;
   - sin vocabulario de nomina, licencia, incapacidad o vacaciones.

---

## 10. Estrategia de migracion

### 10.1 Frontend

1. Crear ruta `/dashboard/settings/calendar`.
2. Registrar la nueva seccion en el shell federado.
3. Extraer componentes de horario desde `OrganizationSettingsClient`.
4. Extraer o reutilizar componentes de `WfmOperatingHoursManager`.
5. Reducir `OrganizationSettingsClient` a empresa, settings, sedes y capacidades.
6. Reducir `FieldOperationsSettingsClient` para no duplicar editores de calendario.

### 10.2 Backend

1. Mantener endpoints Organization existentes para horarios y excepciones.
2. Mantener endpoints WFM existentes para ventana tecnica y blackouts.
3. Definir si eventualidades usan modelo nuevo o transicion sobre `technician_availability`.
4. Si se crea modelo nuevo, agregar migracion reversible y OpenAPI.
5. Si se reutiliza modelo existente, documentar limitacion y no llamar la UI `Excepciones por tecnico`.

### 10.3 Datos

No borrar datos existentes en este corte.

- `organization_site_business_hours` se conserva como override por sede.
- `organization_company_business_hours` conserva horario base.
- `organization_business_hours_exceptions` conserva excepciones empresa/sede.
- `technician_availability` se mantiene como capacidad puntual interna o transitoria.

---

## 11. Testing y validacion

### 11.1 Backend

- tests HTTP de metadata de settings con nueva seccion;
- tests de horarios Organization existentes;
- tests de WFM para eventualidades o disponibilidad puntual;
- tests de tenant isolation para nuevas escrituras;
- tests de validacion `starts_at < ends_at` y ownership de sede/tecnico.

### 11.2 Frontend

- tests de `SettingsSectionGrid` con `calendar` disponible;
- tests de `CalendarSettingsClient` en modo lectura y edicion;
- tests de extraccion: Organization ya no muestra editores principales de horarios;
- tests de Field Operations sin duplicar calendario;
- tests de eventualidades: crear, listar, cancelar o registrar segun alcance MVP.

### 11.3 E2E

- `/dashboard/settings` muestra tarjeta **Calendario operativo y jornadas**;
- ADMIN abre `/dashboard/settings/calendar`;
- ADMIN edita horario base;
- ADMIN configura horario de una sede;
- ADMIN registra cierre o apertura especial;
- ADMIN registra eventualidad operativa puntual;
- NOC/SUPPORT pueden consultar segun permisos y roles aprobados;
- no existe flujo para registrar vacaciones, licencias o incapacidades en WFM.

---

## 12. Riesgos y decisiones explicitas

### Riesgos

1. Reutilizar `technician_availability` puede reabrir ambiguedad si la UI lo presenta como ausencia personal.
2. Crear una tabla nueva de eventualidades aumenta alcance backend, pero mejora claridad para HCM futuro.
3. La seccion centralizada podria parecer owner de todo si el copy no explica que cada modulo conserva sus contratos.
4. La referencia a 42 horas semanales requiere verificacion oficial antes de automatizar cumplimiento laboral.

### Decisiones explicitas

1. La seccion visible se llama **Calendario operativo y jornadas**.
2. Eventualidades operativas entran en el MVP.
3. Licencias, incapacidades, vacaciones y permisos no entran en WFM ni en esta seccion.
4. RR. HH. futuro sera el owner de ausencias personales y control formal de jornada.
5. WFM consumira ausencias de RR. HH. por puerto tipado cuando ese modulo exista.
6. No se implementa liquidacion de horas ni nomina en este corte.

---

## 13. Decision arquitectonica

La decision queda trazada en `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md` como ADR propuesto.

El ADR es necesario porque el cambio aclara boundaries visibles entre MOD00, WFM y RR. HH. futuro, y porque formaliza que eventualidad operativa puntual no equivale a ausencia laboral.

Si se crea una tabla nueva `wfm_operational_eventualities`, no cambia stack ni boundary base; puede ejecutarse como extension de WFM, pero debe quedar trazada en plan e informe.

Si se decide que MOD00 sea owner de un calendario transversal comun para todos los modulos, si se requiere ADR nuevo y aprobacion CTO.

---

## 14. Ruta de ejecucion propuesta

### Fase 1 - Shell y arquitectura de informacion

1. Agregar `SettingsSectionKey.CALENDAR`.
2. Registrar seccion **Calendario operativo y jornadas**.
3. Crear ruta `/dashboard/settings/calendar`.
4. Crear cliente base `CalendarSettingsClient` con estados de carga, error y permisos.

### Fase 2 - Extraccion UI de horarios

1. Extraer editor semanal reutilizable.
2. Mover horario base empresa desde Organization.
3. Mover horario por sede desde Organization.
4. Mover excepciones comerciales desde Organization.
5. Dejar Organization con resumen y enlace.

### Fase 3 - WFM y eventualidades operativas

1. Mover ventana tecnica y cierres WFM al calendario o mostrarlos como bloque consumido.
2. Definir si el MVP usa `technician_availability` o `wfm_operational_eventualities`.
3. Implementar UI de eventualidades puntuales.
4. Validar que no se reintroduzcan ausencias personales en settings.

### Fase 4 - Pruebas, docs e informe

1. Actualizar tests unitarios/frontend.
2. Actualizar pruebas HTTP si cambia metadata o contratos.
3. Agregar E2E focalizado del portal.
4. Actualizar informe vivo MOD00 con evidencia y riesgos residuales.
5. Documentar contrato futuro `HcmAbsenceReadPort` como nota de arquitectura, no como implementacion.
