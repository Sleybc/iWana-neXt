import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HabeasDataConsent } from './entities/habeas-data-consent.entity';
import { ArcoRequest } from './entities/arco-request.entity';
import { HabeasDataController } from './habeas-data.controller';
import { HabeasDataService } from './habeas-data.service';
import { AccessControlModule } from '../../access-control/access-control.module';

@Module({
  imports: [TypeOrmModule.forFeature([HabeasDataConsent, ArcoRequest]), AccessControlModule],
  controllers: [HabeasDataController],
  providers: [HabeasDataService],
  exports: [HabeasDataService],
})
export class HabeasDataModule {}
