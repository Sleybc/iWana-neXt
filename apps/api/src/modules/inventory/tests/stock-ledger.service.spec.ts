import { DataSource } from 'typeorm';
import { StockMovementOrigin, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockLedgerService } from '../services/stock-ledger.service';

jest.mock('@iwana/db', () => ({
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
});
