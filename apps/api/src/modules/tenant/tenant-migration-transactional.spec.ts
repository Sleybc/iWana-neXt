import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  applyTenantMigrationStep,
  isTenantMigrationTransactional,
  type TenantMigrationLike,
} from '../../../../../packages/database/src/migrations/tenant/runner';
import { revertTenantMigrationStep } from '../../../../../packages/database/src/migrations/tenant/revert';

/**
 * Tests del flag `transactional` (ADR-066) en runner/revert tenant.
 *
 * Mismo patrón que `tenant-migration-revert.spec.ts`: QueryRunner de doble que
 * registra el orden de llamadas. No toca PostgreSQL real.
 */

type TxCall =
  | 'startTransaction'
  | 'commitTransaction'
  | 'rollbackTransaction'
  | 'up'
  | 'down'
  | 'query';

interface FakeQueryRunner {
  runner: QueryRunner;
  calls: TxCall[];
  queries: string[];
}

function createFakeQueryRunner(): FakeQueryRunner {
  const calls: TxCall[] = [];
  const queries: string[] = [];

  const runner = {
    startTransaction: jest.fn(async () => {
      calls.push('startTransaction');
    }),
    commitTransaction: jest.fn(async () => {
      calls.push('commitTransaction');
    }),
    rollbackTransaction: jest.fn(async () => {
      calls.push('rollbackTransaction');
    }),
    query: jest.fn(async (sql: string) => {
      calls.push('query');
      queries.push(sql);
      return [];
    }),
  } as unknown as QueryRunner;

  return { runner, calls, queries };
}

function createMigration(opts: {
  name: string;
  transactional?: boolean;
  up?: (qr: QueryRunner) => Promise<void>;
  down?: (qr: QueryRunner) => Promise<void>;
}): TenantMigrationLike {
  const migration: TenantMigrationLike = {
    name: opts.name,
    up: opts.up ?? (async () => undefined),
    down: opts.down ?? (async () => undefined),
  };
  if (opts.transactional !== undefined) {
    migration.transactional = opts.transactional;
  }
  return migration;
}

describe('ADR-066 — isTenantMigrationTransactional', () => {
  it('default true cuando el flag está ausente', () => {
    expect(isTenantMigrationTransactional({} as MigrationInterface)).toBe(true);
  });

  it('respeta transactional: false', () => {
    expect(isTenantMigrationTransactional({ transactional: false } as TenantMigrationLike)).toBe(
      false,
    );
  });
});

describe('ADR-066 — applyTenantMigrationStep', () => {
  it('transactional:false no llama startTransaction antes de up()', async () => {
    const fake = createFakeQueryRunner();
    const order: string[] = [];

    const migration = createMigration({
      name: 'NonTxMigration0870000000000',
      transactional: false,
      up: async () => {
        order.push('up');
        fake.calls.push('up');
      },
    });

    await applyTenantMigrationStep(fake.runner, migration, migration.name!);

    expect(order).toEqual(['up']);
    const upIdx = fake.calls.indexOf('up');
    const startIdx = fake.calls.indexOf('startTransaction');
    expect(upIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(upIdx);
    expect(fake.calls.slice(0, upIdx)).not.toContain('startTransaction');
    expect(fake.queries.some((q) => q.includes('INSERT INTO "typeorm_migrations"'))).toBe(true);
    expect(fake.calls).toContain('commitTransaction');
  });

  it('default (transactional true) abre TX antes de up()', async () => {
    const fake = createFakeQueryRunner();

    const migration = createMigration({
      name: 'TxMigration0010000000000',
      up: async () => {
        fake.calls.push('up');
      },
    });

    await applyTenantMigrationStep(fake.runner, migration, migration.name!);

    expect(fake.calls[0]).toBe('startTransaction');
    expect(fake.calls.indexOf('up')).toBeGreaterThan(0);
    expect(fake.calls).toContain('commitTransaction');
    expect(fake.calls).not.toContain('rollbackTransaction');
  });

  it('transactional true hace rollback si up() falla', async () => {
    const fake = createFakeQueryRunner();
    const migration = createMigration({
      name: 'TxFail0010000000000',
      up: async () => {
        throw new Error('boom-up');
      },
    });

    await expect(applyTenantMigrationStep(fake.runner, migration, migration.name!)).rejects.toThrow(
      'boom-up',
    );
    expect(fake.calls).toEqual(['startTransaction', 'rollbackTransaction']);
  });

  it('transactional:false envuelve el error si up() falla sin haber abierto TX', async () => {
    const fake = createFakeQueryRunner();
    const migration = createMigration({
      name: 'NonTxFail0870000000000',
      transactional: false,
      up: async () => {
        throw new Error('concurrent-ddl');
      },
    });

    await expect(applyTenantMigrationStep(fake.runner, migration, migration.name!)).rejects.toThrow(
      /no transaccional.*"NonTxFail0870000000000".*Verifique manualmente/,
    );
    expect(fake.calls).not.toContain('startTransaction');
  });
});

describe('ADR-066 — revertTenantMigrationStep', () => {
  it('transactional:false no llama startTransaction antes de down()', async () => {
    const fake = createFakeQueryRunner();

    const migration = createMigration({
      name: 'NonTxMigration0870000000000',
      transactional: false,
      down: async () => {
        fake.calls.push('down');
      },
    });

    await revertTenantMigrationStep(fake.runner, migration, 42, migration.name!);

    const downIdx = fake.calls.indexOf('down');
    const startIdx = fake.calls.indexOf('startTransaction');
    expect(downIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(downIdx);
    expect(fake.calls.slice(0, downIdx)).not.toContain('startTransaction');
    expect(fake.queries.some((q) => q.includes('DELETE FROM "typeorm_migrations"'))).toBe(true);
  });

  it('default abre TX antes de down()', async () => {
    const fake = createFakeQueryRunner();
    const migration = createMigration({
      name: 'TxMigration0010000000000',
      down: async () => {
        fake.calls.push('down');
      },
    });

    await revertTenantMigrationStep(fake.runner, migration, 7, migration.name!);

    expect(fake.calls[0]).toBe('startTransaction');
    expect(fake.calls.indexOf('down')).toBeGreaterThan(0);
    expect(fake.calls).toContain('commitTransaction');
  });
});
