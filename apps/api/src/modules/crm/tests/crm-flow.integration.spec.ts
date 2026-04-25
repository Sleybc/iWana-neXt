import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from '../reviews/reviews.controller';
import { ActivationService } from '../reviews/activation.service';
import { ReviewCoordinationService } from '../reviews/review-coordination.service';
import { CustomerOverviewService } from '../reviews/customer-overview.service';

describe('CRM Flow contracts', () => {
  let controller: ReviewsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        {
          provide: ActivationService,
          useValue: {
            closeSuccess: jest.fn().mockResolvedValue({
              id: 'pros-1',
              status: 'ACTIVE_CUSTOMER',
              evidenceMode: 'ACTA_CONFORMIDAD',
            }),
          },
        },
        {
          provide: ReviewCoordinationService,
          useValue: {
            sendToReview: jest.fn().mockResolvedValue({
              id: 'pros-1',
              status: 'IN_REVIEW',
              expansionRequestId: 'exp-1',
              executionPolicyRef: 'policy-1',
            }),
            applyReviewDecision: jest.fn().mockResolvedValue({
              id: 'pros-1',
              status: 'INSTALLATION_SCHEDULED',
              expansionRequestId: 'exp-1',
              executionPolicyRef: 'policy-1',
            }),
          },
        },
        {
          provide: CustomerOverviewService,
          useValue: {
            getCustomerOverview: jest.fn().mockResolvedValue({
              customerId: 'cust-1',
              prospectId: 'pros-1',
              fullName: 'Camila',
              ticketId: 'tic-1',
              workOrderId: 'wo-1',
              inventoryAssignmentRef: 'inv-1',
              expansionRequestId: 'exp-1',
              conformityEvidenceRef: 'doc-1',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  it('POST /api/v1/crm/prospects/:id/close-success validates tenant-approved evidence modality', async () => {
    const result = await controller.closeSuccess('00000000-0000-4000-a000-000000000001', {
      checklistCompleted: true,
      conformityEvidenceRef: 'doc-1',
      evidenceMode: 'ACTA_CONFORMIDAD',
    });
    expect(result.data.status).toBe('ACTIVE_CUSTOMER');
  });

  it('GET /api/v1/crm/customers/:id/overview returns the composed customer overview', async () => {
    const result = await controller.getCustomerOverview('00000000-0000-4000-a000-000000000001');
    expect(result.data.ticketId).toBe('tic-1');
  });

  it('PATCH /api/v1/crm/reviews/:id/decision applies the review decision according to the execution policy', async () => {
    const result = await controller.applyDecision('00000000-0000-4000-a000-000000000001', {
      approved: true,
      notes: 'ok',
    });
    expect(result.data.executionPolicyRef).toBe('policy-1');
  });
});
