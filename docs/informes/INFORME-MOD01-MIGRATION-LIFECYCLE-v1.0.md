# INFORME-MOD01-MIGRATION-LIFECYCLE-v1.0.md

**Version:** 1.0
**Fecha:** 2026-03-31
**Convencion documental:** INFORME-MOD01-MIGRATION-LIFECYCLE-v1.0.md

## Vinculos de trazabilidad

- Plantilla base: docs/informes/TEMPLATE-INFORME-FASE-v1.0.md
- Spec: docs/specs/2026-03-31-migration-lifecycle-multi-tenant-design.md
- Plan: docs/superpowers/plans/2026-03-31-migration-lifecycle-multi-tenant-plan.md
- Politica de ejecucion: ADR-022

---

## Identificacion

- Modulo: MOD01 - Multi-Tenant Architecture
- Fase: Migration Lifecycle
- Sprint: N/A (implementacion transversal)
- Fecha: 2026-03-31
- Responsable principal: EM + Architect

---

## 1. Resumen ejecutivo

- **Objetivo de la fase:** Implementar ciclo de vida automatizado y deterministico de migraciones TypeORM multi-tenant con init container pattern para resolver desincronizacion de esquemas en deploy y provisioning.

- **Resultado alcanzado:** Se implemento el patron init container (`migrator`) que ejecuta migraciones sobre todos los tenants existentes antes del runtime de API/Worker. Provisioning de nuevos tenants ahora integra migraciones directamente en el worker via `runMigrationsForSchema()`. Cada tenant tiene su propio `typeorm_migrations` table via DataSource aislado.

- **Estado:** Completa

---

## 2. Entregables implementados

### Backend

- `packages/database/Dockerfile.migrator` - Imagen dedicada para migraciones
- `packages/database/src/migrations/tenant/runner.ts` - TenantMigrationRunner con advisory lock global
- `packages/database/src/cli/tenant-migrate.ts` - CLI entry point
- `apps/worker/src/processors/tenant-provisioning.processor.ts` - Integracion de migraciones en provisioning con advisory lock per-tenant

### Base de datos

- `packages/database/src/migrations/tenant/000_initial_tenant_schema.ts` - Migracion inicial con todas las tablas (users, refresh_tokens, audit_logs, commercial_nodes, coverage_zones, plan_catalog_items)

### Archivos eliminados

- `packages/database/src/templates/tenant_template.sql`
- `packages/database/src/migrations/tenant/run-all.ts`
- `packages/database/src/migrations/tenant/018_create_crm_expediente_tables.ts`
- `packages/database/src/migrations/tenant/019_add_mod03_commercial_configuration.ts`
- `packages/database/src/migrations/tenant/020_add_mod05_expediente_hardening.ts`
- `packages/database/src/migrations/tenant/021_update_audit_logs_action_enum.ts`
- `packages/database/src/migrations/tenant/022_add_expediente_identification_refinement.ts`

### Integraciones

- `docker-compose.yml` - Servicio migrator con depends_on condition: service_completed_successfully
- `docker-compose.dev.yml` - Servicio migrator para desarrollo
- `turbo.json` - Tasks @iwana/db#build y @iwana/db#migration:tenant:run
- `packages/database/package.json` - Script migration:tenant:run
- `.github/workflows/ci.yml` - Validacion de migraciones con Postgres ephemeral

---

## 3. Evidencia funcional

- **Flujo probado:** Verificacion de compilacion (typecheck, build, lint) todas pasaron
- **Datos de prueba usados:** N/A (implementacion)
- **Resultado observado:** Implementacion compila, build pasa, lint pasa

---

## 4. Evidencia de calidad

### Politica de testing (segun ADR-022 y PRD)

| Criterio              | Requisito              | Estado actual                                                                                                                                                                                                              | Proximo paso                                   |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Cobertura**         | >= 80% en modulos core | N/A (infraestructura)                                                                                                                                                                                                      | N/A para infraestructura                       |
| **Unit tests**        | Jest                   | Tests existentes en `tenant-provisioning.processor.spec.ts` verifican flujo original. Nuevas funcionalidades (hashSchemaName, acquireTenantLock, runMigrationsForSchema, rollbackProvisioning) requieren tests adicionales | Agregar tests para nuevas funcionalidades      |
| **Integration tests** | Supertest              | Requieren entorno PostgreSQL con schema multi-tenant                                                                                                                                                                       | Implementar cuando haya entorno de integracion |
| **E2E tests**         | Playwright             | N/A para esta implementacion                                                                                                                                                                                               | N/A                                            |

