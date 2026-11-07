import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  parseEncryptionKeyHex,
} from '../common/crypto/aes-gcm.util';
import { EncryptedColumnTarget } from '../common/crypto/reencrypt-aes.targets';
import {
  formatMfaToPiiReport,
  listEligiblePiiTenantSchemas,
  loadMfaToPiiKeys,
  PII_ENCRYPTED_TARGETS,
  PiiReencryptDbPort,
  runMfaToPii,
} from './reencrypt-aes.pii';

const MFA_KEY = parseEncryptionKeyHex('0123456789abcdef'.repeat(4));
const MFA_PREVIOUS_KEY = parseEncryptionKeyHex('fedcba9876543210'.repeat(4));
const PII_KEY = parseEncryptionKeyHex('89abcdef01234567'.repeat(4));
const PII_PREVIOUS_KEY = parseEncryptionKeyHex('76543210fedcba98'.repeat(4));

const target: EncryptedColumnTarget = {
  entityType: 'subscriber.emailEncrypted',
  scope: 'tenant',
  table: 'subscribers',
  column: 'email_encrypted',
  idColumn: 'id',
  requireCiphertextShape: true,
};

class MemoryDb implements PiiReencryptDbPort {
  readonly updates: Array<{ table: string; id: string; value: string }> = [];
  readonly probes: Array<{ table: string; id: string; value: string }> = [];
  /** SQLSTATE que la sonda devuelve para una fila, por id. */
  readonly blockedWrites = new Map<string, string>();
  probeFailure: Error | null = null;
  private readonly rows = new Map<string, Array<{ id: string; value: string | null }>>();
  readonly missingTables = new Set<string>();

  constructor(
    seed: Array<{
      table: string;
      column: string;
      rows: Array<{ id: string; value: string | null }>;
    }>,
  ) {
    for (const entry of seed) {
      this.rows.set(
        `${entry.table}.${entry.column}`,
        entry.rows.map((row) => ({ ...row })),
      );
    }
  }

  async listActiveTenantSchemas(): Promise<string[]> {
    return ['tenant_k2_test'];
  }

  async tableExists(_schemaName: string, table: string): Promise<boolean> {
    return !this.missingTables.has(table);
  }

  async fetchEncryptedBatch(
    _schemaName: string,
    selectedTarget: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ) {
    const rows = this.rows.get(`${selectedTarget.table}.${selectedTarget.column}`) ?? [];
    return rows
      .filter((row): row is { id: string; value: string } => row.value !== null && row.value !== '')
      .slice(offset, offset + limit);
  }

