import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import {
  InventoryCategory,
  InventoryItem,
  SerializedAsset,
  StockBalance,
  StockLot,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  StockBalanceCondition,
  type ListResponse,
  type StockIssuePickableAvailability,
  type StockIssuePickableItem,
  type StockIssuePickableLot,
} from '@iwana/shared';
import { SERIAL_DISPATCHABLE_STATUSES } from './stock-issue-serial.constants';
import {
  ListStockIssuePickableItemsQueryInput,
  ListStockIssuePickableItemsQuerySchema,
  STOCK_ISSUE_PICKABLE_ITEMS_DEFAULT_LIMIT,
} from '../dto';
import {
  assertExclusivePageCursor,
  buildPageMeta,
  escapePickerLikePattern,
  normalizePickerQuery,
} from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { computeAvailable, toNumeric, toQuantity } from './stock-balance.service';

/** Orden canónico de condiciones en `availability[]` (CA-S1-03). */
const CONDITION_ORDER: StockBalanceCondition[] = [
  StockBalanceCondition.NEW,
  StockBalanceCondition.REFURBISHED,
  StockBalanceCondition.DAMAGED,
];

interface ItemAggregateRaw {
  itemId: string;
  itemName: string;
  sumOnHand: string;
  sumReserved: string;
}

interface ConditionAggregateRaw {
  itemId: string;
  condition: StockBalanceCondition;
  sumOnHand: string;
  sumReserved: string;
}

interface LotAggregateRaw {
  itemId: string;
  lotId: string;
  condition: StockBalanceCondition;
  sumOnHand: string;
  sumReserved: string;
}

interface SerialCountRaw {
  itemId: string;
  serialCount: string;
}

/**
 * Listado de material elegible para una salida (MOD12 S1 · B1).
 *
 * Dos pasos: primero se agrega y pagina por ítem (el orden
 * `totalAvailable DESC, name ASC` se calcula sobre el agregado y por eso la
 * paginación es solo por `page`), y después se hidratan los lotes y seriales
 * de la página. Cada tabla del join filtra por `tenant_id`, incluidas
 * `stock_lots` (vía `find` con tenant) y la subconsulta de `serialized_assets`.
 * Sin imports cross-módulo: todo vive en MOD12.
 */
