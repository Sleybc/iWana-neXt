import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StockIssueStatus, StockIssueType, StockBalanceCondition, UserRole } from '@iwana/shared';
import { StockIssueService } from '../services/stock-issue.service';
import {
  runInTenantSchema,
  TenantContext,
  StockBalance,
  StockIssue,
  StockIssueLine,
  StockLocation,
} from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockBalanceService } from '../services/stock-balance.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  SerializedAsset: class SerializedAsset {},
  StockBalance: class StockBalance {},
  StockIssue: class StockIssue {},
  StockIssueLine: class StockIssueLine {},
  StockIssueLineSerial: class StockIssueLineSerial {},
  StockLocation: class StockLocation {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

/** Query builder falso del UPDATE set-based de la espejo issue_status (MOD12 S2). */
function buildMirrorUpdateQb() {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
}

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

function createStockBalanceServiceMock(
  overrides?: Partial<{
    getAvailabilityWithManager: jest.Mock;
    applyDeltaWithManager: jest.Mock;
  }>,
): StockBalanceService {
  return {
    getAvailabilityWithManager: jest.fn().mockResolvedValue({
      onHand: 100,
      reserved: 0,
      available: 100,
    }),
    applyDeltaWithManager: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as StockBalanceService;
}

function createService(
  ledger: unknown = {},
  balanceService: StockBalanceService = createStockBalanceServiceMock(),
) {
  const domainEventPublisher = {
    captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
    publishAfterCommittedMovement: jest.fn(),
  };
  return new StockIssueService(
    {} as DataSource,
    ledger as never,
    balanceService,
    domainEventPublisher as never,
  );
}

describe('StockIssueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('creates issue TECHNICIAN_CUSTODY with one line', async () => {
    const save = jest
      .fn()
      .mockImplementationOnce(async (_entity, payload) => ({ id: 'issue-001', ...payload }))
      .mockImplementationOnce(async (_entity, payload) => payload);

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save,
      // MOD12 S1 · B3: la carga batch de ítems usa `find`; sin maestro no hay serial que validar.
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockLocation) {
          const isDestination = options.where.id === '22222222-2222-4222-8222-222222222222';
          return {
            id: options.where.id,
            tenantId: options.where.tenantId,
            type: isDestination ? 'MOBILE_TECHNICIAN' : 'MAIN_WAREHOUSE',
          };
        }
        return null;
      }),
      create: jest.fn((_entity, payload) => payload),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService();
    const created = await service.create(
      {
        type: StockIssueType.TECHNICIAN_CUSTODY,
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
        destinationLocationId: '22222222-2222-4222-8222-222222222222',
        lines: [
          {
            itemId: '33333333-3333-4333-8333-333333333333',
            requestedQty: 2,
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(created.id).toBe('issue-001');
    expect(save).toHaveBeenCalledWith(
      StockIssue,
      expect.objectContaining({
        type: StockIssueType.TECHNICIAN_CUSTODY,
        status: StockIssueStatus.REQUESTED,
      }),
    );
    expect(save).toHaveBeenCalledWith(
      StockIssueLine,
      expect.arrayContaining([
        expect.objectContaining({
          issueId: 'issue-001',
          requestedQty: '2.00',
        }),
      ]),
    );
  });

  it('rejects issue without lines', async () => {
    const service = createService();
    await expect(
      service.create(
        {
          type: StockIssueType.TECHNICIAN_CUSTODY,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '22222222-2222-4222-8222-222222222222',
          lines: [],
        },
        actor,
      ),
    ).rejects.toThrow();
  });

  it('rejects destination incompatible (TECHNICIAN_CUSTODY without destination)', async () => {
    const service = createService();

    await expect(
      service.create(
        {
          type: StockIssueType.TECHNICIAN_CUSTODY,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow();
  });

  it('rejects OFFICE_REPLENISHMENT without destination', async () => {
    const service = createService();

    await expect(
      service.create(
        {
          type: StockIssueType.OFFICE_REPLENISHMENT,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow();
  });

  it('rejects SALE_DISPATCH with destinationLocationId', async () => {
    const service = createService();

    await expect(
      service.create(
        {
          type: StockIssueType.SALE_DISPATCH,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '22222222-2222-4222-8222-222222222222',
          commercialRefId: 'COM-001',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow();
  });

  it('rejects WAREHOUSE_TO_WAREHOUSE when source and destination are the same location', async () => {
    const service = createService();

    await expect(
      service.create(
        {
          type: StockIssueType.WAREHOUSE_TO_WAREHOUSE,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '11111111-1111-4111-8111-111111111111',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('La ubicación destino debe ser distinta del origen.');
  });

  it('rejects WAREHOUSE_TO_WAREHOUSE when destination is another MAIN_WAREHOUSE location', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save: jest.fn(),
      create: jest.fn((_entity, payload) => payload),
      // MOD12 S1 · B3: la carga batch de ítems usa `find`; sin maestro no hay serial que validar.
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockLocation) {
          const isDestination = options.where.id === '22222222-2222-4222-8222-222222222222';
          return {
            id: options.where.id,
            tenantId: options.where.tenantId,
            type: isDestination ? 'MAIN_WAREHOUSE' : 'MAIN_WAREHOUSE',
          };
        }
        return null;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService();

    await expect(
      service.create(
        {
          type: StockIssueType.WAREHOUSE_TO_WAREHOUSE,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '22222222-2222-4222-8222-222222222222',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects create with wrong destination type for OFFICE_REPLENISHMENT', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save: jest.fn(),
      create: jest.fn((_entity, payload) => payload),
      // MOD12 S1 · B3: la carga batch de ítems usa `find`; sin maestro no hay serial que validar.
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockLocation) {
          const isDestination = options.where.id === '22222222-2222-4222-8222-222222222222';
          return {
            id: options.where.id,
            tenantId: options.where.tenantId,
            type: isDestination ? 'MOBILE_TECHNICIAN' : 'MAIN_WAREHOUSE',
          };
        }
        return null;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService();
    await expect(
      service.create(
        {
          type: StockIssueType.OFFICE_REPLENISHMENT,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '22222222-2222-4222-8222-222222222222',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects create when destination is CUSTOMER_SITE', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save: jest.fn(),
      create: jest.fn((_entity, payload) => payload),
      // MOD12 S1 · B3: la carga batch de ítems usa `find`; sin maestro no hay serial que validar.
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockLocation) {
          const isDestination = options.where.id === '22222222-2222-4222-8222-222222222222';
          return {
            id: options.where.id,
            tenantId: options.where.tenantId,
            type: isDestination ? 'CUSTOMER_SITE' : 'MAIN_WAREHOUSE',
          };
        }
        return null;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService();
    await expect(
      service.create(
        {
          type: StockIssueType.WAREHOUSE_TO_WAREHOUSE,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '22222222-2222-4222-8222-222222222222',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('No se permiten salidas manuales hacia sitio de cliente.');
  });

  it('returns the existing movement without re-dispatching when the issue already has stockMovementId (idempotent)', async () => {
    const existingIssue = {
      id: 'issue-900',
      tenantId: 'tenant-001',
      type: StockIssueType.TECHNICIAN_CUSTODY,
      status: StockIssueStatus.DISPATCHED,
      sourceLocationId: '11111111-1111-4111-8111-111111111111',
      destinationLocationId: '22222222-2222-4222-8222-222222222222',
      stockMovementId: 'movement-001',
    };
    const existingLines = [
      {
        issueId: 'issue-900',
        itemId: '33333333-3333-4333-8333-333333333333',
        requestedQty: '2.00',
      },
    ];

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save: jest.fn(),
      create: jest.fn((_entity, payload) => payload),
      findOne: jest.fn().mockImplementation(async (entity) => {
        if (entity === StockIssue) {
          return existingIssue;
        }
        return null;
      }),
      find: jest
        .fn()
        .mockImplementation(async (entity) => (entity === StockIssueLine ? existingLines : [])),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const ledger = {
      recordStockIssueSaleWithManager: jest.fn(),
      recordStockIssueInternalConsumptionWithManager: jest.fn(),
      recordStockIssueTransferWithManager: jest.fn(),
    };

    const service = createService(ledger);
    const result = await service.dispatch(
      'issue-900',
      { handoffMethod: 'acta', handoffAttachments: [] },
      actor,
    );

    expect(result.stockMovementId).toBe('movement-001');
    // MOD12 S2: las líneas del detalle llevan el grupo de seriales (vacío si no aplica).
    expect(result.lines).toEqual(existingLines.map((line) => ({ ...line, serializedAssets: [] })));
    expect(manager.save).not.toHaveBeenCalled();
    expect(ledger.recordStockIssueTransferWithManager).not.toHaveBeenCalled();
    expect(ledger.recordStockIssueSaleWithManager).not.toHaveBeenCalled();
    expect(ledger.recordStockIssueInternalConsumptionWithManager).not.toHaveBeenCalled();
  });

  it('rejects create when source is not MAIN_WAREHOUSE', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save: jest.fn(),
      create: jest.fn((_entity, payload) => payload),
      // MOD12 S1 · B3: la carga batch de ítems usa `find`; sin maestro no hay serial que validar.
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockLocation) {
          return { id: options.where.id, tenantId: options.where.tenantId, type: 'OFFICE_STOCK' };
        }
        return null;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService();
    await expect(
      service.create(
        {
          type: StockIssueType.TECHNICIAN_CUSTODY,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '22222222-2222-4222-8222-222222222222',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 1,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists issues filtered by status and type', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService();
    const result = await service.list({
      status: StockIssueStatus.DRAFT,
      type: StockIssueType.CREW_CUSTODY,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('issue.type = :type', {
      type: StockIssueType.CREW_CUSTODY,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('issue.status = :status', {
      status: StockIssueStatus.DRAFT,
    });
    expect(result.meta).toBeDefined();
    expect(result.meta.capabilities.randomAccess).toBe(false);
    expect(result.data).toHaveLength(0);
  });

  it('cancels a non-dispatched issue', async () => {
    const existing = {
      id: 'issue-001',
      tenantId: 'tenant-001',
      status: StockIssueStatus.DRAFT,
      sourceLocationId: 'loc-source',
      closedAt: null,
    };
    const issueLines = [
      {
        id: 'line-001',
        itemId: 'item-001',
        requestedQty: '2.00',
        lotId: null,
        condition: StockBalanceCondition.NEW,
        serializedAssetId: null,
      },
    ];
    const balanceService = createStockBalanceServiceMock();
    const mirrorQb = buildMirrorUpdateQb();
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(existing),
      find: jest
        .fn()
        .mockImplementation(async (entity) => (entity === StockIssueLine ? issueLines : [])),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      createQueryBuilder: jest.fn().mockReturnValue(mirrorQb),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService({}, balanceService);
    const cancelled = await service.cancel('issue-001', actor);

    expect(cancelled.status).toBe(StockIssueStatus.CANCELLED);
    expect(manager.save).toHaveBeenCalled();
    // MOD12 S2: la espejo issue_status se sincroniza con la cabecera.
    expect(mirrorQb.set).toHaveBeenCalledWith({
      issueStatus: StockIssueStatus.CANCELLED,
      updatedAt: expect.any(Date),
    });
    expect(mirrorQb.where).toHaveBeenCalledWith('issue_id = :issueId', { issueId: 'issue-001' });
    // M1: el UPDATE espejo filtra por tenant (defensa en profundidad).
    expect(mirrorQb.andWhere).toHaveBeenCalledWith('tenant_id = :tenantId', {
      tenantId: 'tenant-001',
    });
    expect(balanceService.applyDeltaWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        itemId: 'item-001',
        locationId: 'loc-source',
        delta: 0,
        reservedDelta: -2,
      }),
    );
  });

  it('dispatches TECHNICIAN_CUSTODY and persists stockMovementId', async () => {
    const issue = {
      id: 'issue-001',
      tenantId: 'tenant-001',
      type: StockIssueType.TECHNICIAN_CUSTODY,
      status: StockIssueStatus.APPROVED,
      sourceLocationId: 'loc-source',
      destinationLocationId: 'loc-dest',
      stockMovementId: null,
    };
    const sourceLocation = { id: 'loc-source', tenantId: 'tenant-001', type: 'MAIN_WAREHOUSE' };
    const destinationLocation = {
      id: 'loc-dest',
      tenantId: 'tenant-001',
      type: 'MOBILE_TECHNICIAN',
    };
    const issueLines = [
      {
        id: 'line-001',
        tenantId: 'tenant-001',
        issueId: 'issue-001',
        itemId: 'item-001',
        requestedQty: '2.00',
        dispatchedQty: null,
        lotId: null,
        serializedAssetId: null,
        condition: StockBalanceCondition.NEW,
      },
    ];

    const stockLedgerServiceMock = {
      recordStockIssueTransferWithManager: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mov-001' }, lines: [] }),
      recordStockIssueSaleWithManager: jest.fn(),
      recordStockIssueInternalConsumptionWithManager: jest.fn(),
    };

    const mirrorQb = buildMirrorUpdateQb();
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockIssue) {
          return options.where.id === 'issue-001' ? issue : null;
        }
        if (entity === StockLocation) {
          return options.where.id === 'loc-source' ? sourceLocation : destinationLocation;
        }
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockIssueLine) {
          return issueLines;
        }
        if (entity === StockBalance) {
          return [
            {
              tenantId: 'tenant-001',
              itemId: 'item-001',
              locationId: 'loc-source',
              lotId: null,
              condition: StockBalanceCondition.NEW,
              quantityOnHand: '10.00',
            },
          ];
        }
        return [];
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      createQueryBuilder: jest.fn().mockReturnValue(mirrorQb),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService(stockLedgerServiceMock);
    const dispatched = await service.dispatch(
      'issue-001',
      { handoffMethod: 'ACTA', handoffNotes: 'Entrega', handoffAttachments: [] },
      actor,
    );

    expect(stockLedgerServiceMock.recordStockIssueTransferWithManager).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-001',
      expect.objectContaining({
        idempotencyKey: 'stock-issue:issue-001',
        sourceLocationId: 'loc-source',
        destinationLocationId: 'loc-dest',
        handoffReference: 'ACTA',
      }),
      expect.objectContaining({ sub: 'support-001' }),
    );
    expect(dispatched.stockMovementId).toBe('mov-001');
    expect(manager.save).toHaveBeenCalledWith(
      StockIssue,
      expect.objectContaining({ status: StockIssueStatus.DISPATCHED, stockMovementId: 'mov-001' }),
    );
    // MOD12 S2: la espejo issue_status se sincroniza tras despachar.
    expect(mirrorQb.set).toHaveBeenCalledWith({
      issueStatus: StockIssueStatus.DISPATCHED,
      updatedAt: expect.any(Date),
    });
    expect(mirrorQb.where).toHaveBeenCalledWith('issue_id = :issueId', { issueId: 'issue-001' });
    // M1: el UPDATE espejo filtra por tenant (defensa en profundidad).
    expect(mirrorQb.andWhere).toHaveBeenCalledWith('tenant_id = :tenantId', {
      tenantId: 'tenant-001',
    });
  });

  it('rejects dispatch when source and destination locations are the same', async () => {
    const issue = {
      id: 'issue-004',
      tenantId: 'tenant-001',
      type: StockIssueType.WAREHOUSE_TO_WAREHOUSE,
      status: StockIssueStatus.APPROVED,
      sourceLocationId: 'loc-main',
      destinationLocationId: 'loc-main',
      stockMovementId: null,
    };
    const mainLocation = { id: 'loc-main', tenantId: 'tenant-001', type: 'MAIN_WAREHOUSE' };
    const issueLines = [
      {
        id: 'line-004',
        tenantId: 'tenant-001',
        issueId: 'issue-004',
        itemId: 'item-001',
        requestedQty: '1.00',
        dispatchedQty: null,
        lotId: null,
        serializedAssetId: null,
        condition: StockBalanceCondition.NEW,
      },
    ];

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockIssue) {
          return options.where.id === 'issue-004' ? issue : null;
        }
        if (entity === StockLocation) {
          return mainLocation;
        }
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity) => {
        if (entity === StockIssueLine) {
          return issueLines;
        }
        return [];
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      createQueryBuilder: jest.fn().mockReturnValue(buildMirrorUpdateQb()),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService({
      recordStockIssueTransferWithManager: jest.fn(),
      recordStockIssueSaleWithManager: jest.fn(),
      recordStockIssueInternalConsumptionWithManager: jest.fn(),
    });

    await expect(
      service.dispatch(
        'issue-004',
        { handoffMethod: 'ACTA', handoffNotes: 'Sin traslado real', handoffAttachments: [] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dispatches SALE_DISPATCH using sale wrapper', async () => {
    const issue = {
      id: 'issue-002',
      tenantId: 'tenant-001',
      type: StockIssueType.SALE_DISPATCH,
      status: StockIssueStatus.REQUESTED,
      sourceLocationId: 'loc-source',
      destinationLocationId: null,
      stockMovementId: null,
      commercialRefId: 'COM-001',
      originRefId: null,
      costCenter: null,
      destinationRefId: null,
    };
    const sourceLocation = { id: 'loc-source', tenantId: 'tenant-001', type: 'MAIN_WAREHOUSE' };
    const issueLines = [
      {
        id: 'line-002',
        tenantId: 'tenant-001',
        issueId: 'issue-002',
        itemId: 'item-001',
        requestedQty: '1.00',
        dispatchedQty: null,
        lotId: null,
        serializedAssetId: null,
        condition: StockBalanceCondition.NEW,
      },
    ];

    const stockLedgerServiceMock = {
      recordStockIssueTransferWithManager: jest.fn(),
      recordStockIssueSaleWithManager: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mov-002' }, lines: [], created: true }),
      recordStockIssueInternalConsumptionWithManager: jest.fn(),
    };

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockIssue) return options.where.id === 'issue-002' ? issue : null;
        if (entity === StockLocation) return sourceLocation;
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity) => {
        if (entity === StockIssueLine) return issueLines;
        if (entity === StockBalance) {
          return [
            {
              tenantId: 'tenant-001',
              itemId: 'item-001',
              locationId: 'loc-source',
              lotId: null,
              condition: StockBalanceCondition.NEW,
              quantityOnHand: '10.00',
            },
          ];
        }
        return [];
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      createQueryBuilder: jest.fn().mockReturnValue(buildMirrorUpdateQb()),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService(stockLedgerServiceMock);
    const dispatched = await service.dispatch(
      'issue-002',
      { handoffMethod: 'ACTA', handoffNotes: null, handoffAttachments: [] },
      actor,
    );

    expect(stockLedgerServiceMock.recordStockIssueSaleWithManager).toHaveBeenCalled();
    expect(dispatched.stockMovementId).toBe('mov-002');
  });

  it('dispatches INTERNAL_CONSUMPTION using internal consumption wrapper', async () => {
    const issue = {
      id: 'issue-003',
      tenantId: 'tenant-001',
      type: StockIssueType.INTERNAL_CONSUMPTION,
      status: StockIssueStatus.REQUESTED,
      sourceLocationId: 'loc-source',
      destinationLocationId: null,
      stockMovementId: null,
      commercialRefId: null,
      originRefId: null,
      costCenter: 'CC-01',
      reason: 'Uso interno',
      destinationRefId: null,
    };
    const sourceLocation = { id: 'loc-source', tenantId: 'tenant-001', type: 'MAIN_WAREHOUSE' };
    const issueLines = [
      {
        id: 'line-003',
        tenantId: 'tenant-001',
        issueId: 'issue-003',
        itemId: 'item-001',
        requestedQty: '2.00',
        dispatchedQty: null,
        lotId: null,
        serializedAssetId: null,
        condition: StockBalanceCondition.NEW,
      },
    ];

    const stockLedgerServiceMock = {
      recordStockIssueTransferWithManager: jest.fn(),
      recordStockIssueSaleWithManager: jest.fn(),
      recordStockIssueInternalConsumptionWithManager: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mov-003' }, lines: [] }),
    };

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockIssue) return options.where.id === 'issue-003' ? issue : null;
        if (entity === StockLocation) return sourceLocation;
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity) => {
        if (entity === StockIssueLine) return issueLines;
        if (entity === StockBalance) {
          return [
            {
              tenantId: 'tenant-001',
              itemId: 'item-001',
              locationId: 'loc-source',
              lotId: null,
              condition: StockBalanceCondition.NEW,
              quantityOnHand: '10.00',
            },
          ];
        }
        return [];
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      createQueryBuilder: jest.fn().mockReturnValue(buildMirrorUpdateQb()),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService(stockLedgerServiceMock);
    const dispatched = await service.dispatch(
      'issue-003',
      { handoffMethod: 'ACTA', handoffNotes: null, handoffAttachments: [] },
      actor,
    );

    expect(
      stockLedgerServiceMock.recordStockIssueInternalConsumptionWithManager,
    ).toHaveBeenCalled();
    expect(dispatched.stockMovementId).toBe('mov-003');
  });

  it('reserva requestedQty al crear la salida', async () => {
    const balanceService = createStockBalanceServiceMock();
    const save = jest
      .fn()
      .mockImplementationOnce(async (_entity, payload) => ({ id: 'issue-res-001', ...payload }))
      .mockImplementationOnce(async (_entity, payload) => payload);

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save,
      // MOD12 S1 · B3: la carga batch de ítems usa `find`; sin maestro no hay serial que validar.
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockLocation) {
          const isDestination = options.where.id === '22222222-2222-4222-8222-222222222222';
          return {
            id: options.where.id,
            tenantId: options.where.tenantId,
            type: isDestination ? 'MOBILE_TECHNICIAN' : 'MAIN_WAREHOUSE',
          };
        }
        return null;
      }),
      create: jest.fn((_entity, payload) => payload),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService({}, balanceService);
    await service.create(
      {
        type: StockIssueType.TECHNICIAN_CUSTODY,
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
        destinationLocationId: '22222222-2222-4222-8222-222222222222',
        lines: [
          {
            itemId: '33333333-3333-4333-8333-333333333333',
            requestedQty: 2,
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(balanceService.applyDeltaWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        itemId: '33333333-3333-4333-8333-333333333333',
        locationId: '11111111-1111-4111-8111-111111111111',
        delta: 0,
        reservedDelta: 2,
      }),
    );
  });

  it('rechaza crear salida por encima del disponible', async () => {
    const balanceService = createStockBalanceServiceMock({
      getAvailabilityWithManager: jest.fn().mockResolvedValue({
        onHand: 5,
        reserved: 4,
        available: 1,
      }),
    });

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity, payload) => ({ id: 'issue-res-002', ...payload }))
        .mockImplementationOnce(async (_entity, payload) => payload),
      // MOD12 S1 · B3: la carga batch de ítems usa `find`; sin maestro no hay serial que validar.
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockLocation) {
          const isDestination = options.where.id === '22222222-2222-4222-8222-222222222222';
          return {
            id: options.where.id,
            tenantId: options.where.tenantId,
            type: isDestination ? 'MOBILE_TECHNICIAN' : 'MAIN_WAREHOUSE',
          };
        }
        return null;
      }),
      create: jest.fn((_entity, payload) => payload),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService({}, balanceService);
    await expect(
      service.create(
        {
          type: StockIssueType.TECHNICIAN_CUSTODY,
          sourceLocationId: '11111111-1111-4111-8111-111111111111',
          destinationLocationId: '22222222-2222-4222-8222-222222222222',
          lines: [
            {
              itemId: '33333333-3333-4333-8333-333333333333',
              requestedQty: 2,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow(/disponible suficiente/);
    expect(balanceService.applyDeltaWithManager).not.toHaveBeenCalled();
  });

  it('libera reserva al despachar antes del ledger (D-F3B-5)', async () => {
    const issue = {
      id: 'issue-own-res',
      tenantId: 'tenant-001',
      type: StockIssueType.SALE_DISPATCH,
      status: StockIssueStatus.REQUESTED,
      sourceLocationId: 'loc-source',
      destinationLocationId: null,
      commercialRefId: 'sale-001',
      originRefId: null,
      costCenter: null,
      destinationRefId: null,
      stockMovementId: null,
    };
    const issueLines = [
      {
        id: 'line-001',
        tenantId: 'tenant-001',
        issueId: 'issue-own-res',
        itemId: 'item-001',
        requestedQty: '5.00',
        dispatchedQty: null,
        lotId: null,
        serializedAssetId: null,
        condition: StockBalanceCondition.NEW,
      },
    ];
    const balanceService = createStockBalanceServiceMock({
      getAvailabilityWithManager: jest
        .fn()
        .mockResolvedValueOnce({ onHand: 5, reserved: 0, available: 5 }),
    });
    const stockLedgerServiceMock = {
      recordStockIssueTransferWithManager: jest.fn(),
      recordStockIssueSaleWithManager: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mov-own' }, lines: [] }),
      recordStockIssueInternalConsumptionWithManager: jest.fn(),
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        if (entity === StockIssue) return options.where.id === 'issue-own-res' ? issue : null;
        if (entity === StockLocation) {
          return { id: 'loc-source', tenantId: 'tenant-001', type: 'MAIN_WAREHOUSE' };
        }
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity) => {
        if (entity === StockIssueLine) return issueLines;
        return [];
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      createQueryBuilder: jest.fn().mockReturnValue(buildMirrorUpdateQb()),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = createService(stockLedgerServiceMock, balanceService);
    const dispatched = await service.dispatch(
      'issue-own-res',
      { handoffMethod: 'ACTA', handoffNotes: null, handoffAttachments: [] },
      actor,
    );

    expect(balanceService.applyDeltaWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        reservedDelta: -5,
        delta: 0,
      }),
    );
    expect(stockLedgerServiceMock.recordStockIssueSaleWithManager).toHaveBeenCalled();
    expect(dispatched.stockMovementId).toBe('mov-own');
  });
});
