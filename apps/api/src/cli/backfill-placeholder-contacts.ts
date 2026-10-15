/**
 * Limpieza tenant-aware de los contactos placeholder heredados de MOD05.
 * El modo predeterminado solo informa conteos; los reportes nunca llevan PII ni HMAC.
 */
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AppDataSource, isValidSchemaName, runInTenantSchema } from '@iwana/db';
import type { DataSource, QueryRunner } from 'typeorm';
import { hmacPii, resolvePiiHashKey } from '../common/crypto/pii-hash-key.util';

export type PlaceholderBackfillMode = 'dry-run' | 'apply';

export interface PlaceholderBackfillReport {
  mode: PlaceholderBackfillMode;
  totals: {
    subscribersSeen: number;
    emailPlaceholders: number;
    phonePlaceholders: number;
    partyContactsPlaceholderByHmac: number;
    emptyPartyContactValues: number;
    activeWithoutContactAfterBackfill: number;
  };
  applied: boolean;
}

interface SubscriberRow {
  id: string;
  expediente_id: string | null;
  party_id: string | null;
  status: string;
  email_encrypted: string | null;
  email_hmac: string | null;
  phone_encrypted: string | null;
  phone_hmac: string | null;
}

interface TenantColumn {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
}

const EMAIL_PLACEHOLDER_DOMAIN = '@placeholder.iwana.co';
const PHONE_PLACEHOLDER = '0000000000';

function createReport(mode: PlaceholderBackfillMode): PlaceholderBackfillReport {
  return {
    mode,
    totals: {
      subscribersSeen: 0,
      emailPlaceholders: 0,
      phonePlaceholders: 0,
      partyContactsPlaceholderByHmac: 0,
      emptyPartyContactValues: 0,
      activeWithoutContactAfterBackfill: 0,
    },
    applied: false,
  };
}

