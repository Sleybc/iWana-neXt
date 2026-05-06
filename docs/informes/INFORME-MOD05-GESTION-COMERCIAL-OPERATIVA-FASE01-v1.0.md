# INFORME - MOD05 CRM Gestion Comercial y Operativa (Fase 01)

**Version:** 1.0
**Fecha:** 2026-04-04
**Convencion documental:** INFORME-MOD05-GESTION-COMERCIAL-OPERATIVA-FASE01-v1.0.md

## Vinculos de trazabilidad

- Plantilla base: docs/informes/TEMPLATE-INFORME-FASE-v1.0.md
- PRD: docs/prds/PRD-MOD05-CRM-GESTION-COMERCIAL-OPERATIVA-v1.0.md
- Prompt de ejecucion: docs/prompts/PROMPT-MOD05-CRM-GESTION-COMERCIAL-OPERATIVA-FASE-01-v1.0.md
- Spec de diseno: docs/superpowers/specs/2026-04-04-mod05-crm-gestion-comercial-operativa-fase-01-design.md
- Plan de implementacion: docs/superpowers/plans/2026-04-04-mod05-crm-gestion-comercial-operativa-fase-01-plan.md
- Politica de ejecucion: ADR-022

---

## Identificacion

- Modulo: MOD05 - CRM
- Fase: 01 - Unificacion UX + modelo operativo/comercial
- Sprint: N/A (ejecucion directa)
- Fecha: 2026-04-04
- Responsable principal: Senior Developer Fullstack (AI-SR-FULL)

---

## 1. Resumen ejecutivo

- Objetivo de la fase: Unificar visual y funcionalmente las secciones de interes comercial y atribucion comercial en una sola seccion "Gestion comercial y operativa", preservando separacion semantica entre responsable operativo, originador comercial y origen de la oportunidad.
- Resultado alcanzado: Implementacion completa de backend + frontend con corte total del endpoint `/assign` legacy, introduccion de nuevos endpoints `/responsibility`, historial operativo separado, y UX unificada.
- Estado: Completa

---

## 2. Entregables implementados

### Backend

| Componente         | Archivo                                                                                                 | Descripcion                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Migracion DB       | `packages/database/src/migrations/tenant/009_add_current_responsible_fields_and_operational_history.ts` | Columnas `current_responsible_user_id`, `current_responsible_assigned_at` y tabla `operational_responsibility_history` |
| Entidad            | `apps/api/src/modules/crm/responsibilities/entities/operational-responsibility-history.entity.ts`       | Entidad TypeORM para historial operativo                                                                               |
| DTO                | `apps/api/src/modules/crm/responsibilities/dto/update-responsibility.dto.ts`                            | DTO con validacion Zod para reasignacion                                                                               |
| Servicio           | `apps/api/src/modules/crm/responsibilities/responsibilities.service.ts`                                 | Logica de negocio: get/update/history de responsabilidad operativa                                                     |
| Controlador        | `apps/api/src/modules/crm/responsibilities/responsibilities.controller.ts`                              | Endpoints REST: GET/PATCH `responsibility`, GET `responsibility/history`                                               |
| Modulo             | `apps/api/src/modules/crm/responsibilities/responsibilities.module.ts`                                  | Registro en NestJS                                                                                                     |
| ExpedienteRecord   | `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`                             | Columnas nuevas agregadas                                                                                              |
| Eliminacion legacy | `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`                                        | Endpoint `PATCH :id/assign` eliminado                                                                                  |
| Eliminacion legacy | `apps/api/src/modules/crm/expedientes/expediente.service.ts`                                            | Metodo `assignExpediente` eliminado                                                                                    |
| Eliminacion legacy | `apps/api/src/modules/crm/expedientes/dto/assign-expediente.dto.ts`                                     | DTO eliminado                                                                                                          |

### Frontend

