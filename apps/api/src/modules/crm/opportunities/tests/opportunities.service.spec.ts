import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OpportunitiesService } from '../opportunities.service';

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

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpportunitiesService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<OpportunitiesService>(OpportunitiesService);
  });

  it('crea oportunidad con etapa DISCOVERY', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'opp-1',
          }),
        },
      }),
    );

    const created = await service.create({ title: 'Oportunidad demo' });
    expect(created.id).toBe('opp-1');
    expect(created.stage).toBe('DISCOVERY');
  });
});
