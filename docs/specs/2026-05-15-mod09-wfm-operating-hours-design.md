# Design — MOD09 horarios operativos WFM por tablas

**Version:** 1.0
**Estado:** Aprobado para ejecucion
**Fecha:** 2026-05-15
**Modo activo:** Mixto
**Origen:** Conversacion de producto sobre recomendaciones WFM fuera del horario laboral
**PRD rector:** `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
**HLD relacionado:** `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
**HLD complementario:** `docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md`
**Spec relacionada:** `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md`
**ADR rector:** `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`

> **Addendum de arquitectura (2026-05-19):** La decision de esta spec sigue valida para MOD09 Fase 01 como implementacion transitoria de horarios operativos WFM. Sin embargo, la aprobacion CTO de ADR-040 elevo la **sede** a dato maestro transversal administrado desde MOD00 Configuracion/Organizacion. Ver `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`, `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` y `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`. La direccion aprobada es que `OrganizationSite` sea el owner conceptual de sedes y WFM conserve solo reglas de despacho, agenda, Work Orders, overrides y ventanas operativas.
>
> **Addendum de arquitectura (2026-05-22):** ADR-041 retira del producto WFM las **Excepciones por tecnico** y reemplaza el modelo de precedencia que daba prioridad a `WfmTechnicianBusinessOverride`. Desde este corte, field operations no expone reglas personales recurrentes. WFM conserva horario base, horario por sede y cierres especiales; ausencias personales, permisos y licencias quedan como ownership futuro de RR. HH. Ver `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md` y `docs/specs/2026-05-22-mod09-wfm-field-operations-sin-excepciones-design.md`.

---

## 1. Problema

WFM hoy asume una franja operativa fija para instalaciones y eso rompe en dos niveles:

1. Las recomendaciones pueden terminar proponiendo o dejando pasar escenarios que no responden al horario real de la empresa.
2. El modelo actual no soporta reglas reales del negocio: sedes con horarios distintos y festivos o cierres especiales.

El usuario confirma un alcance más exigente que el correctivo inicial:

1. El horario debe ser configurable manualmente.
2. La configuración debe cubrir días de la semana, hora de entrada y hora de salida.
3. Se requieren festivos o cierres especiales.
4. Se requieren reglas por sede entendida como **oficina/base operativa real**, no como nodo comercial.
5. Las reglas personales recurrentes por tecnico quedan fuera de WFM desde ADR-041.

La solución ya no cabe de forma sana en un hardcode ni en un JSONB simple de settings.

---

## 2. Decisión de diseño

Se adopta una solución **tables-first tenant-aware** dentro de WFM para el corte aprobado de Fase 01.

La decisión aprobada es:

1. El horario operativo deja de modelarse como constante y pasa a resolverse desde tablas nuevas en el schema tenant.
2. Se crea una entidad nueva de **sede operativa** para representar oficinas o bases de despacho durante la transicion.
3. No se reutiliza `CommercialNode`, porque en el repo ese concepto pertenece al dominio de cobertura/comercial y no representa necesariamente una oficina física.
4. La ventana válida de agenda se calcula por precedencia de reglas, no por una única configuración global.
5. La misma resolución de horario debe aplicarse a recomendaciones y a persistencia final.

Se descartan dos alternativas:

- **Extender `tenant.settings` con horarios semanales:** util para un caso simple por empresa, pero insuficiente para festivos, sedes y cierres especiales.
- **Resolverlo solo con `TechnicianAvailability`:** esa entidad sirve para bloqueos puntuales, pero no es un buen owner del calendario operativo estructural ni de la jerarquía empresa → sede. Tampoco debe convertirse en sustituto visible de Excepciones por tecnico.

---

## 3. Objetivo funcional

El sistema debe calcular una **ventana efectiva de trabajo** por fecha local, sede operativa y tecnico asignado o candidato, sin reglas personales recurrentes administradas desde settings.

Con esa ventana efectiva:

