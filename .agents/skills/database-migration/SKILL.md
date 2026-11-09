---
name: database-migration
description: "Migraciones TypeORM versionadas y reversibles del schema public, con estrategia zero-downtime. Usar cuando se crea, aplica o revierte una migración fuera de migrations/tenant/. No usar para migraciones tenant (→ iwana-tenant-migration) ni para modelar tablas (→ postgresql)."
---

# Database Migration — iWana neXt

## Propósito

Gobierna la creación, aplicación y reversión de migraciones TypeORM en el repo iWana neXt.
Las invariantes de tenancy y de `synchronize` viven en `AGENTS.md` → Architecture Rules (Multi-tenancy y Security): solo migraciones versionadas.

## Usar este skill cuando

- Se creen o modifiquen entidades TypeORM y se necesite generar la migración correspondiente.
- Se apliquen o reviertan migraciones en desarrollo, staging o producción.
- Se diseñen estrategias zero-downtime para cambios de schema.

## No usar este skill cuando

- El archivo de migración vaya en `packages/database/src/migrations/tenant/` → usar `iwana-tenant-migration` (numeración `NNN_*.ts`, `runner.ts`, `migration-order.spec.ts`).
- La tarea sea solo de queries o lógica de negocio sin cambio de schema.
- Se usen ORMs distintos a TypeORM (Prisma, Sequelize, Drizzle — no están en el stack).

## Reglas no negociables

1. `synchronize: false` siempre — tanto en `dataSourceOptions` como en `TypeOrmModule.forRootAsync`.
2. Toda migración debe tener método `down()` implementado — las migraciones sin rollback bloquean merge.
3. Usar tipos PostgreSQL correctos: `bigint`, `numeric`, `timestamptz`, `text`, `jsonb`. Nunca `varchar` sin longitud justificada, nunca `timestamp` sin zona.
4. Nunca hardcodear nombres de schema de tenant — siempre resolver desde contexto de request via `TenantContext`.
5. Migraciones de schema público van en `packages/database/src/migrations/public/`.
6. Las migraciones de schema de tenant se escriben y registran con `iwana-tenant-migration`, no con esta skill.

## Comandos reales del repo

```bash
# Desde la raíz del monorepo (compilar @iwana/db antes: corren contra dist/):
pnpm --filter @iwana/db build
pnpm --filter @iwana/db migration:run
pnpm --filter @iwana/db migration:revert
```

No existe `migration:generate` (`AGENTS.md`): la migración se escribe a mano en `packages/database/src/migrations/public/`.

## Estructura de migraciones

```
packages/database/src/
├── data-source.ts          # DataSource principal — AppDataSource
├── entities/               # Entidades TypeORM
└── migrations/
    └── public/             # Migraciones del schema público (tenants, platform_users, etc.)
```

Las migraciones de schema de tenant viven en `packages/database/src/migrations/tenant/` y se tratan en `iwana-tenant-migration`.

## Patrones de migración

### Migración estándar de schema público

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: descripción breve del cambio.
 * Schema: public
 * Reversible: sí
 */
export class NombreMigracion1234567890123 implements MigrationInterface {
  name = 'NombreMigracion1234567890123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."nombre_tabla"
      ADD COLUMN "nueva_columna" text NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."nombre_tabla"
      DROP COLUMN "nueva_columna"
    `);
  }
}
```

### Migración con índice

```typescript
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tabla_columna"
    ON "public"."tabla" ("columna")
  `);
}

public async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "idx_tabla_columna"`);
}
```

### Migración en schema de tenant

Para cambios en el schema de tenant, usar `iwana-tenant-migration`: archivo `NNN_snake_case.ts` en `migrations/tenant/`, registro en `runner.ts` y verificación con `migration-order.spec.ts`. Esta skill no cubre ese flujo.

## Estrategia zero-downtime

Para columnas nuevas NOT NULL en tablas grandes:

1. Agregar columna como nullable.
2. Backfill con valor por defecto en batches.
3. Agregar constraint NOT NULL en migración separada.
4. Nunca hacer `ALTER TABLE ADD COLUMN NOT NULL` sin DEFAULT en tablas con datos.

```typescript
// Paso 1
await queryRunner.query(`ALTER TABLE "tabla" ADD COLUMN "col" text`);

// Paso 2 (backfill en batches — fuera de la migración, en script separado si la tabla es grande)
await queryRunner.query(`UPDATE "tabla" SET "col" = 'valor' WHERE "col" IS NULL`);

// Paso 3 (migración siguiente)
await queryRunner.query(`ALTER TABLE "tabla" ALTER COLUMN "col" SET NOT NULL`);
```

## Checklist de revisión de migración

- [ ] `down()` implementado y probado con `migration:revert`
- [ ] Tipos PostgreSQL correctos (`timestamptz`, `numeric`, `text`, `jsonb`)
- [ ] Sin `synchronize: true` en ningún archivo de configuración
- [ ] `CREATE INDEX CONCURRENTLY` para índices en tablas con datos
- [ ] Sin hardcoding de schema de tenant
- [ ] Migración probada en entorno local contra la DB real
- [ ] Nombre de migración descriptivo (no solo timestamp)

## Anti-patrones

- `synchronize: true` — destruye datos en producción sin advertencia
- `varchar` sin longitud — usar `text` salvo restricción de dominio específica
- `timestamp` sin zona — siempre `timestamptz`
- Migración sin `down()` — bloquea rollback de deploy
- `DROP COLUMN` sin verificar que no hay código que lo use
