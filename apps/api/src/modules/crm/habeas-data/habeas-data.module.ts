import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HabeasDataConsent } from './entities/habeas-data-consent.entity';
import { ArcoRequest } from './entities/arco-request.entity';
import { HabeasDataController } from './habeas-data.controller';
import { HabeasDataService } from './habeas-data.service';

@Module({
  imports: [TypeOrmModule.forFeature([HabeasDataConsent, ArcoRequest])],
  controllers: [HabeasDataController],
  providers: [HabeasDataService],
  exports: [HabeasDataService],
})
export class HabeasDataModule {}
