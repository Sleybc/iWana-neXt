import { DataSource } from 'typeorm';

import {
  assertTenantMigrationParity,
  computeExpectedTenantMigrationNames,
  computeMigrationParityReport,
  computeNonActiveTenantParityReport,
  loadNonActiveTenantSnapshots,
  loadTenantMigrationSnapshots,
} from './migration-parity.util';
import type { DeferrableMigration } from '../shared/deferred-migration.util';

function mockDataSource(
  namesBySchema: Record<string, string[]>,
  opts: { nonActive?: string[]; withoutMigrationsTable?: string[] } = {},
): DataSource {
  const nonActive = opts.nonActive ?? [];
  const withoutTable = new Set(opts.withoutMigrationsTable ?? []);
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('public.tenants') && sql.includes("status <> 'ACTIVE'")) {
        return nonActive.map((schemaName) => ({ schema_name: schemaName }));
      }
      if (sql.includes('public.tenants')) {
        return Object.keys(namesBySchema)
          .filter((schemaName) => !nonActive.includes(schemaName))
          .map((schemaName) => ({ schema_name: schemaName }));
      }
      if (sql.includes('information_schema.tables')) {
        const match = sql.match(/table_schema = '([^']+)'/);
        const schemaName = match?.[1] ?? '';
        return [{ exists: !withoutTable.has(schemaName) }];
      }
      const match = sql.match(/FROM "([^"]+)"\."typeorm_migrations"/);
      const schemaName = match?.[1] ?? '';
      return (namesBySchema[schemaName] ?? []).map((name) => ({ name }));
    }),
  } as never as DataSource;
}

/** Catálogo de migraciones mock para los tests de assert (evita cargar TENANT_MIGRATIONS). */
function mockMigrationClasses(
  names: string[],
): readonly (new () => DeferrableMigration & { name?: string })[] {
  return names.map(
    (name) =>
      class {
        name = name;
      },
  ) as unknown as (new () => DeferrableMigration & { name?: string })[];
}

describe('computeMigrationParityReport', () => {
  it('reporta ok=true cuando todos los tenants tienen el mismo conjunto', () => {
    const snapshots = [
      { schemaName: 'tenant_a', names: ['M1', 'M2'] },
      { schemaName: 'tenant_b', names: ['M2', 'M1'] },
      { schemaName: 'tenant_c', names: ['M1', 'M2'] },
    ];

    const report = computeMigrationParityReport(snapshots);

    expect(report.ok).toBe(true);
    expect(report.baselineSchema).toBe('tenant_a');
    expect(report.divergences).toEqual([]);
  });

  it('reporta divergencias cuando un tenant tiene migraciones de menos o de más', () => {
    const snapshots = [
      { schemaName: 'tenant_a', names: ['M1', 'M2', 'M3'] },
      { schemaName: 'tenant_b', names: ['M1', 'M2'] }, // le falta M3
      { schemaName: 'tenant_c', names: ['M1', 'M2', 'M3', 'M4'] }, // tiene M4 de más
    ];

    const report = computeMigrationParityReport(snapshots);

    expect(report.ok).toBe(false);
    expect(report.divergences).toHaveLength(2);
    expect(report.divergences.find((d) => d.schemaName === 'tenant_b')?.missing).toEqual(['M3']);
    expect(report.divergences.find((d) => d.schemaName === 'tenant_c')?.extra).toEqual(['M4']);
  });

  it('reporta ok=true cuando no hay tenants ACTIVE', () => {
    const report = computeMigrationParityReport([]);

    expect(report.ok).toBe(true);
    expect(report.tenants).toEqual([]);
  });

  it('detecta el fallo uniforme: todos los tenants sin una migración esperada por el código (F-2)', () => {
    const snapshots = [
      { schemaName: 'tenant_a', names: ['M1'] },
      { schemaName: 'tenant_b', names: ['M1'] },
    ];

    const report = computeMigrationParityReport(snapshots, ['M1', 'M2']);

    expect(report.ok).toBe(false);
    expect(report.divergences).toHaveLength(2);
    expect(report.divergences.every((d) => d.missing.includes('M2'))).toBe(true);
  });

  it('reporta migraciones que el código ya no conoce como extra (F-2)', () => {
    const snapshots = [
      { schemaName: 'tenant_a', names: ['M1', 'M2'] },
      { schemaName: 'tenant_b', names: ['M1', 'M2'] },
    ];

    const report = computeMigrationParityReport(snapshots, ['M1']);

    expect(report.ok).toBe(false);
    expect(report.divergences.every((d) => d.extra.includes('M2'))).toBe(true);
  });
});

