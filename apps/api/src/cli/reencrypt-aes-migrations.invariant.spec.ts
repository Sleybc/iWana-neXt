import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
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

const repositoryRoot = resolve(__dirname, '../../../..');
const migrationRoot = resolve(repositoryRoot, 'packages/database/src/migrations');
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

function stripComments(migrationSource: string): string {
  return migrationSource.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/^\s*\/\/.*$/gmu, ' ');
}

function collectCreatedTables(registry: RegisteredMigrationSet): Set<string> {
  const createTablePattern =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][\w$]*))/giu;
  const createdTables = new Set<string>();

  for (const migrationSource of readRegisteredMigrationSources(registry)) {
    const executableSource = stripComments(migrationSource);

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

function bareTableName(reference: string): string {
  return (reference.split('.').at(-1) ?? reference).replaceAll('"', '').toLowerCase();
}

function closingParenthesis(source: string, openingIndex: number): number {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return source.length;
}

/**
 * Columnas `*_encrypted` que declara el `up()` de una migración.
 * Una tabla interpolada conserva su `${...}`: el invariante falla en vez de omitirla.
 */
function parseEncryptedColumns(migrationSource: string): string[] {
  const upSource = stripComments(migrationSource).split(/\basync\s+down\s*\(/u)[0] ?? '';
  const columns: string[] = [];

  const createTablePattern = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(/giu;
  for (const match of upSource.matchAll(createTablePattern)) {
    const openingIndex = match.index + match[0].length - 1;
    const body = upSource.slice(openingIndex + 1, closingParenthesis(upSource, openingIndex));
    const columnPattern =
      /(?:^|,)\s*"?(\w+_encrypted)"?\s+(?:varchar|character|char|text|bytea|jsonb)\b/gimu;
    for (const column of body.matchAll(columnPattern)) {
      columns.push(`${bareTableName(match[1] ?? '')}.${(column[1] ?? '').toLowerCase()}`);
    }
  }

  const alterTablePattern = /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([^\s(]+)([^;`]*)/giu;
  for (const match of upSource.matchAll(alterTablePattern)) {
    const addColumnPattern =
      /\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+_encrypted)"?/giu;
    for (const column of (match[2] ?? '').matchAll(addColumnPattern)) {
      columns.push(`${bareTableName(match[1] ?? '')}.${(column[1] ?? '').toLowerCase()}`);
    }
  }

  return columns;
}

function collectEncryptedColumns(registry: RegisteredMigrationSet): Set<string> {
  return new Set(readRegisteredMigrationSources(registry).flatMap(parseEncryptedColumns));
}

/** Objetivos del inventario que no siguen la convención `*_encrypted`. */
const PII_COLUMNS_WITHOUT_SUFFIX: readonly string[] = ['party.document_number'];

/**
 * Writers sin migración y con su módulo desmontado de `CrmModule` (D-CONT para contactos).
 * No hay tabla que recifrar: si reciben migración, deben entrar al inventario.
 */
const PII_TABLES_WITHOUT_MIGRATION: readonly string[] = ['potential_leads', 'subscriber_contacts'];

/**
 * Columnas cuyo objetivo llega en un bloque propio: MOD14 lo añade en B2 (RS-9).
 * Al entrar al inventario, la prueba de pendientes obliga a retirarlas de aquí.
 */
const PII_COLUMNS_PENDING_TARGET: readonly string[] = [
  'billing_documents.buyer_document_encrypted',
];

/**
 * Cada archivo de producción que obtiene la clave PII y las columnas que escribe con ella.
 * Atrapa lo que el sufijo no ve (`party.document_number`). Vacío = solo descifra.
 */
const PII_KEY_CONSUMERS: Readonly<Record<string, readonly string[]>> = {
  'apps/api/src/cli/anonymize-titular.ts': [
    'expediente_records.document_number_encrypted',
    'subscribers.email_encrypted',
    'subscribers.phone_encrypted',
    'party.document_number',
  ],
  'apps/api/src/cli/backfill-party-pii.ts': [
    'party.document_number',
    'party_contact.value_encrypted',
    'subscribers.whatsapp_encrypted',
  ],
  'apps/api/src/cli/reencrypt-aes.pii.ts': [],
  'apps/api/src/common/crypto/fiscal-document.util.ts': [
    'contracts.fiscal_document_encrypted',
    'expediente_records.fiscal_document_encrypted',
  ],
  'apps/api/src/modules/crm/contacts/contacts.service.ts': [
    'subscriber_contacts.email_encrypted',
    'subscriber_contacts.phone_encrypted',
  ],
  'apps/api/src/modules/crm/expedientes/expediente.service.ts': [
    'expediente_records.document_number_encrypted',
    'expediente_records.phone_primary_encrypted',
    'expediente_records.phone_secondary_encrypted',
    'expediente_records.email_primary_encrypted',
    'expediente_records.alt_contact_phone_encrypted',
    'expediente_records.site_contact_phone_encrypted',
    'expediente_records.fiscal_document_encrypted',
  ],
  'apps/api/src/modules/crm/potentials/potentials.service.ts': [
    'potential_leads.email_encrypted',
    'potential_leads.phone_encrypted',
  ],
  'apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.ts': [
    'subscribers.document_number_encrypted',
    'subscribers.email_encrypted',
    'subscribers.phone_encrypted',
    'expediente_records.document_number_encrypted',
    'party.document_number',
  ],
  'apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts': [],
  'apps/api/src/modules/crm/subscribers/subscriber-lifecycle.service.ts': [
    'crm_lifecycle_changes.note_encrypted',
  ],
  'apps/api/src/modules/crm/subscribers/subscribers.service.ts': [
    'subscribers.document_number_encrypted',
    'subscribers.email_encrypted',
    'subscribers.phone_encrypted',
    'subscribers.alt_contact_phone_encrypted',
    'subscribers.whatsapp_encrypted',
  ],
  'apps/api/src/modules/parties/party-pii.util.ts': [
    'party.document_number',
    'party_contact.value_encrypted',
  ],
  'apps/api/src/modules/privacy/requests/requests.service.ts': [
    'data_subject_requests.requester_name_encrypted',
    'data_subject_requests.requester_document_encrypted',
    'data_subject_requests.requester_contact_encrypted',
  ],
};

function isProductionSource(path: string): boolean {
  return path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.d.ts');
}

function listPiiKeyConsumers(): string[] {
  const keyLoader = /\bloadPiiAesGcmKeyPair\s*\(/u;
  const definition = 'apps/api/src/common/crypto/aes-gcm.util.ts';

  return ['apps/api/src', 'apps/worker/src']
    .flatMap((root) =>
      readdirSync(resolve(repositoryRoot, root), { recursive: true, encoding: 'utf8' })
        .filter(isProductionSource)
        .map((path) => resolve(repositoryRoot, root, path)),
    )
    .filter((path) => keyLoader.test(readFileSync(path, 'utf8')))
    .map((path) => relative(repositoryRoot, path).replaceAll('\\', '/'))
    .filter((path) => path !== definition)
    .sort();
}

function findUninventoriedColumns(
  columns: Iterable<string>,
  inventory: ReadonlySet<string>,
): string[] {
  return [...new Set(columns)]
    .filter((column) => !inventory.has(column))
    .filter((column) => !PII_COLUMNS_PENDING_TARGET.includes(column))
    .filter((column) => !PII_TABLES_WITHOUT_MIGRATION.includes(column.split('.')[0] ?? ''))
    .sort();
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

  describe('columnas cifradas con la clave PII', () => {
    const inventory = new Set(
      PII_ENCRYPTED_TARGETS.map(({ table, column }) => `${table}.${column}`),
    );
    const declaredColumns = new Set([
      ...collectEncryptedColumns(migrationSets.public),
      ...collectEncryptedColumns(migrationSets.tenant),
    ]);

    it('toda columna *_encrypted de una migración registrada figura en el inventario', () => {
      expect(findUninventoriedColumns(declaredColumns, inventory)).toEqual([]);
    });

    it('todo objetivo del inventario existe en una migración registrada', () => {
      const targetsWithoutColumn = [...inventory].filter(
        (column) => !declaredColumns.has(column) && !PII_COLUMNS_WITHOUT_SUFFIX.includes(column),
      );

      expect(targetsWithoutColumn).toEqual([]);
    });

    it('todo archivo que obtiene la clave PII declara las columnas que escribe', () => {
      expect(listPiiKeyConsumers()).toEqual(Object.keys(PII_KEY_CONSUMERS).sort());
    });

    it('toda columna escrita con la clave PII figura en el inventario', () => {
      expect(findUninventoriedColumns(Object.values(PII_KEY_CONSUMERS).flat(), inventory)).toEqual(
        [],
      );
    });

    it('una columna pendiente deja de serlo al entrar al inventario', () => {
      expect(PII_COLUMNS_PENDING_TARGET.filter((column) => inventory.has(column))).toEqual([]);
    });

    it('las tablas excluidas siguen sin migración', () => {
      const migrated = PII_TABLES_WITHOUT_MIGRATION.filter((table) =>
        createdTablesByScope.tenant.has(table),
      );

      expect(migrated).toEqual([]);
    });

    it('detecta columnas en CREATE TABLE y ALTER TABLE, solo en up() y sin comentarios', () => {
      const migration = [
        'export class Synthetic {',
        '  async up(queryRunner) {',
        '    // ALTER TABLE commented ADD COLUMN ignored_encrypted varchar(500)',
        '    await queryRunner.query(`',
        '      CREATE TABLE IF NOT EXISTS synthetic_created (',
        '        id uuid PRIMARY KEY,',
        '        value_encrypted varchar(500),',
        '        CHECK (value_encrypted IS NOT NULL)',
        '      )',
        '    `);',
        '    await queryRunner.query(`',
        '      ALTER TABLE "tenant"."synthetic_altered"',
        '        ADD COLUMN IF NOT EXISTS first_encrypted varchar(500),',
        '        ADD COLUMN second_encrypted text',
        '    `);',
        '    await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN dynamic_encrypted text`);',
        '  }',
        '  async down(queryRunner) {',
        "    await queryRunner.query('ALTER TABLE synthetic_down ADD COLUMN old_encrypted text');",
        '  }',
        '}',
      ].join('\n');

      expect(parseEncryptedColumns(migration).sort()).toEqual([
        '${table}.dynamic_encrypted',
        'synthetic_altered.first_encrypted',
        'synthetic_altered.second_encrypted',
        'synthetic_created.value_encrypted',
      ]);
    });

    it('señala una columna fuera del inventario y conserva las exclusiones', () => {
      expect(
        findUninventoriedColumns(
          [
            'billing_synthetic.buyer_document_encrypted',
            'potential_leads.email_encrypted',
            'party.document_number',
          ],
          inventory,
        ),
      ).toEqual(['billing_synthetic.buyer_document_encrypted']);
    });
  });
});
