import { encryptAes256Gcm, parseEncryptionKeyHex } from './aes-gcm.util';
import {
  classifyCiphertext,
  EncryptedCellRow,
  formatReencryptReport,
  ReencryptDbPort,
  runReencryptAes,
} from './reencrypt-aes.orchestrator';
import { EncryptedColumnTarget } from './reencrypt-aes.targets';

const ACTIVE_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PREVIOUS_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const OTHER_HEX = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const activeKey = parseEncryptionKeyHex(ACTIVE_HEX);
const previousKey = parseEncryptionKeyHex(PREVIOUS_HEX);
const otherKey = parseEncryptionKeyHex(OTHER_HEX);

const platformEmailTarget: EncryptedColumnTarget = {
  entityType: 'platform_user.email',
  scope: 'public',
  table: 'platform_users',
  column: 'email',
  idColumn: 'id',
  requireCiphertextShape: true,
};

const userMfaTarget: EncryptedColumnTarget = {
  entityType: 'user.mfaSecret',
  scope: 'tenant',
  table: 'users',
  column: 'mfa_secret',
  idColumn: 'id',
  requireCiphertextShape: true,
};

type StoreKey = string;

function storeKey(schema: string, table: string, column: string): StoreKey {
  return `${schema}.${table}.${column}`;
}

class MemoryReencryptDb implements ReencryptDbPort {
  readonly updates: Array<{ schema: string; id: string; value: string }> = [];
  private readonly tables = new Set<string>();
  private readonly rows = new Map<StoreKey, EncryptedCellRow[]>();

  constructor(
    private readonly schemas: string[],
    seed: Array<{
      schema: string;
      table: string;
      column: string;
      rows: EncryptedCellRow[];
    }>,
  ) {
    for (const item of seed) {
      this.tables.add(`${item.schema}.${item.table}`);
      this.rows.set(storeKey(item.schema, item.table, item.column), [...item.rows]);
    }
  }

  async listActiveTenantSchemas(): Promise<string[]> {
    return [...this.schemas];
  }

  async tableExists(schemaName: string, table: string): Promise<boolean> {
    return this.tables.has(`${schemaName}.${table}`);
  }

  async fetchEncryptedBatch(
    schemaName: string,
    target: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ): Promise<EncryptedCellRow[]> {
    const all = this.rows.get(storeKey(schemaName, target.table, target.column)) ?? [];
    return all.slice(offset, offset + limit);
  }

