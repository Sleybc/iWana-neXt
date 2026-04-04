# Diseño: Ciclo de Vida de Migraciones Multi-Tenant

> **Tipo:** Especificación Técnica  
> **Estado:** Borrador  
> **Fecha:** 2026-03-31  
> **Autor:** EM + Architect  
> **Componentes:** @iwana/db, @iwana/worker, @iwana/api, Docker, CI/CD

---

## 1. Resumen Ejecutivo

Este documento establece la arquitectura para un **ciclo de vida determinístico y automatizado de migraciones TypeORM** en arquitectura multi-tenant schema-per-tenant.

### Problema Actual

- Las migraciones de tenants **no se ejecutan automáticamente en deploy**
- Las migraciones **no se ejecutan al crear nuevos tenants**
- Resultado: errores `500 Internal Server Error` por tablas inexistentes

### Solución Propuesta

**Enfoque 1: Init Container + DataSource por Schema (TypeORM nativo)**

| Componente                    | Responsabilidad                                              |
| ----------------------------- | ------------------------------------------------------------ |
| `migrator`                    | Ejecutar migraciones antes del runtime (deploy)              |
| `TenantMigrationRunner`       | Iterar tenants y ejecutar migraciones con DataSource aislado |
| `TenantProvisioningProcessor` | Integrar migraciones en provisioning de nuevos tenants       |

---

## 2. Principios Arquitectónicos

### 2.1 Fuentes de Verdad

| Fuente                               | Responsabilidad                                           |
| ------------------------------------ | --------------------------------------------------------- |
| `typeorm_migrations` (por schema)    | Estado de migraciones aplicadas por tenant                |
| `packages/database/src/migrations/`  | Código fuente de migraciones                              |
| **Prohibido**: `tenant_template.sql` | Eliminado, reemplazado por `000_initial_tenant_schema.ts` |

### 2.2 Reglas Obligatorias

| Regla                             | Descripción                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| **Migraciones inmutables**        | NO renombrar ni modificar migraciones existentes                                          |
| **Preferir `migration:generate`** | Usar `migration:create` solo para casos avanzados (índices complejos, triggers, PL/pgSQL) |
| **DataSource por schema**         | Cada tenant usa DataSource aislado con `schema: tenant_schema`                            |
| **NO usar `IF NOT EXISTS`**       | typeorm_migrations controla el estado, permitir fallos explícitos                         |
| **Backward compatibility**        | Migraciones deben ser compatibles al menos 1 versión atrás                                |
| **Idempotencia de seeds**         | `INSERT ... ON CONFLICT DO NOTHING` en provisioning                                       |

### 2.3 Responsabilidades

| Componente              | Responsabilidad                                               |
| ----------------------- | ------------------------------------------------------------- |
| **Provisioning Worker** | Crear schema (`CREATE SCHEMA`)                                |
| **Migraciones**         | Crear tablas, índices, constraints (NO crear schema)          |
| **Migrator**            | Aplicar migraciones pendientes a todos los tenants existentes |

---

## 3. Arquitectura de Deploy (Init Container)

### 3.1 Flujo de Deploy

```
postgres ↑ (healthcheck OK)│    ▼
migrator ↑ (adquire advisory lock → migra todos los tenants → libera lock → exit 0)
    │
    ▼
api ↑ (depends_on: migrator, condition: service_completed_successfully)
worker ↑
```

### 3.2 Servicio Migrator

```yaml
# docker-compose.yml
services:
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
    command: ['node', 'dist/cli/tenant-migrate.js']
    restart: 'no'
    depends_on:
      postgres:
        condition: service_healthy

  api:
    depends_on:
      migrator:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    depends_on:
      migrator:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

### 3.3 Dockerfile Migrator

```dockerfile
# packages/database/Dockerfile.migrator
FROM node:20-alpine

WORKDIR /app

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Copiar archivos de dependencias
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/

# Instalar dependencias
RUN pnpm install --frozen-lockfile --filter @iwana/db --filter @iwana/shared --filter @iwana/config

# Copiar código fuente
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config

