import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderEvidence,
  ExecutionOrderEvidenceUploadIntent,
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
  ExecutionOrderStatusTransition,
} from '@iwana/db';
import { AccessControlModule } from '../access-control/access-control.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AssuranceModule } from '../assurance/assurance.module';
import { UsersModule } from '../users/users.module';
import { MediaModule } from '../media/media.module';
import { OrganizationModule } from '../organization/organization.module';
import { RedisModule } from '../redis/redis.module';
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
    OrganizationModule,
    RedisModule,
    TypeOrmModule.forFeature([
      OperationalTask,
      TaskTimelineEvent,
      TaskAssignmentHistory,
      ExecutionOrder,
      ExecutionOrderActivity,
      ExecutionOrderItemUsage,
      ExecutionOrderEvidence,
      // Sin este registro la entidad no obtiene metadata bajo autoLoadEntities
      // y POST .../evidence-assets falla con EntityMetadataNotFoundError (500).
      ExecutionOrderEvidenceUploadIntent,
      ExecutionOrderTemplate,
      ExecutionOrderTemplateVersion,
      ExecutionOrderTemplateRequirement,
      ExecutionOrderOutboxEvent,
      ExecutionOrderInboxEvent,
      ExecutionOrderIdempotencyRecord,
      ExecutionOrderAuditIntent,
      // MOD11 T1 B1 (ADR-089 §D1): asientos de transición de la OT.
      ExecutionOrderStatusTransition,
    ]),
  ],
  /**
   * El orden importa (DEF-F6-01, OLA 4.1): Express resuelve en orden de
   * registro y `TasksController` declara `@Get(':id')` (un segmento), que
   * captura las rutas estáticas hermanas de un solo segmento
   * (`tasks/execution-orders` y `tasks/execution-order-templates`) y el
   * `ParseUUIDPipe` las convierte en 400 si este controlador se registra
   * primero. Los controladores de rutas estáticas van antes; la regresión
   * vive en `tests/tasks-routing.spec.ts`.
   */
  controllers: [ExecutionOrdersController, ExecutionOrderTemplatesController, TasksController],
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
  ],
  exports: [
    TasksService,
    ExecutionOrdersService,
    ExecutionOrderProjectionConvergenceService,
    EXECUTION_ORDER_SCHEDULING_PORT,
  ],
})
export class TasksModule {}
