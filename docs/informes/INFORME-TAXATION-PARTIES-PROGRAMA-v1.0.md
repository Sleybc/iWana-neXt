# Informe vivo — Programa Taxation (MOD07) + Parties (MOD08) + Rediseño tributario MOD06

<!-- markdownlint-configure-file {"MD024": false, "MD032": false, "MD040": false, "MD060": false} -->

**Version:** 1.0
**Estado:** Cerrado ✅ — F0-F6 completadas
**Fecha de apertura:** 2026-04-21
**Última actualización:** 2026-05-19 (Cierre documental PRD sistema v2.4 + normalización markdown)
**Owner técnico:** Sr. Dev Fullstack
**Gobierno:** Engineering Manager (AI-EM-ARCH)
**PRD:** `docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md`
**Prompt de ejecución:** `docs/prompts/PROMPT-TAXATION-PARTIES-COMMERCIAL-FASE-01-v1.0.md`

---

## Estado por fase

| Fase | Alcance | Estado |
|---|---|---|
| F0 | Gobernanza: ADRs, HLDs, PRD, spec, prompt | ✅ Cerrada 2026-04-21 |
| F1 | Scaffold MOD07 Taxation + seeder presets Colombia | ✅ Completada 2026-04-21 |
| F2 | Scaffold MOD08 Parties (tablas + `users.party_id`) + Gap F1 closure | ✅ Completada 2026-04-21 — gaps D1/D2/D3 cerrados |
| F3 | Commercial consume Taxation vía puerto + `tax_rule_applications` + simulador | ✅ Completada 2026-04-22 |
| F4 | Portal: `TaxCatalogManager` + `TaxApplicationRulesManager` + `TaxSimulatorPanel` | ✅ Completada 2026-04-22 |
| F5 | Backfill Subscribers/Users → Parties | ✅ Completada 2026-04-22 |
| F6 | Deprecación legacy + cierre de deuda técnica | ✅ Completada 2026-04-21 |

---

## Corrección post-cierre (2026-04-21)

- **Portal Comercial — navegación tributaria refinada:** `Reglas de aplicación` y `Simulador tributario` pasan a ser subtabs internas dentro de `Catálogo de impuestos` (ya no tabs de primer nivel).
- **Incidente operativo corregido (500 en `/taxation/definitions?isActive=true`):** se ejecutó saneamiento de base local con `pnpm db:migrate:all`, aplicando migraciones tenant pendientes en `tenant_test_company` y `tenant_iwana`.
- **Causa raíz técnica del 500 y corrección de código:**
  - `TaxationModule` no registraba `TaxDefinition` en TypeORM (`EntityMetadataNotFoundError`).
  - `TaxDefinitionService.findAll()` usaba columnas camelCase en SQL string (`deletedAt`, `isActive`) en lugar de nombres físicos (`deleted_at`, `is_active`).
  - Se corrigió el wiring del módulo y la consulta SQL; además se ajustaron tests unitarios del servicio.
- **Validación en vivo posterior al fix:** login automático exitoso de usuario ADMIN tenant-aware y `GET /api/v1/taxation/definitions?isActive=true` respondió `200` tanto por API (`:3000`) como por portal (`:3002`).
- **Validación técnica:**
  - Portal tests: `2/2 suites`, `8/8 tests` ✅
  - Portal typecheck: ✅
  - API tests tributarios/commercial: `3/3 suites`, `41/41 tests` ✅

### Fix adicional (2026-04-21) — 400 en "Nueva definición tributaria"

- **Síntoma reportado:** `POST /api/v1/taxation/definitions` respondía `400` al crear desde portal cuando el código venía en minúsculas (ej. `iva_test_400`).
- **Causa raíz:** validación Zod de `CreateTaxDefinitionSchema` exigía regex en mayúsculas **antes** de la normalización a uppercase en servicio.
- **Corrección backend:** `TaxDefinitionService.create()` ahora normaliza (`trim + uppercase`) antes de `safeParse`, manteniendo la regla de formato sin penalizar entradas válidas en minúscula.
- **Corrección frontend portal:** `TaxCatalogManager` normaliza el código en tiempo real, resetea el formulario al abrir "Nueva definición" y envía payload completo con defaults requeridos (`category`, `jurisdictionLevel`, `treatment`, `context`).
- **Alineación de contrato:** `CreateTaxDefinitionDto` en `apps/portal/src/lib/api-client.ts` actualiza esos campos como obligatorios para reflejar el contrato real del backend.
- **Evidencia de validación en vivo:** creación exitosa con `code` de entrada en minúsculas (`iva_fix_1776811664`) persistida como `IVA_FIX_1776811664`.

### Fix adicional 2 — 400 persistente por mismatch de enums (portal vs backend)