1. `ScheduleRecommendationsService` solo puede generar slots dentro del rango permitido.
2. `ScheduleEventsService` solo puede crear, editar o reagendar dentro del rango permitido.
3. `VisitRequestsService` solo puede materializar agenda dentro del rango permitido.
4. La UI debe mostrar únicamente franjas válidas o explicar por qué no existen.

---

## 4. Precedencia de reglas

La precedencia vigente desde ADR-041 para resolver choques es:

1. **Festivo o cierre especial**
2. **Horario de sede**
3. **Horario base de empresa**

Interpretación operativa:

1. Un festivo o cierre especial bloquea la agenda del contexto aplicable.
2. Si no hay cierre aplicable, la sede puede restringir o especializar el horario base de empresa.
3. Si no hay regla de sede, aplica la regla base de empresa.

Ejemplo:

- Empresa: 08:00–18:00
- Sede A: 09:00–17:00
- Fecha: festivo

Resultado:

1. Si el festivo aplica al contexto, la fecha queda bloqueada y no se generan ni persisten slots.
2. Si no aplica festivo, la sede A opera 09:00–17:00.

---

## 5. Boundaries y ownership

### 5.1 Ownership

- **WFM** es owner del calendario operativo de Fase 01, festivos, cierres especiales, agenda y recomendaciones.
- **RR. HH. futuro** sera owner conceptual de ausencias personales, permisos, licencias y reglas individuales recurrentes.
- **Configuracion/Organizacion v2** sera owner conceptual de sedes corporativas cuando ADR-040 sea aprobado. WFM consumira esas sedes por puerto tipado y mantendra reglas propias de despacho.
- **TenantModule** sigue siendo owner de settings corporativos globales como `timezone`, `currency`, `language` y `country`.
- **MOD03 cobertura legacy** mantiene ownership historico de `CommercialNode` y `CoverageZone`, que no deben usarse como sustituto de sede física. La direccion nueva de control plane vive en MOD00.

### 5.2 Reglas de boundary

1. Las tablas nuevas viven en schema tenant y siguen la estrategia de `SET LOCAL search_path`.
2. No se crean FKs cross-schema hacia `public.tenants`.
3. Las referencias a `tenantId` y `userId` se manejan como referencias lógicas o intra-schema, respetando el baseline del módulo.
4. WFM no reusa coverage nodes como si fueran oficinas operativas.
5. La migracion hacia `OrganizationSite` debe ser aditiva; no se elimina `WfmOperatingSite` mientras existan agendas, visit requests o Work Orders dependientes sin mapping seguro.

---

## 6. Modelo de datos propuesto

### 6.1 Nueva entidad: sede operativa

Tabla propuesta: `wfm_operating_sites`

Responsabilidad: representar oficinas o bases operativas desde donde se organiza la agenda de campo.

Campos mínimos:

- `id`
- `tenant_id`
- `name`
- `code`
- `address`
- `municipality`
- `sector`
- `latitude`
- `longitude`
- `is_active`
- `created_at`
- `updated_at`
- `deleted_at`

Notas:

1. `name` y `code` deben ser únicos por tenant entre registros activos.
2. La sede existe aunque no tenga georreferencia completa desde el primer corte.

### 6.2 Horario base de empresa

Tabla propuesta: `wfm_company_business_hours`

Responsabilidad: definir la semana laboral base del tenant.

Campos mínimos:

- `id`
- `tenant_id`
- `weekday`
- `start_time`
- `end_time`
- `is_enabled`
- `created_at`
- `updated_at`

Restricciones:

1. Única fila activa por `tenant_id + weekday`.
2. Si `is_enabled = true`, `start_time < end_time`.
3. Si `is_enabled = false`, la ventana se interpreta como día cerrado.

### 6.3 Horario por sede

Tabla propuesta: `wfm_site_business_hours`

Responsabilidad: especializar la semana laboral para una sede operativa.

Campos mínimos:

- `id`
- `tenant_id`
- `site_id`
- `weekday`
- `start_time`
- `end_time`
- `is_enabled`
- `created_at`
- `updated_at`

