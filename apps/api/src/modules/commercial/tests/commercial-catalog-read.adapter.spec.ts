import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { CustomerSegment, InstallationRule } from '@iwana/shared';
import { CommercialCatalogReadAdapter } from '../ports/commercial-catalog-read.adapter';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: jest.fn() },
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

function mockPlanManager() {
  return {
    find: async (_entity: unknown) => [
      { id: 'plan-1', name: 'Plan Fibra 300', type: 'PLAN', isActive: true },
    ],
    findOne: async () => ({
      id: 'plan-1',
      name: 'Plan Fibra 300',
      type: 'PLAN',
      isActive: true,
    }),
    createQueryBuilder: (entity: { name?: string }) => {
      if (entity?.name === 'CatalogPriceHistory') {
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([
            {
              itemId: 'plan-1',
              basePrice: '89900.00',
              installationFee: '120000.00',
            },
          ]),
        };
      }

      return {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            itemId: 'plan-1',
            technology: 'FTTH',
            downloadSpeedMbps: 300,
            uploadSpeedMbps: 300,
            installationRule: InstallationRule.ON_DEMAND,
          },
        ]),
      };
    },
  };
}

describe('CommercialCatalogReadAdapter', () => {
  let adapter: CommercialCatalogReadAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommercialCatalogReadAdapter, { provide: DataSource, useValue: {} }],
    }).compile();

    adapter = module.get<CommercialCatalogReadAdapter>(CommercialCatalogReadAdapter);
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'ten-ctx',
      schemaName: 'tenant_ctx',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('mapea planes activos al contrato PlanCatalogReadPort', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({ manager: mockPlanManager() }),
    );

    const result = await adapter.getActivePlans('ten-caller', 'tenant_caller');

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_ctx',
      expect.any(Function),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'plan-1',
        name: 'Plan Fibra 300',
        technology: 'FTTH',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 300,
        basePrice: 89900,
        installationFee: 120000,
        isActive: true,
      }),
    ]);
  });

  it('resuelve un plan activo por id sin cargar el catálogo completo', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({ manager: mockPlanManager() }),
    );

    const result = await adapter.getPlanById('ten-caller', 'tenant_caller', 'plan-1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'plan-1',
        name: 'Plan Fibra 300',
        technology: 'FTTH',
        downloadSpeedMbps: 300,
        basePrice: 89900,
      }),
    );
  });

  it('devuelve null cuando getPlanById no encuentra el plan', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
        },
      }),
    );

    await expect(adapter.getPlanById('ten-1', 'tenant_test', 'missing')).resolves.toBeNull();
  });

  it('crea snapshot compatible con QuotesService', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async (entity: { name?: string }) => {
            if (entity?.name === 'CatalogItem') {
              return {
                id: 'plan-1',
                tenantId: 'ten-1',
                name: 'Plan Pyme 500',
                type: 'PLAN',
                isActive: true,
                deletedAt: null,
              };
            }

            if (entity?.name === 'CatalogPriceHistory') {
              return {
                itemId: 'plan-1',
                customerSegment: CustomerSegment.RESIDENTIAL,
                basePrice: '129900.00',
                installationFee: '0.00',
                isCurrent: true,
              };
            }

            return {
              itemId: 'plan-1',
              technology: 'XGS-PON',
              downloadSpeedMbps: 500,
              uploadSpeedMbps: 500,
              installationRule: InstallationRule.ALWAYS,
            };
          },
        },
      }),
    );

    const result = await adapter.createSnapshot('ten-1', 'tenant_test', 'plan-1');

    expect(result).toEqual(
      expect.objectContaining({
        planId: 'plan-1',
        name: 'Plan Pyme 500',
        downloadSpeed: 500,
        uploadSpeed: 500,
        monthlyPrice: 129900,
        installationFee: 0,
        technology: 'XGS-PON',
      }),
    );
  });

  it('expone productos adicionales activos para referencias de inventario', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          find: async () => [
            {
              id: 'prod-1',
              tenantId: 'ten-1',
              name: 'Router WiFi 6',
              type: 'PRODUCT',
              isActive: true,
              deletedAt: null,
            },
          ],
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([
              {
                itemId: 'prod-1',
                isLoan: true,
                requiresInventory: true,
                category: 'CPE',
              },
            ]),
          }),
        },
      }),
    );

    const result = await adapter.getActiveProducts('ten-1', 'tenant_test');

    expect(result).toEqual([
      {
        id: 'prod-1',
        name: 'Router WiFi 6',
        isActive: true,
        requiresInventory: true,
        isLoan: true,
      },
    ]);
  });
});
