import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CatalogItemType } from '@iwana/shared';
import { CatalogItem } from '../entities/catalog-item.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ServiceDetail } from '../entities/service-detail.entity';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import { CreateCatalogItemDto } from '../dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from '../dto/update-catalog-item.dto';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import { COMMERCIAL_EVENTS } from '../events/commercial.events';
import { CustomerSegment } from '@iwana/shared';

export interface CatalogItemWithDetail extends CatalogItem {
  downloadSpeedMbps?: number | undefined;
  uploadSpeedMbps?: number | undefined;
  technology?: string | undefined;
  installationRule?: string | undefined;
  category?: string | undefined;
  isLoan?: boolean | undefined;
  requiresInventory?: boolean | undefined;
  chargeType?: string | undefined;
  currentPrice?: string | null | undefined;
  installationFee?: string | null | undefined;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(query: CatalogQueryDto): Promise<{ data: CatalogItemWithDetail[]; total: number }> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const { page = 1, limit = 20, type, name, isActive } = query;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(CatalogItem, 'ci')
        .where('ci.tenant_id = :tenantId', { tenantId })
        .andWhere('ci.deleted_at IS NULL')
        .orderBy('ci.name', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      if (type) qb.andWhere('ci.type = :type', { type });
      if (name) qb.andWhere('ci.name ILIKE :name', { name: `%${name}%` });
      if (isActive !== undefined) qb.andWhere('ci.is_active = :isActive', { isActive });

      const [data, total] = await qb.getManyAndCount();
      const hydrated = await Promise.all(data.map((item) => this._hydrateItem(qr.manager, item)));
      return { data: hydrated, total };
    });
  }

  async findOne(id: string): Promise<CatalogItemWithDetail> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const item = await qr.manager.findOne(CatalogItem, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!item) return null;
      return this._hydrateItem(qr.manager, item);
    });
    if (!entity) throw new NotFoundException(`CatalogItem ${id} no encontrado`);
    return entity;
  }

  async create(dto: CreateCatalogItemDto): Promise<CatalogItem> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    this._validateDetailRequired(dto);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const item = qr.manager.create(CatalogItem, {
        tenantId,
        type: dto.type,
        name: dto.name,
        description: dto.description ?? null,
        taxClassificationId: dto.taxClassificationId ?? null,
        retentionApplicable: dto.retentionApplicable ?? false,
        isActive: true,
      });
      await qr.manager.save(CatalogItem, item);

      // Crear registro de detalle según el tipo
      await this._createDetail(qr.manager, item.id, dto);

      return item;
    });
  }

  async update(id: string, dto: UpdateCatalogItemDto): Promise<CatalogItem> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const item = await qr.manager.findOne(CatalogItem, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!item) throw new NotFoundException(`CatalogItem ${id} no encontrado`);

      const wasActive = item.isActive;
      Object.assign(item, {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.taxClassificationId !== undefined && {
          taxClassificationId: dto.taxClassificationId,
        }),
        ...(dto.retentionApplicable !== undefined && {
          retentionApplicable: dto.retentionApplicable,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      });
      await qr.manager.save(CatalogItem, item);

      // Actualizar detalle específico — TypeORM lanza si se pasa un partial vacío {}; guardamos antes.
      if (item.type === CatalogItemType.PLAN) {
        const planUpdate = {
          ...(dto.downloadSpeedMbps !== undefined && { downloadSpeedMbps: dto.downloadSpeedMbps }),
          ...(dto.uploadSpeedMbps !== undefined && { uploadSpeedMbps: dto.uploadSpeedMbps }),
          ...(dto.technology !== undefined && { technology: dto.technology }),
          ...(dto.installationRule !== undefined && { installationRule: dto.installationRule }),
        };
        if (Object.keys(planUpdate).length > 0) {
          await qr.manager.update(PlanDetail, { itemId: id }, planUpdate);
        }
      } else if (item.type === CatalogItemType.PRODUCT) {
        const productUpdate = {
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.isLoan !== undefined && { isLoan: dto.isLoan }),
          ...(dto.requiresInventory !== undefined && { requiresInventory: dto.requiresInventory }),
        };
        if (Object.keys(productUpdate).length > 0) {
          await qr.manager.update(ProductDetail, { itemId: id }, productUpdate);
        }
      } else if (item.type === CatalogItemType.SERVICE) {
        const serviceUpdate = {
          ...(dto.chargeType !== undefined && { chargeType: dto.chargeType }),
        };
        if (Object.keys(serviceUpdate).length > 0) {
          await qr.manager.update(ServiceDetail, { itemId: id }, serviceUpdate);
        }
      }

      // Emitir evento si se desactivó el ítem
      if (wasActive && dto.isActive === false) {
        this.eventEmitter.emit(COMMERCIAL_EVENTS.ITEM_DEACTIVATED, {
          itemId: item.id,
          name: item.name,
          deactivatedBy: tenantId,
        });
      }

      return this._hydrateItem(qr.manager, item);
    });
  }

  /** Soft delete */
  async remove(id: string): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const item = await qr.manager.findOne(CatalogItem, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!item) throw new NotFoundException(`CatalogItem ${id} no encontrado`);
      item.deletedAt = new Date();
      item.isActive = false;
      await qr.manager.save(CatalogItem, item);
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _validateDetailRequired(dto: CreateCatalogItemDto): void {
    if (dto.type === CatalogItemType.PLAN) {
      if (!dto.downloadSpeedMbps || !dto.uploadSpeedMbps || !dto.technology) {
        throw new BadRequestException(
          'Para type=PLAN se requieren downloadSpeedMbps, uploadSpeedMbps y technology',
        );
      }
    } else if (dto.type === CatalogItemType.PRODUCT) {
      if (!dto.category) {
        throw new BadRequestException('Para type=PRODUCT se requiere category');
      }
    } else if (dto.type === CatalogItemType.SERVICE) {
      if (!dto.chargeType) {
        throw new BadRequestException('Para type=SERVICE se requiere chargeType');
      }
    }
  }

  private async _createDetail(
    manager: DataSource['manager'],
    itemId: string,
    dto: CreateCatalogItemDto,
  ): Promise<void> {
    if (dto.type === CatalogItemType.PLAN) {
      const detail = manager.create(PlanDetail, {
        itemId,
        downloadSpeedMbps: dto.downloadSpeedMbps!,
        uploadSpeedMbps: dto.uploadSpeedMbps!,
        technology: dto.technology!,
        installationRule: dto.installationRule ?? ('ALWAYS' as any),
      });
      await manager.save(PlanDetail, detail);
    } else if (dto.type === CatalogItemType.PRODUCT) {
      const detail = manager.create(ProductDetail, {
        itemId,
        category: dto.category!,
        isLoan: dto.isLoan ?? false,
        requiresInventory: dto.requiresInventory ?? false,
      });
      await manager.save(ProductDetail, detail);
    } else if (dto.type === CatalogItemType.SERVICE) {
      const detail = manager.create(ServiceDetail, {
        itemId,
        chargeType: dto.chargeType!,
      });
      await manager.save(ServiceDetail, detail);
    }
  }

  private async _hydrateItem(
    manager: DataSource['manager'],
    item: CatalogItem,
  ): Promise<CatalogItemWithDetail> {
    const base: CatalogItemWithDetail = { ...item };

    if (item.type === CatalogItemType.PLAN) {
      const detail = await manager.findOne(PlanDetail, { where: { itemId: item.id } });
      const price = await manager.findOne(CatalogPriceHistory, {
        where: {
          itemId: item.id,
          customerSegment: CustomerSegment.RESIDENTIAL,
          isCurrent: true,
        },
      });
      return {
        ...base,
        downloadSpeedMbps: detail?.downloadSpeedMbps,
        uploadSpeedMbps: detail?.uploadSpeedMbps,
        technology: detail?.technology,
        installationRule: detail?.installationRule,
        currentPrice: price?.basePrice ?? null,
        installationFee: price?.installationFee ?? null,
      };
    }

    if (item.type === CatalogItemType.PRODUCT) {
      const detail = await manager.findOne(ProductDetail, { where: { itemId: item.id } });
      return {
        ...base,
        category: detail?.category,
        isLoan: detail?.isLoan,
        requiresInventory: detail?.requiresInventory,
      };
    }

    const detail = await manager.findOne(ServiceDetail, { where: { itemId: item.id } });
    const price = await manager.findOne(CatalogPriceHistory, {
      where: {
        itemId: item.id,
        customerSegment: CustomerSegment.RESIDENTIAL,
        isCurrent: true,
      },
    });
    return {
      ...base,
      chargeType: detail?.chargeType,
      currentPrice: price?.basePrice ?? null,
      installationFee: price?.installationFee ?? null,
    };
  }
}
