import { SeedDefaultExecutionOrderTemplates1180000000000 } from './118_seed_default_execution_order_templates';

describe('SeedDefaultExecutionOrderTemplates118', () => {
  it('siembra plantilla INSTALLATION publicada y repara OTs sin snapshot', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedDefaultExecutionOrderTemplates1180000000000();

    await migration.up({ query } as never);

    const upSql = String(query.mock.calls[0]?.[0]);
    expect(upSql).toContain('INSTALACION_ESTANDAR');
    expect(upSql).toContain('execution_order_templates');
    expect(upSql).toContain('template_requirements_snapshot IS NULL');
    expect(upSql).toContain('CUSTOMER_SIGNATURE');
  });

  it('revierte la plantilla sembrada solo si no hay OT abiertas dependientes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedDefaultExecutionOrderTemplates1180000000000();

    await migration.down({ query } as never);

    const downSql = String(query.mock.calls[0]?.[0]);
    expect(downSql).toContain('dependent_orders > 0');
    expect(downSql).toContain('INSTALACION_ESTANDAR');
  });
});