# Build
RUN pnpm --filter @iwana/shared build && pnpm --filter @iwana/config build && pnpm --filter @iwana/db build

WORKDIR /app/packages/database

CMD ["node", "dist/cli/tenant-migrate.js"]
```

---

## 4. TenantMigrationRunner (Core)

### 4.1 Contrato Principal

```typescript
// packages/database/src/migrations/tenant/runner.ts

import { DataSource } from 'typeorm';

const MIGRATION_LOCK_NAMESPACE = 42;
const MIGRATION_LOCK_RESOURCE = 1001;

export async function runTenantMigrations(dataSource: DataSource): Promise<void> {
  // 1. Adquirir lock global namespaced
  await acquireGlobalLock(dataSource);

  try {
    // 2. Obtener tenants activos
    const tenants = await getActiveTenants(dataSource);

    console.log(`[MIGRATOR] Starting migrations for ${tenants.length} tenant(s)`);

    // 3. Iterar SECUENCIAL (no paralelo para evitar locks DB)
    for (const tenant of tenants) {
      console.log(`[MIGRATOR] Migrating ${tenant.schema_name}`);

      const startTime = Date.now();

      try {
        await runMigrationsForTenant(dataSource, tenant.schema_name);

        const duration = Date.now() - startTime;
        console.log(`[MIGRATOR] Done ${tenant.schema_name} in ${duration}ms`);
      } catch (err) {
        console.error(`[MIGRATOR] Failed ${tenant.schema_name}`, err);
        throw err; // FAIL GLOBAL
      }
    }
  } finally {
    await releaseGlobalLock(dataSource);
  }
}

async function acquireGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_lock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock acquired');
}

async function releaseGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_unlock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock released');
}

