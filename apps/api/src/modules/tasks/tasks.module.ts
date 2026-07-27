import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderEvidence,
  ExecutionOrderItemUsage,
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
import { ExecutionOrdersController } from './execution-orders.controller';
import { TasksController } from './tasks.controller';
import { ExecutionOrderInventoryService } from './services/execution-order-inventory.service';
import { ExecutionOrdersService } from './services/execution-orders.service';
import { ExecutionOrderReliabilityService } from './services/execution-order-reliability.service';
import { ExecutionOrderAccessGuard } from './guards/execution-order-access.guard';
import { TenantAwareThrottlerGuard } from './guards/tenant-aware-throttler.guard';
import { ExecutionOrderResponseHeadersInterceptor } from './interceptors/execution-order-response-headers.interceptor';
import { EXECUTION_ORDER_SCHEDULING_PORT } from './ports/execution-order-scheduling.port';
import { TaskAssignmentService } from './services/task-assignment.service';
import { TaskTimelineService } from './services/task-timeline.service';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    InventoryModule,
    AssuranceModule,
    UsersModule,
    AccessControlModule,
    TypeOrmModule.forFeature([
      OperationalTask,
      TaskTimelineEvent,
      TaskAssignmentHistory,
      ExecutionOrder,
      ExecutionOrderActivity,
      ExecutionOrderItemUsage,
      ExecutionOrderEvidence,
      ExecutionOrderOutboxEvent,
      ExecutionOrderInboxEvent,
      ExecutionOrderIdempotencyRecord,
      ExecutionOrderAuditIntent,
    ]),
  ],
  controllers: [TasksController, ExecutionOrdersController],
  providers: [
    TasksService,
    TaskTimelineService,
    TaskAssignmentService,
    ExecutionOrderInventoryService,
    ExecutionOrdersService,
    ExecutionOrderReliabilityService,
    ExecutionOrderAccessGuard,
    TenantAwareThrottlerGuard,
    ExecutionOrderResponseHeadersInterceptor,
    { provide: EXECUTION_ORDER_SCHEDULING_PORT, useExisting: ExecutionOrdersService },
  ],
  exports: [TasksService, ExecutionOrdersService, EXECUTION_ORDER_SCHEDULING_PORT],
})
export class TasksModule {}
