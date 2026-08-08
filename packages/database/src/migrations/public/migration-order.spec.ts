import * as fs from 'fs';
import * as path from 'path';
import type { MigrationInterface } from 'typeorm';

import { PUBLIC_MIGRATIONS, resolvePublicMigrations } from './index';

/**
 * Orden de las migraciones públicas.
 *
 * Aunque `data-source.ts` ya no use glob sino la lista `PUBLIC_MIGRATIONS`, el
 * orden real lo sigue decidiendo TypeORM con `parseInt(nombreClase.substr(-13))`
 * ascendente (`MigrationExecutor.getMigrations`) — la lista no lo impone.
 *
 * Un sufijo más corto que 13 dígitos se interpreta como un timestamp mucho
 * menor y manda la migración al principio de la cola: sobre una base ya migrada
 * no se nota (es la única pendiente), pero un bootstrap limpio la ejecuta antes
 * de `001_create_public_schema` y la corrida entera falla. Le pasó a la 020 y a
 * la 021; este test cierra la puerta, y de paso vigila que la lista no se
 * desincronice del directorio.
 *
 * Corrección de una nota anterior de este archivo: `migration:revert` NO se
 * guía por el sufijo. `loadExecutedMigrations` ordena por `id` DESC y
 * `getLatestExecutedMigration` toma el primero (`MigrationExecutor.js`, 0.3.31),
 * así que el revert sigue el orden de INSERCIÓN en el registro, no el timestamp.
 * El daño real del sufijo corto no fue que el revert la ignorara, sino que al
 * renombrar la clase quedó una fila registrada sin dueño: cuando el revert llega
 * a ella, `allMigrations.find` no la resuelve y TypeORM aborta. Eso lo sanea la
 * 023 (`023_prune_orphan_migration_registry_rows`).
 */

const PUBLIC_MIGRATIONS_DIR = __dirname;

interface PublicMigration {
  file: string;
  className: string;
  timestamp: number;
}

/** `MigrationInterface.name` es opcional en el tipo; en este repo siempre está. */
function migrationName(MigrationClass: new () => MigrationInterface): string {
  return new MigrationClass().name ?? MigrationClass.name;
}

function readPublicMigrations(): PublicMigration[] {
  const files = fs
    .readdirSync(PUBLIC_MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.*\.ts$/.test(file) && !file.endsWith('.spec.ts'))
    .sort();

  return files.map((file) => {
    const source = fs.readFileSync(path.join(PUBLIC_MIGRATIONS_DIR, file), 'utf8');
    const match = source.match(/export class (\w+) implements MigrationInterface/);

    if (!match?.[1]) {
      throw new Error(`No se encontró clase de migración en ${file}`);
    }

    const className = match[1];

    return {
      file,
      className,
      // Exactamente lo que hace TypeORM en MigrationExecutor.
      timestamp: parseInt(className.substr(-13), 10),
    };
  });
}

describe('orden de migraciones públicas', () => {
  const migrations = readPublicMigrations();

  it('encuentra las migraciones públicas', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(21);
  });

  it('cada clase termina en un timestamp de 13 dígitos', () => {
    for (const migration of migrations) {
      expect({ file: migration.file, sufijo: migration.className.slice(-13) }).toEqual({
        file: migration.file,
        sufijo: expect.stringMatching(/^[1-9]\d{12}$/),
      });
    }
  });

  it('el orden que resuelve TypeORM coincide con el orden de los archivos', () => {
    const byTypeOrm = [...migrations].sort((a, b) => a.timestamp - b.timestamp);

    expect(byTypeOrm.map((migration) => migration.file)).toEqual(
      migrations.map((migration) => migration.file),
    );
  });

  it('no aparecen empates de timestamp nuevos (el único conocido, 018/019, queda congelado)', () => {
    const duplicated = migrations
      .map((migration) => migration.timestamp)
      .filter((timestamp, index, all) => all.indexOf(timestamp) !== index);

    // 018 y 019 comparten 1784419207000 desde antes de este test: el orden entre
    // ambas es indiferente (pg_trgm y una columna sin relación), pero cualquier
    // empate NUEVO sí importa. Se congela la deuda conocida en vez de ignorarla.
    expect(duplicated).toEqual([1784419207000]);
  });

  it('ningún archivo del directorio queda fuera de PUBLIC_MIGRATIONS', () => {
    // El riesgo que introduce sustituir el glob por una lista: una migración
    // nueva que nadie añade deja de aplicarse en silencio.
    const registered = PUBLIC_MIGRATIONS.map(migrationName);

    expect(registered.sort()).toEqual(migrations.map((migration) => migration.className).sort());
  });

  it('PUBLIC_MIGRATIONS está en el mismo orden que los archivos', () => {
    expect(PUBLIC_MIGRATIONS.map(migrationName)).toEqual(
      migrations.map((migration) => migration.className),
    );
  });

  it('las migraciones diferidas quedan fuera salvo que su variable esté activa', () => {
    const nombres = (env: NodeJS.ProcessEnv): string[] =>
      resolvePublicMigrations(env, () => undefined).map(migrationName);

    // 022 es el contract de SEC-P1: no debe aplicarse en la misma corrida que
    // la 021, que es la que la habilita como respaldo.
    expect(nombres({})).not.toContain('DropPlatformUsersEmailHash1784419210000');
    expect(nombres({})).toContain('PlatformUsersEmailHmac1784419209000');
    expect(nombres({ IWANA_APPLY_PII_CONTRACT: 'true' })).toContain(
      'DropPlatformUsersEmailHash1784419210000',
    );
    // El contract destructivo exige el literal exacto 'true' (fail-closed): un
    // env mal escrito ('1', 'TRUE', 'yes', 'on') debe dejar la 022 DIFERIDA, no
    // aplicar la destrucción de la vía de rollback por una ortografía tolerante.
    expect(nombres({ IWANA_APPLY_PII_CONTRACT: '1' })).not.toContain(
      'DropPlatformUsersEmailHash1784419210000',
    );
    expect(nombres({ IWANA_APPLY_PII_CONTRACT: 'TRUE' })).not.toContain(
      'DropPlatformUsersEmailHash1784419210000',
    );
    expect(nombres({ IWANA_APPLY_PII_CONTRACT: 'yes' })).not.toContain(
      'DropPlatformUsersEmailHash1784419210000',
    );
    expect(nombres({ IWANA_APPLY_PII_CONTRACT: 'on' })).not.toContain(
      'DropPlatformUsersEmailHash1784419210000',
    );
    expect(nombres({ IWANA_APPLY_PII_CONTRACT: 'false' })).not.toContain(
      'DropPlatformUsersEmailHash1784419210000',
    );
  });

  it('021 se ordena después de 020 (regresión: sufijo 0210000000000 la mandaba al inicio)', () => {
    const migration020 = migrations.find((migration) => migration.file.startsWith('020_'));
    const migration021 = migrations.find((migration) => migration.file.startsWith('021_'));

    expect(migration020?.timestamp).toBeDefined();
    expect(migration021?.timestamp).toBeDefined();
    expect(migration021!.timestamp).toBeGreaterThan(migration020!.timestamp);

    // Y, sobre todo, después de la que crea el schema: es la condición que
    // rompía el bootstrap limpio.
    const createSchema = migrations.find((migration) => migration.file.startsWith('001_'));
    expect(migration021!.timestamp).toBeGreaterThan(createSchema!.timestamp);
  });
});
