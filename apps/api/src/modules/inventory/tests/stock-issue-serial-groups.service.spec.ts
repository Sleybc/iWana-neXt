import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  UserRole,
} from '@iwana/shared';
import { StockIssueService } from '../services/stock-issue.service';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  StockBalanceService,
  buildReservationAvailabilityKey,
} from '../services/stock-balance.service';
import { SerializedGroupValidator } from '../services/serialized-group.validator';

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

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

const TENANT_ID = 'tenant-001';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const DEST_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const ASSET_A = '66666666-6666-4666-8666-666666666666';
const ASSET_B = '88888888-8888-4888-8888-888888888888';
const ASSET_C = '99999999-9999-4999-8999-999999999999';

const serializedItem = {
  id: ITEM_ID,
  sku: 'CFO-SER-ROGPN-TPL-XC220',
  trackingMode: InventoryTrackingMode.SERIALIZED,
};

function buildAsset(id: string, serialNumber: string) {
  return {
    id,
    tenantId: TENANT_ID,
    inventoryItemId: ITEM_ID,
    serialNumber,
    currentStatus: SerializedAssetStatus.AVAILABLE,
    currentLocationId: SOURCE_ID,
  };
}

function buildSerialRow(lineId: string, serializedAssetId: string, issueStatus: StockIssueStatus) {
  return {
    id: `serial-${serializedAssetId}`,
    tenantId: TENANT_ID,
    lineId,
    issueId: 'issue-001',
    issueStatus,
    serializedAssetId,
  };
}

interface ManagerOptions {
  issue?: Record<string, unknown>;
  lines?: Array<Record<string, unknown>>;
  serials?: Array<Record<string, unknown>>;
  assets?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
}

/**
 * Manager falso del flujo completo (dispatch/cancel/getById/update): enruta
 * `find`/`findOne` por entidad y entrega el QB de espejo o de pre-chequeo
 * según la entidad pedida a `createQueryBuilder`.
 */
function buildManager(options: ManagerOptions = {}) {
  const issue = options.issue ?? null;
  const lines = options.lines ?? [];
  const serials = options.serials ?? [];
  const assets = options.assets ?? [];
  const items = options.items ?? [serializedItem];

  const mirrorQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const committedQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  const manager: any = {
    transaction: jest
      .fn()
      .mockImplementation(async (work: (m: unknown) => unknown) => work(manager)),
    find: jest.fn().mockImplementation(async (entity: any) => {
      if (entity?.name === 'StockIssueLine') return lines;
      if (entity?.name === 'StockIssueLineSerial') return serials;
      if (entity?.name === 'SerializedAsset') return assets;
      if (entity?.name === 'InventoryItem') return items;
      return [];
    }),
    findOne: jest.fn().mockImplementation(async (entity: any, query?: any) => {
      if (entity?.name === 'StockIssue') return issue;
      if (entity?.name === 'StockLocation') {
        return {
          id: query?.where?.id,
          tenantId: TENANT_ID,
          type: query?.where?.id === DEST_ID ? 'MOBILE_TECHNICIAN' : 'MAIN_WAREHOUSE',
        };
      }
      return null;
    }),
    create: jest.fn((_entity: unknown, payload: unknown) => payload),
    save: jest.fn().mockImplementation(async (entity: { name?: string }, payload: unknown) => {
      if (Array.isArray(payload)) {
        return payload.map((row, index) => ({
          id: `${entity?.name ?? 'row'}-${index}-saved`,
          ...(row as Record<string, unknown>),
        }));
      }
      return { id: `${entity?.name ?? 'row'}-saved`, ...(payload as Record<string, unknown>) };
    }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest
      .fn()
      .mockImplementation((entity?: { name?: string }) =>
        entity?.name === 'StockIssueLineSerial' ? committedQb : mirrorQb,
      ),
  };

  return { manager, mirrorQb, committedQb };
}

function createService(
  balanceOverrides?: Partial<Record<string, jest.Mock>>,
  ledger: unknown = buildLedgerMock(),
) {
  const balanceService = {
    getAvailabilityWithManager: jest
      .fn()
      .mockResolvedValue({ onHand: 10, reserved: 0, available: 10 }),
    getAvailabilitiesWithManager: jest.fn().mockImplementation(
      async (
        _manager: unknown,
        _tenantId: string,
        _locationId: string,
        keys: Array<{
          itemId: string;
          lotId: string | null;
          condition: StockBalanceCondition;
        }>,
      ) => {
        const availability = new Map();
        for (const key of keys) {
          availability.set(buildReservationAvailabilityKey(key), {
            onHand: 10,
            reserved: 0,
            available: 10,
          });
        }
        return availability;
      },
    ),
    applyDeltaWithManager: jest.fn().mockResolvedValue({}),
    ...balanceOverrides,
  } as unknown as StockBalanceService;
  const domainEventPublisher = {
    captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
    publishAfterCommittedMovement: jest.fn(),
    emitIssueCreated: jest.fn(),
    emitIssueUpdated: jest.fn(),
    emitIssueCancelled: jest.fn(),
  };
  const service = new StockIssueService(
    {} as DataSource,
    ledger as never,
    balanceService,
    domainEventPublisher as never,
    new SerializedGroupValidator(),
  );
  return service;
}

function buildLedgerMock() {
  return {
    recordStockIssueTransferWithManager: jest
      .fn()
      .mockResolvedValue({ movement: { id: 'mov-001' }, lines: [], created: true }),
    recordStockIssueSaleWithManager: jest.fn(),
    recordStockIssueInternalConsumptionWithManager: jest.fn(),
  };
}

function runWithManager(manager: unknown) {
  (runInTenantSchema as jest.Mock).mockImplementation(
    async (_ds: unknown, _schema: string, work: (qr: { manager: unknown }) => unknown) =>
      work({ manager }),
  );
  (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
    tenantId: TENANT_ID,
    schemaName: 'tenant_001',
  });
}

