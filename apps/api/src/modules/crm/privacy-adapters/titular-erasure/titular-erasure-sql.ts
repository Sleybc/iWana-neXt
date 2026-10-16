import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../../../common/crypto/aes-gcm.util';
import { hmacPii, resolvePiiHashKey } from '../../../../common/crypto/pii-hash-key.util';

export interface TenantColumn {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
  data_type: string;
  udt_name: string;
}

export interface ErasureKeys {
  hashKey: Buffer;
  activeEncryptionKey: Buffer;
  previousEncryptionKey: Buffer | readonly Buffer[] | null;
}

export interface FieldRule {
  column: string;
  kind: 'null' | 'marker' | 'false' | 'empty-json' | 'encrypted-marker' | 'legacy-hash';
  marker?: string;
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

export const ANONYMIZED = 'ANONIMIZADO';

export function loadErasureKeys(config: ConfigService): ErasureKeys {
  const { activeKey, previousKey } = loadPiiAesGcmKeyPair(config);
  return {
    hashKey: resolvePiiHashKey(config),
    activeEncryptionKey: activeKey,
    previousEncryptionKey: previousKey,
  };
}

export function hmacForErasure(value: string, key: Buffer): string {
  return hmacPii(value, key);
}

export function quoteErasureIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function readTenantColumns(qr: QueryRunner): Promise<Map<string, TenantColumn>> {
  const rows = (await qr.query(`
    SELECT table_name, column_name, is_nullable, data_type, udt_name
      FROM information_schema.columns
     WHERE table_schema = current_schema()
  `)) as TenantColumn[];
  return new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
}

export async function selectErasureIds(
  qr: QueryRunner,
  table: string,
  columns: Map<string, TenantColumn>,
  predicates: string[],
  parameters: unknown[],
): Promise<string[]> {
  if (!tableExists(columns, table) || !columnOf(columns, table, 'id') || predicates.length === 0) {
    return [];
  }
  const rows = normalizeErasureRows<{ id: string }>(
    await qr.query(
      `SELECT "id"::text AS id FROM ${quoteErasureIdentifier(table)}
        WHERE (${predicates.join(' OR ')}) ORDER BY "id"::text FOR UPDATE`,
      parameters,
    ),
  );
  return [...new Set(rows.map((row) => row.id))];
}

export async function selectErasureColumnValues(
  qr: QueryRunner,
  table: string,
  column: string,
  ids: string[],
  columns: Map<string, TenantColumn>,
): Promise<string[]> {
  if (
    ids.length === 0 ||
    !tableExists(columns, table) ||
    !columnOf(columns, table, 'id') ||
    !columnOf(columns, table, column)
  ) {
    return [];
  }
  const rows = normalizeErasureRows<{ value: string }>(
    await qr.query(
      `SELECT ${quoteErasureIdentifier(column)}::text AS value
         FROM ${quoteErasureIdentifier(table)}
        WHERE "id" = ANY($1::uuid[]) AND ${quoteErasureIdentifier(column)} IS NOT NULL
        FOR UPDATE`,
      [ids],
    ),
  );
  return [...new Set(rows.map((row) => row.value))];
}

export function columnOf(
  columns: Map<string, TenantColumn>,
  table: string,
  column: string,
): TenantColumn | undefined {
  return columns.get(`${table}.${column}`);
}

export function tableExists(columns: Map<string, TenantColumn>, table: string): boolean {
  return [...columns.keys()].some((key) => key.startsWith(`${table}.`));
}

function expectedFromRule(rule: FieldRule, column: TenantColumn): ExpectedValue {
  if (rule.kind === 'null') {
    if (column.is_nullable === 'YES') return { kind: 'null' };
    if (rule.notNullFallback === 'marker') return { kind: 'value', value: ANONYMIZED };
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
    throw new Error(`La columna ${column.table_name}.${column.column_name} no admite NULL.`);
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

function sqlValue(expected: ExpectedValue, id: string, keys: ErasureKeys): unknown {
  if (expected.kind === 'null') return null;
  if (expected.kind === 'value') return expected.value;
  if (expected.kind === 'json-empty') return '{}';
  if (expected.kind === 'encrypted-marker') {
    return encryptAes256Gcm(expected.marker, keys.activeEncryptionKey);
  }
  return createHash('sha256').update(`${expected.marker}:${id}`, 'utf8').digest('hex');
}

function isExpected(
  current: unknown,
  expected: ExpectedValue,
  id: string,
  keys: ErasureKeys,
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
    return (
      decryptAes256Gcm(current, keys.activeEncryptionKey, keys.previousEncryptionKey) ===
      expected.marker
    );
  } catch {
    return false;
  }
}

function expectedForRow(field: PlannedField, id: string): ExpectedValue {
  if (field.column === 'document_number' && field.expected.kind === 'encrypted-marker') {
    return { kind: 'encrypted-marker', marker: `${ANONYMIZED}:${id}` };
  }
  return field.expected;
}

function planFields(
  table: string,
  rules: FieldRule[],
  columns: Map<string, TenantColumn>,
): PlannedField[] {
  return rules.flatMap((rule) => {
    const column = columnOf(columns, table, rule.column);
    return column ? [{ column: rule.column, expected: expectedFromRule(rule, column) }] : [];
  });
}

export function normalizeErasureRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[];
  }
  return result as T[];
}

