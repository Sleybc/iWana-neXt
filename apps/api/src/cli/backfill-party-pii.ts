/**
 * Tenant-scoped expansion backfill for party documents and contact values.
 * Dry-run is the default. Reports contain counts and opaque row identifiers;
 * plaintext values and HMACs are never printed.
 */

import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  AppDataSource,
  hmacEmail,
  hmacPhone,
  hmacPiiValue,
  isValidSchemaName,
  loadPiiHashKeyFromEnv,
  runInTenantSchema,
} from '@iwana/db';
import { DocumentTypeParty, normalizeDocumentNumber, PartyContactType } from '@iwana/shared';
import type { DataSource, QueryRunner } from 'typeorm';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../common/crypto/aes-gcm.util';

export type BackfillMode = 'dry-run' | 'apply';

export interface PartyPiiBackfillKeys {
  activeEncryptionKey: Buffer;
  previousEncryptionKey: Buffer | readonly Buffer[] | null;
  hashKey: Buffer;
}

export interface PartyPiiBackfillReport {
  mode: BackfillMode;
  totals: {
    partiesSeen: number;
    partiesWouldSetHmac: number;
    partiesWouldEncrypt: number;
    contactsSeen: number;
    contactsWouldSetHmac: number;
    contactsWouldEncrypt: number;
    whatsappSeen: number;
    whatsappWouldSetHmac: number;
    whatsappWouldEncrypt: number;
    noDataValues: number;
  };
  mergeCandidates: Array<{ documentType: string; partyIds: string[]; count: number }>;
  failures: Array<{ entity: 'party' | 'party_contact' | 'subscriber'; id: string; code: string }>;
  applied: boolean;
  blockedReason: 'merge-candidates' | 'unreadable-values' | null;
}

interface PartyRow {
  id: string;
  document_type: string;
  document_number: string;
  document_number_hmac: string | null;
  status: string;
  deleted_at: Date | null;
}

interface ContactRow {
  id: string;
  type: string;
  value: string;
  value_encrypted: string | null;
  value_hmac: string | null;
}

interface SubscriberRow {
  id: string;
  whatsapp: string | null;
  whatsapp_encrypted: string | null;
  whatsapp_hmac: string | null;
}

interface PreparedUpdate {
  id: string;
  encryptedValue: string | null;
  hmac: string;
  writeEncryptedValue: boolean;
}

interface PreparedPartyUpdate {
  id: string;
  hmac: string;
  plaintext: string;
  wasEncrypted: boolean;
}

function isNoData(value: string): boolean {
  return value.startsWith('NODATA-');
}

function isContractCiphertext(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}

function resolvePlaintext(
  value: string,
  keys: PartyPiiBackfillKeys,
): { plaintext: string; encrypted: boolean } {
  if (isContractCiphertext(value)) {
    return {
      plaintext: decryptAes256Gcm(value, keys.activeEncryptionKey, keys.previousEncryptionKey),
      encrypted: true,
    };
  }
  return { plaintext: value, encrypted: false };
}

function contactHmac(type: string, value: string, key: Buffer): string {
  switch (type) {
    case PartyContactType.EMAIL:
      return hmacEmail(value, key);
    case PartyContactType.PHONE:
      return hmacPhone(value.trim(), key);
    case PartyContactType.ADDRESS:
      return hmacPiiValue(value.trim(), key);
    default:
      throw new Error('unsupported-contact-type');
  }
}

function newReport(mode: BackfillMode): PartyPiiBackfillReport {
  return {
    mode,
    totals: {
      partiesSeen: 0,
      partiesWouldSetHmac: 0,
      partiesWouldEncrypt: 0,
      contactsSeen: 0,
      contactsWouldSetHmac: 0,
      contactsWouldEncrypt: 0,
      whatsappSeen: 0,
      whatsappWouldSetHmac: 0,
      whatsappWouldEncrypt: 0,
      noDataValues: 0,
    },
    mergeCandidates: [],
    failures: [],
    applied: false,
    blockedReason: null,
  };
}

/**
 * Performs one tenant's backfill inside the caller's transaction. Exported so
 * the PostgreSQL integration test exercises real DDL/data behavior.
 */
