import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import type { ErasureCategory } from '@iwana/shared';
import {
  ANONYMIZED,
  anonymizeConfiguredTable,
  columnOf,
  loadErasureKeys,
  markAnonymizedRows,
  normalizeErasureRows,
  quoteErasureIdentifier,
  readTenantColumns,
  selectErasureColumnValues,
  selectErasureIds,
  tableExists,
  type ErasureKeys,
  type FieldRule,
  type TenantColumn,
} from './titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from './titular-erasure.types';

const CRM_RULES: Record<string, FieldRule[]> = {
  expediente_records: [
    { column: 'full_name', kind: 'marker' },
    { column: 'source', kind: 'marker', marker: 'OTRO' },
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
  subscribers: [
    { column: 'document_type', kind: 'marker' },
    { column: 'document_number_encrypted', kind: 'null' },
    { column: 'document_number_hmac', kind: 'null' },
    { column: 'document_number_hash', kind: 'legacy-hash', marker: 'subscriber-document' },
    { column: 'email_hmac', kind: 'null' },
    { column: 'email_hash', kind: 'legacy-hash', marker: 'subscriber-email' },
    { column: 'phone_hmac', kind: 'null' },
    { column: 'phone_hash', kind: 'legacy-hash', marker: 'subscriber-phone' },
    { column: 'first_name', kind: 'marker' },
    { column: 'last_name', kind: 'marker' },
    { column: 'stratum', kind: 'integer-marker' },
    { column: 'birth_date', kind: 'null' },
    { column: 'nit', kind: 'marker' },
    { column: 'nit_verification_digit', kind: 'null' },
    { column: 'business_name', kind: 'marker' },
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
  operational_responsibility_history: [{ column: 'notes', kind: 'null' }],
  status_changes: [{ column: 'reason', kind: 'null' }],
  sales_attributions: [
    { column: 'notes', kind: 'null' },
    { column: 'revoked_reason', kind: 'null' },
  ],
  subscriber_tax_assignments: [{ column: 'reason', kind: 'null' }],
  crm_lifecycle_changes: [{ column: 'note_encrypted', kind: 'null' }],
};

const CONTRACT_LOCATION_RULES: FieldRule[] = [
  { column: 'installation_city', kind: 'null' },
  { column: 'installation_department', kind: 'null' },
  { column: 'installation_stratum', kind: 'integer-marker' },
  { column: 'installation_address', kind: 'null' },
  { column: 'installation_postal_code', kind: 'null' },
  { column: 'installation_notes', kind: 'null' },
];

const CONTRACT_FISCAL_RULES: FieldRule[] = [
  { column: 'fiscal_name', kind: 'null' },
  { column: 'fiscal_document', kind: 'null' },
  { column: 'fiscal_document_encrypted', kind: 'null' },
  { column: 'fiscal_document_hmac', kind: 'null' },
  { column: 'fiscal_address', kind: 'null' },
];

const CONTRACT_COMMERCIAL_RULES: FieldRule[] = [{ column: 'alias', kind: 'marker' }];

const CHILD_TABLES = ['contact_attempts', 'consent_records', 'coverage_checks'] as const;

const SNAPSHOT_PERSONAL_KEYS = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'latitude',
  'longitude',
  'email',
]);

function isPersonalSnapshotKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/giu, '').toLowerCase();
  return (
    SNAPSHOT_PERSONAL_KEYS.has(normalized) ||
    normalized.startsWith('document') ||
    normalized.startsWith('phone') ||
    normalized.startsWith('address') ||
    normalized.startsWith('fiscal')
  );
}

