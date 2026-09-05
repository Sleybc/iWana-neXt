import {
  ExecutionOrderItemAction,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryDisposition,
  StockMovementOrigin,
  InventoryTrackingMode,
  UserRole,
} from '@iwana/shared';
import { Test } from '@nestjs/testing';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  InventoryItemService,
  type InventoryItemResponse,
} from '../services/inventory-item.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { InventoryMovementPortAdapter } from '../ports/inventory-movement.port';

type StockLedgerServiceMock = Pick<StockLedgerService, 'recordExecutionOrderMovement'>;
type InventoryItemServiceMock = Pick<InventoryItemService, 'getById'>;

const createStockMovementResult = (): Awaited<
  ReturnType<StockLedgerService['recordExecutionOrderMovement']>
> => ({
  movement: {
    id: 'mov-001',
    tenantId: 'tenant-001',
    movementNumber: 'MOV-001',
    origin: StockMovementOrigin.EXECUTION_ORDER,
    originContext: 'tasks.execution-order',
    originRefId: 'eo-001',
    idempotencyKey: 'eo:eo-001:item-001:custody-001:INSTALL:SER-001',
    notes: null,
    actorUserId: 'support-001',
    reversedByMovementId: null,
    isReversal: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  lines: [],
  created: true,
});

const createInventoryItemResponse = (categoryCode: string): InventoryItemResponse => ({
  id: 'item-001',
  tenantId: 'tenant-001',
  sku: 'CPE-001',
  name: 'Equipo de prueba',
  description: null,
  brand: null,
  model: null,
  itemKind: InventoryItemKind.STOCK,
  category: InventoryItemCategory.CPE,
  categoryId: 'category-001',
  categoryName: 'Equipos de cliente',
  categoryCode,
  trackingMode: InventoryTrackingMode.CONSUMABLE,
  unitOfMeasure: 'UNIT',
  baseCost: '0.00',
  minimumStock: '0.00',
  purchasable: true,
  inventoryControlled: true,
  assetControlled: false,
  preferredSupplierRefId: null,
  supplierSku: null,
  purchaseUnitOfMeasure: null,
  purchaseToBaseUomFactor: null,
  standardCost: '0.00',
  lastPurchaseCost: null,
  averageCost: '0.00',
  reorderPoint: '0.00',
  targetStock: '0.00',
  minimumOrderQty: null,
  orderMultiple: null,
  leadTimeDays: null,
  usefulLifeMonths: null,
  commercialReferenceId: null,
  barcode: null,
  barcodeType: null,
  status: InventoryItemStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

const createAdapter = async (
  stockLedgerService: StockLedgerServiceMock,
  inventoryItemService: InventoryItemServiceMock,
): Promise<InventoryMovementPortAdapter> => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      InventoryMovementPortAdapter,
      { provide: StockLedgerService, useValue: stockLedgerService },
      { provide: InventoryItemService, useValue: inventoryItemService },
    ],
  }).compile();

  return moduleRef.get(InventoryMovementPortAdapter);
};

describe('InventoryMovementPortAdapter', () => {
  it('consumes movements from execution orders and returns the movement id', async () => {
    const actor: JwtPayload = {
      sub: 'support-001',
      email: 'support@example.test',
      role: UserRole.SUPPORT,
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
      jti: 'jti-001',
      type: 'tenant',
    };
    const recordExecutionOrderMovement = jest
      .fn<
        ReturnType<StockLedgerService['recordExecutionOrderMovement']>,
        Parameters<StockLedgerService['recordExecutionOrderMovement']>
      >()
      .mockResolvedValue(createStockMovementResult());
    const stockLedgerService: StockLedgerServiceMock = { recordExecutionOrderMovement };

    const getById = jest
      .fn<
        ReturnType<InventoryItemService['getById']>,
        Parameters<InventoryItemService['getById']>
      >()
      .mockResolvedValue(createInventoryItemResponse('CPE'));
    const inventoryItemService: InventoryItemServiceMock = { getById };
    const adapter = await createAdapter(stockLedgerService, inventoryItemService);
    const result = await adapter.consumeFromExecutionOrder(
      {
        executionOrderId: 'eo-001',
        itemId: 'item-001',
        technicianCustodyId: 'custody-001',
        quantity: 1,
        serialNumber: 'SER-001',
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      },
      actor,
    );

    expect(stockLedgerService.recordExecutionOrderMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        executionOrderId: 'eo-001',
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      }),
      actor,
    );
    expect(result).toEqual({ stockMovementId: 'mov-001' });
  });

  it('returns the canonical category receipt from the real inventory item service', async () => {
    const recordExecutionOrderMovement = jest.fn<
      ReturnType<StockLedgerService['recordExecutionOrderMovement']>,
      Parameters<StockLedgerService['recordExecutionOrderMovement']>
    >();
    const stockLedgerService: StockLedgerServiceMock = { recordExecutionOrderMovement };
    const getById = jest
      .fn<
        ReturnType<InventoryItemService['getById']>,
        Parameters<InventoryItemService['getById']>
      >()
      .mockResolvedValue(createInventoryItemResponse('ONT'));
    const inventoryItemService: InventoryItemServiceMock = { getById };
    const adapter = await createAdapter(stockLedgerService, inventoryItemService);

    await expect(adapter.getItemCategoryReceipt('item-001')).resolves.toEqual({
      itemId: 'item-001',
      categoryId: 'category-001',
      categoryCode: 'ONT',
    });
    expect(inventoryItemService.getById).toHaveBeenCalledWith('item-001');
  });
});
