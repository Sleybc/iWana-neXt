import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractSignGuard } from './guards/contract-sign.guard';
import { AccessControlModule } from '../../access-control/access-control.module';

@Module({
  imports: [TypeOrmModule.forFeature([Contract]), AccessControlModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractSignGuard],
  exports: [ContractsService],
})
export class ContractsModule {}
