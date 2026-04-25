import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { ProspectCase } from '../prospects/entities/prospect-case.entity';
import { CustomerActivation } from './entities/customer-activation.entity';
import { ReviewsController } from './reviews.controller';
import { ActivationService } from './activation.service';
import { ReviewCoordinationService } from './review-coordination.service';
import { CustomerOverviewService } from './customer-overview.service';
import { ExpansionRequestPort } from '../ports/expansion-request.port';
import { ExecutionPolicyReadPort } from '../ports/execution-policy-read.port';
import { InventoryAssignmentPort } from '../ports/inventory-assignment.port';
import { BillingActivationPort } from '../ports/billing-activation.port';
import { ProvisioningActivationPort } from '../ports/provisioning-activation.port';
import { StubExpansionRequestAdapter } from '../adapters/stub-expansion-request.adapter';
import { StubInventoryAssignmentAdapter } from '../adapters/stub-inventory-assignment.adapter';
import { StubBillingActivationAdapter } from '../adapters/stub-billing-activation.adapter';
import { StubProvisioningActivationAdapter } from '../adapters/stub-provisioning-activation.adapter';
import { TenantModule } from '../../tenant/tenant.module';
import { ExecutionPolicyMode } from '../enums/execution-policy-mode.enum';

class ReviewsExecutionPolicyReadAdapter extends ExecutionPolicyReadPort {
  async resolvePolicy(): Promise<{
    ref: string;
    mode: ExecutionPolicyMode;
    requiresApproval: boolean;
    sourceModule: 'MOD03';
  }> {
    return {
      ref: 'mod03-default-policy',
      mode: ExecutionPolicyMode.MANUAL,
      requiresApproval: true,
      sourceModule: 'MOD03',
    };
  }
}

@Module({
  imports: [
    AuditModule,
    TenantModule,
    TypeOrmModule.forFeature([ProspectCase, CustomerActivation]),
  ],
  controllers: [ReviewsController],
  providers: [
    ActivationService,
    ReviewCoordinationService,
    CustomerOverviewService,
    { provide: ExpansionRequestPort, useClass: StubExpansionRequestAdapter },
    { provide: ExecutionPolicyReadPort, useClass: ReviewsExecutionPolicyReadAdapter },
    { provide: InventoryAssignmentPort, useClass: StubInventoryAssignmentAdapter },
    { provide: BillingActivationPort, useClass: StubBillingActivationAdapter },
    { provide: ProvisioningActivationPort, useClass: StubProvisioningActivationAdapter },
  ],
  exports: [ActivationService, ReviewCoordinationService, CustomerOverviewService],
})
export class ReviewsModule {}
