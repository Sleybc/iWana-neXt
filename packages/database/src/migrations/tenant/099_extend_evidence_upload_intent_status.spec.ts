import { ExtendEvidenceUploadIntentStatus0990000000000 } from './099_extend_evidence_upload_intent_status';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

describe('ExtendEvidenceUploadIntentStatus099', () => {
  const originalFlag = process.env[FLAG];

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('reemplaza el CHECK por el vocabulario completo de seis estados', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as never;

    await new ExtendEvidenceUploadIntentStatus0990000000000().up(queryRunner);

    const all = queries.join(' ');
    expect(all).toContain(
      'DROP CONSTRAINT IF EXISTS chk_execution_order_evidence_upload_intents_status',
    );
    for (const status of [
      'PENDING',
      'PENDING_ANALYSIS',
      'AVAILABLE',
      'REJECTED',
      'EXPIRED',
      'FAILED',
    ]) {
      expect(all).toContain(`'${status}'`);
    }
    // No toca la 095: no recrea la tabla ni los índices.
    expect(all).not.toContain('CREATE TABLE');
  });

  it('bloquea down con intents transitorios y no borra nada', async () => {
    delete process.env[FLAG];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)::int')) return [{ total: 2 }];
      return [];
    });

    await expect(
      new ExtendEvidenceUploadIntentStatus0990000000000().down({ query } as never),
    ).rejects.toThrow(new RegExp(`${FLAG}=true`));

    const all = query.mock.calls.map(([sql]) => String(sql)).join(' ');
    expect(all).not.toContain('DELETE FROM');
    expect(all).not.toContain('ADD CONSTRAINT');
  });

  it('sin intents transitorios revierte al CHECK de cuatro estados sin borrar filas', async () => {
    delete process.env[FLAG];
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return sql.includes('COUNT(*)::int') ? [{ total: 0 }] : [];
      }),
    } as never;

    await new ExtendEvidenceUploadIntentStatus0990000000000().down(queryRunner);

    const all = queries.join(' ');
    expect(all).not.toContain('DELETE FROM');
    expect(all).toContain(
      "CHECK (status IN ('PENDING_ANALYSIS', 'AVAILABLE', 'REJECTED', 'EXPIRED'))",
    );
  });

  it('con flag explícito borra solo reservas sin binario vinculado', async () => {
    process.env[FLAG] = 'true';
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return sql.includes('COUNT(*)::int') ? [{ total: 3 }] : [];
      }),
    } as never;

    await new ExtendEvidenceUploadIntentStatus0990000000000().down(queryRunner);

    const deleteStatement = queries.find((sql) => sql.includes('DELETE FROM'));
    expect(deleteStatement).toBeDefined();
    expect(deleteStatement).toContain("status IN ('PENDING', 'FAILED')");
    // El invariante que protege la evidencia ya enlazada.
    expect(deleteStatement).toContain('media_asset_id IS NULL');
  });
});
