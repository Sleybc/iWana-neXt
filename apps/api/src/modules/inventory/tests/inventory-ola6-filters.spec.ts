import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PurchaseRequestStatus,
  StockCountStatus,
  StockIssueStatus,
  StockIssueType,
  StockLocationStatus,
  StockLocationType,
} from '@iwana/shared';
import { assertExclusivePageCursor } from '../../../common/pagination';
import {
  ListPurchaseRequestsQuerySchema,
  ListStockCountsQuerySchema,
  ListStockIssuesQuerySchema,
  ListStockLocationsQuerySchema,
  ListInventoryItemsQuerySchema,
  ListSerializedAssetsQuerySchema,
} from '../dto';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { StockIssueService } from '../services/stock-issue.service';
import { CycleCountService } from '../services/cycle-count.service';
import { StockLocationService } from '../services/stock-location.service';
import { TenantContext, runInTenantSchema } from '@iwana/db';

jest.mock('@iwana/db', () => ({
  PurchaseRequest: class PurchaseRequest {},
  StockIssue: class StockIssue {},
  StockIssueLine: class StockIssueLine {},
  StockLocation: class StockLocation {},
  StockCount: class StockCount {},
  StockCountLine: class StockCountLine {},
  StockBalance: class StockBalance {},
  InventoryItem: class InventoryItem {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

function chainableQb(overrides?: Record<string, jest.Mock>) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    ...overrides,
  };
  qb.clone.mockReturnValue(qb);
  return qb;
}

describe('ADR-065 Ola 6 · filtros servidor (inventory/purchasing)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  describe('schemas', () => {
    it('acepta search + kpiPreset en solicitudes de compra', () => {
      const parsed = ListPurchaseRequestsQuerySchema.parse({
        search: 'PR-001',
        kpiPreset: 'pendingQuotes',
        limit: 20,
      });
      expect(parsed.search).toBe('PR-001');
      expect(parsed.kpiPreset).toBe('pendingQuotes');
    });

    it('acepta search en salidas y status en conteos', () => {
      expect(ListStockIssuesQuerySchema.parse({ search: 'bodega' }).search).toBe('bodega');
      expect(ListStockCountsQuerySchema.parse({ status: StockCountStatus.OPEN }).status).toBe(
        StockCountStatus.OPEN,
      );
    });

    it('acepta belowMinimum en ítems y filtros de matriz en ubicaciones', () => {
      expect(ListInventoryItemsQuerySchema.parse({ belowMinimum: true }).belowMinimum).toBe(true);
      const loc = ListStockLocationsQuerySchema.parse({
        search: 'norte',
        custody: 'mobile',
        statusGroup: 'inactive_group',
        withStock: true,
      });
      expect(loc.custody).toBe('mobile');
      expect(loc.statusGroup).toBe('inactive_group');
      expect(loc.withStock).toBe(true);
    });

    it('acepta page en ítems, conteos y activos (híbrido)', () => {
      expect(ListInventoryItemsQuerySchema.parse({ page: 2 }).page).toBe(2);
      expect(ListStockCountsQuerySchema.parse({ page: 3 }).page).toBe(3);
      expect(ListSerializedAssetsQuerySchema.parse({ page: 1 }).page).toBe(1);
    });

    it('rechaza page+cursor juntos', () => {
      expect(() => assertExclusivePageCursor({ page: 2, cursor: 'abc' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('PurchasingQueryService.listRequests', () => {
    it('aplica search y kpiPreset pendingQuotes', async () => {
      const qb = chainableQb();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new PurchasingQueryService(
        {} as DataSource,
        {} as never,
        new PurchasingPolicyService(),
      );
      const result = await service.listRequests({
        search: 'reposición',
        kpiPreset: 'pendingQuotes',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'request.status IN (:...pendingQuoteStatuses)',
        expect.objectContaining({
          pendingQuoteStatuses: [PurchaseRequestStatus.DRAFT, PurchaseRequestStatus.PENDING_QUOTES],
        }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('request.request_number'),
        expect.objectContaining({ purchaseSearch: '%reposición%' }),
      );
      expect(result.meta.mode).toBe('cursor');
      expect(result.meta.capabilities.randomAccess).toBe(false);
    });

    it('modo page emite ListMeta offset', async () => {
      const qb = chainableQb({ getCount: jest.fn().mockResolvedValue(42) });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new PurchasingQueryService(
        {} as DataSource,
        {} as never,
        new PurchasingPolicyService(),
      );
      const result = await service.listRequests({ page: 2, limit: 10 });

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.meta).toMatchObject({
        mode: 'page',
        page: 2,
        limit: 10,
        total: 42,
        totalPages: 5,
        hasMore: true,
      });
    });

    it('kpiPreset overdue excluye estados terminales', async () => {
      const qb = chainableQb();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new PurchasingQueryService(
        {} as DataSource,
        {} as never,
        new PurchasingPolicyService(),
      );
      await service.listRequests({ kpiPreset: 'overdue' });

      expect(qb.andWhere).toHaveBeenCalledWith('request.needed_by_date < CURRENT_DATE');
      expect(qb.andWhere).toHaveBeenCalledWith(
        'request.status NOT IN (:...overdueTerminalStatuses)',
        expect.objectContaining({
          overdueTerminalStatuses: [
            PurchaseRequestStatus.CONVERTED_TO_PO,
            PurchaseRequestStatus.CANCELLED,
            PurchaseRequestStatus.REJECTED,
          ],
        }),
      );
    });
  });

  describe('StockIssueService.list', () => {
    it('acepta parámetro search sin fallar y aplica filtros type+status', async () => {
      const qb = chainableQb();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new StockIssueService(
        {} as DataSource,
        {} as never,
        {
          getAvailabilityWithManager: jest.fn(),
          applyDeltaWithManager: jest.fn(),
        } as never,
        {
          captureItemSnapshots: jest.fn(),
          publishAfterCommittedMovement: jest.fn(),
        } as never,
      );

      await service.list({
        search: 'juan',
        type: StockIssueType.SALE_DISPATCH,
        status: StockIssueStatus.DRAFT,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.type = :type', {
        type: StockIssueType.SALE_DISPATCH,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('issue.status = :status', {
        status: StockIssueStatus.DRAFT,
      });
    });
  });

  describe('CycleCountService.list', () => {
    it('filtra por status en servidor', async () => {
      const qb = chainableQb();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new CycleCountService(
        {} as DataSource,
        { recordMovementWithManager: jest.fn() } as never,
        {
          captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
          publishAfterCommittedMovement: jest.fn(),
        } as never,
      );

      await service.list({ status: StockCountStatus.COUNTING });

      expect(qb.andWhere).toHaveBeenCalledWith('count.status = :status', {
        status: StockCountStatus.COUNTING,
      });
    });

    it('devuelve envelope con meta.randomAccess: false en modo page', async () => {
      const qb = chainableQb({
        getCount: jest.fn().mockResolvedValue(5),
        getMany: jest.fn().mockResolvedValue([{ id: 'cnt-1' }, { id: 'cnt-2' }]),
      });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new CycleCountService(
        {} as DataSource,
        { recordMovementWithManager: jest.fn() } as never,
        {
          captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
          publishAfterCommittedMovement: jest.fn(),
        } as never,
      );

      const result = await service.list({ page: 2, limit: 10 });
      expect(result.meta).toBeDefined();
      expect(result.meta.capabilities.randomAccess).toBe(false);
      expect(result.meta.total).toBe(5);
      expect(result.meta.page).toBe(2);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('StockLocationService.list', () => {
    it('aplica search, custody mobile y withStock', async () => {
      const qb = chainableQb();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new StockLocationService({} as DataSource);
      await service.list({
        search: 'bodega',
        custody: 'mobile',
        statusGroup: 'inactive_group',
        withStock: true,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'location.type IN (:...mobileTypes)',
        expect.objectContaining({
          mobileTypes: [StockLocationType.MOBILE_TECHNICIAN, StockLocationType.MOBILE_CREW],
        }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'location.status IN (:...inactiveStatuses)',
        expect.objectContaining({
          inactiveStatuses: [StockLocationStatus.INACTIVE, StockLocationStatus.ARCHIVED],
        }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('EXISTS'));
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('location.name'),
        expect.objectContaining({ locationSearch: '%bodega%' }),
      );
    });
  });
});
