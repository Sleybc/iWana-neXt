import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import { CrmTitularErasureParticipant } from './crm-titular-erasure.participant';
import type { ErasureKeys, TenantColumn } from './titular-erasure-sql';
import type { TitularErasureScope } from './titular-erasure.types';

const SUBSCRIBER_ID = '00000000-0000-4000-8000-000000000001';
const EXPEDIENTE_ID = '00000000-0000-4000-8000-000000000002';
const CONTRACT_ID = '00000000-0000-4000-8000-000000000003';
const PROFILE_ID = '00000000-0000-4000-8000-000000000004';
const ASSIGNMENT_ID = '00000000-0000-4000-8000-000000000005';
const REQUEST_ID = '00000000-0000-4000-8000-000000000006';
const LIFECYCLE_CHANGE_ID = '00000000-0000-4000-8000-000000000007';
const OTHER_LIFECYCLE_CHANGE_ID = '00000000-0000-4000-8000-000000000008';
const OTHER_SUBSCRIBER_ID = '00000000-0000-4000-8000-000000000009';

interface LifecycleChangeFixture {
  id: string;
  subscriberId: string;
  noteEncrypted: string | null;
}

const KEYS: ErasureKeys = {
  hashKey: Buffer.alloc(32, 1),
  activeEncryptionKey: Buffer.alloc(32, 2),
  previousEncryptionKey: null,
};

const TABLE_COLUMNS: Record<string, string[]> = {
  expediente_records: ['id', 'source'],
  subscribers: ['id'],
  contracts: [
    'id',
    'subscriber_id',
    'stratum_evidence_media_id',
    'installation_address',
    'installation_postal_code',
    'installation_notes',
    'installation_city',
    'installation_department',
    'installation_stratum',
    'fiscal_name',
    'fiscal_document',
    'fiscal_document_encrypted',
    'fiscal_document_hmac',
    'fiscal_address',
    'alias',
    'vat_snapshot',
    'plan_snapshot_json',
  ],
  operational_responsibility_history: ['id', 'expediente_id', 'notes'],
  status_changes: ['id', 'expediente_id', 'reason'],
  sales_attributions: ['id', 'expediente_id', 'notes', 'revoked_reason'],
  subscriber_tax_profiles: ['id', 'subscriber_id'],
  subscriber_tax_assignments: ['id', 'profile_id', 'reason'],
  crm_contract_alias_backup_168: ['contract_id', 'alias'],
  crm_lifecycle_changes: ['id', 'subscriber_id', 'note_encrypted'],
};

const COLUMNS = Object.entries(TABLE_COLUMNS).flatMap(([table_name, columns]) =>
  columns.map(
    (column_name): TenantColumn => ({
      table_name,
      column_name,
      is_nullable: 'YES',
      data_type: 'text',
      udt_name: 'text',
    }),
  ),
);

function createQueryRunner(lifecycleChanges: LifecycleChangeFixture[] = []): {
  queryRunner: QueryRunner;
  queries: string[];
  queryArguments: unknown[][];
} {
  const queries: string[] = [];
  const queryArguments: unknown[][] = [];
  const query = jest.fn(async (sql: string, parameters: unknown[] = []): Promise<unknown> => {
    queries.push(sql);
    queryArguments.push(parameters);
    if (sql.includes('information_schema.columns')) return COLUMNS;
    if (/\bAS selected\b/iu.test(sql)) {
      return [{ selected: sql.includes('"sales_attributions"') ? '2' : '1' }];
    }
    if (
      sql.includes('FROM "contracts"') &&
      sql.includes('"installation_stratum"') &&
      /^\s*SELECT\b/iu.test(sql)
    ) {
      return [
        {
          id: CONTRACT_ID,
          installation_city: 'Ciudad sintética',
          installation_department: 'Departamento sintético',
          installation_stratum: 3,
          installation_address: 'Dirección sintética',
          installation_postal_code: '00000',
          installation_notes: 'Nota sintética',
        },
      ];
    }
    if (/^\s*UPDATE "contracts"/iu.test(sql)) return [{ id: CONTRACT_ID }];
    if (sql.includes('SELECT id::text FROM contracts WHERE subscriber_id')) {
      return [{ id: CONTRACT_ID }];
    }
    if (sql.includes('SELECT "id"::text AS id FROM "crm_lifecycle_changes"')) {
      const subscriberIds = parameters[0] as string[];
      return lifecycleChanges
        .filter((row) => row.noteEncrypted !== null && subscriberIds.includes(row.subscriberId))
        .map(({ id }) => ({ id }));
    }
    if (
      sql.includes('FROM "crm_lifecycle_changes"') &&
      sql.includes('WHERE id = ANY($1::uuid[])')
    ) {
      const selectedIds = parameters[0] as string[];
      return lifecycleChanges
        .filter((row) => selectedIds.includes(row.id))
        .map(({ id, noteEncrypted }) => ({ id, note_encrypted: noteEncrypted }));
    }
    if (sql.includes('SELECT "id"::text AS id FROM "subscriber_tax_profiles"')) {
      return [{ id: PROFILE_ID }];
    }
    if (sql.includes('SELECT "id"::text AS id FROM "subscriber_tax_assignments"')) {
      return [{ id: ASSIGNMENT_ID }];
    }
    if (
      sql.includes('SELECT "id"::text AS id FROM "operational_responsibility_history"') ||
      sql.includes('SELECT "id"::text AS id FROM "status_changes"') ||
      sql.includes('SELECT "id"::text AS id FROM "sales_attributions"')
    ) {
      return [{ id: EXPEDIENTE_ID }];
    }
    return [];
  });
  return { queryRunner: { query } as unknown as QueryRunner, queries, queryArguments };
}