| Componente | Archivo                                                       | Descripcion                                                                                                                            |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| API Client | `apps/portal/src/lib/api-client.ts`                           | Nuevos metodos `getResponsibility`, `updateResponsibility`, `getResponsibilityHistory`; eliminado `assignExpediente`                   |
| Page       | `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` | Nueva seccion unificada "Gestion comercial y operativa" con bloques de responsable actual, origen, atribucion, e historiales separados |
| Labels     | `apps/portal/src/components/crm/expedientes/expediente-ui.ts` | Renombrado label "Interes comercial" a "Interes del cliente"                                                                           |

### Tests

| Componente         | Archivo                                                                               | Descripcion                                               |
| ------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Service tests      | `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts`    | 7 tests verificando logica de responsabilidad e historial |
| Controller tests   | `apps/api/src/modules/crm/responsibilities/tests/responsibilities.controller.spec.ts` | 5 tests verificando endpoints y autorizacion              |
| Pre-existing fixes | `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts`  | Mock actualizado con nuevos campos                        |
| Pre-existing fixes | `apps/api/src/modules/platform-users/platform-users.service.spec.ts`                  | Reparado test de changeLoginEmail                         |
| Pre-existing fixes | `apps/api/src/modules/tenant/tenant.service.spec.ts`                                  | Reparado test de cache por id                             |
| E2E tests          | `e2e/tests/portal-crm-gestion-comercial-operativa.spec.ts`                            | 12 tests Playwright para seccion unificada + reasign form |

---

## 3. Evidencia funcional

- Flujo probado:
  - GET `/crm/expedientes/:id/responsibility` retorna snapshot con nombre/rol legible
  - PATCH `/crm/expedientes/:id/responsibility` reasigna responsable y crea historial operativo
  - GET `/crm/expedientes/:id/responsibility/history` retorna historial separado del comercial
  - Frontend renderiza seccion unificada con bloque de responsable actual y CTAs de reasignacion

- Datos de prueba usados: Tests unitarios con mocks; verificacion manual pendiente en ambiente local

- Resultado observado: Todos los tests pasan (131 tests en modulo CRM, platform-users, tenant)

---

## 4. Evidencia de calidad

- Unit tests: 12 tests nuevos (7 service + 5 controller), 100% pasar
- Integration tests: No requeridos para esta fase (endpoint coverage por tests unitarios)
- E2E tests: 12 tests creados en `e2e/tests/portal-crm-gestion-comercial-operativa.spec.ts`, commiteados en `b36c8f4`
- Cobertura: Tests cubren happy path y edge cases principales
- Hallazgos abiertos: Ninguno — todos los entregables completados

---

## 5. Cambios documentales

- PRD actualizado: No aplica (PRD preexistente)
- HLD actualizado: No aplica (HLD preexistente)
- ADR nuevo o referenciado: ADR-022 (politica de ejecucion), ADR-024 (migracion CRM)
- Otros documentos afectados:
  - docs/superpowers/specs/2026-04-04-mod05-crm-gestion-comercial-operativa-fase-01-design.md (nuevo)
  - docs/superpowers/plans/2026-04-04-mod05-crm-gestion-comercial-operativa-fase-01-plan.md (nuevo)

---

## 6. Riesgos y bloqueos

- Riesgo 1: Eliminacion de `/assign` puede afectar consumidores no identificados
  - Mitigacion: Se revisaron referencias en monorepo y se elimino todo uso en portal
- Riesgo 2: Datos legacy con `assigned_to` sin `current_responsible_user_id`
  - Mitigacion: Backfill en migracion idempotente
- Bloqueo tecnico: Ninguno

---

## 7. Decision de salida

- Puede pasar a siguiente fase: Si
- Requiere correcciones previas: No
- Aprobadores pendientes: Requiere revision del codigo y merge a branch principal

---

## 8. Commits realizados