export async function anonymizeConfiguredTable(
  qr: QueryRunner,
  table: string,
  ids: string[],
  rules: FieldRule[],
  columns: Map<string, TenantColumn>,
  keys: ErasureKeys,
  mode: 'dry-run' | 'apply',
  extraField?: PlannedField,
): Promise<{ selected: number; changed: number; residual: number }> {
  if (ids.length === 0 || !tableExists(columns, table)) {
    return { selected: 0, changed: 0, residual: 0 };
  }
  const fields = [...planFields(table, rules, columns), ...(extraField ? [extraField] : [])];
  if (fields.length === 0) return { selected: ids.length, changed: 0, residual: 0 };
  const selected = [...new Set(['id', ...fields.map((field) => field.column)])];
  const rows = (await qr.query(
    `SELECT ${selected.map(quoteErasureIdentifier).join(', ')}
       FROM ${quoteErasureIdentifier(table)}
      WHERE id = ANY($1::uuid[])
      FOR UPDATE`,
    [ids],
  )) as Array<Record<string, unknown>>;
  const changedIds = new Set<string>();
  let residual = 0;

  if (mode === 'apply') {
    for (const row of rows) {
      const id = String(row['id']);
      const dirty = fields.filter(
        (field) => !isExpected(row[field.column], expectedForRow(field, id), id, keys),
      );
      if (dirty.length === 0) continue;
      const values: unknown[] = [id];
      const assignments = dirty.map((field) => {
        values.push(sqlValue(expectedForRow(field, id), id, keys));
        return `${quoteErasureIdentifier(field.column)} = $${values.length}`;
      });
      if (columnOf(columns, table, 'updated_at'))
        assignments.push('"updated_at" = CURRENT_TIMESTAMP');
      const updated = normalizeErasureRows<{ id: string }>(
        await qr.query(
          `UPDATE ${quoteErasureIdentifier(table)} SET ${assignments.join(', ')}
            WHERE id = $1 RETURNING id`,
          values,
        ),
      );
      for (const entry of updated) changedIds.add(String(entry.id));
    }
  }

  const verifyRows =
    mode === 'apply'
      ? ((await qr.query(
          `SELECT ${selected.map(quoteErasureIdentifier).join(', ')}
             FROM ${quoteErasureIdentifier(table)} WHERE id = ANY($1::uuid[])`,
          [ids],
        )) as Array<Record<string, unknown>>)
      : rows;
  for (const row of verifyRows) {
    const id = String(row['id']);
    for (const field of fields) {
      if (!isExpected(row[field.column], expectedForRow(field, id), id, keys)) residual += 1;
    }
  }
  return { selected: rows.length, changed: changedIds.size, residual };
}

export async function markAnonymizedRows(
  qr: QueryRunner,
  table: string,
  ids: string[],
  requestId: string,
  columns: Map<string, TenantColumn>,
): Promise<{ changed: number; residual: number }> {
  const markedAt = columnOf(columns, table, 'anonymized_at');
  const markedRequest = columnOf(columns, table, 'anonymized_request_id');
  if (!markedAt || !markedRequest) {
    if (ids.length > 0) throw new Error(`La marca de anonimización no está instalada en ${table}.`);
    return { changed: 0, residual: 0 };
  }
  if (ids.length === 0) return { changed: 0, residual: 0 };
  const updated = normalizeErasureRows<{ id: string }>(
    await qr.query(
      `UPDATE ${quoteErasureIdentifier(table)}
          SET anonymized_at = COALESCE(anonymized_at, now()),
              anonymized_request_id = COALESCE(anonymized_request_id, $2::uuid)
        WHERE id = ANY($1::uuid[])
          AND (anonymized_at IS NULL OR anonymized_request_id IS NULL)
        RETURNING id`,
      [ids, requestId],
    ),
  );
  const rows = (await qr.query(
    `SELECT id, anonymized_at IS NOT NULL AND anonymized_request_id IS NOT NULL AS marked
       FROM ${quoteErasureIdentifier(table)} WHERE id = ANY($1::uuid[])`,
    [ids],
  )) as Array<{ id: string; marked: boolean }>;
  return {
    changed: updated.length,
    residual: rows.filter((row) => !row.marked).length,
  };
}
