import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MigrationInterface } from 'typeorm';
import { TENANT_MIGRATIONS } from '@iwana/db';
import { PUBLIC_MIGRATIONS } from '../../../../packages/database/src/migrations/public';
import {
  PUBLIC_ENCRYPTED_TARGETS,
  TENANT_ENCRYPTED_TARGETS,
} from '../common/crypto/reencrypt-aes.targets';
import { PII_ENCRYPTED_TARGETS } from './reencrypt-aes.pii';

type MigrationConstructor = new () => MigrationInterface;
type MigrationScope = 'public' | 'tenant';
type RegisteredMigrationSet = {
  scope: MigrationScope;
  registryPath: string;
  migrations: readonly MigrationConstructor[];
};
type EncryptedTarget = {
  entityType: string;
  scope: MigrationScope;
  table: string;
};

const migrationRoot = resolve(__dirname, '../../../../packages/database/src/migrations');
const migrationSets: Readonly<Record<MigrationScope, RegisteredMigrationSet>> = {
  public: {
    scope: 'public',
    registryPath: resolve(migrationRoot, 'public/index.ts'),
    migrations: PUBLIC_MIGRATIONS,
  },
  tenant: {
    scope: 'tenant',
    registryPath: resolve(migrationRoot, 'tenant/runner.ts'),
    migrations: TENANT_MIGRATIONS,
  },
};

function readRegisteredMigrationSources(registry: RegisteredMigrationSet): string[] {
  const registrySource = readFileSync(registry.registryPath, 'utf8');
  const registeredNames = new Set(registry.migrations.map((MigrationClass) => MigrationClass.name));
  const resolvedNames = new Set<string>();
  const migrationSources: string[] = [];
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*;/gsu;

  for (const match of registrySource.matchAll(importPattern)) {
    const importedNames = (match[1] ?? '')
      .split(',')
      .map((name) => name.trim().replace(/^type\s+/u, ''))
      .filter(Boolean)
      .map(
        (name) =>
          name
            .split(/\s+as\s+/u)
            .at(-1)
            ?.trim() ?? name,
      );
    const registeredImports = importedNames.filter((name) => registeredNames.has(name));

    if (registeredImports.length === 0) continue;

    const sourceSpecifier = match[2];
    if (!sourceSpecifier?.startsWith('.')) continue;

    const sourcePath = resolve(dirname(registry.registryPath), `${sourceSpecifier}.ts`);
    if (!existsSync(sourcePath)) continue;

    migrationSources.push(readFileSync(sourcePath, 'utf8'));
    for (const name of registeredImports) resolvedNames.add(name);
  }

  const unresolved = [...registeredNames].filter((name) => !resolvedNames.has(name));
  if (unresolved.length > 0) {
    throw new Error(
      `El registro ${registry.scope} no resuelve migraciones registradas: ${unresolved.join(', ')}`,
    );
  }

  return migrationSources;
}

function collectCreatedTables(registry: RegisteredMigrationSet): Set<string> {
  const createTablePattern =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][\w$]*))/giu;
  const createdTables = new Set<string>();

  for (const migrationSource of readRegisteredMigrationSources(registry)) {
    const executableSource = migrationSource
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/^\s*\/\/.*$/gmu, ' ');

    for (const match of executableSource.matchAll(createTablePattern)) {
      const tableName = match[1] ?? match[2];
      if (tableName) createdTables.add(tableName.toLowerCase());
    }
  }

  return createdTables;
}

function findTargetsWithoutMigration(
  targets: readonly EncryptedTarget[],
  createdTablesByScope: Readonly<Record<MigrationScope, ReadonlySet<string>>>,
): string[] {
  return [
    ...new Set(
      targets
        .filter((target) => !createdTablesByScope[target.scope].has(target.table.toLowerCase()))
        .map((target) => `${target.scope}.${target.table}`),
    ),
  ];
}

describe('reencrypt-aes inventory versus registered migrations', () => {
  const createdTablesByScope = {
    public: collectCreatedTables(migrationSets.public),
    tenant: collectCreatedTables(migrationSets.tenant),
  } satisfies Record<MigrationScope, ReadonlySet<string>>;

  it('solo apunta a tablas creadas por una migración del runner correspondiente', () => {
    const targets: readonly EncryptedTarget[] = [
      ...PUBLIC_ENCRYPTED_TARGETS,
      ...TENANT_ENCRYPTED_TARGETS,
      ...PII_ENCRYPTED_TARGETS,
    ];

    expect(findTargetsWithoutMigration(targets, createdTablesByScope)).toEqual([]);
  });

  it('detecta un objetivo cuyo nombre de tabla no aparece en migraciones registradas', () => {
    const target: EncryptedTarget = {
      entityType: 'synthetic.unmigrated',
      scope: 'tenant',
      table: 'synthetic_unmigrated_table',
    };

    expect(findTargetsWithoutMigration([target], createdTablesByScope)).toEqual([
      'tenant.synthetic_unmigrated_table',
    ]);
  });
});
