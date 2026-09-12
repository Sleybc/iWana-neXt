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
import { SerializedGroupValidator } from '../services/serialized-group.validator';
import { CycleCountService } from '../services/cycle-count.service';
import { StockLocationService } from '../services/stock-location.service';
import { TenantContext, runInTenantSchema } from '@iwana/db';

jest.mock('@iwana/db', () => ({
  PurchaseRequest: class PurchaseRequest {},
  PurchaseOrder: class PurchaseOrder {},
  PurchaseRequestLine: class PurchaseRequestLine {},
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
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
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
        {
          listByContext: jest.fn().mockResolvedValue([]),
          findActiveByCode: jest.fn(),
          resolveSystemPreset: jest.fn(),
          findById: jest.fn(),
        } as never,
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
        {
          listByContext: jest.fn().mockResolvedValue([]),
          findActiveByCode: jest.fn(),
          resolveSystemPreset: jest.fn(),
          findById: jest.fn(),
        } as never,
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
        {
          listByContext: jest.fn().mockResolvedValue([]),
          findActiveByCode: jest.fn(),
          resolveSystemPreset: jest.fn(),
          findById: jest.fn(),
        } as never,
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

    it('kpiPreset pendingReceipt excluye solicitudes totalmente recibidas', async () => {
      const qb = chainableQb();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new PurchasingQueryService(
        {} as DataSource,
        {} as never,
        new PurchasingPolicyService(),
        {
          listByContext: jest.fn().mockResolvedValue([]),
          findActiveByCode: jest.fn(),
          resolveSystemPreset: jest.fn(),
          findById: jest.fn(),
        } as never,
      );
      await service.listRequests({ kpiPreset: 'pendingReceipt' });

      expect(qb.andWhere).toHaveBeenCalledWith('request.status = :pendingReceiptStatus', {
        pendingReceiptStatus: PurchaseRequestStatus.CONVERTED_TO_PO,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS'),
        expect.objectContaining({
          pendingReceiptOrderStatuses: expect.arrayContaining(['APPROVED', 'PARTIALLY_RECEIVED']),
        }),
      );
    });

    it('kpiPreset pendingReceipt prevalece sobre status explícito', async () => {
      const qb = chainableQb();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
      );

      const service = new PurchasingQueryService(
        {} as DataSource,
        {} as never,
        new PurchasingPolicyService(),
        {
          listByContext: jest.fn().mockResolvedValue([]),
          findActiveByCode: jest.fn(),
          resolveSystemPreset: jest.fn(),
          findById: jest.fn(),
        } as never,
      );
      await service.listRequests({
        kpiPreset: 'pendingReceipt',
        status: PurchaseRequestStatus.CONVERTED_TO_PO,
      });

      // No debe aplicar el filtro plano por estado: debe exigir órdenes pendientes.
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS'),
        expect.anything(),
      );
    });
  });

  describe('PurchasingQueryService.listRequests · fulfillmentStatus derivado', () => {
    function buildService() {
      return new PurchasingQueryService(
        {} as DataSource,
        {} as never,
        new PurchasingPolicyService(),
        {
          listByContext: jest.fn().mockResolvedValue([]),
          findActiveByCode: jest.fn(),
          resolveSystemPreset: jest.fn(),
          findById: jest.fn(),
        } as never,
      );
    }

    function mockManager(
      requestQb: ReturnType<typeof chainableQb>,
      orderQb?: ReturnType<typeof chainableQb>,
      lineQb?: ReturnType<typeof chainableQb>,
    ) {
      // Fase 30 BE-2: además del agregado de órdenes (fulfillment), el eje de
      // cobertura de adjudicación agrega purchase_request_lines con SU PROPIA
      // consulta (3 createQueryBuilder en total: request + po + line).
      const createQueryBuilder = jest
        .fn()
        .mockReturnValueOnce(requestQb)
        .mockReturnValueOnce(orderQb ?? chainableQb())
        .mockReturnValue(lineQb ?? chainableQb());
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder } }),
      );
      return createQueryBuilder;
    }

    it('enriquece cada fila con una sola consulta agregada sobre purchase_orders', async () => {
      const requests = [
        { id: 'pr-1', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'pr-2', createdAt: new Date('2026-09-01T09:00:00Z') },
        { id: 'pr-3', createdAt: new Date('2026-09-01T08:00:00Z') },
      ];
      const requestQb = chainableQb({ getMany: jest.fn().mockResolvedValue(requests) });
      const orderQb = chainableQb({
        getRawMany: jest.fn().mockResolvedValue([
          { purchaseRequestId: 'pr-1', status: 'CLOSED' },
          { purchaseRequestId: 'pr-1', status: 'CANCELLED' },
          { purchaseRequestId: 'pr-2', status: 'APPROVED' },
          { purchaseRequestId: 'pr-2', status: 'FULLY_RECEIVED' },
        ]),
      });
      const lineQb = chainableQb({
        getRawMany: jest.fn().mockResolvedValue([
          { purchaseRequestId: 'pr-1', lineStatus: 'ORDERED' },
          { purchaseRequestId: 'pr-2', lineStatus: 'AWARDED' },
          { purchaseRequestId: 'pr-3', lineStatus: 'OPEN' },
        ]),
      });
      const createQueryBuilder = mockManager(requestQb, orderQb, lineQb);

      const result = await buildService().listRequests({ limit: 20 });

      // 1 consulta de solicitudes + 2 agregadas (una por eje derivado).
      expect(createQueryBuilder).toHaveBeenCalledTimes(3);
      expect(orderQb.getRawMany).toHaveBeenCalledTimes(1);
      expect(lineQb.getRawMany).toHaveBeenCalledTimes(1);
      expect(orderQb.where).toHaveBeenCalledWith('po.tenant_id = :tenantId', {
        tenantId: 'tenant-001',
      });
      expect(orderQb.andWhere).toHaveBeenCalledWith('po.purchase_request_id IN (:...requestIds)', {
        requestIds: ['pr-1', 'pr-2', 'pr-3'],
      });
      expect(result.data.map((row) => row.fulfillmentStatus)).toEqual([
        'RECEIVED',
        'PENDING_RECEIPT',
        'NOT_ORDERED',
      ]);
      expect(result.data.map((row) => row.awardCoverage)).toEqual([
        'FULLY_ORDERED',
        'FULLY_AWARDED',
        'NOT_AWARDED',
      ]);
    });

    it('modo page también expone fulfillmentStatus', async () => {
      const requestQb = chainableQb({
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([{ id: 'pr-9', createdAt: new Date() }]),
      });
      const orderQb = chainableQb({
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ purchaseRequestId: 'pr-9', status: 'PARTIALLY_RECEIVED' }]),
      });
      mockManager(requestQb, orderQb);

      const result = await buildService().listRequests({ page: 1, limit: 10 });

      expect(result.meta.mode).toBe('page');
      expect(result.data[0]?.fulfillmentStatus).toBe('PARTIALLY_RECEIVED');
    });

    it('no consulta purchase_orders cuando la página viene vacía', async () => {
      const requestQb = chainableQb();
      const orderQb = chainableQb();
      const createQueryBuilder = mockManager(requestQb, orderQb);

      const result = await buildService().listRequests({ limit: 20 });

      expect(result.data).toEqual([]);
      expect(createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(orderQb.getRawMany).not.toHaveBeenCalled();
    });

    it('mantiene alineado el preset pendingReceipt con el eje derivado', async () => {
      // El EXISTS filtra por APPROVED/PARTIALLY_RECEIVED; el eje derivado de esas
      // mismas filas nunca puede resolverse como RECEIVED.
      const requestQb = chainableQb({
        getMany: jest.fn().mockResolvedValue([
          { id: 'pr-a', createdAt: new Date('2026-09-01T10:00:00Z') },
          { id: 'pr-b', createdAt: new Date('2026-09-01T09:00:00Z') },
        ]),
      });
      const orderQb = chainableQb({
        getRawMany: jest.fn().mockResolvedValue([
          { purchaseRequestId: 'pr-a', status: 'APPROVED' },
          { purchaseRequestId: 'pr-a', status: 'CLOSED' },
          { purchaseRequestId: 'pr-b', status: 'PARTIALLY_RECEIVED' },
        ]),
      });
      mockManager(requestQb, orderQb);

      const result = await buildService().listRequests({ kpiPreset: 'pendingReceipt' });

      expect(result.data.map((row) => row.fulfillmentStatus)).toEqual([
        'PENDING_RECEIPT',
        'PARTIALLY_RECEIVED',
      ]);
      expect(result.data.every((row) => row.fulfillmentStatus !== 'RECEIVED')).toBe(true);
    });
  });

  describe('PurchasingQueryService.listRequests · awardCoverage derivado (ADR-087, propuesto)', () => {
    function buildService() {
      return new PurchasingQueryService(
        {} as DataSource,
        {} as never,
        new PurchasingPolicyService(),
        {
          listByContext: jest.fn().mockResolvedValue([]),
          findActiveByCode: jest.fn(),
          resolveSystemPreset: jest.fn(),
          findById: jest.fn(),
        } as never,
      );
    }

    function mockManager(
      requestQb: ReturnType<typeof chainableQb>,
      lineQb: ReturnType<typeof chainableQb>,
    ) {
      const createQueryBuilder = jest
        .fn()
        .mockReturnValueOnce(requestQb)
        .mockReturnValueOnce(chainableQb()) // agregado de órdenes (fulfillment)
        .mockReturnValue(lineQb); // agregado de líneas (cobertura)
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { createQueryBuilder } }),
      );
      return createQueryBuilder;
    }

    it('resuelve la cobertura de toda la página con UNA consulta agregada sobre purchase_request_lines', async () => {
      const requestQb = chainableQb({
        getMany: jest.fn().mockResolvedValue([
          { id: 'pr-a', createdAt: new Date('2026-09-01T10:00:00Z') },
          { id: 'pr-b', createdAt: new Date('2026-09-01T09:00:00Z') },
          { id: 'pr-c', createdAt: new Date('2026-09-01T08:00:00Z') },
        ]),
      });
      const lineQb = chainableQb({
        getRawMany: jest.fn().mockResolvedValue([
          { purchaseRequestId: 'pr-a', lineStatus: 'AWARDED' },
          { purchaseRequestId: 'pr-a', lineStatus: 'PENDING_QUOTE' },
          { purchaseRequestId: 'pr-b', lineStatus: 'AWARDED' },
          { purchaseRequestId: 'pr-b', lineStatus: 'CANCELLED' },
          { purchaseRequestId: 'pr-c', lineStatus: 'RECEIVED' },
          { purchaseRequestId: 'pr-c', lineStatus: 'OPEN' },
        ]),
      });
      const createQueryBuilder = mockManager(requestQb, lineQb);

      const result = await buildService().listRequests({ limit: 20 });

      expect(createQueryBuilder).toHaveBeenCalledTimes(3);
      expect(lineQb.getRawMany).toHaveBeenCalledTimes(1);
      expect(lineQb.where).toHaveBeenCalledWith('line.tenant_id = :tenantId', {
        tenantId: 'tenant-001',
      });
      expect(lineQb.andWhere).toHaveBeenCalledWith('line.purchase_request_id IN (:...requestIds)', {
        requestIds: ['pr-a', 'pr-b', 'pr-c'],
      });
      // El agrupado reduce las filas al mínimo que el resolutor necesita.
      expect(lineQb.groupBy).toHaveBeenCalledWith('line.purchase_request_id');
      expect(lineQb.addGroupBy).toHaveBeenCalledWith('line.line_status');

      // pr-a: adjudicada + pendiente → parcial. pr-b: la CANCELLED se excluye,
      // la AWARDED cubre todo lo elegible → completa. pr-c: ordenada + abierta
      // → conversión en curso.
      expect(result.data.map((row) => row.awardCoverage)).toEqual([
        'PARTIALLY_AWARDED',
        'FULLY_AWARDED',
        'PARTIALLY_ORDERED',
      ]);
    });

    it('modo page también expone awardCoverage', async () => {
      const requestQb = chainableQb({
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([{ id: 'pr-9', createdAt: new Date() }]),
      });
      const lineQb = chainableQb({
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ purchaseRequestId: 'pr-9', lineStatus: 'ORDERED' }]),
      });
      mockManager(requestQb, lineQb);

      const result = await buildService().listRequests({ page: 1, limit: 10 });

      expect(result.meta.mode).toBe('page');
      expect(result.data[0]?.awardCoverage).toBe('FULLY_ORDERED');
    });

    it('no consulta purchase_request_lines cuando la página viene vacía', async () => {
      const requestQb = chainableQb();
      const lineQb = chainableQb();
      const createQueryBuilder = mockManager(requestQb, lineQb);

      const result = await buildService().listRequests({ limit: 20 });

      expect(result.data).toEqual([]);
      expect(createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(lineQb.getRawMany).not.toHaveBeenCalled();
    });

    it('una solicitud sin filas de líneas resuelve NOT_AWARDED por defecto', async () => {
      const requestQb = chainableQb({
        getMany: jest.fn().mockResolvedValue([{ id: 'pr-vacia', createdAt: new Date() }]),
      });
      const lineQb = chainableQb({ getRawMany: jest.fn().mockResolvedValue([]) });
      mockManager(requestQb, lineQb);

      const result = await buildService().listRequests({ limit: 20 });

      expect(result.data[0]?.awardCoverage).toBe('NOT_AWARDED');
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
        new SerializedGroupValidator(),
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
