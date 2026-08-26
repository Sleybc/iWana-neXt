# Informe CRM Expediente — Optimización Task 2

**Fecha:** 2026-08-24  
**Estado:** Implementado — cierre técnico Task 2 con concerns declarados  
**Agente:** AI-SR-FULL  

## Alcance

Se implementó el bootstrap seguro del detalle de expediente, sin modificar el
endpoint legado `GET /crm/expedientes/:id`.

## Implementación

- Nuevo `GET /crm/expedientes/:id/bootstrap`, protegido para `ADMIN`, `SALES`,
  `SUPPORT` y `SYSTEM_ADMIN`.
- Consulta proyectada sin relaciones completas, campos cifrados ni metadatos de
  auditoría interna en la proyección expuesta.
- El bootstrap aplica safe-by-default: la proyección expuesta queda limitada a
  Vista general; no incluye fecha de nacimiento, correo secundario, nombres de
  contacto, datos fiscales/RUT, notas operativas ni soportes documentales.
- La ubicación se reduce a `hasLocation`; no se exponen dirección, barrio,
  código postal, latitud ni longitud.
- Los datos de presencia que completitud necesita de campos reservados se reducen a
  flags booleanos SQL; los valores internos requeridos para cálculo nunca se
  devuelven en la proyección.
- La ubicación usa flags independientes para dirección, municipio, departamento,
  código postal, estrato, barrio y cada coordenada; completitud y recomendación
  consumen esos flags sin cargar valores exactos.
- Los flags textuales usan `NULLIF(BTRIM(column), '')`; los flags numéricos usan
  `IS NOT NULL`, con regresión para evitar inflar completitud por strings vacíos.
- Las claves de soportes documentales permanecen canónicas (`identity_document`,
  `utility_bill`, `chamber_of_commerce`, `rut`, `legal_representative_id`),
  incluyendo flags APPROVED consumidos por completitud.
- Completitud calculada una sola vez con contexto precargado.
- Las lecturas de consents, coverageChecks y quotes tienen fallback independiente:
  una incompatibilidad conocida no borra datos ya obtenidos ni impide consultar
  las fuentes restantes; los errores operativos se mantienen propagados.
- Consents y coverageChecks usan selects mínimos (`id`, `expedienteId` y los
  campos de cálculo); quotes usa únicamente `id`, `expedienteId` y `status`.
- `calculateBatch` conserva fallback independiente para errores PostgreSQL `42P01`
  y `42703`, sin descartar datos recuperados de otras fuentes.
- Recomendación generada desde el expediente y la completitud ya resueltos.
- Metadata operativa acotada; no se reutiliza `getTimelineSummary()`.
- Atribución, responsabilidad, metadata y resumen opcional de suscriptor cargados
  en paralelo con el contexto relacionado, después de obtener la proyección base.
- `createdAt` y `updatedAt` forman parte explícita de la proyección segura; las
  columnas numéricas de PostgreSQL expuestas se normalizan a `number`.
- El contrato runtime de Swagger documenta completitud, recomendación, atribución,
  responsabilidad y subscriber mediante DTOs nested decorados.
- `pipelineRecommendation` es nullable en el contrato y tiene prueba explícita.
- La lectura del bootstrap emite `AuditAction.LIST_ACCESS` con actor, tenant,
  expediente, superficie y resultado; el payload no contiene PII y el fallo de
  auditoría no bloquea la respuesta.
- `TenantMiddleware` marca si el contexto proviene de JWT verificado o de
  `X-Tenant-Slug` público. `ThrottlerGuard` global no depende de `request.user`:
  sin marker JWT verificado usa IP incluso si llega un bearer; con tenant usa hash SHA-256 del bearer
  junto al contexto tenant, bucket tenant para cookie y únicamente IP anónima sin
  contexto. Los endpoints operativos conservan su guard específico.
- Atribución, responsabilidad y subscriber usan selects explícitos; los nombres
  visibles nunca caen a email como fallback.
