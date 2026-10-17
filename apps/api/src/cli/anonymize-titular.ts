/**
 * Anonimización asistida de un titular, limitada al alcance aprobado en ADR-094.
 * Dry-run por defecto; nunca imprime valores personales, ciphertext ni HMAC.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AppDataSource, isValidSchemaName, runInTenantSchema } from '@iwana/db';
import type { DataSource, QueryRunner } from 'typeorm';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../common/crypto/aes-gcm.util';
import { hmacPii, resolvePiiHashKey } from '../common/crypto/pii-hash-key.util';
import { CrmPersonalDataErasureAdapter } from '../modules/crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../modules/media/privacy/media-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../modules/parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../modules/users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../modules/wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../modules/tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../modules/tasks/privacy/operational-task-titular-erasure.participant';
import type { TitularErasureTableResult } from '../modules/crm/privacy-adapters/titular-erasure/titular-erasure.types';

export type AnonymizeTitularMode = 'dry-run' | 'apply';

export interface AnonymizeTitularFlags {
  tenant: string | null;
  requestId: string | null;
  expedienteIds: string[];
  confirmUnmatched: boolean;
  mode: AnonymizeTitularMode;
  help: boolean;
}

export interface AnonymizeTitularKeys {
  hashKey: Buffer;
  activeEncryptionKey: Buffer;
  previousEncryptionKey: Buffer | readonly Buffer[] | null;
}

export interface AnonymizeTitularReport {
  mode: AnonymizeTitularMode;
  labels: {
    privacyMediaAssets: 'conservada (prueba de autorización)';
  };
  totals: {
    potentialLeads: number;
    expedienteRecords: number;
    contactAttempts: number;
    consentRecords: number;
    coverageChecks: number;
    parties: number;
    partyContacts: number;
    subscribers: number;
    users: number;
    privacyMediaAssets: number;
    stratumMediaAssets: number;
    unmatchedExpedientes: number;
    visitRequests?: number;
    scheduleEvents?: number;
    executionOrders?: number;
  };
  changed: {
    expedienteRecords: number;
    contactAttempts: number;
    consentRecords: number;
    coverageChecks: number;
    parties: number;
    partyContacts: number;
    subscribers: number;
    users: number;
    privacyMediaAssets: number;
    stratumMediaAssets: number;
    visitRequests?: number;
    scheduleEvents?: number;
    executionOrders?: number;
  };
  verification: {
    residualFields: number | null;
    activeMediaAssets: number;
  };
  applied: boolean;
}

interface TenantColumn {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
  data_type: string;
  udt_name: string;
}

interface RequestRow {
  id: string;
  party_id: string | null;
  requester_document_hmac: string | null;
}

interface ExpedienteRow {
  id: string;
  document_number_hmac: string | null;
}

interface SubscriberRow {
  id: string;
  user_id: string | null;
}

interface UserRow {
  id: string;
  deleted_at: Date | string | null;
}

interface FieldRule {
  column: string;
  kind: 'null' | 'marker' | 'false' | 'empty-json' | 'encrypted-marker' | 'legacy-hash';
  marker?: string;
  /** A non-null legacy column can receive a fixed marker instead of aborting. */
  notNullFallback?: 'marker' | 'encrypted-marker' | 'empty-json' | 'legacy-hash';
}

type ExpectedValue =
  | { kind: 'null' }
  | { kind: 'value'; value: string | boolean | null }
  | { kind: 'json-empty' }
  | { kind: 'encrypted-marker'; marker: string }
  | { kind: 'legacy-hash'; marker: string };

interface PlannedField {
  column: string;
  expected: ExpectedValue;
}

const ANONYMIZED = 'ANONIMIZADO';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/iu;

