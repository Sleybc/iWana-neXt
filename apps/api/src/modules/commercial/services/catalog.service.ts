import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, SelectQueryBuilder } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  CatalogItemType,
  CustomerSegment,
  InstallationRule,
  type ListResponse,
} from '@iwana/shared';
import { CatalogItem } from '../entities/catalog-item.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ServiceDetail } from '../entities/service-detail.entity';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import { CreateCatalogItemDto } from '../dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from '../dto/update-catalog-item.dto';
import {
  CATALOG_CATEGORY_SORT_ORDER,
  CatalogQueryDto,
  CatalogSortMode,
  PLAN_CATALOG_SORTABLE_FIELDS,
  isPlanCatalogSortField,
} from '../dto/catalog-query.dto';
import { COMMERCIAL_EVENTS } from '../events/commercial.events';
import {
  assertExclusivePageCursor,
  buildActiveNameIdNextCursor,
  buildCategoryRankNameIdNextCursor,
  buildCursorMeta,
  buildDateIdNextCursor,
  buildNameIdNextCursor,
  buildPageMeta,
  clampLimit,
  clampPickerSearchLimit,
  decodeActiveNameIdCursor,
  decodeCategoryRankNameIdCursor,
  decodeDateIdCursor,
  decodeNameIdCursor,
  escapePickerLikePattern,
  normalizePickerQuery,
  type PickerSearchResult,
} from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';

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

  /**
   * Lista ítems del catálogo con paginación híbrida (ADR-064/065 Ola 6).
   * Orden default: name ASC, id ASC. Con `sort`: keyset coherente con el modo.
   * Planes en modo page: `sortBy`/`sortDir` sustituye el default si el campo está en lista blanca.
   * `total` = conjunto filtrado; cursor aplica después del filtro.
   * `page` y `cursor` excluyentes; sin ambos = primera página keyset.
   */
  async findAll(query: CatalogQueryDto): Promise<ListResponse<CatalogItemWithDetail>> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    assertExclusivePageCursor(query);
    const {
      type,
      name,
      isActive,
      cursor,
      missingPrice,
      category,
      model,
      charge,
      sort,
      sortBy,
      sortDir,
    } = query;
    const limit = clampLimit(query.limit);
    const usePage = query.page !== undefined;
    const page = usePage ? clampPage(query.page!, limit).page : 1;
    const categoryRankSql = this._categoryRankSql('pd.category');

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(CatalogItem, 'ci')
        .where('ci.tenant_id = :tenantId', { tenantId })
        .andWhere('ci.deleted_at IS NULL');

      if (type) qb.andWhere('ci.type = :type', { type });
      if (name) {
        qb.andWhere('ci.name ILIKE :name ESCAPE :esc', {
          name: `%${escapePickerLikePattern(name)}%`,
          esc: '\\',
        });
      }
      if (isActive !== undefined) qb.andWhere('ci.is_active = :isActive', { isActive });

      // Chip «Sin precio vigente»: activos sin precio current RESIDENTIAL (misma semántica FE).
      if (missingPrice === true) {
        qb.andWhere('ci.is_active = true').andWhere(
          `NOT EXISTS (
            SELECT 1 FROM catalog_price_history ph
            WHERE ph.item_id = ci.id
              AND ph.is_current = true
              AND ph.customer_segment = :missingPriceSegment
          )`,
          { missingPriceSegment: CustomerSegment.RESIDENTIAL },
        );
      }

      const needsProductJoin =
        category !== undefined || model !== undefined || sort === 'CATEGORY_NAME';
      if (needsProductJoin) {
        // Filtro category/model: inner; solo sort CATEGORY_NAME: left (planes/servicios al final).
        if (category !== undefined || model !== undefined) {
          qb.innerJoin(ProductDetail, 'pd', 'pd.item_id = ci.id');
        } else {
          qb.leftJoin(ProductDetail, 'pd', 'pd.item_id = ci.id');
        }
        if (category !== undefined) {
          qb.andWhere('pd.category = :productCategory', { productCategory: category });
        }
        if (model === 'LOAN') {
          qb.andWhere('pd.is_loan = true');
        } else if (model === 'SALE') {
          qb.andWhere('pd.is_loan = false');
        }
      }

      if (charge !== undefined) {
        qb.innerJoin(ServiceDetail, 'sd', 'sd.item_id = ci.id').andWhere(
          'sd.charge_type = :chargeType',
          { chargeType: charge },
        );
      }

      const total = await qb.clone().getCount();

      if (usePage) {
        const planSort =
          type === CatalogItemType.PLAN
            ? this._applyPlanColumnSort(qb, sortBy, sortDir)
            : { appliedSortBy: null, appliedSortDir: null };

        if (!planSort.appliedSortBy) {
          this._applySortAndCursor(qb, sort, undefined, categoryRankSql);
        }

        const rows = await qb
          .skip((page - 1) * limit)
          .take(limit)
          .getMany();
        const hydrated = await this._hydratePage(qr.manager, rows);
        return {
          data: hydrated,
          meta: buildPageMeta({
            total,
            page,
            limit,
            randomAccess: true,
            sortableFields: type === CatalogItemType.PLAN ? [...PLAN_CATALOG_SORTABLE_FIELDS] : [],
            sortBy: planSort.appliedSortBy ?? undefined,
            sortDir: planSort.appliedSortDir ?? undefined,
          }),
        };
      }

      this._applySortAndCursor(qb, sort, cursor, categoryRankSql);

      const rows = await qb.take(limit + 1).getMany();

      const hasNext = rows.length > limit;
      const pageRows = hasNext ? rows.slice(0, limit) : rows;
      const hydrated = await this._hydratePage(qr.manager, pageRows);
      const last = pageRows[pageRows.length - 1];

      return {
        data: hydrated,
        meta: buildCursorMeta({
          nextCursor: this._buildNextCursor(sort, hasNext, last, hydrated[hydrated.length - 1]),
          total,
          limit,
          randomAccess: true,
        }),
      };
    });
  }

  async findOne(id: string): Promise<CatalogItemWithDetail> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const item = await qr.manager.findOne(CatalogItem, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!item) return null;
      const [hydrated] = await this._hydratePage(qr.manager, [item]);
      return hydrated ?? { ...item };
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

      const [hydrated] = await this._hydratePage(qr.manager, [item]);
      return hydrated ?? item;
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

  /** CASE WHEN alineado a chips FE / ProductCategory. */
  private _categoryRankSql(columnExpr: string): string {
    const whens = CATALOG_CATEGORY_SORT_ORDER.map(
      (cat, index) => `WHEN '${cat}' THEN ${index}`,
    ).join(' ');
    return `CASE ${columnExpr} ${whens} ELSE ${CATALOG_CATEGORY_SORT_ORDER.length} END`;
  }

  /**
   * Precio vigente RESIDENTIAL (mismo criterio que la hidratación de listado).
   * Subconsulta: evita duplicar filas si se uniera `catalog_price_history`.
   */
  private _currentResidentialPriceExpr(column: 'base_price' | 'installation_fee'): string {
    return `(SELECT ph.${column} FROM catalog_price_history ph
      WHERE ph.item_id = ci.id
        AND ph.is_current = true
        AND ph.customer_segment = 'RESIDENTIAL'
      LIMIT 1)`;
  }

  /**
   * Columna de plan_details para ORDER BY.
   * Sin JOIN: skip/take + JOIN hace que TypeORM envuelva en SELECT DISTINCT e
   * proyecte el ORDER BY como distinctAlias.pld_*, columnas ausentes del SELECT interno.
   */
  private _planDetailSortExpr(column: 'technology' | 'download_speed_mbps'): string {
    return `(SELECT pld.${column} FROM plan_details pld WHERE pld.item_id = ci.id LIMIT 1)`;
  }

  private _applyPlanColumnSort(
    qb: SelectQueryBuilder<CatalogItem>,
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ) {
    if (!isPlanCatalogSortField(sortBy)) {
      return { appliedSortBy: null, appliedSortDir: null };
    }

    const dir = sortDir ?? 'asc';
    const sqlDir = dir.toUpperCase() as 'ASC' | 'DESC';

    if (sortBy === 'downloadSpeedMbps' || sortBy === 'technology') {
      const column = sortBy === 'downloadSpeedMbps' ? 'download_speed_mbps' : 'technology';
      qb.orderBy(this._planDetailSortExpr(column), sqlDir, 'NULLS LAST');
      qb.addOrderBy('ci.id', sqlDir);
      return { appliedSortBy: sortBy, appliedSortDir: dir };
    }

    if (sortBy === 'basePrice' || sortBy === 'installationFee') {
      const priceColumn = sortBy === 'basePrice' ? 'base_price' : 'installation_fee';
      qb.orderBy(this._currentResidentialPriceExpr(priceColumn), sqlDir, 'NULLS LAST');
      qb.addOrderBy('ci.id', sqlDir);
      return { appliedSortBy: sortBy, appliedSortDir: dir };
    }

    const itemColumn =
      sortBy === 'isActive'
        ? 'ci.is_active'
        : sortBy === 'createdAt'
          ? 'ci.created_at'
          : sortBy === 'updatedAt'
            ? 'ci.updated_at'
            : `ci.${sortBy}`;
    if (sortBy === 'description') {
      qb.orderBy(itemColumn, sqlDir, 'NULLS LAST');
    } else {
      qb.orderBy(itemColumn, sqlDir);
    }
    qb.addOrderBy('ci.id', sqlDir);
    return { appliedSortBy: sortBy, appliedSortDir: dir };
  }

  private _applySortAndCursor(
    qb: SelectQueryBuilder<CatalogItem>,
    sort: CatalogSortMode | undefined,
    cursor: string | undefined,
    categoryRankSql: string,
  ): void {
    if (sort === 'RECENTLY_UPDATED') {
      if (cursor) {
        const decoded = decodeDateIdCursor(cursor);
        qb.andWhere(
          '(ci.updated_at < :cursorUpdated OR (ci.updated_at = :cursorUpdated AND ci.id < :cursorId))',
          { cursorUpdated: decoded.d, cursorId: decoded.i },
        );
      }
      qb.orderBy('ci.updated_at', 'DESC').addOrderBy('ci.id', 'DESC');
      return;
    }

    if (sort === 'ACTIVE_NAME') {
      if (cursor) {
        const decoded = decodeActiveNameIdCursor(cursor);
        qb.andWhere(
          `(ci.is_active < :cursorActive
            OR (ci.is_active = :cursorActive AND ci.name > :cursorName)
            OR (ci.is_active = :cursorActive AND ci.name = :cursorName AND ci.id > :cursorId))`,
          {
            cursorActive: decoded.a === 1,
            cursorName: decoded.n,
            cursorId: decoded.i,
          },
        );
      }
      qb.orderBy('ci.is_active', 'DESC').addOrderBy('ci.name', 'ASC').addOrderBy('ci.id', 'ASC');
      return;
    }

    if (sort === 'CATEGORY_NAME') {
      if (cursor) {
        const decoded = decodeCategoryRankNameIdCursor(cursor);
        qb.andWhere(
          `((${categoryRankSql}) > :cursorRank
            OR ((${categoryRankSql}) = :cursorRank AND ci.name > :cursorName)
            OR ((${categoryRankSql}) = :cursorRank AND ci.name = :cursorName AND ci.id > :cursorId))`,
          {
            cursorRank: decoded.r,
            cursorName: decoded.n,
            cursorId: decoded.i,
          },
        );
      }
      qb.orderBy(categoryRankSql, 'ASC').addOrderBy('ci.name', 'ASC').addOrderBy('ci.id', 'ASC');
      return;
    }

    if (cursor) {
      const decoded = decodeNameIdCursor(cursor);
      qb.andWhere('(ci.name > :cursorName OR (ci.name = :cursorName AND ci.id > :cursorId))', {
        cursorName: decoded.n,
        cursorId: decoded.i,
      });
    }
    qb.orderBy('ci.name', 'ASC').addOrderBy('ci.id', 'ASC');
  }

  private _buildNextCursor(
    sort: CatalogSortMode | undefined,
    hasNext: boolean,
    last: CatalogItem | undefined,
    lastHydrated: CatalogItemWithDetail | undefined,
  ): string | null {
    if (!hasNext || !last) return null;

    if (sort === 'RECENTLY_UPDATED') {
      return buildDateIdNextCursor(true, { date: last.updatedAt, id: last.id });
    }

    if (sort === 'ACTIVE_NAME') {
      return buildActiveNameIdNextCursor(true, {
        isActive: last.isActive,
        name: last.name,
        id: last.id,
      });
    }

    if (sort === 'CATEGORY_NAME') {
      const category = lastHydrated?.category;
      const rank =
        category != null
          ? CATALOG_CATEGORY_SORT_ORDER.indexOf(
              category as (typeof CATALOG_CATEGORY_SORT_ORDER)[number],
            )
          : CATALOG_CATEGORY_SORT_ORDER.length;
      return buildCategoryRankNameIdNextCursor(true, {
        rank: rank < 0 ? CATALOG_CATEGORY_SORT_ORDER.length : rank,
        name: last.name,
        id: last.id,
      });
    }

    return buildNameIdNextCursor(true, last);
  }

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
        installationRule: dto.installationRule ?? InstallationRule.ALWAYS,
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

  private async _hydratePage(
    manager: DataSource['manager'],
    items: CatalogItem[],
  ): Promise<CatalogItemWithDetail[]> {
    if (!items.length) return [];

    const ids = items.map((item) => item.id);
    const [planDetails, productDetails, serviceDetails, prices] = await Promise.all([
      manager
        .createQueryBuilder(PlanDetail, 'pd')
        .where('pd.item_id = ANY(:ids)', { ids })
        .getMany(),
      manager
        .createQueryBuilder(ProductDetail, 'prd')
        .where('prd.item_id = ANY(:ids)', { ids })
        .getMany(),
      manager
        .createQueryBuilder(ServiceDetail, 'sd')
        .where('sd.item_id = ANY(:ids)', { ids })
        .getMany(),
      manager
        .createQueryBuilder(CatalogPriceHistory, 'ph')
        .where('ph.item_id = ANY(:ids)', { ids })
        .andWhere('ph.customer_segment = :segment', { segment: CustomerSegment.RESIDENTIAL })
        .andWhere('ph.is_current = true')
        .getMany(),
    ]);

    const planMap = new Map(planDetails.map((row) => [row.itemId, row]));
    const productMap = new Map(productDetails.map((row) => [row.itemId, row]));
    const serviceMap = new Map(serviceDetails.map((row) => [row.itemId, row]));
    const priceMap = new Map(prices.map((row) => [row.itemId, row]));

    return items.map((item) => {
      const price = priceMap.get(item.id);
      const base: CatalogItemWithDetail = {
        ...item,
        currentPrice: price?.basePrice ?? null,
        installationFee: price?.installationFee ?? null,
      };

      if (item.type === CatalogItemType.PLAN) {
        const detail = planMap.get(item.id);
        return {
          ...base,
          downloadSpeedMbps: detail?.downloadSpeedMbps,
          uploadSpeedMbps: detail?.uploadSpeedMbps,
          technology: detail?.technology,
          installationRule: detail?.installationRule,
        };
      }

      if (item.type === CatalogItemType.PRODUCT) {
        const detail = productMap.get(item.id);
        return {
          ...base,
          category: detail?.category,
          isLoan: detail?.isLoan,
          requiresInventory: detail?.requiresInventory,
        };
      }

      const detail = serviceMap.get(item.id);
      return {
        ...base,
        chargeType: detail?.chargeType,
      };
    });
  }

  /**
   * Lookup typeahead E-4 para pickers de catálogo (planes / productos / servicios).
   * `q` vacío o ausente → listado top-N (máx. 20) del universo filtrado por tipo y
   * estado, ordenado por nombre: el FE despliega esa lista al abrir el picker.
   * `total` = coincidencias del filtro (con q vacío, universo completo del contexto).
   */
  async searchForPicker(params: {
    type: CatalogItemType;
    q?: string | undefined;
    isActive?: boolean | undefined;
    limit?: number | undefined;
  }): Promise<PickerSearchResult> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const limit = clampPickerSearchLimit(params.limit);
    const q = normalizePickerQuery(params.q);
    const isActive = params.isActive ?? true;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const like = `%${escapePickerLikePattern(q)}%`;
      const isPlan = params.type === CatalogItemType.PLAN;

      const qb = qr.manager
        .createQueryBuilder(CatalogItem, 'ci')
        .where('ci.tenant_id = :tenantId', { tenantId })
        .andWhere('ci.deleted_at IS NULL')
        .andWhere('ci.type = :type', { type: params.type })
        .andWhere('ci.is_active = :isActive', { isActive });

      if (isPlan) {
        // Planes se distinguen por tecnología y velocidades: busca también en plan_details.
        qb.leftJoin(PlanDetail, 'pd', 'pd.item_id = ci.id').andWhere(
          '(ci.name ILIKE :like ESCAPE :esc OR pd.technology ILIKE :like ESCAPE :esc)',
          { like, esc: '\\' },
        );
      } else {
        qb.andWhere('ci.name ILIKE :like ESCAPE :esc', { like, esc: '\\' });
      }

      const total = await qb.clone().getCount();

      const rows = await qb
        .orderBy('ci.name', 'ASC')
        .addOrderBy('ci.id', 'ASC')
        .take(limit)
        .getMany();

      // Sin coincidencias: evitar `IN ()` (error de sintaxis) en el detalle de planes.
      if (rows.length === 0) {
        return { data: [], total };
      }

      if (!isPlan) {
        return {
          data: rows.map((item) => ({
            id: item.id,
            label: item.name,
            sublabel: item.isActive ? 'Activo' : 'Inactivo',
          })),
          total,
        };
      }

      // Sublabel con tecnología y velocidades para distinguir planes homónimos.
      const planDetails = await qr.manager
        .createQueryBuilder(PlanDetail, 'pd')
        .where('pd.item_id IN (:...ids)', { ids: rows.map((item) => item.id) })
        .getMany();
      const detailByItemId = new Map(planDetails.map((detail) => [detail.itemId, detail]));

      return {
        data: rows.map((item) => {
          const detail = detailByItemId.get(item.id);
          return {
            id: item.id,
            label: item.name,
            sublabel: detail
              ? `${detail.technology} · ↓${detail.downloadSpeedMbps}Mbps · ↑${detail.uploadSpeedMbps}Mbps`
              : item.isActive
                ? 'Activo'
                : 'Inactivo',
          };
        }),
        total,
      };
    });
  }
}