- El bootstrap consume attribution/responsibility/subscriber mediante ports tipados;
  los adaptadores/servicios entregan snapshots mínimos, no entidades completas.
- `CrmActorReadAdapter` selecciona únicamente `id`, `firstName`, `lastName` y
  `role` cuando aplica; un actor sin nombre compuesto devuelve `name: null`.
- `calculate(id)` y `getRecommendation(id)` conservan compatibilidad y delegan
  al núcleo compartido.

## Archivos de la fase

- `apps/api/src/modules/crm/expedientes/dto/expediente-detail-bootstrap.dto.ts`
- `apps/api/src/modules/crm/expedientes/expediente-detail-bootstrap.service.ts`
- `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- `apps/api/src/modules/crm/expedientes/expedientes.module.ts`
- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- `apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts`
- `apps/api/src/modules/crm/expedientes/document-support.types.ts`
- `apps/api/src/modules/crm/expedientes/expediente-section-completeness.types.ts`
- `apps/api/src/modules/crm/expedientes/pipeline-recommendation.service.ts`
- `apps/api/src/modules/crm/expedientes/tests/expediente-detail-bootstrap.service.spec.ts`
- `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts`
- `apps/api/src/modules/crm/attributions/attributions.service.ts`
- `apps/api/src/modules/crm/responsibilities/responsibilities.service.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
- `apps/api/src/modules/crm/ports/crm-attribution-read.port.ts`
- `apps/api/src/modules/crm/ports/crm-responsibility-read.port.ts`
- `apps/api/src/modules/crm/ports/crm-subscriber-read.port.ts`
- `apps/api/src/modules/crm/expedientes/tests/crm-actor-read.adapter.spec.ts`
- `apps/api/src/modules/crm/expedientes/crm-quote-read.adapter.ts`
- `apps/api/src/modules/crm/expedientes/tests/crm-quote-read.adapter.spec.ts`
- `apps/api/src/common/rate-limit-tracker.ts`
- `apps/api/src/common/rate-limit-tracker.spec.ts`
- `apps/api/src/modules/tenant/tenant.middleware.ts`
- `apps/api/src/modules/tenant/tenant.middleware.spec.ts`
- `apps/api/src/app.module.ts`

## Verificación

- Corrida final focalizada de bootstrap/completitud/quotes/actor/pipeline,
  enriquecimientos, throttling y rate tracker: **10 suites, 82 tests aprobados**.
- Middleware tenant + rate tracker: **2 suites, 15 tests aprobados**.
- Corrida completa de `src/modules/crm`: **46 suites, 456 tests aprobados**.
- Typecheck de `@iwana/api`: **aprobado**.
- ESLint focalizado: **aprobado**.
- ESLint completo de `@iwana/api`: **0 errores, 7 warnings preexistentes fuera
  del alcance CRM/bootstrap** (`main.ts`, audit, inventory, tasks y taxation).
- Cobertura de cumplimiento añadida para roles, envelope, tenant/schema,
  proyección segura sin PII reservada, `hasLocation`, flags de presencia,
  metadata sin `piiaAccess`, auditoría de lectura, selects acotados, errores
  operativos del subscriber, OpenAPI runtime con tipos explícitos, throttling
  global y reglas de no regresión del pipeline.
- Migraciones: no aplica.
- Endpoint legado: deliberadamente sin cambios funcionales; su exposición se
  mantiene para Task 3.

## Deuda y revisión

La especificación de diseño propone `pipelineRecommendation` nullable. El DTO y
la interfaz ya reflejan `PipelineRecommendation | null`; el servicio puede
seguir devolviendo una recomendación concreta cuando existe información.

No se declara cobertura SQL real: las pruebas de esta fase usan mocks tipados de
TypeORM y de los puertos. La infraestructura de integración CRM disponible no
provisiona dos tenants PostgreSQL ni credenciales de prueba para este flujo; por
eso la prueba de aislamiento queda en boundary test explícito sobre
`TenantContext`/`runInTenantSchema`, no se inventa una conexión real. La
validación E2E queda fuera de esta tarea y corresponde a AI-SR-QA.