const PERSONAL_RULES: Record<string, FieldRule[]> = {
  expediente_records: [
    { column: 'full_name', kind: 'marker' },
    { column: 'document_type', kind: 'null' },
    { column: 'document_number_encrypted', kind: 'null', notNullFallback: 'encrypted-marker' },
    { column: 'document_number_hmac', kind: 'null' },
    { column: 'document_number_hash', kind: 'legacy-hash', marker: 'document' },
    { column: 'gender', kind: 'null' },
    { column: 'birth_date', kind: 'null' },
    { column: 'person_type', kind: 'null' },
    { column: 'company_name', kind: 'null' },
    { column: 'first_name', kind: 'null' },
    { column: 'last_name', kind: 'null' },
    { column: 'primary_contact_name', kind: 'null' },
    { column: 'primary_contact_role', kind: 'null' },
    { column: 'phone_primary_encrypted', kind: 'null' },
    { column: 'phone_secondary_encrypted', kind: 'null' },
    { column: 'email_primary_encrypted', kind: 'null' },
    { column: 'email_secondary', kind: 'null' },
    { column: 'alt_contact_name', kind: 'null' },
    { column: 'alt_contact_phone_encrypted', kind: 'null' },
    { column: 'contact_preference', kind: 'null' },
    { column: 'best_contact_time', kind: 'null' },
    { column: 'address', kind: 'null' },
    { column: 'municipality', kind: 'null' },
    { column: 'department', kind: 'null' },
    { column: 'postal_code', kind: 'null' },
    { column: 'stratum', kind: 'null' },
    { column: 'neighborhood', kind: 'null' },
    { column: 'zone_type', kind: 'null' },
    { column: 'latitude', kind: 'null' },
    { column: 'longitude', kind: 'null' },
    { column: 'access_references', kind: 'null' },
    { column: 'source_detail', kind: 'null' },
    { column: 'campaign', kind: 'null' },
    { column: 'estimated_budget', kind: 'null' },
    { column: 'commercial_notes', kind: 'null' },
    { column: 'technical_observations', kind: 'null' },
    { column: 'estimated_equipment', kind: 'null' },
    { column: 'identity_verified', kind: 'null' },
    { column: 'document_supports', kind: 'null', notNullFallback: 'empty-json' },
    { column: 'fiscal_name', kind: 'null' },
    { column: 'fiscal_document', kind: 'null' },
    { column: 'fiscal_document_encrypted', kind: 'null' },
    { column: 'fiscal_document_hmac', kind: 'null' },
    { column: 'fiscal_address', kind: 'null' },
    { column: 'rut_reference', kind: 'null' },
    { column: 'installation_address', kind: 'null' },
    { column: 'site_contact_name', kind: 'null' },
    { column: 'site_contact_phone_encrypted', kind: 'null' },
    { column: 'availability_window', kind: 'null' },
    { column: 'special_access_notes', kind: 'null' },
    { column: 'required_materials', kind: 'null' },
    { column: 'discard_reason', kind: 'null' },
    { column: 'last_reschedule_reason', kind: 'null' },
    { column: 'last_reschedule_notes', kind: 'null' },
    { column: 'conformity_evidence_ref', kind: 'null' },
  ],
  contact_attempts: [{ column: 'notes', kind: 'null' }],
  consent_records: [
    { column: 'ip_address', kind: 'null' },
    { column: 'evidence_ref', kind: 'null' },
    { column: 'revoked_reason', kind: 'null' },
  ],
  coverage_checks: [
    { column: 'latitude', kind: 'null' },
    { column: 'longitude', kind: 'null' },
    { column: 'address_used', kind: 'null' },
    { column: 'snapshot_json', kind: 'empty-json', notNullFallback: 'empty-json' },
  ],
  party: [
    { column: 'document_number_hmac', kind: 'null' },
    { column: 'document_number_hash', kind: 'legacy-hash', marker: 'party-document' },
    { column: 'verification_digit', kind: 'null' },
    { column: 'display_name', kind: 'marker' },
    { column: 'legal_name', kind: 'null' },
    { column: 'birth_date', kind: 'null' },
    { column: 'incorporation_date', kind: 'null' },
    { column: 'notes', kind: 'null' },
    { column: 'address', kind: 'null' },
    { column: 'latitude', kind: 'null' },
    { column: 'longitude', kind: 'null' },
    { column: 'city', kind: 'null' },
    { column: 'department', kind: 'null' },
  ],
  party_contact: [
    { column: 'value', kind: 'null', notNullFallback: 'marker' },
    { column: 'value_encrypted', kind: 'null' },
    { column: 'value_hmac', kind: 'null' },
    { column: 'metadata', kind: 'null' },
    { column: 'is_primary', kind: 'false' },
    { column: 'verified_at', kind: 'null' },
  ],
  subscribers: [
    { column: 'document_type', kind: 'null' },
    { column: 'document_number_encrypted', kind: 'null' },
    { column: 'document_number_hmac', kind: 'null' },
    { column: 'document_number_hash', kind: 'legacy-hash', marker: 'subscriber-document' },
    { column: 'email_hmac', kind: 'null' },
    { column: 'email_hash', kind: 'legacy-hash', marker: 'subscriber-email' },
    { column: 'phone_hmac', kind: 'null' },
    { column: 'phone_hash', kind: 'legacy-hash', marker: 'subscriber-phone' },
    { column: 'first_name', kind: 'null' },
    { column: 'last_name', kind: 'null' },
    { column: 'stratum', kind: 'null' },
    { column: 'birth_date', kind: 'null' },
    { column: 'nit', kind: 'null' },
    { column: 'nit_verification_digit', kind: 'null' },
    { column: 'business_name', kind: 'null' },
    { column: 'commercial_name', kind: 'null' },
    { column: 'legal_representative_id', kind: 'null' },
    { column: 'email_encrypted', kind: 'null', notNullFallback: 'encrypted-marker' },
    { column: 'phone_encrypted', kind: 'null', notNullFallback: 'encrypted-marker' },
    { column: 'alt_contact_name', kind: 'null' },
    { column: 'alt_contact_phone_encrypted', kind: 'null' },
    { column: 'whatsapp', kind: 'null' },
    { column: 'whatsapp_encrypted', kind: 'null' },
    { column: 'whatsapp_hmac', kind: 'null' },
    { column: 'address', kind: 'null', notNullFallback: 'marker' },
    { column: 'neighborhood', kind: 'null' },
    { column: 'city', kind: 'null' },
    { column: 'department', kind: 'null' },
    { column: 'postal_code', kind: 'null' },
    { column: 'latitude', kind: 'null' },
    { column: 'longitude', kind: 'null' },
    { column: 'manual_override_reason', kind: 'null' },
    { column: 'external_id', kind: 'null' },
  ],
  users: [
    { column: 'first_name', kind: 'null' },
    { column: 'last_name', kind: 'null' },
    { column: 'phone', kind: 'null' },
    { column: 'job_title', kind: 'null' },
    { column: 'document_type', kind: 'null' },
    { column: 'document_number', kind: 'null' },
    { column: 'avatar_url', kind: 'null' },
    { column: 'email_hash', kind: 'legacy-hash', marker: 'user-email' },
  ],
};

const EXPEDIENTE_CHILD_TABLES = ['contact_attempts', 'consent_records', 'coverage_checks'] as const;

/** Error de alcance/configuración con texto redactado y apto para stdout/stderr. */
class AnonymizeTitularCliError extends Error {}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** TypeORM/Postgres devuelve los UPDATE/DELETE con RETURNING como [filas, rowCount]. */
function updateReturningRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[];
  }
  return result as T[];
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function requiredOptionValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new AnonymizeTitularCliError(`${name} requiere un valor.`);
  return value;
}

