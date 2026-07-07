import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import { DataSource, QueryFailedError } from 'typeorm';
import { StockLocation, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  CreateStockLocationInput,
  CreateStockLocationSchema,
  ListStockLocationsQueryInput,
  ListStockLocationsQuerySchema,
  UpdateStockLocationInput,
  UpdateStockLocationSchema,
} from '../dto';

const MOBILE_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

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

  async list(query: ListStockLocationsQueryInput): Promise<StockLocation[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockLocationsQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockLocation, 'location')
        .where('location.tenant_id = :tenantId', { tenantId })
        .orderBy('location.created_at', 'DESC');

      if (validated.type) {
        qb.andWhere('location.type = :type', { type: validated.type });
      }

      if (validated.status) {
        qb.andWhere('location.status = :status', { status: validated.status });
      }

      if (validated.responsibleRefId) {
        qb.andWhere('location.responsible_ref_id = :responsibleRefId', {
          responsibleRefId: validated.responsibleRefId,
        });
      }

      return qb.getMany();
    });
  }

  async create(input: CreateStockLocationInput): Promise<StockLocation> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateStockLocationSchema.parse(input);

    this.assertMobileLocationResponsible(
      validated.type,
      validated.status,
      validated.responsibleRefId,
    );

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existing = await qr.manager.findOne(StockLocation, {
        where: { tenantId, code: validated.code },
      });

      if (existing) {
        throw new ConflictException('Ya existe una ubicación con ese código.');
      }
      try {
        return await qr.manager.save(
          StockLocation,
          qr.manager.create(StockLocation, {
            tenantId,
            code: validated.code,
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
    });
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