describe('computeExpectedTenantMigrationNames', () => {
  const classes = mockMigrationClasses(['M1', 'M2']);

  it('espera todas las migraciones no diferidas', () => {
    const expected = computeExpectedTenantMigrationNames([], classes, {});

    expect(expected).toEqual(['M1', 'M2']);
  });

  it('excluye la diferida pendiente (aún no aplicada)', () => {
    const classesWithDeferred = [
      ...mockMigrationClasses(['M1']),
      class {
        name = 'M2';
        deferredBy = 'IWANA_APPLY_PII_CONTRACT';
      },
    ] as readonly (new () => DeferrableMigration & { name?: string })[];

    const expected = computeExpectedTenantMigrationNames([], classesWithDeferred, {});

    expect(expected).toEqual(['M1']);
  });

  it('incluye la diferida ya aplicada en el baseline (no es un hueco)', () => {
    const classesWithDeferred = [
      ...mockMigrationClasses(['M1']),
      class {
        name = 'M2';
        deferredBy = 'IWANA_APPLY_PII_CONTRACT';
      },
    ] as readonly (new () => DeferrableMigration & { name?: string })[];

    const expected = computeExpectedTenantMigrationNames(['M2'], classesWithDeferred, {});

    expect(expected).toEqual(['M1', 'M2']);
  });
});

describe('loadTenantMigrationSnapshots', () => {
  it('carga las migraciones de cada tenant ACTIVE', async () => {
    const dataSource = mockDataSource({
      tenant_a: ['M1', 'M2'],
      tenant_b: ['M1'],
    });

    const snapshots = await loadTenantMigrationSnapshots(dataSource);

    expect(snapshots).toEqual([
      { schemaName: 'tenant_a', names: ['M1', 'M2'] },
      { schemaName: 'tenant_b', names: ['M1'] },
    ]);
  });

  it('aborta si un schema de public.tenants no es un schema de tenant válido', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('public.tenants')) {
          return [{ schema_name: 'pg_catalog' }];
        }
        return [];
      }),
    } as never as DataSource;

    await expect(loadTenantMigrationSnapshots(dataSource)).rejects.toThrow(
      /schema inválido en public\.tenants/,
    );
  });
});

describe('computeNonActiveTenantParityReport', () => {
  const reference = ['M1', 'M2', 'M3'];

  it('reporta cero no-ACTIVE cuando no hay snapshots', () => {
    const report = computeNonActiveTenantParityReport([], reference);

    expect(report.count).toBe(0);
    expect(report.diverging).toBe(0);
    expect(report.withoutMigrationRecord).toBe(0);
  });

  it('no marca como divergente a un no-ACTIVE alineado con la flota ACTIVE', () => {
    const report = computeNonActiveTenantParityReport(
      [{ schemaName: 'tenant_susp', names: ['M1', 'M2', 'M3'] }],
      reference,
    );

    expect(report.count).toBe(1);
    expect(report.diverging).toBe(0);
    expect(report.snapshots[0]?.diverges).toBe(false);
  });

  it('marca como divergente a un no-ACTIVE rezagado (missing)', () => {
    const report = computeNonActiveTenantParityReport(
      [{ schemaName: 'tenant_susp', names: ['M1'] }],
      reference,
    );

    expect(report.diverging).toBe(1);
    expect(report.snapshots[0]?.missing).toEqual(['M2', 'M3']);
  });

  it('marca como divergente a un no-ACTIVE con migraciones de más', () => {
    const report = computeNonActiveTenantParityReport(
      [{ schemaName: 'tenant_susp', names: ['M1', 'M2', 'M3', 'M4'] }],
      reference,
    );

    expect(report.diverging).toBe(1);
    expect(report.snapshots[0]?.extra).toEqual(['M4']);
  });

  it('cuenta "sin registro de migraciones" (typeorm_migrations ausente) como divergente informativo', () => {
    const report = computeNonActiveTenantParityReport(
      [{ schemaName: 'tenant_prov', names: null }],
      reference,
    );

    expect(report.diverging).toBe(1);
    expect(report.withoutMigrationRecord).toBe(1);
    expect(report.snapshots[0]?.names).toBeNull();
  });
});

