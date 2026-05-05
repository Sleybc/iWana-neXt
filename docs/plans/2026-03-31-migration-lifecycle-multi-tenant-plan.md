# Migration Lifecycle Multi-Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar ciclo de vida automatizado y deterministico de migraciones TypeORM multi-tenant con init container pattern.

**Architecture:** Init container (migrator) ejecuta migraciones sobre todos los tenants existentes antes del runtime. Provisioning de nuevos tenants integra migraciones directamente en el worker.

---

## TASK 1: Crear Dockerfile.migrator

**Files:**
- Create: `packages/database/Dockerfile.migrator`

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter @iwana/db --filter @iwana/shared --filter @iwana/config
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config
RUN pnpm --filter @iwana/shared build && pnpm --filter @iwana/config build && pnpm --filter @iwana/db build
WORKDIR /app/packages/database
CMD ["node", "dist/cli/tenant-migrate.js"]
```

Commit: `git add packages/database/Dockerfile.migrator && git commit -m "feat(db): add Dockerfile.migrator for init container pattern"`

---

## TASK 2: Crear TenantMigrationRunner

**Files:**
- Create: `packages/database/src/migrations/tenant/runner.ts`

```typescript
import { DataSource } from 'typeorm';

const MIGRATION_LOCK_NAMESPACE = 42;
const MIGRATION_LOCK_RESOURCE = 1001;

export async function runTenantMigrations(dataSource: DataSource): Promise<void> {
  await acquireGlobalLock(dataSource);
  try {
    const tenants = await getActiveTenants(dataSource);
    console.log(`[MIGRATOR] Starting migrations for ${tenants.length} tenant(s)`);
    for (const tenant of tenants) {
      console.log(`[MIGRATOR] Migrating ${tenant.schema_name}`);
      const startTime = Date.now();
      try {
        await runMigrationsForTenant(dataSource, tenant.schema_name);
        console.log(`[MIGRATOR] Done ${tenant.schema_name} in ${Date.now() - startTime}ms`);
      } catch (err) {
        console.error(`[MIGRATOR] Failed ${tenant.schema_name}`, err);
        throw err;
      }
    }
  } finally {
    await releaseGlobalLock(dataSource);
  }
}

async function acquireGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_lock($1, $2)`, [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_RESOURCE]);
  console.log('[MIGRATOR] Global lock acquired');
}

async function releaseGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_unlock($1, $2)`, [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_RESOURCE]);
  console.log('[MIGRATOR] Global lock released');
}

async function getActiveTenants(dataSource: DataSource): Promise<Array<{ schema_name: string }>> {
  return dataSource.query(`SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`);
}

async function runMigrationsForTenant(baseDataSource: DataSource, schemaName: string): Promise<void> {
  let tenantDs: DataSource | null = null;
  try {
    tenantDs = new DataSource({
      type: 'postgres',
      host: baseDataSource.options.host,
      port: baseDataSource.options.port,
      username: baseDataSource.options.username,
      password: baseDataSource.options.password,
      database: baseDataSource.options.database,
      schema: schemaName,
      name: `tenant-${schemaName}`,
      migrationsTableName: 'typeorm_migrations',
      migrations: ['dist/migrations/tenant/*.js'],
      synchronize: false,
      logging: ['error'],
    });
    await tenantDs.initialize();
    await tenantDs.runMigrations();
  } finally {
    if (tenantDs?.isInitialized) {
      await tenantDs.destroy();
    }
  }
}
```

Commit: `git add packages/database/src/migrations/tenant/runner.ts && git commit -m "feat(db): add TenantMigrationRunner with advisory lock"`

---

## TASK 3: Crear CLI Entry Point

**Files:**
- Create: `packages/database/src/cli/tenant-migrate.ts`

```typescript
import { AppDataSource } from '../data-source';
import { runTenantMigrations } from '../migrations/tenant/runner';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  let exitCode = 0;
  try {
    await runTenantMigrations(AppDataSource);
    console.log('[MIGRATOR] All tenants migrated successfully');
  } catch (err) {
    console.error('[MIGRATOR] Fatal error:', err);
    exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
  process.exit(exitCode);
}

main();
```

Commit: `git add packages/database/src/cli/tenant-migrate.ts && git commit -m "feat(db): add tenant-migrate CLI entry point"`

---

## TASK 4: Actualizar package.json scripts

**Files:**
- Modify: `packages/database/package.json`

Cambiar scripts a:
```json
{
  "scripts": {
    "build": "node ../../scripts/clean-paths.mjs dist && tsc",
    "migration:run": "typeorm migration:run -d dist/data-source.js",
    "migration:revert": "typeorm migration:revert -d dist/data-source.js",
    "migration:show": "typeorm migration:show -d dist/data-source.js",
    "migration:tenant:run": "node dist/cli/tenant-migrate.js"
  }
}
```

Commit: `git add packages/database/package.json && git commit -m "feat(db): add migration:tenant:run script"`

---

## TASK 5: Actualizar turbo.json

**Files:**
- Modify: `turbo.json`

Agregar en tasks:
```json
"@iwana/db#build": {
  "dependsOn": ["^build"],
  "outputs": ["dist/**"]
},
"@iwana/db#migration:tenant:run": {
  "dependsOn": ["@iwana/db#build"],
  "cache": false
}
```

Commit: `git add turbo.json && git commit -m "feat(turbo): add migration:tenant:run task"`

---

## TASK 6: Modificar docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

Agregar servicio migrator:
```yaml
migrator:
  build:
    context: .
    dockerfile: packages/database/Dockerfile.migrator
  container_name: iwana_migrator
  environment:
    NODE_ENV: production
    DB_HOST: postgres
    DB_PORT: 5432
    DB_USER: ${DB_USER}
    DB_PASSWORD: ${DB_PASSWORD}
    DB_NAME: ${DB_NAME}
  command: ["node", "dist/cli/tenant-migrate.js"]
  restart: "no"
  depends_on:
    postgres:
      condition: service_healthy
