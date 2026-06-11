# PROMPT — Ejecución programa Taxation (MOD07) + Parties (MOD08) + Rediseño tributario MOD06

**Version:** 1.0
**Fecha:** 2026-04-21
**Estado:** Listo para ejecución — ADR-029, ADR-030 y ADR-031 aprobados por CTO el 2026-04-21
**Generado por:** Engineering Manager (modo Architect + EM)
**Destinatario:** Sr. Dev Fullstack
**Nombre de archivo:** `PROMPT-TAXATION-PARTIES-COMMERCIAL-FASE-01-v1.0.md`

---

## 0. Modo de operación

- Sigue `AGENTS.md`, `.github/copilot-instructions.md` y las instrucciones por path aplicables al pie de la letra.
- Usa `pnpm` siempre. Nunca `npm` ni `yarn`.
- Lee skills aplicables antes de tocar código: `nestjs-expert`, `postgresql`, `database-migration`, `openapi-spec-generation`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `tailwind-patterns`, `testing-patterns`, `playwright-skill`, `auth-implementation-patterns`, `backend-security-coder`, `frontend-security-coder`, `docs-architect`.
- Cualquier conflicto entre artefactos fuente se escala con `[ESCALACION AL CTO]`. No inventes síntesis.

## 1. Objetivo exacto del programa

Resultado esperado al cierre de todas las fases:

- `TaxationModule` (MOD07) funcional con catálogo, presets Colombia, puerto de lectura y CRUD tenant.
- `PartiesModule` (MOD08) funcional con `Party + PartyContact + PartyRole`, vínculo `UserAccount.partyId`, puerto de lectura y CRUD tenant.
- `CommercialModule` (MOD06) reestructurado: pestaña tributaria con `Impuestos`, `Reglas de aplicación`, `Simulador`. Ownership del catálogo eliminado.
- Backfill de datos existentes completado sin pérdida.
- Deuda técnica cerrada: columnas duplicadas de estrato eliminadas, naming de UI actualizado, presets SYSTEM protegidos.

**Entra:** backend NestJS en `apps/api`, frontend Next.js en `apps/portal`, migraciones TypeORM en `packages/database`, tests en todos los niveles, OpenAPI, informes vivos.

**No entra:** integración DANE/DIAN/RUES, cálculo financiero de Billing, implementación de `PurchasingModule` o `HrModule`, renombre físico de tabla `users`, deduplicación automática de Parties.

## 2. Artefactos de entrada obligatorios

Lee y respeta en este orden:

1. `docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md`
2. `docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md`
3. `docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md`
4. `docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md`
5. `docs/hlds/HLD-MOD07-TAXATION-v1.0.md`
6. `docs/hlds/HLD-MOD08-PARTIES-v1.0.md`
7. `docs/hlds/HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum.md`
8. `docs/hlds/HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum.md`
9. `docs/specs/2026-04-21-taxation-bounded-context-design.md`
10. `docs/specs/2026-04-21-parties-multi-rol-design.md`
11. `docs/specs/2026-04-20-reglas-comerciales-design.md` (con addendum 2026-04-21)
12. `docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md`
13. `docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md`
14. `AGENTS.md`, `.github/copilot-instructions.md`, `docs/prds/Stack_Tecnologico.md`

Si algún artefacto falta o contradice otro, **detente y escala**.

## 3. Fases y contenido

### FASE 1 — Scaffold MOD07 Taxation

Backend:

- Crear módulo `apps/api/src/modules/taxation/` siguiendo estructura de HLD-MOD07 §3.
- Entidad `TaxDefinition` con columnas exactas del HLD §4.
- Migración TypeORM reversible en schema tenant (`packages/database/src/migrations/tenant/`).
- DTOs Zod: `create`, `update`, `listQuery`.
- Servicio `TaxDefinitionService` con unicidad por `(tenant, code)` y bloqueo de edición/eliminación de presets `SYSTEM`.
- Controller REST:
  - `GET /api/v1/taxation/definitions?context=...`
  - `POST /api/v1/taxation/definitions`
  - `PATCH /api/v1/taxation/definitions/:id`
  - `DELETE /api/v1/taxation/definitions/:id` (soft delete, nunca a SYSTEM).