  async updateEncryptedValue(
    _schemaName: string,
    selectedTarget: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<void> {
    const key = `${selectedTarget.table}.${selectedTarget.column}`;
    const rows = this.rows.get(key) ?? [];
    const row = rows.find((candidate) => candidate.id === id);
    if (row) row.value = newCiphertext;
    this.updates.push({ table: selectedTarget.table, id, value: newCiphertext });
  }

  async probeEncryptedWrite(
    _schemaName: string,
    selectedTarget: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<string | null> {
    this.probes.push({ table: selectedTarget.table, id, value: newCiphertext });
    if (this.probeFailure) throw this.probeFailure;
    return this.blockedWrites.get(id) ?? null;
  }

  getRows(table: string, column: string): Array<{ id: string; value: string | null }> {
    return this.rows.get(`${table}.${column}`) ?? [];
  }
}

const keys = {
  piiActiveKey: PII_KEY,
  piiPreviousKey: PII_PREVIOUS_KEY,
  mfaKeys: [MFA_KEY, MFA_PREVIOUS_KEY],
};

describe('reencrypt-aes PII inventory and runner', () => {
  it('cubre las columnas cifradas de PII esperadas y no incluye objetivos MFA', () => {
    const names = PII_ENCRYPTED_TARGETS.map((item) => `${item.table}.${item.column}`);
    expect(names).toEqual(
      expect.arrayContaining([
        'subscribers.whatsapp_encrypted',
        'crm_lifecycle_changes.note_encrypted',
        'billing_documents.buyer_document_encrypted',
        'contracts.fiscal_document_encrypted',
        'expediente_records.fiscal_document_encrypted',
        'party.document_number',
        'party_contact.value_encrypted',
        'data_subject_requests.requester_name_encrypted',
        'data_subject_requests.requester_document_encrypted',
        'data_subject_requests.requester_contact_encrypted',
      ]),
    );
    expect(names).not.toContain('users.mfa_secret');
    expect(names).not.toContain('platform_users.mfa_secret');
  });

  it('carga las claves desde ConfigService-like y exige separación para MFA→PII', () => {
    const values: Record<string, string> = {
      MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
      MFA_ENCRYPTION_KEY_PREVIOUS: 'fedcba9876543210'.repeat(4),
      PII_ENCRYPTION_KEY: '89abcdef01234567'.repeat(4),
      PII_ENCRYPTION_KEY_PREVIOUS: '76543210fedcba98'.repeat(4),
      NODE_ENV: 'test',
    };
    const config = {
      getOrThrow: (key: string) => {
        const value = values[key];
        if (value === undefined) throw new Error('missing config');
        return value;
      },
      get: (key: string) => values[key],
    };

    const loaded = loadMfaToPiiKeys(config, MFA_KEY, MFA_PREVIOUS_KEY);
    expect(loaded.piiActiveKey.equals(PII_KEY)).toBe(true);
    expect(loaded.piiPreviousKey?.equals(PII_PREVIOUS_KEY)).toBe(true);
    expect(loaded.mfaKeys).toHaveLength(2);

    values.PII_ENCRYPTION_KEY = values.MFA_ENCRYPTION_KEY!;
    expect(() => loadMfaToPiiKeys(config, MFA_KEY, MFA_PREVIOUS_KEY)).toThrow(
      /PII_ENCRYPTION_KEY debe ser distinta/u,
    );
  });

  it('recifra una nota vacía de PII previa sin incluir ciphertext en el reporte', async () => {
    const previousCiphertext = encryptAes256Gcm('', PII_PREVIOUS_KEY);
    const lifecycleTarget = PII_ENCRYPTED_TARGETS.find(
      (candidate) =>
        candidate.table === 'crm_lifecycle_changes' && candidate.column === 'note_encrypted',
    );
    expect(lifecycleTarget).toBeDefined();
    const db = new MemoryDb([
      {
        table: 'crm_lifecycle_changes',
        column: 'note_encrypted',
        rows: [{ id: 'change-1', value: previousCiphertext }],
      },
    ]);

    const report = await runMfaToPii(db, {
      mode: 'apply',
      keys,
      targets: lifecycleTarget ? [lifecycleTarget] : [],
    });

    expect(report.totals).toMatchObject({ candidates: 1, reencrypted: 1, decryptErrors: 0 });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]?.table).toBe('crm_lifecycle_changes');
    expect(db.updates[0]?.value).not.toBe(previousCiphertext);
    expect(decryptAes256Gcm(db.updates[0]!.value, PII_KEY)).toBe('');
    expect(formatMfaToPiiReport(report)).not.toContain(previousCiphertext);
  });

  it('dry-run no escribe, aplica MFA→PII por lotes, conserva NULL e idempotencia', async () => {
    const mfaObjective = encryptAes256Gcm('synthetic-mfa-objective', MFA_KEY);
    const db = new MemoryDb([
      {
        table: 'subscribers',
        column: 'email_encrypted',
        rows: [
          { id: 'legacy-1', value: encryptAes256Gcm('synthetic-contact-one', MFA_KEY) },
          { id: 'already-pii', value: encryptAes256Gcm('synthetic-contact-two', PII_KEY) },
          { id: 'null-value', value: null },
        ],
      },
      { table: 'users', column: 'mfa_secret', rows: [{ id: 'mfa-1', value: mfaObjective }] },
    ]);

    const dryRun = await runMfaToPii(db, {
      mode: 'dry-run',
      pageSize: 1,
      keys,
      targets: [target],
    });
    expect(dryRun.totals).toMatchObject({ candidates: 2, reencrypted: 1, skippedAlreadyPii: 1 });
    expect(db.updates).toHaveLength(0);

    const preApplyVerification = await runMfaToPii(db, {
      mode: 'verify-pii-only',
      keys,
      targets: [target],
    });
    expect(preApplyVerification.hasBlockingIssues).toBe(true);
    expect(preApplyVerification.totals.mfaOnlyRemaining).toBe(1);

    const apply = await runMfaToPii(db, {
      mode: 'apply',
      pageSize: 1,
      keys,
      targets: [target],
    });
    expect(apply.totals).toMatchObject({ candidates: 2, reencrypted: 1, skippedAlreadyPii: 1 });
    expect(db.getRows('subscribers', 'email_encrypted')[2]?.value).toBeNull();
    expect(db.getRows('users', 'mfa_secret')[0]?.value).toBe(mfaObjective);

    const repeated = await runMfaToPii(db, {
      mode: 'apply',
      pageSize: 1,
      keys,
      targets: [target],
    });
    expect(repeated.totals).toMatchObject({ reencrypted: 0, skippedAlreadyPii: 2 });

    const verify = await runMfaToPii(db, {
      mode: 'verify-pii-only',
      keys,
      targets: [target],
    });
    expect(verify.hasBlockingIssues).toBe(false);
    expect(verify.totals.mfaOnlyRemaining).toBe(0);
    expect(formatMfaToPiiReport(verify)).not.toContain('synthetic-contact');
  });

  it('bloquea valores no ciphertext y reporta solo conteos', async () => {
    const db = new MemoryDb([
      {
        table: 'subscribers',
        column: 'email_encrypted',
        rows: [{ id: 'plain', value: 'synthetic' }],
      },
    ]);
    const report = await runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] });

