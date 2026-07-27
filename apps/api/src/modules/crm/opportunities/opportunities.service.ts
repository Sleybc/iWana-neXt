import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import type { ListResponse } from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { Opportunity } from './entities/opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityStage } from '../enums/opportunity-stage.enum';

@Injectable()
export class OpportunitiesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(dto: CreateOpportunityDto): Promise<Opportunity> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(Opportunity, {
        tenantId,
        leadId: dto.leadId ?? null,
        subscriberId: dto.subscriberId ?? null,
        title: dto.title.trim(),
        stage: OpportunityStage.DISCOVERY,
        probability: dto.probability ?? 0,
        estimatedAmount: dto.estimatedAmount ?? null,
      });
      return qr.manager.save(Opportunity, entity);
    });
  }

  async findAll(filters: {
    stage?: OpportunityStage;
    page?: number;
    limit?: number;
  }): Promise<ListResponse<Opportunity>> {
    const { schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(Opportunity, 'o')
        .orderBy('o.createdAt', 'DESC')
        .addOrderBy('o.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      if (filters.stage) {
        qb.andWhere('o.stage = :stage', { stage: filters.stage });
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

  async findOne(id: string): Promise<Opportunity> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Opportunity, { where: { id } }),
    );
    if (!entity) {
      throw new NotFoundException(`Oportunidad ${id} no encontrada.`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateOpportunityDto): Promise<Opportunity> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    if (dto.title !== undefined) entity.title = dto.title.trim();
    if (dto.stage !== undefined) entity.stage = dto.stage;
    if (dto.probability !== undefined) entity.probability = dto.probability;
    if (dto.estimatedAmount !== undefined) entity.estimatedAmount = dto.estimatedAmount;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Opportunity, entity),
    );
  }
}
