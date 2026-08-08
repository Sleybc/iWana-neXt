import * as fs from 'fs';
import * as path from 'path';
import type { MigrationInterface } from 'typeorm';

import { TENANT_MIGRATIONS } from './runner';

/**
 * Orden y completitud de las migraciones tenant.
 *
 * Contraparte de `migrations/public/migration-order.spec.ts`, con una diferencia
 * de fondo que cambia qué se puede afirmar aquí:
 *
 * El camino tenant NO usa `MigrationExecutor`. `applyTenantMigrationsInOrder`
 * recorre `TENANT_MIGRATIONS` en **orden de array** y aplica lo que falte, y
 * `planTenantRevert` ordena por `id` del registro. El sufijo numérico solo
 * alimenta la columna `timestamp` (vía `extractMigrationTimestamp`), que no
 * decide nada. Por eso aquí NO se exige sufijo de 13 dígitos: las migraciones
 * 102–107 se registraron con sufijo corto (`...102`) y para este runner es
 * inocuo, a diferencia de lo que le pasó a la 020/021 públicas.
 *
 * Lo que sí importa, y es lo que este spec cierra:
 *
 * 1. Que ningún archivo del directorio quede fuera del array. Es el riesgo real
 *    de una lista escrita a mano: una migración nueva que nadie añade **no se
 *    aplica nunca**, en silencio, y ninguna otra comprobación lo detecta.
 * 2. Que el array vaya en el mismo orden que los archivos: el orden de array ES
 *    el orden de ejecución, y una migración adelantada a su dependencia falla en
 *    la primera corrida limpia.
 * 3. Que no haya nombres duplicados: `applyTenantMigrationsInOrder` descarta por
 *    nombre (`appliedNames.has`), así que un duplicado dejaría la segunda sin
 *    aplicar.
 * 4. Que todo nombre termine en dígitos, que es lo que `extractMigrationTimestamp`
 *    exige y sin lo cual la migración revienta al registrarse.
 *
 * LIMITACIÓN CONOCIDA (declarada, no perseguida): el escaneo asume el patrón de
 * archivo `NNN_*.ts` y detecta la clase con una expresión regular sobre el
 * fuente. Un archivo con otra nomenclatura, o una clase con cláusula
 * `implements MigrationInterface, X`, quedarían fuera del escaneo — es decir, la
 * red tiene el mismo agujero que la convención que vigila. Se acepta: cerrar eso
 * exigiría cargar el AST, y la convención está estabilizada en 106 archivos.
 */

const TENANT_MIGRATIONS_DIR = __dirname;

interface TenantMigrationFile {
  file: string;
  className: string;
}

function migrationName(MigrationClass: new () => MigrationInterface): string {
  return new MigrationClass().name ?? MigrationClass.name;
}

function readTenantMigrationFiles(): TenantMigrationFile[] {
  const files = fs
    .readdirSync(TENANT_MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.*\.ts$/.test(file) && !file.endsWith('.spec.ts'))
    .sort();

  return files.map((file) => {
    const source = fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, file), 'utf8');
    // `[\s\S]*?` y no `\s*`: la 007 parte la cláusula `implements` en otra línea
    // (formato de Prettier cuando el nombre de clase es largo).
    const match = source.match(/export class (\w+)[\s\S]{0,40}?implements MigrationInterface/);

    if (!match?.[1]) {
      throw new Error(`No se encontró clase de migración en ${file}`);
    }

    return { file, className: match[1] };
  });
}

describe('orden y completitud de migraciones tenant', () => {
  const archivos = readTenantMigrationFiles();

  it('encuentra las migraciones tenant del directorio', () => {
    expect(archivos.length).toBeGreaterThanOrEqual(100);
  });

  it('ningún archivo del directorio queda fuera de TENANT_MIGRATIONS', () => {
    // El riesgo central de una lista escrita a mano: lo que no está en el array
    // no se aplica, y nada lo denuncia.
    const registradas = TENANT_MIGRATIONS.map(migrationName);

    expect(registradas.slice().sort()).toEqual(archivos.map((archivo) => archivo.className).sort());
  });

  it('TENANT_MIGRATIONS está en el mismo orden que los archivos', () => {
    // El orden del array ES el orden de ejecución del runner tenant.
    expect(TENANT_MIGRATIONS.map(migrationName)).toEqual(
      archivos.map((archivo) => archivo.className),
    );
  });

  it('no hay nombres duplicados', () => {
    const nombres = TENANT_MIGRATIONS.map(migrationName);
    const duplicados = nombres.filter((nombre, index) => nombres.indexOf(nombre) !== index);

    expect(duplicados).toEqual([]);
  });

  it('cada nombre termina en dígitos: extractMigrationTimestamp lo exige', () => {
    // `runner.ts` lanza al registrar si el nombre no tiene sufijo numérico, y lo
    // haría a mitad de una corrida real contra un schema de tenant.
    for (const MigrationClass of TENANT_MIGRATIONS) {
      const nombre = migrationName(MigrationClass);

      expect({ nombre, tieneSufijo: /\d+$/.test(nombre) }).toEqual({ nombre, tieneSufijo: true });
    }
  });

  it('el nombre declarado coincide con el nombre de la clase', () => {
    // Divergir aquí registraría en `typeorm_migrations` un nombre que
    // `migrationClassByName` (revert) no sabría resolver.
    for (const MigrationClass of TENANT_MIGRATIONS) {
      expect(migrationName(MigrationClass)).toBe(MigrationClass.name);
    }
  });
});
