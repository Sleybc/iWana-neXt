import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CatalogPromotion } from '../entities/catalog-promotion.entity';
import { CreatePromotionDto, UpdatePromotionDto } from '../dto/promotion.dto';
import { COMMERCIAL_EVENTS } from '../events/commercial.events';

@Injectable()
export class PromotionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<CatalogPromotion[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(CatalogPromotion, {
        where: { tenantId, isActive: true },
        order: { validFrom: 'DESC' },
      }),
    );
  }

  async findOne(id: string): Promise<CatalogPromotion> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(CatalogPromotion, { where: { id, tenantId } }),
    );
    if (!entity) throw new NotFoundException(`Promoción ${id} no encontrada`);
    return entity;
  }

  async create(dto: CreatePromotionDto, createdBy: string): Promise<CatalogPromotion> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar código único por tenant
      const existing = await qr.manager.findOne(CatalogPromotion, {
        where: { tenantId, code: dto.code },
      });
      if (existing) {
        throw new ConflictException(
          `Ya existe una promoción con código '${dto.code}' en este tenant`,
        );
      }

      const entity = qr.manager.create(CatalogPromotion, {
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description ?? null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        appliesTo: dto.appliesTo,
        targetItemId: dto.targetItemId ?? null,
        targetBundleId: dto.targetBundleId ?? null,
        targetSegments: (dto.targetSegments ?? null) as any,
        maxUses: dto.maxUses ?? null,
        currentUses: 0,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
        isActive: true,
        createdBy,
      });

      const saved = await qr.manager.save(CatalogPromotion, entity);

      this.eventEmitter.emit(COMMERCIAL_EVENTS.PROMOTION_STARTED, {
        promotionId: saved.id,
        code: saved.code,
        validFrom: saved.validFrom,
        validTo: saved.validTo,
        tenantId,
      });

      return saved;
    });
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<CatalogPromotion> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(CatalogPromotion, { where: { id, tenantId } });
      if (!entity) throw new NotFoundException(`Promoción ${id} no encontrada`);
      Object.assign(entity, {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.validTo !== undefined && { validTo: new Date(dto.validTo) }),
      });
      return qr.manager.save(CatalogPromotion, entity);
    });
  }

  async deactivate(id: string): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(CatalogPromotion, { where: { id, tenantId } });
      if (!entity) throw new NotFoundException(`Promoción ${id} no encontrada`);
      entity.isActive = false;
      entity.validTo = entity.validTo ?? new Date();
      await qr.manager.save(CatalogPromotion, entity);
    });
  }

  /**
   * Incrementa el contador de usos de una promoción.
   * Si se alcanza maxUses, la desactiva automáticamente.
   * Debe llamarse dentro de una transacción externa de facturación.
   */
  async incrementUse(id: string): Promise<CatalogPromotion> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const promotion = await qr.manager.findOne(CatalogPromotion, {
        where: { id, tenantId, isActive: true },
      });
      if (!promotion) {
        throw new NotFoundException(`Promoción activa ${id} no encontrada`);
      }

      // Verificar vigencia temporal
      const now = new Date();
      if (now < promotion.validFrom || now > promotion.validTo) {
        throw new BadRequestException('La promoción está fuera de su período de vigencia');
      }

      promotion.currentUses += 1;

      // Verificar si se alcanzó el límite
      if (promotion.maxUses !== null && promotion.currentUses >= promotion.maxUses) {
        promotion.isActive = false;
        this.eventEmitter.emit(COMMERCIAL_EVENTS.PROMOTION_EXPIRED, {
          promotionId: promotion.id,
          code: promotion.code,
          totalUses: promotion.currentUses,
          tenantId,
        });
      }

      return qr.manager.save(CatalogPromotion, promotion);
    });
  }
}
