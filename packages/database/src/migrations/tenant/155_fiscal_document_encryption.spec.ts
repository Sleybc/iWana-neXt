import { QueryRunner } from 'typeorm';

import { FiscalDocumentEncryption1550000000000 } from './155_fiscal_document_encryption';

describe('Migración 155 — expansión del documento fiscal', () => {
  it('agrega cifrado, HMAC e índices y los revierte sin eliminar el texto legado', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new FiscalDocumentEncryption1550000000000();

    await migration.up(runner);
    expect(statements.join('\n')).toContain('fiscal_document_encrypted varchar(500)');
    expect(statements.join('\n')).toContain('fiscal_document_hmac varchar(64)');
    expect(statements.join('\n')).toContain('idx_contracts_fiscal_document_hmac');
    expect(statements.join('\n')).toContain('idx_expediente_records_fiscal_document_hmac');

    statements.length = 0;
    await migration.down(runner);
    expect(statements.join('\n')).toContain('DROP COLUMN IF EXISTS fiscal_document_encrypted');
    expect(statements.join('\n')).not.toContain('DROP COLUMN fiscal_document');
  });

  it('bloquea el down cuando las columnas nuevas contienen datos', async () => {
    const originalFlag = process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    const runner = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('contracts_count')) return [{ contracts_count: 1, expedientes_count: 2 }];
        return [];
      }),
    } as unknown as QueryRunner;

    try {
      await expect(new FiscalDocumentEncryption1550000000000().down(runner)).rejects.toThrow(
        /contratos=1, expedientes=2.*IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
      );
    } finally {
      if (originalFlag === undefined) delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
      else process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = originalFlag;
    }
  });
});
