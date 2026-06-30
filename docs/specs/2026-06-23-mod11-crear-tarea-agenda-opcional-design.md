# Diseno - MOD11 Modal Crear Tarea con Agenda Opcional

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-06-23  
**Modo activo:** Senior UI Systems Designer  
**Autor:** Codex  
**Clasificacion:** Uso interno  
**Trazabilidad base:** docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md, docs/specs/2026-06-22-mod11-operaciones-tareas-design.md, docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md

---

## 1. Objetivo

Definir la version objetivo del modal hoy expuesto como `Agendar tarea` en `Programacion` para alinearlo con MOD11:

- crear primero la `Task`;
- mantener `responsable` y `destinatario` separados;
- tratar la agenda como capacidad opcional;
- resolver `Ticket` y `WorkOrder` como continuidad operativa, no como concepto dominante del intake;
- reducir duplicacion entre `TaskForm`, `ScheduleEventForm` y `SchedulingQuickCreateDialog`.

---

## 2. Problema actual

La implementacion actual de `Programacion` modela el flujo como creacion de `ScheduleEvent` con contexto adicional. Esto produce varios desajustes:

- el titulo del modal promete crear una tarea, pero la accion real crea un evento WFM;
- la agenda aparece como obligatoria desde el primer segundo;
- el flujo no contempla `destinatario`;
- el formulario mezcla captura, agenda, ubicacion, ticket, expediente y OT en una sola pasada;
- conviven dos flujos paralelos de alta friccion: `crear tarea rapida` y `mas opciones`.

---

## 3. Principio rector

El flujo objetivo debe responder a esta secuencia:

1. capturar la necesidad;
2. crear la `Task`;
3. decidir si requiere `Ticket` de control;
4. decidir si requiere agenda;
5. si aplica, crear o vincular `ScheduleEvent`;
6. si aplica, crear o vincular `WorkOrder`.

Regla sintetica de producto:

- `Ticket` gestiona el caso;
- `Task` gestiona el trabajo;
- `Agenda` gestiona la cita;
- `WorkOrder` gestiona la ejecucion tecnica de campo.

---

## 4. Alcance del modal

El modal objetivo cubre:

- creacion manual de tarea desde `Programacion`;
- creacion de tarea desde una franja del calendario;
- creacion de tarea desde CRM;
- creacion de tarea desde Mesa de ayuda;
- decision operativa sobre agenda opcional;
- continuidad operativa hacia ticket, agenda y OT cuando corresponda.

Fuera de alcance en esta iteracion:

- rediseño completo del detalle de ticket;
- rediseño completo del drawer de OT;
- intake omnicanal unificado fuera de `Programacion` y `Operaciones`;
- automatizaciones IA de clasificacion.

---

## 5. Nombre y posicionamiento

### Nombre recomendado

- nombre canonico: `Crear tarea`

### Variantes contextuales

- desde franja de calendario: `Crear tarea con agenda sugerida`
- desde CRM: `Crear tarea desde CRM`
- desde Mesa de ayuda: `Crear tarea desde soporte`

### Copy base del header

Titulo:

- `Crear tarea`

Descripcion:

- `Registra el trabajo, define responsable y destinatario, y decide si necesita agenda.`

No usar:

- `Agendar tarea` como nombre universal del modal;
- `Crear evento` como texto visible principal cuando el flujo se presenta como tarea.

---

## 6. Arquitectura de informacion

El modal objetivo usa wizard de 3 pasos.

### Paso 1 - Contexto

Objetivo:

- definir el trabajo y su ownership;
- capturar la necesidad sin obligar agenda.

Campos:

- `Titulo`
- `Tipo de tarea`
- `Canal de entrada`
- `Descripcion`
- `Responsable`
- `Tipo de destinatario`
- `Destinatario`
- `Origen`

Comportamiento:

- `Origen` llega prellenado y read-only si el flujo viene desde CRM o Mesa de ayuda.
- `Responsable` puede venir precargado desde el contexto del calendario.
- `Destinatario` cambia segun tipo:
  - interno: select de usuario o area;
  - prospecto o suscriptor: busqueda sobre registros existentes;
  - tercero: label visible + referencia opcional.

### Paso 2 - Decision operativa

Objetivo:

- decidir si la tarea necesita control formal y si necesita agenda.

Campos:

- `Modo de ejecucion`
- `Prioridad`
- `Fecha objetivo` solo si el modo es `DUE_DATE`
- `Crear ticket de control` condicional

Valores de `Modo de ejecucion`:

- `Inmediata`
- `Con fecha objetivo`
- `Agendada`
- `Trabajo de campo`

Comportamiento:

- `Inmediata`: no abre agenda.
- `Con fecha objetivo`: solo muestra fecha objetivo.
- `Agendada`: habilita el paso 3.
- `Trabajo de campo`: habilita el paso 3 y permite continuidad a OT.

### Paso 3 - Agenda y continuidad

Objetivo:

- programar la tarea si aplica;
- resolver continuidad hacia agenda y OT.

Bloques:

- `Agenda`
  - fecha
  - hora de llegada
  - duracion
  - responsable en agenda
- `Ubicacion`
  - direccion
  - municipio
  - sector o vereda
- `Referencia geografica`
  - latitud
  - longitud
  - oculto por defecto
- `Horarios sugeridos`
  - panel secundario, no protagonista
- `Continuidad tecnica`
  - `Crear orden de trabajo`
  - notas internas

No debe vivir aqui:

- `UUID opcional`
- `subscriberId`
- `contractId`
- labels tecnicos de origen

