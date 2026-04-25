import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { QuotesService } from '../quotes.service';
import { PlanCatalogReadPort } from '../../ports/plan-catalog-read.port';

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

describe('QuotesService', () => {
  let service: QuotesService;

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: DataSource, useValue: {} },
        {
          provide: PlanCatalogReadPort,
          useValue: {
            getActivePlans: jest.fn(),
            createSnapshot: jest.fn().mockResolvedValue({
              planId: 'plan-1',
              name: 'Plan 1',
              downloadSpeed: 100,
              uploadSpeed: 30,
              monthlyPrice: 100000,
              installationFee: 50000,
              technology: 'GPON',
              snapshotAt: new Date('2026-01-01T00:00:00Z'),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
  });

  it('crea cotizacion con snapshot del plan', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'qt-1',
          }),
        },
      }),
    );

    const created = await service.create({
      opportunityId: 'opp-1',
      subscriberId: 'sub-1',
      planId: 'plan-1',
      monthlyAmount: '100000',
    });

    expect(created.id).toBe('qt-1');
    expect(created.planId).toBe('plan-1');
  });
});