- **Síntoma:** `POST /api/v1/taxation/definitions` seguía respondiendo `400` al seleccionar ciertas opciones del formulario incluso después del fix de normalización.
- **Causa raíz:** Los tipos y opciones de select en el portal usaban valores de enum incorrectos vs los enums reales del paquete `@iwana/shared`:
  - `category: 'RETENTION'` → backend exige `'WITHHOLDING'`
  - `jurisdictionLevel: 'DEPARTMENTAL'` → backend exige `'DEPARTMENT'`
  - `context: 'RESIDENTIAL' | 'COMMERCIAL'` → backend exige `'SALES' | 'PURCHASE'`
- **Archivos corregidos:**
  - `apps/portal/src/lib/api-client.ts` — interfaces `TaxDefinition`, `CreateTaxDefinitionDto` y `UpdateTaxDefinitionDto` alineadas con enums reales.
  - `apps/portal/src/components/commercial/TaxCatalogManager.tsx` — `TaxDefFormState`, `CATEGORY_LABELS`, `JURISDICTION_LABELS`, `CONTEXT_LABELS` y opciones de ambos diálogos (crear y editar) actualizadas.
- **Evidencia de validación:**
  - `context=SALES` → 201 ✅ | `context=PURCHASE` → 201 ✅
  - `jurisdictionLevel=DEPARTMENT` → 201 ✅ | `category=WITHHOLDING` → 201 ✅
  - `context=RESIDENTIAL` → 400 (rechazado correctamente) ✅
  - `jurisdictionLevel=DEPARTMENTAL` → 400 (rechazado correctamente) ✅
  - Portal typecheck: ✅

### Addendum arquitectónico (2026-04-22) — MVP tributos por cliente

- **Decisión arquitectónica:** para el MVP se simplifica la experiencia visible. El sistema deja en segundo plano las reglas tributarias como objeto operativo para el usuario promedio.
- **Nuevo flujo visible:** catálogo maestro de tributos en `Taxation` → asignación de tributos por cliente → visualización del perfil tributario en Suscriptor 360.
- **Tratamiento de IVA:** el sistema puede sugerir tratamiento por estrato, pero la confirmación final queda en el área de facturación.
- **Tributos territoriales:** no se disparan por municipio de residencia de forma general. Se configuran para casos específicos, en especial entidades públicas colombianas, que son personas jurídicas con tributos propios.
- **Artefactos actualizados:**
  - `docs/superpowers/specs/2026-04-21-taxation-bounded-context-design.md` (addendum MVP)
  - `docs/superpowers/specs/2026-04-20-reglas-comerciales-design.md` (addendum MVP)
  - `docs/superpowers/specs/2026-04-22-taxation-mvp-tributos-por-cliente-design.md` (nuevo)
  - `docs/prompts/PROMPT-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md` (nuevo)
  - `docs/sprints/PLAN-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md` (nuevo)
- **Aprobación de gobierno:** CTO aprueba el spec MVP 2026-04-22 y habilita transición a ejecución.

**Estado de ejecución:** aún no implementado. Este addendum habilita la siguiente iteración operativa para Fullstack.

**Entregable adicional emitido:** sprint plan operativo para backend, frontend, DB, QA y documentación del MVP tributario por cliente.

---

---

## F0 — Gobernanza (cerrada 2026-04-21)

### Artefactos aprobados

- ADR-029 — Catálogo unificado de impuestos como Bounded Context propio (Taxation / MOD07). Aprobado por CTO el 2026-04-21.
- ADR-030 — Modelo Party multi-rol y separación de identidad de negocio vs cuenta autenticada (Parties / MOD08). Aprobado por CTO el 2026-04-21.
- ADR-031 — Rediseño tributario comercial: Impuestos + Reglas de aplicación + Simulador. Aprobado por CTO el 2026-04-21.
- HLD-MOD07-TAXATION-v1.0. Aprobado.
- HLD-MOD08-PARTIES-v1.0. Aprobado.
- HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum. Aprobado.
- HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum. Aprobado.
- PRD-ADDENDUM-TAXATION-PARTIES-v1.0. Aprobado.
- PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0. Aprobado.
- Spec 2026-04-21-taxation-bounded-context-design.md.
- Spec 2026-04-21-parties-multi-rol-design.md.
- Spec 2026-04-20-reglas-comerciales-design.md (con addendum 2026-04-21).

### Decisiones clave registradas