Restricciones:

1. Única fila activa por `tenant_id + site_id + weekday`.
2. La ausencia de fila implica fallback al horario base de empresa.

### 6.4 Excepciones por tecnico retiradas

ADR-041 retira `wfm_technician_business_overrides` del producto WFM. Esta tabla deja de ser parte del modelo objetivo de horarios operativos y debe retirarse mediante plan tecnico y migracion reversible.

La disponibilidad personal recurrente no se modela en WFM. Cuando exista RR. HH., WFM consumira ausencias aprobadas por contrato tipado o evento aprobado.

### 6.5 Festivos y cierres especiales

Tabla propuesta: `wfm_holiday_blackouts`

Responsabilidad: modelar cierres puntuales o recurrentes del tenant o de una sede.

Campos mínimos:

- `id`
- `tenant_id`
- `site_id` nullable
- `blackout_date`
- `is_recurring`
- `name`
- `description`
- `is_enabled`
- `created_at`
- `updated_at`

Reglas:

1. Si `site_id` es null, el cierre aplica a nivel tenant.
2. Si `site_id` tiene valor, aplica solo a esa sede.
3. No existe excepcion personal manual en WFM que pueda abrir agenda sobre un cierre especial.

---

## 7. Resolución de ventana efectiva

Se introduce un resolvedor central en WFM, por ejemplo `OperatingWindowResolverService`.

Entrada mínima:

- `tenantId`
- `siteId` optional
- `technicianId` optional
- `dateLocal`
- `timezone`

Salida esperada:

- `status`: `OPEN` o `CLOSED`
- `source`: `HOLIDAY_BLACKOUT`, `SITE_HOURS`, `COMPANY_HOURS`
- `startTime`
- `endTime`
- `reason`

Reglas de resolución:

1. Evaluar blackout recurrente o puntual del tenant o de la sede.
2. Si no hay blackout, buscar horario de sede.
3. Si no hay horario de sede, usar horario base de empresa.
4. Si ninguna regla existe, devolver cerrado con motivo de configuración faltante o usar fallback controlado durante migración inicial.

---

## 8. Impacto en backend WFM

### 8.1 Recomendaciones

`ScheduleRecommendationsService` debe dejar de depender de una ventana fija o de un hardcode diario.

Nuevo comportamiento:

1. Determinar el día local de la búsqueda.
2. Resolver la ventana efectiva para cada técnico candidato y la sede aplicable.
3. Generar slots solo dentro de esa ventana.
4. Si la fecha está cerrada por cierre especial o falta de horario aplicable, no devolver recomendaciones.

### 8.2 Guardado final

`ScheduleEventsService` y `VisitRequestsService` deben validar que el evento final cae dentro de la ventana efectiva.

Debe rechazarse con `400` cuando:

1. la fecha esté cerrada a nivel empresa o sede;
2. exista blackout aplicable;
3. la hora esté fuera del rango efectivo de sede o empresa.

### 8.3 Asociación con sede operativa

La agenda debe poder identificar desde qué sede se está operando.

Se recomienda:

1. permitir que `VisitRequest` y `ScheduleEvent` almacenen `operatingSiteId`;
2. conservar snapshot visible de nombre de sede cuando aplique;
3. no forzar esta asociación en flujos legacy hasta completar migración UX.

Regla de ejecución aprobada:

1. `operatingSiteId` será **opcional** en este corte para no romper agendas legacy ni tenants monosede.
2. Si el tenant tiene múltiples sedes activas, portal debe permitir seleccionar la sede al recomendar o agendar.
3. Si el tenant tiene una sola sede activa, portal puede preseleccionarla sin fricción adicional.

---

## 9. Impacto en portal

### 9.1 Administración

La configuración requerida supera el alcance natural del formulario actual de ajustes operativos.

Se recomienda una superficie dedicada dentro del portal para WFM settings que cubra:

1. CRUD de sedes operativas;
2. horario semanal base de empresa;
3. horario semanal por sede;
4. festivos y cierres especiales.