describe('CrmTitularErasureParticipant', () => {
  const participant = new CrmTitularErasureParticipant(new ConfigService({}));

  it('publica los contratos del suscriptor en relatedIds.contractIds', async () => {
    const { queryRunner } = createQueryRunner();
    const relatedIds: NonNullable<TitularErasureScope['relatedIds']> & {
      contractIds?: string[];
    } = {};
    const scope = {
      partyId: null,
      subscriberIds: [SUBSCRIBER_ID],
      expedienteIds: [],
      userIds: [],
      relatedIds,
    };

    await participant.resolveScope(scope, queryRunner);

    expect(relatedIds.contractIds).toEqual([CONTRACT_ID]);
  });

  it('incluye las reglas D-BT-3 y planifica el respaldo de alias sin borrarlo', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await participant.plan(
      {
        partyId: null,
        subscriberIds: [SUBSCRIBER_ID],
        expedienteIds: [EXPEDIENTE_ID],
        userIds: [],
        relatedIds: {},
        cryptoKeys: KEYS,
      },
      queryRunner,
    );

    expect(
      queries.some((sql) => sql.includes('"source"') && sql.includes('FROM "expediente_records"')),
    ).toBe(true);
    expect(
      queries.some(
        (sql) =>
          sql.includes('"notes"') && sql.includes('FROM "operational_responsibility_history"'),
      ),
    ).toBe(true);
    expect(
      queries.some((sql) => sql.includes('"reason"') && sql.includes('FROM "status_changes"')),
    ).toBe(true);
    expect(
      queries.some(
        (sql) =>
          sql.includes('"notes"') &&
          sql.includes('"revoked_reason"') &&
          sql.includes('FROM "sales_attributions"'),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (sql) => sql.includes('"reason"') && sql.includes('FROM "subscriber_tax_assignments"'),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (sql) =>
          sql.includes('"installation_city"') &&
          sql.includes('"installation_department"') &&
          sql.includes('"installation_stratum"') &&
          sql.includes('FROM "contracts"'),
      ),
    ).toBe(true);
    expect(queries.some((sql) => sql.includes('crm_contract_alias_backup_168'))).toBe(true);
    expect(queries.some((sql) => /^\s*DELETE\b/iu.test(sql))).toBe(false);
  });

  it('elimina el respaldo de alias por contract_id durante apply', async () => {
    const { queryRunner, queries } = createQueryRunner();
    const relatedIds: NonNullable<TitularErasureScope['relatedIds']> & {
      contractIds: string[];
    } = { contractIds: [CONTRACT_ID] };

    await participant.apply(
      {
        partyId: null,
        subscriberIds: [],
        expedienteIds: [],
        userIds: [],
        requestId: REQUEST_ID,
        relatedIds,
        cryptoKeys: KEYS,
      },
      queryRunner,
      'apply',
    );

    expect(
      queries.some(
        (sql) =>
          /^\s*DELETE\b/iu.test(sql) &&
          sql.includes('crm_contract_alias_backup_168') &&
          sql.includes('contract_id'),
      ),
    ).toBe(true);
  });

  it('cuenta en COMERCIAL solo las notas cifradas del titular y bloquea las filas seleccionadas', async () => {
    const { queryRunner, queries } = createQueryRunner([
      {
        id: LIFECYCLE_CHANGE_ID,
        subscriberId: SUBSCRIBER_ID,
        noteEncrypted: 'ciphertext-fixture',
      },
      {
        id: OTHER_LIFECYCLE_CHANGE_ID,
        subscriberId: OTHER_SUBSCRIBER_ID,
        noteEncrypted: 'other-ciphertext-fixture',
      },
    ]);

    const results = await participant.plan(
      {
        partyId: null,
        subscriberIds: [SUBSCRIBER_ID],
        expedienteIds: [],
        userIds: [],
        relatedIds: {},
        cryptoKeys: KEYS,
      },
      queryRunner,
    );

    const lifecycleResult = results.find((result) => result.table === 'crm_lifecycle_changes');
    const selectionQuery = queries.find((sql) =>
      sql.includes('SELECT "id"::text AS id FROM "crm_lifecycle_changes"'),
    );

    expect(lifecycleResult).toMatchObject({
      category: 'COMERCIAL',
      selected: 1,
      changed: 0,
      residual: 1,
    });
    expect(selectionQuery).toContain('subscriber_id = ANY($1::uuid[])');
    expect(selectionQuery).toContain('note_encrypted IS NOT NULL');
    expect(selectionQuery).toContain('FOR UPDATE');
  });

  it('da cero en la vista previa cuando los eventos no tienen nota', async () => {
    const { queryRunner } = createQueryRunner([
      { id: LIFECYCLE_CHANGE_ID, subscriberId: SUBSCRIBER_ID, noteEncrypted: null },
      { id: OTHER_LIFECYCLE_CHANGE_ID, subscriberId: SUBSCRIBER_ID, noteEncrypted: null },
    ]);

    const results = await participant.plan(
      {
        partyId: null,
        subscriberIds: [SUBSCRIBER_ID],
        expedienteIds: [],
        userIds: [],
        relatedIds: {},
        cryptoKeys: KEYS,
      },
      queryRunner,
    );

    expect(results.find((result) => result.table === 'crm_lifecycle_changes')).toMatchObject({
      category: 'COMERCIAL',
      selected: 0,
      changed: 0,
      residual: 0,
    });
  });

  it('anula installation_stratum y conserva service_usage', async () => {
    const { queryRunner, queries, queryArguments } = createQueryRunner();

    await participant.apply(
      {
        partyId: null,
        subscriberIds: [],
        expedienteIds: [],
        userIds: [],
        requestId: REQUEST_ID,
        relatedIds: { contractIds: [CONTRACT_ID] },
        cryptoKeys: KEYS,
      },
      queryRunner,
      'apply',
    );

    const contractLocationUpdate = queries.find(
      (sql) => /^\s*UPDATE "contracts"/iu.test(sql) && sql.includes('"installation_stratum"'),
    );
    expect(contractLocationUpdate).toBeDefined();
    const updateIndex = queries.indexOf(contractLocationUpdate!);
    const parameter = /"installation_stratum" = \$(\d+)/u.exec(contractLocationUpdate!);
    expect(queryArguments[updateIndex]?.[Number(parameter?.[1]) - 1]).toBeNull();
    expect(contractLocationUpdate).not.toMatch(/"service_usage"\s*=/iu);
  });

  it('selecciona solo textos no nulos y cuenta textos, no eventos, en R-1, R-7, R-8 y R-11', async () => {
    const { queryRunner, queries } = createQueryRunner();

    const result = await participant.plan(
      {
        partyId: null,
        subscriberIds: [SUBSCRIBER_ID],
        expedienteIds: [EXPEDIENTE_ID],
        userIds: [],
        relatedIds: {},
        cryptoKeys: KEYS,
      },
      queryRunner,
    );

    for (const [table, column] of [
      ['operational_responsibility_history', 'notes'],
      ['status_changes', 'reason'],
      ['sales_attributions', 'notes'],
      ['subscriber_tax_assignments', 'reason'],
    ]) {
      expect(
        queries.some(
          (sql) =>
            sql.includes(`FROM "${table}"`) &&
            new RegExp(`"?${column}"?\\s+IS NOT NULL`, 'iu').test(sql),
        ),
      ).toBe(true);
    }
    expect(
      queries.some(
        (sql) =>
          sql.includes('FROM "sales_attributions"') &&
          /"?notes"?\s+IS NOT NULL/iu.test(sql) &&
          /"?revoked_reason"?\s+IS NOT NULL/iu.test(sql),
      ),
    ).toBe(true);
    expect(
      result.find((entry) => entry.table === 'operational_responsibility_history')?.selected,
    ).toBe(1);
    expect(result.find((entry) => entry.table === 'status_changes')?.selected).toBe(1);
    expect(result.find((entry) => entry.table === 'sales_attributions')?.selected).toBe(2);
    expect(result.find((entry) => entry.table === 'subscriber_tax_assignments')?.selected).toBe(1);
  });
});

