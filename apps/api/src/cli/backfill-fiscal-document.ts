/** Backfill tenant-aware del documento fiscal; modo predeterminado de simulación. */

import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  AppDataSource,
  isValidSchemaName,
  runInTenantSchema,
  summarizeErrorForLog,
} from '@iwana/db';
import type { DataSource, QueryRunner } from 'typeorm';
import {
  createFiscalDocumentCrypto,
  type FiscalDocumentCrypto,
} from '../common/crypto/fiscal-document.util';

export type FiscalDocumentBackfillMode = 'dry-run' | 'apply';

export interface FiscalDocumentBackfillReport {
  mode: FiscalDocumentBackfillMode;
  contracts: { seen: number; wouldEncrypt: number; encrypted: number; plaintextRemaining: number };
  expedienteRecords: {
    seen: number;
    wouldEncrypt: number;
    encrypted: number;
    plaintextRemaining: number;
  };
  totals: { seen: number; wouldEncrypt: number; encrypted: number; plaintextRemaining: number };
}

interface PlaintextRow {
  id: string;
  fiscal_document: string;
}

interface TenantRow {
  id: string;
  schema_name: string;
  status: string;
}

const BATCH_SIZE = 100;
const TABLES = ['contracts', 'expediente_records'] as const;

function newCounts(): FiscalDocumentBackfillReport['contracts'] {
  return { seen: 0, wouldEncrypt: 0, encrypted: 0, plaintextRemaining: 0 };
}

export async function backfillFiscalDocuments(
  queryRunner: QueryRunner,
  crypto: FiscalDocumentCrypto,
  mode: FiscalDocumentBackfillMode,
): Promise<FiscalDocumentBackfillReport> {
  const columns = (await queryRunner.query(
    `
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = ANY($1::text[])
  `,
    [TABLES],
  )) as Array<{ table_name: string; column_name: string }>;
  const available = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
  for (const table of TABLES) {
    for (const column of [
      'id',
      'fiscal_document',
      'fiscal_document_encrypted',
      'fiscal_document_hmac',
    ]) {
      if (!available.has(`${table}.${column}`)) {
        throw new Error('La migración de cifrado fiscal no está aplicada en el tenant.');
      }
    }
  }

  const report: FiscalDocumentBackfillReport = {
    mode,
    contracts: newCounts(),
    expedienteRecords: newCounts(),
    totals: newCounts(),
  };
  const countsByTable = {
    contracts: report.contracts,
    expediente_records: report.expedienteRecords,
  } as const;

  for (const table of TABLES) {
    const counts = countsByTable[table];
    let lastId: string | null = null;
    while (true) {
      const rows = (await queryRunner.query(
        `SELECT id::text AS id, fiscal_document
           FROM ${table}
          WHERE fiscal_document IS NOT NULL
            AND ($1::uuid IS NULL OR id > $1::uuid)
          ORDER BY id
          LIMIT $2`,
        [lastId, BATCH_SIZE],
      )) as PlaintextRow[];
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1]?.id ?? lastId;
      counts.seen += rows.length;
      counts.wouldEncrypt += rows.length;

      if (mode === 'apply') {
        for (const row of rows) {
          const stored = crypto.encrypt(row.fiscal_document);
          if (!stored) continue;
          const updated = (await queryRunner.query(
            `UPDATE ${table}
                SET fiscal_document_encrypted = $2,
                    fiscal_document_hmac = $3,
                    fiscal_document = NULL
              WHERE id = $1::uuid AND fiscal_document IS NOT NULL
              RETURNING id`,
            [row.id, stored.encrypted, stored.hmac],
          )) as unknown[];
          // TypeORM PostgreSQL devuelve [filas, rowCount] para UPDATE/DELETE.
          // Contar el wrapper completo duplicaba el total cuando RETURNING producía una fila.
          const updatedRows = Array.isArray(updated[0]) ? updated[0] : updated;
          counts.encrypted += updatedRows.length;
        }
      }
    }

    const [remaining] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE fiscal_document IS NOT NULL`,
    )) as Array<{ count: number }>;
    counts.plaintextRemaining = Number(remaining?.count ?? 0);
  }

  report.totals = TABLES.reduce((totals, table) => {
    const counts = countsByTable[table];
    totals.seen += counts.seen;
    totals.wouldEncrypt += counts.wouldEncrypt;
    totals.encrypted += counts.encrypted;
    totals.plaintextRemaining += counts.plaintextRemaining;
    return totals;
  }, newCounts());
  return report;
}

export async function runFiscalDocumentBackfillInTenantSchema(
  dataSource: DataSource,
  schemaName: string,
  crypto: FiscalDocumentCrypto,
  mode: FiscalDocumentBackfillMode,
): Promise<FiscalDocumentBackfillReport> {
  if (!isValidSchemaName(schemaName)) throw new Error('Schema tenant inválido.');
  return runInTenantSchema(dataSource, schemaName, (queryRunner) =>
    backfillFiscalDocuments(queryRunner, crypto, mode),
  );
}

export function parseFiscalDocumentBackfillArgs(argv: string[]): {
  tenant: string | null;
  mode: FiscalDocumentBackfillMode;
  help: boolean;
} {
  let tenant: string | null = null;
  let mode: FiscalDocumentBackfillMode = 'dry-run';
  let modeSeen = false;
  let help = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--dry-run' || arg === '--apply') {
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
      // La ausencia de archivos locales de entorno es normal en CI y producción.
    }
  }
}

async function resolveTenantSchema(tenantRef: string): Promise<TenantRow> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    tenantRef,
  );
  const rows = isUuid
    ? await AppDataSource.query(
        'SELECT id::text, schema_name, status FROM public.tenants WHERE id = $1::uuid LIMIT 1',
        [tenantRef],
      )
    : await AppDataSource.query(
        'SELECT id::text, schema_name, status FROM public.tenants WHERE slug = $1 LIMIT 1',
        [tenantRef],
      );
  const tenant = (rows as TenantRow[])[0];
  if (!tenant || tenant.status !== 'ACTIVE' || !isValidSchemaName(tenant.schema_name)) {
    throw new Error('Tenant inexistente, inactivo o con schema inválido.');
  }
  return tenant;
}

function printHelp(): void {
  process.stdout.write(
    'Backfill de documento fiscal por tenant\n\n' +
      'Uso: pnpm --filter @iwana/api backfill:fiscal-document -- --tenant=<id|slug> [--dry-run|--apply]\n\n' +
      '--dry-run  Simula y reporta solo conteos; es el modo predeterminado.\n' +
      '--apply    Cifra por lotes y pone el texto plano en NULL.\n' +
      '--tenant   UUID o slug de un tenant ACTIVE.\n',
  );
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();
  const flags = parseFiscalDocumentBackfillArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }
  if (!flags.tenant) throw new Error('Debes indicar --tenant=<id|slug>.');

  const config = new ConfigService(process.env);
  const crypto = createFiscalDocumentCrypto(config);
  await AppDataSource.initialize();
  try {
    const tenant = await resolveTenantSchema(flags.tenant);
    const report = await runFiscalDocumentBackfillInTenantSchema(
      AppDataSource,
      tenant.schema_name,
      crypto,
      flags.mode,
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (flags.mode === 'apply' && report.totals.plaintextRemaining > 0) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`[BACKFILL] Fatal: ${summarizeErrorForLog(error)}\n`);
    process.exitCode = 1;
  });
}