1. El catálogo de impuestos se aloja en bounded context propio `TaxationModule` (MOD07). Commercial deja de ser dueño.
2. La identidad de tercero de negocio se separa de la cuenta autenticada vía `PartiesModule` (MOD08) con `Party + PartyContact + PartyRole` y vínculo `UserAccount.partyId`.
3. La pestaña tributaria del portal cambia a `Impuestos + Reglas de aplicación + Simulador`. `TaxRulesManager` monolítico se retira.
4. Migración aditiva multi-fase, consistente con patrón ADR-024.
5. Feature flag `taxation.useCatalog` controla el corte.
6. Integraciones externas (DANE, DIAN, RUES) y deduplicación automática de Parties: fuera de v1.

### Pendientes trasladados al programa

- Confirmar política fina de cifrado de contactos PII en MOD08 (ADR operativo posterior si se requiere).
- Evaluar renombre físico de tabla `users` → `user_accounts` (ADR operativo posterior).
- Consolidar PRD v2.3 → v2.4 al cierre del programa. ✅ Completado 2026-05-19 (`docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md`).

### Cierre documental (2026-05-19)

- Se consolidó el PRD sistémico a versión de contenido 2.4, incorporando ADR-025 a ADR-039 y estado real de módulos/transversales.
- Se normalizó el documento para cumplir markdownlint (encabezados, fences con lenguaje, blockquotes, tablas conflictivas y URLs).
- El archivo objetivo quedó sin errores de markdownlint al cierre de esta actividad.

---

## F1 — Scaffold MOD07 Taxation

**Estado:** ✅ Completada 2026-04-21

**Criterios de aceptación:** CA-01, CA-02, CA-11, CA-12 del PRD.

### Entregables

| Item | Estado | Notas |
|---|---|---|
| TaxDefinition entity | ✅ | Columnas exactas HLD §4 |
| Migration 021_create_taxation_module | ✅ | Reversible, tenant schema |
| DTOs (Zod + class-validator) | ✅ | Create, Update, ListQuery |
| TaxDefinitionService | ✅ | Unicidad code, bloqueo SYSTEM |
| TaxCatalogReadPort + Adapter | ✅ | Abstract class, snapshot type |
| TaxPresetsSeeder | ✅ | 6 presets Colombia RF-TAX-02 |
| TaxationController | ✅ | 5 endpoints REST + OpenAPI |
| TaxationModule wiring | ✅ | Registrado en AppModule |
| Unit tests (service) | ✅ | 19 tests passed |
| HTTP integration tests (controller) | ✅ | 15 tests passed |

### Calidad

```
Lint:      ✅ PASSED (7/7 workspaces, 4.507s)
Typecheck: ✅ PASSED (7/7 workspaces, 5.233s)
Tests:     ✅ 34/34 PASSED (4.123s)
```

**Cobertura:**
- `taxation.controller.ts`: **100%** (100% stmts, 100% branches, 100% functions, 100% lines)
- `tax-definition.service.ts`: **95.89%** lines (89.02% stmts, 54.05% branches, 100% functions)
- Umbral requerido 80%: ✅ SUPERADO

### Commits F1

| Hash | Descripción |
|---|---|
| c4c24b3 | feat(db): migration 021 + enums |
| ca9bc64 | feat(taxation): TaxDefinition entity |
| f760eb2 | fix(taxation): entity corrections |
| 5f29866 | feat(taxation): DTOs (initial) |
| ce56f5c | fix(taxation): DTO critical fixes |
| 8d59074 | feat(taxation): ITaxCatalogReadPort + TaxCatalogReadAdapter |
| b50221e | fix(taxation): redesign TaxCatalogReadPort |
| 7795650 | feat(taxation): TaxDefinitionService |
| 44456f6 | feat(taxation): TaxPresetsSeeder |
| cb16336 | feat(taxation): TaxationController |
| 3de20f4 | feat(taxation): wire TaxationModule |
| 9993d8f | test(taxation): unit tests |
| 54beeb2 | test(taxation): HTTP integration tests |

### Decisiones técnicas

1. **Puerto de lectura (ADR-029 §D4):** `TaxCatalogReadPort` es clase abstracta `@Injectable()` que retorna `TaxDefinitionSnapshot` (plain object), nunca la entidad TypeORM. Adaptador usa `DataSource + runInTenantSchema()`.

2. **Multi-tenancy:** Todos los métodos usan `runInTenantSchema()`. Seeder recibe `schemaName` explícito (sin `TenantContext`) para invocación desde worker BullMQ.

3. **Presets SYSTEM:** `origin=SYSTEM` es inmutable — `ForbiddenException` en update/softDelete. 6 presets Colombia sembrados idempotentemente por tenant.

4. **baseRate string|null:** PostgreSQL NUMERIC retorna string en JS. Entidad usa `string|null`, DTOs usan `number|null`. TypeORM convierte al persistir.

### Gaps identificados (fuera scope F1)

