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
} from '@iwana/db';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { ExecutionOrdersController } from './execution-orders.controller';
import { TasksController } from './tasks.controller';
import { ExecutionOrderInventoryService } from './services/execution-order-inventory.service';
import { ExecutionOrdersService } from './services/execution-orders.service';
import { TaskAssignmentService } from './services/task-assignment.service';
import { TaskTimelineService } from './services/task-timeline.service';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    InventoryModule,
    UsersModule,
    TypeOrmModule.forFeature([
      OperationalTask,
      TaskTimelineEvent,
      TaskAssignmentHistory,
      ExecutionOrder,
      ExecutionOrderActivity,
      ExecutionOrderItemUsage,
      ExecutionOrderEvidence,
    ]),
  ],
  controllers: [TasksController, ExecutionOrdersController],
  providers: [
    TasksService,
    TaskTimelineService,
    TaskAssignmentService,
    ExecutionOrderInventoryService,
    ExecutionOrdersService,
  ],
  exports: [TasksService, ExecutionOrdersService],
})
export class TasksModule {}
