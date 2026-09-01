import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  InventoryItem,
  StockLocation,
  StockLot,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { StockAdjustmentReason, StockMovementOrigin } from '@iwana/shared';
import { buildPageMeta } from '../../../common/pagination/build-page-meta';
import { clampPage } from '../../../common/pagination/clamp-page';
import { ListStockMovementsQueryInput, ListStockMovementsQuerySchema } from '../dto';

export interface StockMovementKardexLine {
  id: string;
  itemId: string;
  itemName: string | null;
  itemSku: string | null;
  locationId: string;
  locationName: string | null;
  lotId: string | null;
  lotNumber: string | null;
  serializedAssetId: string | null;
  quantity: string;
  unitCost: string | null;
}

export interface StockMovementKardexRecord {
  id: string;
  movementNumber: string;
  origin: StockMovementOrigin;
  originContext: string;
  originRefId: string | null;
  adjustmentReason: StockAdjustmentReason | null;
  notes: string | null;
  actorUserId: string | null;
  isReversal: boolean;
  createdAt: Date;
  lines: StockMovementKardexLine[];
}

@Injectable()
export class StockMovementQueryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(
    query: ListStockMovementsQueryInput,
  ): Promise<{ data: StockMovementKardexRecord[]; total: number; page: number; limit: number }> {
    const validated = ListStockMovementsQuerySchema.parse(query);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { itemId, locationId, serializedAssetId, origin, dateFrom, dateTo, search } = validated;
    const { page, limit } = clampPage(validated.page, validated.limit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockMovement, 'movement')
        .where('movement.tenant_id = :tenantId', { tenantId });

      if (itemId) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM stock_movement_lines line
            WHERE line.movement_id = movement.id
              AND line.tenant_id = :tenantId
              AND line.item_id = :itemId
          )`,
          { itemId },
        );
      }

      if (locationId) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM stock_movement_lines line
            WHERE line.movement_id = movement.id
              AND line.tenant_id = :tenantId
              AND line.location_id = :locationId
          )`,
          { locationId },
        );
      }

      if (serializedAssetId) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM stock_movement_lines line
            WHERE line.movement_id = movement.id
              AND line.tenant_id = :tenantId
              AND line.serialized_asset_id = :serializedAssetId
          )`,
          { serializedAssetId },
        );
      }

      if (origin) {
        qb.andWhere('movement.origin = :origin', { origin });
      }

      if (dateFrom) {
        qb.andWhere('movement.created_at >= :dateFrom', { dateFrom });
      }

      if (dateTo) {
        qb.andWhere('movement.created_at <= :dateTo', { dateTo });
      }

      if (search) {
        qb.andWhere('movement.movement_number ILIKE :search', { search: `${search}%` });
      }

      qb.orderBy('movement.created_at', 'DESC')
        .addOrderBy('movement.movement_number', 'DESC')
        .addOrderBy('movement.id', 'DESC');

      const total = await qb.getCount();
      const movements = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      const data = await this.enrichMovements(qr.manager, tenantId, movements);
      return {
        data,
        total,
        page,
        limit,
        // Meta completa ADR-065 (aditivo): el envelope previo solo traía capabilities.
        meta: buildPageMeta({ total, page, limit, randomAccess: false, sortableFields: [] }),
      };
    });
  }

  async getById(id: string): Promise<StockMovementKardexRecord> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const movement = await qr.manager.findOne(StockMovement, {
        where: { id, tenantId },
      });

      if (!movement) {
        throw new NotFoundException('Movimiento de stock no encontrado.');
      }

      const [record] = await this.enrichMovements(qr.manager, tenantId, [movement]);
      if (!record) {
        throw new NotFoundException('Movimiento de stock no encontrado.');
      }
      return record;
    });
  }

  private async enrichMovements(
    manager: EntityManager,
    tenantId: string,
    movements: StockMovement[],
  ): Promise<StockMovementKardexRecord[]> {
    if (movements.length === 0) {
      return [];
    }

    const movementIds = movements.map((movement) => movement.id);
    const lines = await manager.find(StockMovementLine, {
      where: { tenantId, movementId: In(movementIds) },
      order: { createdAt: 'ASC' },
    });

    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    const locationIds = [...new Set(lines.map((line) => line.locationId))];
    const lotIds = [...new Set(lines.map((line) => line.lotId).filter((id): id is string => !!id))];

    const [items, locations, lots] = await Promise.all([
      itemIds.length > 0
        ? manager.find(InventoryItem, { where: { id: In(itemIds), tenantId } })
        : Promise.resolve([]),
      locationIds.length > 0
        ? manager.find(StockLocation, { where: { id: In(locationIds), tenantId } })
        : Promise.resolve([]),
      lotIds.length > 0
        ? manager.find(StockLot, { where: { id: In(lotIds), tenantId } })
        : Promise.resolve([]),
    ]);

    const itemById = new Map(items.map((item) => [item.id, item]));
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const linesByMovementId = new Map<string, StockMovementLine[]>();

    for (const line of lines) {
      const bucket = linesByMovementId.get(line.movementId) ?? [];
      bucket.push(line);
      linesByMovementId.set(line.movementId, bucket);
    }

    return movements.map((movement) => {
      const movementLines = linesByMovementId.get(movement.id) ?? [];
      const adjustmentReason =
        movement.origin === StockMovementOrigin.ADJUSTMENT
          ? movement.originContext === 'inventory.cycle-count'
            ? StockAdjustmentReason.CYCLE_COUNT
            : movement.originRefId
              ? (movement.originRefId as StockAdjustmentReason)
              : null
          : null;

      return {
        id: movement.id,
        movementNumber: movement.movementNumber,
        origin: movement.origin,
        originContext: movement.originContext,
        originRefId: movement.originRefId,
        adjustmentReason,
        notes: movement.notes,
        actorUserId: movement.actorUserId,
        isReversal: movement.isReversal,
        createdAt: movement.createdAt,
        lines: movementLines.map((line) => {
          const item = itemById.get(line.itemId);
          const location = locationById.get(line.locationId);
          const lot = line.lotId ? lotById.get(line.lotId) : undefined;

          return {
            id: line.id,
            itemId: line.itemId,
            itemName: item?.name ?? null,
            itemSku: item?.sku ?? null,
            locationId: line.locationId,
            locationName: location?.name ?? null,
            lotId: line.lotId,
            lotNumber: lot?.lotNumber ?? null,
            serializedAssetId: line.serializedAssetId,
            quantity: line.quantity,
            unitCost: line.unitCost,
          };
        }),
      };
    });
  }
}
