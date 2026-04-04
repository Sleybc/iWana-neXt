import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ContractsService } from '../contracts.service';

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

describe('ContractsService', () => {
  let service: ContractsService;

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContractsService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  it('crea contrato en el schema del tenant', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'ctr-1',
          }),
        },
      }),
    );

    const created = await service.create({
      quoteId: 'q-1',
      subscriberId: 's-1',
      planId: 'p-1',
      planSnapshotJson: { planId: 'p-1' },
    });

    expect(created.id).toBe('ctr-1');
    expect(created.quoteId).toBe('q-1');
  });
});
