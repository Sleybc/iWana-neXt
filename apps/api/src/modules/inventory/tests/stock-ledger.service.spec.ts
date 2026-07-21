import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  ExecutionOrderItemAction,
  InventoryDisposition,
  InventoryResponsibleType,
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockAdjustmentReason,
  StockBalanceCondition,
  StockLocationType,
  StockMovementOrigin,
  UserRole,
  WriteOffReason,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockLedgerService } from '../services/stock-ledger.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
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
  const inventoryCostingServiceMock = {
    resolveSealedUnitCostWithManager: jest.fn().mockResolvedValue(null),
    applyReceiptCostingWithManager: jest.fn().mockResolvedValue(undefined),
    sumOnHandWithManager: jest.fn().mockResolvedValue(0),
  };

  const assetLoanServiceMock = {
    openLoanWithManager: jest.fn().mockResolvedValue(undefined),
    closeOpenLoanWithManager: jest.fn().mockResolvedValue(null),
  };

  const domainEventPublisherMock = {
    captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
    publishAfterCommittedMovement: jest.fn(),
    emitStockLowCrossings: jest.fn(),
    emitAssetSoldForMovement: jest.fn(),
  };

  function createStockLedgerService(
    dataSource: DataSource,
    stockBalanceService: unknown,
    serializedAssetService: unknown,
    assetLifecycleService: unknown,
    customerSiteLocationResolver?: unknown,
  ): StockLedgerService {
    return new StockLedgerService(
      dataSource,
      stockBalanceService as never,
      serializedAssetService as never,
      assetLifecycleService as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
      customerSiteLocationResolver as never,
    );
  }

  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  function withAvailability<T extends Record<string, unknown>>(
    stockBalanceService: T,
    availability: { onHand: number; reserved: number; available: number } = {
      onHand: 100,
      reserved: 0,
      available: 100,
    },
  ): T & {
    getAvailabilityWithManager: jest.Mock;
    getAvailableQuantityWithManager: jest.Mock;
  } {
    return {
      getAvailabilityWithManager: jest.fn().mockResolvedValue(availability),
      getAvailableQuantityWithManager: jest.fn().mockResolvedValue(availability.available),
      ...stockBalanceService,
    };
  }

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
    const stockBalanceService = withAvailability({
      applyDeltaWithManager: jest
        .fn()
        .mockRejectedValue(new Error('El movimiento dejaría saldo negativo.')),
    });
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
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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
      withAvailability({ applyDeltaWithManager: jest.fn() }) as unknown as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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
    const stockBalanceService = withAvailability({
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    });
    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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
    expect(inventoryCostingServiceMock.resolveSealedUnitCostWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      'item-001',
      expect.any(Map),
    );
  });

  it('sella unitCost en salidas cuando el costing resuelve avg > 0 (CA-F4-03)', async () => {
    inventoryCostingServiceMock.resolveSealedUnitCostWithManager.mockResolvedValueOnce(25);

    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000020' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'mov-020', ...payload }))
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'line-020', ...payload })),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      find: jest.fn().mockResolvedValue([]),
    };

    const service = new StockLedgerService(
      {} as DataSource,
      withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue(undefined) }) as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
    );

    const result = await service.recordMovementWithManager(
      manager as never,
      'tenant-001',
      {
        origin: StockMovementOrigin.SALE,
        originContext: 'inventory.sale',
        idempotencyKey: 'seal-outbound',
        lines: [{ itemId: 'item-001', locationId: 'loc-001', quantity: -2 }],
      },
      actor,
    );

    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        unitCost: '25.00',
        quantity: '-2.00',
      }),
    );
  });

  it('ajuste negativo sella unitCost y no invoca applyReceiptCosting (CA-F4-04)', async () => {
    inventoryCostingServiceMock.resolveSealedUnitCostWithManager.mockResolvedValueOnce(18.5);

    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'item-001',
          trackingMode: InventoryTrackingMode.CONSUMABLE,
        })
        .mockResolvedValueOnce({ id: 'loc-001' })
        .mockResolvedValueOnce(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000021' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'mov-021', ...payload }))
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'line-021', ...payload })),
      find: jest.fn().mockResolvedValue([]),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = new StockLedgerService(
      {} as DataSource,
      withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue({}) }) as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
    );

    const result = await service.recordAdjustment(
      {
        itemId: 'item-001',
        locationId: 'loc-001',
        quantityDelta: -1,
        reason: StockAdjustmentReason.LOSS,
        idempotencyKey: 'adj-seal-001',
      },
      actor,
    );

    expect(result.lines[0]).toEqual(expect.objectContaining({ unitCost: '18.50' }));
    expect(inventoryCostingServiceMock.applyReceiptCostingWithManager).not.toHaveBeenCalled();
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
    const stockBalanceService = withAvailability({
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    });
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
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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
    const stockBalanceService = withAvailability(
      {
        applyDeltaWithManager: jest.fn(),
      },
      { onHand: 2, reserved: 0, available: 2 },
    );
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
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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

    const stockBalanceService = withAvailability(
      {
        applyDeltaWithManager: jest.fn(),
      },
      { onHand: 1, reserved: 0, available: 1 },
    );

    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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
    ).rejects.toThrow(/disponible suficiente/);
  });

  it('rejects transfer that would consume stock reserved by another issue', async () => {
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
      find: jest.fn().mockResolvedValue([]),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const stockBalanceService = withAvailability(
      { applyDeltaWithManager: jest.fn() },
      { onHand: 10, reserved: 8, available: 2 },
    );

    const service = new StockLedgerService(
      {} as DataSource,
      stockBalanceService as never,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
    );

    await expect(
      service.transfer(
        {
          itemId: 'item-001',
          sourceLocationId: 'loc-source',
          destinationLocationId: 'loc-destination',
          quantity: 5,
          condition: StockBalanceCondition.NEW,
          handoffReference: 'ACT-RESERVED',
        },
        actor,
      ),
    ).rejects.toThrow(/comprometidos/);
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
      withAvailability({ applyDeltaWithManager: jest.fn() }) as unknown as never,
      serializedAssetService as never,
      { recordWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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
    const stockBalanceService = withAvailability({
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    });
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
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
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

  it('recordExecutionOrderMovement con INSTALLED_AT_CUSTOMER acredita CUSTOMER_SITE del suscriptor', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000199' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if ('movementNumber' in payload) {
          return { id: 'mov-200', ...payload };
        }

        return {
          id: `line-${payload.locationId}`,
          ...payload,
        };
      }),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    const stockBalanceService = withAvailability({
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    });
    const customerSiteLocationResolver = {
      resolveOrCreateWithManager: jest.fn().mockResolvedValue('loc-customer-site'),
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
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
      customerSiteLocationResolver as never,
    );

    const result = await service.recordExecutionOrderMovement(
      {
        executionOrderId: 'eo-001',
        itemId: 'item-001',
        technicianCustodyId: 'loc-technician',
        quantity: 1,
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        subscriberId: 'sub-0001-abcd-efgh',
      },
      actor,
    );

    expect(customerSiteLocationResolver.resolveOrCreateWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      'sub-0001-abcd-efgh',
    );
    expect(result.lines).toEqual([
      expect.objectContaining({
        locationId: 'loc-technician',
        quantity: '-1.00',
      }),
      expect.objectContaining({
        locationId: 'loc-customer-site',
        quantity: '1.00',
      }),
    ]);
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        itemId: 'item-001',
        locationId: 'loc-technician',
        delta: -1,
      }),
    );
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        itemId: 'item-001',
        locationId: 'loc-customer-site',
        delta: 1,
      }),
    );
  });

  it('recordExecutionOrderMovement con RETURNED_TO_WAREHOUSE acredita MAIN_WAREHOUSE', async () => {
    const manager = {
      findOne: jest.fn().mockImplementation(async (_entity, options: { where?: any }) => {
        if (options?.where?.type === StockLocationType.MAIN_WAREHOUSE) {
          return {
            id: 'loc-main-warehouse',
            tenantId: 'tenant-001',
            type: StockLocationType.MAIN_WAREHOUSE,
          };
        }

        return null;
      }),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000299' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if ('movementNumber' in payload) {
          return { id: 'mov-300', ...payload };
        }

        return {
          id: `line-${payload.locationId}-${payload.quantity}`,
          ...payload,
        };
      }),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    const stockBalanceService = withAvailability({
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    });
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
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
    );

    const result = await service.recordExecutionOrderMovement(
      {
        executionOrderId: 'eo-002',
        itemId: 'item-002',
        technicianCustodyId: 'loc-technician',
        quantity: 1,
        action: ExecutionOrderItemAction.RETURN,
        finalDisposition: InventoryDisposition.RETURNED_TO_WAREHOUSE,
      },
      actor,
    );

    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locationId: 'loc-technician', quantity: '-1.00' }),
        expect.objectContaining({ locationId: 'loc-main-warehouse', quantity: '1.00' }),
      ]),
    );
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        itemId: 'item-002',
        locationId: 'loc-technician',
        delta: -1,
      }),
    );
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        itemId: 'item-002',
        locationId: 'loc-main-warehouse',
        delta: 1,
      }),
    );
  });

  it('recordExecutionOrderMovement con RETURNED_TO_TECHNICIAN_STOCK deja neto 0 en custodia móvil', async () => {
    let savedLineCount = 0;
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000399' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if ('movementNumber' in payload) {
          return { id: 'mov-400', ...payload };
        }

        return {
          id: `line-${(savedLineCount += 1)}`,
          ...payload,
        };
      }),
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    };
    const stockBalanceService = withAvailability({
      applyDeltaWithManager: jest.fn().mockResolvedValue(undefined),
    });
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
      inventoryCostingServiceMock as never,
      assetLoanServiceMock as never,
      domainEventPublisherMock as never,
    );

    const result = await service.recordExecutionOrderMovement(
      {
        executionOrderId: 'eo-003',
        itemId: 'item-003',
        technicianCustodyId: 'loc-technician',
        quantity: 1,
        action: ExecutionOrderItemAction.RETURN,
        finalDisposition: InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK,
      },
      actor,
    );

    expect(result.lines).toHaveLength(2);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locationId: 'loc-technician', quantity: '-1.00' }),
        expect.objectContaining({ locationId: 'loc-technician', quantity: '1.00' }),
      ]),
    );
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        itemId: 'item-003',
        locationId: 'loc-technician',
        delta: -1,
      }),
    );
    expect(stockBalanceService.applyDeltaWithManager).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        itemId: 'item-003',
        locationId: 'loc-technician',
        delta: 1,
      }),
    );
  });

  describe('recordAdjustment', () => {
    const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<
      typeof runInTenantSchema
    >;

    it('records a positive adjustment with reason in originRefId', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'item-001',
            trackingMode: InventoryTrackingMode.CONSUMABLE,
          })
          .mockResolvedValueOnce({ id: 'loc-001' })
          .mockResolvedValueOnce(null),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000099' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest
          .fn()
          .mockImplementationOnce(async (_entity, payload) => ({ id: 'mov-adj', ...payload }))
          .mockImplementationOnce(async (_entity, payload) => ({ id: 'line-adj', ...payload })),
        find: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };

      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager } as never),
      );

      const stockBalanceService = withAvailability({
        applyDeltaWithManager: jest.fn().mockResolvedValue({}),
      });

      const service = new StockLedgerService(
        {} as DataSource,
        stockBalanceService as never,
        {
          resolveForMovementWithManager: jest.fn(),
          transitionAssetWithManager: jest.fn(),
        } as never,
        { recordWithManager: jest.fn() } as never,
        inventoryCostingServiceMock as never,
        assetLoanServiceMock as never,
        domainEventPublisherMock as never,
      );

      const result = await service.recordAdjustment(
        {
          itemId: 'item-001',
          locationId: 'loc-001',
          quantityDelta: 3,
          reason: StockAdjustmentReason.FOUND,
          idempotencyKey: 'adj-key-001234',
        },
        actor,
      );

      expect(result.movement.origin).toBe(StockMovementOrigin.ADJUSTMENT);
      expect(result.movement.originContext).toBe('inventory.adjustment');
      expect(result.movement.originRefId).toBe(StockAdjustmentReason.FOUND);
      expect(stockBalanceService.applyDeltaWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ delta: 3 }),
      );
    });

    it('records a negative adjustment delta', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'item-001',
            trackingMode: InventoryTrackingMode.CONSUMABLE,
          })
          .mockResolvedValueOnce({ id: 'loc-001' })
          .mockResolvedValueOnce(null),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000100' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest
          .fn()
          .mockImplementationOnce(async (_entity, payload) => ({ id: 'mov-adj-2', ...payload }))
          .mockImplementationOnce(async (_entity, payload) => ({ id: 'line-adj-2', ...payload })),
        find: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };

      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager } as never),
      );

      const stockBalanceService = withAvailability({
        applyDeltaWithManager: jest.fn().mockResolvedValue({}),
      });

      const service = new StockLedgerService(
        {} as DataSource,
        stockBalanceService as never,
        {
          resolveForMovementWithManager: jest.fn(),
          transitionAssetWithManager: jest.fn(),
        } as never,
        { recordWithManager: jest.fn() } as never,
        inventoryCostingServiceMock as never,
        assetLoanServiceMock as never,
        domainEventPublisherMock as never,
      );

      await service.recordAdjustment(
        {
          itemId: 'item-001',
          locationId: 'loc-001',
          quantityDelta: -2,
          reason: StockAdjustmentReason.LOSS,
          idempotencyKey: 'adj-key-001235',
        },
        actor,
      );

      expect(stockBalanceService.applyDeltaWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ delta: -2 }),
      );
    });

    it('rejects adjustments on serialized items', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'item-ser',
          trackingMode: InventoryTrackingMode.SERIALIZED,
        }),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };

      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager } as never),
      );

      const service = new StockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn() }) as unknown as never,
        {
          resolveForMovementWithManager: jest.fn(),
          transitionAssetWithManager: jest.fn(),
        } as never,
        { recordWithManager: jest.fn() } as never,
        inventoryCostingServiceMock as never,
        assetLoanServiceMock as never,
        domainEventPublisherMock as never,
      );

      await expect(
        service.recordAdjustment(
          {
            itemId: 'item-ser',
            locationId: 'loc-001',
            quantityDelta: 1,
            reason: StockAdjustmentReason.CORRECTION,
            idempotencyKey: 'adj-key-001236',
          },
          actor,
        ),
      ).rejects.toThrow('serializados');
    });

    it('replays the same adjustment when idempotency key matches', async () => {
      const existingMovement = {
        id: 'mov-existing',
        tenantId: 'tenant-001',
        idempotencyKey: 'adj-key-replay',
        origin: StockMovementOrigin.ADJUSTMENT,
      };
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'item-001',
            trackingMode: InventoryTrackingMode.CONSUMABLE,
          })
          .mockResolvedValueOnce({ id: 'loc-001' })
          .mockResolvedValueOnce(existingMovement),
        find: jest.fn().mockResolvedValue([{ id: 'line-existing', movementId: 'mov-existing' }]),
        save: jest.fn(),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };

      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager } as never),
      );

      const service = new StockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn() }) as unknown as never,
        {
          resolveForMovementWithManager: jest.fn(),
          transitionAssetWithManager: jest.fn(),
        } as never,
        { recordWithManager: jest.fn() } as never,
        inventoryCostingServiceMock as never,
        assetLoanServiceMock as never,
        domainEventPublisherMock as never,
      );

      const result = await service.recordAdjustment(
        {
          itemId: 'item-001',
          locationId: 'loc-001',
          quantityDelta: 1,
          reason: StockAdjustmentReason.CYCLE_COUNT,
          idempotencyKey: 'adj-key-replay',
        },
        actor,
      );

      expect(result.movement).toBe(existingMovement);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('comodato con ciclo de vida', () => {
    function mockTransitionedAsset(id = 'asset-loan-001') {
      return {
        id,
        currentStatus: SerializedAssetStatus.INSTALLED_COMODATO,
        currentLocationId: 'loc-customer-site',
        currentResponsibleRefId: null,
      };
    }

    beforeEach(() => {
      assetLoanServiceMock.openLoanWithManager.mockClear();
      assetLoanServiceMock.closeOpenLoanWithManager.mockClear();
    });

    it('abre comodato al instalar activo serializado en cliente desde OT', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000200' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => {
          if ('movementNumber' in payload) {
            return { id: 'mov-loan-open', ...payload };
          }
          return { id: `line-${payload.locationId}`, ...payload };
        }),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };
      const serializedAssetService = {
        resolveForMovementWithManager: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'asset-loan-001',
            currentStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
          })
          .mockResolvedValueOnce({ id: 'asset-loan-001' }),
        transitionAssetWithManager: jest.fn().mockResolvedValue(mockTransitionedAsset()),
      };
      const customerSiteLocationResolver = {
        resolveOrCreateWithManager: jest.fn().mockResolvedValue('loc-customer-site'),
      };

      (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
        work({ manager }),
      );

      const service = createStockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue(undefined) }),
        serializedAssetService,
        { recordWithManager: jest.fn() },
        customerSiteLocationResolver,
      );

      await service.recordExecutionOrderMovement(
        {
          executionOrderId: 'eo-loan-001',
          itemId: 'item-001',
          technicianCustodyId: 'loc-technician',
          quantity: 1,
          serialNumber: 'SN-LOAN-001',
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          subscriberId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          contractRefId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
        actor,
      );

      expect(assetLoanServiceMock.openLoanWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          tenantId: 'tenant-001',
          serializedAssetId: 'asset-loan-001',
          subscriberRefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          contractRefId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          executionOrderRefId: 'eo-loan-001',
          stockMovementId: 'mov-loan-open',
        }),
      );
    });

    it('reutiliza comodato existente cuando el movimiento es idempotente', async () => {
      const existingMovement = {
        id: 'mov-existing-loan',
        tenantId: 'tenant-001',
        idempotencyKey: 'eo-idempotent',
      };
      const manager = {
        findOne: jest.fn().mockResolvedValue(existingMovement),
        find: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };
      const serializedAssetService = {
        resolveForMovementWithManager: jest.fn().mockResolvedValue({ id: 'asset-loan-001' }),
        transitionAssetWithManager: jest.fn(),
      };
      const customerSiteLocationResolver = {
        resolveOrCreateWithManager: jest.fn().mockResolvedValue('loc-customer-site'),
      };

      (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
        work({ manager }),
      );

      const service = createStockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn() }),
        serializedAssetService,
        { recordWithManager: jest.fn() },
        customerSiteLocationResolver,
      );

      await service.recordExecutionOrderMovement(
        {
          executionOrderId: 'eo-loan-001',
          itemId: 'item-001',
          technicianCustodyId: 'loc-technician',
          quantity: 1,
          serialNumber: 'SN-LOAN-001',
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          subscriberId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          idempotencyKey: 'eo-idempotent',
        },
        actor,
      );

      expect(assetLoanServiceMock.openLoanWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ stockMovementId: 'mov-existing-loan' }),
      );
    });

    it('cierra comodato abierto al retornar activo serializado', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000201' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => {
          if ('movementNumber' in payload) {
            return { id: 'mov-return', ...payload };
          }
          return { id: `line-${payload.locationId}`, ...payload };
        }),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };
      const serializedAssetService = {
        resolveForMovementWithManager: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'asset-loan-001',
            currentStatus: SerializedAssetStatus.IN_TESTING,
          })
          .mockResolvedValueOnce(mockTransitionedAsset()),
        transitionAssetWithManager: jest.fn().mockResolvedValue(mockTransitionedAsset()),
      };

      (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
        work({ manager }),
      );

      const service = createStockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue(undefined) }),
        serializedAssetService,
        { recordWithManager: jest.fn() },
      );

      await service.recordReturn(
        {
          itemId: 'item-001',
          sourceLocationId: 'loc-customer',
          destinationLocationId: 'loc-warehouse',
          quantity: 1,
          serializedAssetId: 'asset-loan-001',
          targetStatus: SerializedAssetStatus.IN_TESTING,
        },
        actor,
      );

      expect(assetLoanServiceMock.closeOpenLoanWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          tenantId: 'tenant-001',
          serializedAssetId: 'asset-loan-001',
          removedAt: expect.any(Date),
        }),
      );
    });

    it('cierra comodato abierto al dar de baja activo serializado', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000202' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => {
          if ('movementNumber' in payload) {
            return { id: 'mov-writeoff', ...payload };
          }
          return { id: 'line-writeoff', ...payload };
        }),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };
      const serializedAssetService = {
        resolveForMovementWithManager: jest.fn().mockResolvedValue({
          id: 'asset-loan-001',
          currentStatus: SerializedAssetStatus.INSTALLED_COMODATO,
        }),
        transitionAssetWithManager: jest.fn().mockResolvedValue({
          id: 'asset-loan-001',
          currentStatus: SerializedAssetStatus.WRITTEN_OFF,
          currentLocationId: null,
          currentResponsibleRefId: null,
        }),
      };

      (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
        work({ manager }),
      );

      const service = createStockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue(undefined) }),
        serializedAssetService,
        { recordWithManager: jest.fn() },
      );

      await service.recordWriteOff(
        {
          itemId: 'item-001',
          locationId: 'loc-customer',
          serializedAssetId: 'asset-loan-001',
          quantity: 1,
          reason: WriteOffReason.DAMAGED,
        },
        actor,
      );

      expect(assetLoanServiceMock.closeOpenLoanWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          tenantId: 'tenant-001',
          serializedAssetId: 'asset-loan-001',
        }),
      );
    });

    it('baja por pérdida o robo transiciona activo a LOST (B1 — resolveWriteOffAssetStatus)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000204' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => {
          if ('movementNumber' in payload) {
            return { id: 'mov-writeoff-lost', ...payload };
          }
          return { id: 'line-writeoff-lost', ...payload };
        }),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };
      const transitionAssetWithManager = jest.fn().mockResolvedValue({
        id: 'asset-loan-001',
        currentStatus: SerializedAssetStatus.LOST,
        currentLocationId: null,
        currentResponsibleRefId: null,
      });
      const serializedAssetService = {
        resolveForMovementWithManager: jest.fn().mockResolvedValue({
          id: 'asset-loan-001',
          currentStatus: SerializedAssetStatus.INSTALLED_COMODATO,
        }),
        transitionAssetWithManager,
      };

      (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
        work({ manager }),
      );

      const service = createStockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue(undefined) }),
        serializedAssetService,
        { recordWithManager: jest.fn() },
      );

      await service.recordWriteOff(
        {
          itemId: 'item-001',
          locationId: 'loc-customer',
          serializedAssetId: 'asset-loan-001',
          quantity: 1,
          reason: WriteOffReason.LOST,
        },
        actor,
      );

      expect(transitionAssetWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ toStatus: SerializedAssetStatus.LOST }),
      );
    });

    it('baja por daño transiciona activo a WRITTEN_OFF (B1 — resolveWriteOffAssetStatus)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000205' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => {
          if ('movementNumber' in payload) {
            return { id: 'mov-writeoff-damaged', ...payload };
          }
          return { id: 'line-writeoff-damaged', ...payload };
        }),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };
      const transitionAssetWithManager = jest.fn().mockResolvedValue({
        id: 'asset-loan-001',
        currentStatus: SerializedAssetStatus.WRITTEN_OFF,
        currentLocationId: null,
        currentResponsibleRefId: null,
      });
      const serializedAssetService = {
        resolveForMovementWithManager: jest.fn().mockResolvedValue({
          id: 'asset-loan-001',
          currentStatus: SerializedAssetStatus.IN_TESTING,
        }),
        transitionAssetWithManager,
      };

      (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
        work({ manager }),
      );

      const service = createStockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue(undefined) }),
        serializedAssetService,
        { recordWithManager: jest.fn() },
      );

      await service.recordWriteOff(
        {
          itemId: 'item-001',
          locationId: 'loc-main',
          serializedAssetId: 'asset-loan-001',
          quantity: 1,
          reason: WriteOffReason.DAMAGED,
        },
        actor,
      );

      expect(transitionAssetWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ toStatus: SerializedAssetStatus.WRITTEN_OFF }),
      );
    });

    it('retorno sin comodato abierto no falla', async () => {
      assetLoanServiceMock.closeOpenLoanWithManager.mockResolvedValue(null);
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ movementNumber: 'MOV-000203' }),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => {
          if ('movementNumber' in payload) {
            return { id: 'mov-return-no-loan', ...payload };
          }
          return { id: `line-${payload.locationId}`, ...payload };
        }),
        transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      };
      const serializedAssetService = {
        resolveForMovementWithManager: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'asset-loan-001',
            currentStatus: SerializedAssetStatus.IN_TESTING,
          })
          .mockResolvedValueOnce(mockTransitionedAsset()),
        transitionAssetWithManager: jest.fn().mockResolvedValue(mockTransitionedAsset()),
      };

      (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
        work({ manager }),
      );

      const service = createStockLedgerService(
        {} as DataSource,
        withAvailability({ applyDeltaWithManager: jest.fn().mockResolvedValue(undefined) }),
        serializedAssetService,
        { recordWithManager: jest.fn() },
      );

      await expect(
        service.recordReturn(
          {
            itemId: 'item-001',
            sourceLocationId: 'loc-customer',
            destinationLocationId: 'loc-warehouse',
            quantity: 1,
            serializedAssetId: 'asset-loan-001',
            targetStatus: SerializedAssetStatus.IN_TESTING,
          },
          actor,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          movement: expect.objectContaining({ id: 'mov-return-no-loan' }),
        }),
      );
    });
  });
});