@Injectable()
export class StockIssuePickingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listPickableItems(
    query: ListStockIssuePickableItemsQueryInput,
  ): Promise<ListResponse<StockIssuePickableItem>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockIssuePickableItemsQuerySchema.parse(query);
    assertExclusivePageCursor(validated);

    if (validated.cursor !== undefined) {
      throw new BadRequestException(
        'Este listado pagina por page: el orden por disponible calculado no admite cursor.',
      );
    }

    const { page, limit } = clampPage(
      validated.page ?? 1,
      validated.limit ?? STOCK_ISSUE_PICKABLE_ITEMS_DEFAULT_LIMIT,
    );
    // `q` vacía = sin filtro (precarga D1); el picker genérico retorna vacío sin `q`.
    const searchText = normalizePickerQuery(validated.q);
    const locationId = validated.sourceLocationId;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;

      if (validated.scope === 'catalog') {
        return this.listCatalogPage(manager, tenantId, locationId, searchText, page, limit);
      }

      return this.listWithStockPage(manager, tenantId, locationId, searchText, page, limit);
    });
  }

  /**
   * Filtro base del alcance `with-stock`: ítems con filas de saldo en la
   * bodega, agrupados por ítem. El `HAVING` vive en el constructor para que
   * el conteo del total y la página compartan el mismo conjunto filtrado.
   */
  private withStockGroups<T extends SelectQueryBuilder<StockBalance>>(
    qb: T,
    tenantId: string,
    locationId: string,
    searchText: string,
  ): T {
    qb.select('item.id', 'itemId')
      .addSelect('item.name', 'itemName')
      .innerJoin(
        InventoryItem,
        'item',
        'item.id = balance.item_id AND item.tenant_id = balance.tenant_id',
      )
      .where('balance.tenant_id = :tenantId', { tenantId })
      .andWhere('balance.location_id = :locationId', { locationId })
      .groupBy('item.id')
      .addGroupBy('item.name')
      // S2.1 · B2: el filtro disponible > 0 se evalúa en SQL (no en TS): los
      // ítems sin disponible nunca salen del motor. `ROUND(...,2)` replica el
      // redondeo de `computeAvailable` para que el total y la página coincidan.
      .having(
        'ROUND(SUM(balance.quantity_on_hand::numeric) - SUM(balance.quantity_reserved::numeric), 2) > 0',
      );

    this.applyItemSearch(qb, searchText);
    return qb;
  }

  /**
   * Alcance `with-stock`: solo ítems con disponible total > 0 en la bodega.
   * Total y página salen de SQL: el total cuenta los grupos que pasan el
   * `HAVING` y la página trae solo su ventana (`OFFSET`/`LIMIT`) ordenada por
   * disponible calculado. La entidad guarda `numeric` como string, así que el
   * mapeo final sigue usando `computeAvailable` en TS (red de seguridad ante
   * redondeo: el filtro `total > 0` se conserva).
   */
  private async listWithStockPage(
    manager: EntityManager,
    tenantId: string,
    locationId: string,
    searchText: string,
    page: number,
    limit: number,
  ): Promise<ListResponse<StockIssuePickableItem>> {
    const totalRow = await manager
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(
        (sub) =>
          this.withStockGroups(
            sub.select('item.id', 'groupItemId'),
            tenantId,
            locationId,
            searchText,
          ),
        'with_stock_groups',
      )
      .getRawOne<{ total: string }>();
    const total = Number.parseInt(totalRow?.total ?? '0', 10);

    if (total === 0) {
      return {
        data: [],
        meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
      };
    }

    const rawGroups = await this.withStockGroups(
      manager.createQueryBuilder(StockBalance, 'balance'),
      tenantId,
      locationId,
      searchText,
    )
      .addSelect('SUM(balance.quantity_on_hand::numeric)', 'sumOnHand')
      .addSelect('SUM(balance.quantity_reserved::numeric)', 'sumReserved')
      .addSelect(
        'SUM(balance.quantity_on_hand::numeric) - SUM(balance.quantity_reserved::numeric)',
        'totalAvailable',
      )
      .orderBy('totalAvailable', 'DESC')
      .addOrderBy('item.name', 'ASC')
      .addOrderBy('item.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<ItemAggregateRaw>();

    const ranked = rawGroups
      .map((row) => {
        const onHand = toNumeric(row.sumOnHand);
        const reserved = toNumeric(row.sumReserved);
        return {
          itemId: row.itemId,
          itemName: row.itemName,
          total: computeAvailable(onHand, reserved),
        };
      })
      .filter((group) => group.total > 0);

    const pageIds = ranked.map((group) => group.itemId);

    if (pageIds.length === 0) {
      return {
        data: [],
        meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
      };
    }

    const data = await this.hydrateItems(manager, tenantId, locationId, pageIds);
    return {
      data,
      meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
    };
  }

  /**
   * Alcance `catalog`: catálogo completo paginado por nombre; lo que no tiene
   * saldo hidrata `totalAvailable: '0'`, `availability: []` y `lots: []`.
   */
  private async listCatalogPage(
    manager: EntityManager,
    tenantId: string,
    locationId: string,
    searchText: string,
    page: number,
    limit: number,
  ): Promise<ListResponse<StockIssuePickableItem>> {
    const itemQb = manager
      .createQueryBuilder(InventoryItem, 'item')
      .where('item.tenant_id = :tenantId', { tenantId });

    this.applyItemSearch(itemQb, searchText);

    const total = await itemQb.clone().getCount();
    const rows = await itemQb
      .orderBy('item.name', 'ASC')
      .addOrderBy('item.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    if (rows.length === 0) {
      return {
        data: [],
        meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
      };
    }

    const data = await this.hydrateItems(
      manager,
      tenantId,
      locationId,
      rows.map((row) => row.id),
    );
    return {
      data,
      meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
    };
  }

  /**
   * Filtro server-side por sku/nombre/marca/modelo/código de barras, con el
   * mismo escape LIKE de `searchForPicker`. Sin texto no filtra (precarga D1).
   */
  private applyItemSearch(
    qb: SelectQueryBuilder<StockBalance> | SelectQueryBuilder<InventoryItem>,
    searchText: string,
  ): void {
    if (!searchText) {
      return;
    }

    const like = `%${escapePickerLikePattern(searchText.toLowerCase())}%`;
    qb.andWhere(
      `(LOWER(item.sku) LIKE :pickingLike ESCAPE '\\' ` +
        `OR LOWER(item.name) LIKE :pickingLike ESCAPE '\\' ` +
        `OR LOWER(COALESCE(item.brand, '')) LIKE :pickingLike ESCAPE '\\' ` +
        `OR LOWER(COALESCE(item.model, '')) LIKE :pickingLike ESCAPE '\\' ` +
        `OR LOWER(COALESCE(item.barcode, '')) LIKE :pickingLike ESCAPE '\\')`,
      { pickingLike: like },
    );
  }

  /**
   * Hidrata la página de ítems: saldos por condición, lotes con disponible y
   * conteo de seriales despachables. Todo en consultas batcheadas (`In` +
   * `GROUP BY`), sin N+1.
   */
  private async hydrateItems(
    manager: EntityManager,
    tenantId: string,
    locationId: string,
    itemIds: string[],
  ): Promise<StockIssuePickableItem[]> {
    const [foundItems, conditionRows, lotRows, serialRows] = await Promise.all([
      manager.find(InventoryItem, { where: { tenantId, id: In(itemIds) } }),
      manager
        .createQueryBuilder(StockBalance, 'balance')
        .select('balance.item_id', 'itemId')
        .addSelect('balance.condition', 'condition')
        .addSelect('SUM(balance.quantity_on_hand::numeric)', 'sumOnHand')
        .addSelect('SUM(balance.quantity_reserved::numeric)', 'sumReserved')
        .where('balance.tenant_id = :tenantId', { tenantId })
        .andWhere('balance.location_id = :locationId', { locationId })
        .andWhere('balance.item_id IN (:...pickingItemIds)', { pickingItemIds: itemIds })
        .groupBy('balance.item_id')
        .addGroupBy('balance.condition')
        .getRawMany<ConditionAggregateRaw>(),
      manager
        .createQueryBuilder(StockBalance, 'balance')
        .select('balance.item_id', 'itemId')
        .addSelect('balance.lot_id', 'lotId')
        .addSelect('balance.condition', 'condition')
        .addSelect('SUM(balance.quantity_on_hand::numeric)', 'sumOnHand')
        .addSelect('SUM(balance.quantity_reserved::numeric)', 'sumReserved')
        .where('balance.tenant_id = :tenantId', { tenantId })
        .andWhere('balance.location_id = :locationId', { locationId })
        .andWhere('balance.item_id IN (:...pickingItemIds)', { pickingItemIds: itemIds })
        .andWhere('balance.lot_id IS NOT NULL')
        .groupBy('balance.item_id')
        .addGroupBy('balance.lot_id')
        .addGroupBy('balance.condition')
        .getRawMany<LotAggregateRaw>(),
      manager
        .createQueryBuilder(SerializedAsset, 'asset')
        .select('asset.inventory_item_id', 'itemId')
        .addSelect('COUNT(*)', 'serialCount')
        .where('asset.tenant_id = :tenantId', { tenantId })
        .andWhere('asset.inventory_item_id IN (:...pickingItemIds)', { pickingItemIds: itemIds })
        .andWhere('asset.current_location_id = :locationId', { locationId })
        .andWhere('asset.current_status IN (:...pickingSerialStatuses)', {
          pickingSerialStatuses: SERIAL_DISPATCHABLE_STATUSES,
        })
        .groupBy('asset.inventory_item_id')
        .getRawMany<SerialCountRaw>(),
    ]);

    const itemById = new Map(foundItems.map((item) => [item.id, item]));

    const categoryIds = [...new Set(foundItems.map((item) => item.categoryId))];
    const categories =
      categoryIds.length > 0
        ? await manager.find(InventoryCategory, { where: { tenantId, id: In(categoryIds) } })
        : [];
    const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

    const lotIds = [...new Set(lotRows.map((row) => row.lotId))];
    const lots =
      lotIds.length > 0
        ? await manager.find(StockLot, { where: { tenantId, id: In(lotIds) } })
        : [];
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));

    const serialCountByItemId = new Map(
      serialRows.map((row) => [row.itemId, Number(row.serialCount)] as const),
    );

    const pickables: StockIssuePickableItem[] = [];
    for (const itemId of itemIds) {
      const item = itemById.get(itemId);
      if (!item) {
        continue;
      }

      const itemConditionRows = conditionRows.filter((row) => row.itemId === itemId);
      const availability: StockIssuePickableAvailability[] = itemConditionRows
        .map((row) => {
          const onHand = toNumeric(row.sumOnHand);
          const reserved = toNumeric(row.sumReserved);
          return {
            condition: row.condition,
            quantityOnHand: toQuantity(onHand),
            quantityReserved: toQuantity(reserved),
            available: toQuantity(computeAvailable(onHand, reserved)),
          };
        })
        .sort(
          (a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition),
        );

      let totalOnHand = 0;
      let totalReserved = 0;
      for (const row of itemConditionRows) {
        totalOnHand += toNumeric(row.sumOnHand);
        totalReserved += toNumeric(row.sumReserved);
      }

      const pickableLots: StockIssuePickableLot[] = [];
      for (const row of lotRows) {
        if (row.itemId !== itemId) {
          continue;
        }
        const lot = lotById.get(row.lotId);
        if (!lot) {
          continue;
        }
        const available = computeAvailable(toNumeric(row.sumOnHand), toNumeric(row.sumReserved));
        if (available <= 0) {
          continue;
        }
        pickableLots.push({
          lotId: row.lotId,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate,
          condition: row.condition,
          available: toQuantity(available),
        });
      }
      pickableLots.sort((a, b) => {
        if (a.lotNumber === b.lotNumber) {
          return 0;
        }
        return a.lotNumber < b.lotNumber ? -1 : 1;
      });

      pickables.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        categoryId: item.categoryId,
        categoryName: categoryNameById.get(item.categoryId) ?? null,
        unitOfMeasure: item.unitOfMeasure,
        trackingMode: item.trackingMode,
        assetControlled: item.assetControlled,
        availability,
        totalAvailable: toQuantity(computeAvailable(totalOnHand, totalReserved)),
        lots: pickableLots,
        availableSerialCount: serialCountByItemId.get(itemId) ?? 0,
      });
    }

    return pickables;
  }
}