    expect(report.hasBlockingIssues).toBe(true);
    expect(report.totals.nonCiphertext).toBe(1);
    expect(formatMfaToPiiReport(report)).not.toContain('synthetic');
  });

  it('bloquea tablas objetivo ausentes y las reporta como pendientes', async () => {
    const db = new MemoryDb([]);
    db.missingTables.add('subscribers');

    const report = await runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] });

    expect(report.hasBlockingIssues).toBe(true);
    expect(report.totals).toMatchObject({ skippedMissingTable: 1, pending: 1 });
    expect(formatMfaToPiiReport(report)).toContain('missing_table_targets=1');
  });

  it('resuelve un schema registrado de cualquier estado solo si existe su namespace', async () => {
    const query = jest.fn(async (_sql: string, _parameters: string[]) => [
      { schema_name: 'tenant_k2_inactive' },
    ]);

    await expect(listEligiblePiiTenantSchemas(query, 'tenant_k2_inactive')).resolves.toEqual([
      'tenant_k2_inactive',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE t.schema_name = $1'), [
      'tenant_k2_inactive',
    ]);
    expect(query.mock.calls[0]?.[0]).toContain('pg_catalog.pg_namespace');
    expect(query.mock.calls[0]?.[0]).not.toContain('t.status');
  });

  it('rechaza schema inválido antes de consultar control-plane y falla si no resuelve un tenant', async () => {
    const query = jest.fn(async (_sql: string, _parameters: string[]) => []);

    await expect(
      listEligiblePiiTenantSchemas(query, 'tenant_x; DROP SCHEMA public'),
    ).rejects.toThrow('Schema tenant inválido para el recifrado MFA→PII.');
    expect(query).not.toHaveBeenCalled();

    await expect(listEligiblePiiTenantSchemas(query, 'tenant_k2_missing')).rejects.toThrow(
      'Schema tenant no registrado, sin namespace o no elegible para K2.',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falla si el lookup no devuelve exactamente un schema registrado con namespace', async () => {
    const duplicateRows = jest.fn(async (_sql: string, _parameters: string[]) => [
      { schema_name: 'tenant_k2_inactive' },
      { schema_name: 'tenant_k2_inactive' },
    ]);

    await expect(listEligiblePiiTenantSchemas(duplicateRows, 'tenant_k2_inactive')).rejects.toThrow(
      'Schema tenant no registrado, sin namespace o no elegible para K2.',
    );
  });
});

