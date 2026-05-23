# Design — MOD00 horarios organization y wfm

**Version:** 1.0
**Estado:** Deprecado
**Fecha:** 2026-05-22
**Modo activo:** Mixto
**Origen:** Conversacion de diseno sobre simplificacion de horarios en `/dashboard/settings/organization` y `/dashboard/settings/field-operations`
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**PRD rector:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD relacionado:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

> Reemplazado por `docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md`, que incorpora la seccion **Calendario operativo y jornadas** y el alcance MVP de eventualidades operativas puntuales.

---

## 1. Objetivo

Simplificar la configuracion de horarios del portal para que el modelo visible coincida con la operacion real del negocio y mantenga boundaries claros entre Organization y WFM.

La solucion debe resolver estas reglas de negocio:

1. El negocio necesita un **horario comercial de atencion y recaudo**.
2. La mayoria de oficinas comparten un horario comun, pero **algunas sedes pueden operar distinto**.
3. Las oficinas no trabajan los domingos y pueden no trabajar en festivos o cierres especiales.
4. La operacion tecnica usa una **ventana general unica de despacho**, no una ventana por sede.

---

## 2. Decision aprobada

Se aprueba el siguiente modelo objetivo:

1. **Organization** pasa a manejar el horario comercial con un esquema de **horario base comun + overrides por sede + excepciones por fecha**.
2. **WFM** mantiene una sola **ventana general de despacho tecnico** a nivel empresa.
3. La capacidad de **horario WFM por sede** deja de ser parte del flujo operativo normal y se retira de UI y resolucion.
4. No se fusionan los conceptos de horario comercial y horario tecnico en una sola tabla o una sola configuracion.

---

## 3. Problema actual

El estado actual genera ruido conceptual por tres motivos:

1. En Organization el horario esta modelado solo por sede, aunque operativamente se necesita un patron comun con excepciones puntuales.
2. En WFM existen dos niveles visibles, empresa y sede, aunque el negocio opera con una sola ventana tecnica general.
3. La UI repite tablas semanales muy parecidas y sugiere que todos los horarios son equivalentes, cuando pertenecen a dominios distintos.

Consecuencia: el usuario debe configurar mas de lo necesario y no entiende con claridad que horario afecta atencion al cliente y que horario afecta despacho tecnico.

---

## 4. Boundaries y ownership

### 4.1 Ownership

- **Organization**: owner del horario comercial de atencion y recaudo.
- **WFM**: owner de la ventana operativa para programacion y despacho tecnico.
- **Assurance / Portal suscriptor**: consumidores futuros del horario comercial resuelto.
- **Scheduling WFM**: consumidor del horario tecnico resuelto.

### 4.2 Reglas de boundary

1. Organization no debe reutilizar tablas WFM para representar atencion al cliente o recaudo.
2. WFM no debe depender del horario comercial de Organization para resolver disponibilidad tecnica.
3. Los cierres o excepciones de calendario de Organization deben vivir en Organization, aunque conceptualmente se parezcan a los blackouts de WFM.
4. Si en el futuro se quiere un calendario comun transversal, eso requiere ADR separado. No forma parte de este cambio.

---

## 5. Diseno funcional objetivo

### 5.1 Horario comercial de atencion y recaudo

Organization tendra tres capas de configuracion:

1. **Horario base empresa**
   - Define la semana comercial comun.
   - Ejemplo actual: lunes a viernes 08:00-16:00, sabado 08:00-13:00, domingo cerrado.

2. **Override semanal por sede**
   - Se usa solo cuando una sede opera distinto al patron comun.
   - El override reemplaza la semana completa resuelta para esa sede.
   - La ausencia de override implica que la sede usa el horario base.

3. **Excepciones por fecha**
   - Permiten modelar festivos, cierres especiales o aperturas extraordinarias.
   - Pueden aplicar a toda la empresa o a una sede especifica.

### 5.2 Ventana general de despacho tecnico

WFM tendra una sola capa semanal visible:

1. **Ventana general empresa**
   - Define cuando pueden programarse visitas tecnicas por defecto.
   - Ejemplo actual: todos los dias de 07:00 a 20:00.

Se elimina del flujo normal:

- la configuracion de ventana WFM por sede;
- la necesidad de seleccionar sede para ajustar horario tecnico.

