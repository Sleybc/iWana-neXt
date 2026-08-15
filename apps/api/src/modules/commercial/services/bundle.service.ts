import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CustomerSegment } from '@iwana/shared';
import { CatalogBundle } from '../entities/catalog-bundle.entity';
import { CatalogBundleItem } from '../entities/catalog-bundle-item.entity';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import { CatalogItem } from '../entities/catalog-item.entity';
import { CreateBundleDto, UpdateBundleDto } from '../dto/bundle.dto';
import { CommercialOfferListQueryDto } from '../dto/commercial-offer-list-query.dto';
import { COMMERCIAL_EVENTS } from '../events/commercial.events';
import { BUNDLE_EXPIRING_SQL, commercialExpiringParams } from '../utils/commercial-offer-filters';
import {
  buildNameIdNextCursor,
  clampCommercialLimit,
  CommercialPaginatedResult,
  decodeNameIdCursor,
} from '../../../common/pagination';

export interface BundleDetailResult extends CatalogBundle {
  items: Array<{
    itemId: string;
    isRequired: boolean;
    sortOrder: number;
    item: CatalogItem | null;
  }>;
}

/** Bundle de listado con conteo de ítems (evita N+1 de detalle en el portal). */
export interface BundleListItem extends CatalogBundle {
  itemCount: number;
}

export interface BundlePriceResult {
  bundleId: string;
  segment: CustomerSegment;
  subtotal: string;
  discount: string;
  total: string;
  breakdown: Array<{ itemId: string; name: string; price: string }>;
}

