import { ServiceUnavailableException } from '@nestjs/common';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '@iwana/shared';
import {
  ExecutionOrderInventoryService,
  type ConsumeTechnicianCustodyInput,
} from '../services/execution-order-inventory.service';

describe('ExecutionOrderInventoryService', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  const consumeInput: ConsumeTechnicianCustodyInput = {
    executionOrderId: 'eo-001',
    itemId: 'item-001',
    technicianCustodyId: 'custody-001',
    quantity: 1,
    serialNumber: 'SN-001',
    subscriberId: 'sub-001',
    customerSiteLocationId: 'loc-001',
    action: ExecutionOrderItemAction.INSTALL,
    finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
    stockMovementId: 'stock-mov-001',
  };

  describe('consumeTechnicianCustody', () => {
    it('debe lanzar ServiceUnavailableException cuando el puerto de inventario no está disponible', async () => {
      // Sin InventoryMovementPort inyectado => undefined
      const service = new ExecutionOrderInventoryService();

      await expect(service.consumeTechnicianCustody(consumeInput, actor)).rejects.toThrow(
        ServiceUnavailableException,
      );

      await expect(service.consumeTechnicianCustody(consumeInput, actor)).rejects.toMatchObject({
        response: {
          code: 'INVENTORY_MOVEMENT_UNAVAILABLE',
        },
      });
    });

    it('debe delegar al puerto de inventario cuando está disponible', async () => {
      const mockPort = {
        consumeFromExecutionOrder: jest.fn().mockResolvedValue({
          stockMovementId: 'stock-mov-001',
        }),
        getItemCategoryReceipt: jest.fn(),
      };

      const service = new ExecutionOrderInventoryService(mockPort as any);

      const result = await service.consumeTechnicianCustody(consumeInput, actor);

      expect(mockPort.consumeFromExecutionOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          executionOrderId: 'eo-001',
          itemId: 'item-001',
          idempotencyKey: 'stock-mov-001',
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        }),
        actor,
      );
      expect(result).toEqual({
        stockMovementId: 'stock-mov-001',
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      });
    });

    it('debe pasar valores null cuando serialNumber y otros campos son nulos', async () => {
      const mockPort = {
        consumeFromExecutionOrder: jest.fn().mockResolvedValue({
          stockMovementId: 'stock-mov-002',
        }),
        getItemCategoryReceipt: jest.fn(),
      };

      const service = new ExecutionOrderInventoryService(mockPort as any);

      const inputWithoutOptionals: ConsumeTechnicianCustodyInput = {
        executionOrderId: 'eo-002',
        itemId: 'item-002',
        technicianCustodyId: 'custody-002',
        quantity: 2,
        action: ExecutionOrderItemAction.RETURN,
        finalDisposition: InventoryDisposition.RETURNED_TO_WAREHOUSE,
      };

      const result = await service.consumeTechnicianCustody(inputWithoutOptionals, actor);

      expect(mockPort.consumeFromExecutionOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          serialNumber: null,
          subscriberId: null,
          customerSiteLocationId: null,
          idempotencyKey: null,
        }),
        actor,
      );
      expect(result.finalDisposition).toBe(InventoryDisposition.RETURNED_TO_WAREHOUSE);
    });

    it('debe propagar errores del puerto de inventario', async () => {
      const mockPort = {
        consumeFromExecutionOrder: jest.fn().mockRejectedValue(new Error('Stock insuficiente')),
        getItemCategoryReceipt: jest.fn(),
      };

      const service = new ExecutionOrderInventoryService(mockPort as any);

      await expect(service.consumeTechnicianCustody(consumeInput, actor)).rejects.toThrow(
        'Stock insuficiente',
      );
    });
  });

  describe('getItemCategoryReceipt', () => {
    it('debe lanzar ServiceUnavailableException cuando el puerto no está disponible', async () => {
      const service = new ExecutionOrderInventoryService();

      await expect(service.getItemCategoryReceipt('item-001')).rejects.toThrow(
        ServiceUnavailableException,
      );

      await expect(service.getItemCategoryReceipt('item-001')).rejects.toMatchObject({
        response: {
          code: 'INVENTORY_CATALOG_UNAVAILABLE',
        },
      });
    });

    it('debe delegar al puerto cuando está disponible', async () => {
      const categoryReceipt = {
        itemId: 'item-001',
        categoryId: 'cat-001',
        categoryName: 'CPE',
        isSerialized: true,
        isConsumable: false,
      };

      const mockPort = {
        consumeFromExecutionOrder: jest.fn(),
        getItemCategoryReceipt: jest.fn().mockResolvedValue(categoryReceipt),
      };

      const service = new ExecutionOrderInventoryService(mockPort as any);

      const result = await service.getItemCategoryReceipt('item-001');

      expect(mockPort.getItemCategoryReceipt).toHaveBeenCalledWith('item-001');
      expect(result).toEqual(categoryReceipt);
    });

    it('debe propagar errores del puerto', async () => {
      const mockPort = {
        consumeFromExecutionOrder: jest.fn(),
        getItemCategoryReceipt: jest
          .fn()
          .mockRejectedValue(new Error('Item no encontrado en catálogo')),
      };

      const service = new ExecutionOrderInventoryService(mockPort as any);

      await expect(service.getItemCategoryReceipt('item-999')).rejects.toThrow(
        'Item no encontrado en catálogo',
      );
    });
  });
});
