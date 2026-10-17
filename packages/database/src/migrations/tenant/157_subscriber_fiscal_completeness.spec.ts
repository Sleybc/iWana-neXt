import { QueryRunner } from 'typeorm';

import { SubscriberFiscalCompleteness1570000000000 } from './157_subscriber_fiscal_completeness';

describe('Migración 157 — completitud fiscal al activar', () => {
  it('permite VAT nulo en prospectos y exige datos fiscales para estados activos', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;

    await new SubscriberFiscalCompleteness1570000000000().up(runner);
    const executed = statements.join('\n');
    expect(executed).toContain('ALTER COLUMN vat_responsibility DROP NOT NULL');
    expect(executed).toContain(
      'DROP CONSTRAINT IF EXISTS ck_subscribers_juridica_legal_representative',
    );
    expect(executed).toContain('ADD CONSTRAINT ck_subscribers_fiscal_complete_when_active');
    expect(executed).toContain("status IN ('LEAD', 'PROSPECT', 'CANCELLED')");
    expect(executed).toContain('vat_responsibility IS NOT NULL');
    expect(executed).toContain(
      "person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL",
    );
    expect(executed).toContain('NOT VALID');
  });

  it('informa y bloquea el down antes de DDL si hay VAT nulo', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('missing_vat_count')) return [{ missing_vat_count: 2 }];
        return [];
      }),
    } as unknown as QueryRunner;
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await expect(new SubscriberFiscalCompleteness1570000000000().down(runner)).rejects.toThrow(
        /2 suscriptores.*vat_responsibility.*resolver antes de revertir/,
      );
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('vat_responsibility NULL: 2'));
      expect(statements.join('\n')).not.toContain('ALTER TABLE subscribers');
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('restaura el CHECK de 154 y el NOT NULL de 153 después del preflight vacío', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('missing_vat_count')) return [{ missing_vat_count: 0 }];
        return [];
      }),
    } as unknown as QueryRunner;
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await new SubscriberFiscalCompleteness1570000000000().down(runner);
      const executed = statements.join('\n');
      expect(infoSpy).toHaveBeenCalledWith('[157] vat_responsibility NULL: 0');
      expect(executed).toContain(
        'DROP CONSTRAINT IF EXISTS ck_subscribers_fiscal_complete_when_active',
      );
      expect(executed).toContain('ADD CONSTRAINT ck_subscribers_juridica_legal_representative');
      expect(executed).toContain('ALTER COLUMN vat_responsibility SET NOT NULL');
      expect(executed).toContain('NOT VALID');
    } finally {
      infoSpy.mockRestore();
    }
  });
});
