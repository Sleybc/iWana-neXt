import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmActorReadPort } from '../ports/crm-actor-read.port';
import { CrmQuoteReadPort } from '../ports/crm-quote-read.port';
import { ExpedienteService } from './expediente.service';
import { StatusTransitionService } from './status-transition.service';
import { CompletenessCalculator } from './completeness-calculator.service';
import { CrmActorReadAdapter } from './crm-actor-read.adapter';
import { CrmQuoteReadAdapter } from './crm-quote-read.adapter';
import { ExpedienteSectionCompletenessService } from './expediente-section-completeness.service';
import { PipelineRecommendationService } from './pipeline-recommendation.service';
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
  providers: [
    ExpedienteService,
    StatusTransitionService,
    CompletenessCalculator,
    ExpedienteSectionCompletenessService,
    PipelineRecommendationService,
    { provide: CrmActorReadPort, useClass: CrmActorReadAdapter },
    { provide: CrmQuoteReadPort, useClass: CrmQuoteReadAdapter },
  ],
  exports: [ExpedienteService],
})
export class ExpedientesModule {}
