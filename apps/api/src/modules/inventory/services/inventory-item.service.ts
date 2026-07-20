import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { InventoryCategory, InventoryItem, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryCategoryStatus,
  InventoryTrackingMode,
  buildCompositeSku,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateInventoryItemInput,
  CreateInventoryItemSchema,
  ListCatalogOptionsQueryInput,
  ListCatalogOptionsQuerySchema,
  ListInventoryItemsQueryInput,
  ListInventoryItemsQuerySchema,
  UpdateInventoryItemInput,
  UpdateInventoryItemSchema,
} from '../dto';
import { CommercialProductReferencePort } from '../ports/commercial-product-reference.port';
import {
  INVENTORY_EVENTS,
  type InventoryCatalogOptionRequestedEvent,
  type InventoryItemCategoryChangedEvent,
  type InventoryItemCreatedEvent,
  type InventoryItemUpdatedEvent,
} from '../events/inventory.events';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { InventoryCategoryService } from './inventory-category.service';

const SKU_GENERATION_RETRY_LIMIT = 3;

type UniqueConstraintDriverError = {
  code?: string;
  constraint?: string;
};

function isSkuUniqueViolation(
  error: unknown,
): error is QueryFailedError & { driverError: UniqueConstraintDriverError } {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as UniqueConstraintDriverError;
  return driverError.code === '23505' && driverError.constraint === 'uq_inventory_items_tenant_sku';
}

