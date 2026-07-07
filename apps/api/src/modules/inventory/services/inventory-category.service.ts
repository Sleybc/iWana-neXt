import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryCategory, InventoryItem, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  InventoryCategoryStatus,
  buildTakenCodePrefixSet,
  deriveCategoryCode,
  ensureUniqueCategoryCodePrefix,
  sanitizeAlnumUpper,
  suggestCategoryCodePrefix,
  suggestNextCategorySortOrder,
} from '@iwana/shared';
import {
  CreateInventoryCategoryInput,
  CreateInventoryCategorySchema,
  ListInventoryCategoriesQueryInput,
  ListInventoryCategoriesQuerySchema,
  SuggestInventoryCategoryPrefixQueryInput,
  SuggestInventoryCategoryPrefixQuerySchema,
  UpdateInventoryCategoryInput,
  UpdateInventoryCategorySchema,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  INVENTORY_EVENTS,
  type InventoryCategoryCreatedEvent,
  type InventoryCategoryStatusChangedEvent,
  type InventoryCategoryUpdatedEvent,
} from '../events/inventory.events';

export interface InventoryCategoryWithProductCount extends InventoryCategory {
  productCount: number;
}

export interface SuggestInventoryCategoryPrefixResult {
  code: string;
  codePrefix: string;
  sortOrder: number;
}

