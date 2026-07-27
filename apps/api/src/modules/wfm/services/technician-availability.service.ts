import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema, TechnicianAvailability } from '@iwana/db';
import type { ListResponse } from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateTechnicianAvailabilityInput,
  CreateTechnicianAvailabilitySchema,
  ListTechnicianAvailabilityQueryDto,
} from '../dto';

@Injectable()
export class TechnicianAvailabilityService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Lista registros de disponibilidad/bloqueo de responsables operativos con filtros opcionales. */
  async list(
    query: ListTechnicianAvailabilityQueryDto,
  ): Promise<ListResponse<TechnicianAvailability>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(query.limit);
    const { page, limit } = clampPage(query.page ?? 1, cappedLimit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(TechnicianAvailability, 'ta')
        .where('ta.tenant_id = :tenantId', { tenantId })
        .orderBy('ta.starts_at', 'ASC')
        .addOrderBy('ta.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      if (query.userId) {
        qb.andWhere('ta.user_id = :userId', { userId: query.userId });
      }
      if (query.from) {
        qb.andWhere('ta.starts_at >= :from', { from: query.from });
      }
      if (query.to) {
        qb.andWhere('ta.ends_at <= :to', { to: query.to });
      }
      if (query.type) {
        qb.andWhere('ta.type = :type', { type: query.type });
      }

      const [data, total] = await qb.getManyAndCount();
      return {
        data,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
  }

  /** Registra un bloqueo o disponibilidad puntual de un responsable operativo. */
  async create(
    input: CreateTechnicianAvailabilityInput,
    actor: JwtPayload,
  ): Promise<TechnicianAvailability> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateTechnicianAvailabilitySchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const availability = qr.manager.create(TechnicianAvailability, {
        tenantId,
        userId: validated.userId,
        type: validated.type,
        startsAt: new Date(validated.startsAt),
        endsAt: new Date(validated.endsAt),
        reason: validated.reason ?? null,
        createdBy: actor.sub,
      });

      return qr.manager.save(TechnicianAvailability, availability);
    });
  }
}