1. **TaxPresetsSeeder → TenantProvisioningProcessor:** Seeder listo, wiring en worker fuera de F1 — incluir en F2 o tarea adicional.

2. **Partial @Index sin WHERE:** Índice `idx_tax_definitions_context_active` en entidad sin cláusula parcial. No bloqueante con `synchronize: false`.

3. **Commercial/tax-classification tests:** 2 tests fallando en `tax-classification.service.spec.ts` por uso de `qr.manager.count()` inexistente en EntityManager. Fuera de scope taxation.

**F1 TAXATION: COMPLETA Y APROBADA PARA INTEGRACIÓN.**

---

## F2 — Scaffold MOD08 Parties + Gap F1 Closure

**Estado:** ✅ Completada 2026-04-22

**Criterios de aceptación:** CA-04, CA-05, CA-11, CA-12.

### Gap F1 cerrado

| Item | Estado | Notas |
|---|---|---|
| `TAX_COLOMBIA_PRESETS` → `@iwana/shared` | ✅ | `packages/shared/src/taxation/` — 6 presets Colombia |
| `TaxPresetsSeeder` refactorizado | ✅ | Importa desde `@iwana/shared`, sin lógica duplicada |
| `TenantSeedService.seedTaxPresets()` | ✅ | SQL raw + `schemaName` explícito (compatible BullMQ sin AsyncLocalStorage) |
| `TenantProvisioningProcessor` wiring | ✅ | Llama `seedTaxPresets()` tras `runMigrationsForSchema()` por tenant |
| Worker tests | ✅ | 23/23 pasando |

### MOD08 Parties — Entregables

| Item | Estado | Notas |
|---|---|---|
| Enums `@iwana/shared` | ✅ | PartyType, DocumentTypeParty, PartyStatus, PartyRoleType, PartyRoleStatus, PartyContactType |
| Migración 022 `create_parties_module` | ✅ | 6 ENUMs PostgreSQL, tablas `party`, `party_contact`, `party_role`, `ALTER TABLE users ADD COLUMN party_id` |
| Entidad TypeORM `Party` | ✅ | Soft-delete, unicidad doc tipo+número por tenant, partial unique index |
| Entidad TypeORM `PartyContact` | ✅ | `isPrimary` por tipo, partial unique index WHERE `deleted_at IS NULL` |
| Entidad TypeORM `PartyRole` | ✅ | `PartyRoleStatus`, partial unique index por contexto |
| DTOs | ✅ | CreatePartyDto, UpdatePartyDto, AssignRoleDto, UpsertContactDto, ListPartiesDto (Zod + class-validator) |
| `IPartyReadPort` + snapshots | ✅ | PartySnapshot / PartyRoleSnapshot / PartyContactSnapshot (ADR-030 §D4) |
| `PartyReadAdapter` | ✅ | `TenantContext.getOrThrow()` — válido en HTTP context |
| `PartyService` | ✅ | CRUD + unicidad de documento por tenant + soft-delete |
| `PartyRoleService` | ✅ | assign / deactivate |
| `PartyContactService` | ✅ | upsert / list / delete + `isPrimary` cleanup automático |
| `PartiesController` | ✅ | 10 endpoints REST bajo `/api/v1/parties`, `JwtAuthGuard` + `RolesGuard(ADMIN)` |
| `PartiesModule` registrado en `AppModule` | ✅ | — |
| Tests unitarios (servicios) | ✅ | 72 tests: 0 fallidos |
| Tests HTTP (controller) | ✅ | Incluidos en los 72 |

### Calidad

```
Typecheck @iwana/api:     ✅ PASSED (0 errores)
Typecheck @iwana/shared:  ✅ PASSED (0 errores)
Typecheck @iwana/worker:  ✅ PASSED (0 errores)
Lint @iwana/api:          ✅ PASSED (0 warnings/errors)
Tests parties:            ✅ 88/88 PASSED (5 suites)
Tests worker:             ✅ 23/23 PASSED
API total:                794 tests — 792 passing, 2 failing (pre-existing gap commercial/tax-classification, fuera de scope F2)
```

**Cobertura MOD08 Parties (post gap-closure):**

| Archivo / Directorio | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `parties` (módulo total) | 82.45% | 100% | 100% | 84.9% |
| `adapters/party-read.adapter.ts` | **100%** ✅ | **100%** ✅ | **100%** ✅ | **100%** ✅ |
| `services/` (3 servicios) | 100% | 92.53% | 100% | 100% |
| `ports/party-read.port.ts` | 100% | 100% | 100% | 100% |
| `parties.controller.ts` | 100% | 100% | 100% | 100% |

Umbral requerido 80%: ✅ SUPERADO en todos los directorios

### Decisiones técnicas

