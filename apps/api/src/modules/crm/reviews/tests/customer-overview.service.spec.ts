import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CustomerOverviewService } from '../customer-overview.service';

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

describe('CustomerOverviewService', () => {
  let service: CustomerOverviewService;

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerOverviewService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<CustomerOverviewService>(CustomerOverviewService);
  });

  it('builds the customer overview from references without reading foreign tables directly', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'cust-1',
            fullName: 'Camila Torres',
            ticketId: 'tic-1',
            workOrderId: 'wo-1',
            inventoryAssignmentRef: 'inv-1',
            expansionRequestId: 'exp-1',
            conformityEvidenceRef: 'doc-1',
          }),
        },
      }),
    );

    const overview = await service.getCustomerOverview('cust-1');
    expect(overview.ticketId).toBe('tic-1');
    expect(overview.workOrderId).toBe('wo-1');
  });
});
