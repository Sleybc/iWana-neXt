/**
 * Superficie de metadata TypeORM del módulo MOD11 (tasks).
 *
 * Con `autoLoadEntities: true` (apps/api/src/app.config.ts) una entidad solo
 * obtiene metadata en el DataSource del runtime si aparece en alguna de las dos
 * superficies de registro:
 *   1. `TypeOrmModule.forFeature([...])` de algún módulo de la app, o
 *   2. el array `entities` de `dataSourceOptions` (@iwana/db).
 *
 * Si un servicio de tasks persiste una entidad que no está en ninguna de las
 * dos, `EntityManager.create/save/update/findOne` lanza
 * `EntityMetadataNotFoundError` y el endpoint responde 500. Los tests unitarios
 * no lo detectan porque mockean el `EntityManager` y nunca piden metadata real.
 *
 * Esta prueba cierra ese hueco: comprueba la superficie de registro, no el
 * comportamiento mockeado.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import * as db from '@iwana/db';
import { dataSourceOptions } from '@iwana/db';

type EntityClass = Function;

const TASKS_MODULE_PATH = join(__dirname, '..', 'tasks.module.ts');

/** Lee recursivamente el código productivo del módulo (excluye specs). */
function readTasksSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readTasksSources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [readFileSync(path, 'utf8')]
      : [];
  });
}

/** Extrae los identificadores importados desde '@iwana/db' (resuelve alias `X as Y`). */
function collectDbImportedNames(sources: string[]): Set<string> {
  const names = new Set<string>();
  const importBlock = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@iwana\/db['"]/g;

  for (const source of sources) {
    for (const match of source.matchAll(importBlock)) {
      for (const specifier of (match[1] ?? '').split(',')) {
        const originalName = (specifier.trim().split(/\s+as\s+/)[0] ?? '').trim();
        if (originalName.length > 0) {
          names.add(originalName.replace(/^type\s+/, ''));
        }
      }
    }
  }

  return names;
}

/** Clases decoradas con @Entity(), según el storage global de TypeORM. */
function isEntityClass(candidate: unknown): candidate is EntityClass {
  return (
    typeof candidate === 'function' &&
    getMetadataArgsStorage().tables.some((table) => table.target === candidate)
  );
}

/**
 * Entidades declaradas en el `TypeOrmModule.forFeature` de TasksModule.
 *
 * Se lee del fuente y no del decorador porque importar `TasksModule` arrastra
 * el grafo completo de módulos de la API (auth → otplib → ESM) y rompe el
 * runner de Jest. La lista vive en un único `forFeature`, así que el escaneo es
 * determinista y la assert de abajo falla si dejara de encontrarla.
 */
function readForFeatureEntityNames(): string[] {
  const source = readFileSync(TASKS_MODULE_PATH, 'utf8');
  const forFeature = source.match(/TypeOrmModule\.forFeature\(\[([^\]]+)\]\)/);

  return (forFeature?.[1] ?? '')
    .replace(/\/\/[^\n]*/g, '') // los comentarios de la lista no son identificadores
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** Resuelve nombres exportados por @iwana/db a las clases con @Entity(). */
function resolveEntities(names: Iterable<string>): Array<readonly [string, EntityClass]> {
  const exported = db as unknown as Record<string, unknown>;

  return [...names]
    .map((name) => [name, exported[name]] as const)
    .filter((pair): pair is readonly [string, EntityClass] => isEntityClass(pair[1]));
}

describe('TasksModule — superficie de metadata TypeORM', () => {
  const usedEntities = resolveEntities(
    collectDbImportedNames(readTasksSources(join(__dirname, '..'))),
  );

  const registeredEntities = new Set<EntityClass>([
    ...resolveEntities(readForFeatureEntityNames()).map(([, entity]) => entity),
    ...((dataSourceOptions.entities ?? []) as unknown[]).filter(isEntityClass),
  ]);

  it('detecta las entidades que el código productivo de tasks persiste', () => {
    // Guarda de la propia prueba: si el escaneo dejara de encontrar entidades,
    // las asserts siguientes pasarían en vacío.
    expect(usedEntities.length).toBeGreaterThan(0);
    expect(registeredEntities.size).toBeGreaterThan(0);
  });

  it.each(usedEntities.map(([name]) => name))(
    '%s tiene metadata registrada en el runtime de la API',
    (name) => {
      const entity = usedEntities.find(([candidate]) => candidate === name)?.[1];
      expect(entity).toBeDefined();
      expect(registeredEntities.has(entity as EntityClass)).toBe(true);
    },
  );
});
