import type { MigrationInterface } from 'typeorm';

import { dataSourceOptions } from './data-source';
import { PUBLIC_MIGRATIONS, resolvePublicMigrations } from './migrations/public';
import { publicRevertDataSourceOptions, PublicRevertDataSource } from './revert-data-source';

/**
 * El `DataSource` de revert existe para un solo motivo: que una migración
 * DIFERIDA que ya se aplicó siga siendo resoluble cuando el operador retira su
 * variable de entorno — que es exactamente lo que el runbook le ordena hacer al
 * cerrar la ventana 2 del expand/contract.
 *
 * Sin esto, `MigrationExecutor.undoLastMigration` no encuentra la clase de la
 * fila más reciente del registro y lanza `TypeORMError`, dejando el revert
 * público atascado de forma permanente.
 */

const CONTRACT_MIGRATION = 'DropPlatformUsersEmailHash1784419210000';
const CONTRACT_ENV_VAR = 'IWANA_APPLY_PII_CONTRACT';

function migrationName(MigrationClass: new () => MigrationInterface): string {
  return new MigrationClass().name ?? MigrationClass.name;
}

function namesOf(migrations: unknown): string[] {
  return (migrations as (new () => MigrationInterface)[]).map(migrationName);
}

describe('DataSource de revert público', () => {
  it('usa la lista íntegra, no la filtrada por diferimiento', () => {
    // El test que impide la regresión: si alguien vuelve a apuntar el revert a
    // `resolvePublicMigrations()`, esta identidad se rompe.
    expect(publicRevertDataSourceOptions.migrations).toBe(PUBLIC_MIGRATIONS);
  });

  it('contiene el contract diferido aunque su variable no esté activa', () => {
    // Escenario que hoy bricaba el revert: 022 aplicada (fila de `id` más alto
    // del registro) + `IWANA_APPLY_PII_CONTRACT` retirada del entorno.
    expect(namesOf(publicRevertDataSourceOptions.migrations)).toContain(CONTRACT_MIGRATION);
  });

  it('el camino de run sigue excluyendo el contract con el entorno limpio', () => {
    // Se evalúa con un env explícito, no con el ambiental: el comportamiento de
    // `run` no debe cambiar por añadir el DataSource de revert.
    const enRun = resolvePublicMigrations({}, () => undefined).map(migrationName);

    expect(enRun).not.toContain(CONTRACT_MIGRATION);
    expect(namesOf(publicRevertDataSourceOptions.migrations)).toEqual(
      expect.arrayContaining(enRun),
    );
  });

  it('el camino de run sí aplica el contract cuando la ventana 2 está abierta', () => {
    const enRun = resolvePublicMigrations({ [CONTRACT_ENV_VAR]: 'true' }, () => undefined).map(
      migrationName,
    );

    expect(enRun).toContain(CONTRACT_MIGRATION);
    // Con la ventana abierta ambas listas coinciden: el revert nunca es un
    // subconjunto del run, solo puede ser igual o mayor.
    expect(enRun).toEqual(namesOf(publicRevertDataSourceOptions.migrations));
  });

  it('hereda la conexión del DataSource principal sin reescribirla', () => {
    // Un revert que se conectara a otra base o a otra tabla de registro sería
    // peor que no tener revert.
    const { migrations: _revertMigrations, ...revertConexion } = publicRevertDataSourceOptions;
    const { migrations: _runMigrations, ...runConexion } = dataSourceOptions;

    expect(revertConexion).toEqual(runConexion);
    expect(publicRevertDataSourceOptions.migrationsTableName).toBe('typeorm_migrations');
  });

  it('exporta exactamente un DataSource: lo exige CommandUtils.loadDataSource', async () => {
    // `loadDataSource` recorre los exports del archivo y falla si encuentra cero
    // o más de una instancia de DataSource. Reexportar `AppDataSource` desde
    // aquí rompería el CLI con un error críptico en tiempo de ejecución.
    const moduleExports = (await import('./revert-data-source')) as Record<string, unknown>;
    const dataSources = Object.values(moduleExports).filter(
      (value) => value instanceof Object && value.constructor?.name === 'DataSource',
    );

    expect(dataSources).toHaveLength(1);
    expect(dataSources[0]).toBe(PublicRevertDataSource);
  });
});