export async function backfillPartyPii(
  queryRunner: QueryRunner,
  keys: PartyPiiBackfillKeys,
  mode: BackfillMode,
): Promise<PartyPiiBackfillReport> {
  const report = newReport(mode);
  const schemaColumns = (await queryRunner.query(`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name IN ('party', 'party_contact', 'subscribers')
  `)) as Array<{ table_name: string; column_name: string }>;
  const columnSet = new Set(
    schemaColumns.map((column) => `${column.table_name}.${column.column_name}`),
  );
  const hasPartyHmac = columnSet.has('party.document_number_hmac');
  const hasContactEncrypted = columnSet.has('party_contact.value_encrypted');
  const hasContactHmac = columnSet.has('party_contact.value_hmac');
  const hasWhatsappEncrypted = columnSet.has('subscribers.whatsapp_encrypted');
  const hasWhatsappHmac = columnSet.has('subscribers.whatsapp_hmac');
  const missingColumns = [
    ['party', 'document_number_hmac', hasPartyHmac],
    ['party_contact', 'value_encrypted', hasContactEncrypted],
    ['party_contact', 'value_hmac', hasContactHmac],
    ['subscribers', 'whatsapp_encrypted', hasWhatsappEncrypted],
    ['subscribers', 'whatsapp_hmac', hasWhatsappHmac],
  ]
    .filter(([, , exists]) => !exists)
    .map(([table, column]) => `${table}.${column}`);
  if (mode === 'apply' && missingColumns.length > 0) {
    throw new Error('Migración C-DDL-1 no aplicada; no se ejecutó el backfill.');
  }

  const partyRows = (await queryRunner.query(`
    SELECT id, document_type, document_number,
           ${hasPartyHmac ? 'document_number_hmac' : 'NULL::varchar AS document_number_hmac'},
           status, deleted_at
      FROM party ORDER BY id
  `)) as PartyRow[];
  const partyUpdates: PreparedPartyUpdate[] = [];
  const partyGroups = new Map<string, { documentType: string; partyIds: string[] }>();

  for (const row of partyRows) {
    report.totals.partiesSeen += 1;
    try {
      let hmac = row.document_number_hmac;
      let plaintext: string | null = null;
      let encrypted = true;
      if (!hmac) {
        if (isNoData(row.document_number)) {
          report.totals.noDataValues += 1;
          continue;
        }
        const resolved = resolvePlaintext(row.document_number, keys);
        plaintext = resolved.plaintext;
        encrypted = resolved.encrypted;
        const normalized = normalizeDocumentNumber(
          row.document_type as DocumentTypeParty,
          plaintext,
        );
        if (!normalized) {
          report.failures.push({ entity: 'party', id: row.id, code: 'empty-normalized-document' });
          continue;
        }
        hmac = hmacPiiValue(normalized, keys.hashKey);
        report.totals.partiesWouldSetHmac += 1;
        if (!encrypted) {
          report.totals.partiesWouldEncrypt += 1;
        }
        partyUpdates.push({
          id: row.id,
          hmac,
          plaintext: plaintext!,
          wasEncrypted: encrypted,
        });
      }

      if (row.deleted_at === null && row.status !== 'MERGED') {
        const key = `${row.document_type}\u0000${hmac}`;
        const group = partyGroups.get(key) ?? { documentType: row.document_type, partyIds: [] };
        group.partyIds.push(row.id);
        partyGroups.set(key, group);
      }
    } catch {
      // Error details can include a provider's data; only the safe row key and
      // a stable error code are retained.
      report.failures.push({ entity: 'party', id: row.id, code: 'unreadable-document' });
    }
  }

  report.mergeCandidates = [...partyGroups.values()]
    .filter((group) => group.partyIds.length > 1)
    .map((group) => ({
      documentType: group.documentType,
      partyIds: group.partyIds,
      count: group.partyIds.length,
    }))
    .sort(
      (a, b) =>
        a.documentType.localeCompare(b.documentType) ||
        a.partyIds[0]!.localeCompare(b.partyIds[0]!),
    );

  const contactRows = (await queryRunner.query(`
    SELECT id, type, value,
           ${hasContactEncrypted ? 'value_encrypted' : 'NULL::varchar AS value_encrypted'},
           ${hasContactHmac ? 'value_hmac' : 'NULL::varchar AS value_hmac'}
      FROM party_contact ORDER BY id
  `)) as ContactRow[];
  const contactUpdates: PreparedUpdate[] = [];
  for (const row of contactRows) {
    report.totals.contactsSeen += 1;
    if (row.value_hmac && row.value_encrypted) {
      continue;
    }
    const source = row.value_encrypted ?? row.value;
    if (isNoData(source)) {
      report.totals.noDataValues += 1;
      continue;
    }
    try {
      const resolved = resolvePlaintext(source, keys);
      const hmac = row.value_hmac ?? contactHmac(row.type, resolved.plaintext, keys.hashKey);
      if (!row.value_hmac) {
        report.totals.contactsWouldSetHmac += 1;
      }
      if (!row.value_encrypted || !resolved.encrypted) {
        if (!resolved.encrypted) {
          report.totals.contactsWouldEncrypt += 1;
        }
        contactUpdates.push({
          id: row.id,
          hmac,
          encryptedValue: resolved.encrypted
            ? source
            : mode === 'apply'
              ? encryptAes256Gcm(resolved.plaintext, keys.activeEncryptionKey)
              : null,
          writeEncryptedValue: true,
        });
      } else if (!row.value_hmac) {
        contactUpdates.push({
          id: row.id,
          hmac,
          encryptedValue: source,
          writeEncryptedValue: false,
        });
      }
    } catch (error) {
      report.failures.push({
        entity: 'party_contact',
        id: row.id,
        code:
          error instanceof Error && error.message === 'unsupported-contact-type'
            ? 'unsupported-contact-type'
            : 'unreadable-contact',
      });
    }
  }

  const whatsappRows = (await queryRunner.query(`
    SELECT id, whatsapp,
           ${hasWhatsappEncrypted ? 'whatsapp_encrypted' : 'NULL::varchar AS whatsapp_encrypted'},
           ${hasWhatsappHmac ? 'whatsapp_hmac' : 'NULL::varchar AS whatsapp_hmac'}
      FROM subscribers WHERE whatsapp IS NOT NULL ${hasWhatsappEncrypted ? 'OR whatsapp_encrypted IS NOT NULL' : ''}
      ORDER BY id
  `)) as SubscriberRow[];
  const whatsappUpdates: PreparedUpdate[] = [];
  for (const row of whatsappRows) {
    report.totals.whatsappSeen += 1;
    if (row.whatsapp_hmac && row.whatsapp_encrypted) {
      continue;
    }
    const source = row.whatsapp_encrypted ?? row.whatsapp;
    if (source === null) {
      continue;
    }
    if (isNoData(source)) {
      report.totals.noDataValues += 1;
      continue;
    }
    try {
      const resolved = resolvePlaintext(source, keys);
      const hmac = row.whatsapp_hmac ?? hmacPhone(resolved.plaintext.trim(), keys.hashKey);
      if (!row.whatsapp_hmac) {
        report.totals.whatsappWouldSetHmac += 1;
      }
      if (!row.whatsapp_encrypted || !resolved.encrypted) {
        if (!resolved.encrypted) {
          report.totals.whatsappWouldEncrypt += 1;
        }
        whatsappUpdates.push({
          id: row.id,
          hmac,
          encryptedValue: resolved.encrypted
            ? source
            : mode === 'apply'
              ? encryptAes256Gcm(resolved.plaintext, keys.activeEncryptionKey)
              : null,
          writeEncryptedValue: true,
        });
      } else if (!row.whatsapp_hmac) {
        whatsappUpdates.push({
          id: row.id,
          hmac,
          encryptedValue: source,
          writeEncryptedValue: false,
        });
      }
    } catch {
      report.failures.push({ entity: 'subscriber', id: row.id, code: 'unreadable-whatsapp' });
    }
  }

  if (report.mergeCandidates.length > 0) {
    report.blockedReason = 'merge-candidates';
  } else if (report.failures.length > 0) {
    report.blockedReason = 'unreadable-values';
  }

  if (mode === 'dry-run' || report.blockedReason) {
    return report;
  }

  for (const update of partyUpdates) {
    if (!update.wasEncrypted) {
      await queryRunner.query(
        `UPDATE party SET document_number = $2, document_number_hmac = $3 WHERE id = $1 AND document_number_hmac IS NULL`,
        [update.id, encryptAes256Gcm(update.plaintext, keys.activeEncryptionKey), update.hmac],
      );
    } else {
      await queryRunner.query(
        `UPDATE party SET document_number_hmac = $2 WHERE id = $1 AND document_number_hmac IS NULL`,
        [update.id, update.hmac],
      );
    }
  }
  for (const update of contactUpdates) {
    if (!update.encryptedValue) {
      throw new Error('Backfill interno sin valor cifrado para party_contact.');
    }
    await queryRunner.query(
      `UPDATE party_contact SET value_encrypted = $2, value_hmac = $3 WHERE id = $1`,
      [update.id, update.encryptedValue, update.hmac],
    );
  }
  for (const update of whatsappUpdates) {
    if (!update.encryptedValue) {
      throw new Error('Backfill interno sin valor cifrado para subscribers.whatsapp.');
    }
    await queryRunner.query(
      `UPDATE subscribers SET whatsapp_encrypted = $2, whatsapp_hmac = $3 WHERE id = $1`,
      [update.id, update.encryptedValue, update.hmac],
    );
  }

  report.applied = true;
  return report;
}

