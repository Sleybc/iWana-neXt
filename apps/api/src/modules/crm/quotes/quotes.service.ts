import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { Quote } from './entities/quote.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import { QuoteStatus } from '../enums/quote-status.enum';

@Injectable()
export class QuotesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly planCatalogReadPort: PlanCatalogReadPort,
  ) {}

  async create(dto: CreateQuoteDto): Promise<Quote> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const planSnapshot = await this.planCatalogReadPort.createSnapshot(
      tenantId,
      schemaName,
      dto.planId,
    );

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(Quote, {
        tenantId,
        opportunityId: dto.opportunityId,
        subscriberId: dto.subscriberId,
        planId: dto.planId,
        planSnapshotJson: {
          ...planSnapshot,
          snapshotAt: planSnapshot.snapshotAt.toISOString(),
        },
        monthlyAmount: dto.monthlyAmount,
        status: QuoteStatus.DRAFT,
      });
      return qr.manager.save(Quote, entity);
    });
  }

  async findAll(): Promise<Quote[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(Quote, { order: { createdAt: 'DESC' } }),
    );
  }

  async findOne(id: string): Promise<Quote> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Quote, { where: { id } }),
    );

    if (!entity) {
      throw new NotFoundException(`Cotizacion ${id} no encontrada.`);
    }

    return entity;
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<Quote> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    if (dto.status !== undefined) {
      entity.status = dto.status;
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Quote, entity),
    );
  }

  async accept(id: string): Promise<Quote> {
    return this.update(id, { status: QuoteStatus.APPROVED });
  }
}
