import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResponsibilitiesController } from './responsibilities.controller';
import { ResponsibilitiesService } from './responsibilities.service';
import { OperationalResponsibilityHistory } from './entities/operational-responsibility-history.entity';
import { CrmResponsibilityReadPort } from '../ports/crm-responsibility-read.port';

@Module({
  imports: [TypeOrmModule.forFeature([OperationalResponsibilityHistory])],
  controllers: [ResponsibilitiesController],
  providers: [
    ResponsibilitiesService,
    { provide: CrmResponsibilityReadPort, useExisting: ResponsibilitiesService },
  ],
  exports: [ResponsibilitiesService, CrmResponsibilityReadPort],
})
export class ResponsibilitiesModule {}