Las referencias tecnicas quedan internas; el usuario ve nombres de negocio.

---

## 7. Reglas por origen

### 7.1 Manual desde Programacion

Resultado minimo:

- crear `Task`
- agenda solo si el modo lo exige

Ticket:

- opcional segun clasificacion operativa

### 7.2 Desde franja de calendario

Resultado minimo:

- crear `Task`
- precargar fecha, hora y responsable sugerido

Regla:

- la franja no reemplaza el paso de contexto;
- solo acelera el paso de agenda.

### 7.3 Desde CRM

Resultado minimo:

- origen CRM bloqueado;
- destinatario cliente o prospecto visible de forma amigable;
- `Task` obligatoria si hay trabajo ejecutable.

Ticket:

- no universal;
- permitido como automatico para instalaciones cuando el tenant requiera control formal del caso.

### 7.4 Desde Mesa de ayuda

Resultado minimo:

- ticket existente visible como referencia amigable;
- no volver a pedir ticket;
- crear `Task` ligada al ticket;
- agenda solo si aplica visita o trabajo de campo.

---

## 8. Matriz de decision

| Escenario | CRM | Ticket | Task | Agenda | OT |
| --- | --- | --- | --- | --- | --- |
| Solicitud de informacion comercial | Si | No | No u opcional | No | No |
| Instalacion nueva | Si | Opcional o automatica segun tenant | Si | Si cuando haya visita | Si |
| Falla o revision de servicio | No | Si | Si | Si cuando haya visita | Si cuando sea campo |
| Correccion de factura | No | Si | Si interna | No | No |
| Solicitud interna puntual | No | No | Si | No | No |

---

## 9. Decisiones de UX

### 9.1 Wizard corto y estable

- 3 pasos maximo.
- Sin stepper ornamental; debe mostrar progreso claro: `Paso 1 de 3`.
- El footer debe mantenerse fijo con:
  - `Cancelar`
  - `Atras`
  - `Continuar`
  - `Crear tarea` o `Crear tarea y agenda`

### 9.2 Densidad operativa

- una sola superficie dominante;
- evitar cards dentro de cards;
- usar primitivas compartidas de seccion;
- los bloques secundarios deben plegarse cuando no aportan al caso base.

### 9.3 Agenda como paso condicional

- no renderizar fecha, hora y duracion si el modo no lo necesita;
- las recomendaciones de agenda no deben desplazar el objetivo principal del modal;
- `Crear tarea rapida` deja de ser flujo paralelo y pasa a ser launcher del mismo wizard con valores precargados.

### 9.4 Vocabulario

Usar:

- `Crear tarea`
- `Modo de ejecucion`
- `Fecha objetivo`
- `Programar agenda`
- `Crear ticket de control`
- `Crear orden de trabajo`

Evitar:

- `UUID`
- `source ref`
- `subscriber id`
- `work order source context`

---

## 10. Estados y validaciones

### Baseline

- titulo obligatorio;
- responsable obligatorio;
- destinatario obligatorio segun tipo;
- fecha objetivo obligatoria solo cuando `executionMode = DUE_DATE`;
- agenda obligatoria solo cuando `executionMode = SCHEDULED` o `FIELD_SERVICE`.

### Agenda

- no permitir agenda en pasado;
- respetar ventana operativa cuando aplique;
- duracion valida antes de buscar horarios sugeridos;
- ubicacion minima solo cuando el tipo de tarea la requiera.

### Continuidad

- `Crear ticket de control` visible solo cuando el origen o tipo lo justifique;
- `Crear orden de trabajo` visible solo en trabajo de campo o instalacion;
- si la agenda falla y la politica lo permite, la `Task` puede quedar creada como pendiente de programacion.

---

## 11. Impacto esperado en codigo

Objetivo de implementacion:

- evitar que `ScheduleEventForm` siga siendo la fuente principal del flujo;
- reutilizar logica de `TaskForm` como base del paso 1 y parte del paso 2;
- convertir `SchedulingQuickCreateDialog` en variante de entrada del mismo wizard;
- usar `tasksApi.create()` como accion primaria;
- usar `tasksApi.linkScheduleEvent()` y `tasksApi.linkWorkOrder()` como continuidad;
- mantener integraciones CRM y Assurance sin duplicar contexto visible.

Archivos candidatos:

- `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- `apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx`
- `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- `apps/portal/src/components/operations/TaskForm.tsx`
- componentes compartidos nuevos para pasos o secciones

---

## 12. Criterios de aceptacion del rediseño

1. El modal ya no trata la agenda como paso obligatorio universal.
2. El flujo crea primero `Task` y no `ScheduleEvent`.
3. `Responsable` y `destinatario` aparecen como conceptos separados.
4. Una consulta comercial puede cerrarse sin `Ticket` y sin agenda.
5. Una instalacion puede crear `Task` y luego agenda, con `Ticket` automatico solo cuando la politica del tenant lo exija.
6. Un caso de soporte originado en Mesa de ayuda puede crear `Task` sin duplicar la captura del ticket.
7. La version rapida desde el calendario no mantiene reglas distintas a la version completa.
8. El modal usa copy amigable y no expone labels tecnicos innecesarios.
9. La UI conserva jerarquia, contraste y foco visible alineados a iWana.

---

## 13. Artefactos relacionados

- PRD: `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- HLD: `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- Diseno base MOD11: `docs/specs/2026-06-22-mod11-operaciones-tareas-design.md`
- Plan de implementacion: `docs/plans/2026-06-23-mod11-modal-crear-tarea-agenda-opcional.md`