describe('loadNonActiveTenantSnapshots', () => {
  it('carga el conjunto de migraciones de cada tenant no-ACTIVE', async () => {
    const dataSource = mockDataSource(
      {
        tenant_secp1_a: ['M1', 'M2'],
        tenant_secp1_b: ['M1', 'M2'],
        tenant_susp: ['M1', 'M2'],
        tenant_markdel: ['M1'],
      },
      { nonActive: ['tenant_susp', 'tenant_markdel'] },
    );

    const report = await loadNonActiveTenantSnapshots(dataSource, ['M1', 'M2']);

    expect(report.count).toBe(2);
    expect(report.snapshots.find((s) => s.schemaName === 'tenant_susp')?.names).toEqual([
      'M1',
      'M2',
    ]);
    // tenant_markdel quedó rezagado (le falta M2).
    expect(report.diverging).toBe(1);
    expect(report.snapshots.find((s) => s.schemaName === 'tenant_markdel')?.missing).toEqual([
      'M2',
    ]);
  });

  it('tolera un no-ACTIVE sin tabla typeorm_migrations como "sin registro"', async () => {
    const dataSource = mockDataSource(
      {},
      { nonActive: ['tenant_prov'], withoutMigrationsTable: ['tenant_prov'] },
    );

    const report = await loadNonActiveTenantSnapshots(dataSource, ['M1']);

    expect(report.withoutMigrationRecord).toBe(1);
    expect(report.snapshots[0]?.names).toBeNull();
  });

  it('aborta si un schema no-ACTIVE de public.tenants no es un schema de tenant válido', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('public.tenants')) {
          return [{ schema_name: 'pg_catalog' }];
        }
        return [];
      }),
    } as never as DataSource;

    await expect(loadNonActiveTenantSnapshots(dataSource, ['M1'])).rejects.toThrow(
      /schema inválido en public\.tenants/,
    );
  });
});

describe('assertTenantMigrationParity', () => {
  it('registra OK y no lanza cuando la flota es uniforme y alineada con el código', async () => {
    const dataSource = mockDataSource({
      tenant_a: ['M1', 'M2'],
      tenant_b: ['M1', 'M2'],
    });
    const log = jest.fn();

    const report = await assertTenantMigrationParity(dataSource, {
      log,
      migrationClasses: mockMigrationClasses(['M1', 'M2']),
    });

    expect(report.ok).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Paridad de migraciones OK: 2 tenant(s) ACTIVE'),
    );
  });

  it('lanza con detalle accionable cuando la flota es mixta', async () => {
    const dataSource = mockDataSource({
      tenant_a: ['M1', 'M2'],
      tenant_b: ['M1'],
    });

    await expect(
      assertTenantMigrationParity(dataSource, {
        migrationClasses: mockMigrationClasses(['M1', 'M2']),
      }),
    ).rejects.toThrow(
      /Paridad de migraciones ROTA.*tenant_b.*faltantes=\[M2\].*No arrancar API\/portal\/worker/,
    );
  });

  it('lanza ante fallo uniforme: ninguna corrida aplicó una migración esperada (F-2)', async () => {
    const dataSource = mockDataSource({
      tenant_a: ['M1'],
      tenant_b: ['M1'],
    });

    await expect(
      assertTenantMigrationParity(dataSource, {
        migrationClasses: mockMigrationClasses(['M1', 'M2']),
      }),
    ).rejects.toThrow(/esperado=2 del código.*faltantes=\[M2\]/);
  });

  it('admite un catálogo sin migraciones diferidas pendientes sin lanzar', async () => {
    const dataSource = mockDataSource({
      tenant_a: ['M1'],
      tenant_b: ['M1'],
    });

    const report = await assertTenantMigrationParity(dataSource, {
      migrationClasses: mockMigrationClasses(['M1']),
    });

    expect(report.ok).toBe(true);
  });

  it('advierte (sin fallar) cuando un no-ACTIVE está rezagado y la flota ACTIVE es uniforme', async () => {
    const dataSource = mockDataSource(
      { tenant_a: ['M1', 'M2'], tenant_b: ['M1', 'M2'] },
      { nonActive: ['tenant_susp'] },
    );
    const log = jest.fn();

    const report = await assertTenantMigrationParity(dataSource, {
      log,
      migrationClasses: mockMigrationClasses(['M1', 'M2']),
    });

    expect(report.ok).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Aviso: 1 schema(s) no-ACTIVE; 1 con migraciones distintas'),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('tenant_susp'));
  });

  it('advierte sobre un no-ACTIVE sin tabla typeorm_migrations sin fallar la corrida', async () => {
    const dataSource = mockDataSource(
      { tenant_a: ['M1', 'M2'] },
      { nonActive: ['tenant_prov'], withoutMigrationsTable: ['tenant_prov'] },
    );
    const log = jest.fn();

    const report = await assertTenantMigrationParity(dataSource, {
      log,
      migrationClasses: mockMigrationClasses(['M1', 'M2']),
    });

    expect(report.ok).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('typeorm_migrations'));
  });

  it('no emite aviso no-ACTIVE cuando no hay tenants no-ACTIVE', async () => {
    const dataSource = mockDataSource({ tenant_a: ['M1', 'M2'] });
    const log = jest.fn();

    await assertTenantMigrationParity(dataSource, {
      log,
      migrationClasses: mockMigrationClasses(['M1', 'M2']),
    });

    expect(log.mock.calls.some(([message]) => String(message).includes('no-ACTIVE'))).toBe(false);
  });
});
