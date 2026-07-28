import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderEvidence,
  ExecutionOrderItemUsage,
  ExecutionOrderTemplate,
  ExecutionOrderTemplateVersion,
  ExecutionOrderTemplateRequirement,
  OperationalTask,
  TaskAssignmentHistory,
  TaskTimelineEvent,
  ExecutionOrderOutboxEvent,
  ExecutionOrderInboxEvent,
  ExecutionOrderIdempotencyRecord,
  ExecutionOrderAuditIntent,
} from '@iwana/db';
import { AccessControlModule } from '../access-control/access-control.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AssuranceModule } from '../assurance/assurance.module';
import { UsersModule } from '../users/users.module';
import { MediaModule } from '../media/media.module';
import { ExecutionOrdersController } from './execution-orders.controller';
import { ExecutionOrderTemplatesController } from './execution-order-templates.controller';
import { TasksController } from './tasks.controller';
import { ExecutionOrderInventoryService } from './services/execution-order-inventory.service';
import { ExecutionOrderInventoryReconciliationService } from './services/execution-order-inventory-reconciliation.service';
import { ExecutionOrdersService } from './services/execution-orders.service';
import { ExecutionOrderTemplatesService } from './services/execution-order-templates.service';
import { ClosureGateEvaluatorService } from './services/closure-gate-evaluator.service';
import { ExecutionOrderReliabilityService } from './services/execution-order-reliability.service';
import { ExecutionOrderProjectionConvergenceService } from './services/execution-order-projection-convergence.service';
import { ExecutionOrderAccessGuard } from './guards/execution-order-access.guard';
import { TenantAwareThrottlerGuard } from './guards/tenant-aware-throttler.guard';
import { ExecutionOrderResponseHeadersInterceptor } from './interceptors/execution-order-response-headers.interceptor';
import { EXECUTION_ORDER_SCHEDULING_PORT } from './ports/execution-order-scheduling.port';
import { EVIDENCE_ASSET_PORT } from './ports/evidence-asset.port';
import { EvidenceAssetProvider } from './ports/evidence-asset.provider';
import { TaskAssignmentService } from './services/task-assignment.service';
import { TaskTimelineService } from './services/task-timeline.service';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    InventoryModule,
    AssuranceModule,
    UsersModule,
    AccessControlModule,
    MediaModule,
    TypeOrmModule.forFeature([
      OperationalTask,
      TaskTimelineEvent,
      TaskAssignmentHistory,
      ExecutionOrder,
      ExecutionOrderActivity,
      ExecutionOrderItemUsage,
      ExecutionOrderEvidence,
      ExecutionOrderTemplate,
      ExecutionOrderTemplateVersion,
      ExecutionOrderTemplateRequirement,
      ExecutionOrderOutboxEvent,
      ExecutionOrderInboxEvent,
      ExecutionOrderIdempotencyRecord,
      ExecutionOrderAuditIntent,
    ]),
  ],
  controllers: [TasksController, ExecutionOrdersController, ExecutionOrderTemplatesController],
  providers: [
    TasksService,
    TaskTimelineService,
    TaskAssignmentService,
    ExecutionOrderInventoryService,
    ExecutionOrderInventoryReconciliationService,
    ExecutionOrdersService,
    ExecutionOrderTemplatesService,
    ClosureGateEvaluatorService,
    ExecutionOrderReliabilityService,
    ExecutionOrderProjectionConvergenceService,
    ExecutionOrderAccessGuard,
    TenantAwareThrottlerGuard,
    ExecutionOrderResponseHeadersInterceptor,
    { provide: EXECUTION_ORDER_SCHEDULING_PORT, useExisting: ExecutionOrdersService },
    { provide: EVIDENCE_ASSET_PORT, useClass: EvidenceAssetProvider },
  ],
  exports: [TasksService, ExecutionOrdersService, EXECUTION_ORDER_SCHEDULING_PORT],
})
export class TasksModule {}
