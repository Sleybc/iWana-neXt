import { PublishInstalacionV3163000000000 } from './163_publish_instalacion_estandar_v3';

describe('PublishInstalacionV3163', () => {
  it('publica una versión nueva a partir de v2 y añade el requisito requerido', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new PublishInstalacionV3163000000000().up({ query } as never);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('latest_version >= 3');
    expect(sql).toContain('latest_version <> 2');
    expect(sql).toContain("'Instalación estándar v3'");
    expect(sql).toContain("'service-provisioning'");
    expect(sql).toContain("'Aprovisionamiento certificado', TRUE, 'PROVISIONING'");
    expect(sql).not.toMatch(/UPDATE\s+execution_orders/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+execution_orders/i);
  });

  it('el rollback conserva v2 y bloquea si alguna orden referencia v3', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new PublishInstalacionV3163000000000().down({ query } as never);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('referencing_orders > 0');
    expect(sql).toContain('OT referencian la v3');
    expect(sql).toContain("AND template_key = 'INSTALACION_ESTANDAR' AND version = 3");
    expect(sql).not.toMatch(
      /DELETE\s+FROM\s+execution_order_template_versions[\s\S]*version\s*=\s*2/i,
    );
  });
});
