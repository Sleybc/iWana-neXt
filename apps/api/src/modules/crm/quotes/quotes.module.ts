import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './entities/quote.entity';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { CommercialModule } from '../../commercial/commercial.module';
import { AccessControlModule } from '../../access-control/access-control.module';

@Module({
  imports: [CommercialModule, TypeOrmModule.forFeature([Quote]), AccessControlModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