export interface InventoryItemResponse {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  itemKind: InventoryItemKind;
  category: InventoryItemCategory;
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  trackingMode: InventoryTrackingMode;
  unitOfMeasure: string;
  baseCost: string;
  minimumStock: string;
  purchasable: boolean;
  inventoryControlled: boolean;
  assetControlled: boolean;
  preferredSupplierRefId: string | null;
  supplierSku: string | null;
  purchaseUnitOfMeasure: string | null;
  purchaseToBaseUomFactor: string | null;
  standardCost: string;
  lastPurchaseCost: string | null;
  averageCost: string;
  reorderPoint: string;
  targetStock: string;
  minimumOrderQty: string | null;
  orderMultiple: string | null;
  leadTimeDays: number | null;
  usefulLifeMonths: number | null;
  commercialReferenceId: string | null;
  status: InventoryItemStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryCatalogOption {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  category: InventoryItemCategory;
  itemKind: InventoryItemKind;
  unitOfMeasure: string;
  purchaseUnitOfMeasure: string | null;
  standardCost: string;
  preferredSupplierRefId: string | null;
  preferredSupplierName: string | null;
  supplierSku: string | null;
}

function legacyCategoryFromCode(code: string): InventoryItemCategory {
  if (Object.values(InventoryItemCategory).includes(code as InventoryItemCategory)) {
    return code as InventoryItemCategory;
  }

  return InventoryItemCategory.OTHER;
}

function mapItemToResponse(
  item: InventoryItem,
  category: InventoryCategory,
): InventoryItemResponse {
  return {
    id: item.id,
    tenantId: item.tenantId,
    sku: item.sku,
    name: item.name,
    description: item.description,
    brand: item.brand,
    model: item.model,
    itemKind: item.itemKind,
    category: item.category,
    categoryId: item.categoryId,
    categoryName: category.name,
    categoryCode: category.code,
    trackingMode: item.trackingMode,
    unitOfMeasure: item.unitOfMeasure,
    baseCost: item.baseCost,
    minimumStock: item.minimumStock,
    purchasable: item.purchasable,
    inventoryControlled: item.inventoryControlled,
    assetControlled: item.assetControlled,
    preferredSupplierRefId: item.preferredSupplierRefId,
    supplierSku: item.supplierSku,
    purchaseUnitOfMeasure: item.purchaseUnitOfMeasure,
    purchaseToBaseUomFactor: item.purchaseToBaseUomFactor,
    standardCost: item.standardCost,
    lastPurchaseCost: item.lastPurchaseCost,
    averageCost: item.averageCost,
    reorderPoint: item.reorderPoint,
    targetStock: item.targetStock,
    minimumOrderQty: item.minimumOrderQty,
    orderMultiple: item.orderMultiple,
    leadTimeDays: item.leadTimeDays,
    usefulLifeMonths: item.usefulLifeMonths,
    commercialReferenceId: item.commercialReferenceId,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function formatOptionalNumeric(value: number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value.toFixed(4).replace(/\.?0+$/, '') || '0';
}

function formatMoney(value: number | null | undefined, fallback = 0): string {
  return (value ?? fallback).toFixed(2);
}

function mapCreateInputToEntity(
  tenantId: string,
  validated: CreateInventoryItemInput,
  category: InventoryCategory,
): Partial<InventoryItem> {
  const assetControlled =
    validated.assetControlled ??
    (validated.trackingMode === InventoryTrackingMode.SERIALIZED ||
      validated.trackingMode === InventoryTrackingMode.FIXED_ASSET);

  return {
    tenantId,
    sku: validated.sku,
    name: validated.name,
    description: validated.description ?? null,
    brand: validated.brand ?? null,
    model: validated.model ?? null,
    itemKind: validated.itemKind,
    categoryId: category.id,
    category: validated.category ?? legacyCategoryFromCode(category.code),
    trackingMode: validated.trackingMode,
    unitOfMeasure: validated.unitOfMeasure,
    baseCost: formatMoney(validated.baseCost),
    minimumStock: formatMoney(validated.minimumStock),
    purchasable: validated.purchasable,
    inventoryControlled: validated.inventoryControlled,
    assetControlled,
    preferredSupplierRefId: validated.preferredSupplierRefId ?? null,
    supplierSku: validated.supplierSku ?? null,
    purchaseUnitOfMeasure: validated.purchaseUnitOfMeasure ?? null,
    purchaseToBaseUomFactor: formatOptionalNumeric(validated.purchaseToBaseUomFactor),
    standardCost: formatMoney(validated.standardCost),
    lastPurchaseCost:
      validated.lastPurchaseCost === null || validated.lastPurchaseCost === undefined
        ? null
        : formatMoney(validated.lastPurchaseCost),
    averageCost: formatMoney(
      validated.averageCost !== undefined && validated.averageCost !== null
        ? validated.averageCost
        : (validated.lastPurchaseCost ?? validated.standardCost ?? validated.baseCost ?? 0),
    ),
    reorderPoint: formatMoney(validated.reorderPoint),
    targetStock: formatMoney(validated.targetStock),
    minimumOrderQty:
      validated.minimumOrderQty === null || validated.minimumOrderQty === undefined
        ? null
        : formatMoney(validated.minimumOrderQty),
    orderMultiple:
      validated.orderMultiple === null || validated.orderMultiple === undefined
        ? null
        : formatMoney(validated.orderMultiple),
    leadTimeDays: validated.leadTimeDays ?? null,
    usefulLifeMonths: validated.usefulLifeMonths ?? null,
    commercialReferenceId: validated.commercialReferenceId ?? null,
    status: validated.status,
  };
}

function mapUpdateInputToEntity(
  validated: UpdateInventoryItemInput,
  category?: InventoryCategory,
): Partial<InventoryItem> {
  const patch: Partial<InventoryItem> = {};

  if (validated.name !== undefined) patch.name = validated.name;
  if (validated.description !== undefined) patch.description = validated.description ?? null;
  if (validated.brand !== undefined) patch.brand = validated.brand ?? null;
  if (validated.model !== undefined) patch.model = validated.model ?? null;
  if (validated.itemKind !== undefined) patch.itemKind = validated.itemKind;
  if (category) {
    patch.categoryId = category.id;
    patch.category = validated.category ?? legacyCategoryFromCode(category.code);
  } else if (validated.category !== undefined) {
    patch.category = validated.category;
  }
  if (validated.trackingMode !== undefined) patch.trackingMode = validated.trackingMode;
  if (validated.unitOfMeasure !== undefined) patch.unitOfMeasure = validated.unitOfMeasure;
  if (validated.baseCost !== undefined) patch.baseCost = formatMoney(validated.baseCost);
  if (validated.minimumStock !== undefined)
    patch.minimumStock = formatMoney(validated.minimumStock);
  if (validated.purchasable !== undefined) patch.purchasable = validated.purchasable;
  if (validated.inventoryControlled !== undefined) {
    patch.inventoryControlled = validated.inventoryControlled;
  }
  if (validated.assetControlled !== undefined) patch.assetControlled = validated.assetControlled;
  if (validated.preferredSupplierRefId !== undefined) {
    patch.preferredSupplierRefId = validated.preferredSupplierRefId ?? null;
  }
  if (validated.supplierSku !== undefined) patch.supplierSku = validated.supplierSku ?? null;
  if (validated.purchaseUnitOfMeasure !== undefined) {
    patch.purchaseUnitOfMeasure = validated.purchaseUnitOfMeasure ?? null;
  }
  if (validated.purchaseToBaseUomFactor !== undefined) {
    patch.purchaseToBaseUomFactor = formatOptionalNumeric(validated.purchaseToBaseUomFactor);
  }
  if (validated.standardCost !== undefined)
    patch.standardCost = formatMoney(validated.standardCost);
  if (validated.lastPurchaseCost !== undefined) {
    patch.lastPurchaseCost =
      validated.lastPurchaseCost === null ? null : formatMoney(validated.lastPurchaseCost);
  }
  if (validated.averageCost !== undefined) {
    patch.averageCost = formatMoney(validated.averageCost);
  }
  if (validated.reorderPoint !== undefined)
    patch.reorderPoint = formatMoney(validated.reorderPoint);
  if (validated.targetStock !== undefined) patch.targetStock = formatMoney(validated.targetStock);
  if (validated.minimumOrderQty !== undefined) {
    patch.minimumOrderQty =
      validated.minimumOrderQty === null ? null : formatMoney(validated.minimumOrderQty);
  }
  if (validated.orderMultiple !== undefined) {
    patch.orderMultiple =
      validated.orderMultiple === null ? null : formatMoney(validated.orderMultiple);
  }
  if (validated.leadTimeDays !== undefined) patch.leadTimeDays = validated.leadTimeDays ?? null;
  if (validated.usefulLifeMonths !== undefined) {
    patch.usefulLifeMonths = validated.usefulLifeMonths ?? null;
  }
  if (validated.commercialReferenceId !== undefined) {
    patch.commercialReferenceId = validated.commercialReferenceId ?? null;
  }
  if (validated.status !== undefined) patch.status = validated.status;

  return patch;
}

@Injectable()
export class InventoryItemService {
  private readonly logger = new Logger(InventoryItemService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly supplierPartyPort: SupplierPartyPort,
    private readonly inventoryCategoryService: InventoryCategoryService,
    private readonly commercialProductReferencePort: CommercialProductReferencePort,
  ) {}

  private async resolveCategoryForCreate(
    validated: CreateInventoryItemInput,
  ): Promise<InventoryCategory> {
    if (validated.categoryId) {
      return this.inventoryCategoryService.resolveCategoryForItem(validated.categoryId);
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const category = await qr.manager.findOne(InventoryCategory, {
        where: { tenantId, code: validated.category! },
      });

      if (!category) {
        throw new BadRequestException('La categoria indicada no existe.');
      }

      if (category.status !== InventoryCategoryStatus.ACTIVE) {
        throw new BadRequestException('No se puede asignar una categoria inactiva.');
      }

      return category;
    });
  }

  private async resolveCategoryForUpdate(
    validated: UpdateInventoryItemInput,
    existing: InventoryItem,
  ): Promise<InventoryCategory | undefined> {
    if (validated.categoryId) {
      return this.inventoryCategoryService.resolveCategoryForItem(validated.categoryId);
    }

    if (validated.category) {
      const { tenantId, schemaName } = TenantContext.getOrThrow();

      return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const category = await qr.manager.findOne(InventoryCategory, {
          where: { tenantId, code: validated.category! },
        });

        if (!category) {
          throw new BadRequestException('La categoria indicada no existe.');
        }

        if (category.status !== InventoryCategoryStatus.ACTIVE) {
          throw new BadRequestException('No se puede asignar una categoria inactiva.');
        }

        return category;
      });
    }

    return undefined;
  }