async function getActiveTenants(dataSource: DataSource): Promise<Array<{ schema_name: string }>> {
  const result = await dataSource.query(
    `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  );
  return result;
}

async function runMigrationsForTenant(
  baseDataSource: DataSource,
  schemaName: string,
): Promise<void> {
  let tenantDs: DataSource | null = null;

  try {
    // DataSource AISLADO por schema (NO usar search_path)
    tenantDs = new DataSource({
      type: 'postgres',
      host: baseDataSource.options.host,
      port: baseDataSource.options.port,
      username: baseDataSource.options.username,
      password: baseDataSource.options.password,
      database: baseDataSource.options.database,
      schema: schemaName,
      name: `tenant-${schemaName}`, // CRÍTICO: evitar colisiones de DataSource
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

### 4.2 CLI Entry Point

```typescript
// packages/database/src/cli/tenant-migrate.ts

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

### 4.3 Scripts package.json

```json
{
  "scripts": {
    "build": "node ../../scripts/clean-paths.mjs dist && tsc",
    "migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/data-source.ts",
    "migration:run": "typeorm migration:run -d dist/data-source.js",
    "migration:revert": "typeorm migration:revert -d dist/data-source.js",
    "migration:show": "typeorm migration:show -d dist/data-source.js",
    "migration:tenant:run": "node dist/cli/tenant-migrate.js"
  }
}
```

---

## 5. Provisioning de Nuevos Tenants

### 5.1 Estrategia de Locking

| Contexto                    | Lock       | Namespace | Resource          |
| --------------------------- | ---------- | --------- | ----------------- |
| Migrator (deploy)           | Global     | 42        | 1001              |
| Provisioning (nuevo tenant) | Per-tenant | 42        | hash(schema_name) |

### 5.2 Flujo Atómico

```
1. INSERT tenant (status = PROVISIONING)
2. ACQUIRE LOCK (tenant-level)
3. CREATE SCHEMA tenant_{slug}
4. runMigrationsForSchema(schema_name)
5. seedInitialAdmin()
6. UPDATE tenant (status = ACTIVE)
7. RELEASE LOCK
```

### 5.3 Rollback en Fallo

```
1. RELEASE LOCK (si está adquirido)
2. DROP SCHEMA CASCADE
3. UPDATE tenant (status = PROVISIONING_FAILED, error_message = ...)
```

### 5.4 Implementación

```typescript
// apps/worker/src/processors/tenant-provisioning.processor.ts

const PROVISIONING_LOCK_NAMESPACE = 42;

async process(job: Job<ProvisioningJobPayload>): Promise<void> {
  const { tenantId, schemaName, tenantSlug } = job.data;

  // Validación de seguridad
  if (!isValidSchemaName(schemaName)) {
    throw new UnrecoverableError(`Invalid schema name: ${schemaName}`);
  }

  const lockResource = this.hashSchemaName(schemaName);

  try {
    // 1. Adquirir lock per-tenant
    await this.acquireTenantLock(lockResource);

    // 2. Crear schema
    await this.createSchema(schemaName);

    // 3. Ejecutar migraciones
    await this.runMigrationsForSchema(schemaName);

    // 4. Seed inicial (idempotente)
    await this.seedInitialAdmin({ tenantId, schemaName, tenantSlug });

    // 5. Activar tenant
    await this.activateTenant(tenantId);

  } catch (err) {
    await this.rollbackProvisioning(schemaName, tenantId, err);
    throw err;
  } finally {
    await this.releaseTenantLock(lockResource);
  }
}

private async acquireTenantLock(resource: number): Promise<void> {
  await this.pgPool.query(
    `SELECT pg_advisory_lock($1, $2)`,
    [PROVISIONING_LOCK_NAMESPACE, resource],
  );
}

private async releaseTenantLock(resource: number): Promise<void> {
  await this.pgPool.query(
    `SELECT pg_advisory_unlock($1, $2)`,
    [PROVISIONING_LOCK_NAMESPACE, resource],
  );
}

private hashSchemaName(schemaName: string): number {
  // FNV-1a 32-bit hash — mejor distribución que djb2
  let hash = 2166136261;
  for (let i = 0; i < schemaName.length; i++) {
    hash ^= schemaName.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

private async runMigrationsForSchema(schemaName: string): Promise<void> {
  let tenantDs: DataSource | null = null;

  try {
    tenantDs = new DataSource({
      ...baseOptions,
      name: `tenant-${schemaName}`,
      schema: schemaName,
      migrationsTableName: 'typeorm_migrations',
      migrations: ['dist/migrations/tenant/*.js'],
    });

    await tenantDs.initialize();
    await tenantDs.runMigrations();
  } finally {
    if (tenantDs?.isInitialized) {
      await tenantDs.destroy();
    }
  }
}

private async rollbackProvisioning(
  schemaName: string,
  tenantId: string,
  error: Error,
): Promise<void> {
  // DROP SCHEMA CASCADE
  await this.pgPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

  // Actualizar estado con error
  await this.dataSource
    .createQueryBuilder()
    .update('public.tenants')
    .set({
      status: 'PROVISIONING_FAILED',
      provisioning_error: error.message,
      provisioning_failed_at: () => 'NOW()',
    })
    .where('id = :id', { id: tenantId })
    .execute();
}
```

### 5.5 Retry Policy

```typescript
// En BullMQ job options
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
}
```

---

## 6. Migración Inicial (000_initial_tenant_schema)

### 6.1 Reemplazo de tenant_template.sql

El archivo `packages/database/src/templates/tenant_template.sql` se **ELIMINA** y su contenido se migra a:

```
packages/database/src/migrations/tenant/000_initial_tenant_schema.ts
```

### 6.2 Contenido

```typescript
// packages/database/src/migrations/tenant/000_initial_tenant_schema.ts

import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialTenantSchema1700000000000 implements MigrationInterface {
  name = 'InitialTenantSchema1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // NOTA: El schema ya fue creado por provisioning worker
    // NO usar CREATE SCHEMA ni SET search_path aquí

    // Tabla users
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        email VARCHAR(512) NOT NULL,
        email_hash VARCHAR(64) NOT NULL,
        password_hash VARCHAR(60) NOT NULL,
        role VARCHAR(20) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VERIFICATION',
        tenant_id UUID NOT NULL,
        mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_secret VARCHAR(512),
        mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
        password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
        password_reset_token VARCHAR(512),
        password_reset_expires_at TIMESTAMPTZ,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        email_verification_token VARCHAR(512),
        first_name VARCHAR(512),
        last_name VARCHAR(512),
        phone VARCHAR(20),
        job_title VARCHAR(150),
        document_type VARCHAR(20),
        document_number VARCHAR(512),
        avatar_url VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_users PRIMARY KEY (id),
        CONSTRAINT uq_users_email_hash UNIQUE (email_hash)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_users_email_hash ON users(email_hash)
    `);

    // Tabla refresh_tokens
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        family_id UUID NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        revoke_reason VARCHAR(50),
        ip_address VARCHAR(45),
        user_agent VARCHAR(512),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
        CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
      )
    `);

    // Tabla audit_logs
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id UUID,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        ip_address VARCHAR(45),
        user_agent VARCHAR(512),
        request_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_audit_logs PRIMARY KEY (id)
      )
    `);

    // Tablas MOD03
    await queryRunner.query(`
      CREATE TABLE commercial_nodes (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(150) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_commercial_nodes PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE coverage_zones (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(150) NOT NULL,
        center_latitude DOUBLE PRECISION NOT NULL,
        center_longitude DOUBLE PRECISION NOT NULL,
        radius_km NUMERIC(6,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_coverage_zones PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE plan_catalog_items (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(140) NOT NULL,
        technology VARCHAR(100) NOT NULL,
        installation_rule VARCHAR(30) NOT NULL DEFAULT 'ALWAYS',
        download_speed_mbps INTEGER NOT NULL,
        upload_speed_mbps INTEGER NOT NULL,
        base_price NUMERIC(14,2) NOT NULL,
        installation_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
        valid_from TIMESTAMPTZ,
        valid_to TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_plan_catalog_items PRIMARY KEY (id)
      )
    `);

    // Índices adicionales...
    await queryRunner.query(`
      CREATE INDEX idx_users_tenant_role ON users(tenant_id, role)
    `);
    // ... resto de índices
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // NOTA: El rollback de schema lo maneja el provisioning worker
    // (DROP SCHEMA CASCADE en caso de fallo)
    // Esta migración NO soporta down() porque el schema se elimina
    // externamente como parte del compensating transaction pattern.
    throw new Error(
      'down() not supported for initial schema migration. Use provisioning rollback.',
    );
  }
}
```

### 6.3 Orden de Objetos en Migración

1. **Tablas base** (sin FK)
2. **Foreign Keys**
3. **Índices**
4. **Constraints CHECK**
5. **RLS policies** (si aplica)

---

## 7. Turborepo y CI/CD

### 7.1 turbo.json

```json
{
  "tasks": {
    "@iwana/db#build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "@iwana/db#migration:tenant:run": {
      "dependsOn": ["@iwana/db#build"],
      "cache": false
    }
  }
}
```

### 7.2 CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint + Typecheck + Build + Migrations
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: '24.x'

      - name: Setup pnpm 10
        uses: pnpm/action-setup@v3
        with:
          version: 10

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Build
        run: pnpm build

      - name: Check pending migrations (public)
        run: |
          OUTPUT=$(pnpm --filter @iwana/db migration:show 2>&1 || true)
          echo "$OUTPUT"
          if echo "$OUTPUT" | grep -E "pending|not run"; then
            echo "❌ Pending migrations detected in public schema"
            exit 1
          fi
          echo "✅ No pending migrations"

      - name: Run public migrations (test)
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USER: test
          DB_PASSWORD: test
          DB_NAME: test
        run: pnpm --filter @iwana/db migration:run

      - name: Run tenant migrations (test)
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USER: test
          DB_PASSWORD: test
          DB_NAME: test
        run: |
          # Crear tenant de prueba
          psql -h localhost -U test -d test -c "CREATE SCHEMA tenant_test;"
          psql -h localhost -U test -d test -c "INSERT INTO public.tenants (id, slug, schema_name, status) VALUES (gen_random_uuid(), 'test', 'tenant_test', 'ACTIVE');"
          # Ejecutar migraciones tenant
          pnpm --filter @iwana/db migration:tenant:run
```

