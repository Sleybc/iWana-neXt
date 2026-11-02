import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, In } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import type { Subscriber360Quote } from '@iwana/shared';
import { Quote } from './entities/quote.entity';
import { CrmQuoteReadPort, type CrmQuoteSnapshot } from '../ports/crm-quote-read.port';

@Injectable()
export class CrmQuoteReadAdapter extends CrmQuoteReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findForSubscriber(
    manager: EntityManager,
    subscriberId: string,
    expedienteId?: string,
  ): Promise<Subscriber360Quote[]> {
    const where: FindOptionsWhere<Quote>[] = [{ subscriberId }];
    if (expedienteId) where.push({ expedienteId });
    const quotes = await manager.find(Quote, {
      where,
      order: { createdAt: 'DESC' },
      select: ['id', 'expedienteId', 'status', 'planId', 'monthlyAmount', 'expiresAt', 'createdAt'],
    });

    return quotes.map((quote) => ({
      id: quote.id,
      expedienteId: quote.expedienteId,
      status: quote.status,
      planId: quote.planId,
      monthlyAmount: Number(quote.monthlyAmount),
      expiresAt: quote.expiresAt?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
    }));
  }

  async findByExpedienteId(schemaName: string, expedienteId: string): Promise<CrmQuoteSnapshot[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const quotes = await qr.manager.find(Quote, {
        where: { expedienteId },
        select: ['id', 'expedienteId', 'status'],
      });
      return quotes.map((quote) => ({
        id: quote.id,
        expedienteId: quote.expedienteId ?? expedienteId,
        status: String(quote.status),
      }));
    });
  }

  async findByExpedienteIds(
    manager: EntityManager,
    expedienteIds: string[],
  ): Promise<CrmQuoteSnapshot[]> {
    if (expedienteIds.length === 0) {
      return [];
    }
    const quotes = await manager.find(Quote, {
      where: { expedienteId: In(expedienteIds) },
      select: ['id', 'expedienteId', 'status'],
    });
    return quotes.map((quote) => ({
      id: quote.id,
      expedienteId: quote.expedienteId ?? '',
      status: String(quote.status),
    }));
  }
}
