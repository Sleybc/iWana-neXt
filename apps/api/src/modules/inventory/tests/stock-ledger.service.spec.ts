import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockLocationType,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockLedgerService } from '../services/stock-ledger.service';

jest.mock('@iwana/db', () => ({
  StockBalance: class StockBalance {},
  StockLocation: class StockLocation {},
  StockMovement: class StockMovement {},
  StockMovementLine: class StockMovementLine {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

describe('StockLedgerService', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects movements that would produce negative balances', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'saved-001',
        ...payload,
      })),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      find: jest.fn().mockResolvedValue([]),
    };
    const stockBalanceService = {
      applyDeltaWithManager: jest
        .fn()
        .mockRejectedValue(new Error('El movimiento dejaría saldo negativo.')),
    };
    const serializedAssetService = {
      resolveForMovementWithManager: jest.fn(),
      transitionAssetWithManager: jest.fn(),
    };
    const assetLifecycleService = {
      recordWithManager: jest.fn(),
    };

    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      serializedAssetService as never,
      assetLifecycleService as never,
    );

    await expect(
      service.recordMovementWithManager(
        manager as never,
        'tenant-001',
        {
          origin: StockMovementOrigin.TRANSFER,
          originContext: 'inventory.transfer',
          idempotencyKey: 'negative-balance',
          lines: [{ itemId: 'item-001', locationId: 'loc-001', quantity: -1 }],
        },
        actor,
      ),
    ).rejects.toThrow('saldo negativo');
  });

  it('returns the same movement when the idempotency key is reused', async () => {
    const existingMovement = {
      id: 'mov-001',
      tenantId: 'tenant-001',
      idempotencyKey: 'same-key',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(existingMovement),
      find: jest.fn().mockResolvedValue([{ id: 'line-001', movementId: 'mov-001' }]),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      transaction: jest.fn(),
    };
    const service = new StockLedgerService(
      {} as DataSource,
      { applyDeltaWithManager: jest.fn() } as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
    );

    const result = await service.recordMovementWithManager(
      manager as never,
      'tenant-001',
      {
        origin: StockMovementOrigin.SALE,
        originContext: 'inventory.sale',
        idempotencyKey: 'same-key',
        lines: [{ itemId: 'item-001', locationId: 'loc-001', quantity: -1 }],
      },
      actor,
    );

    expect(result.movement).toBe(existingMovement);
    expect(result.lines).toEqual([{ id: 'line-001', movementId: 'mov-001' }]);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('keeps ledger append-only and creates movement plus lines only once', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000009' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'mov-010', ...payload }))
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'line-010', ...payload })),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      find: jest.fn().mockResolvedValue([]),
    };
    const stockBalanceService = {
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
    );

    const result = await service.recordMovementWithManager(
      manager as never,
      'tenant-001',
      {
        origin: StockMovementOrigin.INTERNAL_CONSUMPTION,
        originContext: 'inventory.internal-consumption',
        idempotencyKey: 'append-only',
        lines: [{ itemId: 'item-001', locationId: 'loc-001', quantity: -1 }],
      },
      actor,
    );

    expect(result.movement.movementNumber).toBe('MOV-000010');
    expect(result.lines).toEqual([expect.objectContaining({ movementId: 'mov-010' })]);
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  it('does not assign technician custody when a serialized transfer goes to quarantine', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'loc-source',
          tenantId: 'tenant-001',
          type: StockLocationType.MAIN_WAREHOUSE,
          responsibleRefId: null,
          maxCapacity: null,
        })
        .mockResolvedValueOnce({
          id: 'loc-quarantine',
          tenantId: 'tenant-001',
          type: StockLocationType.QUARANTINE,
          responsibleRefId: null,
          maxCapacity: null,
        })
        .mockResolvedValueOnce(null),
      find: jest
        .fn()
        .mockResolvedValueOnce([{ quantityOnHand: '1.00', lotId: null }])
        .mockResolvedValueOnce([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000009' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'mov-010', ...payload }))
        .mockImplementation(async (_entity, payload) => ({ id: 'line-010', ...payload })),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    const stockBalanceService = {
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    };
    const serializedAssetService = {
      resolveForMovementWithManager: jest.fn().mockResolvedValue({
        id: 'asset-001',
        inventoryItemId: 'item-001',
        currentLocationId: 'loc-source',
        serialNumber: 'SER-001',
        currentStatus: SerializedAssetStatus.AVAILABLE,
      }),
      transitionAssetWithManager: jest.fn().mockResolvedValue({
        id: 'asset-001',
      }),
    };
    const assetLifecycleService = {
      recordWithManager: jest.fn(),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      serializedAssetService as never,
      assetLifecycleService as never,
    );

    await service.transfer(
      {
        itemId: 'item-001',
        sourceLocationId: 'loc-source',
        destinationLocationId: 'loc-quarantine',
        quantity: 1,
        condition: StockBalanceCondition.NEW,
        serialNumber: 'SER-001',
        handoffReference: 'ACT-001',
      },
      actor,
    );

    expect(serializedAssetService.transitionAssetWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
        currentResponsibleRefId: null,
        toStatus: SerializedAssetStatus.AVAILABLE,
      }),
    );
  });

  it('rejects mobile transfers that exceed destination capacity', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'loc-source',
          tenantId: 'tenant-001',
          type: StockLocationType.MAIN_WAREHOUSE,
          responsibleRefId: null,
          maxCapacity: null,
        })
        .mockResolvedValueOnce({
          id: 'loc-mobile',
          tenantId: 'tenant-001',
          type: StockLocationType.MOBILE_TECHNICIAN,
          responsibleRefId: 'tech-001',
          maxCapacity: '1.00',
        }),
      find: jest
        .fn()
        .mockResolvedValueOnce([{ quantityOnHand: '2.00', lotId: null }])
        .mockResolvedValueOnce([{ quantityOnHand: '1.00' }]),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    const stockBalanceService = {
      applyDeltaWithManager: jest.fn(),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
    );

    await expect(
      service.transfer(
        {
          itemId: 'item-001',
          sourceLocationId: 'loc-source',
          destinationLocationId: 'loc-mobile',
          quantity: 1,
          condition: StockBalanceCondition.NEW,
          handoffReference: 'ACT-002',
        },
        actor,
      ),
    ).rejects.toThrow('capacidad máxima');

    expect(stockBalanceService.applyDeltaWithManager).not.toHaveBeenCalled();
  });

  it('requires handoff evidence and rejects transfers that exceed the source balance', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'loc-source',
          tenantId: 'tenant-001',
          type: StockLocationType.MAIN_WAREHOUSE,
          responsibleRefId: null,
          maxCapacity: null,
        })
        .mockResolvedValueOnce({
          id: 'loc-destination',
          tenantId: 'tenant-001',
          type: StockLocationType.MAIN_WAREHOUSE,
          responsibleRefId: null,
          maxCapacity: null,
        }),
      find: jest.fn().mockResolvedValue([{ quantityOnHand: '1.00', lotId: null }]),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLedgerService(
      {} as DataSource,
      { applyDeltaWithManager: jest.fn() } as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
    );

    await expect(
      service.transfer(
        {
          itemId: 'item-001',
          sourceLocationId: 'loc-source',
          destinationLocationId: 'loc-destination',
          quantity: 1,
          condition: StockBalanceCondition.NEW,
          handoffReference: '   ',
        },
        actor,
      ),
    ).rejects.toThrow('acta o evidencia');

    await expect(
      service.transfer(
        {
          itemId: 'item-001',
          sourceLocationId: 'loc-source',
          destinationLocationId: 'loc-destination',
          quantity: 2,
          condition: StockBalanceCondition.NEW,
          handoffReference: 'ACT-003',
        },
        actor,
      ),
    ).rejects.toThrow('saldo disponible en origen');
  });

  it('rejects serialized transfers when the asset does not belong to the item or source location', async () => {
    const sourceLocation = {
      id: 'loc-source',
      tenantId: 'tenant-001',
      type: StockLocationType.MAIN_WAREHOUSE,
      responsibleRefId: null,
      maxCapacity: null,
    };
    const destinationLocation = {
      id: 'loc-destination',
      tenantId: 'tenant-001',
      type: StockLocationType.MAIN_WAREHOUSE,
      responsibleRefId: null,
      maxCapacity: null,
    };
    const manager = {
      findOne: jest
        .fn()
        .mockImplementation(async (_entity, options: { where: { id?: string } }) => {
          if (options.where.id === 'loc-source') {
            return sourceLocation;
          }

          if (options.where.id === 'loc-destination') {
            return destinationLocation;
          }

          return null;
        }),
      find: jest.fn().mockResolvedValue([{ quantityOnHand: '1.00', lotId: null }]),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    const serializedAssetService = {
      resolveForMovementWithManager: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'asset-001',
          inventoryItemId: 'item-999',
          currentLocationId: 'loc-source',
          currentStatus: SerializedAssetStatus.AVAILABLE,
          serialNumber: 'SER-001',
        })
        .mockResolvedValueOnce({
          id: 'asset-002',
          inventoryItemId: 'item-001',
          currentLocationId: 'loc-other',
          currentStatus: SerializedAssetStatus.AVAILABLE,
          serialNumber: 'SER-002',
        }),
      transitionAssetWithManager: jest.fn(),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLedgerService(
      {} as DataSource,
      { applyDeltaWithManager: jest.fn() } as never,
      serializedAssetService as never,
      { recordWithManager: jest.fn() } as never,
    );

    await expect(
      service.transfer(
        {
          itemId: 'item-001',
          sourceLocationId: 'loc-source',
          destinationLocationId: 'loc-destination',
          quantity: 1,
          serialNumber: 'SER-001',
          condition: StockBalanceCondition.NEW,
          handoffReference: 'ACT-004',
        },
        actor,
      ),
    ).rejects.toThrow('no corresponde al ítem');

    await expect(
      service.transfer(
        {
          itemId: 'item-001',
          sourceLocationId: 'loc-source',
          destinationLocationId: 'loc-destination',
          quantity: 1,
          serialNumber: 'SER-002',
          condition: StockBalanceCondition.NEW,
          handoffReference: 'ACT-005',
        },
        actor,
      ),
    ).rejects.toThrow('bodega origen');
  });

  it('keeps serialized returns in transit without crediting destination stock', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000099' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'mov-099', ...payload }))
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'line-099', ...payload })),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    const stockBalanceService = {
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    };
    const serializedAssetService = {
      resolveForMovementWithManager: jest.fn().mockResolvedValue({
        id: 'asset-099',
        inventoryItemId: 'item-001',
        currentLocationId: 'loc-customer',
        currentStatus: SerializedAssetStatus.INSTALLED_COMODATO,
        serialNumber: 'SER-099',
      }),
      transitionAssetWithManager: jest.fn().mockResolvedValue({
        id: 'asset-099',
        currentStatus: SerializedAssetStatus.IN_TRANSIT,
        currentLocationId: null,
      }),
    };
    const assetLifecycleService = {
      recordWithManager: jest.fn(),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      serializedAssetService as never,
      assetLifecycleService as never,
    );

    await service.recordReturn(
      {
        itemId: 'item-001',
        sourceLocationId: 'loc-customer',
        destinationLocationId: 'loc-return-hub',
        quantity: 1,
        serializedAssetId: 'asset-099',
        targetStatus: SerializedAssetStatus.IN_TRANSIT,
      },
      actor,
    );

    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenCalledTimes(1);
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        itemId: 'item-001',
        locationId: 'loc-customer',
        delta: -1,
      }),
    );
    expect(serializedAssetService.transitionAssetWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        serializedAssetId: 'asset-099',
        currentLocationId: null,
        currentResponsibleType: InventoryResponsibleType.NONE,
        toStatus: SerializedAssetStatus.IN_TRANSIT,
      }),
    );
  });
});
