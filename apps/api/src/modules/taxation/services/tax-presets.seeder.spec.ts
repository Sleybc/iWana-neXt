import { DataSource } from 'typeorm';
import { TAX_COLOMBIA_PRESETS } from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { TaxPresetsSeeder } from './tax-presets.seeder';
import { runInTenantSchema } from '@iwana/db';

jest.mock('@iwana/db', () => ({ runInTenantSchema: jest.fn() }));

describe('TaxPresetsSeeder', () => {
  const manager = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
  let seeder: TaxPresetsSeeder;

  beforeEach(() => {
    jest.clearAllMocks();
    (runInTenantSchema as jest.Mock).mockImplementation(
      (_dataSource: unknown, _schemaName: unknown, callback: (queryRunner: unknown) => unknown) =>
        callback({ manager }),
    );
    manager.create.mockImplementation((_entity: unknown, preset: unknown) => preset);
    manager.save.mockImplementation(async (_entity: unknown, value: unknown) => value);
    seeder = new TaxPresetsSeeder({} as DataSource);
  });

  it('inserts only missing presets and leaves already seeded definitions untouched', async () => {
    manager.findOne.mockResolvedValueOnce(null);
    for (const preset of TAX_COLOMBIA_PRESETS.slice(1)) {
      manager.findOne.mockResolvedValueOnce({ code: preset.code });
    }

    await seeder.seedForTenant('tenant_test');

    expect(manager.create).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledTimes(TAX_COLOMBIA_PRESETS.length);
  });
});