1. **Servicios usan `TenantContext.getOrThrow()`** — Válido exclusivamente en HTTP context (guard chain). No usar desde worker o BullMQ.

2. **`seedTaxPresets()` usa SQL raw + `schemaName` explícito** — Compatible con context BullMQ donde `AsyncLocalStorage` no se propaga. Patrón documentado en gotchas `CLAUDE.md`.

3. **`UserRole.ADMIN` para parties** — No existe `TENANT_ADMIN` en el enum `UserRole`. El rol correcto es `ADMIN` según enum real del proyecto.

4. **Migración 022 aditiva** — Consistente con patrón ADR-024. `ALTER TABLE users ADD COLUMN party_id UUID NULL` no rompe esquema existente.

5. **Partial unique indexes** — Declarados en entidades TypeORM con `WHERE` clause para `deleted_at IS NULL`. Compatible con soft-delete y multiplex de documentos históricos.

### Commits F2 (10 commits)

| Hash | Descripción |
|---|---|
| `65f639b` | feat(shared): extraer TAX_COLOMBIA_PRESETS a @iwana/shared — gap F1 |
| `3a0ad47` | feat(shared): enums MOD08 Parties |
| `79c5d1f` | feat(db): migración 022 — create_parties_module |
| `84638f7` | feat(parties): entidades TypeORM Party, PartyContact, PartyRole |
| `bc25363` | feat(worker): seedTaxPresets en TenantSeedService — gap F1 cerrado |
| `d527bf9` | feat(parties): DTOs + IPartyReadPort + PartyReadAdapter |
| `83c66c4` | feat(parties): PartyService + PartyRoleService + PartyContactService |
| `f9bbd03` | feat(parties): controller 10 endpoints + module — MOD08 |
| `e9b4bea` | feat(api): registrar PartiesModule en AppModule |
| `af59b9c` | test(parties): unit + HTTP tests MOD08 — coverage ≥80% |

**F2 PARTIES + GAP F1: COMPLETO Y APROBADO PARA INTEGRACIÓN.**

### Gaps cerrados post-revisión (2026-04-21)

| ID | Gap original | Severidad | Solución implementada | Estado |
|---|---|---|---|---|
| D1 | `party-read.adapter.ts` cobertura 34% | Media | Nuevo `party-read.adapter.spec.ts` — 11 tests, cubre getById / findByDocument / listRoles / listContacts + boundary snapshot | ✅ Cerrado — 100% cobertura |
| D2 | Test negativo PII (Logger spy) ausente | Alta | Bloques PII en `party.service.spec.ts` (2 tests: warn + log) y `party-contact.service.spec.ts` (2 tests: upsert create + update) con `jest.spyOn(Logger.prototype)` | ✅ Cerrado |
| D3 | Test aislamiento tenant en HTTP spec ausente | Alta | Nuevo describe `Aislamiento de tenant` en `parties.controller.http.spec.ts` — token `tenant-b-token` inyecta `schemaName: tenant_b` distinto; verifica que cada request retorna sólo parties de su propio tenant | ✅ Cerrado |

---

## F3 — Commercial consume Taxation

**Estado:** ✅ Completada 2026-04-22

**Criterios de aceptación mapeados:** CA-03, CA-10, CA-11, CA-12, CA-14.

### Entregables

| Item | Estado | Notas |
|---|---|---|
| Migración 023 `create_tax_rule_applications` | ✅ | Tabla puente commercial ↔ taxation, reversible |
| Entidad TypeORM `TaxRuleApplication` | ✅ | FK → tax_rules + tax_definitions, tenant schema |
| `ITaxApplicationReadPort` | ✅ | Abstract class, retorna `TaxApplicationSnapshot[]` |
| `TaxApplicationService` | ✅ | Feature flag `TAXATION_USE_CATALOG`; fallback al motor legacy |
| `POST /commercial/tax/simulate` endpoint | ✅ | Simulador: explica qué impuestos aplican + regla ganadora |
| `TaxationModule` importado en `CommercialModule` | ✅ | Vía `ITaxCatalogReadPort` — sin acceso directo a entidades |
| `ITaxApplicationReadPort` exportado | ✅ | CrmModule y BillingModule lo pueden inyectar |
| Tests unitarios `TaxApplicationService` | ✅ | 3 casos: useCatalog=false, useCatalog=true, fallback |
| Test de boundary `tax-boundary.spec.ts` | ✅ | Verifica que CommercialModule NO importa entidades de TaxationModule |
| Tests HTTP `simulate` endpoint | ✅ | Incluidos en `tax.controller.http.spec.ts` |

### Calidad

```
Typecheck @iwana/api: ✅ PASSED
Tests API: 848 passing, 2 failing (pre-existing: tax-classification qr.manager.count bug, fuera de scope F3)
```

