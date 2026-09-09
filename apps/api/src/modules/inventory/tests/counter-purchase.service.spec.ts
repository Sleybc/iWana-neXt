import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AssetLifecycleEventType,
  InventoryTrackingMode,
  JurisdictionLevel,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockMovementOrigin,
  TaxCategory,
  TaxContext,
  TaxOrigin,
  TaxTreatment,
  UserRole,
} from '@iwana/shared';
import {
  InventoryItem,
  StockLocation,
  StockLot,
  StockMovement,
  StockMovementLine,
  StockMovementTax,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { CreateCounterPurchaseInput } from '../dto';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  StockLocation: class StockLocation {},
  StockLot: class StockLot {},
  StockMovement: class StockMovement {},
  StockMovementLine: class StockMovementLine {},
  StockMovementTax: class StockMovementTax {},
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

const PARTY_REF_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_CONSUMABLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_SERIALIZED_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('CounterPurchaseService', () => {
  const inventoryCostingServiceMock = {
    applyReceiptCostingWithManager: jest.fn().mockResolvedValue(undefined),
  };
  const domainEventPublisherMock = {
    captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
    publishAfterCommittedMovement: jest.fn(),
  };
  const taxCatalogPortMock = {
    listByContext: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    domainEventPublisherMock.captureItemSnapshots.mockResolvedValue(new Map());
    taxCatalogPortMock.listByContext.mockResolvedValue([]);
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  function buildManager(options?: {
    item?: Partial<InventoryItem> | null;
    location?: Partial<StockLocation> | null;
    existingMovement?: { id: string; idempotencyKey: string } | null;
  }) {
    const item =
      options?.item === null
        ? null
        : {
            id: ITEM_CONSUMABLE_ID,
            tenantId: 'tenant-001',
            trackingMode: InventoryTrackingMode.CONSUMABLE,
            usefulLifeMonths: null,
            ...(options?.item ?? {}),
          };

    const location =
      options?.location === null
        ? null
        : {
            id: LOCATION_ID,
            tenantId: 'tenant-001',
            ...(options?.location ?? {}),
          };
    const existingMovement = options?.existingMovement ?? null;

    const save = jest.fn().mockImplementation(async (_entity, payload) => ({
      id: 'lot-001',
      ...payload,
    }));

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, query) => {
        if (entity === StockMovement) {
          return query.where.idempotencyKey === existingMovement?.idempotencyKey
            ? existingMovement
            : null;
        }

        if (entity === StockLocation) {
          return query.where.id === location?.id ? location : null;
        }

        if (entity === InventoryItem) {
          return query.where.id === item?.id ? item : null;
        }

        return null;
      }),
      find: jest.fn().mockImplementation(async (entity, query) => {
        if (entity === StockMovementLine) {
          return query.where.movementId === existingMovement?.id
            ? [{ id: 'existing-line-001', movementId: query.where.movementId }]
            : [];
        }

        return [];
      }),
      create: jest.fn((_entity, payload) => payload),
      save,
    };

    return { manager, save };
  }

  it('registers a non-serialized counter purchase through the ledger', async () => {
    const { manager } = buildManager();
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: {
          id: 'mov-001',
          movementNumber: 'MOV-000010',
          origin: StockMovementOrigin.COUNTER_PURCHASE,
        },
        lines: [{ id: 'line-001', quantity: '5.00' }],
        created: true,
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
      domainEventPublisherMock as never,
      taxCatalogPortMock as never,
    );

    const result = await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-12345',
        destinationLocationId: LOCATION_ID,
        lines: [
          {
            itemId: ITEM_CONSUMABLE_ID,
            quantityReceived: 5,
            unitCost: 1200,
            condition: StockBalanceCondition.NEW,
            serialNumbers: [],
          },
        ],
      },
      actor,
    );

    expect(result.movement.movementNumber).toBe('MOV-000010');
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({
        origin: StockMovementOrigin.COUNTER_PURCHASE,
        originContext: 'inventory.counter-purchase',
        originRefId: PARTY_REF_ID,
        idempotencyKey: expect.stringMatching(
          new RegExp(`^counter-purchase:${PARTY_REF_ID}:FAC-12345:[a-f0-9]{16}$`),
        ),
        lines: [expect.objectContaining({ quantity: 5, unitCost: 1200 })],
      }),
      actor,
    );
    expect(inventoryCostingServiceMock.applyReceiptCostingWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      [expect.objectContaining({ itemId: ITEM_CONSUMABLE_ID, unitCost: 1200, quantity: 5 })],
    );
  });

  it('returns an existing movement before creating lots or assets on idempotent retry', async () => {
    const idempotencyKey = 'counter-purchase:retry-key';
    const { manager, save } = buildManager({
      existingMovement: { id: 'mov-existing-001', idempotencyKey },
    });
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn(),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
      domainEventPublisherMock as never,
      taxCatalogPortMock as never,
    );

    const result = await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-RETRY',
        destinationLocationId: LOCATION_ID,
        idempotencyKey,
        lines: [
          {
            itemId: ITEM_CONSUMABLE_ID,
            quantityReceived: 1,
            unitCost: 100,
            serialNumbers: [],
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(result.movement.id).toBe('mov-existing-001');
    expect(result.lines).toEqual([{ id: 'existing-line-001', movementId: 'mov-existing-001' }]);
    expect(save).not.toHaveBeenCalled();
    expect(serializedAssetServiceMock.createReceivedAssetWithManager).not.toHaveBeenCalled();
    expect(stockLedgerServiceMock.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('creates serialized assets and transitions them to AVAILABLE', async () => {
    const { manager } = buildManager({
      item: {
        id: ITEM_SERIALIZED_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        usefulLifeMonths: 36,
      },
    });

    manager.findOne = jest.fn().mockImplementation(async (entity, query) => {
      if (entity === StockLocation) {
        return { id: LOCATION_ID, tenantId: 'tenant-001' };
      }

      if (entity === InventoryItem && query.where.id === ITEM_SERIALIZED_ID) {
        return {
          id: ITEM_SERIALIZED_ID,
          tenantId: 'tenant-001',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          usefulLifeMonths: 36,
        };
      }

      return null;
    });

    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-002', movementNumber: 'MOV-000011' },
        lines: [{ id: 'line-002' }, { id: 'line-003' }],
        created: true,
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest
        .fn()
        .mockResolvedValueOnce({ id: 'asset-001' })
        .mockResolvedValueOnce({ id: 'asset-002' }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
      domainEventPublisherMock as never,
      taxCatalogPortMock as never,
    );

    await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-SER-01',
        destinationLocationId: LOCATION_ID,
        lines: [
          {
            itemId: ITEM_SERIALIZED_ID,
            quantityReceived: 2,
            unitCost: 350000,
            serialNumbers: ['SN-001', 'SN-002'],
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(serializedAssetServiceMock.createReceivedAssetWithManager).toHaveBeenCalledTimes(2);
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({
        assetTransitions: expect.arrayContaining([
          expect.objectContaining({
            serializedAssetId: 'asset-001',
            toStatus: SerializedAssetStatus.AVAILABLE,
            eventType: AssetLifecycleEventType.RECEIVED,
          }),
        ]),
      }),
      actor,
    );
  });

  it('deduplicates repeated submissions through idempotency key', async () => {
    const { manager } = buildManager();
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-003', movementNumber: 'MOV-000012' },
        lines: [{ id: 'line-004' }],
        created: true,
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
      domainEventPublisherMock as never,
      taxCatalogPortMock as never,
    );

    const payload: CreateCounterPurchaseInput = {
      partyRefId: PARTY_REF_ID,
      invoiceNumber: 'FAC-IDEM',
      destinationLocationId: LOCATION_ID,
      idempotencyKey: 'counter-purchase:manual-key',
      lines: [
        {
          itemId: ITEM_CONSUMABLE_ID,
          quantityReceived: 1,
          unitCost: 100,
          serialNumbers: [],
          condition: StockBalanceCondition.NEW,
        },
      ],
    };

    await service.record(payload, actor);
    await service.record(payload, actor);

    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledTimes(2);
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenNthCalledWith(
      1,
      manager,
      'tenant-001',
      expect.objectContaining({ idempotencyKey: 'counter-purchase:manual-key' }),
      actor,
    );
  });

  it('adquiere lock transaccional por idempotencyKey antes de crear lotes', async () => {
    const { manager } = buildManager();
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-001', movementNumber: 'MOV-000010' },
        lines: [],
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      { normalizeSerial: jest.fn(), createReceivedAssetWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
      domainEventPublisherMock as never,
      taxCatalogPortMock as never,
    );

    await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-LOCK',
        destinationLocationId: LOCATION_ID,
        idempotencyKey: 'counter-purchase:lock-key',
        lines: [
          {
            itemId: ITEM_CONSUMABLE_ID,
            quantityReceived: 1,
            unitCost: 10,
            serialNumbers: [],
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      'counter-purchase:lock-key',
    ]);
  });

  it('rejects counter purchase without destination location', async () => {
    const { manager } = buildManager({ location: null });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      {} as never,
      {} as never,
      inventoryCostingServiceMock as never,
      domainEventPublisherMock as never,
      taxCatalogPortMock as never,
    );

    await expect(
      service.record(
        {
          partyRefId: PARTY_REF_ID,
          invoiceNumber: 'FAC-404',
          destinationLocationId: LOCATION_ID,
          lines: [
            {
              itemId: ITEM_CONSUMABLE_ID,
              quantityReceived: 1,
              unitCost: 10,
              serialNumbers: [],
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects serialized lines when serial count differs from quantity', async () => {
    const { manager } = buildManager({
      item: {
        id: ITEM_SERIALIZED_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
      },
    });

    manager.findOne = jest.fn().mockImplementation(async (entity, query) => {
      if (entity === StockLocation) {
        return { id: LOCATION_ID, tenantId: 'tenant-001' };
      }

      if (entity === InventoryItem) {
        return {
          id: ITEM_SERIALIZED_ID,
          tenantId: 'tenant-001',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          usefulLifeMonths: null,
        };
      }

      return null;
    });

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      {} as never,
      {} as never,
      inventoryCostingServiceMock as never,
      domainEventPublisherMock as never,
      taxCatalogPortMock as never,
    );

    await expect(
      service.record(
        {
          partyRefId: PARTY_REF_ID,
          invoiceNumber: 'FAC-SER-BAD',
          destinationLocationId: LOCATION_ID,
          lines: [
            {
              itemId: ITEM_SERIALIZED_ID,
              quantityReceived: 2,
              unitCost: 100,
              serialNumbers: ['SN-ONLY-ONE'],
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('tributos informativos de cabecera (Fase 26)', () => {
    function catalogEntry(overrides: Record<string, unknown>) {
      return {
        id: 'tax-001',
        code: 'IVA_19',
        name: 'IVA 19%',
        category: TaxCategory.VAT,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        municipalityCode: null,
        baseRate: '19.0000',
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.PURCHASE,
        origin: TaxOrigin.SYSTEM,
        isActive: true,
        notes: null,
        ...overrides,
      };
    }

    const ivaCatalog = [catalogEntry({})];
    const ivaReteIvaCatalog = [
      catalogEntry({}),
      catalogEntry({
        id: 'tax-002',
        code: 'RETE_IVA',
        name: 'Rete IVA',
        category: TaxCategory.WITHHOLDING,
        baseRate: '15.0000',
      }),
    ];

    function buildTaxService(catalog: unknown[]) {
      taxCatalogPortMock.listByContext.mockResolvedValue(catalog);
      return new CounterPurchaseService(
        {} as DataSource,
        {
          recordMovementWithManager: jest.fn().mockResolvedValue({
            movement: { id: 'mov-tax-001', movementNumber: 'MOV-000020' },
            lines: [{ id: 'line-tax-001' }],
            created: true,
          }),
        } as never,
        {
          normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
          createReceivedAssetWithManager: jest.fn(),
        } as never,
        inventoryCostingServiceMock as never,
        domainEventPublisherMock as never,
        taxCatalogPortMock as never,
      );
    }

    function baseInput(
      overrides: Partial<CreateCounterPurchaseInput> = {},
    ): CreateCounterPurchaseInput {
      return {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-TAX-01',
        destinationLocationId: LOCATION_ID,
        lines: [
          {
            itemId: ITEM_CONSUMABLE_ID,
            quantityReceived: 5,
            unitCost: 1200,
            serialNumbers: [],
            condition: StockBalanceCondition.NEW,
          },
        ],
        ...overrides,
      };
    }

    it('sin taxes responde retrocompatible: taxes [] y payableAmount = base', async () => {
      const { manager } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService([]);

      const result = await service.record(baseInput(), actor);

      expect(result.taxes).toEqual([]);
      expect(result.payableAmount).toBe('6000.00');
    });

    it('con IVA 19 calcula snapshot y neto estimado', async () => {
      const { manager, save } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService(ivaCatalog);

      const result = await service.record(
        baseInput({
          invoiceNumber: 'FAC-TAX-02',
          lines: [
            {
              itemId: ITEM_CONSUMABLE_ID,
              quantityReceived: 1,
              unitCost: 100,
              serialNumbers: [],
              condition: StockBalanceCondition.NEW,
            },
          ],
          taxes: [{ code: 'IVA_19', applies: true }],
        }),
        actor,
      );

      expect(result.taxes).toEqual([
        expect.objectContaining({
          code: 'IVA_19',
          effect: 'ADD',
          applies: true,
          rate: '19.0000',
          baseAmount: '100.00',
          taxAmount: '19.00',
        }),
      ]);
      expect(result.payableAmount).toBe('119.00');
      const persisted = save.mock.calls.filter(([entity]) => entity === StockMovementTax);
      expect(persisted).toHaveLength(1);
      expect(inventoryCostingServiceMock.applyReceiptCostingWithManager).toHaveBeenCalledWith(
        manager,
        'tenant-001',
        [expect.objectContaining({ itemId: ITEM_CONSUMABLE_ID, unitCost: 100, quantity: 1 })],
      );
    });

    it('RETE_IVA calcula sobre el monto de IVA', async () => {
      const { manager } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService(ivaReteIvaCatalog);

      const result = await service.record(
        baseInput({
          invoiceNumber: 'FAC-TAX-03',
          lines: [
            {
              itemId: ITEM_CONSUMABLE_ID,
              quantityReceived: 1,
              unitCost: 100,
              serialNumbers: [],
              condition: StockBalanceCondition.NEW,
            },
          ],
          taxes: [
            { code: 'IVA_19', applies: true },
            { code: 'RETE_IVA', applies: true },
          ],
        }),
        actor,
      );

      const reteIva = result.taxes.find((tax) => tax.code === 'RETE_IVA');
      expect(reteIva).toEqual(
        expect.objectContaining({ baseAmount: '19.00', taxAmount: '2.85', effect: 'WITHHOLD' }),
      );
      expect(result.payableAmount).toBe('116.15');
    });

    it('RETE_IVA sin IVA aplicable liquida en cero', async () => {
      const { manager } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService(ivaReteIvaCatalog);

      const result = await service.record(
        baseInput({
          invoiceNumber: 'FAC-TAX-04',
          lines: [
            {
              itemId: ITEM_CONSUMABLE_ID,
              quantityReceived: 1,
              unitCost: 100,
              serialNumbers: [],
              condition: StockBalanceCondition.NEW,
            },
          ],
          taxes: [
            { code: 'IVA_19', applies: false },
            { code: 'RETE_IVA', applies: true },
          ],
        }),
        actor,
      );

      expect(result.taxes).toHaveLength(1);
      expect(result.taxes[0]).toEqual(
        expect.objectContaining({ code: 'RETE_IVA', baseAmount: '0.00', taxAmount: '0.00' }),
      );
      expect(result.payableAmount).toBe('100.00');
    });

    it('rechaza códigos de tributo duplicados', async () => {
      const { manager } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService(ivaCatalog);

      await expect(
        service.record(
          baseInput({
            taxes: [
              { code: 'IVA_19', applies: true },
              { code: 'IVA_19', applies: false },
            ],
          }),
          actor,
        ),
      ).rejects.toThrow('Hay códigos de tributo duplicados en la cotización.');
    });

    it('rechaza tributo inactivo o fuera del contexto de compra', async () => {
      const { manager } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService([catalogEntry({ isActive: false })]);

      await expect(
        service.record(baseInput({ taxes: [{ code: 'IVA_19', applies: true }] }), actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza tributo de contexto de ventas en compra de mostrador', async () => {
      const { manager } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService([catalogEntry({ context: TaxContext.SALES })]);

      await expect(
        service.record(baseInput({ taxes: [{ code: 'IVA_19', applies: true }] }), actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza tasa fuera de 0–100', async () => {
      const { manager } = buildManager();
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService(ivaCatalog);

      await expect(
        service.record(baseInput({ taxes: [{ code: 'IVA_19', applies: true, rate: 101 }] }), actor),
      ).rejects.toThrow();
    });

    it('el replay idempotente devuelve taxes y payableAmount del movimiento existente', async () => {
      const idempotencyKey = 'counter-purchase:tax-replay';
      const { manager, save } = buildManager({
        existingMovement: { id: 'mov-existing-tax', idempotencyKey },
      });
      manager.find = jest.fn().mockImplementation(async (entity, query) => {
        if (entity === StockMovementLine && query.where.movementId === 'mov-existing-tax') {
          return [{ id: 'line-001', quantity: '1.00', unitCost: '100.00' }];
        }
        if (entity === StockMovementTax && query.where.stockMovementId === 'mov-existing-tax') {
          return [
            {
              id: 'tax-row-001',
              taxCode: 'IVA_19',
              taxCategory: 'VAT',
              effect: 'ADD',
              rate: '19.0000',
              baseAmount: '100.00',
              taxAmount: '19.00',
            },
          ];
        }
        return [];
      });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      const service = buildTaxService(ivaCatalog);

      const result = await service.record(
        baseInput({
          invoiceNumber: 'FAC-TAX-REPLAY',
          idempotencyKey,
          lines: [
            {
              itemId: ITEM_CONSUMABLE_ID,
              quantityReceived: 1,
              unitCost: 100,
              serialNumbers: [],
              condition: StockBalanceCondition.NEW,
            },
          ],
        }),
        actor,
      );

      expect(result.movement.id).toBe('mov-existing-tax');
      expect(result.taxes).toEqual([
        expect.objectContaining({ code: 'IVA_19', taxAmount: '19.00', applies: true }),
      ]);
      expect(result.payableAmount).toBe('119.00');
      expect(save).not.toHaveBeenCalled();
    });

    it('ingresos idénticos con tributos distintos no colisionan en la clave derivada', async () => {
      const { manager } = buildManager();
      const seenKeys: string[] = [];
      const stockLedgerServiceMock = {
        recordMovementWithManager: jest.fn().mockImplementation(async (_m, _t, payload) => {
          seenKeys.push(payload.idempotencyKey);
          return {
            movement: { id: `mov-${seenKeys.length}`, movementNumber: `MOV-${seenKeys.length}` },
            lines: [{ id: `line-${seenKeys.length}` }],
            created: true,
          };
        }),
      };
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
        work({ manager }),
      );
      taxCatalogPortMock.listByContext.mockResolvedValue(ivaCatalog);
      const service = new CounterPurchaseService(
        {} as DataSource,
        stockLedgerServiceMock as never,
        {
          normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
          createReceivedAssetWithManager: jest.fn(),
        } as never,
        inventoryCostingServiceMock as never,
        domainEventPublisherMock as never,
        taxCatalogPortMock as never,
      );

      const lines: CreateCounterPurchaseInput['lines'] = [
        {
          itemId: ITEM_CONSUMABLE_ID,
          quantityReceived: 1,
          unitCost: 100,
          serialNumbers: [],
          condition: StockBalanceCondition.NEW,
        },
      ];
      await service.record(
        baseInput({
          invoiceNumber: 'FAC-TAX-HASH',
          lines,
          taxes: [{ code: 'IVA_19', applies: true }],
        }),
        actor,
      );
      await service.record(
        baseInput({
          invoiceNumber: 'FAC-TAX-HASH',
          lines,
          taxes: [{ code: 'IVA_19', applies: false }],
        }),
        actor,
      );

      expect(seenKeys).toHaveLength(2);
      expect(seenKeys[0]).not.toBe(seenKeys[1]);
    });
  });
});
