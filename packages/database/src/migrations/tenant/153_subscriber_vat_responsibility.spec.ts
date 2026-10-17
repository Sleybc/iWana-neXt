import { QueryRunner } from 'typeorm';

import { SubscriberVatResponsibility1530000000000 } from './153_subscriber_vat_responsibility';

describe('Migración 153 — responsabilidad de IVA', () => {
  it('expande el esquema, traduce el régimen anterior y permite la reversión', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('unmapped_count')) return [{ unmapped_count: 0 }];
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new SubscriberVatResponsibility1530000000000();

    await migration.up(runner);
    expect(statements.join('\n')).toContain(
      "CREATE TYPE vat_responsibility_enum AS ENUM ('RESPONSABLE', 'NO_RESPONSABLE')",
    );
    expect(statements.join('\n')).toContain("WHEN 'SIMPLIFIED' THEN 'NO_RESPONSABLE'");
    expect(statements.join('\n')).toContain('ck_subscribers_rut_responsibilities_known');

    statements.length = 0;
    await migration.down(runner);
    expect(statements.join('\n')).toContain('SET tax_regime = CASE vat_responsibility::text');
    expect(statements.join('\n')).toContain('ALTER COLUMN tax_regime SET NOT NULL');
    expect(statements.join('\n')).toContain('DROP TYPE IF EXISTS vat_responsibility_enum');
  });

  it('protege el down e informa cuántas filas no se pueden revertir', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('unmapped_count')) return [{ unmapped_count: 2 }];
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new SubscriberVatResponsibility1530000000000();

    await expect(migration.down(runner)).rejects.toThrow(/2.*tax_regime.*NULL/i);
    expect(statements.join('\n')).not.toContain('DROP TYPE');
  });

  it('bloquea el down si perdería responsabilidades del RUT sin autorización explícita', async () => {
    const originalFlag = process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    const runner = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('rut_count')) return [{ rut_count: 3 }];
        return [];
      }),
    } as unknown as QueryRunner;

    try {
      await expect(new SubscriberVatResponsibility1530000000000().down(runner)).rejects.toThrow(
        /3 suscriptores.*responsabilidades del RUT.*IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
      );
    } finally {
      if (originalFlag === undefined) delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
      else process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = originalFlag;
    }
  });
});
