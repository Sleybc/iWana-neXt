import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './entities/quote.entity';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { CommercialModule } from '../../commercial/commercial.module';
import { AccessControlModule } from '../../access-control/access-control.module';
import { CrmQuoteReadPort } from '../ports/crm-quote-read.port';
import { CrmQuoteReadAdapter } from './crm-quote-read.adapter';

@Module({
  imports: [CommercialModule, TypeOrmModule.forFeature([Quote]), AccessControlModule],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    CrmQuoteReadAdapter,
    { provide: CrmQuoteReadPort, useExisting: CrmQuoteReadAdapter },
  ],
  exports: [QuotesService, CrmQuoteReadPort],
})
export class QuotesModule {}
