import { QueryRunner } from 'typeorm';

import { ConsolidateExpedientePipeline1700000000013 } from '../../../../../../../packages/database/src/migrations/tenant/013_consolidate_expediente_pipeline';

/**
 * Tests de la Migración 013 — ConsolidateExpedientePipeline.
 *
 * Foco: la reversibilidad añadida para cumplir el merge gate de AGENTS.md
 * sobre migraciones reversibles. La lógica de consolidación de estados
 * (ADR-026 §Plan de migración) no se toca y solo se verifica que sigue intacta.
 *
 * Se ejecuta contra un QueryRunner de doble que registra las sentencias y
 * responde a las consultas de decisión, de modo que las tres ramas de down()
 * se prueban de verdad (no por inspección de texto).
 */

const BACKUP_TABLE = 'expediente_pipeline_consolidation_backup';

interface FakeState {
  /** La tabla de respaldo existe en el schema. */
  backupTableExists: boolean;
  /**
   * Filas totales en expediente_records + status_changes. `down()` ya no lo
   * consulta; se conserva porque varias pruebas verifican precisamente que un
   * schema con datos posteriores a la migración no provoca fallo.
   */
  pipelineRowCount?: number;
  /** Filas capturadas en la tabla de respaldo tras los INSERT de `up()`. */
  backupRowCount?: number;
}

interface FakeQueryRunner {
  runner: QueryRunner;
  queries: string[];
  paramsFor(fragment: string): unknown[] | undefined;
}

