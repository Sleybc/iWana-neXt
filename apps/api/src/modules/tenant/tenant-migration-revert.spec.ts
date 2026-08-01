import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryRunner } from 'typeorm';

import {
  DESTRUCTIVE_DOWN_ENV_VAR,
  MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG,
  orderTenantRevertExecutionSteps,
  planTenantRevert,
} from '../../../../../packages/database/src/migrations/tenant/revert';
import { TENANT_MIGRATIONS } from '../../../../../packages/database/src/migrations/tenant/runner';
import { USAGE, parseArgs } from '../../../../../packages/database/src/cli/tenant-revert';

/**
 * Tests del revert de migraciones tenant (ADR-056, seguimiento).
 *
 * Mismo patrón que `migration-000-initial-tenant-schema.spec.ts`: un doble de
 * QueryRunner que registra sentencias y responde a las consultas de decisión,
 * de modo que las ramas se ejercitan de verdad y no por inspección de texto.
 *
 * La verificación contra PostgreSQL real es complementaria y vive en el
 * procedimiento operativo, no aquí.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../packages/database/src/migrations/tenant');

interface FakeQueryRunner {
  runner: QueryRunner;
  queries: string[];
  params: Array<unknown[] | undefined>;
}

function createFakeQueryRunner(applied: Array<{ id: number; name: string }>): FakeQueryRunner {
  const queries: string[] = [];
  const params: Array<unknown[] | undefined> = [];

  const query = jest.fn(async (sql: string, p?: unknown[]): Promise<unknown> => {
    queries.push(sql);
    params.push(p);

    if (sql.includes('FROM "typeorm_migrations"')) {
      return applied;
    }

    return [];
  });

  return { runner: { query } as unknown as QueryRunner, queries, params };
}

const APPLIED_DESC = [
  { id: 3, name: 'AddSubscribersTable1700000000012' },
  { id: 2, name: 'CreateExpedienteRecords1700000000001' },
  { id: 1, name: 'InitialTenantSchema1700000000000' },
];

describe('Revert de migraciones tenant — planTenantRevert', () => {
  it('por defecto selecciona una sola migración: la última aplicada', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    const plan = await planTenantRevert(fake.runner, 'tenant_demo');

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.name).toBe('AddSubscribersTable1700000000012');
    expect(plan.appliedCount).toBe(3);
  });

  it('lee el registro en orden descendente: la última aplicada es la primera revertida', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    await planTenantRevert(fake.runner, 'tenant_demo');

    const select = fake.queries.find((q) => q.includes('FROM "typeorm_migrations"'));
    expect(select).toMatch(/ORDER BY "id" DESC/);
  });

  it('con steps>1 selecciona de la más reciente hacia atrás, en ese orden', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    const plan = await planTenantRevert(fake.runner, 'tenant_demo', 3);

    expect(plan.steps.map((s) => s.name)).toEqual([
      'AddSubscribersTable1700000000012',
      'CreateExpedienteRecords1700000000001',
      'InitialTenantSchema1700000000000',
    ]);
  });

  it('asegura la tabla de registro antes de leerla', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    await planTenantRevert(fake.runner, 'tenant_demo');

    expect(fake.queries[0]).toMatch(/CREATE TABLE IF NOT EXISTS "typeorm_migrations"/);
  });

  it('un schema sin migraciones aplicadas produce un plan vacío, no un error', async () => {
    const fake = createFakeQueryRunner([]);

    const plan = await planTenantRevert(fake.runner, 'tenant_demo');

    expect(plan.steps).toEqual([]);
    expect(plan.appliedCount).toBe(0);
  });

  it('steps mayor que lo aplicado se satura: no inventa pasos', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    const plan = await planTenantRevert(fake.runner, 'tenant_demo', 99);

    expect(plan.steps).toHaveLength(3);
  });

  it('rechaza steps no entero o < 1 antes de consultar nada', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    await expect(planTenantRevert(fake.runner, 'tenant_demo', 0)).rejects.toThrow(/entero >= 1/);
    await expect(planTenantRevert(fake.runner, 'tenant_demo', 1.5)).rejects.toThrow(/entero >= 1/);
    expect(fake.queries).toEqual([]);
  });

  it('falla si el registro nombra una migración que este build no conoce', async () => {
    const fake = createFakeQueryRunner([{ id: 9, name: 'MigracionDelFuturo9999999999999' }]);

    await expect(planTenantRevert(fake.runner, 'tenant_demo')).rejects.toThrow(
      /no existe en este build/,
    );
  });

  it('el plan anuncia qué pasos exigen el flag destructivo', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    const plan = await planTenantRevert(fake.runner, 'tenant_demo', 3);

    const flagged = plan.steps.filter((s) => s.requiresDestructiveFlag).map((s) => s.name);
    expect(flagged).toEqual(['InitialTenantSchema1700000000000']);
  });

  it('el plan anuncia que 101 exige el flag destructivo', async () => {
    const fake = createFakeQueryRunner([
      { id: 101, name: 'AlignExecutionOrderEvidenceIntentRetention1010000000000' },
    ]);

    const plan = await planTenantRevert(fake.runner, 'tenant_demo');

    expect(plan.steps).toEqual([
      {
        name: 'AlignExecutionOrderEvidenceIntentRetention1010000000000',
        registryId: 101,
        requiresDestructiveFlag: true,
      },
    ]);
  });

  it('revierte 100 antes de 101 cuando el runner coordina ambos pasos', () => {
    const retentionStep = {
      name: 'AlignExecutionOrderEvidenceIntentRetention1010000000000',
      registryId: 101,
      requiresDestructiveFlag: true,
    };
    const idempotencyStep = {
      name: 'LinkExecutionOrderEvidenceIdempotency1000000000000',
      registryId: 100,
      requiresDestructiveFlag: true,
    };

    expect(orderTenantRevertExecutionSteps([retentionStep, idempotencyStep])).toEqual([
      idempotencyStep,
      retentionStep,
    ]);
  });

  it('el plan no ejecuta ningún down(): solo consulta el registro', async () => {
    const fake = createFakeQueryRunner(APPLIED_DESC);

    await planTenantRevert(fake.runner, 'tenant_demo', 3);

    const all = fake.queries.join(' ');
    expect(all).not.toMatch(/DROP TABLE/i);
    expect(all).not.toMatch(/DELETE FROM/i);
  });
});

describe('Revert de migraciones tenant — inventario del flag destructivo', () => {
  it('MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG coincide con las fuentes que leen la variable', () => {
    const detected = TENANT_MIGRATIONS.map((MigrationClass) => {
      const instance = new MigrationClass();

      return instance.name ?? MigrationClass.name;
    }).filter((name) => {
      const file = TENANT_MIGRATION_FILES.find((f) => f.source.includes(`class ${name}`));

      return Boolean(file?.source.includes(DESTRUCTIVE_DOWN_ENV_VAR));
    });

    expect(detected.sort()).toEqual([...MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG].sort());
  });

  it('cada nombre listado corresponde a una migración real de la cadena', () => {
    const known = TENANT_MIGRATIONS.map((M) => new M().name ?? M.name);

    MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG.forEach((name) => expect(known).toContain(name));
  });
});

describe('CLI de revert — parseArgs', () => {
  it('exige schema: sin él no hay valor por defecto', () => {
    expect(parseArgs([]).schema).toBeUndefined();
  });

  it('el default es una sola migración, sin dry-run y sin --yes', () => {
    const args = parseArgs(['--schema=tenant_demo']);

    expect(args).toMatchObject({ schema: 'tenant_demo', steps: 1, dryRun: false, yes: false });
  });

  it('acepta --dry-run, --yes y --steps explícitos', () => {
    const args = parseArgs(['--schema=tenant_demo', '--steps=3', '--dry-run', '--yes']);

    expect(args).toMatchObject({ schema: 'tenant_demo', steps: 3, dryRun: true, yes: true });
  });

  it('rechaza --steps no entero o < 1', () => {
    expect(() => parseArgs(['--steps=0'])).toThrow(/entero >= 1/);
    expect(() => parseArgs(['--steps=abc'])).toThrow(/entero >= 1/);
    expect(() => parseArgs(['--steps=-2'])).toThrow(/entero >= 1/);
  });

  it('rechaza argumentos desconocidos en vez de ignorarlos en silencio', () => {
    expect(() => parseArgs(['--schema=tenant_demo', '--all-tenants'])).toThrow(/no reconocido/);
    expect(() => parseArgs(['--schema=tenant_demo', '--force'])).toThrow(/no reconocido/);
  });

  it('no existe ninguna opción que fije el flag destructivo', () => {
    expect(() => parseArgs(['--allow-destructive'])).toThrow(/no reconocido/);
    expect(() => parseArgs([`--${DESTRUCTIVE_DOWN_ENV_VAR.toLowerCase()}`])).toThrow(
      /no reconocido/,
    );
  });

  it('reconoce -h y --help', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('CLI de revert — la ayuda expone el requisito del flag (encargo de ADR-056)', () => {
  it('nombra la variable de entorno', () => {
    expect(USAGE).toContain(DESTRUCTIVE_DOWN_ENV_VAR);
  });

  it('explica que el valor debe ser exactamente "true"', () => {
    expect(USAGE).toContain(`${DESTRUCTIVE_DOWN_ENV_VAR}=true`);
    expect(USAGE).toMatch(/exactamente "true"/);
  });

  it('explica POR QUE existe la guarda, no solo que existe', () => {
    expect(USAGE).toMatch(/tablas VACIAS/i);
    expect(USAGE).toMatch(/destruir el tenant/i);
  });

  it('enumera las migraciones que hoy exigen el flag', () => {
    MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG.forEach((name) => expect(USAGE).toContain(name));
  });

  it('desaconseja exportar la variable de forma permanente', () => {
    expect(USAGE).toMatch(/permanente/i);
  });

  it('redirige la baja de tenant al camino gobernado', () => {
    expect(USAGE).toContain('ADR-033');
    expect(USAGE).toContain('MARKED_FOR_DELETION');
  });

  it('deja claro que el comando opera sobre un solo schema y nunca itera', () => {
    expect(USAGE).toMatch(/nunca itera tenants/i);
    expect(USAGE).toMatch(/OBLIGATORIO/);
  });

  it('documenta dry-run y la confirmación', () => {
    expect(USAGE).toContain('--dry-run');
    expect(USAGE).toContain('--yes');
    expect(USAGE).toMatch(/teclear el nombre exacto del schema/i);
  });
});

/** Fuentes de las migraciones tenant, leídas una vez para el test de inventario. */
const TENANT_MIGRATION_FILES: Array<{ file: string; source: string }> = (() => {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');

  // Excluye .d.ts: un build que emita en src/ deja declaraciones junto al
  // fuente, y `.d.ts` también termina en `.ts`. Como ordenan antes
  // alfabéticamente, el .find() de abajo elegiría la declaración —que no lleva
  // el cuerpo del método— y el inventario saldría vacío en silencio.
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.ts$/.test(f) && !f.endsWith('.d.ts'))
    .map((file) => ({ file, source: readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8') }));
})();