@Injectable()
export class InventoryCategoryService {
  private readonly logger = new Logger(InventoryCategoryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitCategoryCreated(category: InventoryCategory, actor: JwtPayload): void {
    const payload: InventoryCategoryCreatedEvent = {
      tenantId: category.tenantId,
      categoryId: category.id,
      actorUserId: actor.sub,
      operation: 'create',
    };

    this.logger.log({
      msg: 'inventory.category-created',
      tenantId: payload.tenantId,
      categoryId: payload.categoryId,
      actorUserId: payload.actorUserId,
      operation: payload.operation,
    });
    this.eventEmitter.emit(INVENTORY_EVENTS.CATEGORY_CREATED, payload);
  }

  private emitCategoryUpdated(category: InventoryCategory, actor: JwtPayload): void {
    const payload: InventoryCategoryUpdatedEvent = {
      tenantId: category.tenantId,
      categoryId: category.id,
      actorUserId: actor.sub,
      operation: 'update',
    };

    this.logger.log({
      msg: 'inventory.category-updated',
      tenantId: payload.tenantId,
      categoryId: payload.categoryId,
      actorUserId: payload.actorUserId,
      operation: payload.operation,
    });
    this.eventEmitter.emit(INVENTORY_EVENTS.CATEGORY_UPDATED, payload);
  }

  private emitCategoryStatusChanged(category: InventoryCategory, actor: JwtPayload): void {
    const payload: InventoryCategoryStatusChangedEvent = {
      tenantId: category.tenantId,
      categoryId: category.id,
      actorUserId: actor.sub,
      operation: 'status-change',
    };

    this.logger.log({
      msg: 'inventory.category-status-changed',
      tenantId: payload.tenantId,
      categoryId: payload.categoryId,
      actorUserId: payload.actorUserId,
      operation: payload.operation,
    });
    this.eventEmitter.emit(INVENTORY_EVENTS.CATEGORY_STATUS_CHANGED, payload);
  }

  async list(
    query: ListInventoryCategoriesQueryInput,
  ): Promise<InventoryCategoryWithProductCount[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListInventoryCategoriesQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(InventoryCategory, 'category')
        .leftJoin(
          InventoryItem,
          'item',
          'item.category_id = category.id AND item.tenant_id = category.tenant_id',
        )
        .select([
          'category.id',
          'category.tenantId',
          'category.code',
          'category.codePrefix',
          'category.name',
          'category.description',
          'category.status',
          'category.sortOrder',
          'category.createdAt',
          'category.updatedAt',
        ])
        .addSelect('COUNT(item.id)', 'productCount')
        .where('category.tenant_id = :tenantId', { tenantId })
        .groupBy('category.id')
        .orderBy('category.sort_order', 'ASC')
        .addOrderBy('category.name', 'ASC');

      if (validated.search) {
        const term = `%${validated.search.toLowerCase()}%`;
        qb.andWhere('(LOWER(category.code) LIKE :term OR LOWER(category.name) LIKE :term)', {
          term,
        });
      }

      if (validated.status) {
        qb.andWhere('category.status = :status', { status: validated.status });
      }

      const rows = await qb.getRawAndEntities();

      return rows.entities.map((category, index) => ({
        ...category,
        productCount: Number(rows.raw[index]?.productCount ?? 0),
      }));
    });
  }

  async getById(id: string): Promise<InventoryCategoryWithProductCount> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const category = await qr.manager.findOne(InventoryCategory, {
        where: { id, tenantId },
      });

      if (!category) {
        throw new NotFoundException('La categoria solicitada no existe.');
      }

      const productCount = await qr.manager.count(InventoryItem, {
        where: { tenantId, categoryId: id },
      });

      return { ...category, productCount };
    });
  }

  async suggestPrefix(
    input: SuggestInventoryCategoryPrefixQueryInput,
  ): Promise<SuggestInventoryCategoryPrefixResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = SuggestInventoryCategoryPrefixQuerySchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const categories = await qr.manager.find(InventoryCategory, {
        where: { tenantId },
        select: ['id', 'codePrefix', 'sortOrder'],
      });

      const takenPrefixes = buildTakenCodePrefixSet(categories, validated.excludeCategoryId);
      const manualPrefix = validated.codePrefix
        ? sanitizeAlnumUpper(validated.codePrefix).slice(0, 8)
        : '';

      const codePrefix =
        manualPrefix.length >= 2
          ? ensureUniqueCategoryCodePrefix(manualPrefix, takenPrefixes, validated.name)
          : suggestCategoryCodePrefix(validated.name, takenPrefixes);

      return {
        code: deriveCategoryCode(validated.name),
        codePrefix,
        sortOrder: suggestNextCategorySortOrder(categories),
      };
    });
  }

  async create(
    input: CreateInventoryCategoryInput,
    actor: JwtPayload,
  ): Promise<InventoryCategoryWithProductCount> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateInventoryCategorySchema.parse(input);

    const category = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existingByCode = await qr.manager.findOne(InventoryCategory, {
        where: { tenantId, code: validated.code },
      });

      if (existingByCode) {
        throw new ConflictException('Ya existe una categoria con ese codigo.');
      }

      const existingByPrefix = await qr.manager.findOne(InventoryCategory, {
        where: { tenantId, codePrefix: validated.codePrefix },
      });

      if (existingByPrefix) {
        throw new ConflictException('Ya existe una categoria con ese prefijo de SKU.');
      }

      return qr.manager.save(
        InventoryCategory,
        qr.manager.create(InventoryCategory, {
          tenantId,
          code: validated.code,
          codePrefix: validated.codePrefix,
          name: validated.name,
          description: validated.description ?? null,
          status: validated.status,
          sortOrder: validated.sortOrder,
        }),
      );
    });

    this.emitCategoryCreated(category, actor);
    return { ...category, productCount: 0 };
  }

  async update(
    id: string,
    input: UpdateInventoryCategoryInput,
    actor: JwtPayload,
  ): Promise<InventoryCategoryWithProductCount> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateInventoryCategorySchema.parse(input);

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existing = await qr.manager.findOne(InventoryCategory, {
        where: { id, tenantId },
      });

      if (!existing) {
        throw new NotFoundException('La categoria solicitada no existe.');
      }

      if (validated.code && validated.code !== existing.code) {
        const duplicate = await qr.manager.findOne(InventoryCategory, {
          where: { tenantId, code: validated.code },
        });

        if (duplicate) {
          throw new ConflictException('Ya existe una categoria con ese codigo.');
        }
      }

      const previousStatus = existing.status;

      if (validated.code !== undefined) existing.code = validated.code;
      if (validated.name !== undefined) existing.name = validated.name;
      if (validated.description !== undefined) existing.description = validated.description ?? null;
      if (validated.status !== undefined) existing.status = validated.status;
      if (validated.sortOrder !== undefined) existing.sortOrder = validated.sortOrder;

      const saved = await qr.manager.save(InventoryCategory, existing);
      const productCount = await qr.manager.count(InventoryItem, {
        where: { tenantId, categoryId: id },
      });

      return { saved, previousStatus, productCount };
    });

    if (validated.status !== undefined && validated.status !== result.previousStatus) {
      this.emitCategoryStatusChanged(result.saved, actor);
    } else {
      this.emitCategoryUpdated(result.saved, actor);
    }

    return { ...result.saved, productCount: result.productCount };
  }

  async resolveCategoryForItem(
    categoryId: string,
    options: { allowInactive?: boolean } = {},
  ): Promise<InventoryCategory> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const category = await qr.manager.findOne(InventoryCategory, {
        where: { id: categoryId, tenantId },
      });

      if (!category) {
        throw new BadRequestException('La categoria indicada no existe.');
      }

      if (!options.allowInactive && category.status !== InventoryCategoryStatus.ACTIVE) {
        throw new BadRequestException('No se puede asignar una categoria inactiva.');
      }

      return category;
    });
  }
}
