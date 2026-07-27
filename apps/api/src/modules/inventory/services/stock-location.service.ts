import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  StockLocationStatus,
  StockLocationType,
  resolveNextStockLocationCode,
} from '@iwana/shared';
import { DataSource, QueryFailedError } from 'typeorm';
import { StockLocation, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  CreateStockLocationInput,
  CreateStockLocationSchema,
  ListStockLocationsQueryInput,
  ListStockLocationsQuerySchema,
  StockLocationPickerSearchQueryInput,
  StockLocationPickerSearchQuerySchema,
  UpdateStockLocationInput,
  UpdateStockLocationSchema,
} from '../dto';
import {
  clampInventoryLimit,
  clampPickerSearchLimit,
  dateIdDescCursorParams,
  dateIdDescCursorWhere,
  escapePickerLikePattern,
  InventoryPaginatedResult,
  normalizePickerQuery,
  sliceDateIdDescPage,
  type PickerSearchResult,
} from '../../../common/pagination';

const MOBILE_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

const LOCATION_CODE_RETRY_LIMIT = 10;

function isMobileLocationType(type: StockLocationType): boolean {
  return MOBILE_LOCATION_TYPES.has(type);
}

function isUniqueViolation(
  error: unknown,
): error is QueryFailedError & { driverError?: { code?: string } } {
  return error instanceof QueryFailedError && error.driverError?.code === '23505';
}

