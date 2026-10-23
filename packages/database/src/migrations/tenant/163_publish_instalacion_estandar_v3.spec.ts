import { PublishInstalacionV3163000000000 } from './163_publish_instalacion_estandar_v3';

describe('PublishInstalacionV3163', () => {
  it('publica la versión siguiente y amplía el CHECK antes de insertar el requisito', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new PublishInstalacionV3163000000000().up({ query } as never);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS chk_execution_order_template_requirements_kind',
    );
    expect(sql).toContain("'COMPLIANCE','PROVISIONING'");
    expect(sql).toContain("status = 'PUBLISHED'");
    expect(sql).toContain('ORDER BY version.version DESC');
    expect(sql).toContain('COALESCE(MAX(version), latest_version) + 1');
    expect(sql).toContain("'service-provisioning'");
    expect(sql).toContain("'Aprovisionamiento certificado', TRUE, 'PROVISIONING'");
    expect(
      sql.indexOf('ADD CONSTRAINT chk_execution_order_template_requirements_kind'),
    ).toBeLessThan(sql.indexOf("'Aprovisionamiento certificado', TRUE, 'PROVISIONING'"));
    expect(sql).not.toMatch(/UPDATE\s+execution_orders/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+execution_orders/i);
  });

  it('el rollback conserva versiones previas, bloquea snapshots y restaura el CHECK', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new PublishInstalacionV3163000000000().down({ query } as never);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('referencing_orders > 0');
    expect(sql).toContain('OT referencian la versión publicada');
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS chk_execution_order_template_requirements_kind',
    );
    expect(sql).toContain("'COMPLIANCE')");
    expect(sql).not.toMatch(
      /DELETE\s+FROM\s+execution_order_template_versions[\s\S]*version\s*=\s*2/i,
    );
  });
});
