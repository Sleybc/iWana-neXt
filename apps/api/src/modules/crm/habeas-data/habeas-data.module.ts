import { Module } from '@nestjs/common';
import { HabeasDataController } from './habeas-data.controller';
import { AccessControlModule } from '../../access-control/access-control.module';

@Module({
  imports: [AccessControlModule],
  controllers: [HabeasDataController],
})
export class HabeasDataModule {}