  async updateEncryptedValue(
    schemaName: string,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<void> {
    const key = storeKey(schemaName, target.table, target.column);
    const all = this.rows.get(key) ?? [];
    const idx = all.findIndex((r) => r.id === id);
    if (idx >= 0) {
      all[idx] = { id, value: newCiphertext };
    }
    this.updates.push({ schema: schemaName, id, value: newCiphertext });
  }
}

describe('reencrypt-aes.orchestrator', () => {
  describe('classifyCiphertext', () => {
    it('distingue active / previous / error', () => {
      const withActive = encryptAes256Gcm('a', activeKey);
      const withPrevious = encryptAes256Gcm('b', previousKey);
      const withOther = encryptAes256Gcm('c', otherKey);

      expect(classifyCiphertext(withActive, activeKey, previousKey)).toBe('active');
      expect(classifyCiphertext(withPrevious, activeKey, previousKey)).toBe('previous');
      expect(classifyCiphertext(withOther, activeKey, previousKey)).toBe('error');
      expect(classifyCiphertext('plaintext', activeKey, previousKey)).toBe('not_ciphertext');
    });
  });

  describe('runReencryptAes', () => {
    it('dry-run no escribe y cuenta previous como reencrypted (plan)', async () => {
      const db = new MemoryReencryptDb(
        ['tenant_demo'],
        [
          {
            schema: 'public',
            table: 'platform_users',
            column: 'email',
            rows: [
              { id: 'p1', value: encryptAes256Gcm('admin@example.test', previousKey) },
              { id: 'p2', value: encryptAes256Gcm('ops@example.test', activeKey) },
            ],
          },
          {
            schema: 'tenant_demo',
            table: 'users',
            column: 'mfa_secret',
            rows: [{ id: 'u1', value: encryptAes256Gcm('SECRETBASE32', previousKey) }],
          },
        ],
      );

      const report = await runReencryptAes(db, {
        mode: 'dry-run',
        activeKey,
        previousKey,
        publicTargets: [platformEmailTarget],
        tenantTargets: [userMfaTarget],
      });

      expect(db.updates).toHaveLength(0);
      expect(report.totals.candidates).toBe(3);
      expect(report.totals.skippedAlreadyActive).toBe(1);
      expect(report.totals.reencrypted).toBe(2);
      expect(report.totals.decryptErrors).toBe(0);
      expect(report.hasBlockingIssues).toBe(false);
    });

    it('apply recifra solo previous y es idempotente en segunda pasada', async () => {
      const db = new MemoryReencryptDb(
        ['tenant_demo'],
        [
          {
            schema: 'public',
            table: 'platform_users',
            column: 'email',
            rows: [{ id: 'p1', value: encryptAes256Gcm('a@example.test', previousKey) }],
          },
          {
            schema: 'tenant_demo',
            table: 'users',
            column: 'mfa_secret',
            rows: [{ id: 'u1', value: encryptAes256Gcm('MFASECRET', previousKey) }],
          },
        ],
      );

      const first = await runReencryptAes(db, {
        mode: 'apply',
        activeKey,
        previousKey,
        publicTargets: [platformEmailTarget],
        tenantTargets: [userMfaTarget],
      });

      expect(first.totals.reencrypted).toBe(2);
      expect(db.updates).toHaveLength(2);
      expect(first.hasBlockingIssues).toBe(false);

      const second = await runReencryptAes(db, {
        mode: 'apply',
        activeKey,
        previousKey,
        publicTargets: [platformEmailTarget],
        tenantTargets: [userMfaTarget],
      });

      expect(second.totals.reencrypted).toBe(0);
      expect(second.totals.skippedAlreadyActive).toBe(2);
      expect(db.updates).toHaveLength(2);
    });

    it('verify-active-only falla si quedan ciphertext de previous', async () => {
      const db = new MemoryReencryptDb(
        [],
        [
          {
            schema: 'public',
            table: 'platform_users',
            column: 'email',
            rows: [{ id: 'p1', value: encryptAes256Gcm('x@example.test', previousKey) }],
          },
        ],
      );

      const report = await runReencryptAes(db, {
        mode: 'verify-active-only',
        activeKey,
        previousKey: null,
        publicTargets: [platformEmailTarget],
        tenantTargets: [],
      });

      expect(report.totals.verifyFailures).toBe(1);
      expect(report.hasBlockingIssues).toBe(true);
    });

    it('cuenta decrypt_errors sin filtrar PII en el reporte', async () => {
      const db = new MemoryReencryptDb(
        [],
        [
          {
            schema: 'public',
            table: 'platform_users',
            column: 'email',
            rows: [{ id: 'p-bad', value: encryptAes256Gcm('orphan', otherKey) }],
          },
        ],
      );

      const report = await runReencryptAes(db, {
        mode: 'dry-run',
        activeKey,
        previousKey,
        publicTargets: [platformEmailTarget],
        tenantTargets: [],
      });

      expect(report.totals.decryptErrors).toBe(1);
      expect(report.hasBlockingIssues).toBe(true);

      const text = formatReencryptReport(report);
      expect(text).toContain('platform_user.email');
      expect(text).toContain('decrypt_errors=1');
      expect(text).not.toContain('orphan');
      expect(text).not.toContain('@');
    });

    it('filtra --schema=tenant y no toca public', async () => {
      const db = new MemoryReencryptDb(
        ['tenant_a', 'tenant_b'],
        [
          {
            schema: 'public',
            table: 'platform_users',
            column: 'email',
            rows: [{ id: 'p1', value: encryptAes256Gcm('p@example.test', previousKey) }],
          },
          {
            schema: 'tenant_a',
            table: 'users',
            column: 'mfa_secret',
            rows: [{ id: 'a1', value: encryptAes256Gcm('A', previousKey) }],
          },
          {
            schema: 'tenant_b',
            table: 'users',
            column: 'mfa_secret',
            rows: [{ id: 'b1', value: encryptAes256Gcm('B', previousKey) }],
          },
        ],
      );

      const report = await runReencryptAes(db, {
        mode: 'apply',
        schemaFilter: 'tenant_a',
        activeKey,
        previousKey,
        publicTargets: [platformEmailTarget],
        tenantTargets: [userMfaTarget],
      });

      expect(report.schemasProcessed).toEqual(['tenant_a']);
      expect(report.totals.reencrypted).toBe(1);
      expect(db.updates).toHaveLength(1);
      expect(db.updates[0]?.schema).toBe('tenant_a');
    });

    it('omite tabla ausente sin abortar', async () => {
      const db = new MemoryReencryptDb(['tenant_demo'], []);

      const report = await runReencryptAes(db, {
        mode: 'dry-run',
        schemaFilter: 'tenant_demo',
        activeKey,
        previousKey,
        publicTargets: [],
        tenantTargets: [userMfaTarget],
      });

      expect(report.totals.skippedMissingTable).toBe(1);
      expect(report.totals.candidates).toBe(0);
      expect(report.hasBlockingIssues).toBe(false);
    });
  });
});
