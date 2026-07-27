import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext, WfmOperationalEventuality } from '@iwana/db';
import { OperationalEventualityStatus, type ListResponse } from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import {
  CreateOperationalEventualityDto,
  UpdateOperationalEventualityStatusDto,
} from '../dto/operational-eventuality.dto';

@Injectable()
export class OperationalEventualitiesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(
    createdById: string,
    dto: CreateOperationalEventualityDto,
  ): Promise<WfmOperationalEventuality> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (startsAt >= endsAt) {
      throw new BadRequestException('startsAt debe ser anterior a endsAt.');
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(WfmOperationalEventuality, {
        tenantId,
        userId: dto.userId,
        organizationSiteId: dto.organizationSiteId ?? null,
        type: dto.type,
        status: OperationalEventualityStatus.PENDING,
        startsAt,
        endsAt,
        reason: dto.reason?.trim() ?? null,
        origin: dto.origin?.trim() ?? null,
        requiresHrReview: dto.requiresHrReview ?? false,
        createdById,
      });

      return qr.manager.save(WfmOperationalEventuality, entity);
    });
  }

  async findAllByTenant(filters?: {
    userId?: string;
    organizationSiteId?: string;
    page?: number;
    limit?: number;
  }): Promise<ListResponse<WfmOperationalEventuality>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters?.limit);
    const { page, limit } = clampPage(filters?.page ?? 1, cappedLimit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(WfmOperationalEventuality, 'e')
        .where('e.tenant_id = :tenantId', { tenantId })
        .andWhere('e.deleted_at IS NULL')
        .orderBy('e.starts_at', 'DESC')
        .addOrderBy('e.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      if (filters?.userId) {
        qb.andWhere('e.user_id = :userId', { userId: filters.userId });
      }
      if (filters?.organizationSiteId) {
        qb.andWhere('e.organization_site_id = :organizationSiteId', {
          organizationSiteId: filters.organizationSiteId,
        });
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

  async findOne(id: string): Promise<WfmOperationalEventuality> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(WfmOperationalEventuality, {
        where: { id, tenantId },
        withDeleted: false,
      });

      if (!entity) {
        throw new NotFoundException('La eventualidad operativa no existe para este tenant.');
      }

      return entity;
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateOperationalEventualityStatusDto,
  ): Promise<WfmOperationalEventuality> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(WfmOperationalEventuality, {
        where: { id, tenantId },
        withDeleted: false,
      });

      if (!entity) {
        throw new NotFoundException('La eventualidad operativa no existe para este tenant.');
      }

      entity.status = dto.status;

      return qr.manager.save(WfmOperationalEventuality, entity);
    });
  }

  async softDelete(id: string): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(WfmOperationalEventuality, {
        where: { id, tenantId },
        withDeleted: false,
      });

      if (!entity) {
        throw new NotFoundException('La eventualidad operativa no existe para este tenant.');
      }

      await qr.manager.softRemove(WfmOperationalEventuality, entity);
    });
  }
}
