# Informe CRM Expediente — Optimización Task 6

**Fecha:** 2026-08-24  
**Estado:** Implementado — lectura unificada paginada e integración Portal  
**Agente:** AI-SR-FULL

## Alcance

Se añadió la lectura paginada del timeline de un expediente sin invocar
`ExpedienteService.findById()` ni hidratar relaciones completas. WFM, portal,
migraciones y endpoints de escritura permanecen fuera de esta tarea.

## Implementación

- Nuevo DTO tipado para filtros, actores, eventos y respuesta paginada.
- `GET /crm/expedientes/:id/timeline?page=1&limit=5&filter=all` devuelve:
  `{ data: { events, metadata }, meta: { page, limit, total, totalPages } }`.
- Las consultas usan `runInTenantSchema`, `TenantContext`, `select` explícito,
  filtro por `tenantId` + expediente y orden estable por fecha DESC + id DESC.
- Se consultan de forma acotada cambios de pipeline, contactos, historial de
  responsables, atribuciones y auditoría funcional con `findAndCount`/QueryBuilder,
  límites físicos y proyecciones escalares; después se hace merge tipado y
  paginación en memoria.
- Los filtros `all`, `contact`, `asignaciones`, `pipeline` y `system` se aplican
  antes de construir la colección de eventos.
- Las auditorías `piiaAccess` se excluyen. La proyección no selecciona IP,
  ciphertext, snapshots ni relaciones del expediente; los payloads de auditoría
  no se devuelven.
- La auditoría funcional se filtra en SQL por `entity_type`, `entity_id`, acción y
  exclusión de `piiaAccess`; solo proyecta `id`, actor, sección, acción y fecha.
- Los actores se resuelven mediante `CrmActorReadPort`; responsabilidades usan el
  actor ejecutor (`changedBy`) y atribuciones usan el actor de atribución
  (`attributedBy`), sin inferirlo desde el sujeto asignado.
- Sin parámetros de query, el handler conserva el envelope legado
  `{ changes, activities, metadata }`.

## Límite técnico documentado

La unificación mantiene consultas separadas por boundary y merge en memoria, en
lugar de un `UNION` SQL entre entidades con fechas y formas de actor distintas.
Para `all`, el máximo actual es una consulta de existencia, cuatro consultas
`findAndCount` de fuentes y dos consultas QueryBuilder de auditoría (rows + count).
Cada fuente recibe `take = page * limit`, con `limit` acotado a 50 y offset máximo
500; la paginación final se aplica después de ordenar el conjunto acotado para
preservar total y orden global sin hidratar el grafo del expediente.

## Archivos

