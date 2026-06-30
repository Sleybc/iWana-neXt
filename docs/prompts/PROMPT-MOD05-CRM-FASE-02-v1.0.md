# PROMPT - MOD05 CRM Fase 02 (Expediente Unico Progresivo)

**Version:** 1.1  
**Estado:** Aprobado con cierre extendido  
**Fecha:** 2026-03-26  
**Modo activo:** Mixto

## Vinculos de trazabilidad

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- PRD del modulo: docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md
- Addendum de cierre: docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md
- HLD del modulo: docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
- ADR relacionado: docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md
- Sprint plan: docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md
- Spec expediente: docs/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md
- Spec rediseno: docs/specs/SPEC-MOD05-REDISENO-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD05-DEFINICION-v1.0.md
- Prompt anterior: _(eliminado — Sprint 01 deprecado, ver ADR-024)_
- Dependencia upstream: docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md (MOD03 provee ICoverageReadPort, IPlanCatalogReadPort)

## Modulo

MOD05 — CRM / Expediente Unico Progresivo

## Rol del ejecutor

Sr. Dev Fullstack — implementa el rediseno completo de CRM con expediente unico en backend (NestJS) y portal empresarial (Next.js App Router).

## Contexto

Sprint 01 implemento el modelo dual PotentialLead/ProspectCase. Sprint 02 reemplaza ese modelo con Expediente Unico Progresivo: un registro maestro (`ExpedienteRecord`) con 8 secciones de captura progresiva, 12 estados de pipeline, 4 dimensiones de completitud, consentimiento triple Ley 1581 y 4 entidades hijas de trazabilidad.

La migracion es aditiva (ADR-024): no se eliminan tablas legacy; los nuevos expedientes se crean directamente en la nueva estructura. Esta version del prompt incorpora el cierre de los tres gaps criticados en auditoria sin mover el trabajo a un sprint documental distinto.

## Instrucciones

1. **Leer obligatoriamente antes de implementar:**
   - PRD-MOD05-CRM-DEFINICION-v2.0.md (alcance, requisitos, contratos API)
   - HLD-MOD05-ARQUITECTURA-v2.0.md (componentes, diagramas, puertos)
   - ADR-024 (migracion aditiva, strategy, consecuencias)
   - SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md (secciones, campos minimos, completitud)
   - PLAN-MOD05-CRM-SPRINT-02-v1.0.md (backlog extendido de 36 tareas)

2. **Backend — ExpedientesModule:**
   - Crear `ExpedienteRecord` entity (~60 columnas, 8 secciones, 3 indices).
   - Crear entidades hijas: ContactAttempt, ConsentRecord v2, CoverageCheck, StatusChange con FK y @JoinColumn explicito.
   - Crear migracion tenant con tablas e indices. Usar `ADD COLUMN IF NOT EXISTS` para idempotencia.
   - Implementar `ExpedienteService` con 7 metodos (create, findAll, findById, updateSection, transitionStatus, reactivate, getTimeline).
   - Implementar `StatusTransitionService` con reglas de campos minimos por transicion (ver SPEC tabla §3).
   - Implementar `CompletenessCalculator` con 4 dimensiones y degradacion segura (capturar 42P01/42703).
   - Cifrar 6 campos PII con AES-256-GCM. Formato: `{iv}:{authTag}:{ciphertext}`.
   - Usar `@CurrentUser().sub` como actor real para `createdBy`/`changedBy`.

3. **Controller — 8 endpoints REST:**
   - POST /crm/expedientes (CreateExpedienteSchema via ZodBodyValidationPipe)
   - GET /crm/expedientes (filtros: status, municipality, search, page, limit)
   - GET /crm/expedientes/:id (con completeness)
   - PATCH /crm/expedientes/:id/sections/:section
   - PATCH /crm/expedientes/:id/status (TransitionStatusSchema)
   - POST /crm/expedientes/:id/reactivate
   - GET /crm/expedientes/:id/timeline
   - GET /crm/pipeline/summary
   - Guards: JwtAuthGuard + RolesGuard con @Roles(ADMIN, SALES, SUPPORT, SYSTEM_ADMIN).
   - Solo ADMIN, SALES, SYSTEM_ADMIN para transiciones y reactivacion.

4. **Validacion Zod:**
   - Crear `ZodBodyValidationPipe` generico que lance `BadRequestException` con `{ code: 'VALIDATION_ERROR', details }`.
   - Schemas: CreateExpedienteSchema, UpdateSectionBodySchema, TransitionStatusSchema.

5. **Puertos de integracion:**
   - 9 puertos con interfaces tipadas en `ports/`.
   - Adaptadores reales para CoverageReadPort y ExecutionPolicyReadPort (conectan con TenantModule).
   - Stubs para los 7 restantes (billing, provisioning, inventory, tickets, workorders, expansion, plan catalog).

