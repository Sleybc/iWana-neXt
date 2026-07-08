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

jest.mock('@iwana/db', () => ({
  StockBalance: class StockBalance {},
  StockIssue: class StockIssue {},
  StockIssueLine: class StockIssueLine {},
  StockLocation: class StockLocation {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

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
      create: jest.fn((_entity, payload) => payload),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new StockIssueService({} as DataSource, {} as any);
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
        status: StockIssueStatus.DRAFT,
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
    const service = new StockIssueService({} as DataSource, {} as any);
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
    const service = new StockIssueService({} as DataSource, {} as any);

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

  it('lists issues filtered by status and type', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new StockIssueService({} as DataSource, {} as any);
    await service.list({ status: StockIssueStatus.DRAFT, type: StockIssueType.CREW_CUSTODY });

    expect(qb.andWhere).toHaveBeenCalledWith('issue.type = :type', {
      type: StockIssueType.CREW_CUSTODY,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('issue.status = :status', {
      status: StockIssueStatus.DRAFT,
    });
  });

  it('cancels a non-dispatched issue', async () => {
    const existing = {
      id: 'issue-001',
      tenantId: 'tenant-001',
      status: StockIssueStatus.DRAFT,
      closedAt: null,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new StockIssueService({} as DataSource, {} as any);
    const cancelled = await service.cancel('issue-001', actor);

    expect(cancelled.status).toBe(StockIssueStatus.CANCELLED);
    expect(manager.save).toHaveBeenCalled();
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
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new StockIssueService({} as DataSource, stockLedgerServiceMock as any);
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
  });
});
