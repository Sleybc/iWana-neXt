import { QueryRunner } from 'typeorm';

import { InitialTenantSchema1700000000000 } from '../../../../../packages/database/src/migrations/tenant/000_initial_tenant_schema';

/**
 * Tests de la Migración 000 — InitialTenantSchema.
 *
 * Foco: la reversibilidad añadida para cumplir el merge gate de AGENTS.md sobre
 * migraciones reversibles (antes `down()` lanzaba incondicionalmente). La creación
 * de estructura de `up()` no se toca; solo se verifica que el inventario que
 * `down()` elimina coincide exactamente con lo que `up()` crea.
 *
 * Igual que en la 013, se ejecuta contra un QueryRunner de doble que registra las
 * sentencias y responde a las consultas de decisión, de modo que las ramas de
 * `down()` se prueban de verdad y no por inspección de texto.
 */

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/** Orden inverso de creación esperado. */
const EXPECTED_DROP_ORDER = [
  'plan_catalog_items',
  'coverage_zones',
  'commercial_nodes',
  'audit_logs',
  'refresh_tokens',
  'users',
];

interface FakeState {
  /** Tablas presentes en el schema. Por defecto, las seis que crea up(). */
  existingTables: Set<string>;
  /** Filas por tabla; ausente = 0. */
  rowCounts: Record<string, number>;
}

interface FakeQueryRunner {
  runner: QueryRunner;
  queries: string[];
  paramsFor(fragment: string): unknown[] | undefined;
}

function createFakeQueryRunner(state: Partial<FakeState> = {}): FakeQueryRunner {
  const existingTables = state.existingTables ?? new Set(EXPECTED_DROP_ORDER);
  const rowCounts = state.rowCounts ?? {};
  const queries: string[] = [];
  const paramLog: Array<{ sql: string; params: unknown[] | undefined }> = [];

  const query = jest.fn(async (sql: string, params?: unknown[]): Promise<unknown> => {
    queries.push(sql);
    paramLog.push({ sql, params });

    if (sql.includes('to_regclass')) {
      const table = params?.[0] as string;
      return [{ present: existingTables.has(table) }];
    }

    const countMatch = sql.match(/SELECT COUNT\(\*\)::int AS total FROM (\w+)/);
    if (countMatch) {
      return [{ total: rowCounts[countMatch[1] as string] ?? 0 }];
    }

    const dropMatch = sql.match(/DROP TABLE IF EXISTS (\w+)/);
    if (dropMatch) {
      existingTables.delete(dropMatch[1] as string);
    }

    return [];
  });

  return {
    runner: { query } as unknown as QueryRunner,
    queries,
    paramsFor: (fragment: string) => paramLog.find((e) => e.sql.includes(fragment))?.params,
  };
}

function droppedTables(queries: string[]): string[] {
  return queries
    .map((q) => q.match(/DROP TABLE IF EXISTS (\w+)/)?.[1])
    .filter((t): t is string => Boolean(t));
}

