import { Module } from '@nestjs/common';
import { ExecutionOrderTitularErasureParticipant } from './execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from './operational-task-titular-erasure.participant';

@Module({
  providers: [ExecutionOrderTitularErasureParticipant, OperationalTaskTitularErasureParticipant],
  exports: [ExecutionOrderTitularErasureParticipant, OperationalTaskTitularErasureParticipant],
})
export class TasksPrivacyModule {}
