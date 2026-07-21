import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole, WriteOffReason, WriteOffStatus } from '@iwana/shared';
import {
  InventoryItem,
  InventoryWriteOff,
  SerializedAsset,
  StockLocation,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockLedgerService } from '../services/stock-ledger.service';
import { WriteOffService } from '../services/write-off.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  InventoryWriteOff: class InventoryWriteOff {},
  SerializedAsset: class SerializedAsset {},
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

const REQUESTER_ID = '11111111-1111-4111-8111-111111111111';
const APPROVER_ID = '22222222-2222-4222-8222-222222222222';
const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ASSET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WRITE_OFF_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const requester: JwtPayload = {
  sub: REQUESTER_ID,
  email: 'requester@example.test',
  role: UserRole.ADMIN,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-requester',
  type: 'tenant',
};

const approver: JwtPayload = {
  sub: APPROVER_ID,
  email: 'approver@example.test',
  role: UserRole.NOC,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-approver',
  type: 'tenant',
};

describe('WriteOffService', () => {
  let stockLedgerService: jest.Mocked<Pick<StockLedgerService, 'recordWriteOffWithManager'>>;

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
    stockLedgerService = {
      recordWriteOffWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-001', movementNumber: 'MOV-000300' },
        lines: [{ id: 'line-001' }],
      }),
    };
  });

  function createService(dataSource: DataSource = {} as DataSource): WriteOffService {
    return new WriteOffService(dataSource, stockLedgerService as unknown as StockLedgerService);
  }

  function buildPendingWriteOff(overrides: Partial<InventoryWriteOff> = {}): InventoryWriteOff {
    return {
      id: WRITE_OFF_ID,
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      itemId: ITEM_ID,
      locationId: LOCATION_ID,
      quantity: '1.0000',
      idempotencyKey: null,
      reason: WriteOffReason.LOST,
      status: WriteOffStatus.PENDING_APPROVAL,
      requestedByUserId: REQUESTER_ID,
      approvedByUserId: null,
      approvedAt: null,
      stockMovementId: null,
      notes: 'Activo extraviado',
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionNotes: null,
      createdAt: new Date('2026-07-21T10:00:00.000Z'),
      updatedAt: new Date('2026-07-21T10:00:00.000Z'),
      ...overrides,
    } as InventoryWriteOff;
  }

  function buildManager(options?: {
    writeOff?: InventoryWriteOff | null;
    location?: Partial<StockLocation> | null;
  }) {
    const writeOff = options?.writeOff ?? buildPendingWriteOff();
    const location =
      options?.location === null
        ? null
        : {
            id: LOCATION_ID,
            tenantId: 'tenant-001',
            name: 'Bodega central',
            code: 'BC-01',
            ...(options?.location ?? {}),
          };

    const save = jest.fn().mockImplementation(async (_entity, payload) => ({
      ...writeOff,
      ...payload,
      id: payload.id ?? writeOff.id,
    }));

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (entity, query) => {
        if (entity === InventoryWriteOff) {
          if (query.where?.idempotencyKey) {
            return null;
          }
          if (query.where?.id === writeOff.id) {
            return writeOff;
          }
        }

        if (entity === StockLocation && query.where?.id === location?.id) {
          return location;
        }

        if (entity === InventoryItem) {
          return { id: ITEM_ID, sku: 'ONT-001', name: 'ONT GPON', tenantId: 'tenant-001' };
        }

        if (entity === SerializedAsset) {
          return {
            id: ASSET_ID,
            serialNumber: 'SN-001',
            inventoryItemId: ITEM_ID,
            tenantId: 'tenant-001',
          };
        }

        if (entity === StockMovement) {
          return {
            id: 'mov-001',
            movementNumber: 'MOV-000300',
            tenantId: 'tenant-001',
          };
        }

        return null;
      }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity, payload) => payload),
      save,
      createQueryBuilder: jest.fn().mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(writeOff),
      }),
    };

    return { manager, save };
  }

  it('createRequest persiste PENDING_APPROVAL sin invocar ledger', async () => {
    const { manager, save } = buildManager();
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();

    const result = await service.createRequest(
      {
        itemId: ITEM_ID,
        serializedAssetId: ASSET_ID,
        locationId: LOCATION_ID,
        quantity: 1,
        reason: WriteOffReason.LOST,
        notes: 'Activo extraviado',
      },
      requester,
    );

    expect(stockLedgerService.recordWriteOffWithManager).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(
      InventoryWriteOff,
      expect.objectContaining({
        status: WriteOffStatus.PENDING_APPROVAL,
        requestedByUserId: REQUESTER_ID,
        locationId: LOCATION_ID,
        quantity: '1.0000',
      }),
    );
    expect(result.status).toBe(WriteOffStatus.PENDING_APPROVAL);
    expect(result.location?.name).toBe('Bodega central');
  });

  it('approve aplica ledger y marca COMPLETED', async () => {
    const { manager, save } = buildManager();
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();
    const result = await service.approve(WRITE_OFF_ID, approver);

    expect(stockLedgerService.recordWriteOffWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({
        itemId: ITEM_ID,
        serializedAssetId: ASSET_ID,
        locationId: LOCATION_ID,
        reason: WriteOffReason.LOST,
      }),
      approver,
    );
    expect(save).toHaveBeenCalledWith(
      InventoryWriteOff,
      expect.objectContaining({
        status: WriteOffStatus.COMPLETED,
        approvedByUserId: APPROVER_ID,
        stockMovementId: 'mov-001',
      }),
    );
    expect(result.writeOff.status).toBe(WriteOffStatus.COMPLETED);
    expect(result.movementResult.movement.id).toBe('mov-001');
  });

  it('reject marca REJECTED sin invocar ledger', async () => {
    const { manager, save } = buildManager();
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();
    const result = await service.reject(WRITE_OFF_ID, { notes: 'Stock recuperado' }, approver);

    expect(stockLedgerService.recordWriteOffWithManager).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(
      InventoryWriteOff,
      expect.objectContaining({
        status: WriteOffStatus.REJECTED,
        rejectedByUserId: APPROVER_ID,
        rejectionNotes: 'Stock recuperado',
      }),
    );
    expect(result.status).toBe(WriteOffStatus.REJECTED);
  });

  it('approve rechaza cuando solicitante y aprobador coinciden', async () => {
    const { manager } = buildManager();
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();

    await expect(service.approve(WRITE_OFF_ID, requester)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(stockLedgerService.recordWriteOffWithManager).not.toHaveBeenCalled();
  });

  it('approve idempotente devuelve movimiento existente si ya está COMPLETED', async () => {
    const completed = buildPendingWriteOff({
      status: WriteOffStatus.COMPLETED,
      stockMovementId: 'mov-001',
      approvedByUserId: APPROVER_ID,
      approvedAt: new Date('2026-07-21T11:00:00.000Z'),
    });
    const { manager } = buildManager({ writeOff: completed });
    manager.find = jest.fn().mockImplementation(async (entity) => {
      if (entity === StockMovementLine) {
        return [{ id: 'line-001', movementId: 'mov-001' }];
      }
      return [];
    });

    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();
    const result = await service.approve(WRITE_OFF_ID, approver);

    expect(stockLedgerService.recordWriteOffWithManager).not.toHaveBeenCalled();
    expect(result.writeOff.status).toBe(WriteOffStatus.COMPLETED);
    expect(result.movementResult.movement.id).toBe('mov-001');
  });

  it('approve con LOST delega cierre de comodato al ledger (regresión B1)', async () => {
    const { manager } = buildManager({
      writeOff: buildPendingWriteOff({ reason: WriteOffReason.LOST }),
    });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();
    await service.approve(WRITE_OFF_ID, approver);

    expect(stockLedgerService.recordWriteOffWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({ reason: WriteOffReason.LOST }),
      approver,
    );
  });

  it('createRequest exige bodega origen', async () => {
    const service = createService();

    await expect(
      service.createRequest(
        {
          itemId: ITEM_ID,
          quantity: 1,
          reason: WriteOffReason.DAMAGED,
        },
        requester,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getById lanza NotFoundException si no existe', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();

    await expect(service.getById(WRITE_OFF_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('list filtra por tenant en query builder', async () => {
    const writeOff = buildPendingWriteOff();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getMany: jest.fn().mockResolvedValue([writeOff]),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn().mockImplementation(async (entity) => {
        if (entity === StockLocation) {
          return { id: LOCATION_ID, name: 'Bodega central', code: 'BC-01', tenantId: 'tenant-001' };
        }
        if (entity === InventoryItem) {
          return { id: ITEM_ID, sku: 'ONT-001', name: 'ONT GPON', tenantId: 'tenant-001' };
        }
        if (entity === SerializedAsset) {
          return {
            id: ASSET_ID,
            serialNumber: 'SN-001',
            inventoryItemId: ITEM_ID,
            tenantId: 'tenant-001',
          };
        }
        return null;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = createService();
    const result = await service.list({ page: 1, limit: 20 });

    expect(qb.where).toHaveBeenCalledWith('writeOff.tenant_id = :tenantId', {
      tenantId: 'tenant-001',
    });
    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe(WRITE_OFF_ID);
  });
});
