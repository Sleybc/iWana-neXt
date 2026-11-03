import type { MigrationInterface } from 'typeorm';

import { TENANT_MIGRATIONS } from './runner';

/**
 * Invariante de sufijos de la cadena tenant.
 *
 * El runner registra cada migración por su nombre (`name`, o el nombre de la clase) y la columna
 * `timestamp` de `typeorm_migrations` sale del sufijo numérico. Dos migraciones con el mismo sufijo
 * dejan dos filas con el mismo `timestamp`, y las herramientas que ordenan por esa columna no
 * distinguen cuál va primero (caso de la 170 antes de B2-R, que repetía el `000` de la 000).
 *
 * Excepciones declaradas: estas migraciones ya están registradas con su nombre en tenants reales, y el
 * runner decide por nombre, así que renombrarlas las volvería a aplicar. Dos grupos:
 * - 102–107: sufijo corto.
 * - Nombres con dígitos de versión o de título antes del sufijo (`V2`, `V1`, `Provenance12`,
 *   `CatalogTo12`): el número que el runner toma como timestamp tiene 14 dígitos. Siguen siendo únicos.
 * Cualquier migración nueva debe llevar sufijo de 13 dígitos y no aparecer aquí.
 */
const LEGACY_SHORT_SUFFIX_MIGRATIONS: ReadonlySet<string> = new Set([
  'AddVisitRequestRetryCount102',
  'CreateNonRealizationCauses103',
  'AddNonRealizationFieldsToScheduleEvents104',
  'AddVisitRequestAdditionalReason105',
  'AddScheduleEventReviewNotes106',
  'AddScheduleEventStatusExpired107',
  'SeedMod00AccessV21190000000000',
  'RemapMod00AccessV1ToV21200000000000',
  'HardenMod00AccessV1RemapProvenance12100000000000',
  'NormalizeUomToCanonicalCatalog12200000000000',
]);

function migrationName(MigrationClass: new () => MigrationInterface): string {
  return new MigrationClass().name ?? MigrationClass.name;
}

function numericSuffix(name: string): string {
  const match = name.match(/(\d+)$/);
  if (!match?.[1]) throw new Error(`La migración "${name}" no tiene sufijo numérico.`);
  return match[1];
}

describe('TENANT_MIGRATIONS: sufijos de timestamp', () => {
  const names = TENANT_MIGRATIONS.map(migrationName);

  it('no repite el sufijo numérico de ninguna migración', () => {
    const bySuffix = new Map<string, string[]>();
    for (const name of names) {
      const suffix = numericSuffix(name);
      bySuffix.set(suffix, [...(bySuffix.get(suffix) ?? []), name]);
    }
    const duplicated = [...bySuffix.values()].filter((group) => group.length > 1);

    expect(duplicated).toEqual([]);
  });

  it('todo sufijo nuevo tiene exactamente 13 dígitos', () => {
    const invalid = names.filter(
      (name) => !LEGACY_SHORT_SUFFIX_MIGRATIONS.has(name) && !/^\d{13}$/.test(numericSuffix(name)),
    );

    expect(invalid).toEqual([]);
  });

  it('la lista de excepciones legacy coincide con migraciones reales', () => {
    const missing = [...LEGACY_SHORT_SUFFIX_MIGRATIONS].filter((name) => !names.includes(name));

    expect(missing).toEqual([]);
  });
});
