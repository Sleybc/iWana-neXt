import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  GoodsReceipt,
  InventoryCategory,
  InventoryItem,
  PurchaseOrder,
  SerializedAsset,
  StockLocation,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockMovementOrigin,
  type ListResponse,
} from '@iwana/shared';
import {
  GetSerializedAssetDetailQueryInput,
  GetSerializedAssetDetailQuerySchema,
  ListSerializedAssetsQueryInput,
  ListSerializedAssetsQuerySchema,
  ListUsefulLifeAlertsQueryInput,
  ListUsefulLifeAlertsQuerySchema,
  SerializedAssetPickerSearchQueryInput,
  SerializedAssetPickerSearchQuerySchema,
} from '../dto';
import {
  SerializedAssetDetailRecord,
  SerializedAssetPurchaseOrigin,
  UsefulLifeStatus,
} from '../types/serialized-asset-detail.types';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import {
  assertExclusivePageCursor,
  buildCursorMeta,
  buildPageMeta,
  clampInventoryLimit,
  clampPickerSearchLimit,
  dateIdDescCursorParams,
  dateIdDescCursorWhere,
  escapePickerLikePattern,
  normalizePickerQuery,
  sliceDateIdDescPage,
  type PickerSearchResult,
} from '../../../common/pagination';
import { AssetLifecycleService } from './asset-lifecycle.service';
import { AssetLoanService } from './asset-loan.service';
import { clampPage } from '../../../common/pagination/clamp-page';
import {
  USEFUL_LIFE_ALERT_THRESHOLD_MONTHS,
  calculateUsefulLife,
} from './serialized-asset-useful-life.util';
import { StockMovementQueryService } from './stock-movement-query.service';

const USEFUL_LIFE_ALERT_TERMINAL_STATUSES: SerializedAssetStatus[] = [
  SerializedAssetStatus.WRITTEN_OFF,
  SerializedAssetStatus.LOST,
  SerializedAssetStatus.SOLD,
];

interface CreateReceivedAssetInput {
  tenantId: string;
  inventoryItemId: string;
  /**
   * Lote de origen del ingreso (migración 129). La recepción crea un
   * `StockLot` para todo ingreso, también serializado: persistirlo aquí es lo
   * que permite después validar que un serial pertenece al lote de la línea.
   */
  lotId?: string | null;
  serialNumber?: string | null;
  macAddress?: string | null;
  assetTag?: string | null;
  purchaseOrderRef?: string | null;
  purchaseDate?: string | null;
  usefulLifeMonths?: number | null;
  warrantyUntil?: string | null;
  currentLocationId?: string | null;
}

interface TransitionAssetInput {
  tenantId: string;
  serializedAssetId?: string | null | undefined;
  serialNumber?: string | null | undefined;
  toStatus: SerializedAssetStatus;
  currentLocationId?: string | null | undefined;
  currentResponsibleType?: InventoryResponsibleType | undefined;
  currentResponsibleRefId?: string | null | undefined;
  subscriberRefId?: string | null | undefined;
  contractRefId?: string | null | undefined;
}

const ALLOWED_STATUS_TRANSITIONS: Record<SerializedAssetStatus, SerializedAssetStatus[]> = {
  [SerializedAssetStatus.ORDERED]: [SerializedAssetStatus.IN_RECEIVING],
  [SerializedAssetStatus.IN_RECEIVING]: [SerializedAssetStatus.AVAILABLE],
  [SerializedAssetStatus.AVAILABLE]: [
    SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
    SerializedAssetStatus.SOLD,
    SerializedAssetStatus.INTERNAL_CONSUMED,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN]: [
    SerializedAssetStatus.INSTALLED_COMODATO,
    SerializedAssetStatus.AVAILABLE,
    SerializedAssetStatus.IN_TRANSIT,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.INSTALLED_COMODATO]: [
    SerializedAssetStatus.IN_TRANSIT,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.IN_TRANSIT]: [
    SerializedAssetStatus.IN_TESTING,
    SerializedAssetStatus.AVAILABLE,
  ],
  [SerializedAssetStatus.IN_TESTING]: [
    SerializedAssetStatus.AVAILABLE_REFURBISHED,
    SerializedAssetStatus.IN_REPAIR,
    SerializedAssetStatus.WRITTEN_OFF,
  ],
  [SerializedAssetStatus.AVAILABLE_REFURBISHED]: [
    SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
    SerializedAssetStatus.SOLD,
    SerializedAssetStatus.INTERNAL_CONSUMED,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.IN_REPAIR]: [
    SerializedAssetStatus.AVAILABLE_REFURBISHED,
    SerializedAssetStatus.WRITTEN_OFF,
  ],
  [SerializedAssetStatus.SOLD]: [],
  [SerializedAssetStatus.INTERNAL_CONSUMED]: [],
  [SerializedAssetStatus.WRITTEN_OFF]: [],
  [SerializedAssetStatus.LOST]: [],
};

