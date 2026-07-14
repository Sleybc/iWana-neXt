import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CatalogItemType } from '@iwana/shared';
import { CatalogBundle } from '../entities/catalog-bundle.entity';
import { CatalogItem } from '../entities/catalog-item.entity';
import { CatalogPromotion } from '../entities/catalog-promotion.entity';
import { CompatibilityRule } from '../entities/compatibility-rule.entity';
import { TaxRule } from '../entities/tax-rule.entity';
import { CommercialDashboardService } from '../services/commercial-dashboard.service';

const tenantId = 'tenant-uuid-test';
const schemaName = 'tenant_test';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: {
      getOrThrow: jest.fn(() => ({ tenantId, schemaName })),
    },
    runInTenantSchema: jest.fn(
      async (
        _dataSource: unknown,
        _schema: string,
        callback: (qr: {
          manager: {
            find: (
              entity: unknown,
              options?: { where?: { tenantId: string } },
            ) => Promise<unknown[]>;
          };
        }) => Promise<unknown>,
      ) => {
        const find = jest.fn(async (entity: unknown) => {
          if (entity === CatalogItem) {
            return [
              { id: '1', tenantId, type: CatalogItemType.PLAN, isActive: true },
              { id: '2', tenantId, type: CatalogItemType.PLAN, isActive: false },
              { id: '3', tenantId, type: CatalogItemType.PRODUCT, isActive: true },
              { id: '4', tenantId, type: CatalogItemType.SERVICE, isActive: true },
            ];
          }

          if (entity === CatalogBundle) {
            return [
              { id: 'b1', tenantId, isActive: true },
              { id: 'b2', tenantId, isActive: false },
            ];
          }

          if (entity === CatalogPromotion) {
            const now = new Date();
            return [
              {
                id: 'p1',
                tenantId,
                isActive: true,
                validFrom: new Date(now.getTime() - 86_400_000),
                validTo: new Date(now.getTime() + 86_400_000),
                maxUses: 10,
                currentUses: 2,
              },
              {
                id: 'p2',
                tenantId,
                isActive: true,
                validFrom: new Date(now.getTime() - 86_400_000),
                validTo: new Date(now.getTime() + 86_400_000),
                maxUses: 5,
                currentUses: 5,
              },
            ];
          }

          if (entity === CompatibilityRule) {
            return [
              { id: 'c1', tenantId, isActive: true },
              { id: 'c2', tenantId, isActive: false },
            ];
          }

          if (entity === TaxRule) {
            return [
              { id: 't1', tenantId, isActive: true },
              { id: 't2', tenantId, isActive: false },
            ];
          }

          return [];
        });

        return callback({ manager: { find } });
      },
    ),
  };
});

describe('CommercialDashboardService', () => {
  let service: CommercialDashboardService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CommercialDashboardService, { provide: getDataSourceToken(), useValue: {} }],
    }).compile();

    service = moduleRef.get(CommercialDashboardService);
  });

  it('agrega conteos por tipo de catálogo y reglas activas', async () => {
    const summary = await service.getSummary();

    expect(summary).toEqual({
      plansCount: 2,
      activePlansCount: 1,
      productsCount: 1,
      activeProductsCount: 1,
      servicesCount: 1,
      activeServicesCount: 1,
      bundlesCount: 2,
      activeBundlesCount: 1,
      promotionsCount: 2,
      activePromotionsCount: 1,
      compatibilityRulesCount: 2,
      activeCompatibilityRulesCount: 1,
      taxRulesCount: 2,
      activeTaxRulesCount: 1,
    });
  });
});