@Injectable()
export class StockLocationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private assertMobileLocationResponsible(
    type: StockLocationType,
    status: StockLocationStatus,
    responsibleRefId: string | null | undefined,
  ) {
    if (status !== StockLocationStatus.ACTIVE) {
      return;
    }

    if (isMobileLocationType(type) && !responsibleRefId) {
      throw new BadRequestException('La bodega móvil requiere responsable.');
    }
  }

  async list(
    query: ListStockLocationsQueryInput,
  ): Promise<InventoryPaginatedResult<StockLocation>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockLocationsQuerySchema.parse(query);
    const limit = clampInventoryLimit(validated.limit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockLocation, 'location')
        .where('location.tenant_id = :tenantId', { tenantId });

      if (validated.custody === 'mobile') {
        qb.andWhere('location.type IN (:...mobileTypes)', {
          mobileTypes: [StockLocationType.MOBILE_TECHNICIAN, StockLocationType.MOBILE_CREW],
        });
      } else if (validated.type) {
        qb.andWhere('location.type = :type', { type: validated.type });
      }

      if (validated.statusGroup === 'inactive_group') {
        qb.andWhere('location.status IN (:...inactiveStatuses)', {
          inactiveStatuses: [StockLocationStatus.INACTIVE, StockLocationStatus.ARCHIVED],
        });
      } else if (validated.status) {
        qb.andWhere('location.status = :status', { status: validated.status });
      }

      if (validated.responsibleRefId) {
        qb.andWhere('location.responsible_ref_id = :responsibleRefId', {
          responsibleRefId: validated.responsibleRefId,
        });
      }

      if (validated.search) {
        const needle = `%${validated.search.trim().toLowerCase()}%`;
        qb.andWhere(
          `(LOWER(location.name) LIKE :locationSearch
            OR LOWER(location.code) LIKE :locationSearch
            OR LOWER(COALESCE(location.responsible_ref_id::text, '')) LIKE :locationSearch)`,
          { locationSearch: needle },
        );
      }

      if (validated.withStock === true) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM stock_balances bal
            WHERE bal.tenant_id = location.tenant_id
              AND bal.location_id = location.id
              AND bal.quantity_on_hand::numeric > 0
          )`,
        );
      }

      const total = await qb.clone().getCount();

      if (validated.cursor) {
        qb.andWhere(
          dateIdDescCursorWhere('location', 'created_at'),
          dateIdDescCursorParams(validated.cursor),
        );
      }

      const rows = await qb
        .orderBy('location.created_at', 'DESC')
        .addOrderBy('location.id', 'DESC')
        .take(limit + 1)
        .getMany();

      const { data, nextCursor } = sliceDateIdDescPage(rows, limit, (row) => row.createdAt);
      return { data, meta: { nextCursor, total } };
    });
  }

  /**
   * Lookup typeahead E-4 para ubicaciones de stock.
   * Label = nombre; sublabel = código.
   */
  async searchForPicker(query: StockLocationPickerSearchQueryInput): Promise<PickerSearchResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = StockLocationPickerSearchQuerySchema.parse(query);
    const limit = clampPickerSearchLimit(validated.limit);
    const q = normalizePickerQuery(validated.q);

    if (!q) {
      return { data: [], total: 0 };
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const like = `%${escapePickerLikePattern(q.toLowerCase())}%`;
      const qb = qr.manager
        .createQueryBuilder(StockLocation, 'location')
        .where('location.tenant_id = :tenantId', { tenantId })
        .andWhere(
          "(LOWER(location.name) LIKE :like ESCAPE '\\' OR LOWER(location.code) LIKE :like ESCAPE '\\')",
          { like },
        );

      if (validated.status) {
        qb.andWhere('location.status = :status', { status: validated.status });
      }

      const total = await qb.clone().getCount();
      const rows = await qb
        .orderBy('location.name', 'ASC')
        .addOrderBy('location.id', 'ASC')
        .take(limit)
        .getMany();

      return {
        data: rows.map((loc) => ({
          id: loc.id,
          label: loc.name,
          sublabel: loc.code,
        })),
        total,
      };
    });
  }

  async create(input: CreateStockLocationInput): Promise<StockLocation> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateStockLocationSchema.parse(input);
    const normalizedCode = validated.code?.trim();

    this.assertMobileLocationResponsible(
      validated.type,
      validated.status,
      validated.responsibleRefId,
    );

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (normalizedCode) {
        const existing = await qr.manager.findOne(StockLocation, {
          where: { tenantId, code: normalizedCode },
        });

        if (existing) {
          throw new ConflictException('Ya existe una ubicación con ese código.');
        }

        try {
          return await qr.manager.save(
            StockLocation,
            qr.manager.create(StockLocation, {
              tenantId,
              code: normalizedCode,
              name: validated.name,
              type: validated.type,
              status: validated.status,
              responsibleRefId: validated.responsibleRefId ?? null,
              maxCapacity: validated.maxCapacity != null ? validated.maxCapacity.toFixed(2) : null,
            }),
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new ConflictException('Ya existe una bodega móvil activa para ese responsable.');
          }

          throw error;
        }
      }

      const existingCodes = await this.loadTenantLocationCodes(qr.manager, tenantId);

      for (let attempt = 0; attempt < LOCATION_CODE_RETRY_LIMIT; attempt += 1) {
        const generatedCode = resolveNextStockLocationCode(existingCodes, validated.type, attempt);

        const duplicate = await qr.manager.findOne(StockLocation, {
          where: { tenantId, code: generatedCode },
        });

        if (duplicate) {
          continue;
        }

        try {
          return await qr.manager.save(
            StockLocation,
            qr.manager.create(StockLocation, {
              tenantId,
              code: generatedCode,
              name: validated.name,
              type: validated.type,
              status: validated.status,
              responsibleRefId: validated.responsibleRefId ?? null,
              maxCapacity: validated.maxCapacity != null ? validated.maxCapacity.toFixed(2) : null,
            }),
          );
        } catch (error) {
          if (attempt === LOCATION_CODE_RETRY_LIMIT - 1 && isUniqueViolation(error)) {
            throw new ConflictException('No fue posible generar un código único para la bodega.');
          }

          if (!isUniqueViolation(error)) {
            throw error;
          }
        }
      }

      throw new ConflictException('No fue posible generar un código único para la bodega.');
    });
  }

  private async loadTenantLocationCodes(
    manager: DataSource['manager'],
    tenantId: string,
  ): Promise<string[]> {
    const rows = await manager
      .createQueryBuilder(StockLocation, 'location')
      .select('location.code', 'code')
      .where('location.tenant_id = :tenantId', { tenantId })
      .getRawMany<{ code: string }>();

    return rows.map((row) => row.code);
  }

  async update(id: string, input: UpdateStockLocationInput): Promise<StockLocation> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateStockLocationSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const location = await qr.manager.findOne(StockLocation, {
        where: { id, tenantId },
      });

      if (!location) {
        throw new NotFoundException('La ubicación solicitada no existe.');
      }

      const nextStatus = validated.status ?? location.status;
      const nextResponsibleRefId =
        validated.responsibleRefId !== undefined
          ? (validated.responsibleRefId ?? null)
          : location.responsibleRefId;

      this.assertMobileLocationResponsible(location.type, nextStatus, nextResponsibleRefId);

      location.name = validated.name ?? location.name;
      location.status = nextStatus;
      location.responsibleRefId = nextResponsibleRefId;

      if (validated.maxCapacity !== undefined) {
        location.maxCapacity =
          validated.maxCapacity != null ? validated.maxCapacity.toFixed(2) : null;
      }
      try {
        return await qr.manager.save(StockLocation, location);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Ya existe una bodega móvil activa para ese responsable.');
        }

        throw error;
      }
    });
  }
}
