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
        'SOLD',
        'INTERNAL_CONSUMED',
        'WRITTEN_OFF',
        'LOST',
        'CANCELLED',
        'DISPATCHED',
        'RECEIVED',
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
        'SOLD',
        'INTERNAL_CONSUMED',
        'WRITTEN_OFF',
        'LOST',
        'CANCELLED',
        'DISPATCHED',
        'RECEIVED',
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

  describe('bloqueo ampliado S2.1 · B3 (reserva, salidas abiertas, terminales)', () => {
    function runUpdateWithFlags(flags: Record<string, boolean>) {
      const existing = serializedExisting();
      const findOne = jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(CATEGORY);
      const query = jest.fn().mockResolvedValue([flags]);
      const save = jest
        .fn()
        .mockImplementation(async (_entity: unknown, payload: Record<string, unknown>) => payload);
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );
      return { query, save };
    }

    const CLEAR_FLAGS = {
      has_stock: false,
      has_assets: false,
      has_reserved: false,
      has_open_issues: false,
    };

    it('rechaza con reserva comprometida aunque no haya saldo en mano', async () => {
      const { save } = runUpdateWithFlags({ ...CLEAR_FLAGS, has_reserved: true });

      await expect(
        service.update(
          'item-001',
          { trackingMode: InventoryTrackingMode.CONSUMABLE } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(save).not.toHaveBeenCalled();
    });

    it('rechaza con salidas abiertas que referencian el ítem', async () => {
      const { save } = runUpdateWithFlags({ ...CLEAR_FLAGS, has_open_issues: true });

      await expect(
        service.update(
          'item-001',
          { trackingMode: InventoryTrackingMode.CONSUMABLE } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(save).not.toHaveBeenCalled();
    });

    it('la sonda filtra activos terminales (solo no terminales bloquean)', async () => {
      const { query } = runUpdateWithFlags(CLEAR_FLAGS);

      await expect(
        service.update(
          'item-001',
          { trackingMode: InventoryTrackingMode.FIXED_ASSET } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        ),
      ).resolves.toBeDefined();

      const sql = String((query as jest.Mock).mock.calls[0]?.[0] ?? '');
      expect(sql).toContain('current_status NOT IN');
    });
  });

  describe('pareja barcode en el merge y mensajes agregados (S2.1 · B3)', () => {
    it('el merge incluye la pareja barcode: un legado inconsistente frena cualquier edición', async () => {
      // Legado con código pero sin formato: el payload viene limpio, pero la
      // visión fusionada queda inconsistente y F4 debe frenarla en el merge.
      const existing = serializedExisting({ barcode: 'LEGADO-SIN-TIPO', barcodeType: null });
      const findOne = jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(CATEGORY);
      const query = jest.fn().mockResolvedValue(NO_STOCK_FLAGS);
      const save = jest.fn();
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );

      const error = await service
        .update(
          'item-001',
          { name: 'Onu Tp Link renovada' } as Parameters<InventoryItemService['update']>[1],
          actor,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('el formato va junto al código');
      expect(save).not.toHaveBeenCalled();
    });

    it('agrega todos los mensajes cuando el merge acumula fallas', async () => {
      const existing = serializedExisting({ barcode: 'LEGADO-SIN-TIPO', barcodeType: null });
      const findOne = jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(CATEGORY);
      const query = jest.fn().mockResolvedValue(NO_STOCK_FLAGS);
      const save = jest.fn();
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
        work({ manager: { findOne, query, save } } as never),
      );

      // Cruce inválido (SERIALIZED→CONSUMABLE) + pareja barcode rota heredada:
      // el merge debe contar AMBAS fallas en un solo mensaje (antes, solo la primera).
      const error = await service
        .update(
          'item-001',
          {
            trackingMode: InventoryTrackingMode.CONSUMABLE,
          } as Parameters<InventoryItemService['update']>[1],
          actor,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const message = (error as BadRequestException).message;
      expect(message).toContain('Tipo de producto y Control de material no coinciden');
      expect(message).toContain('el formato va junto al código');
      expect(save).not.toHaveBeenCalled();
    });
  });
});