@Injectable()
export class BundleService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Lista bundles activos con paginación cursor (ADR-064).
   * Orden: name ASC, id ASC. Incluye itemCount por bundle de la página.
   * `offerStatus=expiring` → vigencia en ventana de 7 días.
   */
  async findAll(
    query: CommercialOfferListQueryDto = {},
  ): Promise<CommercialPaginatedResult<BundleListItem>> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const limit = clampCommercialLimit(query.limit);
    const { cursor, offerStatus } = query;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(CatalogBundle, 'bundle')
        .where('bundle.tenant_id = :tenantId', { tenantId })
        .andWhere('bundle.is_active = true');

      if (offerStatus === 'expiring') {
        qb.andWhere(BUNDLE_EXPIRING_SQL, commercialExpiringParams());
      }

      const total = await qb.clone().getCount();

      if (cursor) {
        const decoded = decodeNameIdCursor(cursor);
        qb.andWhere(
          '(bundle.name > :cursorName OR (bundle.name = :cursorName AND bundle.id > :cursorId))',
          { cursorName: decoded.n, cursorId: decoded.i },
        );
      }

      const bundles = await qb
        .orderBy('bundle.name', 'ASC')
        .addOrderBy('bundle.id', 'ASC')
        .take(limit + 1)
        .getMany();

      const hasNext = bundles.length > limit;
      const page = hasNext ? bundles.slice(0, limit) : bundles;
      const ids = page.map((b) => b.id);
      const countMap = new Map<string, number>();

      if (ids.length > 0) {
        const countRows = await qr.manager
          .createQueryBuilder(CatalogBundleItem, 'item')
          .select('item.bundle_id', 'bundleId')
          .addSelect('COUNT(item.id)', 'itemCount')
          .where('item.bundle_id IN (:...ids)', { ids })
          .groupBy('item.bundle_id')
          .getRawMany<{ bundleId: string; itemCount: string }>();

        for (const row of countRows) {
          countMap.set(row.bundleId, Number(row.itemCount ?? 0));
        }
      }

      const last = page[page.length - 1];
      return {
        data: page.map((bundle) => ({
          ...bundle,
          itemCount: countMap.get(bundle.id) ?? 0,
        })),
        meta: {
          nextCursor: buildNameIdNextCursor(hasNext, last),
          total,
        },
      };
    });
  }

  async findOne(id: string): Promise<BundleDetailResult> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const bundle = await qr.manager.findOne(CatalogBundle, { where: { id, tenantId } });
      if (!bundle) return null;
      const bundleItems = await qr.manager.find(CatalogBundleItem, {
        where: { bundleId: bundle.id },
        order: { sortOrder: 'ASC' },
      });
      const itemIds = bundleItems.map((item) => item.itemId);
      const resolvedItems = itemIds.length
        ? await qr.manager
            .createQueryBuilder(CatalogItem, 'ci')
            .where('ci.id = ANY(:ids)', { ids: itemIds })
            .getMany()
        : [];
      const itemMap = new Map(resolvedItems.map((item) => [item.id, item]));

      return {
        ...bundle,
        items: bundleItems.map((bundleItem) => ({
          itemId: bundleItem.itemId,
          isRequired: bundleItem.isRequired,
          sortOrder: bundleItem.sortOrder,
          item: itemMap.get(bundleItem.itemId) ?? null,
        })),
      };
    });
    if (!entity) throw new NotFoundException(`Bundle ${id} no encontrado`);
    return entity;
  }

  async create(dto: CreateBundleDto): Promise<CatalogBundle> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    if (dto.itemIds.length < 2) {
      throw new BadRequestException('Un bundle requiere al menos 2 ítems');
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar que todos los ítems existen y están activos
      const items = await qr.manager
        .createQueryBuilder(CatalogItem, 'ci')
        .where('ci.id = ANY(:ids)', { ids: dto.itemIds })
        .andWhere('ci.tenant_id = :tenantId', { tenantId })
        .andWhere('ci.is_active = true')
        .andWhere('ci.deleted_at IS NULL')
        .getMany();

      if (items.length !== dto.itemIds.length) {
        throw new BadRequestException('Uno o más ítems del bundle no existen o no están activos');
      }

      const bundle = qr.manager.create(CatalogBundle, {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        isActive: true,
      });
      await qr.manager.save(CatalogBundle, bundle);

      const optionalSet = new Set(dto.optionalItemIds ?? []);
      const bundleItems = dto.itemIds.map((itemId, idx) =>
        qr.manager.create(CatalogBundleItem, {
          bundleId: bundle.id,
          itemId,
          isRequired: !optionalSet.has(itemId),
          sortOrder: idx,
        }),
      );
      await qr.manager.save(CatalogBundleItem, bundleItems);

      this.eventEmitter.emit(COMMERCIAL_EVENTS.BUNDLE_CREATED, {
        bundleId: bundle.id,
        name: bundle.name,
        itemIds: dto.itemIds,
        tenantId,
      });

      return bundle;
    });
  }

  async update(id: string, dto: UpdateBundleDto): Promise<CatalogBundle> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(CatalogBundle, { where: { id, tenantId } });
      if (!entity) throw new NotFoundException(`Bundle ${id} no encontrado`);
      Object.assign(entity, {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.discountType !== undefined && { discountType: dto.discountType }),
        ...(dto.discountValue !== undefined && { discountValue: dto.discountValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.validFrom !== undefined && { validFrom: new Date(dto.validFrom) }),
        ...(dto.validTo !== undefined && { validTo: new Date(dto.validTo) }),
      });
      return qr.manager.save(CatalogBundle, entity);
    });
  }

  async deactivate(id: string): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const bundle = await qr.manager.findOne(CatalogBundle, { where: { id, tenantId } });
      if (!bundle) throw new NotFoundException(`Bundle ${id} no encontrado`);
      bundle.isActive = false;
      bundle.validTo = bundle.validTo ?? new Date();
      await qr.manager.save(CatalogBundle, bundle);
    });
  }

  /**
   * Calcula el precio total de un bundle para un segmento dado.
   * Suma precios vigentes de ítems requeridos + opcionales seleccionados,
   * luego aplica el descuento configurado del bundle.
   */
  async calculatePrice(
    bundleId: string,
    segment: CustomerSegment,
    selectedOptionalItemIds: string[] = [],
  ): Promise<BundlePriceResult> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const bundle = await qr.manager.findOne(CatalogBundle, { where: { id: bundleId, tenantId } });
      if (!bundle) throw new NotFoundException(`Bundle ${bundleId} no encontrado`);

      const bundleItems = await qr.manager.find(CatalogBundleItem, { where: { bundleId } });
      const requiredItemIds = bundleItems.filter((bi) => bi.isRequired).map((bi) => bi.itemId);
      const optionalIds = new Set(
        bundleItems.filter((bi) => !bi.isRequired).map((bi) => bi.itemId),
      );
      const extraOptional = selectedOptionalItemIds.filter((id) => !optionalIds.has(id));
      if (extraOptional.length) {
        throw new BadRequestException(
          'Los ítems opcionales seleccionados no pertenecen a este combo',
        );
      }
      const itemIdsToPrice = [...new Set([...requiredItemIds, ...selectedOptionalItemIds])];

      // Obtener precios vigentes para todos los ítems
      const prices = await qr.manager
        .createQueryBuilder(CatalogPriceHistory, 'ph')
        .innerJoin(CatalogItem, 'ci', 'ci.id = ph.item_id')
        .where('ph.item_id = ANY(:ids)', { ids: itemIdsToPrice })
        .andWhere('ph.customer_segment = :segment', { segment })
        .andWhere('ph.is_current = true')
        .andWhere('ci.tenant_id = :tenantId', { tenantId })
        .select(['ph.item_id AS item_id', 'ph.base_price AS base_price', 'ci.name AS name'])
        .getRawMany<{ item_id: string; base_price: string; name: string }>();

      let subtotalCents = 0;
      const breakdown = prices.map((p) => {
        const price = Math.round(parseFloat(p.base_price) * 100);
        subtotalCents += price;
        return { itemId: p.item_id, name: p.name, price: p.base_price };
      });

      const subtotal = (subtotalCents / 100).toFixed(2);
      let discountAmount = 0;

      if (bundle.discountType === 'PERCENTAGE') {
        discountAmount = (subtotalCents * parseFloat(bundle.discountValue)) / 100;
      } else if (bundle.discountType === 'FIXED_AMOUNT') {
        discountAmount = parseFloat(bundle.discountValue) * 100;
      }
      // FREE_MONTHS: no se aplica aquí (se aplica en billing al generar ciclos)

      const total = Math.max(0, (subtotalCents - discountAmount) / 100).toFixed(2);
      const discount = (discountAmount / 100).toFixed(2);

      return { bundleId, segment, subtotal, discount, total, breakdown };
    });
  }
}
