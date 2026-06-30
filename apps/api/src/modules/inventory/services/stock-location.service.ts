import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockLocation, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  CreateStockLocationInput,
  CreateStockLocationSchema,
  ListStockLocationsQueryInput,
  ListStockLocationsQuerySchema,
} from '../dto';

@Injectable()
export class StockLocationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existing = await qr.manager.findOne(StockLocation, {
        where: { tenantId, code: validated.code },
      });

      if (existing) {
        throw new ConflictException('Ya existe una ubicación con ese código.');
      }

      return qr.manager.save(
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
    });
  }
}
