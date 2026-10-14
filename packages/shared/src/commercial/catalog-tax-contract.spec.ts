import { NetworkType, VatConcept } from '../enums/taxation';
import {
  catalogItemTaxFieldsSchema,
  createCatalogItemTaxFieldsSchema,
  createPlanNetworkFieldsSchema,
  updateCatalogItemTaxFieldsSchema,
} from './catalog-tax-contract';

describe('Commercial catalog tax contract', () => {
  it('requires a fiscal concept when creating a catalog item', () => {
    expect(createCatalogItemTaxFieldsSchema.safeParse({}).success).toBe(false);
    expect(
      createCatalogItemTaxFieldsSchema.parse({ vatConcept: VatConcept.INTERNET_ACCESS }),
    ).toEqual({ vatConcept: VatConcept.INTERNET_ACCESS });
  });

  it('allows legacy items to be updated without changing their fiscal concept', () => {
    expect(updateCatalogItemTaxFieldsSchema.parse({})).toEqual({});
    expect(updateCatalogItemTaxFieldsSchema.safeParse({ vatConcept: null }).success).toBe(false);
    expect(catalogItemTaxFieldsSchema.parse({ vatConcept: null })).toEqual({ vatConcept: null });
  });

  it('defaults an omitted plan network to FIXED', () => {
    expect(createPlanNetworkFieldsSchema.parse({})).toEqual({ networkType: NetworkType.FIXED });
    expect(createPlanNetworkFieldsSchema.safeParse({ networkType: null }).success).toBe(false);
  });
});