### Commits F3

| Hash | Descripción |
|---|---|
| 02e5846 | feat(commercial,taxation): f3 — port + tax_rule_applications + simulador |

### Decisiones técnicas

1. **Feature flag `TAXATION_USE_CATALOG`** — Default `false` (motor legacy). Cuando `true`, usa `TaxApplicationService` con tabla puente `tax_rule_applications`. Fallback automático si tabla puente vacía para la regla ganadora.

2. **Boundary enforcement** — `CommercialModule` importa `TaxationModule` sólo vía `ITaxCatalogReadPort`. No hay imports directos de entidades `TaxDefinition`.

3. **`TaxApplicationSnapshot` type** — Defined in `@iwana/shared/commercial`: `{ taxDefinitionId, treatment, effectiveRate, ruleId, priorityMatched }`. Nunca la entidad TypeORM.

4. **`simulate()` vs `resolve()`** — `resolve()` usa motor legacy (TaxClassificationService). `simulate()` usa TaxApplicationService con feature flag. Ambos coexisten durante la transición.

**F3 COMMERCIAL-TAXATION: COMPLETA Y APROBADA.**

---

## F4 — Frontend Portal tributario

**Estado:** ✅ Completada 2026-04-22

**Criterios de aceptación mapeados:** CA-08.

### Entregables

| Item | Estado | Notas |
|---|---|---|
| Backend: CRUD `/commercial/tax-rule-applications` | ✅ | 4 endpoints: GET, POST, PATCH/:id, DELETE/:id |
| `TaxCatalogManager.tsx` | ✅ | CRUD definiciones MOD07 con lock en presets SYSTEM |
| `TaxApplicationRulesManager.tsx` | ✅ | Vincula reglas comerciales con definiciones catálogo |
| `TaxSimulatorPanel.tsx` | ✅ | Inputs: segmento + estrato + municipio; output: regla ganadora |
| `CommercialTabLayout.tsx` actualizado | ✅ | 3 nuevas pestañas: Catálogo, Reglas de aplicación, Simulador |
| `api-client.ts` nuevos métodos F4 | ✅ | listTaxDefinitions, createTaxDefinition, update, delete, listTaxRuleApplications, CRUD aplicaciones, simulateTax |
| Test E2E Playwright | ✅ | `portal-tax-simulator.spec.ts` — catálogo + reglas + simulador |
| Typecheck portal | ✅ | 0 errores TypeScript |
| Typecheck API | ✅ | 0 errores TypeScript |
| Copy español, sentence case, WCAG AA | ✅ | Badge variants válidos (`success`, `neutral`, `primary`); `iwana-secondary-700` para texto |

### Commits F4

| Hash | Descripción |
|---|---|
| c4e3dd1 | feat(commercial): f4 backend — CRUD tax-rule-applications endpoints |
| 793f2f6 | feat(portal): f4 — TaxCatalogManager + TaxApplicationRulesManager + TaxSimulatorPanel + layout |
| 194c55d | test(e2e): portal tax simulator — catálogo + aplicaciones + simulador |

### Calidad

```
API tests:    848 passing, 2 failing (mismos pre-existentes, sin regresión)
Portal tests: 7 passing, 0 failing (4 nuevos en CommercialTabLayout.spec.tsx)
pnpm --filter @iwana/api typecheck:    0 errores
pnpm --filter @iwana/portal typecheck: 0 errores
```

### Decisiones técnicas

1. **TaxCatalogManager** lee de `/api/v1/taxation/definitions` (MOD07). Los presets SYSTEM muestran icono de candado (`Lock`) y no tienen botones de edición — el backend también rechaza con 403.

2. **TaxApplicationRulesManager** consume los nuevos endpoints `/commercial/tax-rule-applications`. Carga en paralelo las listas de reglas y definiciones para resolver nombres en la UI (`Promise.all`).

3. **TaxSimulatorPanel** usa `POST /commercial/tax/simulate`. El endpoint devuelve `{ applications, winnerRuleId, reason }` — el panel extrae `applications` y resalta el primero como regla ganadora. Estado vacío controlado con mensaje explicativo en amber.

4. **Feature flag no visible en UI** — La UI siempre muestra el simulador. Si `TAXATION_USE_CATALOG=false`, el backend aplica el motor legacy transparentemente sin exponer ese estado al panel.

5. **exactOptionalPropertyTypes** — Con el flag estricto activo en el portal, los formularios usan interfaces locales con `prop?: Type | undefined` (explicit undefined union) para permitir spread seguro en setForm callbacks. Los DTOs de API se construyen explícitamente sin propiedades undefined.

**F4 PORTAL TRIBUTARIO: COMPLETO Y APROBADO.**

---