/** Ejecuta la detección y, opcionalmente, los cambios dentro de la transacción del tenant. */
export async function backfillPlaceholderContacts(
  queryRunner: QueryRunner,
  hashKey: Buffer,
  mode: PlaceholderBackfillMode,
): Promise<PlaceholderBackfillReport> {
  const report = createReport(mode);
  const columns = (await queryRunner.query(`
    SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name IN ('subscribers', 'party_contact')
  `)) as TenantColumn[];
  const columnMap = new Map(
    columns.map((column) => [`${column.table_name}.${column.column_name}`, column]),
  );
  const requiredColumns = [
    'subscribers.id',
    'subscribers.expediente_id',
    'subscribers.party_id',
    'subscribers.status',
    'subscribers.email_encrypted',
    'subscribers.email_hmac',
    'subscribers.phone_encrypted',
    'subscribers.phone_hmac',
    'party_contact.id',
    'party_contact.value',
    'party_contact.value_hmac',
  ];
  if (requiredColumns.some((column) => !columnMap.has(column))) {
    throw new Error('El esquema tenant no tiene las columnas requeridas para el backfill.');
  }

  if (
    mode === 'apply' &&
    (columnMap.get('subscribers.email_encrypted')?.is_nullable !== 'YES' ||
      columnMap.get('subscribers.phone_encrypted')?.is_nullable !== 'YES' ||
      columnMap.get('party_contact.value')?.is_nullable !== 'YES')
  ) {
    throw new Error('Aplica primero la migración tenant 148 antes del backfill.');
  }

  const subscribers = (await queryRunner.query(`
    SELECT id, expediente_id, party_id, status,
           email_encrypted, email_hmac, phone_encrypted, phone_hmac
      FROM subscribers
     ORDER BY id
  `)) as SubscriberRow[];
  const placeholderHmacs = new Set<string>([hmacPii(PHONE_PLACEHOLDER, hashKey)]);
  const plannedUpdates: Array<{ row: SubscriberRow; clearEmail: boolean; clearPhone: boolean }> =
    [];

  for (const row of subscribers) {
    const expectedEmailHmac = row.expediente_id
      ? hmacPii(`expediente-${row.expediente_id}${EMAIL_PLACEHOLDER_DOMAIN}`, hashKey)
      : null;
    if (expectedEmailHmac) placeholderHmacs.add(expectedEmailHmac);

    const clearEmail = expectedEmailHmac !== null && row.email_hmac === expectedEmailHmac;
    const clearPhone = row.phone_hmac === hmacPii(PHONE_PLACEHOLDER, hashKey);
    report.totals.subscribersSeen += 1;
    if (clearEmail) report.totals.emailPlaceholders += 1;
    if (clearPhone) report.totals.phonePlaceholders += 1;
    if (clearEmail || clearPhone) plannedUpdates.push({ row, clearEmail, clearPhone });

    const hasEmailAfterBackfill = row.email_encrypted !== null && !clearEmail;
    const hasPhoneAfterBackfill = row.phone_encrypted !== null && !clearPhone;
    if (row.status === 'ACTIVE' && !hasEmailAfterBackfill && !hasPhoneAfterBackfill) {
      report.totals.activeWithoutContactAfterBackfill += 1;
    }
  }

  const placeholderHashes = [...placeholderHmacs];
  const hasSoftDelete = columnMap.has('party_contact.deleted_at');
  const contactCounts = (await queryRunner.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE value_hmac = ANY($1::varchar[])${hasSoftDelete ? ' AND deleted_at IS NULL' : ''}
       )::int AS placeholder_hmacs,
       COUNT(*) FILTER (WHERE value = '')::int AS empty_values
       FROM party_contact`,
    [placeholderHashes],
  )) as Array<{ placeholder_hmacs: number; empty_values: number }>;
  report.totals.partyContactsPlaceholderByHmac = contactCounts[0]?.placeholder_hmacs ?? 0;
  report.totals.emptyPartyContactValues = contactCounts[0]?.empty_values ?? 0;

  if (mode === 'dry-run') return report;

  for (const update of plannedUpdates) {
    await queryRunner.query(
      `UPDATE subscribers
          SET email_encrypted = CASE WHEN $2 THEN NULL ELSE email_encrypted END,
              email_hmac = CASE WHEN $2 THEN NULL ELSE email_hmac END,
              phone_encrypted = CASE WHEN $3 THEN NULL ELSE phone_encrypted END,
              phone_hmac = CASE WHEN $3 THEN NULL ELSE phone_hmac END
        WHERE id = $1`,
      [update.row.id, update.clearEmail, update.clearPhone],
    );
  }

  await queryRunner.query(`UPDATE party_contact SET value = NULL WHERE value = ''`);
  if (hasSoftDelete) {
    await queryRunner.query(
      `UPDATE party_contact
          SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
        WHERE value_hmac = ANY($1::varchar[]) AND deleted_at IS NULL`,
      [placeholderHashes],
    );
  } else {
    await queryRunner.query(`DELETE FROM party_contact WHERE value_hmac = ANY($1::varchar[])`, [
      placeholderHashes,
    ]);
  }

  report.applied = true;
  return report;
}

export async function runPlaceholderBackfillInTenantSchema(
  dataSource: DataSource,
  schemaName: string,
  hashKey: Buffer,
  mode: PlaceholderBackfillMode,
): Promise<PlaceholderBackfillReport> {
  if (!isValidSchemaName(schemaName)) {
    throw new Error('Schema tenant inválido.');
  }
  return runInTenantSchema(dataSource, schemaName, (queryRunner) =>
    backfillPlaceholderContacts(queryRunner, hashKey, mode),
  );
}

export function parsePlaceholderBackfillArgs(argv: string[]): {
  tenant: string | null;
  mode: PlaceholderBackfillMode;
  help: boolean;
} {
  let tenant: string | null = null;
  let mode: PlaceholderBackfillMode = 'dry-run';
  let modeSeen = false;
  let help = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--dry-run' || arg === '--apply') {
      if (modeSeen) throw new Error('Usa solo uno de --dry-run o --apply.');
      modeSeen = true;
      mode = arg === '--apply' ? 'apply' : 'dry-run';
    } else if (arg.startsWith('--tenant=')) {
      tenant = arg.slice('--tenant='.length).trim();
      if (!tenant) throw new Error('--tenant requiere un id o slug.');
    } else {
      throw new Error(`Argumento desconocido: ${arg.split('=')[0]}`);
    }
  }
  return { tenant, mode, help };
}

function ensureCliEnvLoaded(): void {
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  if (!loadEnvFile) return;
  const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    try {
      loadEnvFile(resolve(workspaceRoot, candidate));
    } catch {
      // Los archivos locales pueden no existir en CI o producción.
    }
  }
}

async function resolveTenantSchema(
  dataSource: DataSource,
  tenantRef: string,
): Promise<{ id: string; schemaName: string }> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    tenantRef,
  );
  const rows = isUuid
    ? await dataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
        [tenantRef],
      )
    : await dataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE slug = $1 LIMIT 1`,
        [tenantRef],
      );
  const tenant = (rows as Array<{ id: string; schema_name: string; status: string }>)[0];
  if (!tenant || tenant.status !== 'ACTIVE' || !isValidSchemaName(tenant.schema_name)) {
    throw new Error('Tenant inexistente, inactivo o con schema inválido.');
  }
  return { id: tenant.id, schemaName: tenant.schema_name };
}

function printHelp(): void {
  process.stdout.write(
    `Backfill MOD05 de contactos placeholder (tenant-aware)\n\n` +
      `Uso: pnpm --filter @iwana/api exec node dist/cli/backfill-placeholder-contacts.js --tenant=<id|slug> [--dry-run|--apply]\n\n` +
      `--dry-run  Simula y reporta conteos; modo predeterminado.\n` +
      `--apply    Limpia valores placeholder de un tenant en una transacción.\n` +
      `--tenant   UUID o slug de un tenant ACTIVE.\n`,
  );
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();
  const flags = parsePlaceholderBackfillArgs(process.argv.slice(2));
  if (flags.help) return printHelp();
  if (!flags.tenant) throw new Error('Debes indicar --tenant=<id|slug>.');

  const config = new ConfigService(process.env);
  const hashKey = resolvePiiHashKey(config);
  await AppDataSource.initialize();
  try {
    const tenant = await resolveTenantSchema(AppDataSource, flags.tenant);
    const report = await runPlaceholderBackfillInTenantSchema(
      AppDataSource,
      tenant.schemaName,
      hashKey,
      flags.mode,
    );
    process.stdout.write(`[BACKFILL] tenant=${tenant.id} schema=${tenant.schemaName}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write(
      '[BACKFILL] Error; no se aplicó el backfill. Revisa la configuración del tenant.\n',
    );
    process.exitCode = 1;
  });
}