Los overrides de tecnico y los cierres WFM existentes se mantienen como conceptos propios del modulo WFM.

---

## 6. Reglas de resolucion

### 6.1 Organization

Para resolver el horario comercial de una sede y fecha concreta, la precedencia sera:

1. excepcion por fecha de sede;
2. excepcion por fecha empresa;
3. override semanal de sede;
4. horario base empresa;
5. sin configuracion.

### 6.2 WFM

Despues del cambio, la precedencia de WFM sera:

1. override de tecnico;
2. blackout o cierre WFM;
3. horario WFM empresa;
4. sin configuracion.

`wfm_site_business_hours` deja de participar en la resolucion operativa.

---

## 7. Modelo de datos propuesto

### 7.1 Nuevas tablas en Organization

#### `organization_company_business_hours`

- `tenant_id`
- `weekday`
- `opens_at`
- `closes_at`
- `is_open`
- `created_at`
- `updated_at`

Reglas:

- una fila por `tenant_id + weekday`;
- si `is_open = false`, `opens_at` y `closes_at` quedan en `null`;
- si `is_open = true`, `opens_at < closes_at`.

#### `organization_business_hours_exceptions`

- `tenant_id`
- `organization_site_id` nullable
- `exception_date`
- `is_recurring`
- `is_open`
- `opens_at` nullable
- `closes_at` nullable
- `name`
- `description` nullable
- `created_at`
- `updated_at`

Uso:

- `organization_site_id = null`: aplica a toda la empresa;
- `organization_site_id = <uuid>`: aplica solo a esa sede;
- `is_open = false`: cierre total por festivo o novedad;
- `is_open = true`: apertura o ajuste extraordinario.

### 7.2 Reuso de tabla existente en Organization

#### `organization_site_business_hours`

Se conserva la tabla actual, pero cambia su semantica funcional:

- deja de representar la fuente primaria del horario comercial;
- pasa a representar solo el **override semanal completo** de una sede.

Regla operativa:

- si una sede no tiene filas en esta tabla, usa el horario base empresa;
- si tiene filas, esas filas se interpretan como override semanal completo.

No se agrega un flag persistido tipo `uses_base_hours`; el modo se deriva por presencia o ausencia de filas.

### 7.3 WFM

#### `wfm_company_business_hours`

Se mantiene como fuente unica de horario semanal tecnico.

#### `wfm_site_business_hours`

Pasa a estado **deprecado**.

Regla:

- no se usa en nuevas pantallas;
- deja de ser consultado por el resolver operativo;
- su limpieza fisica puede ejecutarse en una fase posterior despues de validar no regresion.

---

## 8. API objetivo

### 8.1 Organization

Nuevas capacidades API:

1. obtener horario base empresa;
2. reemplazar horario base empresa;
3. obtener excepciones de calendario;
4. crear/actualizar/eliminar excepcion de calendario;
5. limpiar override semanal de una sede.

Capacidades existentes que se mantienen:

1. obtener detalle de sede;
2. reemplazar horario de sede.

Cambios de contrato recomendados:

- `OrganizationSiteDetail` debe exponer si la sede usa horario base u override;
- el horario devuelto para la UI debe ser el **horario semanal resuelto**;
- la UI debe poder reiniciar una sede a modo base sin fabricar un horario vacio.

Sugerencia de campos nuevos en detalle de sede:

- `businessHoursMode: 'BASE' | 'OVERRIDE'`
- `businessHoursResolved: OrganizationSiteBusinessHourSnapshot[]`

### 8.2 WFM

Se mantienen:

1. `GET /wfm/business-hours/company`
2. `PUT /wfm/business-hours/company`

Se deprecan:

1. `GET /wfm/operating-sites/:siteId/business-hours`
2. `PUT /wfm/operating-sites/:siteId/business-hours`

El portal dejara de consumir esos endpoints.

---

## 9. Diseno de UI

### 9.1 `/dashboard/settings/organization`

La pagina debe reorganizarse asi:

#### Card 1 — Horario base de atencion y recaudo

- tabla semanal unica para toda la empresa;
- texto de ayuda explicando que es el patron comun de oficinas;
- CTA para guardar horario base.

#### Card 2 — Excepciones por sede