Decisión de ejecución para este corte:

1. La primera entrega puede vivir dentro de la pestaña `operations` de settings, pero en un manager separado del formulario general.
2. No se debe inflar `OperationalSettingsForm.tsx` con toda la lógica de WFM; se debe crear un componente dedicado y autocontenido.
3. Si durante la ejecución la densidad vuelve inmanejable, se escala una subnavegación o vista propia sin cambiar el modelo de datos.

### 9.2 Scheduling UI

Las pantallas de agenda deben:

1. filtrar horas disponibles según ventana efectiva;
2. mostrar motivo de no disponibilidad;
3. permitir trabajar con sede operativa cuando el tenant tenga más de una.

Esto impacta como mínimo:

- `ScheduleEventForm`
- `RescheduleEventDialog`
- `VisitRequestRecommendationPanel`
- helpers de tiempo compartidos en portal

---

## 10. Estrategia de migración

Para no romper el comportamiento actual en tenants ya operativos:

1. se puede sembrar horario base inicial equivalente al comportamiento vigente mientras no exista configuración explícita;
2. ese seed debe ser explícito y revisable, no un hardcode oculto permanente;
3. una vez existan tablas y datos iniciales, el hardcode debe eliminarse por completo.

La recomendación base para la transición es:

- empresa: lunes a domingo 07:00–18:00 como semilla técnica de compatibilidad;
- luego cada tenant ajusta sedes, festivos y cierres especiales según operación real.

---

## 11. Riesgos y mitigaciones

### Riesgo 1: crear demasiada complejidad en settings

Mitigación:

- separar el modelo complejo en tablas WFM y no inflar `tenant.settings`.

### Riesgo 2: confundir sede con nodo comercial

Mitigación:

- crear entidad nueva de sede operativa y no reciclar `CommercialNode`.

### Riesgo 3: inconsistencias en precedencia

Mitigación:

- centralizar toda la lógica en un solo resolvedor reutilizado por recomendaciones y persistencia.

### Riesgo 4: UI demasiado densa

Mitigación:

- separar la administración WFM en sub-secciones o pantalla dedicada, no como expansión lineal del formulario actual.

---

## 12. Criterios de aceptación

1. El tenant puede definir horario base por día de semana.
2. El tenant puede definir sedes operativas y horarios semanales por sede.
3. El tenant puede registrar festivos o cierres especiales.
4. Las recomendaciones solo se calculan dentro de la ventana efectiva.
5. Crear, editar, reagendar y agendar desde visit request se bloquea fuera de la ventana efectiva.
6. La UI explica por qué no existen slots cuando la fecha o el contexto está cerrado.

---

## 13. Fuera de alcance

1. Cuadrillas o equipos con calendario propio, salvo que se reabra el diseño para `assignedTeamId`.
2. Optimización avanzada por rutas multi-sede.
3. Sincronización automática con calendarios externos.
4. Motor de recurrencia complejo más allá de weekly hours + festivo puntual o recurrente.

---

## 14. Handoff

Esta spec deja aprobada la dirección técnica para implementar horarios operativos WFM con soporte real de empresa, sede, técnico y festivos.

No se requiere ADR adicional para iniciar este corte porque:

1. no cambia el stack aprobado;
2. no crea un bounded context nuevo;
3. permanece dentro del ownership ya aprobado de `WfmModule`.

Sí se deberá escalar a ADR si, durante la implementación, aparece cualquiera de estas condiciones:

1. convertir la sede operativa en concepto transversal reutilizable fuera de WFM;
2. mover la administración fuera del boundary WFM o de tenant self-service;
3. introducir un nuevo patrón de integración cross-module o una estrategia distinta de tenancy.

El siguiente paso debe ser un plan de implementación por fases que cubra:

1. migraciones y entidades;
2. resolvedor de ventana efectiva;
3. enforcement backend;
4. cálculo de recomendaciones;
5. UI administrativa;
6. ajustes de scheduling UI;
7. pruebas y evidencia.
