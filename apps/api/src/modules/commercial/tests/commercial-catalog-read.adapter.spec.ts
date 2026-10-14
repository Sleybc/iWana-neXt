import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { CustomerSegment, InstallationRule, NetworkType, VatConcept } from '@iwana/shared';
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
      {
        id: 'plan-1',
        name: 'Plan Fibra 300',
        type: 'PLAN',
        isActive: true,
        vatConcept: VatConcept.INTERNET_ACCESS,
      },
    ],
    findOne: async () => ({
      id: 'plan-1',
      name: 'Plan Fibra 300',
      type: 'PLAN',
      isActive: true,
      vatConcept: VatConcept.INTERNET_ACCESS,
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
            networkType: NetworkType.MOBILE,
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
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.MOBILE,
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
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.MOBILE,
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

  it('devuelve defaults fiscales y técnicos cuando faltan precio y detalle del plan', async () => {
    const item = {
      id: 'plan-legacy',
      name: 'Plan heredado',
      type: 'PLAN',
      isActive: true,
      vatConcept: null,
    };
    const createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }));
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({ manager: { find: async () => [item], createQueryBuilder } }),
    );

    const result = await adapter.getActivePlans('ten-1', 'tenant_test');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'plan-legacy',
        technology: 'N/A',
        downloadSpeedMbps: 0,
        uploadSpeedMbps: 0,
        basePrice: 0,
        installationFee: 0,
        vatConcept: null,
        networkType: NetworkType.FIXED,
      }),
    ]);
    expect(createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('retorna lista vacía de planes sin consultar precios ni detalles', async () => {
    const createQueryBuilder = jest.fn();
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({ manager: { find: async () => [], createQueryBuilder } }),
    );

    await expect(adapter.getActivePlans('ten-1', 'tenant_test')).resolves.toEqual([]);
    expect(createQueryBuilder).not.toHaveBeenCalled();
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
                vatConcept: VatConcept.INTERNET_ACCESS,
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
              networkType: NetworkType.MOBILE,
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
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.MOBILE,
      }),
    );
  });

  it('rechaza el snapshot si el plan está inactivo o eliminado', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({ manager: { findOne } }),
    );

    await expect(adapter.createSnapshot('ten-1', 'tenant_test', 'plan-legacy')).rejects.toThrow(
      NotFoundException,
    );
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('rechaza el snapshot si el plan no tiene precio vigente para el segmento', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ id: 'plan-1', name: 'Plan sin precio', isActive: true })
      .mockResolvedValueOnce(null);
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({ manager: { findOne } }),
    );

    await expect(adapter.createSnapshot('ten-1', 'tenant_test', 'plan-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(findOne).toHaveBeenCalledTimes(2);
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

  it('omite la consulta de detalles cuando no hay productos activos', async () => {
    const createQueryBuilder = jest.fn();
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({ manager: { find: async () => [], createQueryBuilder } }),
    );

    await expect(adapter.getActiveProducts('ten-1', 'tenant_test')).resolves.toEqual([]);
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('resuelve producto vigente sin detalle con los flags conservadores', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async (entity: { name?: string }) =>
            entity?.name === 'CatalogItem'
              ? { id: 'prod-legacy', name: 'Producto legado', isActive: true }
              : null,
        },
      }),
    );

    await expect(
      adapter.resolveProductReference('ten-1', 'tenant_test', 'prod-legacy'),
    ).resolves.toEqual({
      id: 'prod-legacy',
      name: 'Producto legado',
      isActive: true,
      requiresInventory: false,
      isLoan: false,
    });
  });

  it('devuelve null si no existe el producto solicitado', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({ manager: { findOne: async () => null } }),
    );

    await expect(
      adapter.resolveProductReference('ten-1', 'tenant_test', 'missing'),
    ).resolves.toBeNull();
  });
});