## F5 — Backfill Subscribers/Users → Parties

**Estado:** ✅ Completada 2026-04-22

**Criterios de aceptación mapeados:** CA-06, CA-07, CA-09.

### Entregables

| Item | Estado | Notas |
|---|---|---|
| Migración 024 `backfill_subscribers_party_id` | ✅ | ADD COLUMN subscribers.party_id + backfill idempotente |
| ALTER `party.document_number` → VARCHAR(500) | ✅ | AES-256-GCM format requiere campo más amplio |
| `Subscriber.partyId` columna en entidad TypeORM | ✅ | `string \| null`, nullable |
| `SubscriberCreationService` actualizado | ✅ | Crea Party + PartyRole(CUSTOMER) antes del Subscriber (Opción A) |
| `SubscribersModule` imports `PartiesModule` | ✅ | Wiring correcto sin circular deps |
| Tests backfill idempotencia | ✅ | migration-024-backfill.spec.ts: passed |
| Tests subscriber creation via Party | ✅ | subscriber-creation.service.spec.ts: passed |
| Tests multi-rol Party | ✅ | party-multi-role.spec.ts: passed |

### Calidad

```
Tests F5 (crm/subscribers): 153 passing, 0 failing — 7 suites
  - migration-024-backfill.spec.ts:      ✅ PASSED
  - party-multi-role.spec.ts:            ✅ PASSED
  - subscriber-creation.service.spec.ts: ✅ PASSED
  - subscriber-status-transition.service.spec.ts: ✅ PASSED
  - subscribers.service.spec.ts:         ✅ PASSED
  - subscribers.controller.spec.ts:      ✅ PASSED
  - vat-treatment.service.spec.ts:       ✅ PASSED
Typecheck @iwana/api: ✅ PASSED
```

### Commits F5

| Hash | Descripción |
|---|---|
| 385d57f | feat(crm,parties): f5 — backfill subscribers->parties + crm wiring |

### Decisiones técnicas

1. **Opción A — Party creation inline** — `SubscriberCreationService` crea `Party + PartyRole(CUSTOMER)` dentro de la misma transacción que el `Subscriber`. Aprobado en ADR-030.

2. **`party.document_number` VARCHAR(500)** — El campo original era demasiado corto para el formato AES-256-GCM `iv:authTag:ciphertext` en hex. La migración 024 incluye el ALTER como pre-condición del backfill.

3. **Backfill idempotente** — Migración 024 usa `WHERE party_id IS NULL` para tolerar reintentos. Compatible con entornos de migración múltiple.

**F5 BACKFILL: COMPLETO Y APROBADO.**

---

## F6 — Deprecación legacy

**Estado:** ✅ Completada 2026-04-21

**Criterios de aceptación mapeados:** CA-13.

### Entregables

| Item | Estado | Notas |
|---|---|---|
| Migración 025 `deprecate_legacy_taxation` | ✅ | DROP estrato_min/max + DROP tax_classifications CASCADE; down() reversible recrea tabla con estructura M017 |
| `TaxClassificationService` eliminado | ✅ | Archivo `services/tax-classification.service.ts` eliminado |
| `TaxClassification` entity eliminada | ✅ | Archivo `entities/tax-classification.entity.ts` eliminado |
| `TaxRuleReadAdapter` + `TaxRuleReadPort` eliminados | ✅ | Sin consumidores externos; dependían de TaxClassificationService |
| `TaxApplicationService` simplificado | ✅ | Removidos: feature flag, `_legacyResolve()`, `_adaptClassificationToSnapshots()`, ConfigService, TaxClassificationService; agregado `listRules()` |
| `TaxController` simplificado | ✅ | Removidos: 11 endpoints CRUD legacy tax-classifications + tax-rules + POST /resolve; mantenidos: GET /tax-rules, POST /simulate, 4 endpoints tax-rule-applications |
| DTOs legacy removidos | ✅ | Eliminados: `CreateTaxClassificationDto`, `UpdateTaxClassificationDto`, `ResolveTaxDto` |
| `commercial.module.ts` actualizado | ✅ | Removidos: TaxClassification de TypeORM, TaxClassificationService, TaxRuleReadAdapter/Port |
| Entidades `TaxRule` + `CatalogItem` actualizadas | ✅ | Removidas relaciones ManyToOne a TaxClassification; taxClassificationId queda como columna plain |
| Tests `tax-classification.service.spec.ts` eliminados | ✅ | 18 tests (16 passing + 2 failing pre-existentes) eliminados con el servicio |
| Test `tax.controller.http.spec.ts` actualizado | ✅ | Removidos tests de endpoints legacy; conservados tests de GET /tax-rules + POST /simulate |
| Test `tax-application.service.spec.ts` actualizado | ✅ | Removidos ConfigService + TaxClassificationService del módulo de test |
| Portal `api-client.ts` limpiado | ✅ | Removidos: 9 métodos legacy (getTaxClassifications, createTaxClassification, updateTaxClassification, deleteTaxClassification, createTaxRule, updateTaxRule, deactivateTaxRule, resolveTaxClassification, deactivateTaxClassification); mantenido: getTaxRules (compatibilidad TaxApplicationRulesManager) |
| `TaxRulesManager.tsx` eliminado | ✅ | Componente legacy del portal; ningún archivo lo importa |
| `TaxApplicationRulesManager.tsx` verificado | ✅ | Solo usa métodos F4; usa getTaxRules() (compatibilidad mantenida) |
| ADR-032 creado | ✅ | `docs/adrs/ADR-032-Retiro-Feature-Flag-TAXATION-USE-CATALOG.md` |

