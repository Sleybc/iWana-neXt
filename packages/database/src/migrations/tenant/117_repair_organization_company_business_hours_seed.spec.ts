import { RepairOrganizationCompanyBusinessHoursSeed1170000000000 } from './117_repair_organization_company_business_hours_seed';

describe('RepairOrganizationCompanyBusinessHoursSeed117', () => {
  it('siembra siete dias solo cuando el horario base esta vacio', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new RepairOrganizationCompanyBusinessHoursSeed1170000000000();

    await migration.up({ query } as never);

    const upSql = String(query.mock.calls[0]?.[0]);
    expect(upSql).toContain('current_schema()');
    expect(upSql).toContain('public.tenants');
    expect(upSql).toContain('existing_count = 0');
    expect(upSql).toContain('explicit_configuration_count = 0');
    expect(upSql).toContain("entity_type = 'organization_company_business_hours'");
    expect(upSql).toContain('INSERT INTO organization_company_business_hours');
    expect(upSql).toContain("TIME '07:00:00'");
    expect(upSql).toContain("TIME '18:00:00'");
    expect(upSql).toContain('inserted_count <> 7');

    for (const weekday of [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ]) {
      expect(upSql).toContain(`'${weekday}'::business_hours_weekday_enum`);
    }

    expect(upSql).not.toContain('tenant_iwana');
  });

  it('revierte solo semillas intactas identificadas por la migracion', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new RepairOrganizationCompanyBusinessHoursSeed1170000000000();

    await migration.down({ query } as never);

    const downSql = String(query.mock.calls[0]?.[0]);
    expect(downSql).toContain('DELETE FROM organization_company_business_hours');
    expect(downSql).toContain("'migration-117'");
    expect(downSql).toContain("hours.opens_at = TIME '07:00:00'");
    expect(downSql).toContain("hours.closes_at = TIME '18:00:00'");
    expect(downSql).toContain('hours.created_at = hours.updated_at');
    expect(downSql).toContain('seed_row_count <> 7 OR intact_seed_count <> 7');
    expect(downSql).toContain('RAISE EXCEPTION');
    expect(downSql).not.toContain('tenant_iwana');
  });
});