function redactSnapshot(value: unknown): { value: unknown; changed: boolean; residual: number } {
  if (Array.isArray(value)) {
    let changed = false;
    let residual = 0;
    const next = value.map((item) => {
      const redacted = redactSnapshot(item);
      changed ||= redacted.changed;
      residual += redacted.residual;
      return redacted.value;
    });
    return { value: next, changed, residual };
  }
  if (typeof value !== 'object' || value === null) return { value, changed: false, residual: 0 };
  let changed = false;
  let residual = 0;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isPersonalSnapshotKey(key)) {
      changed = true;
      continue;
    }
    const redacted = redactSnapshot(item);
    changed ||= redacted.changed;
    residual += redacted.residual;
    next[key] = redacted.value;
  }
  return { value: next, changed, residual };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function redactSnapshots(
  qr: QueryRunner,
  table: 'contracts' | 'quotes',
  ids: string[],
  snapshotColumns: string[],
  mode: 'dry-run' | 'apply',
  updatedAtAdvanced: Set<string>,
): Promise<{ selected: number; changed: number; residual: number }> {
  if (ids.length === 0 || snapshotColumns.length === 0) {
    return { selected: 0, changed: 0, residual: 0 };
  }
  const projection = ['id', ...snapshotColumns].map((column) => `"${column}"`).join(', ');
  const rows = (await qr.query(
    `SELECT ${projection} FROM "${table}" WHERE id = ANY($1::uuid[]) FOR UPDATE`,
    [ids],
  )) as Array<Record<string, unknown>>;
  const columns = await readTenantColumns(qr);
  let changed = 0;
  let residual = 0;
  for (const row of rows) {
    const rowId = String(row['id']);
    let rowChanged = false;
    for (const column of snapshotColumns) {
      const current = parseJson(row[column]);
      const result = redactSnapshot(current);
      if (result.changed) {
        rowChanged = true;
        if (mode === 'apply') {
          const versionKey = `${table}:${rowId}`;
          const shouldAdvanceUpdatedAt =
            columnOf(columns, table, 'updated_at') && !updatedAtAdvanced.has(versionKey);
          const updated = (await qr.query(
            `UPDATE "${table}" SET "${column}" = $2::jsonb${shouldAdvanceUpdatedAt ? ", updated_at = GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')" : ''}
              WHERE id = $1 AND "${column}" IS DISTINCT FROM $2::jsonb RETURNING id`,
            [rowId, JSON.stringify(result.value)],
          )) as Array<{ id: string }>;
          if (shouldAdvanceUpdatedAt && updated[0]) updatedAtAdvanced.add(versionKey);
        }
      }
      residual += result.residual;
      if (mode === 'dry-run' && result.changed) residual += 1;
    }
    if (rowChanged) changed += 1;
  }
  if (mode === 'apply') {
    residual = 0;
    const after = (await qr.query(
      `SELECT ${projection} FROM "${table}" WHERE id = ANY($1::uuid[])`,
      [ids],
    )) as Array<Record<string, unknown>>;
    for (const row of after) {
      for (const column of snapshotColumns) {
        residual += redactSnapshot(parseJson(row[column])).residual;
        const check = redactSnapshot(parseJson(row[column]));
        if (check.changed) residual += 1;
      }
    }
  }
  return { selected: rows.length, changed, residual };
}

function fieldResult(
  table: string,
  category: ErasureCategory,
  result: { selected: number; changed: number; residual: number },
): TitularErasureTableResult {
  return { table, category, ...result };
}

async function selectNonNullTextRows(
  qr: QueryRunner,
  table: string,
  columns: Map<string, TenantColumn>,
  scopePredicates: string[],
  parameters: unknown[],
  textColumns: string[],
): Promise<{ ids: string[]; selected: number }> {
  const availableTextColumns = textColumns.filter((column) => columnOf(columns, table, column));
  if (availableTextColumns.length === 0 || scopePredicates.length === 0) {
    return { ids: [], selected: 0 };
  }

  const nonNullPredicate = availableTextColumns
    .map((column) => `${quoteErasureIdentifier(column)} IS NOT NULL`)
    .join(' OR ');
  const ids = await selectErasureIds(
    qr,
    table,
    columns,
    [`(${scopePredicates.join(' OR ')}) AND (${nonNullPredicate})`],
    parameters,
  );
  if (ids.length === 0) return { ids, selected: 0 };

  const countExpression = availableTextColumns
    .map((column) => `COUNT(${quoteErasureIdentifier(column)})`)
    .join(' + ');
  const countRows = normalizeErasureRows<{ selected: number | string }>(
    await qr.query(
      `SELECT (${countExpression})::int AS selected
         FROM ${quoteErasureIdentifier(table)}
        WHERE "id" = ANY($1::uuid[])`,
      [ids],
    ),
  );
  return { ids, selected: Number(countRows[0]?.selected ?? 0) };
}

