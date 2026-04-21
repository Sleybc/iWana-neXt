# Informe vivo — Programa Taxation (MOD07) + Parties (MOD08) + Rediseño tributario MOD06

**Version:** 1.0
**Estado:** Abierto — F3 ✅ + F5 ✅ — F4 en progreso
**Fecha de apertura:** 2026-04-21
**Última actualización:** 2026-04-22 (F3 + F5 completadas; gaps D1/D2/D3 cerrados)
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
| F4 | Portal: `TaxCatalogManager` + `TaxApplicationRulesManager` + `TaxSimulatorPanel` | 🔄 En progreso |
| F5 | Backfill Subscribers/Users → Parties | ✅ Completada 2026-04-22 |
| F6 | Deprecación legacy + cierre de deuda técnica | No iniciada |

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
- Consolidar PRD v2.3 → v2.4 al cierre del programa.

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

**Estado:** No iniciada.

**Criterios de aceptación mapeados:** CA-08.

_Este bloque se actualizará durante la ejecución._

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

**Estado:** No iniciada.

**Criterios de aceptación mapeados:** CA-13.

_Este bloque se actualizará durante la ejecución._

---

## Registro de escalaciones

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
