import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { Quote } from '../quotes/entities/quote.entity';
import { CrmQuoteReadPort, type CrmQuoteSnapshot } from '../ports/crm-quote-read.port';

@Injectable()
export class CrmQuoteReadAdapter extends CrmQuoteReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findByExpedienteId(schemaName: string, expedienteId: string): Promise<CrmQuoteSnapshot[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const quotes = await qr.manager.find(Quote, { where: { expedienteId } });
      return quotes.map((quote) => ({
        id: quote.id,
        expedienteId: quote.expedienteId ?? expedienteId,
        status: String(quote.status),
      }));
    });
  }
}
