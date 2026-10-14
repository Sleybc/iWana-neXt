import { DataSource } from 'typeorm';
import { TaxContext, TaxCategory, TaxOrigin, TaxTreatment, JurisdictionLevel } from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { TaxCatalogReadAdapter } from './tax-catalog-read.adapter';
import { runInTenantSchema, TenantContext } from '@iwana/db';

jest.mock('@iwana/db', () => ({
  runInTenantSchema: jest.fn(),
  TenantContext: { getOrThrow: jest.fn() },
}));

describe('TaxCatalogReadAdapter', () => {
  const manager = { findOne: jest.fn(), find: jest.fn() };
  const dataSource = {} as DataSource;
  let adapter: TaxCatalogReadAdapter;

  const definition = () =>
    Object.assign(new TaxDefinition(), {
      id: 'tax-1',
      code: 'IVA_19',
      name: 'IVA general',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: '19.0000',
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: null,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({ schemaName: 'tenant_test' });
    (runInTenantSchema as jest.Mock).mockImplementation(
      (_dataSource: unknown, _schemaName: unknown, callback: (queryRunner: unknown) => unknown) =>
        callback({ manager }),
    );
    adapter = new TaxCatalogReadAdapter(dataSource);
  });

  it('maps an active definition by code to an immutable catalog snapshot', async () => {
    manager.findOne.mockResolvedValue(definition());

    await expect(adapter.findActiveByCode('IVA_19')).resolves.toMatchObject({
      id: 'tax-1',
      code: 'IVA_19',
      category: TaxCategory.VAT,
      isActive: true,
    });
  });

  it('returns null by code, preset and id when the query finds no definition', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(adapter.findActiveByCode('missing')).resolves.toBeNull();
    await expect(adapter.resolveSystemPreset('missing')).resolves.toBeNull();
    await expect(adapter.findById('missing')).resolves.toBeNull();
  });

  it('maps every result for the requested context and returns an empty list as-is', async () => {
    manager.find.mockResolvedValue([definition()]);
    await expect(adapter.listByContext(TaxContext.SALES)).resolves.toMatchObject([
      { id: 'tax-1', code: 'IVA_19', context: TaxContext.BOTH },
    ]);

    manager.find.mockResolvedValue([]);
    await expect(adapter.listByContext(TaxContext.SALES)).resolves.toEqual([]);
  });

  it('maps a system preset and an active definition by id when found', async () => {
    manager.findOne.mockResolvedValue(definition());

    await expect(adapter.resolveSystemPreset('IVA_19')).resolves.toMatchObject({
      origin: TaxOrigin.SYSTEM,
      code: 'IVA_19',
    });
    await expect(adapter.findById('tax-1')).resolves.toMatchObject({ id: 'tax-1' });
  });
});