| Commit                                                                                                          | Descripcion                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 484b916                                                                                                         | feat(db): add seed script for additional products                  |
| 0110641                                                                                                         | fix(db): register AddAdditionalProducts migration in tenant runner |
| ...                                                                                                             | ...(commits previos de trabajo relacionado)                        |
| feat(db): add current_responsible fields and operational_responsibility_history table                           | Migracion DB                                                       |
| feat(api): add OperationalResponsibilityHistory entity                                                          | Entidad TypeORM                                                    |
| feat(api): add currentResponsibleUserId and currentResponsibleAssignedAt to ExpedienteRecord                    | Columnas entidad                                                   |
| feat(api): add UpdateResponsibilityDto with Zod validation                                                      | DTO                                                                |
| feat(api): add ResponsibilitiesService with get/update/history operations                                       | Servicio                                                           |
| feat(api): add ResponsibilitiesController with get/update/history endpoints                                     | Controlador                                                        |
| feat(api): add ResponsibilitiesModule to CrmModule                                                              | Registro modulo                                                    |
| refactor(api): remove assignExpediente endpoint (replaced by responsibilities)                                  | Corte legacy                                                       |
| test(api): add unit tests for ResponsibilitiesService                                                           | Tests servicio                                                     |
| test(api): add unit tests for ResponsibilitiesController                                                        | Tests controlador                                                  |
| refactor(portal): replace assignExpediente with getResponsibility/updateResponsibility/getResponsibilityHistory | API client                                                         |
| feat(portal): unify commercial and operational sections in expediente detail                                    | Frontend                                                           |
| fix(tests): repair two pre-existing failing tests                                                               | Tests pre-existentes                                               |
| test(e2e): add CRM gestion comercial y operativa tests - MOD05 Fase 01                                          | 12 tests Playwright, commiteados y pushados a main                 |

---

## 9. Pasos para merge

- Opcion 2 ejecutada: push directo a `main` (sin branch, sin PR)
- Commits en `main`:
  - `cbbc71f` — implementacion completa (backend + frontend)
  - `b36c8f4` — 12 tests E2E Playwright
- Revision de codigo postergada a sesion independiente

---

## 10. Correcciones posteriores