describe('CrmTitularErasureParticipant — soportes documentales (ADR-110 D13)', () => {
  const DOC_COLUMNS = new Map<string, TenantColumn>(
    ['id', 'subscriber_id', 'storage_key'].map((column_name) => [
      `subscriber_documents.${column_name}`,
      {
        table_name: 'subscriber_documents',
        column_name,
        is_nullable: 'NO',
        data_type: 'text',
        udt_name: 'text',
      },
    ]),
  );
  type Erase = (
    qr: QueryRunner,
    columns: Map<string, TenantColumn>,
    subscriberIds: string[],
    mode: 'dry-run' | 'apply',
  ) => Promise<{ selected: number; changed: number; residual: number }>;
  const erase = (participant: CrmTitularErasureParticipant): Erase =>
    (participant as unknown as { eraseSubscriberDocuments: Erase }).eraseSubscriberDocuments.bind(
      participant,
    );

  function documentsRunner(keys: string[]) {
    let remaining = [...keys];
    const queries: string[] = [];
    const query = jest.fn(async (sql: string): Promise<unknown> => {
      queries.push(sql);
      if (/current_schema\(\)/u.test(sql)) return [{ schema: 't' }];
      if (/^\s*SELECT storage_key FROM subscriber_documents/iu.test(sql)) {
        return remaining.map((storage_key) => ({ storage_key }));
      }
      if (/^\s*DELETE FROM subscriber_documents/iu.test(sql)) {
        const deleted = remaining.map((storage_key) => ({ storage_key }));
        remaining = [];
        return [deleted, deleted.length];
      }
      return [];
    });
    return { qr: { query } as unknown as QueryRunner, queries };
  }

  it('apply borra las filas y luego los archivos del storage, sin residuo', async () => {
    const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
    const participant = new CrmTitularErasureParticipant(new ConfigService({}), storage as never);
    const { qr, queries } = documentsRunner(['t/sub/a.enc', 't/sub/b.enc', 't/sub/a.enc']);
    await expect(erase(participant)(qr, DOC_COLUMNS, [SUBSCRIBER_ID], 'apply')).resolves.toEqual({
      selected: 3,
      changed: 3,
      residual: 0,
    });
    expect(storage.deleteObject.mock.calls.map(([key]) => key).sort()).toEqual([
      't/sub/a.enc',
      't/sub/b.enc',
    ]);
    expect(queries[0]).toMatch(/FOR UPDATE/u);
  });

  it('dry-run cuenta sin borrar filas ni archivos', async () => {
    const storage = { deleteObject: jest.fn() };
    const participant = new CrmTitularErasureParticipant(new ConfigService({}), storage as never);
    const { qr, queries } = documentsRunner(['k1']);
    await expect(erase(participant)(qr, DOC_COLUMNS, [SUBSCRIBER_ID], 'dry-run')).resolves.toEqual({
      selected: 1,
      changed: 0,
      residual: 1,
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(queries.some((sql) => /DELETE/u.test(sql))).toBe(false);
  });

  it('sin storage falla cerrado si hay soportes; sin soportes o sin tabla no lo exige', async () => {
    const participant = new CrmTitularErasureParticipant(new ConfigService({}));
    await expect(
      erase(participant)(documentsRunner(['k1']).qr, DOC_COLUMNS, [SUBSCRIBER_ID], 'apply'),
    ).rejects.toThrow(/requiere storage/u);
    await expect(
      erase(participant)(documentsRunner([]).qr, DOC_COLUMNS, [SUBSCRIBER_ID], 'apply'),
    ).resolves.toEqual({ selected: 0, changed: 0, residual: 0 });
    await expect(
      erase(participant)(documentsRunner(['k1']).qr, new Map(), [SUBSCRIBER_ID], 'apply'),
    ).resolves.toEqual({ selected: 0, changed: 0, residual: 0 });
  });

  it('un fallo de storage propaga el error para que la transacción revierta', async () => {
    const storage = { deleteObject: jest.fn().mockRejectedValue(new Error('storage caído')) };
    const participant = new CrmTitularErasureParticipant(new ConfigService({}), storage as never);
    await expect(
      erase(participant)(documentsRunner(['t/k1']).qr, DOC_COLUMNS, [SUBSCRIBER_ID], 'apply'),
    ).rejects.toThrow('storage caído');
  });

  it('H6: una clave fuera del schema del tenant aborta sin tocar el storage', async () => {
    const storage = { deleteObject: jest.fn() };
    const participant = new CrmTitularErasureParticipant(new ConfigService({}), storage as never);
    await expect(
      erase(participant)(documentsRunner(['otro/k1']).qr, DOC_COLUMNS, [SUBSCRIBER_ID], 'apply'),
    ).rejects.toThrow(/fuera del schema/u);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('plan del participante reporta subscriber_documents como evidencia documental', async () => {
    const { queryRunner } = createQueryRunner();
    const results = await new CrmTitularErasureParticipant(new ConfigService({})).plan(
      {
        partyId: null,
        subscriberIds: [SUBSCRIBER_ID],
        expedienteIds: [],
        userIds: [],
        relatedIds: {},
        cryptoKeys: KEYS,
      },
      queryRunner,
    );
    expect(results.find((result) => result.table === 'subscriber_documents')).toMatchObject({
      category: 'EVIDENCIA_DOCUMENTAL',
      selected: 0,
    });
  });
});
