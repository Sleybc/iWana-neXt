import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HabeasDataService } from '../habeas-data.service';

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

describe('HabeasDataService', () => {
  let service: HabeasDataService;

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [HabeasDataService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<HabeasDataService>(HabeasDataService);
  });

  it('registra consentimiento habeas data', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'cons-1',
          }),
        },
      }),
    );

    const created = await service.createConsent('sub-1', {
      accepted: true,
      channel: 'WEB',
      legalTextVersion: 'v1.0',
    });

    expect(created.id).toBe('cons-1');
    expect(created.accepted).toBe(true);
  });
});