  private async loadCategoryMap(categoryIds: string[]): Promise<Map<string, InventoryCategory>> {
    const uniqueIds = [...new Set(categoryIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const categories = await qr.manager
        .createQueryBuilder(InventoryCategory, 'category')
        .where('category.tenant_id = :tenantId', { tenantId })
        .andWhere('category.id IN (:...ids)', { ids: uniqueIds })
        .getMany();

      return new Map(categories.map((category) => [category.id, category]));
    });
  }

  private async resolveSupplierNames(
    refIds: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(refIds.filter((id): id is string => Boolean(id)))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const entries = await Promise.all(
      uniqueIds.map(async (partyRefId) => {
        const summary = await this.supplierPartyPort.getSupplierSummary(partyRefId);
        return summary ? ([partyRefId, summary.displayName] as const) : null;
      }),
    );

    return new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null));
  }

  private emitItemCreated(item: InventoryItem, actor: JwtPayload): void {
    const payload: InventoryItemCreatedEvent = {
      tenantId: item.tenantId,
      inventoryItemId: item.id,
      actorUserId: actor.sub,
      sku: item.sku,
      operation: 'create',
    };

    this.logger.log({
      msg: 'inventory.item-created',
      tenantId: payload.tenantId,
      inventoryItemId: payload.inventoryItemId,
      actorUserId: payload.actorUserId,
      operation: payload.operation,
    });
    this.eventEmitter.emit(INVENTORY_EVENTS.ITEM_CREATED, payload);
  }

  private emitItemUpdated(item: InventoryItem, actor: JwtPayload): void {
    const payload: InventoryItemUpdatedEvent = {
      tenantId: item.tenantId,
      inventoryItemId: item.id,
      actorUserId: actor.sub,
      sku: item.sku,
      operation: 'update',
    };

    this.logger.log({
      msg: 'inventory.item-updated',
      tenantId: payload.tenantId,
      inventoryItemId: payload.inventoryItemId,
      actorUserId: payload.actorUserId,
      operation: payload.operation,
    });
    this.eventEmitter.emit(INVENTORY_EVENTS.ITEM_UPDATED, payload);
  }

  private emitItemCategoryChanged(
    item: InventoryItem,
    actor: JwtPayload,
    categoryId: string,
  ): void {
    const payload: InventoryItemCategoryChangedEvent = {
      tenantId: item.tenantId,
      inventoryItemId: item.id,
      categoryId,
      actorUserId: actor.sub,
      operation: 'item-category-changed',
    };

    this.logger.log({
      msg: 'inventory.item-category-changed',
      tenantId: payload.tenantId,
      inventoryItemId: payload.inventoryItemId,
      categoryId: payload.categoryId,
      actorUserId: payload.actorUserId,
      operation: payload.operation,
    });
    this.eventEmitter.emit(INVENTORY_EVENTS.ITEM_CATEGORY_CHANGED, payload);
  }

  private emitCatalogOptionsRequested(
    tenantId: string,
    actor: JwtPayload,
    search: string | undefined,
    resultCount: number,
  ): void {
    const payload: InventoryCatalogOptionRequestedEvent = {
      tenantId,
      actorUserId: actor.sub,
      ...(search ? { search } : {}),
      resultCount,
      operation: 'catalog-options',
    };

    this.logger.log({
      msg: 'inventory.catalog-option-requested',
      tenantId: payload.tenantId,
      actorUserId: payload.actorUserId,
      resultCount: payload.resultCount,
      operation: payload.operation,
    });
    this.eventEmitter.emit(INVENTORY_EVENTS.CATALOG_OPTION_REQUESTED, payload);
  }

  async list(query: ListInventoryItemsQueryInput): Promise<InventoryItemResponse[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListInventoryItemsQuerySchema.parse(query);

    const items = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(InventoryItem, 'item')
        .where('item.tenant_id = :tenantId', { tenantId })
        .orderBy('item.created_at', 'DESC');

      if (validated.search) {
        const term = `%${validated.search.toLowerCase()}%`;
        qb.andWhere(
          "(LOWER(item.sku) LIKE :term OR LOWER(item.name) LIKE :term OR LOWER(COALESCE(item.brand, '')) LIKE :term OR LOWER(COALESCE(item.model, '')) LIKE :term)",
          { term },
        );
      }

      if (validated.categoryId) {
        qb.andWhere('item.category_id = :categoryId', { categoryId: validated.categoryId });
      } else if (validated.category) {
        qb.andWhere('item.category = :category', { category: validated.category });
      }

      if (validated.itemKind) {
        qb.andWhere('item.item_kind = :itemKind', { itemKind: validated.itemKind });
      }

      if (validated.trackingMode) {
        qb.andWhere('item.tracking_mode = :trackingMode', { trackingMode: validated.trackingMode });
      }

      if (validated.status) {
        qb.andWhere('item.status = :status', { status: validated.status });
      }

      if (validated.purchasable !== undefined) {
        qb.andWhere('item.purchasable = :purchasable', { purchasable: validated.purchasable });
      }

      if (validated.preferredSupplierRefId) {
        qb.andWhere('item.preferred_supplier_ref_id = :preferredSupplierRefId', {
          preferredSupplierRefId: validated.preferredSupplierRefId,
        });
      }

      if (validated.commercialReferenceId) {
        qb.andWhere('item.commercial_reference_id = :commercialReferenceId', {
          commercialReferenceId: validated.commercialReferenceId,
        });
      }

      return qb.getMany();
    });

    const categoryMap = await this.loadCategoryMap(items.map((item) => item.categoryId));

    return items.map((item) => {
      const category = categoryMap.get(item.categoryId);
      if (!category) {
        throw new NotFoundException('No se pudo resolver la categoria del producto.');
      }

      return mapItemToResponse(item, category);
    });
  }

  async getById(id: string): Promise<InventoryItemResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const item = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const found = await qr.manager.findOne(InventoryItem, {
        where: { id, tenantId },
      });

      if (!found) {
        throw new NotFoundException('El articulo de inventario solicitado no existe.');
      }

      return found;
    });

    const categoryMap = await this.loadCategoryMap([item.categoryId]);
    const category = categoryMap.get(item.categoryId);

    if (!category) {
      throw new NotFoundException('No se pudo resolver la categoria del producto.');
    }

    return mapItemToResponse(item, category);
  }

  async create(input: CreateInventoryItemInput, actor: JwtPayload): Promise<InventoryItemResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateInventoryItemSchema.parse(input);
    await this.assertCommercialReferenceValid(validated.commercialReferenceId);
    const category = await this.resolveCategoryForCreate(validated);

    const item = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (validated.sku) {
        const existing = await qr.manager.findOne(InventoryItem, {
          where: {
            tenantId,
            sku: validated.sku,
          },
        });

        if (existing) {
          throw new ConflictException('Ya existe un item de inventario con ese SKU.');
        }

        return qr.manager.save(
          InventoryItem,
          qr.manager.create(InventoryItem, mapCreateInputToEntity(tenantId, validated, category)),
        );
      }

      for (let attempt = 0; attempt < SKU_GENERATION_RETRY_LIMIT; attempt += 1) {
        const generatedSku = this.generateSku(category.codePrefix, validated, attempt);
        const inputWithSku: CreateInventoryItemInput = { ...validated, sku: generatedSku };

        try {
          return await qr.manager.save(
            InventoryItem,
            qr.manager.create(
              InventoryItem,
              mapCreateInputToEntity(tenantId, inputWithSku, category),
            ),
          );
        } catch (error) {
          if (attempt === SKU_GENERATION_RETRY_LIMIT - 1 && isSkuUniqueViolation(error)) {
            throw new ConflictException('No fue posible generar un SKU unico para el producto.');
          }

          if (!isSkuUniqueViolation(error)) {
            throw error;
          }
        }
      }

      throw new ConflictException('No fue posible generar un SKU unico para el producto.');
    });

    this.emitItemCreated(item, actor);
    return mapItemToResponse(item, category);
  }

  private generateSku(
    codePrefix: string,
    input: CreateInventoryItemInput,
    attempt: number,
  ): string {
    return buildCompositeSku(
      {
        categoryCodePrefix: codePrefix,
        itemKind: input.itemKind,
        name: input.name,
        brand: input.brand,
        model: input.model,
      },
      attempt,
    );
  }

  async update(
    id: string,
    input: UpdateInventoryItemInput,
    actor: JwtPayload,
  ): Promise<InventoryItemResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateInventoryItemSchema.parse(input);
    await this.assertCommercialReferenceValid(validated.commercialReferenceId);

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existing = await qr.manager.findOne(InventoryItem, {
        where: { id, tenantId },
      });

      if (!existing) {
        throw new NotFoundException('El articulo de inventario solicitado no existe.');
      }

      const category = await this.resolveCategoryForUpdate(validated, existing);

      const mergedForValidation = {
        ...existing,
        ...validated,
        categoryId: category?.id ?? existing.categoryId,
        category: validated.category ?? existing.category,
        trackingMode: validated.trackingMode ?? existing.trackingMode,
        assetControlled: validated.assetControlled ?? existing.assetControlled,
        purchaseUnitOfMeasure:
          validated.purchaseUnitOfMeasure !== undefined
            ? validated.purchaseUnitOfMeasure
            : existing.purchaseUnitOfMeasure,
        purchaseToBaseUomFactor:
          validated.purchaseToBaseUomFactor !== undefined
            ? validated.purchaseToBaseUomFactor
            : existing.purchaseToBaseUomFactor
              ? Number(existing.purchaseToBaseUomFactor)
              : null,
        reorderPoint:
          validated.reorderPoint !== undefined
            ? validated.reorderPoint
            : Number(existing.reorderPoint),
      };

      const validation = CreateInventoryItemSchema.safeParse({
        sku: mergedForValidation.sku,
        name: mergedForValidation.name,
        categoryId: mergedForValidation.categoryId,
        category: mergedForValidation.category,
        trackingMode: mergedForValidation.trackingMode,
        unitOfMeasure: mergedForValidation.unitOfMeasure,
        assetControlled: mergedForValidation.assetControlled,
        purchaseUnitOfMeasure: mergedForValidation.purchaseUnitOfMeasure,
        purchaseToBaseUomFactor: mergedForValidation.purchaseToBaseUomFactor,
        reorderPoint: mergedForValidation.reorderPoint,
      });

      if (!validation.success) {
        throw new BadRequestException(
          validation.error.issues[0]?.message ?? 'Datos de articulo invalidos.',
        );
      }

      const previousCategoryId = existing.categoryId;
      Object.assign(existing, mapUpdateInputToEntity(validated, category));
      const saved = await qr.manager.save(InventoryItem, existing);

      const resolvedCategory =
        category ??
        (await qr.manager.findOne(InventoryCategory, {
          where: { id: saved.categoryId, tenantId },
        }));

      if (!resolvedCategory) {
        throw new NotFoundException('No se pudo resolver la categoria del producto.');
      }

      return { saved, resolvedCategory, previousCategoryId };
    });

    if (result.previousCategoryId !== result.saved.categoryId) {
      this.emitItemCategoryChanged(result.saved, actor, result.saved.categoryId);
    }

    this.emitItemUpdated(result.saved, actor);
    return mapItemToResponse(result.saved, result.resolvedCategory);
  }

  async delete(id: string, actor: JwtPayload): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existing = await qr.manager.findOne(InventoryItem, {
        where: { id, tenantId },
      });

      if (!existing) {
        throw new NotFoundException('El articulo de inventario solicitado no existe.');
      }

      await this.assertItemCanBeDeleted(qr.manager, tenantId, id);
      await qr.manager.delete(InventoryItem, { id, tenantId });
    });

    this.logger.log({
      msg: 'inventory.item-deleted',
      tenantId,
      inventoryItemId: id,
      actorUserId: actor.sub,
      operation: 'delete',
    });
  }

  private async assertItemCanBeDeleted(
    manager: EntityManager,
    tenantId: string,
    itemId: string,
  ): Promise<void> {
    const [flags] = (await manager.query(
      `
        SELECT
          EXISTS(SELECT 1 FROM stock_balances WHERE tenant_id = $1 AND item_id = $2) AS has_balances,
          EXISTS(SELECT 1 FROM stock_lots WHERE tenant_id = $1 AND item_id = $2) AS has_lots,
          EXISTS(
            SELECT 1 FROM serialized_assets WHERE tenant_id = $1 AND inventory_item_id = $2
          ) AS has_assets,
          EXISTS(SELECT 1 FROM purchase_order_lines WHERE tenant_id = $1 AND item_id = $2) AS has_po_lines,
          EXISTS(SELECT 1 FROM stock_movement_lines WHERE tenant_id = $1 AND item_id = $2) AS has_movements,
          EXISTS(SELECT 1 FROM goods_receipt_lines WHERE tenant_id = $1 AND item_id = $2) AS has_receipts,
          EXISTS(SELECT 1 FROM inventory_write_offs WHERE tenant_id = $1 AND item_id = $2) AS has_writeoffs
      `,
      [tenantId, itemId],
    )) as Array<Record<string, boolean>>;

    if (!flags) {
      return;
    }

    if (Object.values(flags).some(Boolean)) {
      throw new BadRequestException(
        'No se puede eliminar el producto porque tiene stock, activos o movimientos asociados.',
      );
    }
  }

  async listCatalogOptions(
    query: ListCatalogOptionsQueryInput,
    actor: JwtPayload,
  ): Promise<InventoryCatalogOption[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListCatalogOptionsQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(InventoryItem, 'item')
        .innerJoinAndSelect('item.inventoryCategory', 'category')
        .select([
          'item.id',
          'item.sku',
          'item.name',
          'item.category',
          'item.categoryId',
          'item.itemKind',
          'item.unitOfMeasure',
          'item.purchaseUnitOfMeasure',
          'item.standardCost',
          'item.preferredSupplierRefId',
          'item.supplierSku',
          'category.id',
          'category.name',
          'category.code',
        ])
        .where('item.tenant_id = :tenantId', { tenantId })
        .andWhere('item.status = :status', { status: InventoryItemStatus.ACTIVE })
        .andWhere('item.purchasable = TRUE')
        .orderBy('item.name', 'ASC');

      if (validated.search) {
        const term = `%${validated.search.toLowerCase()}%`;
        qb.andWhere('(LOWER(item.sku) LIKE :term OR LOWER(item.name) LIKE :term)', { term });
      }

      const items = await qb.getMany();
      const supplierNames = await this.resolveSupplierNames(
        items.map((item) => item.preferredSupplierRefId),
      );

      const options = items.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        categoryId: item.categoryId,
        categoryName: item.inventoryCategory.name,
        categoryCode: item.inventoryCategory.code,
        category: item.category,
        itemKind: item.itemKind,
        unitOfMeasure: item.unitOfMeasure,
        purchaseUnitOfMeasure: item.purchaseUnitOfMeasure,
        standardCost: item.standardCost,
        preferredSupplierRefId: item.preferredSupplierRefId,
        preferredSupplierName: item.preferredSupplierRefId
          ? (supplierNames.get(item.preferredSupplierRefId) ?? null)
          : null,
        supplierSku: item.supplierSku,
      }));

      this.emitCatalogOptionsRequested(tenantId, actor, validated.search, options.length);
      return options;
    });
  }

  private async assertCommercialReferenceValid(
    commercialReferenceId: string | null | undefined,
  ): Promise<void> {
    if (commercialReferenceId === undefined || commercialReferenceId === null) {
      return;
    }

    const reference =
      await this.commercialProductReferencePort.resolveProductReference(commercialReferenceId);

    if (!reference) {
      throw new BadRequestException(
        'La referencia comercial no existe o no corresponde a un producto adicional activo.',
      );
    }
  }
}