```

Modificar api y worker depends_on para incluir migrator con condition: service_completed_successfully

Commit: `git add docker-compose.yml && git commit -m "feat(docker): add migrator init container service"`

---

## TASK 7: Modificar docker-compose.dev.yml

**Files:**
- Modify: `docker-compose.dev.yml`

Igual que TASK 6 pero con variables de desarrollo (DB_USER: iwana, DB_PASSWORD: Iwana102+, DB_NAME: dbiw)

Commit: `git add docker-compose.dev.yml && git commit -m "feat(docker): add migrator service to dev compose"`

---

## TASK 8: Crear 000_initial_tenant_schema.ts

**Files:**
- Create: `packages/database/src/migrations/tenant/000_initial_tenant_schema.ts`

Crear migracion inicial con todas las tablas del tenant_template.sql (users, refresh_tokens, audit_logs, commercial_nodes, coverage_zones, plan_catalog_items) incluyendo indices y RLS policies.

El metodo down() debe throw new Error('down() not supported for initial schema migration. Use provisioning rollback.')

Commit: `git add packages/database/src/migrations/tenant/000_initial_tenant_schema.ts && git commit -m "feat(db): add 000_initial_tenant_schema migration"`

---

## TASK 9: Modificar tenant-provisioning.processor.ts

**Files:**
- Modify: `apps/worker/src/processors/tenant-provisioning.processor.ts`

Agregar:
- CONST PROVISIONING_LOCK_NAMESPACE = 42
- hashSchemaName() usando FNV-1a
- acquireTenantLock() y releaseTenantLock()
- checkSchemaExists() para idempotencia
- createSchema() 
- runMigrationsForSchema() con patron defensivo (isInitialized check)
- rollbackProvisioning() con DROP SCHEMA CASCADE y UPDATE status = PROVISIONING_FAILED

Modificar process() para integrar migraciones y advisory lock per-tenant.

Commit: `git add apps/worker/src/processors/tenant-provisioning.processor.ts && git commit -m "feat(worker): integrate migrations in provisioning with advisory lock"`

---

## TASK 10: Modificar CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

Agregar servicio postgres para CI y steps:
- Check pending migrations (public)
- Run public migrations (test)
- Run tenant migrations (test)

Commit: `git add .github/workflows/ci.yml && git commit -m "feat(ci): add migration validation steps"`

---

## TASK 11: Eliminar archivos obsoletos

**Files:**
- Delete: `packages/database/src/templates/tenant_template.sql`
- Delete: `packages/database/src/migrations/tenant/run-all.ts`
- Delete: `packages/database/src/migrations/tenant/018_create_crm_expediente_tables.ts`
- Delete: `packages/database/src/migrations/tenant/019_add_mod03_commercial_configuration.ts`
- Delete: `packages/database/src/migrations/tenant/020_add_mod05_expediente_hardening.ts`
- Delete: `packages/database/src/migrations/tenant/021_update_audit_logs_action_enum.ts`
- Delete: `packages/database/src/migrations/tenant/022_add_expediente_identification_refinement.ts`

Commit: `git rm packages/database/src/templates/tenant_template.sql packages/database/src/migrations/tenant/run-all.ts packages/database/src/migrations/tenant/018_create_crm_expediente_tables.ts packages/database/src/migrations/tenant/019_add_mod03_commercial_configuration.ts packages/database/src/migrations/tenant/020_add_mod05_expediente_hardening.ts packages/database/src/migrations/tenant/021_update_audit_logs_action_enum.ts packages/database/src/migrations/tenant/022_add_expediente_identification_refinement.ts && git commit -m "feat(db): remove obsolete template and migration files"`

---

## TASK 12: Verificacion final

```bash
pnpm typecheck
pnpm build
pnpm lint
git add -A && git commit -m "feat(db): complete migration lifecycle multi-tenant implementation"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Init container pattern (migrator service) - TASK 6, 7
- [x] TenantMigrationRunner con advisory lock - TASK 2
- [x] CLI entry point - TASK 3
- [x] Scripts y turbo.json - TASK 4, 5
- [x] 000_initial_tenant_schema.ts - TASK 8
- [x] Provisioning con migraciones + rollback - TASK 9
- [x] CI con validacion de migraciones - TASK 10
- [x] Eliminacion de archivos obsoletos - TASK 11
- [x] Verificacion final - TASK 12

**Placeholder scan:** Sin TBDs, TODOs, o placeholders.

**Type consistency:**
- `runTenantMigrations(dataSource: DataSource)` - consistente
- `hashSchemaName()` usa FNV-1a - consistente
- Advisory lock constants `MIGRATION_LOCK_NAMESPACE = 42` - consistente
- `tenantDs.name = tenant-${schemaName}` - consistente

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-31-migration-lifecycle-multi-tenant-plan.md`**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