### Calidad

```
pnpm --filter @iwana/api typecheck:    ✅ 0 errores
pnpm --filter @iwana/portal typecheck: ✅ 0 errores
API tests:    828 passing, 0 failing, 75 suites (los 2 tests pre-existentes + 16 del servicio legacy eliminados junto con el spec)
Portal tests: 7 passing, 0 failing, 2 suites
```

### Commits F6

| Hash | Descripción |
|---|---|
| (ver git log) | refactor(commercial): f6 — retiro feature flag + engine legacy removido de TaxApplicationService |
| (ver git log) | refactor(commercial): f6 — endpoints CRUD legacy tax-classifications/tax-rules removidos |
| (ver git log) | chore(commercial): f6 — TaxClassificationService y entity eliminados + DTOs legacy removidos |
| (ver git log) | feat(db): migration 025 — DROP estrato_min/max + DROP tax_classifications (reversible) |
| (ver git log) | refactor(portal): f6 — api-client legacy methods removidos + TaxRulesManager eliminado |
| (ver git log) | docs(adrs): ADR-032 — retiro feature flag TAXATION_USE_CATALOG |
| (ver git log) | docs(informe): f6 cierre del programa TAXATION-PARTIES-PROGRAMA |

### Decisiones técnicas

1. **Motor único: catálogo** — `TaxApplicationService.resolve()` ya no tiene feature flag. Siempre usa `_catalogResolve()`. El motor legacy (`_legacyResolve`, `_adaptClassificationToSnapshots`) fue eliminado por completo.

2. **`GET /commercial/tax-rules` reimplementado** — El endpoint se mantiene (requerido por `TaxApplicationRulesManager`), pero ahora delega a `TaxApplicationService.listRules()` que consulta `TaxRule` directamente sin pasar por `TaxClassificationService`.

3. **Entidades sin FK** — La columna `tax_classification_id` persiste en `tax_rules` y `catalog_items` como columna plain (sin `@ManyToOne`), ya que la tabla referenciada fue eliminada por migration 025 con CASCADE.

4. **`TaxRuleReadAdapter/Port` eliminados** — Sólo existían dentro de `CommercialModule` sin consumidores externos; su dependencia de `TaxClassificationService` los hacía inviables en F6.

5. **Portal `getTaxRules()` como método de compatibilidad** — Mantenido en `api-client.ts` para que `TaxApplicationRulesManager` siga funcionando. El endpoint backend ahora es limpio.

---

## Estado global del programa

**Estado:** ✅ CERRADO
**Fecha de cierre:** 2026-04-21

| Fase | Estado |
|---|---|
| F1 — Taxation MOD07 | ✅ Completada |
| F2 — Parties MOD08 | ✅ Completada |
| F3 — Commercial consume Taxation | ✅ Completada |
| F4 — Frontend Portal tributario | ✅ Completada |
| F5 — Backfill Subscribers → Parties | ✅ Completada |
| F6 — Deprecación legacy | ✅ Completada |

_Vacío._

## Referencias

- `docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md`
- `docs/prds/PRD-ADDENDUM-TAXATION-PARTIES-v1.0.md`
- `docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md`
- `docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md`
- `docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md`
- `docs/hlds/HLD-MOD07-TAXATION-v1.0.md`
- `docs/hlds/HLD-MOD08-PARTIES-v1.0.md`
- `docs/hlds/HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum.md`
- `docs/hlds/HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum.md`
- `docs/superpowers/specs/2026-04-21-taxation-bounded-context-design.md`
- `docs/superpowers/specs/2026-04-21-parties-multi-rol-design.md`
- `docs/superpowers/specs/2026-04-20-reglas-comerciales-design.md`
- `docs/prompts/PROMPT-TAXATION-PARTIES-COMMERCIAL-FASE-01-v1.0.md`