- `apps/api/src/modules/crm/expedientes/dto/expediente-timeline.dto.ts`
- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`

## Verificación

- Tests focalizados servicio/controlador: **2 suites, 93 tests aprobados**.
- Tests de `src/modules/crm/expedientes/tests`: **10 suites, 156 tests aprobados**.
- Typecheck de `@iwana/api`: **aprobado**.
- ESLint focalizado de los cinco archivos de código/pruebas: **aprobado**.
- Los mocks de servicio cubren `findOne`, `findAndCount` y QueryBuilder; no se
  ejecuta PostgreSQL real en esta suite.
- Migraciones: no aplica.
- No se hizo commit.

## Límites y pendientes

- El consumidor portal será migrado en la tarea de integración frontend prevista
  por el plan; el endpoint legado sigue disponible durante la transición.
- No se declara cobertura numérica porque esta corrida no ejecutó `--coverage`.
- `git diff --check` global conserva avisos de whitespace en cambios preexistentes
  de otros agentes; no se atribuyen a esta tarea.
- El workspace contiene cambios preexistentes de múltiples agentes; no se
  limpiaron ni se modificaron como parte de esta tarea.

## Integración frontend — AI-FE-PLATFORM

- `@iwana/portal` consume `GET /crm/expedientes/:id/timeline` mediante
  `crmApi.getExpedienteTimelinePage`, con tipos discriminados para eventos de
  contacto, responsabilidad, atribución, pipeline y sistema.
- `SeguimientoTab` mantiene filtros y paginación server-side, estados de carga,
  vacío, error/reintento y refresco de la página actual después de mutaciones.
- `ExpedienteTimelinePanel` elimina las fuentes legacy del timeline, deduplica
  eventos y conserva la metadata del envelope paginado.
- Se añadieron mocks de bootstrap y del envelope paginado a los E2E CRM; los
  selectores de pestañas reflejan el contrato accesible actual (`role="tab"`).

### Verificación frontend

- Typecheck Portal: aprobado (`pnpm --filter @iwana/portal typecheck`).
- Jest focalizado Portal: **4 suites, 40 tests aprobados**.
- ESLint focalizado Portal: aprobado.
- Prettier check de archivos Portal/E2E afectados: aprobado.
- E2E CRM Portal: **26 tests aprobados** en los tres archivos CRM.
- `git diff --check` de archivos afectados: aprobado; los avisos globales
  restantes pertenecen a cambios preexistentes de otros agentes.
- No se hizo commit.

## Correcciones de integración — Task 6

- La invalidación específica exportada para el timeline ahora versiona la unión
  de entradas cacheadas, requests pendientes y versiones conocidas. Las
  respuestas antiguas ya no pueden volver a poblar `resourceCache` después de
  una escritura o cambio de tenant; los catálogos permanecen intactos.
- Gestión invalida el timeline del tenant y expediente después de guardar una
  sección, cambiar el estado o reactivar una oportunidad.
- El contrato paginado limita `total` y `totalPages` al máximo físico alcanzable
  dentro de 500 eventos para el `limit` solicitado, y expone `truncated` y
  `hasMore` en API, Swagger y Portal.
- Se añadieron pruebas para invalidación desde Gestión, respuestas pendientes
  obsoletas, preservación de catálogos, cota de páginas y las cinco variantes
  renderizables del evento.

### Verificación de correcciones

- Portal timeline: **5 suites, 51 tests aprobados**.
- API timeline/Swagger: **3 suites, 95 tests aprobados**.
- Typecheck Portal y API: aprobados.
- ESLint focalizado Portal y API: aprobado.
- E2E CRM Portal: **26 tests aprobados**.
- No se hizo commit.

### Addendum QA — AI-SR-QA

- Se añadió cobertura explícita para la invalidación del timeline después de
  reactivar una oportunidad descartada en
  `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`.
- Verificación focalizada posterior: **1 suite, 17 tests aprobados**.
- Typecheck API y Portal: aprobados.
- La suite completa del Portal queda bloqueada por **2 suites y 5 tests**:
  cuatro fallos fuera del alcance Task 6 en `SchedulingClient` y una violación del
  contrato WCAG/contraste en `ExpedienteTimelinePanel.tsx`, donde una región
  `aria-busy` conserva `opacity-60`. No se modifica lógica de negocio desde QA.
- La suite completa del API terminó con **265 suites aprobadas, 3.284 tests
  aprobados y 4 suites omitidas**, aunque emitió errores asíncronos de conexión
  Redis posteriores a tests y un worker que requirió terminación forzada.
- Estado QA de ese corte: **BLOQUEADO** hasta corregir la infracción de contraste
  y revalidar la suite completa del Portal. La corrección y la revalidación se
  documentan en el addendum siguiente.

### Addendum integración final — AI-FE-PLATFORM

- Gestión ahora mantiene `timelineRevision` y la incrementa después de guardar
  sección, cambiar estado o reactivar; Seguimiento invalida la generación local
  y descarta respuestas de solicitudes anteriores al recibir una nueva revisión.
- Las mutaciones de responsabilidad y atribución ejecutan `onSaved` y refrescan
  el timeline. Si la escritura funciona pero la lectura posterior falla, la UI
  conserva el éxito de la escritura y muestra un aviso accionable, sin presentar
  un error falso de mutación.
- Se retiró `opacity-60` de la región `aria-busy`; la actualización permanece
  anunciada mediante un estado para tecnologías de asistencia.
- Los fixtures focalizados usan nombres sintéticos neutrales y cubren eventos
  `system/CREATED`, mutación+navegación, refresh fallido, revisión del timeline,
  responsabilidad y atribución.

#### Verificación final focalizada

- Jest Seguimiento: **1 suite, 15 tests aprobados**.
- Jest Timeline: **1 suite aprobada**.
- Jest página de expediente: **1 suite, 17 tests aprobados**.
- Typecheck Portal: aprobado.
- No se hizo commit.
