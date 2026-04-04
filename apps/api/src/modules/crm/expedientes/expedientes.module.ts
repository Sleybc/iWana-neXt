import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpedienteService } from './expediente.service';
import { StatusTransitionService } from './status-transition.service';
import { CompletenessCalculator } from './completeness-calculator.service';
import { ExpedientesController } from './expedientes.controller';
import { PipelineController } from './expedientes.controller';
import { ExpedienteRecord } from './entities/expediente-record.entity';
import { ContactAttempt } from './entities/contact-attempt.entity';
import { ConsentRecord } from './entities/consent-record-v2.entity';
import { CoverageCheck } from './entities/coverage-check.entity';
import { StatusChange } from './entities/status-change.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpedienteRecord,
      ContactAttempt,
      ConsentRecord,
      CoverageCheck,
      StatusChange,
      Quote,
    ]),
    AuditModule,
  ],
  controllers: [ExpedientesController, PipelineController],
  providers: [ExpedienteService, StatusTransitionService, CompletenessCalculator],
  exports: [ExpedienteService],
})
export class ExpedientesModule {}
