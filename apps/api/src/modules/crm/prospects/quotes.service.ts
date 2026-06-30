import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { QuoteStatus } from '../enums/quote-status.enum';
import { Quote } from '../quotes/entities/quote.entity';

@Injectable()
export class ProspectQuotesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createQuoteSnapshot(
    prospectId: string,
    snapshot: {
      planId: string;
      name: string;
      technology: string;
      downloadSpeed: number;
      uploadSpeed: number;
      monthlyPrice: number;
      installationFee: number;
      snapshotAt: string;
    },
  ): Promise<Quote> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(Quote, {
        tenantId,
        opportunityId: prospectId,
        subscriberId: null,
        planId: snapshot.planId,
        planSnapshotJson: snapshot,
        monthlyAmount: String(snapshot.monthlyPrice),
        status: QuoteStatus.DRAFT,
      });
      return qr.manager.save(Quote, entity);
    });
  }
}
