import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractSignGuard } from './guards/contract-sign.guard';
import { AccessControlModule } from '../../access-control/access-control.module';
import { AuditModule } from '../../audit/audit.module';
import { CommercialModule } from '../../commercial/commercial.module';
import { TaxationModule } from '../../taxation/taxation.module';
import { MediaModule } from '../../media/media.module';
import { PrivacyModule } from '../../privacy/privacy.module';
import { ContractsBlockedTitularGuard } from './guards/contracts-blocked-titular.guard';
import { SubscribersModule } from '../subscribers/subscribers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract]),
    AccessControlModule,
    AuditModule,
    CommercialModule,
    TaxationModule,
    MediaModule,
    PrivacyModule,
    SubscribersModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService, ContractSignGuard, ContractsBlockedTitularGuard],
  exports: [ContractsService],
})
export class ContractsModule {}