/** Parser estricto de flags. Los expedientes pueden repetirse; el resto no. */
export function parseAnonymizeTitularArgs(argv: string[]): AnonymizeTitularFlags {
  const flags: AnonymizeTitularFlags = {
    tenant: null,
    requestId: null,
    expedienteIds: [],
    confirmUnmatched: false,
    mode: 'dry-run',
    help: false,
  };
  const seen = new Set<string>();
  let modeSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--confirm-unmatched') {
      if (flags.confirmUnmatched)
        throw new AnonymizeTitularCliError('--confirm-unmatched no se puede repetir.');
      flags.confirmUnmatched = true;
      continue;
    }
    if (arg === '--dry-run' || arg === '--apply') {
      if (modeSeen) throw new AnonymizeTitularCliError('Usa solo uno de --dry-run o --apply.');
      modeSeen = true;
      flags.mode = arg === '--apply' ? 'apply' : 'dry-run';
      continue;
    }

    const equalsIndex = arg.indexOf('=');
    const name = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const inlineValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : null;
    if (name !== '--tenant' && name !== '--request' && name !== '--expediente') {
      throw new AnonymizeTitularCliError('Argumento desconocido; revisa --help.');
    }
    const value = (inlineValue ?? requiredOptionValue(argv, index, name)).trim();
    if (!value || value.startsWith('--'))
      throw new AnonymizeTitularCliError(`${name} requiere un valor.`);
    if (inlineValue === null) index += 1;

    if (name === '--expediente') {
      if (!isUuid(value))
        throw new AnonymizeTitularCliError('--expediente requiere un UUID válido.');
      if (!flags.expedienteIds.includes(value.toLowerCase())) {
        flags.expedienteIds.push(value.toLowerCase());
      }
      continue;
    }
    if (seen.has(name)) throw new AnonymizeTitularCliError(`${name} no se puede repetir.`);
    seen.add(name);
    if (name === '--request') {
      if (!isUuid(value)) throw new AnonymizeTitularCliError('--request requiere un UUID válido.');
      flags.requestId = value.toLowerCase();
    } else {
      if (!UUID_PATTERN.test(value) && !TENANT_SLUG_PATTERN.test(value)) {
        throw new AnonymizeTitularCliError('--tenant requiere UUID o slug válido.');
      }
      flags.tenant = value.toLowerCase();
    }
  }

  return flags;
}

function buildReport(mode: AnonymizeTitularMode): AnonymizeTitularReport {
  return {
    mode,
    labels: {
      privacyMediaAssets: 'conservada (prueba de autorización)',
    },
    totals: {
      potentialLeads: 0,
      expedienteRecords: 0,
      contactAttempts: 0,
      consentRecords: 0,
      coverageChecks: 0,
      parties: 0,
      partyContacts: 0,
      subscribers: 0,
      users: 0,
      privacyMediaAssets: 0,
      stratumMediaAssets: 0,
      unmatchedExpedientes: 0,
    },
    changed: {
      expedienteRecords: 0,
      contactAttempts: 0,
      consentRecords: 0,
      coverageChecks: 0,
      parties: 0,
      partyContacts: 0,
      subscribers: 0,
      users: 0,
      privacyMediaAssets: 0,
      stratumMediaAssets: 0,
    },
    verification: { residualFields: null, activeMediaAssets: 0 },
    applied: false,
  };
}

async function tenantColumns(queryRunner: QueryRunner): Promise<Map<string, TenantColumn>> {
  const rows = (await queryRunner.query(`
    SELECT table_name, column_name, is_nullable, data_type, udt_name
      FROM information_schema.columns
     WHERE table_schema = current_schema()
  `)) as TenantColumn[];
  return new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
}

function columnOf(columns: Map<string, TenantColumn>, table: string, column: string) {
  return columns.get(`${table}.${column}`);
}

function tableExists(columns: Map<string, TenantColumn>, table: string): boolean {
  return [...columns.keys()].some((key) => key.startsWith(`${table}.`));
}