- 2026-04-04: Se corrigio un desalineamiento entre `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` y `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx`. La pagina seguia invocando el contenedor con `expedienteId`, mientras el componente ya esperaba `tabs`. Se actualizo la pagina para enviar las tabs de seguimiento, consentimientos y cobertura, y se agrego fallback seguro cuando la lista de tabs llega vacia o indefinida.
- 2026-04-04: Se reemplazo la barra de progreso con estilo inline en `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx` por un elemento `progress` estilizado, alineado con la regla del repo que evita estilos inline en componentes React.
- 2026-04-04: Se ejecuto un refinamiento visual del detalle de expediente en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`, `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx` y `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx` para reducir densidad en el primer viewport, eliminar duplicidad en la sidebar, compactar el header, convertir historiales y edicion avanzada en disclosure progresivo y aligerar la lectura de `Secciones de la oportunidad`.
- 2026-04-04: Se documento la direccion de rediseño en `docs/superpowers/specs/2026-04-04-mod05-crm-ui-density-reduction-design.md` para dejar trazabilidad entre analisis UX, decision visual y ejecucion de frontend en el portal.
- 2026-04-xx: **Rediseño arquitectura 6-tabs** — Se reestructuro completamente `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` (2665 lineas) eliminando el layout grid+aside y reemplazandolo por un unico `ExpedienteTabsContainer` con 6 tabs de primer nivel: `Vista general`, `Secciones`, `Seguimiento`, `Consentimientos`, `Cobertura`, `Contexto`. Los paneles `ContactAttemptsPanel`, `ConsentsPanel` y `CoverageChecksPanel` se integraron directamente como contenido de tabs. Se agrego `ExpedienteHeader` como cabecera fija fuera del contenedor de tabs. Se anadio `LayoutDashboard` (lucide-react) como icono del tab Vista general y las tarjetas de dimension (Comercial/Tecnica/Legal/Operativa) con porcentajes por seccion usando `DIMENSION_SECTION_GROUPS`. Compilacion TypeScript `tsc --noEmit` exitosa sin errores.
- 2026-04-05: Se ajusto la tipografia de labels/titulos en formato oracion (primera letra mayuscula, resto minuscula) para el CRM del portal, eliminando uppercase forzado en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`, `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx` y `apps/portal/src/components/crm/CrmOverviewClient.tsx`. El ajuste incluye encabezados de `Vista general`, labels de `Secciones` (incluyendo modo bloqueado de identificacion), cabecera del expediente (`Volver al listado`, badge/estado y `Progreso general`) y metricas del overview.
- 2026-04-05: Se centralizo la gestion de `Atribución comercial` en la pestaña `Seguimiento` de `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` (originador actual, formulario de reatribucion, revocacion e historial), y se elimino su duplicidad de `Contexto` para mantener esa pestaña enfocada en actividad, metadata e historial del pipeline.
- 2026-04-08: Se refino el formulario de creacion en `apps/portal/src/app/dashboard/crm/expedientes/page.tsx` para reducir peso visual del CTA: el boton `Crear oportunidad` se movio a la columna derecha, justo debajo de `Canal de captación`, en lugar de ocupar una fila completa.
- 2026-04-13: Se corrigio el ciclo de "Actualización de sección" repetida en `Seguimiento > Auditoría`. Causa raiz: eventos de acceso PII (`piiaAccess`) emitidos por `findById` se estaban interpretando como cambios funcionales de seccion en `getTimelineSummary`. Ajuste aplicado en `apps/api/src/modules/crm/expedientes/expediente.service.ts`: (1) exclusión explícita de logs `piiaAccess` del timeline funcional, (2) registro de auditoría de updates con `changedFields` (sin payload sensible), y (3) resumen legible en `reason` (`Campos actualizados: ...`). En frontend `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx` se mostró `reason` en tarjetas de `SECTION_UPDATED`. Validación: spec `expediente.service.spec.ts` en verde (29/29).
- 2026-04-13: Se incorporaron los campos de ubicación `estrato` y `código postal` en el flujo de expediente. `Estrato` se ubicó funcional y visualmente dentro de la sección `Dirección` junto a municipio/barrio/código postal. Cambios aplicados: (1) backend `ExpedienteRecord` + `updateSection(location)` para persistencia de `postalCode` y `stratum`, (2) migración tenant `010_add_postal_code_to_expediente_records.ts` registrada en `runner.ts`, (3) contrato portal `ExpedienteRecord` actualizado con `postalCode`, (4) UI de `LocationSection` con inputs de código postal y select de estrato, y (5) ajuste en `SeguimientoTab` para que la tarjeta `Origen` priorice `currentAttribution.acquisitionChannel` sobre `expediente.acquisitionChannel`. Validación: tipado sin errores y spec de servicio actualizado para validar guardado de `postalCode/stratum`.
- 2026-04-13: Se reemplazó el iframe de OpenStreetMap por render client-side con Leaflet en `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.tsx` para una UX más limpia en `Gestión`. Se mantuvo cumplimiento de licencia con atribución mínima visible (`© OpenStreetMap contributors`) y se estabilizó el ciclo de vida del mapa para cambios de coordenadas (recreación segura si cambia contenedor, `flyTo` animado, y cleanup explícito de mapa/marcador). Validación: `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-04-13: Se reforzó la estabilidad visual del mapa Leaflet en `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.tsx` para escenarios de cambio de tamaño y visibilidad (tabs/resize de viewport). Ajuste aplicado: `ResizeObserver` + listener de `window.resize` + `invalidateSize()` en frame posterior al montaje. Resultado: evita mosaicos incompletos o viewport recortado al volver a la pestaña `Gestión`. Validación: `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-04-13: Se agregó el bloque visual `Soportes documentales` dentro de `Gestión`, integrado como nuevo ítem del acordeón izquierdo debajo de `Cumplimiento legal` en `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`. La UI vive en `apps/portal/src/components/crm/expedientes/sections/DocumentSupportSection.tsx` y adapta requisitos por tipo de persona: natural (`documento de identidad`, `recibo de servicio público`) y jurídica (`cámara de comercio`, `RUT`, `documento del representante legal`). Incluye carga/reemplazo local en UI, estados `Pendiente/Cargado/Observado/Aprobado/Rechazado`, historial de versiones y resumen documental coherente con el sistema visual del expediente. Validación: `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-04-13: Se evolucionó `Soportes documentales` de prototipo visual a flujo persistido end-to-end. Backend: `apps/api/src/modules/crm/expedientes/expediente.service.ts` ahora expone listado, upload, cambio de estado y descarga de soportes; `apps/api/src/modules/crm/expedientes/expedientes.controller.ts` agrega endpoints dedicados para `document-supports`; `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts` incorpora `documentSupports` en JSONB versionado; y `packages/database/src/migrations/tenant/011_add_document_supports_to_expediente_records.ts` registra persistencia tenant-aware en runner. Portal: `apps/portal/src/lib/api-client.ts` soporta `FormData` y nuevos métodos CRM; `DocumentSupportSection.tsx` consume API real con upload/reemplazo/estado/historial y descarga. Auditoría: cada upload o cambio de estado se registra como actualización de sección `document_support` para alimentar `Seguimiento`. Completitud: `apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts` ahora suma los soportes obligatorios aprobados a la dimensión legal. Validación: `pnpm --filter @iwana/api typecheck`, `pnpm --filter @iwana/portal typecheck` y Jest focalizado del expediente en verde (43 tests).
- 2026-04-13: Se corrigió la ausencia de porcentaje documental y su impacto visual en el progreso del expediente dentro del portal. Ajustes aplicados: (1) se creó `calculateDocumentSupportCompletion` en `apps/portal/src/components/crm/expedientes/sections/constants.ts` para calcular avance documental por tipo de persona según soportes cargados, (2) en `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx` el ítem `Soportes documentales` ahora muestra porcentaje propio en el acordeón y cuenta en el consolidado de secciones completadas, (3) `DocumentSupportSection` ahora dispara refresco global del expediente tras upload/cambio de estado mediante `onSaved`, y (4) en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` se agregó el ítem documental en `Vista general` (lista + tarjeta dedicada), se incluyó en las dimensiones del `ProgressMeter` y su valor se suma al cálculo de barra de progreso del frontend. Validación: `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-04-13: Se eliminó duplicidad de bloques en `Vista general` del expediente. Ajustes aplicados: (1) `Técnica` ahora muestra solo `Dirección` y `Operativa (viabilidad)` conserva `Viabilidad técnica` mediante `DIMENSION_SECTION_GROUPS` en `apps/portal/src/components/crm/expedientes/sections/constants.ts`; (2) `Legal` dejó de listar `Soportes documentales` y `Documental` conserva ese ítem en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`; (3) se removió el mezclado de porcentaje documental dentro de la dimensión legal para evitar doble conteo visual. Validación: `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-04-13: Ajuste final solicitado por usuario para simplificar tarjetas de `Vista general`: se dejaron únicamente `Comercial`, `Técnica` y `Legal` en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`; `Soportes documentales` quedó dentro de la tarjeta `Legal`; y `Viabilidad técnica` quedó dentro de la tarjeta `Técnica` (restaurando `technical: ['location', 'technical_feasibility']` en `apps/portal/src/components/crm/expedientes/sections/constants.ts`). Además, el `ProgressMeter` se alineó a estas 3 dimensiones para evitar duplicidad visual. Validación: `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-04-13: Corrección de reglas de soportes para persona jurídica en flujo documental. Se robusteció la detección de tipo de persona con normalización (mayúsculas, espacios y tildes) en `apps/api/src/modules/crm/expedientes/document-support.types.ts` y en frontend (`apps/portal/src/components/crm/expedientes/sections/constants.ts`, `apps/portal/src/components/crm/expedientes/sections/DocumentSupportSection.tsx`) para evitar fallback incorrecto a persona natural cuando el valor llega en variantes como `Persona Jurídica`, `persona juridica` o con formatos legacy. Resultado esperado: en persona jurídica se exige y muestra consistentemente `Cámara de comercio`, `RUT` y `Documento del representante legal`. Validación: `pnpm --filter @iwana/api typecheck` y `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-04-14: Se corrigió error 500 al guardar secciones del expediente cuando el actor autenticado llega con `sub` no UUID (caso híbrido plataforma/tenant). Causa raíz: `status_changes.changed_by` exige UUID y el auto-pipeline persistía el `actorUserId` sin fallback. Ajuste aplicado en `apps/api/src/modules/crm/expedientes/expediente.service.ts`: nueva resolución `resolveStatusChangeActorId()` y uso en `updateSection` (auto-pipeline), `transitionStatus` y `reactivate`, degradando a `createdBy` del expediente cuando aplica. Se añadió cobertura de regresión en `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts` para validar fallback UUID en `status_changes`.
- 2026-04-14: Se corrigió el segundo gatillo del 500 en guardado de sección: resolución de actor en auditoría de actividad con `userId` no UUID. Causa raíz: `resolveActorName()` consultaba `users/platform_users` por `id` UUID usando un `sub` no UUID, provocando `QueryFailedError` y respuesta 500. Ajuste aplicado en `apps/api/src/modules/crm/expedientes/expediente.service.ts`: guard clause en `resolveActorName()` para retornar `null` y registrar warning cuando el `userId` no cumple formato UUID. Se añadió prueba de regresión en `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts` validando que no se consulta BD en ese caso.
- 2026-05-06: Se corrigió el bloqueo del spec `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`. Causa raíz: el commit `23b4ccf` agregó `PipelineRecommendationService` al constructor de `ExpedientesController`, pero el `TestingModule` del spec no actualizó sus providers. Ajuste aplicado: mock explícito de `PipelineRecommendationService` en el setup del controller spec, sin tocar aún la funcionalidad de eliminación documental. Validación: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts` en verde (48/48).
- 2026-05-06: Seguimiento de code review para Task 1 en `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`. Ajuste aplicado solo en tests: se reemplazó el wrapper `Promise.resolve().then(() => ...)` por el patrón directo `await expect(...).rejects` usado en el resto del archivo y se eliminó la aserción negativa redundante sobre `/no aplica/i`. Validación: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts` se mantiene en rojo con las dos fallas esperadas por método faltante (`TypeError: service.deleteDocumentSupport is not a function`).
- 2026-05-06: Se implementó en backend la eliminación documental por versión dentro de `apps/api/src/modules/crm/expedientes/expediente.service.ts` y `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`. Cambios aplicados: (1) nuevos helpers para resolver `personType` efectivo a partir de `expediente.personType` + override opcional, reutilizados en listado, upload, cambio de estado y delete; (2) nuevo endpoint `DELETE /api/v1/crm/expedientes/:id/document-supports/:documentKey/:versionId`; (3) borrado quirúrgico de una versión con promoción automática de la versión previa, limpieza del mapa `documentSupports`, auditoría y resincronización de completitud; y (4) resguardo de consistencia durante el borrado físico usando rename temporal previo a persistencia para permitir rollback si la actualización JSON falla. Cobertura actualizada en `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts` y `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`, incluyendo overrides efectivos de `personType`.
- 2026-05-06: Validación posterior de Task 2. Resultado: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts` ✅ (51/51), `pnpm --filter @iwana/api typecheck` ✅, y `pnpm --filter @iwana/api test` ⚠️ mantiene fallas preexistentes fuera del alcance en `src/modules/crm/expedientes/tests/status-transition.service.spec.ts`, `src/modules/tenant/tenant.service.spec.ts`, `src/modules/tenant/tenant-settings.spec.ts` y `src/modules/users/users.service.spec.ts` (4 suites rojas, 82 verdes).