@Injectable()
export class SerializedAssetService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly assetLifecycleService: AssetLifecycleService,
    private readonly stockMovementQueryService: StockMovementQueryService,
    private readonly supplierPartyPort: SupplierPartyPort,
    private readonly assetLoanService: AssetLoanService,
  ) {}

  async list(query: ListSerializedAssetsQueryInput): Promise<ListResponse<SerializedAsset>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListSerializedAssetsQuerySchema.parse(query);
    assertExclusivePageCursor(validated);
    const limit = clampInventoryLimit(validated.limit);
    const usePage = validated.page !== undefined;
    const page = usePage ? clampPage(validated.page!, limit).page : 1;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(SerializedAsset, 'asset')
        .where('asset.tenant_id = :tenantId', { tenantId });

      if (validated.itemId) {
        qb.andWhere('asset.inventory_item_id = :itemId', { itemId: validated.itemId });
      }

      // MOD12 S1 · B2: `status` es lista (valor único normalizado a un elemento).
      if (validated.status) {
        qb.andWhere('asset.current_status IN (:...statuses)', {
          statuses: validated.status,
        });
      }

      if (validated.locationId) {
        qb.andWhere('asset.current_location_id = :locationId', {
          locationId: validated.locationId,
        });
      }

      if (validated.serialNumber) {
        qb.andWhere('asset.normalized_serial_number = :serialNumber', {
          serialNumber: this.normalizeSerial(validated.serialNumber),
        });
      }

      const total = await qb.clone().getCount();

      qb.orderBy('asset.updated_at', 'DESC').addOrderBy('asset.id', 'DESC');

      if (usePage) {
        const rows = await qb
          .skip((page - 1) * limit)
          .take(limit)
          .getMany();
        return {
          data: rows,
          meta: buildPageMeta({
            total,
            page,
            limit,
            randomAccess: false,
            sortableFields: [],
          }),
        };
      }

      if (validated.cursor) {
        qb.andWhere(
          dateIdDescCursorWhere('asset', 'updated_at'),
          dateIdDescCursorParams(validated.cursor),
        );
      }

      const rows = await qb.take(limit + 1).getMany();

      const { data, nextCursor } = sliceDateIdDescPage(rows, limit, (row) => row.updatedAt);
      return {
        data,
        meta: buildCursorMeta({
          nextCursor,
          total,
          limit,
        }),
      };
    });
  }

  /**
   * Lookup typeahead E-4 para activos serializados.
   * Label = serial / asset tag; sublabel = SKU del ítem (sin enum de estado).
   */
  async searchForPicker(query: SerializedAssetPickerSearchQueryInput): Promise<PickerSearchResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = SerializedAssetPickerSearchQuerySchema.parse(query);
    const limit = clampPickerSearchLimit(validated.limit);
    const q = normalizePickerQuery(validated.q);

    if (!q) {
      return { data: [], total: 0 };
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const like = `%${escapePickerLikePattern(q.toLowerCase())}%`;
      const qb = qr.manager
        .createQueryBuilder(SerializedAsset, 'asset')
        .leftJoin(InventoryItem, 'item', 'item.id = asset.inventory_item_id')
        .addSelect(['item.sku', 'item.name'])
        .where('asset.tenant_id = :tenantId', { tenantId })
        .andWhere(
          `(
            LOWER(COALESCE(asset.serial_number, '')) LIKE :like ESCAPE '\\'
            OR LOWER(COALESCE(asset.asset_tag, '')) LIKE :like ESCAPE '\\'
            OR LOWER(COALESCE(asset.mac_address, '')) LIKE :like ESCAPE '\\'
            OR LOWER(COALESCE(item.sku, '')) LIKE :like ESCAPE '\\'
            OR LOWER(COALESCE(item.name, '')) LIKE :like ESCAPE '\\'
          )`,
          { like },
        );

      const total = await qb.clone().getCount();
      const rows = await qb
        .orderBy('asset.serial_number', 'ASC', 'NULLS LAST')
        .addOrderBy('asset.id', 'ASC')
        .take(limit)
        .getMany();

      // Re-fetch with item sku via raw map — getMany con leftJoin select parcial
      // no hidrata item. Consulta ligera de SKUs para la página.
      const itemIds = [...new Set(rows.map((r) => r.inventoryItemId))];
      const items =
        itemIds.length === 0
          ? []
          : await qr.manager.find(InventoryItem, {
              where: { tenantId, id: In(itemIds) },
              select: ['id', 'sku', 'name'],
            });
      const skuByItemId = new Map(items.map((i) => [i.id, i.sku]));

      return {
        data: rows.map((asset) => {
          const label =
            asset.serialNumber?.trim() ||
            asset.assetTag?.trim() ||
            `Activo ${asset.id.slice(0, 8)}`;
          const sku = skuByItemId.get(asset.inventoryItemId);
          return {
            id: asset.id,
            label,
            sublabel: sku ? `SKU ${sku}` : null,
          };
        }),
        total,
      };
    });
  }

  /**
   * Lista alertas de vida útil (pull on-read, sin materializar) — D-H4-06 / D-H6-4.
   * Predicado, COUNT y LIMIT/OFFSET en SQL; resuelve ítems solo de la página.
   */
  async listUsefulLifeAlerts(query: ListUsefulLifeAlertsQueryInput): Promise<{
    data: Array<{
      id: string;
      inventoryItemId: string;
      serialNumber: string | null;
      assetTag: string | null;
      currentStatus: SerializedAssetStatus;
      sku: string | null;
      itemName: string | null;
      status: Extract<UsefulLifeStatus, 'por-vencer' | 'vencida'>;
      monthsRemaining: number | null;
      monthsTotal: number | null;
      purchaseDate: string | null;
      warrantyUntil: string | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
    /** Alias de pageSize para clientes que usan `limit`. */
    limit: number;
  }> {
    const validated = ListUsefulLifeAlertsQuerySchema.parse(query);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const referenceDate = new Date();
    const refDate = referenceDate.toISOString().slice(0, 10);
    const expiryExpr = `(asset.purchase_date + (asset.useful_life_months * INTERVAL '1 month'))`;
    const thresholdEndExpr = `(CAST(:refDate AS date) + (:thresholdMonths * INTERVAL '1 month'))`;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(SerializedAsset, 'asset')
        .where('asset.tenant_id = :tenantId', { tenantId })
        .andWhere('asset.purchase_date IS NOT NULL')
        .andWhere('asset.useful_life_months IS NOT NULL')
        .andWhere('asset.current_status NOT IN (:...terminalStatuses)', {
          terminalStatuses: USEFUL_LIFE_ALERT_TERMINAL_STATUSES,
        });

      if (validated.status === 'vencida') {
        qb.andWhere(`${expiryExpr} <= CAST(:refDate AS date)`, { refDate });
      } else if (validated.status === 'por-vencer') {
        qb.andWhere(`${expiryExpr} > CAST(:refDate AS date)`, { refDate }).andWhere(
          `${expiryExpr} <= ${thresholdEndExpr}`,
          { refDate, thresholdMonths: USEFUL_LIFE_ALERT_THRESHOLD_MONTHS },
        );
      } else {
        qb.andWhere(`${expiryExpr} <= ${thresholdEndExpr}`, {
          refDate,
          thresholdMonths: USEFUL_LIFE_ALERT_THRESHOLD_MONTHS,
        });
      }

      // DEF-1: desempate por id para paginación offset estable.
      qb.orderBy('asset.updated_at', 'DESC').addOrderBy('asset.id', 'DESC');

      const { page, limit: pageSize } = clampPage(validated.page, validated.pageSize);

      const total = await qb.getCount();
      const assets = await qb
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getMany();

      const itemIds = [...new Set(assets.map((asset) => asset.inventoryItemId))];
      const items =
        itemIds.length === 0
          ? []
          : await qr.manager.find(InventoryItem, {
              where: { tenantId, id: In(itemIds) },
            });
      const itemById = new Map(items.map((item) => [item.id, item]));

      const data = assets.map((asset) => {
        const usefulLife = calculateUsefulLife({
          usefulLifeMonths: asset.usefulLifeMonths,
          purchaseDate: asset.purchaseDate,
          warrantyUntil: asset.warrantyUntil,
          referenceDate,
        });
        const status: Extract<UsefulLifeStatus, 'por-vencer' | 'vencida'> =
          usefulLife.status === 'por-vencer' || usefulLife.status === 'vencida'
            ? usefulLife.status
            : 'por-vencer';

        const item = itemById.get(asset.inventoryItemId) ?? null;
        return {
          id: asset.id,
          inventoryItemId: asset.inventoryItemId,
          serialNumber: asset.serialNumber,
          assetTag: asset.assetTag,
          currentStatus: asset.currentStatus,
          sku: item?.sku ?? null,
          itemName: item?.name ?? null,
          status,
          monthsRemaining: usefulLife.monthsRemaining,
          monthsTotal: usefulLife.monthsTotal,
          purchaseDate: asset.purchaseDate,
          warrantyUntil: usefulLife.warrantyUntil,
        };
      });

      return {
        data,
        total,
        page,
        pageSize,
        limit: pageSize,
      };
    });
  }

  async getById(
    id: string,
    query?: GetSerializedAssetDetailQueryInput,
  ): Promise<SerializedAssetDetailRecord> {
    const validated = GetSerializedAssetDetailQuerySchema.parse(query ?? {});
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const detail = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const asset = await qr.manager.findOne(SerializedAsset, { where: { id, tenantId } });
      if (!asset) {
        throw new NotFoundException('Activo serializado no encontrado.');
      }

      const [item, currentLocation, purchaseOrigin, loans] = await Promise.all([
        this.resolveItemSummary(qr.manager, tenantId, asset.inventoryItemId),
        asset.currentLocationId
          ? this.resolveLocationSummary(qr.manager, tenantId, asset.currentLocationId)
          : Promise.resolve(null),
        this.resolvePurchaseOrigin(qr.manager, tenantId, asset),
        this.assetLoanService.listForAsset(qr.manager, tenantId, id),
      ]);

      return {
        ...this.toDetailRoot(asset),
        item,
        currentLocation,
        purchaseOrigin,
        usefulLife: calculateUsefulLife({
          usefulLifeMonths: asset.usefulLifeMonths,
          purchaseDate: asset.purchaseDate,
          warrantyUntil: asset.warrantyUntil,
        }),
        loans,
      };
    });

    const [lifecycle, movements] = await Promise.all([
      this.assetLifecycleService.listPaginatedForAsset(
        id,
        validated.lifecyclePage,
        validated.lifecycleLimit,
      ),
      this.stockMovementQueryService.list({
        serializedAssetId: id,
        page: validated.movementsPage,
        limit: validated.movementsLimit,
      }),
    ]);

    return {
      ...detail,
      lifecycle,
      movements,
    };
  }

  normalizeSerial(serialNumber: string): string {
    return serialNumber.trim().toUpperCase();
  }

  async createReceivedAssetWithManager(
    manager: EntityManager,
    input: CreateReceivedAssetInput,
  ): Promise<SerializedAsset> {
    const normalizedSerial = input.serialNumber ? this.normalizeSerial(input.serialNumber) : null;

    if (normalizedSerial) {
      const duplicate = await manager.findOne(SerializedAsset, {
        where: {
          tenantId: input.tenantId,
          normalizedSerialNumber: normalizedSerial,
        },
      });

      if (duplicate) {
        throw new ConflictException(`El serial ${normalizedSerial} ya existe en el tenant.`);
      }
    }

    return manager.save(
      SerializedAsset,
      manager.create(SerializedAsset, {
        tenantId: input.tenantId,
        inventoryItemId: input.inventoryItemId,
        lotId: input.lotId ?? null,
        serialNumber: input.serialNumber?.trim() ?? null,
        normalizedSerialNumber: normalizedSerial,
        macAddress: input.macAddress?.trim() ?? null,
        normalizedMacAddress: input.macAddress ? this.normalizeSerial(input.macAddress) : null,
        assetTag: input.assetTag?.trim() ?? null,
        currentStatus: SerializedAssetStatus.IN_RECEIVING,
        currentLocationId: input.currentLocationId ?? null,
        currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
        currentResponsibleRefId: null,
        subscriberRefId: null,
        contractRefId: null,
        purchaseOrderRef: input.purchaseOrderRef ?? null,
        purchaseDate: input.purchaseDate ?? null,
        usefulLifeMonths: input.usefulLifeMonths ?? null,
        warrantyUntil: input.warrantyUntil ?? null,
      }),
    );
  }

  async resolveForMovementWithManager(
    manager: EntityManager,
    tenantId: string,
    identifiers: {
      serializedAssetId?: string | null | undefined;
      serialNumber?: string | null | undefined;
    },
  ): Promise<SerializedAsset | null> {
    if (identifiers.serializedAssetId) {
      const asset = await manager.findOne(SerializedAsset, {
        where: { id: identifiers.serializedAssetId, tenantId },
      });

      if (!asset) {
        throw new NotFoundException('Activo serializado no encontrado.');
      }

      return asset;
    }

    if (identifiers.serialNumber) {
      const normalizedSerial = this.normalizeSerial(identifiers.serialNumber);
      const asset = await manager.findOne(SerializedAsset, {
        where: { tenantId, normalizedSerialNumber: normalizedSerial },
      });

      if (!asset) {
        throw new NotFoundException('Activo serializado no encontrado.');
      }

      return asset;
    }

    return null;
  }

  async transitionAssetWithManager(
    manager: EntityManager,
    input: TransitionAssetInput,
  ): Promise<SerializedAsset> {
    const asset = await this.resolveForMovementWithManager(manager, input.tenantId, {
      serializedAssetId: input.serializedAssetId,
      serialNumber: input.serialNumber,
    });

    if (!asset) {
      throw new NotFoundException('Activo serializado no encontrado.');
    }

    this.assertStatusTransition(asset.currentStatus, input.toStatus);
    asset.currentStatus = input.toStatus;

    if (input.currentLocationId !== undefined) {
      asset.currentLocationId = input.currentLocationId;
    }

    if (input.currentResponsibleType !== undefined) {
      asset.currentResponsibleType = input.currentResponsibleType;
    }

    if (input.currentResponsibleRefId !== undefined) {
      asset.currentResponsibleRefId = input.currentResponsibleRefId;
    }

    if (input.subscriberRefId !== undefined) {
      asset.subscriberRefId = input.subscriberRefId;
    }

    if (input.contractRefId !== undefined) {
      asset.contractRefId = input.contractRefId;
    }

    return manager.save(SerializedAsset, asset);
  }

  private toDetailRoot(
    asset: SerializedAsset,
  ): Omit<
    SerializedAssetDetailRecord,
    | 'item'
    | 'currentLocation'
    | 'purchaseOrigin'
    | 'usefulLife'
    | 'lifecycle'
    | 'movements'
    | 'loans'
  > {
    return {
      id: asset.id,
      inventoryItemId: asset.inventoryItemId,
      serialNumber: asset.serialNumber,
      macAddress: asset.macAddress,
      assetTag: asset.assetTag,
      currentStatus: asset.currentStatus,
      currentLocationId: asset.currentLocationId,
      currentResponsibleType: asset.currentResponsibleType,
      currentResponsibleRefId: asset.currentResponsibleRefId,
      subscriberRefId: asset.subscriberRefId,
      contractRefId: asset.contractRefId,
      purchaseOrderRef: asset.purchaseOrderRef,
      purchaseDate: asset.purchaseDate,
      usefulLifeMonths: asset.usefulLifeMonths,
      warrantyUntil: asset.warrantyUntil,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private async resolveItemSummary(
    manager: EntityManager,
    tenantId: string,
    inventoryItemId: string,
  ) {
    const item = await manager.findOne(InventoryItem, {
      where: { id: inventoryItemId, tenantId },
      relations: ['inventoryCategory'],
    });

    if (!item) {
      return null;
    }

    const category =
      item.inventoryCategory ??
      (await manager.findOne(InventoryCategory, { where: { id: item.categoryId, tenantId } }));

    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      categoryName: category?.name ?? null,
    };
  }

  private async resolveLocationSummary(
    manager: EntityManager,
    tenantId: string,
    locationId: string,
  ) {
    const location = await manager.findOne(StockLocation, {
      where: { id: locationId, tenantId },
    });

    if (!location) {
      return null;
    }

    return {
      id: location.id,
      code: location.code,
      name: location.name,
      type: location.type,
    };
  }

  private async resolvePurchaseOrigin(
    manager: EntityManager,
    tenantId: string,
    asset: SerializedAsset,
  ): Promise<SerializedAssetPurchaseOrigin | null> {
    if (!asset.purchaseOrderRef) {
      return null;
    }

    const purchaseOrder = await manager.findOne(PurchaseOrder, {
      where: { tenantId, orderNumber: asset.purchaseOrderRef },
    });

    if (!purchaseOrder) {
      return null;
    }

    const receiptLine = await manager
      .createQueryBuilder(StockMovementLine, 'line')
      .innerJoin(
        StockMovement,
        'movement',
        'movement.id = line.movement_id AND movement.tenant_id = line.tenant_id',
      )
      .where('line.tenant_id = :tenantId', { tenantId })
      .andWhere('line.serialized_asset_id = :serializedAssetId', { serializedAssetId: asset.id })
      .andWhere('movement.origin = :origin', { origin: StockMovementOrigin.PURCHASE_RECEIPT })
      .orderBy('movement.created_at', 'ASC')
      .getOne();

    if (!receiptLine) {
      return null;
    }

    const movement = await manager.findOne(StockMovement, {
      where: { id: receiptLine.movementId, tenantId },
    });

    if (!movement?.originRefId) {
      return null;
    }

    const goodsReceipt = await manager.findOne(GoodsReceipt, {
      where: { id: movement.originRefId, tenantId },
    });

    if (!goodsReceipt || goodsReceipt.purchaseOrderId !== purchaseOrder.id) {
      return null;
    }

    const supplierSummary = await this.supplierPartyPort.getSupplierSummary(
      purchaseOrder.partyRefId,
    );

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNumber: purchaseOrder.orderNumber,
      goodsReceiptId: goodsReceipt.id,
      receivedAt: goodsReceipt.receivedAt,
      supplierPartyRefId: purchaseOrder.partyRefId,
      supplierDisplayName: supplierSummary?.displayName ?? null,
      unitCost: receiptLine.unitCost,
    };
  }

  private assertStatusTransition(
    currentStatus: SerializedAssetStatus,
    nextStatus: SerializedAssetStatus,
  ): void {
    if (currentStatus === nextStatus) {
      return;
    }

    if (!ALLOWED_STATUS_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `La transición ${currentStatus} -> ${nextStatus} no está permitida para el activo.`,
      );
    }
  }
}