---

## 8. Observabilidad

### 8.1 Logs Estructurados

```
[MIGRATOR] Global lock acquired
[MIGRATOR] Starting migrations for 5 tenant(s)
[MIGRATOR] Migrating tenant_iwana
[MIGRATOR] Done tenant_iwana in 234ms
[MIGRATOR] Migrating tenant_acme
[MIGRATOR] Failed tenant_acme: relation "expediente_records" already exists
[MIGRATOR] Fatal error: Migration failed
```

### 8.2 Métricas (Opcional)

| Métrica                      | Tipo      | Descripción                                |
| ---------------------------- | --------- | ------------------------------------------ |
| `migration_duration_seconds` | Histogram | Duración de migración por tenant           |
| `migration_failures_total`   | Counter   | Total de fallos de migración               |
| `tenant_migrations_applied`  | Gauge     | Número de migraciones aplicadas por tenant |

---

## 9. Checklist de Implementación

### 9.1 Fase 1: Infraestructura

- [ ] Crear `Dockerfile.migrator`
- [ ] Modificar `docker-compose.yml` (servicio `migrator`)
- [ ] Modificar `docker-compose.dev.yml` (servicio `migrator`)
- [ ] Modificar `turbo.json` (task `migration:tenant:run`)
- [ ] Actualizar `packages/database/package.json` (scripts)

