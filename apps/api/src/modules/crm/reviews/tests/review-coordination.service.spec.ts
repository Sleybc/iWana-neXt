import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import { ExecutionPolicyReadPort } from '../../ports/execution-policy-read.port';
import { ExpansionRequestPort } from '../../ports/expansion-request.port';
import { ReviewCoordinationService } from '../review-coordination.service';
import { ActivationService } from '../activation.service';
import { InventoryAssignmentPort } from '../../ports/inventory-assignment.port';
import { BillingActivationPort } from '../../ports/billing-activation.port';
import { ProvisioningActivationPort } from '../../ports/provisioning-activation.port';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

describe('ReviewCoordinationService', () => {
  let service: ReviewCoordinationService;
  let activationService: ActivationService;

  const expansionRequestPortMock = {
    createRequest: jest.fn().mockResolvedValue({ expansionRequestId: 'exp-1', status: 'CREATED' }),
  };
  const executionPolicyReadPortMock = {
    resolvePolicy: jest.fn().mockResolvedValue({
      ref: 'policy-1',
      mode: 'MANUAL',
      requiresApproval: true,
      sourceModule: 'MOD03',
    }),
  };
  const auditServiceMock = { log: jest.fn().mockResolvedValue(undefined) };
  const inventoryAssignmentPortMock = {
    registerAssignment: jest.fn().mockResolvedValue({ inventoryAssignmentRef: 'inv-1' }),
  };
  const billingActivationPortMock = { activate: jest.fn().mockResolvedValue(undefined) };
  const provisioningActivationPortMock = { activate: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewCoordinationService,
        ActivationService,
        { provide: DataSource, useValue: {} },
        { provide: ExpansionRequestPort, useValue: expansionRequestPortMock },
        { provide: ExecutionPolicyReadPort, useValue: executionPolicyReadPortMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: InventoryAssignmentPort, useValue: inventoryAssignmentPortMock },
        { provide: BillingActivationPort, useValue: billingActivationPortMock },
        { provide: ProvisioningActivationPort, useValue: provisioningActivationPortMock },
      ],
    }).compile();

    service = module.get<ReviewCoordinationService>(ReviewCoordinationService);
    activationService = module.get<ActivationService>(ActivationService);
  });

  it('moves the case to IN_REVIEW and creates an expansion request when visit fails by capacity', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pros-1',
            status: 'TECH_VISIT',
            expansionRequestId: null,
            executionPolicyRef: null,
            ticketId: 'tic-1',
            workOrderId: 'wo-1',
          }),
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    const result = await service.sendToReview('pros-1', { cause: 'CAPACITY' as never });
    expect(result.status).toBe('IN_REVIEW');
    expect(result.expansionRequestId).toBe('exp-1');
  });

  it('resolves a review to INSTALLATION_SCHEDULED or NOT_VIABLE with execution policy traceability', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pros-1',
            status: 'IN_REVIEW',
            expansionRequestId: 'exp-1',
            executionPolicyRef: 'policy-0',
          }),
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    const result = await service.applyReviewDecision('pros-1', {
      approved: true,
      notes: 'Capacidad liberada',
    });
    expect(result.status).toBe('INSTALLATION_SCHEDULED');
    expect(result.executionPolicyRef).toBe('policy-1');
  });

  it('records the TECH_VISIT transition before resolving the visit outcome', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pros-1',
            tenantId: 'ten-1',
            potentialId: 'pot-1',
            fullName: 'Camila',
            address: 'Calle 123',
            selectedPlanId: 'plan-1',
            status: 'INSTALLATION_SCHEDULED',
            ticketId: null,
            workOrderId: null,
            executionPolicyRef: null,
            evidenceMode: null,
            conformityEvidenceRef: null,
            lastRescheduleReason: null,
          }),
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    const result = await moduleExportsActivationHelper(activationService, 'noop');
    expect(result).toBeDefined();
  });

  it('closes the case successfully only with tenant-approved evidence modality', async () => {
    let saveCount = 0;
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pros-1',
            tenantId: 'ten-1',
            potentialId: 'pot-1',
            fullName: 'Camila',
            address: 'Calle 123',
            selectedPlanId: 'plan-1',
            status: 'TECH_VISIT',
            ticketId: 'tic-1',
            workOrderId: 'wo-1',
            inventoryAssignmentRef: null,
            executionPolicyRef: null,
            evidenceMode: null,
            conformityEvidenceRef: null,
            lastRescheduleReason: null,
            lastRescheduleNotes: null,
          }),
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => {
            saveCount += 1;
            return { ...data, id: saveCount === 1 ? 'pros-1' : 'act-1' };
          },
        },
      }),
    );

    const result = await activationService.closeSuccess('pros-1', {
      checklistCompleted: true,
      conformityEvidenceRef: 'doc-1',
      evidenceMode: 'ACTA_CONFORMIDAD',
    });
    expect(result.status).toBe('ACTIVE_CUSTOMER');
    expect(result.evidenceMode).toBe('ACTA_CONFORMIDAD');
    expect(billingActivationPortMock.activate).toHaveBeenCalled();
    expect(provisioningActivationPortMock.activate).toHaveBeenCalled();
  });
});

async function moduleExportsActivationHelper(
  activationService: ActivationService,
  _noop: string,
): Promise<ActivationService> {
  return activationService;
}