6. **Portal empresarial (apps/portal):**
   - CrmOverviewClient: metricas pipeline + resumen por estado + recientes.
   - Listado expedientes: creacion inline (fullName + source), filtros (status, search), tabla con badges y completitud.
   - Detalle expediente: resumen 3-col, 8 secciones accordion editables, guardar por seccion, transicion estado, reactivar, panel lateral con timeline.
   - expediente-ui.ts: EXPEDIENTE_STATUS_META con 12 labels + variants, formatters es-CO.
   - crmApi en api-client.ts: 8 metodos con tipos TypeScript.
   - Retirar componentes legacy del portal (PotentialForm, ProspectBoard, etc.).

7. **Tests:**
   - Tests unitarios del controller de expedientes.
   - Tests de StatusTransitionService.
   - Tests de CompletenessCalculator (incluir degradacion).
   - Sin PII real en ningun test.

8. **Remediaciones (aplicar durante desarrollo):**
   - @Allow() en DTOs para convivir con ValidationPipe global.
   - @JoinColumn({ name: 'expediente_id' }) explicito.
   - Validacion local en portal pre-POST.
   - ApiError con detalles Zod en frontend.

9. **Cierre obligatorio de gaps criticos dentro de Sprint 02:**
   - Crear enums compartidos `ContactChannel`, `ContactResult` y `EvidenceMode` en `packages/shared/src/enums/crm/` y reexportarlos.
   - Implementar `ContactAttemptService` + endpoints `POST /crm/expedientes/:id/contact-attempts` y `GET /crm/expedientes/:id/contact-attempts`.
   - Implementar `ConsentRecordService` + endpoints `POST /crm/expedientes/:id/consents`, `GET /crm/expedientes/:id/consents` y `PATCH /crm/expedientes/:id/consents/:consentId/revoke`.
   - Implementar `CoverageCheckService` + endpoints `POST /crm/expedientes/:id/coverage-checks` y `GET /crm/expedientes/:id/coverage-checks`.
   - Agregar `assignedTo`, `actorName` y `dataConsentRevoked` al agregado expediente/timeline.
   - Ocultar PII en listados y restringir `ipAddress` de consentimientos por rol.
   - Agregar en portal tabs o paneles para intentos de contacto, consentimientos y cobertura dentro del detalle del expediente.
   - Retirar el backend legacy (`PotentialsModule`, `ProspectsModule`, `ReviewsModule`) solo despues de que los nuevos flujos queden cubiertos por pruebas.
   - Expandir pruebas unitarias, de boundary y E2E para cubrir create/list/revoke/sanitizacion/PII.

## Criterios de aceptacion

| CA | Descripcion |
| --- | --- |
| CA-01 | Crear expediente rapido con fullName + source; estado NUEVO_POTENCIAL |
| CA-02 | 8 secciones editables independientemente; completitud recalculada tras cada mutacion |
| CA-03 | Transiciones validan campos minimos; BadRequestException con codigo semantico |
| CA-04 | Consentimiento triple registrado por tipo (DATA_TREATMENT, COMMERCIAL/OPERATIONAL_CONTACT) |
| CA-05 | Timeline separado: changes, activities, metadata con actor real |
| CA-06 | Pipeline summary con conteo por estado |
| CA-07 | PII cifrada AES-256-GCM en 6 campos |
| CA-08 | Descarte con motivo y reactivacion restauran previousStatus |
| CA-09 | CompletenessCalculator degrada sin crash (42P01/42703) |
| CA-10 | Portal: overview, listado con filtros, detalle accordion, timeline |
| CA-11 | Componentes legacy retirados del portal |
| CA-12 | Tests unitarios del controller implementados |
| CA-13 | ContactAttempt operativo con alta y listado por expediente |
| CA-14 | Consentimiento triple con alta, listado y revocacion auditada |
| CA-15 | CoverageCheck operativo con historial por expediente |
| CA-16 | PII oculta en listados y visible solo en detalle autorizado |
| CA-17 | Timeline enriquecido con actorName y asignacion de expediente |
| CA-18 | Tabs portal para contacto, consentimiento y cobertura funcionales |
| CA-19 | Tests y E2E cubren los tres gaps sin regresiones |

## Stop / Go

- **Stop si:** falta PRD, HLD, ADR-024 o SPEC; excepcion de seguridad; violacion de boundary con MOD03.
- **Go si:** todos los artefactos leidos, backlog entendido y sin bloqueos de arquitectura, y el cierre de gaps queda dentro del mismo Sprint 02.

---

*Prompt actualizado por AI-EM-ARCH para cerrar los gaps de Sprint 02 sin abrir un prompt paralelo de ejecucion.*
