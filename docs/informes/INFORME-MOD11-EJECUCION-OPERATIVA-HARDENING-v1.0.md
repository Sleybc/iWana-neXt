# INFORME-MOD11-EJECUCION-OPERATIVA-HARDENING-v1.0

**Fecha:** 2026-06-23  
**Módulo:** MOD11 — Ejecución operativa / tareas  
**Objetivo:** Corrección post-auditoría de hallazgos funcionales, de seguridad y de UX

## Alcance aplicado

- Hardening RBAC/ABAC para `SALES`, `TECHNICIAN` y `CONTRACTOR`.
- Matriz básica de transiciones de estado y bloqueo de transiciones terminales.
- Validaciones de consistencia para modo de ejecución, destinatario y responsable.
- Reasignación segura solo a usuarios activos y elegibles.
- Prevención de timeline stale en portal.
- Alineación del formulario de tareas con `react-hook-form` + `zod`.
- Accesibilidad de tabla y gating de navegación del módulo `Operaciones`.
- Ajustes de trazabilidad en audit interceptor para respuestas planas.
- Índices adicionales de persistencia alineados al HLD.

## Correcciones principales

### Backend

- `SALES` ya no puede crear tareas arbitrarias; solo puede crear tareas de instalación originadas desde `CRM` y con destinatarios comerciales permitidos.
- `SALES` solo puede consultar tareas comerciales creadas por su propio usuario.
- `CONTRACTOR` ya no puede transicionar tareas desde controller.
- `TECHNICIAN` solo puede ejecutar transiciones operativas permitidas por matriz.
- Se bloquearon ediciones y reasignaciones sobre tareas `RESOLVED` o `CANCELLED`.
- Se exige responsable `USER` activo y elegible en creación y reasignación.
- Se exige destinatario interno activo cuando el tipo es `INTERNAL_USER`.
- `linkScheduleEvent` y `linkWorkOrder` ahora validan coherencia con el modo de ejecución.
- El interceptor global de auditoría ahora reconoce entidades devueltas como respuesta plana.

### Frontend portal

- El detalle limpia timeline e historial al cambiar de tarea y protege respuestas stale.
- El formulario de creación ahora captura correctamente:
  - fecha objetivo para `DUE_DATE`
  - `scheduledRequired` para `SCHEDULED` y `FIELD_SERVICE`
  - destinatarios internos por selector
  - destinatarios cliente/externos por identificación manual controlada
- Se eliminaron filas de tabla simulando botón; el acceso al detalle ahora usa un control semántico.
- El drawer y el historial muestran labels de usuario en vez de IDs crudos cuando existe resolución local.
- El sidebar oculta `Operaciones` para roles sin acceso al módulo.
- `api-client` expone `update`, `linkScheduleEvent` y `linkWorkOrder` para cerrar brechas de contrato.

### Refinamiento UX posterior

- La vista de `Operaciones` ahora usa una composición más cercana al lenguaje visual del portal: panel de creación y bandeja operativa separados, con mejor jerarquía y foco operativo.
- Cuando la tarea usa modo `SCHEDULED` o `FIELD_SERVICE`, el flujo ya no redirige de forma abrupta al seleccionar el modo. Primero crea la tarea para conservar trazabilidad y luego ofrece CTA explícito hacia `Programación`.
- Para destinatarios `PROSPECT` y `SUBSCRIBER`, el formulario ya no admite identificación libre: consulta registros existentes del sistema y obliga a seleccionar uno real antes de crear la tarea.
- Se añadieron mensajes de contexto para explicar cuándo una tarea debe pasar por `Programación` y cuándo el destinatario debe venir de CRM/comercial.

## Verificación ejecutada

### Typecheck

- `corepack pnpm --filter @iwana/api typecheck`
- `corepack pnpm --filter @iwana/portal typecheck`

### Tests backend

- `corepack pnpm --filter @iwana/api exec jest --runInBand src/modules/tasks/tests/tasks.service.spec.ts src/modules/tasks/tests/task-assignment.service.spec.ts src/modules/tasks/tests/tasks.controller.http.spec.ts src/modules/tasks/tasks.swagger.spec.ts`

Resultado: `4` suites, `17` pruebas en verde.

### Tests portal

- `corepack pnpm --filter @iwana/portal exec jest --runInBand src/components/operations/OperationsClient.spec.tsx src/components/operations/TaskForm.spec.tsx src/components/operations/operations-labels.spec.ts src/components/layout/Sidebar.spec.tsx`

Resultado: `4` suites, `12` pruebas en verde.

## Deuda técnica restante

- El módulo sigue sin pruebas de integración tenant-aware con DB real y guards reales.
- La minimización de datos en respuestas REST de MOD11 puede endurecerse más con DTOs de salida dedicados por rol.
- La validación de responsables `TEAM` y `QUEUE` queda diferida hasta existir catálogo/puerto formal de asignación para esos tipos.