- Seeder `TaxPresetsSeeder` con presets Colombia (RF-TAX-02). Registrado en el provisioning BullMQ de tenant.
- Puerto `ITaxCatalogReadPort` + adapter. Exportado desde el módulo.
- Registrar módulo en `apps/api/src/app.module.ts`.

Tests:

- Unit: unicidad, SYSTEM no editable, Zod.
- HTTP: roles, aislamiento tenant, paths.
- Integración: seeder siembra correctamente.
- Meta: ≥80% en servicio y controller.

OpenAPI:

- Actualizar spec generada con los nuevos endpoints.

Entregable documental:

- Abrir `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md` con sección F1 completada.

### FASE 2 — Scaffold MOD08 Parties

Backend:

- Crear módulo `apps/api/src/modules/parties/` según HLD-MOD08 §3.
- Entidades `Party`, `PartyContact`, `PartyRole` con columnas exactas del HLD §4.
- Migración TypeORM reversible en schema tenant:
  - Crear tablas.
  - Añadir `users.party_id UUID NULL` con FK lógica (nullable en v1).
- DTOs Zod para crear/actualizar `Party`, asignar/desactivar `PartyRole`, upsert contactos.
- Servicios: `PartyService`, `PartyRoleService`, `PartyContactService`. Regla: unicidad `(documentType, documentNumber)` activa; `isPrimary` único por `(partyId, type)`; un rol activo por `(partyId, role)`.
- Controller REST según HLD-MOD08 §5.
- Puerto `IPartyReadPort` + adapter.
- Política PII: cifrado o redacción para `documentNumber` y contactos según política PRD v2.3 §13. No aparecer en logs.

Tests:

- Unit: reglas de unicidad, vigencia de roles, primary único.
- HTTP: aislamiento tenant, roles.
- Integración: flujo crear Party + asignar roles + agregar contactos.
- Test negativo: PII no aparece en logs (regex sobre logger).
- Meta: ≥80% en servicios y controllers.

OpenAPI actualizado.

Informe vivo: sección F2.

### FASE 3 — Consumo Taxation desde Commercial

Backend:

- En `apps/api/src/modules/commercial/`:
  - Añadir dependencia a `TaxationModule` vía puerto `ITaxCatalogReadPort`. No importar entidad `TaxDefinition` directamente.
  - Nueva entidad `TaxRuleApplication` (tabla puente `tax_rule_applications`): `taxRuleId`, `taxDefinitionId`, `treatment`, `rateOverride`.
  - Renombre funcional: `TaxRule` → `TaxApplicationRule` (mantener tabla `tax_rules` durante migración, o renombrar vía migración reversible si se confirma seguro).
  - Nuevo servicio `TaxApplicationService` que reemplaza el comportamiento de `TaxClassificationService.resolveClassification` y devuelve `TaxApplicationSnapshot[]`.
  - Feature flag `taxation.useCatalog` (env var + `ConfigService`) que conmuta entre motor legacy y nuevo.
- Endpoints nuevos en Commercial:
  - Simulador: `POST /api/v1/commercial/tax/simulate` → devuelve impuestos aplicables + regla ganadora + motivo.
- Migración reversible:
  - Crear tabla `tax_rule_applications`.
  - Backfill: por cada `tax_rule` con `taxType`+`ratePercentage`, crear fila en `tax_rule_applications` apuntando al `tax_definition_id` correspondiente (creado por Taxation si no existe como preset).
- Respetar boundary: no importar entidad de Taxation; solo puerto.

Tests:

- Unit: `TaxApplicationService` con casos: residencial estrato 2 (IVA exento), SOHO natural estrato 3 (combinación por reglas), gobierno con tributo municipal (IVA + Retefuente + municipal).
- HTTP: simulador explica regla ganadora.
- Isolation: tenant no puede ver reglas de otro tenant.
- Boundary: test de arquitectura o grep que verifique que Commercial no importa `TaxDefinition`.

Informe vivo: sección F3.

### FASE 4 — Frontend Portal: Impuestos + Reglas + Simulador

Frontend (`apps/portal`):

- Crear componentes en `apps/portal/src/components/commercial/`:
  - `TaxCatalogManager.tsx` (lectura a Taxation).
  - `TaxApplicationRulesManager.tsx` (CRUD de reglas con condiciones).
  - `TaxSimulatorPanel.tsx` (inputs + output con regla ganadora).
- Reemplazar `TaxRulesManager.tsx` monolítico.
- Mantener `CommercialTabLayout.tsx` como integración.
- Copy de negocio en **español** y sentence case (AGENTS.md §UI Copy y Casing).
- Formularios con `react-hook-form` + `zod` + `@hookform/resolvers`.
- Componentes visuales desde `@iwana/ui` (no `tailwind.config.js`; respetar Tailwind 4 CSS-first).
- Actualizar `apps/portal/src/lib/api-client.ts` con:
  - `listTaxDefinitions`, `createTaxDefinition`, `updateTaxDefinition`, `deleteTaxDefinition`.
  - `createApplicationRule`, `updateApplicationRule`, `deleteApplicationRule`, `listApplicationRules`.
  - `simulateTax`.
- Mostrar en tabla de reglas copy legible: "si cliente cumple X → aplican estos impuestos".
- Desactivar en lugar de eliminar cuando aplique soft delete; mostrar claramente el estado.

Accesibilidad:

- Usar `iwana-secondary-700` para texto sobre blanco (AA).
- Labels y roles ARIA correctos en formularios y tablas.

Tests:

- Unit (Jest + RTL) sobre cada nuevo componente.
- E2E Playwright (portal config): flujo crear impuesto custom → crear regla → simular cliente → verificar regla ganadora.

Informe vivo: sección F4.

### FASE 5 — Backfill Subscribers/Users → Parties

Migraciones:

- Añadir `subscribers.party_id UUID NULL`.
- Script idempotente de backfill (migración data-only o comando dedicado):
  - Por cada `Subscriber` activo crear `Party` + `PartyRole(CUSTOMER)` + portar contactos primarios.
  - Escribir `subscriber.party_id`.
  - Para cada `User` con `personType`/documento, vincular `users.party_id`. Cuentas operativas quedan en `NULL`.
- Tras backfill completado en staging/prod: migración que pone `subscribers.party_id NOT NULL` con validación previa.

Backend:

- CRM pasa a leer identidad (`displayName`, `documentType`, `documentNumber`, contactos) desde `IPartyReadPort`. Mantiene sus campos comerciales y fiscales (`personType`, `customerSegment`, `stratum`).
- Endpoint de alta de cliente: crear Party si no existe, asignar rol CUSTOMER, crear Subscriber ligado.
- Guard: no permitir crear `Subscriber` sin `partyId`.

Tests:

- Script de backfill reproducible en DB de test: antes/después, sin pérdida.
- Unit: creación de cliente pasa por Party.
- Integración: un mismo `Party` puede recibir rol adicional `SUPPLIER` (placeholder; no implementa SupplierProfile aún) sin violar reglas.

Informe vivo: sección F5.

### FASE 6 — Deprecación controlada

- Remover columnas `estrato_min`/`estrato_max` en migración reversible final.
- Deprecar `tax_classifications`: migración `DROP TABLE IF EXISTS` reversible solo tras confirmar que nadie lo consume.
- Remover endpoints y DTOs legacy de Commercial que asuman `TaxClassification` como concepto visible.
- Quitar feature flag `taxation.useCatalog` tras corte completado, dejando registro del retiro en ADR operativo.

Tests:

- Regresión completa: `pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:portal`.
- Verificar que no existen imports de `TaxClassification` en `apps/portal/src/lib/api-client.ts` ni en servicios de Commercial.

Informe vivo: sección F6 + cierre del programa.

## 4. Restricciones no negociables

- No romper boundaries del modulith. Commercial no importa entidades de Taxation; CRM no importa entidades de Parties; todos consumen puertos.
- No acceder directamente a tablas de otro módulo.
- No usar `synchronize: true` en producción; solo migraciones.
- No introducir secretos, PII real ni connection strings en código, tests ni logs.
- No agregar `tailwind.config.js` (Tailwind 4 CSS-first).
- No crear archivos markdown de documentación fuera de los entregables formales.
- Respetar `UserRole.*` en `@Roles()` (sin string literals).
- `search_path` del tenant debe resolverse con `SET LOCAL` en transacción (pgBouncer compatible).
- Presets `SYSTEM` no editables ni eliminables.
- PII de Parties redactada en logs.
- Migraciones reversibles. Si una migración no puede ser reversible, escalar.

## 5. Entregables técnicos obligatorios

- Código backend MOD07, MOD08 y refactor Commercial.
- Código frontend portal con 3 nuevos componentes y `api-client` actualizado.
- Migraciones TypeORM reversibles por cada fase.
- Seeder de presets Colombia.
- Tests unitarios, integración e isolation con cobertura ≥ 80% en módulos core.
- Tests E2E Playwright del flujo tributario.
- OpenAPI actualizado.
- Feature flag documentado.

## 6. Entregables documentales obligatorios

- Informe vivo: `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.X.md`, actualizado por fase (no crear informes por fase separados).
- Evidencia de calidad: `docs/quality/` con resultados de cobertura y ejecuciones E2E relevantes.
- Actualización de specs si hay desvíos.
- Notas de migración para el equipo de operaciones.

## 7. Criterios de aceptación (por fase)

Mapear a CAs del PRD:

- F1 → CA-01, CA-02, CA-11, CA-12.
- F2 → CA-04, CA-05, CA-11, CA-12.
- F3 → CA-03, CA-10, CA-11, CA-12, CA-14.
- F4 → CA-08.
- F5 → CA-06, CA-07, CA-09.
- F6 → CA-13.

## 8. Criterio stop/go

Detente inmediatamente si:

- Un ADR referenciado aún no está aprobado por CTO.
- Una migración requerida no puede ser reversible.
- Detectas pérdida de datos en el backfill en DB de test.
- Un boundary no puede respetarse con la estructura actual.
- Aparece PII en logs o respuestas no auditadas.
- Hay conflicto entre artefactos fuente y no hay autoridad documental clara.

Documenta en el informe vivo, escala al CTO con `[ESCALACION AL CTO]` y espera directriz.

## 9. Criterio de salida del programa

- Backend validado: `pnpm lint && pnpm typecheck && pnpm test` en verde.
- Frontend validado: `pnpm --filter @iwana/portal test` y E2E Playwright portal en verde.
- Base de datos validada: `pnpm --filter @iwana/db migration:run` y `migration:revert` sin errores en test.
- Tests en verde con cobertura ≥ 80% en módulos core.
- Documentación archivada: informe vivo cerrado, OpenAPI publicado, PRD v2.3 marcado para consolidación a v2.4.
- Feature flag `taxation.useCatalog` retirado o marcado como retirado en ADR operativo.

## 10. Convenciones de entrega

- Commits con Conventional Commits + tipo `feat`, `refactor`, `chore`, `docs`, `test` según aplique.
- Un PR por fase; fases grandes pueden dividirse en sub-PRs por capa (backend/frontend/migración), pero siempre cohesivos.
- Cada PR referencia ADRs y HLDs aplicables.
- Cada PR deja verde `pnpm lint`, `pnpm typecheck`, `pnpm test` y gates definidos en AGENTS.md §Gates Before Merge.