async function anonymizeNonNullTextRows(
  qr: QueryRunner,
  table: string,
  category: ErasureCategory,
  columns: Map<string, TenantColumn>,
  scopePredicates: string[],
  parameters: unknown[],
  rules: FieldRule[],
  keys: ErasureKeys,
  mode: 'dry-run' | 'apply',
  updatedAtAdvanced: Set<string>,
): Promise<TitularErasureTableResult> {
  const selected = await selectNonNullTextRows(
    qr,
    table,
    columns,
    scopePredicates,
    parameters,
    rules.map((rule) => rule.column),
  );
  const result = await anonymizeConfiguredTable(
    qr,
    table,
    selected.ids,
    rules,
    columns,
    keys,
    mode,
    undefined,
    updatedAtAdvanced,
  );
  return fieldResult(table, category, { ...result, selected: selected.selected });
}

@Injectable()
export class CrmTitularErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}

  async resolveScope(scope: TitularErasureScope, qr: QueryRunner): Promise<void> {
    const related = (scope.relatedIds ??= {});
    const columns = await readTenantColumns(qr);
    const contractIds = await this.idsForContracts(qr, columns, scope.subscriberIds);
    related.contractIds = contractIds;
    const candidateIds = await selectErasureColumnValues(
      qr,
      'contracts',
      'stratum_evidence_media_id',
      contractIds,
      columns,
    );
    const uniqueCandidates = [...new Set(candidateIds)];
    if (
      uniqueCandidates.length > 0 &&
      columnOf(columns, 'contracts', 'subscriber_id') &&
      columnOf(columns, 'contracts', 'stratum_evidence_media_id')
    ) {
      const sharedRows = (await qr.query(
        `SELECT stratum_evidence_media_id::text AS id FROM contracts
          WHERE stratum_evidence_media_id = ANY($1::uuid[])
            AND (subscriber_id IS NULL OR subscriber_id <> ALL($2::uuid[])) FOR SHARE`,
        [uniqueCandidates, scope.subscriberIds],
      )) as Array<{ id: string }>;
      const shared = new Set(sharedRows.map((row) => row.id));
      related.stratumEvidenceMediaIds = uniqueCandidates.filter((id) => !shared.has(id));
    } else {
      related.stratumEvidenceMediaIds = uniqueCandidates;
    }
  }

  async findExpedienteIdsByDocumentHmac(qr: QueryRunner, hmac: string): Promise<string[]> {
    const columns = await readTenantColumns(qr);
    if (
      !columnOf(columns, 'expediente_records', 'document_number_hmac') ||
      !tableExists(columns, 'expediente_records')
    ) {
      return [];
    }
    const rows = (await qr.query(
      `SELECT id::text FROM expediente_records
        WHERE document_number_hmac = $1 ORDER BY id::text FOR SHARE`,
      [hmac],
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  async findSubscriberIds(qr: QueryRunner, partyId: string | null): Promise<string[]> {
    if (!partyId) return [];
    const columns = await readTenantColumns(qr);
    if (!tableExists(columns, 'subscribers') || !columnOf(columns, 'subscribers', 'party_id')) {
      return [];
    }
    const rows = (await qr.query(
      `SELECT id::text FROM subscribers WHERE party_id = $1 ORDER BY id::text FOR UPDATE`,
      [partyId],
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  async plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, 'dry-run');
  }

  async apply(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, mode);
  }

  private async run(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    const columns = await readTenantColumns(qr);
    const keys = scope.cryptoKeys ?? loadErasureKeys(this.config);
    const results: TitularErasureTableResult[] = [];
    const updatedAtAdvanced = new Set<string>();
    const idSets: Record<string, string[]> = {
      expediente_records: scope.expedienteIds,
      subscribers: scope.subscriberIds,
    };
    for (const table of ['expediente_records', 'subscribers'] as const) {
      // D-K2A-3: el CHECK de la 176 solo admite el documento en NULL en una fila ya marcada.
      if (mode === 'apply' && table === 'subscribers') {
        if (!scope.requestId)
          throw new Error('Falta el identificador de la solicitud de supresión.');
        const marker = await markAnonymizedRows(
          qr,
          table,
          scope.subscriberIds,
          scope.requestId,
          columns,
          updatedAtAdvanced,
        );
        if (marker.residual > 0)
          throw new Error('No se pudo verificar la marca de anonimización de suscriptores.');
      }
      const result = await anonymizeConfiguredTable(
        qr,
        table,
        idSets[table] ?? [],
        CRM_RULES[table] ?? [],
        columns,
        keys,
        mode,
        undefined,
        updatedAtAdvanced,
      );
      results.push(
        fieldResult(table, table === 'subscribers' ? 'IDENTIFICACION' : 'IDENTIFICACION', result),
      );
      if (mode === 'apply' && table === 'expediente_records') {
        if (!scope.requestId)
          throw new Error('Falta el identificador de la solicitud de supresión.');
        const marker = await markAnonymizedRows(
          qr,
          table,
          scope.expedienteIds,
          scope.requestId,
          columns,
          updatedAtAdvanced,
        );
        if (marker.residual > 0)
          throw new Error('No se pudo verificar la marca de anonimización de expedientes.');
      }
    }

    for (const table of CHILD_TABLES) {
      const childIds = await this.childIds(qr, columns, table, scope.expedienteIds);
      const category: ErasureCategory =
        table === 'contact_attempts'
          ? 'CONTACTO'
          : table === 'consent_records'
            ? 'EVIDENCIA_CONSENTIMIENTO'
            : 'UBICACION';
      results.push(
        fieldResult(
          table,
          category,
          await anonymizeConfiguredTable(
            qr,
            table,
            childIds,
            CRM_RULES[table] ?? [],
            columns,
            keys,
            mode,
            undefined,
            updatedAtAdvanced,
          ),
        ),
      );
    }

    const lifecycleChangeIds = await selectErasureIds(
      qr,
      'crm_lifecycle_changes',
      columns,
      scope.subscriberIds.length > 0
        ? ['subscriber_id = ANY($1::uuid[]) AND note_encrypted IS NOT NULL']
        : [],
      scope.subscriberIds.length > 0 ? [scope.subscriberIds] : [],
    );
    results.push(
      fieldResult(
        'crm_lifecycle_changes',
        'COMERCIAL',
        await anonymizeConfiguredTable(
          qr,
          'crm_lifecycle_changes',
          lifecycleChangeIds,
          CRM_RULES['crm_lifecycle_changes'] ?? [],
          columns,
          keys,
          mode,
          undefined,
          updatedAtAdvanced,
        ),
      ),
    );

    for (const [table, category] of [
      ['operational_responsibility_history', 'OPERACION_CAMPO'],
      ['status_changes', 'OPERACION_CAMPO'],
      ['sales_attributions', 'COMERCIAL'],
    ] as const) {
      results.push(
        await anonymizeNonNullTextRows(
          qr,
          table,
          category,
          columns,
          scope.expedienteIds.length > 0 ? ['expediente_id = ANY($1::uuid[])'] : [],
          scope.expedienteIds.length > 0 ? [scope.expedienteIds] : [],
          CRM_RULES[table] ?? [],
          keys,
          mode,
          updatedAtAdvanced,
        ),
      );
    }

    const taxProfileIds = await selectErasureIds(
      qr,
      'subscriber_tax_profiles',
      columns,
      scope.subscriberIds.length > 0 ? ['subscriber_id = ANY($1::uuid[])'] : [],
      scope.subscriberIds.length > 0 ? [scope.subscriberIds] : [],
    );
    results.push(
      await anonymizeNonNullTextRows(
        qr,
        'subscriber_tax_assignments',
        'FISCAL',
        columns,
        taxProfileIds.length > 0 ? ['profile_id = ANY($1::uuid[])'] : [],
        taxProfileIds.length > 0 ? [taxProfileIds] : [],
        CRM_RULES['subscriber_tax_assignments'] ?? [],
        keys,
        mode,
        updatedAtAdvanced,
      ),
    );

    const contracts =
      scope.relatedIds?.contractIds ??
      (await this.idsForContracts(qr, columns, scope.subscriberIds));
    for (const [category, rules] of [
      ['UBICACION', CONTRACT_LOCATION_RULES],
      ['FISCAL', CONTRACT_FISCAL_RULES],
      ['COMERCIAL', CONTRACT_COMMERCIAL_RULES],
    ] as const) {
      results.push(
        fieldResult(
          'contracts',
          category,
          await anonymizeConfiguredTable(
            qr,
            'contracts',
            contracts,
            rules,
            columns,
            keys,
            mode,
            undefined,
            updatedAtAdvanced,
          ),
        ),
      );
    }
    const contractColumns = ['vat_snapshot', 'plan_snapshot_json'].filter((column) =>
      columnOf(columns, 'contracts', column),
    );
    results.push(
      fieldResult(
        'contracts',
        'COMERCIAL',
        await redactSnapshots(qr, 'contracts', contracts, contractColumns, mode, updatedAtAdvanced),
      ),
    );
    results.push(
      fieldResult(
        'crm_contract_alias_backup_168',
        'COMERCIAL',
        await this.eraseContractAliasBackup(qr, columns, contracts, mode),
      ),
    );

    const quotes = await this.idsForQuotes(qr, columns, scope.subscriberIds, scope.expedienteIds);
    results.push(
      fieldResult(
        'quotes',
        'COMERCIAL',
        await redactSnapshots(
          qr,
          'quotes',
          quotes,
          columnOf(columns, 'quotes', 'plan_snapshot_json') ? ['plan_snapshot_json'] : [],
          mode,
          updatedAtAdvanced,
        ),
      ),
    );
    return results;
  }

  private async eraseContractAliasBackup(
    qr: QueryRunner,
    columns: Map<string, TenantColumn>,
    contractIds: string[],
    mode: 'dry-run' | 'apply',
  ): Promise<{ selected: number; changed: number; residual: number }> {
    if (
      contractIds.length === 0 ||
      !tableExists(columns, 'crm_contract_alias_backup_168') ||
      !columnOf(columns, 'crm_contract_alias_backup_168', 'contract_id')
    ) {
      return { selected: 0, changed: 0, residual: 0 };
    }

    const selected = normalizeErasureRows<{ contract_id: string }>(
      await qr.query(
        `SELECT contract_id::text AS contract_id
           FROM crm_contract_alias_backup_168
          WHERE contract_id = ANY($1::uuid[])
          FOR UPDATE`,
        [contractIds],
      ),
    );
    if (mode === 'dry-run') {
      return { selected: selected.length, changed: 0, residual: selected.length };
    }

    const deleted = normalizeErasureRows<{ contract_id: string }>(
      await qr.query(
        `DELETE FROM crm_contract_alias_backup_168
          WHERE contract_id = ANY($1::uuid[])
          RETURNING contract_id::text AS contract_id`,
        [contractIds],
      ),
    );
    const residual = normalizeErasureRows<{ contract_id: string }>(
      await qr.query(
        `SELECT contract_id::text AS contract_id
           FROM crm_contract_alias_backup_168
          WHERE contract_id = ANY($1::uuid[])`,
        [contractIds],
      ),
    );
    return { selected: selected.length, changed: deleted.length, residual: residual.length };
  }

  private async childIds(
    qr: QueryRunner,
    columns: Map<string, TenantColumn>,
    table: (typeof CHILD_TABLES)[number],
    expedienteIds: string[],
  ): Promise<string[]> {
    if (
      expedienteIds.length === 0 ||
      !tableExists(columns, table) ||
      !columnOf(columns, table, 'expediente_id')
    ) {
      return [];
    }
    const rows = (await qr.query(
      `SELECT id::text FROM "${table}" WHERE expediente_id = ANY($1::uuid[]) FOR UPDATE`,
      [expedienteIds],
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private async idsForContracts(
    qr: QueryRunner,
    columns: Map<string, TenantColumn>,
    subscriberIds: string[],
  ): Promise<string[]> {
    if (
      subscriberIds.length === 0 ||
      !tableExists(columns, 'contracts') ||
      !columnOf(columns, 'contracts', 'subscriber_id')
    ) {
      return [];
    }
    const rows = (await qr.query(
      `SELECT id::text FROM contracts WHERE subscriber_id = ANY($1::uuid[]) FOR UPDATE`,
      [subscriberIds],
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private async idsForQuotes(
    qr: QueryRunner,
    columns: Map<string, TenantColumn>,
    subscriberIds: string[],
    expedienteIds: string[],
  ): Promise<string[]> {
    if (!tableExists(columns, 'quotes')) return [];
    const predicates: string[] = [];
    const parameters: unknown[] = [];
    if (subscriberIds.length > 0 && columnOf(columns, 'quotes', 'subscriber_id')) {
      parameters.push(subscriberIds);
      predicates.push(`subscriber_id = ANY($${parameters.length}::uuid[])`);
    }
    if (expedienteIds.length > 0 && columnOf(columns, 'quotes', 'expediente_id')) {
      parameters.push(expedienteIds);
      predicates.push(`expediente_id = ANY($${parameters.length}::uuid[])`);
    }
    if (predicates.length === 0) return [];
    const rows = (await qr.query(
      `SELECT id::text FROM quotes WHERE ${predicates.join(' OR ')} FOR UPDATE`,
      parameters,
    )) as Array<{ id: string }>;
    return [...new Set(rows.map((row) => row.id))];
  }
}