### 9.2 Fase 2: Core

- [ ] Crear `packages/database/src/migrations/tenant/runner.ts`
- [ ] Crear `packages/database/src/cli/tenant-migrate.ts`
- [ ] Crear `packages/database/src/migrations/tenant/000_initial_tenant_schema.ts`
- [ ] Eliminar `packages/database/src/templates/tenant_template.sql`
- [ ] Eliminar `packages/database/src/migrations/tenant/run-all.ts`

### 9.3 Fase 3: Provisioning

- [ ] Modificar `apps/worker/src/processors/tenant-provisioning.processor.ts`
- [ ] Integrar `runMigrationsForSchema()` en provisioning
- [ ] Implementar rollback atómico

### 9.4 Fase 4: CI/CD

- [ ] Modificar `.github/workflows/ci.yml`
- [ ] Añadir step de validación de migraciones
- [ ] Añadir step de ejecución en Postgres ephemeral

### 9.5 Fase 5: Validación

- [ ] Ejecutar tests de migración
- [ ] Validar provisioning de nuevo tenant
- [ ] Validar deploy con init container
- [ ] Validar rollback en fallo

---

## 10. Riesgos y Mitigaciones

| Riesgo                             | Probabilidad | Impacto | Mitigación                                   |
| ---------------------------------- | ------------ | ------- | -------------------------------------------- |
| Migrator falla en deploy           | Media        | Crítico | `restart: on-failure:3` + logs estructurados |
| Provisioning concurrente           | Baja         | Alto    | Advisory lock per-tenant                     |
| Race condition en schema           | Baja         | Alto    | Lock namespaced + validación                 |
| Drift entre tenants                | Baja         | Medio   | `typeorm_migrations` por schema              |
| Migración lenta con muchos tenants | Baja         | Medio   | Ejecución secuencial (evita locks DB)        |

---

## 11. Referencias

- **ADR-017**: Multi-tenant schema-per-tenant isolation
- **HLD-MOD01-ARQUITECTURA-v1.0**: Sección 3 (Modelo de Datos)
- **CHECKLIST-RIESGOS-SPRINT-01-v1.0.md**: R1, R2, R3

---

## 12. Historial de Cambios

| Fecha      | Autor          | Cambio                                                                                    |
| ---------- | -------------- | ----------------------------------------------------------------------------------------- |
| 2026-03-31 | EM + Architect | Versión inicial                                                                           |
| 2026-03-31 | EM + Architect | Fix: down() throws Error, FNV-1a hash, DataSource leak, CI public migrations, restart: no |