function createFakeQueryRunner(state: FakeState): FakeQueryRunner {
  const queries: string[] = [];
  const paramLog: Array<{ sql: string; params: unknown[] | undefined }> = [];

  const query = jest.fn(async (sql: string, params?: unknown[]): Promise<unknown> => {
    queries.push(sql);
    paramLog.push({ sql, params });

    if (sql.includes('to_regclass')) {
      return [{ present: state.backupTableExists }];
    }

    if (sql.includes('SELECT COUNT(*) FROM expediente_records')) {
      return [{ total: state.pipelineRowCount ?? 0 }];
    }

    if (sql.includes(`COUNT(*)::int AS total FROM ${BACKUP_TABLE}`)) {
      return [{ total: state.backupRowCount ?? 0 }];
    }

    // CREATE TABLE de respaldo: a partir de aquí la tabla existe.
    if (sql.includes(`CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE}`)) {
      state.backupTableExists = true;
    }

    if (sql.includes(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`)) {
      state.backupTableExists = false;
    }

    return [];
  });

  return {
    runner: { query } as unknown as QueryRunner,
    queries,
    paramsFor: (fragment: string) => paramLog.find((e) => e.sql.includes(fragment))?.params,
  };
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('Migración 013 — ConsolidateExpedientePipeline', () => {
  let migration: ConsolidateExpedientePipeline1700000000013;

  beforeEach(() => {
    migration = new ConsolidateExpedientePipeline1700000000013();
  });

  describe('up() — captura previa', () => {
    it('crea la tabla de respaldo antes de transformar ninguna fila', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);

      const createIndex = fake.queries.findIndex((q) =>
        q.includes(`CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE}`),
      );
      const firstUpdateIndex = fake.queries.findIndex((q) =>
        q.includes('UPDATE expediente_records'),
      );

      expect(createIndex).toBeGreaterThanOrEqual(0);
      expect(firstUpdateIndex).toBeGreaterThan(createIndex);
    });

    it('captura id + status + previous_status de expediente_records antes de los UPDATE', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);

      const capture = fake.queries.find(
        (q) => q.includes(`INSERT INTO ${BACKUP_TABLE}`) && q.includes("'expediente_records'"),
      );

      expect(capture).toBeDefined();
      expect(normalize(capture as string)).toContain(
        "SELECT 'expediente_records', id, status, previous_status FROM expediente_records",
      );

      const captureIndex = fake.queries.indexOf(capture as string);
      const firstUpdateIndex = fake.queries.findIndex((q) =>
        q.includes('UPDATE expediente_records'),
      );
      expect(firstUpdateIndex).toBeGreaterThan(captureIndex);
    });

    it('captura también status_changes, que up() reescribe', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);

      const capture = fake.queries.find(
        (q) => q.includes(`INSERT INTO ${BACKUP_TABLE}`) && q.includes("'status_changes'"),
      );

      expect(capture).toBeDefined();
      const captureIndex = fake.queries.indexOf(capture as string);
      const firstUpdateIndex = fake.queries.findIndex((q) => q.includes('UPDATE status_changes'));
      expect(firstUpdateIndex).toBeGreaterThan(captureIndex);
    });

    it('captura las filas cuyo estado eliminado está solo en previous_status', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);

      const capture = fake.queries.find(
        (q) => q.includes(`INSERT INTO ${BACKUP_TABLE}`) && q.includes("'expediente_records'"),
      );

      // up() reescribe previous_status residual aunque status ya sea válido:
      // esas filas también deben quedar respaldadas.
      expect(normalize(capture as string)).toContain('OR previous_status IN');
    });

    it('es idempotente: la captura no duplica filas ni la creación de tabla falla', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);

      expect(fake.queries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS'))).toBe(true);

      const captures = fake.queries.filter((q) => q.includes(`INSERT INTO ${BACKUP_TABLE}`));
      expect(captures).toHaveLength(2);
      captures.forEach((q) => {
        expect(normalize(q)).toContain('ON CONFLICT (source_table, record_id) DO NOTHING');
      });
    });

    it('no altera el mapeo de estados de ADR-026', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);

      const all = fake.queries.map(normalize).join(' | ');

      expect(all).toContain("UPDATE expediente_records SET status = 'PRECALIFICADO'");
      expect(all).toContain("WHERE status IN ('CONTACTADO', 'PENDIENTE_DATOS')");
      expect(all).toContain("UPDATE expediente_records SET status = 'VALIDANDO_COBERTURA'");
      expect(all).toContain("WHERE status = 'VIABLE_COMERCIALMENTE'");
      expect(all).toContain("UPDATE expediente_records SET status = 'EN_COTIZACION'");
      expect(all).toContain("WHERE status = 'PENDIENTE_DECISION'");
    });

    it('opera sin calificar schema: todo queda en el schema del tenant vía search_path', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);

      fake.queries.forEach((q) => {
        expect(q).not.toMatch(/public\./i);
      });
    });
  });

  describe('down() — schema nuevo (up() fue un no-op)', () => {
    it('completa limpiamente cuando existe respaldo vacío y no hay filas', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);
      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
    });

    it('NO lanza cuando no hay respaldo y las tablas del pipeline están vacías', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
    });

    it('elimina la tabla de respaldo tras revertir', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.up(fake.runner);
      await migration.down(fake.runner);

      expect(fake.queries.some((q) => q.includes(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`))).toBe(
        true,
      );
    });
  });

  describe('down() — restauración desde el respaldo', () => {
    it('restaura status y previous_status exactos de expediente_records', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: true, pipelineRowCount: 12 });

      await migration.down(fake.runner);

      const restore = fake.queries.find(
        (q) => q.includes('UPDATE expediente_records er') && q.includes(BACKUP_TABLE),
      );

      expect(restore).toBeDefined();
      const sql = normalize(restore as string);
      expect(sql).toContain('SET status = b.status, previous_status = b.previous_status');
      expect(sql).toContain("WHERE b.source_table = 'expediente_records'");
      expect(sql).toContain('er.id = b.record_id');
    });

    it('restaura from_status y to_status exactos de status_changes', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: true, pipelineRowCount: 12 });

      await migration.down(fake.runner);

      const restore = fake.queries.find(
        (q) => q.includes('UPDATE status_changes sc') && q.includes(BACKUP_TABLE),
      );

      expect(restore).toBeDefined();
      const sql = normalize(restore as string);
      expect(sql).toContain('SET from_status = b.from_status, to_status = b.to_status');
      expect(sql).toContain("WHERE b.source_table = 'status_changes'");
      expect(sql).toContain('sc.id = b.record_id');
    });

    it('no lanza aunque haya filas, porque el respaldo existe', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: true, pipelineRowCount: 5000 });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
    });
  });

  describe('down() — sin tabla de respaldo: nunca falla', () => {
    // La ausencia de respaldo significa siempre "nada que revertir": o up() no
    // capturó nada, o eliminó la tabla por quedar vacía. Ningún dato de la base
    // puede distinguir más que eso, porque tras un up() exitoso quedan cero filas
    // en estados eliminados por definición. La versión anterior contaba el total
    // de filas del pipeline y fallaba si era > 0, lo que producía un falso
    // positivo en todo tenant provisionado tras la consolidación.
    it('completa limpiamente aunque haya filas en el pipeline', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 42 });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
    });

    it('no falla con volúmenes grandes de datos posteriores a la migración', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 5000 });

      await expect(migration.down(fake.runner)).resolves.toBeUndefined();
    });

    it('no toca ninguna fila cuando no hay respaldo', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 42 });

      await migration.down(fake.runner);

      expect(fake.queries.some((q) => q.includes('UPDATE expediente_records er'))).toBe(false);
      expect(fake.queries.some((q) => q.includes('UPDATE status_changes sc'))).toBe(false);
      expect(fake.queries.some((q) => q.includes('DROP TABLE'))).toBe(false);
    });

    it('no consulta el conteo del pipeline: esa decisión ya no existe', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 42 });

      await migration.down(fake.runner);

      expect(fake.queries.some((q) => q.includes('COUNT(*) FROM expediente_records'))).toBe(false);
      expect(fake.queries.some((q) => q.includes('COUNT(*) FROM status_changes'))).toBe(false);
    });

    it('detecta la tabla de respaldo con consulta parametrizada', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: false, pipelineRowCount: 0 });

      await migration.down(fake.runner);

      expect(fake.paramsFor('to_regclass')).toEqual([BACKUP_TABLE]);
    });
  });

  describe('up() — no deja residuo cuando no hay nada que capturar', () => {
    it('elimina la tabla de respaldo si quedó vacía', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: true, backupRowCount: 0 });

      await migration.up(fake.runner);

      expect(fake.queries.some((q) => q.includes(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`))).toBe(
        true,
      );
    });

    it('conserva la tabla de respaldo si capturó filas', async () => {
      const fake = createFakeQueryRunner({ backupTableExists: true, backupRowCount: 7 });

      await migration.up(fake.runner);

      expect(fake.queries.some((q) => q.includes(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`))).toBe(
        false,
      );
    });
  });
});