describe('reencrypt-aes PII — sonda de escritura del dry-run (D-K2A-6)', () => {
  const phoneTarget: EncryptedColumnTarget = {
    ...target,
    entityType: 'subscriber.phoneEncrypted',
    column: 'phone_encrypted',
  };

  function legacyCell(id: string): { id: string; value: string } {
    return { id, value: encryptAes256Gcm('synthetic-legacy-cell', MFA_KEY) };
  }

  it('cuenta writeBlocked por objetivo y en totales, y lo suma a pending sin duplicar la celda', async () => {
    const blocked = legacyCell('row-blocked');
    const db = new MemoryDb([
      {
        table: 'subscribers',
        column: 'email_encrypted',
        rows: [blocked, legacyCell('row-writable')],
      },
    ]);
    db.blockedWrites.set('row-blocked', '55000');

    const report = await runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] });

    expect(report.targets[0]).toMatchObject({
      candidates: 2,
      reencrypted: 1,
      writeBlocked: 1,
      writeBlockedBySqlState: { '55000': 1 },
    });
    expect(report.totals).toMatchObject({ candidates: 2, reencrypted: 1, writeBlocked: 1 });
    expect(report.totals.pending).toBe(2);
    expect(report.hasBlockingIssues).toBe(true);
  });

  it('la sonda no persiste nada y ensaya un ciphertext que abre con la clave activa', async () => {
    const cell = legacyCell('row-1');
    const db = new MemoryDb([{ table: 'subscribers', column: 'email_encrypted', rows: [cell] }]);

    const report = await runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] });

    expect(report.hasBlockingIssues).toBe(false);
    expect(report.totals).toMatchObject({ reencrypted: 1, writeBlocked: 0, pending: 1 });
    expect(db.updates).toHaveLength(0);
    expect(db.getRows('subscribers', 'email_encrypted')[0]?.value).toBe(cell.value);
    expect(db.probes).toHaveLength(1);
    expect(db.probes[0]).toMatchObject({ table: 'subscribers', id: 'row-1' });
    expect(decryptAes256Gcm(db.probes[0]!.value, PII_KEY)).toBe('synthetic-legacy-cell');
  });

  it('sondea cada celda que recifraría, también de PII previa y por páginas', async () => {
    const previous = {
      id: 'row-previous',
      value: encryptAes256Gcm('synthetic-previous', PII_PREVIOUS_KEY),
    };
    const db = new MemoryDb([
      {
        table: 'subscribers',
        column: 'email_encrypted',
        rows: [legacyCell('row-mfa'), previous],
      },
    ]);

    await runMfaToPii(db, { mode: 'dry-run', pageSize: 1, keys, targets: [target] });

    expect(db.probes.map((probe) => probe.id)).toEqual(['row-mfa', 'row-previous']);
  });

  it('no sondea skipped_pii: una marca en la clave activa pasa con write_blocked=0 (límite v1.1)', async () => {
    const db = new MemoryDb([
      {
        table: 'subscribers',
        column: 'email_encrypted',
        rows: [{ id: 'row-active', value: encryptAes256Gcm('synthetic-marker', PII_KEY) }],
      },
    ]);
    db.blockedWrites.set('row-active', '55000');

    const report = await runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] });

    expect(db.probes).toHaveLength(0);
    expect(report.totals).toMatchObject({ skippedAlreadyPii: 1, writeBlocked: 0 });
    expect(report.hasBlockingIssues).toBe(false);
  });

  it('no sondea lo que K2 no recifraría: texto claro ni celdas que ninguna clave abre', async () => {
    const unknownKey = parseEncryptionKeyHex('1122334455667788'.repeat(4));
    const db = new MemoryDb([
      {
        table: 'subscribers',
        column: 'email_encrypted',
        rows: [
          { id: 'row-plain', value: 'synthetic' },
          { id: 'row-unknown', value: encryptAes256Gcm('synthetic', unknownKey) },
        ],
      },
    ]);

    const report = await runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] });

    expect(db.probes).toHaveLength(0);
    expect(report.totals).toMatchObject({ nonCiphertext: 1, decryptErrors: 1, writeBlocked: 0 });
  });

  it.each(['apply', 'verify-pii-only'] as const)('%s no llama a la sonda', async (mode) => {
    const db = new MemoryDb([
      { table: 'subscribers', column: 'email_encrypted', rows: [legacyCell('row-1')] },
    ]);
    db.blockedWrites.set('row-1', '55000');

    const report = await runMfaToPii(db, { mode, keys, targets: [target] });

    expect(db.probes).toHaveLength(0);
    expect(report.totals.writeBlocked).toBe(0);
  });

  it('propaga un error no SQL de la sonda en vez de contarlo como bloqueo', async () => {
    const db = new MemoryDb([
      { table: 'subscribers', column: 'email_encrypted', rows: [legacyCell('row-1')] },
    ]);
    const failure = new Error('synthetic-connection-failure');
    db.probeFailure = failure;

    await expect(runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] })).rejects.toBe(
      failure,
    );
  });

  it('el reporte agrega write_blocked por SQLSTATE y objetivo, sin valores ni ids', async () => {
    const cells = [legacyCell('row-sentinel-a'), legacyCell('row-sentinel-b')];
    const phoneCell = legacyCell('row-sentinel-c');
    const db = new MemoryDb([
      { table: 'subscribers', column: 'email_encrypted', rows: cells },
      { table: 'subscribers', column: 'phone_encrypted', rows: [phoneCell] },
    ]);
    db.blockedWrites.set('row-sentinel-a', '55000');
    db.blockedWrites.set('row-sentinel-b', '23514');
    db.blockedWrites.set('row-sentinel-c', '55000');

    const report = await runMfaToPii(db, {
      mode: 'dry-run',
      keys,
      targets: [target, phoneTarget],
    });
    const output = formatMfaToPiiReport(report);
    const lines = output.split('\n');

    expect(lines.find((line) => line.includes(' totals '))).toContain('write_blocked=3');
    const emailLine = lines.find((line) => line.includes('subscriber.emailEncrypted:'));
    expect(emailLine).toContain('write_blocked=2 write_blocked_23514=1 write_blocked_55000=1');
    const phoneLine = lines.find((line) => line.includes('subscriber.phoneEncrypted:'));
    expect(phoneLine).toContain('write_blocked=1 write_blocked_55000=1');
    expect(phoneLine).not.toContain('write_blocked_23514');
    expect(output).toContain('blocking=yes');

    expect(output).not.toContain('row-sentinel');
    expect(output).not.toContain('synthetic');
    for (const cell of [...cells, phoneCell]) expect(output).not.toContain(cell.value);
    for (const probe of db.probes) expect(output).not.toContain(probe.value);
  });

  it('sin bloqueos el reporte dice write_blocked=0 y no emite agregados por SQLSTATE', async () => {
    const db = new MemoryDb([
      { table: 'subscribers', column: 'email_encrypted', rows: [legacyCell('row-1')] },
    ]);

    const output = formatMfaToPiiReport(
      await runMfaToPii(db, { mode: 'dry-run', keys, targets: [target] }),
    );

    expect(output).toContain('write_blocked=0');
    expect(output).not.toMatch(/write_blocked_/u);
    expect(output).toContain('blocking=no');
  });
});