export async function runBackfillInTenantSchema(
  dataSource: DataSource,
  schemaName: string,
  keys: PartyPiiBackfillKeys,
  mode: BackfillMode,
): Promise<PartyPiiBackfillReport> {
  if (!isValidSchemaName(schemaName)) {
    throw new Error('Schema tenant inválido.');
  }
  return runInTenantSchema(dataSource, schemaName, (queryRunner) =>
    backfillPartyPii(queryRunner, keys, mode),
  );
}

export function parseBackfillArgs(argv: string[]): {
  tenant: string | null;
  mode: BackfillMode;
  help: boolean;
} {
  let tenant: string | null = null;
  let mode: BackfillMode = 'dry-run';
  let modeSeen = false;
  let help = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--dry-run' || arg === '--apply') {
      if (modeSeen) {
        throw new Error('Usa solo uno de --dry-run o --apply.');
      }
      modeSeen = true;
      mode = arg === '--apply' ? 'apply' : 'dry-run';
    } else if (arg.startsWith('--tenant=')) {
      tenant = arg.slice('--tenant='.length).trim();
      if (!tenant) {
        throw new Error('--tenant requiere un id o slug.');
      }
    } else {
      throw new Error(`Argumento desconocido: ${arg.split('=')[0]}`);
    }
  }
  return { tenant, mode, help };
}