describe('StockIssueService grupo de seriales (MOD12 S2 · B2/B4/B5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('dispatch (B4)', () => {
    const dispatchLine = (requestedQty: string) => ({
      id: 'line-001',
      tenantId: TENANT_ID,
      issueId: 'issue-001',
      itemId: ITEM_ID,
      requestedQty,
      dispatchedQty: null,
      lotId: null,
      serializedAssetId: ASSET_A,
      condition: StockBalanceCondition.NEW,
    });

    // Factory, no constante: el servicio muta la salida al despachar y un
    // objeto compartido metería a los tests siguientes en la ruta idempotente.
    const buildDispatchIssue = () => ({
      id: 'issue-001',
      tenantId: TENANT_ID,
      type: StockIssueType.TECHNICIAN_CUSTODY,
      status: StockIssueStatus.APPROVED,
      sourceLocationId: SOURCE_ID,
      destinationLocationId: DEST_ID,
      stockMovementId: null,
    });

    it('explota el grupo de N en N inputs de ledger con cantidad 1 y su serializedAssetId', async () => {
      const group = [ASSET_A, ASSET_B, ASSET_C];
      const { manager, mirrorQb } = buildManager({
        issue: buildDispatchIssue(),
        lines: [dispatchLine('3.00')],
        serials: group.map((assetId) =>
          buildSerialRow('line-001', assetId, StockIssueStatus.APPROVED),
        ),
        assets: [
          buildAsset(ASSET_A, 'SN-0001'),
          buildAsset(ASSET_B, 'SN-0002'),
          buildAsset(ASSET_C, 'SN-0003'),
        ],
      });
      runWithManager(manager);
      const ledger = buildLedgerMock();

      const dispatched = await createService({}, ledger).dispatch(
        'issue-001',
        { handoffMethod: 'ACTA', handoffAttachments: [] },
        actor,
      );

      expect(ledger.recordStockIssueTransferWithManager).toHaveBeenCalledTimes(1);
      const ledgerInput = (ledger.recordStockIssueTransferWithManager as jest.Mock).mock
        .calls[0]?.[2] as { lines: Array<Record<string, unknown>> };
      // Kardex granular: una línea de kardex por serial, cantidad 1.
      expect(ledgerInput.lines).toHaveLength(3);
      expect(ledgerInput.lines.map((line) => line.serializedAssetId)).toEqual(group);
      expect(ledgerInput.lines.every((line) => line.quantity === 1)).toBe(true);
      // S2.1 · B2: el kardex lleva el número de serie legible por serial.
      expect(ledgerInput.lines.map((line) => line.serialNumber)).toEqual([
        'SN-0001',
        'SN-0002',
        'SN-0003',
      ]);

      // dispatchedQty de la línea = tamaño del grupo.
      const lineSave = (manager.save as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as { name?: string })?.name === 'StockIssueLine',
      );
      const savedLines = lineSave?.[1] as Array<Record<string, unknown>>;
      expect(savedLines[0]?.dispatchedQty).toBe('3.00');

      // Espejo sincronizada con la cabecera en la misma transacción.
      expect(mirrorQb.set).toHaveBeenCalledWith({
        issueStatus: StockIssueStatus.DISPATCHED,
        updatedAt: expect.any(Date),
      });
      expect(mirrorQb.where).toHaveBeenCalledWith('issue_id = :issueId', { issueId: 'issue-001' });
      // M1: el UPDATE espejo filtra por tenant (defensa en profundidad).
      expect(mirrorQb.andWhere).toHaveBeenCalledWith('tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });

      // El detalle conserva el grupo legible.
      expect(dispatched.lines[0]?.serializedAssets).toEqual([
        { id: ASSET_A, serialNumber: 'SN-0001' },
        { id: ASSET_B, serialNumber: 'SN-0002' },
        { id: ASSET_C, serialNumber: 'SN-0003' },
      ]);
    });

    it('libera la reserva por el tamaño del grupo (no 1, no el singular)', async () => {
      const group = [ASSET_A, ASSET_B, ASSET_C];
      const balanceService = {
        getAvailabilityWithManager: jest
          .fn()
          .mockResolvedValue({ onHand: 10, reserved: 3, available: 7 }),
        applyDeltaWithManager: jest.fn().mockResolvedValue({}),
      };
      const { manager } = buildManager({
        issue: buildDispatchIssue(),
        lines: [dispatchLine('3.00')],
        serials: group.map((assetId) =>
          buildSerialRow('line-001', assetId, StockIssueStatus.APPROVED),
        ),
        assets: [
          buildAsset(ASSET_A, 'SN-0001'),
          buildAsset(ASSET_B, 'SN-0002'),
          buildAsset(ASSET_C, 'SN-0003'),
        ],
      });
      runWithManager(manager);

      await createService(balanceService).dispatch(
        'issue-001',
        { handoffMethod: 'ACTA', handoffAttachments: [] },
        actor,
      );

      expect(balanceService.applyDeltaWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reservedDelta: -3, delta: 0 }),
      );
    });

    it('rechaza el despacho con cantidad incoherente con el grupo', async () => {
      const group = [ASSET_A, ASSET_B, ASSET_C];
      const { manager } = buildManager({
        issue: buildDispatchIssue(),
        lines: [dispatchLine('2.00')],
        serials: group.map((assetId) =>
          buildSerialRow('line-001', assetId, StockIssueStatus.APPROVED),
        ),
      });
      runWithManager(manager);

      await expect(
        createService().dispatch(
          'issue-001',
          { handoffMethod: 'ACTA', handoffAttachments: [] },
          actor,
        ),
      ).rejects.toThrow(
        'La cantidad solicitada no coincide con el número de seriales de la línea.',
      );
    });

    it('compatibilidad S1: una línea singular (grupo de 1 por backfill) despacha igual que antes', async () => {
      const { manager } = buildManager({
        issue: buildDispatchIssue(),
        lines: [dispatchLine('1.00')],
        serials: [buildSerialRow('line-001', ASSET_A, StockIssueStatus.APPROVED)],
        assets: [buildAsset(ASSET_A, 'SN-0001')],
      });
      runWithManager(manager);
      const ledger = buildLedgerMock();

      await createService({}, ledger).dispatch(
        'issue-001',
        { handoffMethod: 'ACTA', handoffAttachments: [] },
        actor,
      );

      const ledgerInput = (ledger.recordStockIssueTransferWithManager as jest.Mock).mock
        .calls[0]?.[2] as { lines: Array<Record<string, unknown>> };
      expect(ledgerInput.lines).toHaveLength(1);
      expect(ledgerInput.lines[0]).toEqual(
        expect.objectContaining({ quantity: 1, serializedAssetId: ASSET_A }),
      );
    });
  });

  describe('cancel', () => {
    it('libera por el tamaño del grupo y sincroniza la espejo con CANCELLED', async () => {
      const balanceService = {
        getAvailabilityWithManager: jest
          .fn()
          .mockResolvedValue({ onHand: 10, reserved: 0, available: 10 }),
        applyDeltaWithManager: jest.fn().mockResolvedValue({}),
      };
      const { manager, mirrorQb } = buildManager({
        issue: {
          id: 'issue-001',
          tenantId: TENANT_ID,
          type: StockIssueType.TECHNICIAN_CUSTODY,
          status: StockIssueStatus.REQUESTED,
          sourceLocationId: SOURCE_ID,
          destinationLocationId: DEST_ID,
        },
        lines: [
          {
            id: 'line-001',
            tenantId: TENANT_ID,
            issueId: 'issue-001',
            itemId: ITEM_ID,
            requestedQty: '3.00',
            dispatchedQty: null,
            lotId: null,
            serializedAssetId: ASSET_A,
            condition: StockBalanceCondition.NEW,
          },
        ],
        serials: [ASSET_A, ASSET_B, ASSET_C].map((assetId) =>
          buildSerialRow('line-001', assetId, StockIssueStatus.REQUESTED),
        ),
      });
      runWithManager(manager);

      const cancelled = await createService(balanceService).cancel('issue-001', actor);

      expect(cancelled.status).toBe(StockIssueStatus.CANCELLED);
      expect(balanceService.applyDeltaWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reservedDelta: -3, delta: 0 }),
      );
      expect(mirrorQb.set).toHaveBeenCalledWith({
        issueStatus: StockIssueStatus.CANCELLED,
        updatedAt: expect.any(Date),
      });
      expect(mirrorQb.where).toHaveBeenCalledWith('issue_id = :issueId', { issueId: 'issue-001' });
      // M1: el UPDATE espejo filtra por tenant (defensa en profundidad).
      expect(mirrorQb.andWhere).toHaveBeenCalledWith('tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
    });
  });

  describe('update de borrador', () => {
    it('el reemplazo que reusa seriales de la misma salida no auto-colisiona', async () => {
      const issue = {
        id: 'issue-001',
        tenantId: TENANT_ID,
        type: StockIssueType.TECHNICIAN_CUSTODY,
        status: StockIssueStatus.REQUESTED,
        sourceLocationId: SOURCE_ID,
        destinationLocationId: DEST_ID,
      };
      const previousLine = {
        id: 'line-old-1',
        tenantId: TENANT_ID,
        issueId: 'issue-001',
        itemId: ITEM_ID,
        requestedQty: '2.00',
        dispatchedQty: null,
        lotId: null,
        serializedAssetId: ASSET_A,
        condition: StockBalanceCondition.NEW,
      };
      const { manager, committedQb } = buildManager({
        issue,
        lines: [previousLine],
        serials: [
          buildSerialRow('line-old-1', ASSET_A, StockIssueStatus.REQUESTED),
          buildSerialRow('line-old-1', ASSET_B, StockIssueStatus.REQUESTED),
        ],
        assets: [buildAsset(ASSET_A, 'SN-0001'), buildAsset(ASSET_B, 'SN-0002')],
      });
      runWithManager(manager);

      const updated = await createService().update(
        'issue-001',
        {
          lines: [
            {
              itemId: ITEM_ID,
              requestedQty: 2,
              serializedAssetIds: [ASSET_A, ASSET_B],
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      );

      // Sin auto-colisión: el update terminó y reinsertó la hija.
      expect(updated.lines).toHaveLength(1);
      expect(manager.delete).toHaveBeenCalled();

      // La hija reinsertada nace con la espejo del estado actual de la cabecera.
      const serialSave = (manager.save as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as { name?: string })?.name === 'StockIssueLineSerial',
      );
      const rows = serialSave?.[1] as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(
        expect.objectContaining({
          serializedAssetId: ASSET_A,
          issueStatus: StockIssueStatus.REQUESTED,
        }),
      );

      // El pre-chequeo excluyó la propia salida.
      const excludeCall = committedQb.andWhere.mock.calls.find((call: unknown[]) =>
        String(call[0]).includes('issue_id !='),
      );
      expect(excludeCall?.[1]).toEqual({ excludeSerialIssueId: 'issue-001' });
    });

    it('libera por el grupo previo y reserva por el grupo nuevo al reemplazar líneas', async () => {
      const issue = {
        id: 'issue-001',
        tenantId: TENANT_ID,
        type: StockIssueType.TECHNICIAN_CUSTODY,
        status: StockIssueStatus.REQUESTED,
        sourceLocationId: SOURCE_ID,
        destinationLocationId: DEST_ID,
      };
      const previousLine = {
        id: 'line-old-1',
        tenantId: TENANT_ID,
        issueId: 'issue-001',
        itemId: ITEM_ID,
        requestedQty: '2.00',
        dispatchedQty: null,
        lotId: null,
        serializedAssetId: ASSET_A,
        condition: StockBalanceCondition.NEW,
      };
      const { manager } = buildManager({
        issue,
        lines: [previousLine],
        serials: [
          buildSerialRow('line-old-1', ASSET_A, StockIssueStatus.REQUESTED),
          buildSerialRow('line-old-1', ASSET_B, StockIssueStatus.REQUESTED),
        ],
        assets: [buildAsset(ASSET_A, 'SN-0001'), buildAsset(ASSET_B, 'SN-0002')],
      });
      runWithManager(manager);
      const balanceService = {
        getAvailabilityWithManager: jest
          .fn()
          .mockResolvedValue({ onHand: 10, reserved: 2, available: 8 }),
        applyDeltaWithManager: jest.fn().mockResolvedValue({}),
      };

      await createService(balanceService).update(
        'issue-001',
        {
          lines: [
            {
              itemId: ITEM_ID,
              requestedQty: 2,
              serializedAssetIds: [ASSET_A, ASSET_B],
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      );

      const deltas = (balanceService.applyDeltaWithManager as jest.Mock).mock.calls.map(
        (call: unknown[]) => (call[1] as { reservedDelta: number }).reservedDelta,
      );
      // Libera el grupo previo (-2) y reserva el grupo nuevo (+2).
      expect(deltas).toEqual([-2, 2]);
    });
  });

  describe('getById (B5)', () => {
    it('devuelve cada línea con serializedAssets (id + número de serie legible)', async () => {
      const { manager } = buildManager({
        issue: {
          id: 'issue-001',
          tenantId: TENANT_ID,
          type: StockIssueType.TECHNICIAN_CUSTODY,
          status: StockIssueStatus.REQUESTED,
          sourceLocationId: SOURCE_ID,
          destinationLocationId: DEST_ID,
        },
        lines: [
          {
            id: 'line-serial',
            tenantId: TENANT_ID,
            issueId: 'issue-001',
            itemId: ITEM_ID,
            requestedQty: '2.00',
            dispatchedQty: null,
            lotId: null,
            serializedAssetId: ASSET_A,
            condition: StockBalanceCondition.NEW,
          },
          {
            id: 'line-consumible',
            tenantId: TENANT_ID,
            issueId: 'issue-001',
            itemId: '44444444-4444-4333-8333-444444444444',
            requestedQty: '5.00',
            dispatchedQty: null,
            lotId: null,
            serializedAssetId: null,
            condition: StockBalanceCondition.NEW,
          },
        ],
        serials: [
          buildSerialRow('line-serial', ASSET_A, StockIssueStatus.REQUESTED),
          buildSerialRow('line-serial', ASSET_B, StockIssueStatus.REQUESTED),
        ],
        assets: [buildAsset(ASSET_A, 'SN-0001'), buildAsset(ASSET_B, 'SN-0002')],
      });
      runWithManager(manager);

      const detail = await createService().getById('issue-001');

      expect(detail.lines[0]?.serializedAssets).toEqual([
        { id: ASSET_A, serialNumber: 'SN-0001' },
        { id: ASSET_B, serialNumber: 'SN-0002' },
      ]);
      // Línea no serializada: arreglo vacío, nunca undefined.
      expect(detail.lines[1]?.serializedAssets).toEqual([]);
    });
  });

  describe('aislamiento multi-tenant de la tabla nueva', () => {
    it('toda consulta a stock_issue_line_serials filtra por el tenant autenticado', async () => {
      const { manager, committedQb } = buildManager({
        issue: {
          id: 'issue-001',
          tenantId: TENANT_ID,
          type: StockIssueType.TECHNICIAN_CUSTODY,
          status: StockIssueStatus.REQUESTED,
          sourceLocationId: SOURCE_ID,
          destinationLocationId: DEST_ID,
        },
        lines: [
          {
            id: 'line-001',
            tenantId: TENANT_ID,
            issueId: 'issue-001',
            itemId: ITEM_ID,
            requestedQty: '1.00',
            dispatchedQty: null,
            lotId: null,
            serializedAssetId: ASSET_A,
            condition: StockBalanceCondition.NEW,
          },
        ],
        serials: [buildSerialRow('line-001', ASSET_A, StockIssueStatus.REQUESTED)],
        assets: [buildAsset(ASSET_A, 'SN-0001')],
      });
      runWithManager(manager);

      await createService().getById('issue-001');
      await createService().update(
        'issue-001',
        {
          lines: [
            {
              itemId: ITEM_ID,
              requestedQty: 1,
              serializedAssetIds: [ASSET_A],
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      );

      // Las rutas de lectura y de pre-chequeo siempre acotan por tenant_id.
      expect(committedQb.where).toHaveBeenCalledWith('serial.tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
      const findCalls = (manager.find as jest.Mock).mock.calls.filter(
        (call: unknown[]) => (call[0] as { name?: string })?.name === 'StockIssueLineSerial',
      );
      expect(findCalls.length).toBeGreaterThan(0);
      for (const call of findCalls) {
        expect((call[1] as { where: { tenantId: string } }).where.tenantId).toBe(TENANT_ID);
      }
    });
  });
});
