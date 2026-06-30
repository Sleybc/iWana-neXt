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
import { InventoryCategoryStatus } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateInventoryCategoryInput,
  CreateInventoryCategorySchema,
  ListInventoryCategoriesQueryInput,
  ListInventoryCategoriesQuerySchema,
  UpdateInventoryCategoryInput,
  UpdateInventoryCategorySchema,
} from '../dto';
import {
  INVENTORY_EVENTS,
  type InventoryCategoryCreatedEvent,
  type InventoryCategoryStatusChangedEvent,
  type InventoryCategoryUpdatedEvent,
} from '../events/inventory.events';

export interface InventoryCategoryWithProductCount extends InventoryCategory {
  productCount: number;
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

  async list(query: ListInventoryCategoriesQueryInput): Promise<InventoryCategoryWithProductCount[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListInventoryCategoriesQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(InventoryCategory, 'category')
        .leftJoin(InventoryItem, 'item', 'item.category_id = category.id AND item.tenant_id = category.tenant_id')
        .select([
          'category.id',
          'category.tenantId',
          'category.code',
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
        qb.andWhere(
          '(LOWER(category.code) LIKE :term OR LOWER(category.name) LIKE :term)',
          { term },
        );
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

  async create(
    input: CreateInventoryCategoryInput,
    actor: JwtPayload,
  ): Promise<InventoryCategoryWithProductCount> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateInventoryCategorySchema.parse(input);

    const category = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existing = await qr.manager.findOne(InventoryCategory, {
        where: { tenantId, code: validated.code },
      });

      if (existing) {
        throw new ConflictException('Ya existe una categoria con ese codigo.');
      }

      return qr.manager.save(
        InventoryCategory,
        qr.manager.create(InventoryCategory, {
          tenantId,
          code: validated.code,
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
