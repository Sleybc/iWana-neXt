import {
  ExecutionOrderItemAction,
  InventoryDisposition,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { InventoryMovementPortAdapter } from '../ports/inventory-movement.port';

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
    const stockLedgerService = {
      recordExecutionOrderMovement: jest.fn().mockResolvedValue({
        movement: {
          id: 'mov-001',
          origin: StockMovementOrigin.EXECUTION_ORDER,
        },
      }),
    };

    const inventoryItemService = {
      getById: jest.fn().mockResolvedValue({
        id: 'item-001',
        categoryId: 'category-001',
        categoryCode: 'CPE',
      }),
    };
    const adapter = new InventoryMovementPortAdapter(
      stockLedgerService as never,
      inventoryItemService as never,
    );
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
    const stockLedgerService = { recordExecutionOrderMovement: jest.fn() };
    const inventoryItemService = {
      getById: jest.fn().mockResolvedValue({
        id: 'item-001',
        categoryId: 'category-001',
        categoryCode: 'ONT',
      }),
    };
    const adapter = new InventoryMovementPortAdapter(
      stockLedgerService as never,
      inventoryItemService as never,
    );

    await expect(adapter.getItemCategoryReceipt('item-001')).resolves.toEqual({
      itemId: 'item-001',
      categoryId: 'category-001',
      categoryCode: 'ONT',
    });
    expect(inventoryItemService.getById).toHaveBeenCalledWith('item-001');
  });
});