async function countRows(
  queryRunner: QueryRunner,
  table: string,
  whereSql: string,
  parameters: unknown[],
): Promise<number> {
  const rows = (await queryRunner.query(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)} WHERE ${whereSql}`,
    parameters,
  )) as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
}

function getExpectedValue(rule: FieldRule, column: TenantColumn): ExpectedValue {
  if (rule.kind === 'null') {
    if (column.is_nullable === 'YES') return { kind: 'null' };
    if (rule.notNullFallback === 'marker') {
      return { kind: 'value', value: ANONYMIZED };
    }
    if (rule.notNullFallback === 'encrypted-marker') {
      return { kind: 'encrypted-marker', marker: ANONYMIZED };
    }
    if (rule.notNullFallback === 'empty-json' || column.data_type === 'jsonb') {
      return { kind: 'json-empty' };
    }
    if (rule.notNullFallback === 'legacy-hash') {
      return { kind: 'legacy-hash', marker: rule.marker ?? ANONYMIZED };
    }
    if (column.data_type === 'text' || column.data_type === 'character varying') {
      return { kind: 'value', value: ANONYMIZED };
    }
    throw new AnonymizeTitularCliError(
      `La columna ${column.table_name}.${column.column_name} no admite NULL.`,
    );
  }
  if (rule.kind === 'marker') return { kind: 'value', value: ANONYMIZED };
  if (rule.kind === 'false') return { kind: 'value', value: false };
  if (rule.kind === 'empty-json') return { kind: 'json-empty' };
  if (rule.kind === 'encrypted-marker') {
    return { kind: 'encrypted-marker', marker: rule.marker ?? ANONYMIZED };
  }
  if (column.is_nullable === 'YES') return { kind: 'null' };
  return { kind: 'legacy-hash', marker: rule.marker ?? ANONYMIZED };
}

function sqlValue(expected: ExpectedValue, id: string, keys: AnonymizeTitularKeys): unknown {
  if (expected.kind === 'null') return null;
  if (expected.kind === 'value') return expected.value;
  if (expected.kind === 'json-empty') return '{}';
  if (expected.kind === 'encrypted-marker') {
    return encryptAes256Gcm(expected.marker, keys.activeEncryptionKey);
  }
  return createHash('sha256').update(`${expected.marker}:${id}`, 'utf8').digest('hex');
}

function equalExpected(
  current: unknown,
  expected: ExpectedValue,
  id: string,
  keys: AnonymizeTitularKeys,
): boolean {
  if (expected.kind === 'null') return current === null;
  if (expected.kind === 'value') return current === expected.value;
  if (expected.kind === 'json-empty') {
    if (current === null) return false;
    try {
      const value = typeof current === 'string' ? JSON.parse(current) : current;
      return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
    } catch {
      return false;
    }
  }
  if (expected.kind === 'legacy-hash') {
    return (
      current === createHash('sha256').update(`${expected.marker}:${id}`, 'utf8').digest('hex')
    );
  }
  if (typeof current !== 'string' || current.length === 0) return false;
  try {
    const clear = decryptAes256Gcm(current, keys.activeEncryptionKey, keys.previousEncryptionKey);
    return clear === expected.marker;
  } catch {
    return false;
  }
}

async function updateFixedFields(
  queryRunner: QueryRunner,
  table: string,
  ids: string[],
  fields: PlannedField[],
  columns: Map<string, TenantColumn>,
  keys: AnonymizeTitularKeys,
): Promise<string[]> {
  if (ids.length === 0 || fields.length === 0) return [];
  const values: unknown[] = [];
  const assignments: string[] = [];
  const dirtyConditions: string[] = [];
  for (const field of fields) {
    const parameter = values.length + 1;
    if (field.expected.kind === 'json-empty') {
      values.push('{}');
      assignments.push(`${quoteIdentifier(field.column)} = $${parameter}::jsonb`);
      dirtyConditions.push(
        `${quoteIdentifier(field.column)} IS DISTINCT FROM $${parameter}::jsonb`,
      );
    } else {
      values.push(sqlValue(field.expected, '', keys));
      assignments.push(`${quoteIdentifier(field.column)} = $${parameter}`);
      dirtyConditions.push(`${quoteIdentifier(field.column)} IS DISTINCT FROM $${parameter}`);
    }
  }
  const idsParameter = values.length + 1;
  values.push(ids);
  const updatedAt = columnOf(columns, table, 'updated_at');
  const result: unknown = await queryRunner.query(
    `UPDATE ${quoteIdentifier(table)}
        SET ${assignments.join(', ')}${updatedAt ? ', "updated_at" = CURRENT_TIMESTAMP' : ''}
      WHERE "id" = ANY($${idsParameter}::uuid[])
        AND (${dirtyConditions.join(' OR ')})
      RETURNING "id"`,
    values,
  );
  const rows = updateReturningRows<{ id: string }>(result);
  return rows.map((row) => String(row.id));
}

function planTableFields(
  table: string,
  ids: string[],
  columns: Map<string, TenantColumn>,
): PlannedField[] {
  const tableRules = PERSONAL_RULES[table] ?? [];
  const planned: PlannedField[] = [];
  for (const rule of tableRules) {
    const column = columnOf(columns, table, rule.column);
    if (!column) continue;
    planned.push({ column: rule.column, expected: getExpectedValue(rule, column) });
  }
  if (table === 'party') {
    const documentColumn = columnOf(columns, table, 'document_number');
    if (documentColumn && ids.length > 0) {
      planned.push({
        column: 'document_number',
        expected: { kind: 'encrypted-marker', marker: `${ANONYMIZED}:` },
      });
    }
  }
  return planned;
}

async function readRowsForFields(
  queryRunner: QueryRunner,
  table: string,
  ids: string[],
  fields: PlannedField[],
): Promise<Array<Record<string, unknown>>> {
  if (ids.length === 0 || fields.length === 0) return [];
  const selectedColumns = [...new Set(['id', ...fields.map((field) => field.column)])];
  return (await queryRunner.query(
    `SELECT ${selectedColumns.map(quoteIdentifier).join(', ')}
       FROM ${quoteIdentifier(table)}
      WHERE "id" = ANY($1::uuid[])
      FOR UPDATE`,
    [ids],
  )) as Array<Record<string, unknown>>;
}

function expectedForRow(field: PlannedField, id: string): ExpectedValue {
  if (field.column === 'document_number' && field.expected.kind === 'encrypted-marker') {
    return { kind: 'encrypted-marker', marker: `${ANONYMIZED}:${id}` };
  }
  if (field.expected.kind === 'legacy-hash') {
    return { kind: 'legacy-hash', marker: field.expected.marker };
  }
  return field.expected;
}

async function anonymizeTable(
  queryRunner: QueryRunner,
  table: string,
  ids: string[],
  columns: Map<string, TenantColumn>,
  keys: AnonymizeTitularKeys,
  mode: AnonymizeTitularMode,
): Promise<{ selected: number; changed: number; residual: number }> {
  if (ids.length === 0 || !tableExists(columns, table)) {
    return { selected: 0, changed: 0, residual: 0 };
  }
  const fields = planTableFields(table, ids, columns);
  const currentRows = await readRowsForFields(queryRunner, table, ids, fields);
  const perRowFields = fields.filter(
    (field) => field.expected.kind === 'encrypted-marker' || field.expected.kind === 'legacy-hash',
  );
  const fixedFields = fields.filter((field) => !perRowFields.includes(field));
  const changedIds = new Set<string>();
  let residual = 0;

  if (mode === 'apply') {
    for (const id of await updateFixedFields(queryRunner, table, ids, fixedFields, columns, keys)) {
      changedIds.add(id);
    }
  }

  for (const row of currentRows) {
    const id = String(row['id']);
    for (const field of fields) {
      const expected = expectedForRow(field, id);
      const current = row[field.column];
      if (!equalExpected(current, expected, id, keys)) {
        residual += 1;
        if (
          mode === 'apply' &&
          (expected.kind === 'encrypted-marker' || expected.kind === 'legacy-hash')
        ) {
          const nextValue = sqlValue(expected, id, keys);
          const updateResult: unknown = await queryRunner.query(
            `UPDATE ${quoteIdentifier(table)}
                SET ${quoteIdentifier(field.column)} = $2${columnOf(columns, table, 'updated_at') ? ', "updated_at" = CURRENT_TIMESTAMP' : ''}
              WHERE "id" = $1 AND ${quoteIdentifier(field.column)} IS DISTINCT FROM $2
              RETURNING "id"`,
            [id, nextValue],
          );
          const updates = updateReturningRows<{ id: string }>(updateResult);
          for (const update of updates) changedIds.add(String(update.id));
        }
      }
    }
  }

  if (mode === 'apply') {
    const rows = await readRowsForFields(queryRunner, table, ids, fields);
    residual = 0;
    for (const row of rows) {
      const id = String(row['id']);
      for (const field of fields) {
        if (!equalExpected(row[field.column], expectedForRow(field, id), id, keys)) residual += 1;
      }
    }
  }
  return { selected: currentRows.length, changed: changedIds.size, residual };
}

async function selectChildIds(
  queryRunner: QueryRunner,
  columns: Map<string, TenantColumn>,
  table: (typeof EXPEDIENTE_CHILD_TABLES)[number],
  expedienteIds: string[],
): Promise<string[]> {
  if (expedienteIds.length === 0 || !tableExists(columns, table)) return [];
  if (!columnOf(columns, table, 'expediente_id')) return [];
  const rows = (await queryRunner.query(
    `SELECT id::text FROM ${quoteIdentifier(table)}
      WHERE expediente_id = ANY($1::uuid[]) FOR UPDATE`,
    [expedienteIds],
  )) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

async function safeUpdateMedia(
  queryRunner: QueryRunner,
  ids: string[],
  tenantSchema: string,
  usage: 'stratum_evidence',
  mode: AnonymizeTitularMode,
): Promise<{ selected: number; changed: number; active: number }> {
  if (ids.length === 0) return { selected: 0, changed: 0, active: 0 };
  const table = (await queryRunner.query(
    `SELECT to_regclass('public.media_assets') IS NOT NULL AS present`,
  )) as Array<{ present: boolean }>;
  if (table[0]?.present !== true)
    throw new AnonymizeTitularCliError(
      'La tabla Media no está disponible para verificar la evidencia.',
    );
  const selectedRows = (await queryRunner.query(
    `SELECT id FROM public.media_assets
      WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3
      FOR UPDATE`,
    [ids, tenantSchema, usage],
  )) as Array<{ id: string }>;
  if (selectedRows.length !== new Set(ids).size) {
    throw new AnonymizeTitularCliError('No se pudo verificar toda la evidencia Media del alcance.');
  }
  let changed = 0;
  if (mode === 'apply') {
    const updateResult: unknown = await queryRunner.query(
      `UPDATE public.media_assets
          SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
        WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3 AND deleted_at IS NULL
        RETURNING id`,
      [selectedRows.map((row) => row.id), tenantSchema, usage],
    );
    const updated = updateReturningRows<{ id: string }>(updateResult);
    changed = updated.length;
  }
  const activeRows = (await queryRunner.query(
    `SELECT COUNT(*)::int AS count FROM public.media_assets
      WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3 AND deleted_at IS NULL`,
    [selectedRows.map((row) => row.id), tenantSchema, usage],
  )) as Array<{ count: number }>;
  return {
    selected: selectedRows.length,
    changed,
    active: activeRows[0]?.count ?? 0,
  };
}

async function stratumEvidenceMediaIds(
  queryRunner: QueryRunner,
  columns: Map<string, TenantColumn>,
  subscriberIds: string[],
): Promise<string[]> {
  const stratumCandidates: string[] = [];
  if (
    subscriberIds.length > 0 &&
    tableExists(columns, 'contracts') &&
    columnOf(columns, 'contracts', 'stratum_evidence_media_id') &&
    columnOf(columns, 'contracts', 'subscriber_id')
  ) {
    const rows = (await queryRunner.query(
      `SELECT stratum_evidence_media_id::text AS id
         FROM contracts
        WHERE subscriber_id = ANY($1::uuid[]) AND stratum_evidence_media_id IS NOT NULL
        FOR SHARE`,
      [subscriberIds],
    )) as Array<{ id: string }>;
    stratumCandidates.push(...rows.map((row) => row.id));
  }
  const uniqueStratumCandidates = [...new Set(stratumCandidates)];
  let stratumSafe = uniqueStratumCandidates;
  if (uniqueStratumCandidates.length > 0) {
    const otherRows = (await queryRunner.query(
      `SELECT stratum_evidence_media_id::text AS id
         FROM contracts
        WHERE stratum_evidence_media_id = ANY($1::uuid[])
          AND subscriber_id <> ALL($2::uuid[])
        FOR SHARE`,
      [uniqueStratumCandidates, subscriberIds],
    )) as Array<{ id: string }>;
    const shared = new Set(otherRows.map((row) => row.id));
    stratumSafe = stratumSafe.filter((id) => !shared.has(id));
  }
  return stratumSafe;
}

async function updateUniqueUserFields(
  queryRunner: QueryRunner,
  users: UserRow[],
  columns: Map<string, TenantColumn>,
  keys: AnonymizeTitularKeys,
  mode: AnonymizeTitularMode,
): Promise<{ selected: number; changed: number; residual: number }> {
  if (users.length === 0) return { selected: 0, changed: 0, residual: 0 };
  const emailColumn = columnOf(columns, 'users', 'email');
  const emailHmacColumn = columnOf(columns, 'users', 'email_hmac');
  if (!emailColumn || !emailHmacColumn) {
    throw new AnonymizeTitularCliError(
      'El tenant no tiene las columnas únicas de correo requeridas para users.',
    );
  }
  const personalFields = planTableFields(
    'users',
    users.map((user) => user.id),
    columns,
  );
  const fields: PlannedField[] = [
    ...personalFields,
    { column: 'email', expected: { kind: 'value', value: '' } },
    { column: 'email_hmac', expected: { kind: 'value', value: '' } },
  ];
  const changedUserIds = new Set<string>();
  let residual = 0;
  for (const user of users) {
    const email = `anon+${user.id}@anon.invalid`;
    const emailHmac = hmacPii(email, keys.hashKey);
    const currentRows = (await queryRunner.query(
      `SELECT ${['id', ...fields.map((field) => field.column)].map(quoteIdentifier).join(', ')}
         FROM users WHERE id = $1 FOR UPDATE`,
      [user.id],
    )) as Array<Record<string, unknown>>;
    const current = currentRows[0];
    if (!current) continue;
    const plannedValues = new Map<string, unknown>();
    for (const field of fields) {
      const expected =
        field.column === 'email'
          ? ({ kind: 'value', value: email } as ExpectedValue)
          : field.column === 'email_hmac'
            ? ({ kind: 'value', value: emailHmac } as ExpectedValue)
            : expectedForRow(field, user.id);
      plannedValues.set(field.column, sqlValue(expected, user.id, keys));
      if (!equalExpected(current[field.column], expected, user.id, keys)) residual += 1;
    }
    if (mode === 'apply') {
      const dirtyFields = fields.filter((field) => {
        const expected =
          field.column === 'email'
            ? ({ kind: 'value', value: email } as ExpectedValue)
            : field.column === 'email_hmac'
              ? ({ kind: 'value', value: emailHmac } as ExpectedValue)
              : expectedForRow(field, user.id);
        return !equalExpected(current[field.column], expected, user.id, keys);
      });
      if (dirtyFields.length > 0) {
        const values: unknown[] = [user.id];
        const assignments: string[] = [];
        for (const field of dirtyFields) {
          values.push(plannedValues.get(field.column));
          assignments.push(`${quoteIdentifier(field.column)} = $${values.length}`);
        }
        if (columnOf(columns, 'users', 'updated_at'))
          assignments.push('"updated_at" = CURRENT_TIMESTAMP');
        const updateResult: unknown = await queryRunner.query(
          `UPDATE users SET ${assignments.join(', ')} WHERE id = $1 RETURNING id`,
          values,
        );
        const updated = updateReturningRows<{ id: string }>(updateResult);
        for (const updatedUser of updated) changedUserIds.add(String(updatedUser.id));
      }
    }
  }
  if (mode === 'apply') {
    residual = 0;
    for (const user of users) {
      const email = `anon+${user.id}@anon.invalid`;
      const emailHmac = hmacPii(email, keys.hashKey);
      const rows = (await queryRunner.query(
        `SELECT ${['id', ...fields.map((field) => field.column)].map(quoteIdentifier).join(', ')}
           FROM users WHERE id = $1`,
        [user.id],
      )) as Array<Record<string, unknown>>;
      const row = rows[0];
      if (!row) {
        residual += fields.length;
        continue;
      }
      for (const field of fields) {
        const expected =
          field.column === 'email'
            ? ({ kind: 'value', value: email } as ExpectedValue)
            : field.column === 'email_hmac'
              ? ({ kind: 'value', value: emailHmac } as ExpectedValue)
              : expectedForRow(field, user.id);
        if (!equalExpected(row[field.column], expected, user.id, keys)) residual += 1;
      }
    }
  }
  return { selected: users.length, changed: changedUserIds.size, residual };
}

async function findUserRows(
  queryRunner: QueryRunner,
  columns: Map<string, TenantColumn>,
  userIds: string[],
): Promise<UserRow[]> {
  if (userIds.length === 0) return [];
  if (!tableExists(columns, 'users') || !columnOf(columns, 'users', 'deleted_at')) {
    throw new AnonymizeTitularCliError('No se puede comprobar la baja de las cuentas enlazadas.');
  }
  const rows = (await queryRunner.query(
    `SELECT id::text, deleted_at FROM users WHERE id = ANY($1::uuid[]) FOR UPDATE`,
    [userIds],
  )) as UserRow[];
  if (rows.length !== userIds.length) {
    throw new AnonymizeTitularCliError('No se pudieron comprobar todas las cuentas enlazadas.');
  }
  const activeCount = rows.filter((row) => row.deleted_at === null).length;
  if (activeCount > 0) {
    throw new AnonymizeTitularCliError(
      `Hay ${activeCount} cuenta(s) enlazada(s) activa(s); no se aplicaron cambios.`,
    );
  }
  return rows;
}

async function countChildRows(
  queryRunner: QueryRunner,
  columns: Map<string, TenantColumn>,
  table: (typeof EXPEDIENTE_CHILD_TABLES)[number],
  expedienteIds: string[],
): Promise<number> {
  if (expedienteIds.length === 0 || !tableExists(columns, table)) return 0;
  if (!columnOf(columns, table, 'expediente_id')) return 0;
  return countRows(queryRunner, table, 'expediente_id = ANY($1::uuid[])', [expedienteIds]);
}

async function anonymizeTitularInTransaction(
  queryRunner: QueryRunner,
  tenantSchema: string,
  requestId: string,
  expedienteIds: string[],
  confirmUnmatched: boolean,
  mode: AnonymizeTitularMode,
  keys: AnonymizeTitularKeys,
): Promise<AnonymizeTitularReport> {
  const columns = await tenantColumns(queryRunner);
  if (
    !tableExists(columns, 'data_subject_requests') ||
    !tableExists(columns, 'expediente_records')
  ) {
    throw new AnonymizeTitularCliError(
      'El tenant no tiene las tablas necesarias para privacidad y expedientes.',
    );
  }
  const request = (await queryRunner.query(
    `SELECT id::text, party_id::text, requester_document_hmac
       FROM data_subject_requests WHERE id = $1::uuid FOR SHARE`,
    [requestId],
  )) as RequestRow[];
  if (!request[0]) throw new AnonymizeTitularCliError('No se encontró la solicitud indicada.');
  const requestRow = request[0];

  let potentialLeads = 0;
  if (tableExists(columns, 'potential_leads')) {
    await queryRunner.query(`LOCK TABLE potential_leads IN SHARE MODE`);
    potentialLeads = await countRows(queryRunner, 'potential_leads', 'TRUE', []);
    if (potentialLeads > 0) {
      throw new AnonymizeTitularCliError(
        `potential_leads contiene ${potentialLeads} fila(s); no se aplicaron cambios.`,
      );
    }
  }

  let expedienteRows: ExpedienteRow[] = [];
  if (expedienteIds.length > 0) {
    const hmacColumn = columnOf(columns, 'expediente_records', 'document_number_hmac');
    const hmacSelect = hmacColumn ? 'document_number_hmac' : 'NULL::text AS document_number_hmac';
    expedienteRows = (await queryRunner.query(
      `SELECT id::text, ${hmacSelect}
         FROM expediente_records WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [expedienteIds],
    )) as ExpedienteRow[];
    if (expedienteRows.length !== expedienteIds.length) {
      throw new AnonymizeTitularCliError(
        `No se encontraron ${expedienteIds.length - expedienteRows.length} expediente(s) indicados; no se aplicaron cambios.`,
      );
    }
  }
  let unmatchedExpedientes = 0;
  for (const row of expedienteRows) {
    if (
      requestRow.requester_document_hmac &&
      row.document_number_hmac === requestRow.requester_document_hmac
    ) {
      continue;
    }
    if (!row.document_number_hmac && columnOf(columns, 'expediente_records', 'full_name')) {
      const priorAnonymization = await anonymizeTable(
        queryRunner,
        'expediente_records',
        [row.id],
        columns,
        keys,
        'dry-run',
      );
      if (priorAnonymization.selected === 1 && priorAnonymization.residual === 0) continue;
    }
    unmatchedExpedientes += 1;
  }
  if (unmatchedExpedientes > 0 && !confirmUnmatched) {
    throw new AnonymizeTitularCliError(
      `${unmatchedExpedientes} expediente(s) sin coincidencia HMAC; registra el motivo en el ticket y usa --confirm-unmatched.`,
    );
  }

  const partyId = requestRow.party_id;
  let partyRows: Array<{ id: string }> = [];
  if (partyId) {
    if (!tableExists(columns, 'party'))
      throw new AnonymizeTitularCliError('El Party de la solicitud no está disponible.');
    partyRows = (await queryRunner.query(`SELECT id::text FROM party WHERE id = $1 FOR UPDATE`, [
      partyId,
    ])) as Array<{
      id: string;
    }>;
    if (partyRows.length !== 1)
      throw new AnonymizeTitularCliError('No se encontró el Party de la solicitud.');
  }

  let subscriberRows: SubscriberRow[] = [];
  if (
    partyId &&
    tableExists(columns, 'subscribers') &&
    columnOf(columns, 'subscribers', 'party_id')
  ) {
    const userIdSelect = columnOf(columns, 'subscribers', 'user_id')
      ? 'user_id::text'
      : 'NULL::text AS user_id';
    subscriberRows = (await queryRunner.query(
      `SELECT id::text, ${userIdSelect}
         FROM subscribers WHERE party_id = $1 FOR UPDATE`,
      [partyId],
    )) as SubscriberRow[];
  }
  const subscriberIds = subscriberRows.map((row) => row.id);
  const config = new ConfigService(process.env);
  const crmParticipant = new CrmTitularErasureParticipant(config);
  const userParticipant = new UserAccountErasureParticipant(config);
  const adapter = new CrmPersonalDataErasureAdapter(
    crmParticipant,
    new PartyTitularErasureParticipant(config),
    userParticipant,
    new WfmTitularErasureParticipant(config),
    new ExecutionOrderTitularErasureParticipant(config),
    new OperationalTaskTitularErasureParticipant(config),
    new MediaTitularErasureParticipant(),
  );
  const scope = await adapter.resolveCliScope(
    {
      requestId,
      partyId,
      requesterDocumentHmac: requestRow.requester_document_hmac,
    },
    expedienteIds,
    queryRunner,
    tenantSchema,
    keys,
  );
  const userIds = scope.userIds;
  if (userIds.length > 0 && !tableExists(columns, 'users')) {
    throw new AnonymizeTitularCliError('No se puede comprobar la baja de las cuentas enlazadas.');
  }
  const users = await findUserRows(queryRunner, columns, userIds);
  const stratumMediaIds = await stratumEvidenceMediaIds(queryRunner, columns, subscriberIds);
  scope.relatedIds ??= {};
  const stratumMedia = await safeUpdateMedia(
    queryRunner,
    stratumMediaIds,
    tenantSchema,
    'stratum_evidence',
    'dry-run',
  );

  const report = buildReport(mode);
  report.totals.potentialLeads = potentialLeads;
  report.totals.expedienteRecords = expedienteRows.length;
  report.totals.contactAttempts = await countChildRows(
    queryRunner,
    columns,
    'contact_attempts',
    expedienteIds,
  );
  report.totals.consentRecords = await countChildRows(
    queryRunner,
    columns,
    'consent_records',
    expedienteIds,
  );
  report.totals.coverageChecks = await countChildRows(
    queryRunner,
    columns,
    'coverage_checks',
    expedienteIds,
  );
  report.totals.parties = partyRows.length;
  report.totals.partyContacts =
    partyId && tableExists(columns, 'party_contact')
      ? await countRows(queryRunner, 'party_contact', 'party_id = $1::uuid', [partyId])
      : 0;
  report.totals.subscribers = subscriberRows.length;
  report.totals.users = users.length;
  report.totals.stratumMediaAssets = stratumMedia.selected;
  report.totals.unmatchedExpedientes = unmatchedExpedientes;
  report.verification.activeMediaAssets = stratumMedia.active;

  const participantResults = await adapter.applyScope(scope, queryRunner, mode);
  for (const result of participantResults) {
    if (result.selected > 0 && result.table === 'visit_requests') {
      report.totals.visitRequests = result.selected;
    }
    if (result.selected > 0 && result.table === 'schedule_events') {
      report.totals.scheduleEvents = result.selected;
    }
    if (result.selected > 0 && result.table === 'execution_orders') {
      report.totals.executionOrders = result.selected;
    }
  }
  if (mode === 'dry-run') return report;

  report.verification.activeMediaAssets = 0;
  let residualFields = 0;
  const changedKeys: Partial<Record<string, keyof AnonymizeTitularReport['changed']>> = {
    expediente_records: 'expedienteRecords',
    contact_attempts: 'contactAttempts',
    consent_records: 'consentRecords',
    coverage_checks: 'coverageChecks',
    party: 'parties',
    party_contact: 'partyContacts',
    subscribers: 'subscribers',
    users: 'users',
    'media_assets:privacy_evidence': 'privacyMediaAssets',
    'media_assets:stratum_evidence': 'stratumMediaAssets',
    visit_requests: 'visitRequests',
    schedule_events: 'scheduleEvents',
    execution_orders: 'executionOrders',
  };
  for (const result of participantResults) {
    const key = changedKeys[result.table];
    if (
      key &&
      (result.selected > 0 || !['visitRequests', 'scheduleEvents', 'executionOrders'].includes(key))
    ) {
      report.changed[key] = result.changed;
    }
    residualFields += result.residual;
    if (result.table.startsWith('media_assets:')) {
      report.verification.activeMediaAssets += result.residual;
    }
  }
  report.verification.residualFields = residualFields;
  report.applied = true;
  if (residualFields > 0 || report.verification.activeMediaAssets > 0) {
    throw new AnonymizeTitularCliError(
      'La verificación posterior encontró campos o evidencia sin anonimizar; se revirtió la transacción.',
    );
  }
  return report;
}

