import { DataSource } from 'typeorm';
import { AssetLoanService } from '../services/asset-loan.service';

jest.mock('@iwana/db', () => ({
  AssetLoanAssignment: class AssetLoanAssignment {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import { runInTenantSchema } from '@iwana/db';

const SUBSCRIBER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONTRACT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSET_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MOVEMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('AssetLoanService', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  let service: AssetLoanService;
  let loansStore: Map<string, Record<string, unknown>>;

  beforeEach(() => {
    jest.clearAllMocks();
    loansStore = new Map();
    service = new AssetLoanService({} as DataSource);
  });

  function managerMock() {
    return {
      findOne: jest.fn(async (_entity, options: { where: Record<string, unknown> }) => {
        if (options.where.stockMovementId) {
          return (
            [...loansStore.values()].find(
              (loan) => loan.stockMovementId === options.where.stockMovementId,
            ) ?? null
          );
        }

        if (options.where.serializedAssetId) {
          const openLoan = [...loansStore.values()].find(
            (loan) =>
              loan.tenantId === options.where.tenantId &&
              loan.serializedAssetId === options.where.serializedAssetId &&
              loan.removedAt === null,
          );
          return openLoan ?? null;
        }

        return null;
      }),
      findAndCount: jest.fn(async (_entity, options: { where: Record<string, unknown> }) => {
        const rows = [...loansStore.values()].filter(
          (loan) =>
            loan.tenantId === options.where.tenantId &&
            loan.serializedAssetId === options.where.serializedAssetId,
        );
        return [rows, rows.length];
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn(async (_entity, payload: Record<string, unknown>) => {
        const id = (payload.id as string | undefined) ?? `loan-${loansStore.size + 1}`;
        const saved = { ...payload, id };
        loansStore.set(id, saved);
        return saved;
      }),
      createQueryBuilder: jest.fn(),
    };
  }

  it('openLoanWithManager crea comodato nuevo', async () => {
    const manager = managerMock();
    const installedAt = new Date('2026-07-21T10:00:00.000Z');

    const loan = await service.openLoanWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      subscriberRefId: SUBSCRIBER_ID,
      contractRefId: CONTRACT_ID,
      installedAt,
      executionOrderRefId: 'eo-001',
      stockMovementId: MOVEMENT_ID,
    });

    expect(loan.subscriberRefId).toBe(SUBSCRIBER_ID);
    expect(loan.removedAt).toBeNull();
    expect(loansStore.size).toBe(1);
  });

  it('openLoanWithManager es idempotente por stockMovementId', async () => {
    const manager = managerMock();
    const input = {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      subscriberRefId: SUBSCRIBER_ID,
      contractRefId: null,
      installedAt: new Date('2026-07-21T10:00:00.000Z'),
      executionOrderRefId: 'eo-001',
      stockMovementId: MOVEMENT_ID,
    };

    const first = await service.openLoanWithManager(manager as never, input);
    const second = await service.openLoanWithManager(manager as never, input);

    expect(second.id).toBe(first.id);
    expect(loansStore.size).toBe(1);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('closeOpenLoanWithManager cierra comodato abierto', async () => {
    const manager = managerMock();
    const removedAt = new Date('2026-07-21T12:00:00.000Z');

    await service.openLoanWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      subscriberRefId: SUBSCRIBER_ID,
      installedAt: new Date('2026-07-21T10:00:00.000Z'),
      stockMovementId: MOVEMENT_ID,
    });

    const closed = await service.closeOpenLoanWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      removedAt,
    });

    expect(closed?.removedAt).toEqual(removedAt);
    expect(service.toRecord(closed!).status).toBe('cerrado');
  });

  it('closeOpenLoanWithManager no falla si no hay comodato abierto', async () => {
    const manager = managerMock();

    const result = await service.closeOpenLoanWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      removedAt: new Date(),
    });

    expect(result).toBeNull();
  });

  it('listForAsset ordena por installed_at descendente', async () => {
    const manager = managerMock();

    await service.openLoanWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      subscriberRefId: SUBSCRIBER_ID,
      installedAt: new Date('2026-01-01T10:00:00.000Z'),
      stockMovementId: 'mov-old',
    });
    await service.closeOpenLoanWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      removedAt: new Date('2026-02-01T10:00:00.000Z'),
    });
    await service.openLoanWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      subscriberRefId: SUBSCRIBER_ID,
      installedAt: new Date('2026-07-01T10:00:00.000Z'),
      stockMovementId: 'mov-new',
    });

    const sortedManager = {
      ...manager,
      findAndCount: jest.fn(async () => {
        const rows = [...loansStore.values()].sort(
          (a, b) =>
            new Date(b.installedAt as string).getTime() -
            new Date(a.installedAt as string).getTime(),
        );
        return [rows, rows.length];
      }),
    };

    const result = await service.listForAsset(sortedManager as never, 'tenant-001', ASSET_ID);

    expect(result.total).toBe(2);
    expect(result.data[0]?.status).toBe('abierto');
    expect(result.data[1]?.status).toBe('cerrado');
  });

  it('list aplica filtros de estado y paginación', async () => {
    const loans = [
      {
        id: 'loan-1',
        tenantId: 'tenant-001',
        serializedAssetId: ASSET_ID,
        subscriberRefId: SUBSCRIBER_ID,
        contractRefId: CONTRACT_ID,
        installedAt: new Date('2026-07-21T10:00:00.000Z'),
        removedAt: null,
        executionOrderRefId: 'eo-001',
        stockMovementId: MOVEMENT_ID,
      },
    ];
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getMany: jest.fn().mockResolvedValue(loans),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
    );

    const result = await service.list({
      status: 'abierto',
      subscriberRefId: SUBSCRIBER_ID,
      contractRefId: CONTRACT_ID,
      serializedAssetId: ASSET_ID,
      page: 1,
      limit: 20,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('loan.removed_at IS NULL');
    expect(result.data[0]).toMatchObject({
      serializedAssetId: ASSET_ID,
      status: 'abierto',
    });
    expect(result.total).toBe(1);
  });
});