- listado de sedes con estado visible:
  - usa horario base;
  - usa horario propio.
- selector o accion para editar una sede puntual;
- CTA para volver una sede a horario base.

#### Card 3 — Festivos y cierres especiales

- calendario o listado de excepciones por fecha;
- soporte para cierre empresa, cierre por sede y apertura extraordinaria.

### 9.2 `/dashboard/settings/field-operations`

La pagina debe quedar con una sola tarjeta semanal de horario tecnico:

- titulo: `Ventana general de despacho tecnico`;
- descripcion: explica que aplica a la programacion tecnica general del tenant;
- se elimina el selector de sede y la tabla semanal por sede.

Los paneles de excepciones de tecnico y cierres WFM pueden mantenerse, porque si pertenecen al dominio operativo real del scheduling.

---

## 10. Estrategia de migracion

### 10.1 Migration de Organization

1. Crear `organization_company_business_hours`.
2. Crear `organization_business_hours_exceptions`.
3. Backfill inicial del horario base empresa usando la sede primaria activa si existe y tiene horario configurado.
4. Mantener intactos los registros actuales de `organization_site_business_hours` como overrides de sede.
5. Exponer en UI que una sede puede volver a `usar horario base`.
6. En una etapa posterior, permitir identificar overrides identicos al base para que el usuario los limpie.

Razon de esta estrategia:

- evita perdida de informacion;
- evita inferencias complejas por mayoria;
- deja la normalizacion final bajo control del usuario administrador.

### 10.2 Migration de WFM

1. Auditar si existen filas en `wfm_site_business_hours`.
2. Comparar esas filas con `wfm_company_business_hours` por tenant.
3. Si existen diferencias reales, bloquear el retiro silencioso y exigir aprobacion operativa.
4. Una vez aprobada la unificacion, cambiar el resolver para ignorar `wfm_site_business_hours`.
5. Retirar la UI por sede.
6. Limpiar datos legacy en una fase final.

Regla: no se debe esconder la UI de WFM por sede si el resolver backend aun la sigue usando.

---

## 11. Testing y validacion

### 11.1 Backend

- tests unitarios del resolver de Organization para precedencia base/sede/fecha;
- tests HTTP de endpoints nuevos de horario base y excepciones;
- tests de migracion para backfill inicial;
- tests de WFM para confirmar que la resolucion ya no usa `wfm_site_business_hours`.

### 11.2 Frontend

- tests de componentes para Organization con modos `BASE` y `OVERRIDE`;
- tests de acciones `usar horario base` y `guardar override`;
- tests de Field Operations para confirmar que solo queda la ventana general;
- ajuste de textos y snapshots si aplican.

### 11.3 Validacion funcional

Escenarios minimos:

1. oficina comun usa horario base;
2. sede especial usa override semanal;
3. festivo nacional cierra todas las oficinas;
4. cierre extraordinario afecta solo una sede;
5. ventana tecnica general aplica a todas las visitas;
6. las reglas personales recurrentes por tecnico no se administran en WFM; ADR-041 retira esa capacidad visible y la disponibilidad individual formal queda reservada para RR. HH. futuro.

---

## 12. Riesgos y decisiones explicitas

### Riesgos

1. La migracion de WFM por sede puede alterar comportamiento real si existen tenants con configuraciones distintas hoy.
2. El backfill del horario base de Organization puede no representar el patron comun si la sede primaria no es la mejor referencia operativa.
3. Agregar excepciones por fecha en Organization aumenta alcance, pero es necesario para representar festivos sin contaminar WFM.

### Decisiones explicitas

1. Se prefiere **base + override + excepcion** en Organization frente a mantener todo por sede.
2. Se prefiere **WFM empresa solamente** frente a empresa + sede.
3. Se mantiene la separacion entre horario comercial y horario tecnico.
4. Se retiran de WFM las excepciones recurrentes por tecnico como configuracion visible, segun ADR-041.
5. No se introduce un motor transversal comun de calendarios en esta fase.

---

## 13. Requiere ADR

No obligatorio para ejecutar la simplificacion de UI y modelo dentro de boundaries existentes.

Si durante implementacion se decide crear un calendario comun transversal compartido entre modulos, entonces si se requiere ADR.