/** Ejecuta dry-run o apply en una transacción con SET LOCAL search_path. */
export async function anonymizeTitularInTenantSchema(
  dataSource: DataSource,
  schemaName: string,
  requestId: string,
  expedienteIds: string[],
  confirmUnmatched: boolean,
  keys: AnonymizeTitularKeys,
  mode: AnonymizeTitularMode,
): Promise<AnonymizeTitularReport> {
  if (!isValidSchemaName(schemaName)) throw new AnonymizeTitularCliError('Schema tenant inválido.');
  if (!isUuid(requestId) || expedienteIds.some((id) => !isUuid(id))) {
    throw new AnonymizeTitularCliError('Solicitud o expediente con UUID inválido.');
  }
  return runInTenantSchema(dataSource, schemaName, (queryRunner) =>
    anonymizeTitularInTransaction(
      queryRunner,
      schemaName,
      requestId,
      [...new Set(expedienteIds.map((id) => id.toLowerCase()))],
      confirmUnmatched,
      mode,
      keys,
    ),
  );
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

function loadKeys(config: ConfigService): AnonymizeTitularKeys {
  const { activeKey, previousKey } = loadPiiAesGcmKeyPair(config);
  return {
    hashKey: resolvePiiHashKey(config),
    activeEncryptionKey: activeKey,
    previousEncryptionKey: previousKey,
  };
}

async function resolveTenantSchema(
  dataSource: DataSource,
  tenantRef: string,
): Promise<{ schemaName: string }> {
  const uuid = isUuid(tenantRef);
  const rows = uuid
    ? await dataSource.query(
        `SELECT schema_name, status FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
        [tenantRef],
      )
    : await dataSource.query(
        `SELECT schema_name, status FROM public.tenants WHERE slug = $1 LIMIT 1`,
        [tenantRef],
      );
  const tenant = (rows as Array<{ schema_name: string; status: string }>)[0];
  if (!tenant || tenant.status !== 'ACTIVE' || !isValidSchemaName(tenant.schema_name)) {
    throw new AnonymizeTitularCliError('Tenant inexistente, inactivo o con schema inválido.');
  }
  return { schemaName: tenant.schema_name };
}

function printHelp(): void {
  process.stdout.write(
    `Anonimización asistida de titular (multi-tenant)\n\n` +
      `Uso: pnpm --filter @iwana/api exec node dist/cli/anonymize-titular.js --tenant <uuid|slug> --request <uuid> [--expediente <uuid> ...] [--confirm-unmatched] [--apply]\n\n` +
      `--dry-run              Predeterminado; informa conteos sin cambiar datos.\n` +
      `--apply                Anonimiza en una sola transacción y verifica el resultado.\n` +
      `--expediente           Puede repetirse. Si falta o no coincide el HMAC, requiere confirmación.\n` +
      `--confirm-unmatched    Exige que el motivo ya conste en el ticket.\n`,
  );
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();
  const flags = parseAnonymizeTitularArgs(process.argv.slice(2));
  if (flags.help) return printHelp();
  if (!flags.tenant || !flags.requestId) {
    throw new AnonymizeTitularCliError('Debes indicar --tenant y --request.');
  }

  const config = new ConfigService(process.env);
  const keys = loadKeys(config);
  await AppDataSource.initialize();
  try {
    const tenant = await resolveTenantSchema(AppDataSource, flags.tenant);
    const report = await anonymizeTitularInTenantSchema(
      AppDataSource,
      tenant.schemaName,
      flags.requestId,
      flags.expedienteIds,
      flags.confirmUnmatched,
      keys,
      flags.mode,
    );
    process.stdout.write(
      '[PRIVACY-ANONYMIZE] evidencia de autorización conservada (prueba de autorización); resultado sin identificadores personales\n',
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message =
      error instanceof AnonymizeTitularCliError
        ? error.message
        : 'La operación no se completó. No se exponen detalles sensibles; verifica la conexión y el alcance operativo.';
    process.stderr.write(`[PRIVACY-ANONYMIZE] ${message}\n`);
    process.exitCode = 1;
  });
}
