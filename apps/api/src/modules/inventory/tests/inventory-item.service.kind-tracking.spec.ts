import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  UserRole,
} from '@iwana/shared';
import { InventoryItem, runInTenantSchema, TenantContext } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { CommercialProductReferencePort } from '../ports/commercial-product-reference.port';
import { InventoryItemService } from '../services/inventory-item.service';
import { InventoryCategoryService } from '../services/inventory-category.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  InventoryCategory: class InventoryCategory {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

const CATEGORY = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-001',
  code: 'CPE',
  codePrefix: 'CPE',
  name: 'CPE',
  status: 'ACTIVE',
};

/** Ítem serializado coherente, sin saldo ni activos. */
function serializedExisting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-001',
    tenantId: 'tenant-001',
    sku: 'CPE-SER-ONU-TPL-XC220',
    name: 'Onu Tp Link',
    categoryId: CATEGORY.id,
    category: InventoryItemCategory.CPE,
    itemKind: InventoryItemKind.SERIALIZED,
    trackingMode: InventoryTrackingMode.SERIALIZED,
    unitOfMeasure: 'UNIT',
    assetControlled: true,
    purchaseUnitOfMeasure: null,
    purchaseToBaseUomFactor: null,
    reorderPoint: '0',
    status: InventoryItemStatus.ACTIVE,
    purchasable: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

const NO_STOCK_FLAGS = [{ has_stock: false, has_assets: false }];

describe('InventoryItemService · coherencia del maestro y bloqueo con saldo (Fase S2)', () => {
  let service: InventoryItemService;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    eventEmitter = { emit: jest.fn() };
    service = new InventoryItemService(
      {} as DataSource,
      eventEmitter as unknown as EventEmitter2,
      { getSupplierSummary: jest.fn().mockResolvedValue(null) } as unknown as SupplierPartyPort,
      {
        resolveCategoryForItem: jest.fn().mockResolvedValue(CATEGORY),
      } as unknown as InventoryCategoryService,
      {
        resolveProductReference: jest.fn().mockResolvedValue(null),
      } as unknown as CommercialProductReferencePort,
    );
  });

  describe('rechazo del cruce itemKind ↔ trackingMode en crear (CA-S2-01)', () => {
    it('rechaza alta "Con serial" + "Consumible" sin tocar base de datos', async () => {
      await expect(
        service.create(
          {
            name: 'Onu Tp Link',
            categoryId: CATEGORY.id,
            itemKind: InventoryItemKind.SERIALIZED,
            trackingMode: InventoryTrackingMode.CONSUMABLE,
            unitOfMeasure: 'UNIT',
          },
          actor,
        ),
      ).rejects.toThrow(/Tipo de producto y Control de material no coinciden/);

      expect(runInTenantSchemaMock).not.toHaveBeenCalled();
    });
  });

  describe('rechazo del cruce en editar con el payload fusionado (ajuste G1)', () => {
    it('rechaza update que fija trackingMode consumible sobre un ítem "Con serial" (merge con itemKind)', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(serializedExisting())
        .mockResolvedValueOnce(CATEGORY);
      const query = jest.fn().mockResolvedValue(NO_STOCK_FLAGS);
      const save = jest.fn();
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );

      const rejection = await service
        .update(
          'item-001',
          { trackingMode: InventoryTrackingMode.CONSUMABLE } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        )
        .catch((error: unknown) => error);

      expect(rejection).toBeInstanceOf(BadRequestException);
      expect((rejection as BadRequestException).message).toContain(
        'Tipo de producto y Control de material no coinciden',
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('rechaza update que fija itemKind consumible sobre un ítem con control serializado (sin cambio de tracking)', async () => {
      const existing = serializedExisting();
      const findOne = jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(CATEGORY);
      const save = jest.fn();
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, save } } as never),
      );

      await expect(
        service.update(
          'item-001',
          { itemKind: InventoryItemKind.CONSUMABLE } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        ),
      ).rejects.toThrow(/Tipo de producto y Control de material no coinciden/);

      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('bloqueo del cambio de Control de material con saldo o activos (CA-S2-03)', () => {
    it('rechaza con saldo en bodega y no guarda', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(serializedExisting())
        .mockResolvedValueOnce(CATEGORY);
      const query = jest.fn().mockResolvedValue([{ has_stock: true, has_assets: false }]);
      const save = jest.fn();
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );

      await expect(
        service.update(
          'item-001',
          { trackingMode: InventoryTrackingMode.CONSUMABLE } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        ),
      ).rejects.toThrow(
        'Este producto tiene saldo en bodega o activos registrados, así que no permite cambiar su Control de material. Regulariza con salidas o ajustes y vuelve a intentarlo.',
      );

      expect(query).toHaveBeenCalledWith(expect.stringContaining('stock_balances'), [
        'tenant-001',
        'item-001',
      ]);
      expect(save).not.toHaveBeenCalled();
    });

    it('rechaza con activos registrados aunque el saldo sea cero', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(serializedExisting())
        .mockResolvedValueOnce(CATEGORY);
      const query = jest.fn().mockResolvedValue([{ has_stock: false, has_assets: true }]);
      const save = jest.fn();
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );

      await expect(
        service.update(
          'item-001',
          { trackingMode: InventoryTrackingMode.FIXED_ASSET } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(query).toHaveBeenCalledWith(expect.stringContaining('serialized_assets'), [
        'tenant-001',
        'item-001',
      ]);
      expect(save).not.toHaveBeenCalled();
    });

    it('permite el cambio a "Activo fijo" cuando no hay saldo ni activos (cruce coherente)', async () => {
      const existing = serializedExisting();
      const findOne = jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(CATEGORY);
      const query = jest.fn().mockResolvedValue(NO_STOCK_FLAGS);
      const save = jest
        .fn()
        .mockResolvedValue({ ...existing, trackingMode: InventoryTrackingMode.FIXED_ASSET });
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );

      const result = await service.update(
        'item-001',
        { trackingMode: InventoryTrackingMode.FIXED_ASSET } as Parameters<
          InventoryItemService['update']
        >[1],
        actor,
      );

      expect(result.trackingMode).toBe(InventoryTrackingMode.FIXED_ASSET);
      expect(query).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalled();
    });

    it('no consulta saldo cuando el payload no cambia el Control de material', async () => {
      const existing = serializedExisting();
      const findOne = jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(CATEGORY);
      const query = jest.fn();
      const save = jest.fn().mockResolvedValue(existing);
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );

      await service.update(
        'item-001',
        { name: 'Onu Tp Link renovada' } as Parameters<InventoryItemService['update']>[1],
        actor,
      );

      expect(query).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalled();
    });
  });
});
