import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { HardenCommercialConstraints1130000000000 } from './113_harden_commercial_constraints';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './113_harden_commercial_constraints.ts'),
  'utf8',
);

describe('HardenCommercialConstraints113', () => {
  it('es reversible, aborta con suciedad y no fija un schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new HardenCommercialConstraints1130000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);

    const allSql = query.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(allSql).toContain('RAISE EXCEPTION');
    expect(allSql).toContain('idx_compat_one_active_replaces');
    expect(allSql).toContain("rule_type = 'REPLACES'");
    expect(allSql).toContain('idx_compat_active_triplet');
    expect(allSql).toContain('chk_price_history_is_current_valid_to');
    expect(allSql).toContain('fk_tax_rule_applications_rule');
    expect(allSql).toContain('ADD COLUMN IF NOT EXISTS tenant_id');
    expect(allSql).not.toContain('tax_definitions');
    expect(allSql).not.toContain('EXCLUDE USING gist');
    expect(allSql).not.toContain('tenant_alpha');
    expect(allSql).not.toContain('btree_gist');

    const downSql = query.mock.calls
      .filter((call: unknown[]) => String(call[0]).includes('DROP'))
      .map((call: unknown[]) => String(call[0]))
      .join('\n');
    expect(downSql).toContain('idx_compat_one_active_replaces');
    expect(downSql).toContain('DROP COLUMN IF EXISTS tenant_id');
    expect(allSql).toContain('idx_compat_one_active_successor');
  });

  it('el fuente declara down() y pre-checks de SCD/applications', () => {
    expect(MIGRATION_SOURCE).toContain('async down(');
    expect(MIGRATION_SOURCE).toContain('dirty_scd');
    expect(MIGRATION_SOURCE).toContain('orphan_apps');
    expect(MIGRATION_SOURCE).toContain('REFERENCES tax_rules');
  });
});
