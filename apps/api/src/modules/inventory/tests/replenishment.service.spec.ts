import { DataSource } from 'typeorm';
import {
  InventoryItemStatus,
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestLineStatus,
} from '@iwana/shared';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { ReplenishmentService } from '../services/replenishment.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  StockBalance: class StockBalance {},
  PurchaseOrder: class PurchaseOrder {},
  PurchaseOrderLine: class PurchaseOrderLine {},
  PurchaseRequestLine: class PurchaseRequestLine {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import {
  InventoryItem,
  PurchaseOrderLine,
  PurchaseRequestLine,
  StockBalance,
  runInTenantSchema,
} from '@iwana/db';

function buildItem(
  overrides: Partial<{
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    purchasable: boolean;
    status: InventoryItemStatus;
    minimumStock: string;
    reorderPoint: string;
    targetStock: string;
    minimumOrderQty: string | null;
    orderMultiple: string | null;
    leadTimeDays: number | null;
    preferredSupplierRefId: string | null;
    lastPurchaseCost: string | null;
    standardCost: string;
    baseCost: string;
  }> = {},
) {
  return {
    id: 'item-001',
    sku: 'CAB-UTP',
    name: 'Cable UTP',
    unitOfMeasure: 'metro',
    purchasable: true,
    status: InventoryItemStatus.ACTIVE,
    minimumStock: '5.00',
    reorderPoint: '20.00',
    targetStock: '50.00',
    minimumOrderQty: null,
    orderMultiple: null,
    leadTimeDays: 7,
    preferredSupplierRefId: null,
    lastPurchaseCost: '10.00',
    standardCost: '8.00',
    baseCost: '5.00',
    ...overrides,
  };
}

describe('ReplenishmentService', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  let supplierPartyPort: jest.Mocked<Pick<SupplierPartyPort, 'getSupplierSummariesBatch'>>;
  let service: ReplenishmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    supplierPartyPort = {
      getSupplierSummariesBatch: jest.fn().mockResolvedValue(new Map()),
    };
    service = new ReplenishmentService(
      {} as DataSource,
      supplierPartyPort as unknown as SupplierPartyPort,
    );
  });

  function mockTenantData(input: {
    items?: ReturnType<typeof buildItem>[];
    balances?: Array<{
      itemId: string;
      quantityOnHand: string;
      quantityReserved: string;
    }>;
    poLines?: Array<{
      itemId: string;
      quantity: string;
      receivedQuantity: string;
    }>;
    requestLines?: Array<{
      inventoryItemId: string;
      quantityRequested: string;
      lineStatus: PurchaseRequestLineStatus;
    }>;
  }) {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(input.poLines ?? []),
    };

    const manager = {
      find: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === InventoryItem) {
          return Promise.resolve(input.items ?? []);
        }

        if (entity === StockBalance) {
          return Promise.resolve(input.balances ?? []);
        }

        if (entity === PurchaseRequestLine) {
          return Promise.resolve(input.requestLines ?? []);
        }

        return Promise.resolve([]);
      }),
      createQueryBuilder: jest.fn().mockImplementation((entity: unknown) => {
        expect(entity).toBe(PurchaseOrderLine);
        return qb;
      }),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    return { qb, manager };
  }

  it('dispara sugerencia cuando disponible + pendiente < reorderPoint', async () => {
    mockTenantData({
      items: [buildItem({ reorderPoint: '20.00', targetStock: '50.00' })],
      balances: [{ itemId: 'item-001', quantityOnHand: '8.00', quantityReserved: '2.00' }],
    });

    const result = await service.listSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      itemId: 'item-001',
      available: '6.00',
      pendingPurchase: '0.00',
      suggestedQty: '44.00',
      criticality: 'below-reorder',
      estimatedUnitCost: '10.00',
      estimatedLineValue: '440.00',
    });
  });

  it('marca below-minimum cuando disponible está bajo el mínimo', async () => {
    mockTenantData({
      items: [
        buildItem({
          reorderPoint: '20.00',
          targetStock: '50.00',
          minimumStock: '10.00',
        }),
      ],
      balances: [{ itemId: 'item-001', quantityOnHand: '8.00', quantityReserved: '2.00' }],
    });

    const result = await service.listSuggestions();

    expect(result[0]?.criticality).toBe('below-minimum');
  });

  it('anti doble pedido: OC abierta que cubre el faltante excluye el ítem', async () => {
    mockTenantData({
      items: [buildItem({ reorderPoint: '20.00', targetStock: '50.00' })],
      balances: [{ itemId: 'item-001', quantityOnHand: '5.00', quantityReserved: '0.00' }],
      poLines: [{ itemId: 'item-001', quantity: '20.00', receivedQuantity: '5.00' }],
    });

    const result = await service.listSuggestions();

    expect(result).toHaveLength(0);
  });

  it('anti doble pedido: líneas de solicitud OPEN/PENDING_QUOTE/AWARDED suman pendiente', async () => {
    mockTenantData({
      items: [buildItem({ reorderPoint: '20.00', targetStock: '40.00' })],
      balances: [{ itemId: 'item-001', quantityOnHand: '5.00', quantityReserved: '0.00' }],
      requestLines: [
        {
          inventoryItemId: 'item-001',
          quantityRequested: '10.00',
          lineStatus: PurchaseRequestLineStatus.OPEN,
        },
        {
          inventoryItemId: 'item-001',
          quantityRequested: '3.00',
          lineStatus: PurchaseRequestLineStatus.PENDING_QUOTE,
        },
      ],
    });

    const result = await service.listSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      available: '5.00',
      pendingPurchase: '13.00',
      suggestedQty: '22.00',
    });
  });

  it('aplica piso MOQ cuando el faltante a target es menor', async () => {
    mockTenantData({
      items: [
        buildItem({
          reorderPoint: '30.00',
          targetStock: '32.00',
          minimumOrderQty: '25.00',
        }),
      ],
      balances: [{ itemId: 'item-001', quantityOnHand: '10.00', quantityReserved: '0.00' }],
    });

    const result = await service.listSuggestions();

    expect(result[0]?.suggestedQty).toBe('25.00');
  });

  it('redondea hacia arriba al orderMultiple', async () => {
    mockTenantData({
      items: [
        buildItem({
          reorderPoint: '20.00',
          targetStock: '45.00',
          orderMultiple: '10.00',
        }),
      ],
      balances: [{ itemId: 'item-001', quantityOnHand: '5.00', quantityReserved: '0.00' }],
    });

    const result = await service.listSuggestions();

    // max(45-5, 0) = 40 ya múltiplo; caso no múltiplo:
    expect(result[0]?.suggestedQty).toBe('40.00');

    mockTenantData({
      items: [
        buildItem({
          reorderPoint: '20.00',
          targetStock: '48.00',
          orderMultiple: '10.00',
        }),
      ],
      balances: [{ itemId: 'item-001', quantityOnHand: '5.00', quantityReserved: '0.00' }],
    });

    const rounded = await service.listSuggestions();
    // max(48-5, 0) = 43 → ceil to 50
    expect(rounded[0]?.suggestedQty).toBe('50.00');
  });

  it('usa fallback de costo D-F2-4 y nullifica label si efectivo es 0', async () => {
    mockTenantData({
      items: [
        buildItem({
          lastPurchaseCost: null,
          standardCost: '0.00',
          baseCost: '0.00',
          reorderPoint: '10.00',
          targetStock: '20.00',
        }),
      ],
      balances: [{ itemId: 'item-001', quantityOnHand: '0.00', quantityReserved: '0.00' }],
    });

    const zeroCost = await service.listSuggestions();
    expect(zeroCost[0]).toMatchObject({
      estimatedUnitCost: null,
      estimatedLineValue: null,
      criticality: 'out',
    });

    mockTenantData({
      items: [
        buildItem({
          lastPurchaseCost: null,
          standardCost: '12.50',
          baseCost: '1.00',
          reorderPoint: '10.00',
          targetStock: '20.00',
        }),
      ],
      balances: [{ itemId: 'item-001', quantityOnHand: '0.00', quantityReserved: '0.00' }],
    });

    const standardFallback = await service.listSuggestions();
    expect(standardFallback[0]).toMatchObject({
      estimatedUnitCost: '12.50',
      estimatedLineValue: '250.00',
    });
  });

  it('resuelve proveedor preferido en batch sin N+1', async () => {
    mockTenantData({
      items: [
        buildItem({
          id: 'item-001',
          preferredSupplierRefId: 'party-001',
          reorderPoint: '10.00',
          targetStock: '20.00',
        }),
        buildItem({
          id: 'item-002',
          sku: 'ONU-01',
          name: 'ONU',
          preferredSupplierRefId: 'party-001',
          reorderPoint: '5.00',
          targetStock: '10.00',
          minimumStock: '2.00',
        }),
      ],
      balances: [
        { itemId: 'item-001', quantityOnHand: '0.00', quantityReserved: '0.00' },
        { itemId: 'item-002', quantityOnHand: '1.00', quantityReserved: '0.00' },
      ],
    });

    supplierPartyPort.getSupplierSummariesBatch.mockResolvedValue(
      new Map([
        [
          'party-001',
          {
            partyRefId: 'party-001',
            displayName: 'Proveedor Fibra',
            primaryContact: null,
            phone: null,
            email: null,
            city: null,
            status: PartyStatus.ACTIVE,
          },
        ],
      ]),
    );

    const result = await service.listSuggestions();

    expect(supplierPartyPort.getSupplierSummariesBatch).toHaveBeenCalledTimes(1);
    expect(supplierPartyPort.getSupplierSummariesBatch).toHaveBeenCalledWith(['party-001']);
    expect(result.every((row) => row.preferredSupplier?.displayName === 'Proveedor Fibra')).toBe(
      true,
    );
  });

  it('ordena por criticidad out → below-minimum → below-reorder y menor cobertura', async () => {
    mockTenantData({
      items: [
        buildItem({
          id: 'item-reorder',
          sku: 'A',
          name: 'Bajo reorden',
          minimumStock: '2.00',
          reorderPoint: '20.00',
          targetStock: '40.00',
        }),
        buildItem({
          id: 'item-out',
          sku: 'B',
          name: 'Agotado',
          minimumStock: '5.00',
          reorderPoint: '10.00',
          targetStock: '20.00',
        }),
        buildItem({
          id: 'item-min',
          sku: 'C',
          name: 'Bajo minimo',
          minimumStock: '10.00',
          reorderPoint: '30.00',
          targetStock: '50.00',
        }),
        buildItem({
          id: 'item-out-worse',
          sku: 'D',
          name: 'Agotado peor cobertura',
          minimumStock: '5.00',
          reorderPoint: '100.00',
          targetStock: '120.00',
        }),
      ],
      balances: [
        { itemId: 'item-reorder', quantityOnHand: '15.00', quantityReserved: '0.00' },
        { itemId: 'item-out', quantityOnHand: '0.00', quantityReserved: '0.00' },
        { itemId: 'item-min', quantityOnHand: '4.00', quantityReserved: '0.00' },
        { itemId: 'item-out-worse', quantityOnHand: '0.00', quantityReserved: '0.00' },
      ],
      poLines: [{ itemId: 'item-out', quantity: '5.00', receivedQuantity: '0.00' }],
    });

    const result = await service.listSuggestions();

    expect(result.map((row) => row.itemId)).toEqual([
      'item-out-worse',
      'item-out',
      'item-min',
      'item-reorder',
    ]);
    expect(result.map((row) => row.criticality)).toEqual([
      'out',
      'out',
      'below-minimum',
      'below-reorder',
    ]);
  });

  it('usa CAST AS numeric en el filtro de pendiente OC y omite reorderPoint <= 0', async () => {
    const { qb } = mockTenantData({
      items: [
        buildItem({ id: 'item-no-reorder', reorderPoint: '0.00', targetStock: '20.00' }),
        buildItem({ id: 'item-ok', reorderPoint: '10.00', targetStock: '20.00' }),
      ],
      balances: [
        { itemId: 'item-no-reorder', quantityOnHand: '0.00', quantityReserved: '0.00' },
        { itemId: 'item-ok', quantityOnHand: '1.00', quantityReserved: '0.00' },
      ],
    });

    const result = await service.listSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0]?.itemId).toBe('item-ok');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'CAST(line.quantity AS numeric) - CAST(line.receivedQuantity AS numeric) > 0',
    );
    expect(qb.andWhere).toHaveBeenCalledWith('po.status IN (:...statuses)', {
      statuses: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED],
    });
  });
});
