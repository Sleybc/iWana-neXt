import type { MigrationInterface } from 'typeorm';

import { TENANT_MIGRATIONS } from '../tenant/runner';
import {
  LEGACY_ORPHAN_MIGRATION_NAMES,
  PruneOrphanMigrationRegistryRows1784419211000,
} from './023_prune_orphan_migration_registry_rows';
import { PUBLIC_MIGRATIONS } from './index';

interface QueryCall {
  sql: string;
  params: unknown[] | undefined;
}

/**
 * Stub del QueryRunner: el `SELECT` devuelve las filas legacy que se le digan;
 * cualquier otra sentencia devuelve vacío.
 */
function queryRunnerStub(orphansPresent: readonly string[] = []): {
  runner: { query: jest.Mock };
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];

  const runner = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });

      if (sql.includes('SELECT')) {
        return orphansPresent.map((name) => ({ name }));
      }

      return [];
    }),
  };

  return { runner, calls };
}

function migrationName(MigrationClass: new () => MigrationInterface): string {
  return new MigrationClass().name ?? MigrationClass.name;
}

describe('023_prune_orphan_migration_registry_rows', () => {
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stderr.mockRestore();
  });

  it('conserva el nombre con timestamp de 13 dígitos posterior a la 022', () => {
    const migration = new PruneOrphanMigrationRegistryRows1784419211000();

    expect(migration.name).toBe('PruneOrphanMigrationRegistryRows1784419211000');
    // Exactamente lo que hace TypeORM en MigrationExecutor.getMigrations.
    expect(parseInt(migration.name.substr(-13), 10)).toBeGreaterThan(1784419210000);
  });

  it('la lista legacy no contiene ningún nombre vivo de PUBLIC_MIGRATIONS', () => {
    // Invariante central de esta migración: borra filas de un registro. Si un
    // nombre vivo entrara en la lista, la 023 desregistraría una migración
    // realmente aplicada y la corrida siguiente volvería a ejecutar su `up()`.
    const vivos = new Set(PUBLIC_MIGRATIONS.map(migrationName));
    const colisiones = LEGACY_ORPHAN_MIGRATION_NAMES.filter((name) => vivos.has(name));

    expect(colisiones).toEqual([]);
  });

  it('la lista legacy cubre los siete renombrados de clase del historial', () => {
    // Obtenidos recorriendo `git log --all` sobre cada archivo del directorio y
    // extrayendo todo `export class …` que haya existido, no leyendo las
    // constantes LEGACY_MIGRATION_NAME del código: cinco de los siete no la
    // tienen (solo la 020 y la 021 la declaran).
    expect([...LEGACY_ORPHAN_MIGRATION_NAMES].sort()).toEqual([
      'AddMediaAssetStatusAndClaim0200000000000',
      'AddTenantAdminEmail1700000000013',
      'AuditOwnerLeastPrivilege1700000000015',
      'EnablePgTrgm0180000000000',
      'EnforcePlatformAuditImmutability1700000000014',
      'PlatformUsersEmailHmac0210000000000',
      'RedactLeakedTemporaryPasswords1700000000012',
    ]);
  });

  it('incluye la 018, que bloquea el revert antes que la 020 por tener `id` menor', () => {
    // Registro real capturado antes del reset: id 18 (EnablePgTrgm0180000000000)
    // queda por debajo de id 22 (AddMediaAssetStatusAndClaim0200000000000). Sanear
    // solo la 22 dejaría el revert igual de atascado, un escalón más abajo.
    expect(LEGACY_ORPHAN_MIGRATION_NAMES).toContain('EnablePgTrgm0180000000000');
  });

  it('ningún nombre legacy colisiona con una migración tenant viva', () => {
    // `RedactLeakedTemporaryPasswords` existe en ambos schemas con distinto
    // sufijo. La 023 califica `"public"."typeorm_migrations"` de forma explícita,
    // así que hoy no puede alcanzar un registro tenant; esta comprobación
    // protege contra un copy-paste futuro al camino tenant.
    const tenantVivas = new Set(TENANT_MIGRATIONS.map(migrationName));
    const colisiones = LEGACY_ORPHAN_MIGRATION_NAMES.filter((name) => tenantVivas.has(name));

    expect(colisiones).toEqual([]);
  });

  it('opera siempre sobre el registro público calificado de forma explícita', async () => {
    const { runner, calls } = queryRunnerStub([...LEGACY_ORPHAN_MIGRATION_NAMES]);

    await new PruneOrphanMigrationRegistryRows1784419211000().up(runner as never);

    for (const call of calls) {
      expect(call.sql).toContain('"public"."typeorm_migrations"');
    }
  });

  it('up retira las filas legacy presentes en el registro', async () => {
    const { runner, calls } = queryRunnerStub(['AddMediaAssetStatusAndClaim0200000000000']);

    await new PruneOrphanMigrationRegistryRows1784419211000().up(runner as never);

    const del = calls.find((call) => call.sql.includes('DELETE FROM'));
    expect(del?.sql).toContain('"public"."typeorm_migrations"');
    // Se borra solo lo que el SELECT confirmó presente, no la lista entera.
    expect(del?.params).toEqual([['AddMediaAssetStatusAndClaim0200000000000']]);
  });

  it('up no emite ningún DELETE sobre un registro limpio (bootstrap y reejecución)', async () => {
    const { runner, calls } = queryRunnerStub([]);

    await new PruneOrphanMigrationRegistryRows1784419211000().up(runner as never);

    expect(calls.filter((call) => call.sql.includes('DELETE FROM'))).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('up es idempotente: la segunda pasada ya no encuentra nada que borrar', async () => {
    const migration = new PruneOrphanMigrationRegistryRows1784419211000();

    const primera = queryRunnerStub(['PlatformUsersEmailHmac0210000000000']);
    await migration.up(primera.runner as never);
    expect(primera.calls.some((call) => call.sql.includes('DELETE FROM'))).toBe(true);

    const segunda = queryRunnerStub([]);
    await migration.up(segunda.runner as never);
    expect(segunda.calls.some((call) => call.sql.includes('DELETE FROM'))).toBe(false);
  });

  it('up nunca interpola nombres en el SQL: todo va parametrizado', async () => {
    const { runner, calls } = queryRunnerStub([...LEGACY_ORPHAN_MIGRATION_NAMES]);

    await new PruneOrphanMigrationRegistryRows1784419211000().up(runner as never);

    for (const call of calls) {
      for (const name of LEGACY_ORPHAN_MIGRATION_NAMES) {
        expect(call.sql).not.toContain(name);
      }
      expect(call.params).toBeDefined();
    }
  });

  it('down no toca la base ni lanza: no debe convertirse en el nuevo bloqueo del revert', async () => {
    const { runner, calls } = queryRunnerStub([]);

    await expect(
      new PruneOrphanMigrationRegistryRows1784419211000().down(runner as never),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([]);
    expect(runner.query).not.toHaveBeenCalled();
  });
});
