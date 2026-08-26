import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AddCustomerSegmentToExpedienteRecords1160000000000 } from './116_add_customer_segment_to_expediente_records';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './116_add_customer_segment_to_expediente_records.ts'),
  'utf8',
);

describe('AddCustomerSegmentToExpedienteRecords116', () => {
  it('es reversible, nullable y no fija un schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddCustomerSegmentToExpedienteRecords1160000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);

    const allSql = query.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(allSql).toContain('ALTER TABLE expediente_records');
    expect(allSql).toContain('ADD COLUMN IF NOT EXISTS customer_segment');
    expect(allSql).toContain('customer_segment_enum');
    expect(allSql).toContain('NULL');
    expect(allSql).toContain('DROP COLUMN IF EXISTS customer_segment');
    expect(allSql).not.toContain('tenant_alpha');
    expect(allSql).not.toContain('"tenant_');
  });

  it('el fuente declara name, up() y down() sin imports de apps/api', () => {
    expect(MIGRATION_SOURCE).toContain(
      "name = 'AddCustomerSegmentToExpedienteRecords1160000000000'",
    );
    expect(MIGRATION_SOURCE).toContain('public async up(');
    expect(MIGRATION_SOURCE).toContain('public async down(');
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
  });
});