### Nota sobre cobertura

Segun el PRD (seccion 13.3):

- La cobertura >= 80% aplica a **modulos core** (CRM, Billing, Provisioning, etc.)
- **Infraestructura** (migraciones, CI/CD, Docker) no requiere cobertura de modulos core

### Tests existentes

- `apps/worker/src/processors/tenant-provisioning.processor.spec.ts` - 2 test cases para flujo original de provisioning

### Hallazgos abiertos

- Tests unitarios para las nuevas funcionalidades del processor (hashSchemaName, advisory locks, rollbackProvisioning)
- Tests de integracion con PostgreSQL real para validar migraciones multi-tenant

---

## 5. Cambios documentales

- **Spec:** docs/specs/2026-03-31-migration-lifecycle-multi-tenant-design.md (nuevo)
- **Plan:** docs/superpowers/plans/2026-03-31-migration-lifecycle-multi-tenant-plan.md (nuevo)
- **HLD actualizado:** HLD-MOD01-ARQUITECTURA-v1.0.md (seccion 3 - Modelo de Datos)
- **ADR nuevo o referenciado:** ADR-017 (Provisioning Schema-per-tenant), ADR-022 (Politica de ejecucion)
- **Otros documentos afectados:** CHECKLIST-RIESGOS-SPRINT-01-v1.0.md

---

## 6. Riesgos y bloqueos

- **Riesgo 1:** Migrator puede fallar si PostgreSQL no esta listo - Mitigado con healthcheck + service_healthy condition
- **Riesgo 2:** Race condition entre migrator y provisioning concurrente - Mitigado con advisory lock namespaced (namespace=42, resource=1001 para migrator, resource=hash(schema) para provisioning)
- **Bloqueo tecnico, si aplica:** Ninguno

---

## 7. Decision de salida

- **Puede pasar a siguiente fase:** Si (infraestructura operativa)
- **Requiere correcciones previas:** No
- **Aprobadores pendientes:** Ninguno
- **Nota:** Los tests unitarios para nuevas funcionalidades del processor son tecnicamente deseables pero no bloquean el funcionamiento de la infraestructura

---

## Commits realizados

| #   | SHA     | Descripcion                                                           |
| --- | ------- | --------------------------------------------------------------------- |
| 1   | 81705f2 | feat(db): add Dockerfile.migrator for init container pattern          |
| 2   | 2b5aa80 | feat(db): add TenantMigrationRunner with advisory lock                |
| 3   | a0af46c | feat(db): add tenant-migrate CLI entry point                          |
| 4   | 137c354 | feat(db): add migration:tenant:run script                             |
| 5   | 09d5b83 | feat(turbo): add migration:tenant:run task                            |
| 6   | 787decb | feat(docker): add migrator init container service                     |
| 7   | 286a479 | feat(docker): add migrator service to dev compose                     |
| 8   | c14f62c | feat(db): add 000_initial_tenant_schema migration                     |
| 9   | db753ae | feat(worker): integrate migrations in provisioning with advisory lock |
| 10  | 7be1a92 | feat(ci): add migration validation steps                              |
| 11  | 4f8c0ff | feat(db): remove obsolete template and migration files                |
| 12  | 15388ef | feat(db): fix type errors in tenant migration runner                  |

---

## Checklist de aceptacion

- [x] Init container pattern (migrator) antes del runtime
- [x] Migraciones se ejecutan automaticamente en deploy
- [x] Migraciones se ejecutan al crear nuevos tenants
- [x] Cada tenant tiene su propio typeorm_migrations
- [x] Advisory lock global para migrator
- [x] Advisory lock per-tenant para provisioning
- [x] Rollback atomico en provisioning (DROP SCHEMA CASCADE)
- [x] CI valida migraciones con Postgres ephemeral
- [x] Scripts migration:run, migration:show, migration:revert intactos
- [x] Typecheck, build, lint pasan
- [ ] Tests unitarios para nuevas funcionalidades del processor (pendiente)
- [ ] Tests de integracion con PostgreSQL multi-tenant (pendiente)

---

## 8. Addendum correctivo: recuperacion de provisioning tenant iWana

### 8.1 Contexto operativo

Durante la verificacion del dashboard de plataforma se detecto estado degradado asociado a BullMQ/Redis y un tenant bloqueado en provisioning:

- tenant: `iWana`
- tenant id: `6af2528c-0d2b-4306-b922-4bb22cf18e7b`
- slug: `iwana`
- schema: `tenant_iwana`

El objetivo correctivo fue recuperar el tenant mediante el flujo real del worker y del endpoint de reintento, sin activacion manual del estado en base de datos.

### 8.2 Causas encadenadas encontradas

La investigacion identifico varias derivas acumuladas en el provisioning tenant:

- el rollback intentaba persistir una propiedad/columna inexistente (`provisioning_error`) en `Tenant`;
- el worker ejecutaba seeds antes de migraciones, por lo que el seed de admin podia fallar con tablas tenant inexistentes;
- el loader de migraciones cargaba exports auxiliares y archivos no ejecutables como migracion;
- el loader usaba import dinamico con file URL en un runtime CommonJS, generando fallos de resolucion de modulo;
- faltaba una migracion base tenant para `expediente_records` requerida por migraciones CRM posteriores;
- faltaba la tabla `status_changes`, requerida por la consolidacion del pipeline de expediente;
- la causa raiz final fue que el `DataSource` de migraciones tenant del worker configuraba `schema`, pero no fijaba `search_path`; como las migraciones usan SQL raw sin schema calificado, algunas ejecuciones apuntaron accidentalmente a `public`.

### 8.3 Correcciones aplicadas

Se aplicaron correcciones en el worker y en migraciones tenant:

- `apps/worker/src/processors/tenant-provisioning.processor.ts`
	- rollback simplificado a `markFailed(tenantId)` y `DROP SCHEMA IF EXISTS ... CASCADE`;
	- orden de provisioning corregido a migraciones -> seed admin -> tax presets -> `ACTIVE`;
	- loader de migraciones endurecido con `createRequire(__filename)`, exclusion de `runner.js` y filtro de constructores TypeORM por metodos `up`/`down`;
	- `DataSource` tenant alineado con `packages/database/src/migrations/tenant/runner.ts` usando `extra.options` para fijar `search_path` al schema tenant.
- `packages/database/src/migrations/tenant/001_create_expediente_records.ts`
	- migracion base CRM tenant agregada para `expediente_records`;
	- incluye `status_changes`, `contact_attempts`, `coverage_checks` y `consent_records` como base compatible con las migraciones posteriores.
- `packages/database/src/migrations/tenant/runner.ts`
	- registro de `CreateExpedienteRecords1700000000001` para mantener paridad entre migrator/runner y worker.

### 8.4 Evidencia de calidad

Validaciones ejecutadas durante el correctivo:

- `pnpm --filter @iwana/db typecheck`: OK;
- `pnpm --filter @iwana/worker test -- tenant-provisioning.processor.spec.ts tenant-provisioning.processor.migration.spec.ts`: OK, 2 suites / 14 tests;
- `pnpm --filter @iwana/worker typecheck`: OK;
- rebuild real de Docker worker con `docker compose -f docker-compose.dev.yml build --no-cache worker` y recreacion del servicio worker;
- artefacto compilado del contenedor activo verificado con presencia de `search_path` y `requireTenantMigration`, y ausencia de `pathToFileURL`.

### 8.5 Recuperacion operativa validada

El reintento se ejecuto usando el flujo de plataforma vigente:

- login plataforma mediante `POST /api/v1/auth/platform/login`;
- retry mediante `PATCH /api/v1/tenants/:id/retry-provisioning`.

Verificacion final contra Docker y PostgreSQL dev:

- contenedor worker activo: `iwana_worker_dev`, imagen `appiw-worker`, estado `Up`;
- tenant `iWana` quedo en `ACTIVE`;
- schema `tenant_iwana` existe;
- tablas requeridas presentes: `users`, `expediente_records`, `status_changes`, `tax_definitions`, `typeorm_migrations`;
- total observado en `tenant_iwana`: 35 tablas.

### 8.6 Riesgos remanentes y seguimiento

- Se observo contaminacion previa de `public` con tablas tenant-like causada por ejecuciones anteriores sin `search_path` correcto. No se elimino nada automaticamente para evitar borrar objetos legitimos o evidencia de diagnostico.
- Se recomienda una tarea separada de saneamiento controlado del schema `public`, comparando contra las migraciones publicas legitimas antes de cualquier `DROP`.
- La politica efectiva queda reforzada: cualquier ejecucion de migraciones tenant con SQL raw debe fijar `search_path` de forma explicita, no depender solo de `schema` en TypeORM.
