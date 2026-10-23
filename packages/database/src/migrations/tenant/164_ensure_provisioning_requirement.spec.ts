import { EnsureProvisioningRequirement1640000000000 } from './164_ensure_provisioning_requirement';

describe('EnsureProvisioningRequirement164', () => {
  it('amplía el CHECK y repara la última versión publicada cuando falta PROVISIONING', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new EnsureProvisioningRequirement1640000000000().up({ query } as never);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS chk_execution_order_template_requirements_kind',
    );
    expect(sql).toContain("'COMPLIANCE','PROVISIONING'");
    expect(sql).toContain("status = 'PUBLISHED'");
    expect(sql).toContain("requirement.kind = 'PROVISIONING'");
    expect(sql).toContain("'migration-164'");
    expect(sql).not.toMatch(/UPDATE\s+execution_orders/i);
  });

  it('revierte solo su versión y restaura el CHECK si ya no quedan requisitos PROVISIONING', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new EnsureProvisioningRequirement1640000000000().down({ query } as never);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("'migration-164'");
    expect(sql).toContain('OT referencian la versión publicada');
    expect(sql).toContain("kind = 'PROVISIONING'");
    expect(sql).toContain("'COMPLIANCE')");
  });
});