function ensureCliEnvLoaded(): void {
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  if (!loadEnvFile) {
    return;
  }
  const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    try {
      loadEnvFile(resolve(workspaceRoot, candidate));
    } catch {
      // Missing local env files are normal in CI and production deployments.
    }
  }
}

function loadKeys(): PartyPiiBackfillKeys {
  const { activeKey, previousKey } = loadPiiAesGcmKeyPair(new ConfigService());
  return {
    activeEncryptionKey: activeKey,
    previousEncryptionKey: previousKey,
    hashKey: loadPiiHashKeyFromEnv(),
  };
}

async function resolveTenantSchema(tenantRef: string): Promise<{ id: string; schemaName: string }> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    tenantRef,
  );
  const rows = isUuid
    ? await AppDataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
        [tenantRef],
      )
    : await AppDataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE slug = $1 LIMIT 1`,
        [tenantRef],
      );
  const tenant = (rows as Array<{ id: string; schema_name: string; status: string }>)[0];
  if (!tenant || tenant.status !== 'ACTIVE' || !isValidSchemaName(tenant.schema_name)) {
    throw new Error('Tenant inexistente, inactivo o con schema inválido.');
  }
  return { id: tenant.id, schemaName: tenant.schema_name };
}

export function formatBackfillReport(report: PartyPiiBackfillReport): string {
  return JSON.stringify(report, null, 2);
}

function printHelp(): void {
  process.stdout.write(
    `Backfill MOD05 Party PII (tenant-aware)\n\n` +
      `Uso: pnpm --filter @iwana/api backfill:party-pii -- --tenant=<id|slug> [--dry-run|--apply]\n\n` +
      `--dry-run  Simula y reporta conteos/candidatos; modo predeterminado.\n` +
      `--apply    Cifra y calcula HMAC si no hay errores ni candidatos a fusión.\n` +
      `--tenant   UUID o slug de un tenant ACTIVE.\n`,
  );
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();
  const flags = parseBackfillArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }
  if (!flags.tenant) {
    throw new Error('Debes indicar --tenant=<id|slug>.');
  }

  const keys = loadKeys();
  await AppDataSource.initialize();
  try {
    const tenant = await resolveTenantSchema(flags.tenant);
    const report = await runBackfillInTenantSchema(
      AppDataSource,
      tenant.schemaName,
      keys,
      flags.mode,
    );
    process.stdout.write(`[BACKFILL] tenant=${tenant.id} schema=${tenant.schemaName}\n`);
    process.stdout.write(`${formatBackfillReport(report)}\n`);
    if (report.blockedReason) {
      process.stderr.write(`[BACKFILL] BLOQUEADO: ${report.blockedReason}\n`);
      process.exitCode = 1;
    }
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'error desconocido';
    process.stderr.write(`[BACKFILL] Fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