describe('Migración 000 — InitialTenantSchema', () => {
  let migration: InitialTenantSchema1700000000000;
  const originalFlag = process.env[DESTRUCTIVE_DOWN_ENV_VAR];

  beforeEach(() => {
    migration = new InitialTenantSchema1700000000000();
    delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
  });

  afterAll(() => {
    if (originalFlag === undefined) {
      delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    } else {
      process.env[DESTRUCTIVE_DOWN_ENV_VAR] = originalFlag;
    }
  });

  describe('inventario: down() cubre exactamente lo que up() crea', () => {
    it('up() crea las seis tablas que down() elimina, y ninguna más', async () => {
      const fake = createFakeQueryRunner();

      await migration.up(fake.runner);

      const created = fake.queries
        .map((q) => q.match(/CREATE TABLE (\w+)/)?.[1])
        .filter((t): t is string => Boolean(t));

      expect(created.sort()).toEqual([...EXPECTED_DROP_ORDER].sort());
    });

    it('up() no crea tipos, funciones ni triggers que down() tendría que soltar aparte', async () => {
      const fake = createFakeQueryRunner();

      await migration.up(fake.runner);

      const all = fake.queries.join(' ');
      expect(all).not.toMatch(/CREATE\s+TYPE/i);
      expect(all).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION/i);
      expect(all).not.toMatch(/CREATE\s+TRIGGER/i);
      expect(all).not.toMatch(/CREATE\s+SEQUENCE/i);
      expect(all).not.toMatch(/CREATE\s+(MATERIALIZED\s+)?VIEW/i);
      expect(all).not.toMatch(/CREATE\s+EXTENSION/i);
    });

    it('up() no crea el schema: eso es responsabilidad del provisioning', async () => {
      const fake = createFakeQueryRunner();

      await migration.up(fake.runner);

      expect(fake.queries.join(' ')).not.toMatch(/CREATE\s+SCHEMA/i);
    });

    it('los índices y la política RLS cuelgan de tablas que down() elimina', async () => {
      const fake = createFakeQueryRunner();

      await migration.up(fake.runner);

      const indexTargets = fake.queries
        .map((q) => q.match(/CREATE INDEX \w+ ON (\w+)/)?.[1])
        .filter((t): t is string => Boolean(t));

      expect(indexTargets.length).toBeGreaterThan(0);
      indexTargets.forEach((t) => expect(EXPECTED_DROP_ORDER).toContain(t));

      const policyTarget = fake.queries
        .map((q) => q.match(/CREATE POLICY \w+ ON (\w+)/)?.[1])
        .find(Boolean);
      expect(policyTarget).toBe('audit_logs');
    });
  });

  describe('down() — schema vacío (reversión legítima)', () => {
    it('no lanza y elimina las seis tablas', async () => {
      const fake = createFakeQueryRunner();

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
      expect(droppedTables(fake.queries)).toEqual(EXPECTED_DROP_ORDER);
    });

    it('elimina en orden inverso al de creación', async () => {
      const upFake = createFakeQueryRunner();
      await migration.up(upFake.runner);
      const created = upFake.queries
        .map((q) => q.match(/CREATE TABLE (\w+)/)?.[1])
        .filter((t): t is string => Boolean(t));

      const downFake = createFakeQueryRunner();
      await migration.down(downFake.runner);

      expect(droppedTables(downFake.queries)).toEqual([...created].reverse());
    });

    it('usa IF EXISTS para poder completar un down() aplicado a medias', async () => {
      const fake = createFakeQueryRunner({
        existingTables: new Set(['users', 'refresh_tokens']),
      });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();

      // Emite el DROP de las seis igualmente; IF EXISTS absorbe las ya soltadas.
      expect(droppedTables(fake.queries)).toEqual(EXPECTED_DROP_ORDER);
      fake.queries
        .filter((q) => q.includes('DROP TABLE'))
        .forEach((q) => expect(q).toContain('IF EXISTS'));
    });

    it('no usa CASCADE: una dependencia futura debe fallar de forma ruidosa', async () => {
      const fake = createFakeQueryRunner();

      await migration.down(fake.runner);

      fake.queries
        .filter((q) => q.includes('DROP TABLE'))
        .forEach((q) => expect(q).not.toMatch(/CASCADE/i));
    });

    it('opera sin calificar schema: solo el schema del tenant vía search_path', async () => {
      const fake = createFakeQueryRunner();

      await migration.down(fake.runner);

      fake.queries.forEach((q) => {
        expect(q).not.toMatch(/public\./i);
        expect(q).not.toMatch(/DROP\s+SCHEMA/i);
      });
    });

    it('detecta la existencia de cada tabla con consulta parametrizada', async () => {
      const fake = createFakeQueryRunner();

      await migration.down(fake.runner);

      expect(fake.paramsFor('to_regclass')).toEqual(['plan_catalog_items']);
    });
  });

  describe('down() — guarda contra el disparo accidental', () => {
    it('lanza cuando alguna tabla contiene datos de negocio', async () => {
      const fake = createFakeQueryRunner({ rowCounts: { users: 37 } });

      await expect(migration.down(fake.runner)).rejects.toThrow(
        /Rollback de InitialTenantSchema bloqueado/,
      );
    });

    it('NO elimina ninguna tabla antes de fallar', async () => {
      const fake = createFakeQueryRunner({ rowCounts: { users: 37 } });

      await migration.down(fake.runner).catch(() => undefined);

      expect(droppedTables(fake.queries)).toEqual([]);
    });

    it('el mensaje es accionable: qué hay, por qué se bloquea, y las salidas', async () => {
      const fake = createFakeQueryRunner({ rowCounts: { users: 37, audit_logs: 1200 } });

      const error = await migration.down(fake.runner).catch((e: Error) => e);
      const message = (error as Error).message;

      // Diagnóstico concreto, tabla por tabla
      expect(message).toContain('users=37');
      expect(message).toContain('audit_logs=1200');
      // Por qué no es una reversión
      expect(message).toContain('up() creó estas tablas vacías');
      // Camino gobernado para dar de baja un tenant
      expect(message).toContain('ADR-033');
      expect(message).toContain('MARKED_FOR_DELETION');
      // Escape hatch explícito
      expect(message).toContain(DESTRUCTIVE_DOWN_ENV_VAR);
      // A quién escalar
      expect(message).toContain('PLAT-OPS');
    });

    it('la guarda solo mira las tablas que aún existen', async () => {
      // users ya fue soltada en un down() previo interrumpido; su conteo no debe consultarse.
      const fake = createFakeQueryRunner({
        existingTables: new Set(['plan_catalog_items']),
        rowCounts: { users: 37 },
      });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
      expect(fake.queries.some((q) => q.includes('COUNT(*)::int AS total FROM users'))).toBe(false);
    });

    it('no se dispara con tablas presentes pero vacías', async () => {
      const fake = createFakeQueryRunner({ rowCounts: { users: 0, audit_logs: 0 } });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
    });
  });

  describe('down() — escape hatch explícito', () => {
    it('con el flag activo revierte aunque haya datos', async () => {
      process.env[DESTRUCTIVE_DOWN_ENV_VAR] = 'true';
      const fake = createFakeQueryRunner({ rowCounts: { users: 37, audit_logs: 1200 } });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
      expect(droppedTables(fake.queries)).toEqual(EXPECTED_DROP_ORDER);
    });

    it('con el flag activo ni siquiera consulta los conteos', async () => {
      process.env[DESTRUCTIVE_DOWN_ENV_VAR] = 'true';
      const fake = createFakeQueryRunner({ rowCounts: { users: 37 } });

      await migration.down(fake.runner);

      expect(fake.queries.some((q) => q.includes('to_regclass'))).toBe(false);
    });

    it('exige el valor exacto "true": ningún valor ambiguo abre la puerta', async () => {
      for (const value of ['1', 'TRUE', 'yes', 'si', '', 'false']) {
        process.env[DESTRUCTIVE_DOWN_ENV_VAR] = value;
        const fake = createFakeQueryRunner({ rowCounts: { users: 1 } });

        await expect(migration.down(fake.runner)).rejects.toThrow(
          /Rollback de InitialTenantSchema bloqueado/,
        );
      }
    });
  });
});
