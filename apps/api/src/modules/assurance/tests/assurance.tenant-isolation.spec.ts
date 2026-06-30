import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssuranceFieldServicePort } from '../ports/assurance-field-service.port';
import { PqrService } from '../services/pqr.service';
import { SlaService } from '../services/sla.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';

type TenantCtx = { tenantId: string; schemaName: string };

let activeTenantContext: TenantCtx = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };
const schemaCalls: string[] = [];

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      ...(actual.TenantContext as Record<string, unknown>),
      getOrThrow: () => activeTenantContext,
    },
    runInTenantSchema: jest.fn(),
    SupportTicket: class SupportTicket {},
    TicketSlaPolicy: class TicketSlaPolicy {},
    TicketWorkOrderLink: class TicketWorkOrderLink {},
  };
});

describe('Assurance tenant isolation', () => {
  let service: TicketsService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const buildActor = (tenantId: string, schemaName: string): JwtPayload => ({
    sub: `${tenantId}-admin`,
    email: `${tenantId}@example.test`,
    role: UserRole.ADMIN,
    tenantId,
    schemaName,
    jti: `jti-${tenantId}`,
    type: 'tenant',
  });

  beforeEach(() => {
    schemaCalls.length = 0;
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    mockRunInTenantSchema.mockImplementation(async (_ds, schemaName, fn) => {
      schemaCalls.push(schemaName);
      return fn({
        manager: {
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
          }),
        },
      } as any);
    });

    service = new TicketsService(
      {} as DataSource,
      {
        findApplicablePolicy: jest.fn(),
        calculateDeadlines: jest
          .fn()
          .mockReturnValue({ slaFirstResponseAt: null, slaResolveByAt: null }),
        calculatePqrDeadline: jest.fn(),
        deriveBreachStatus: jest.fn().mockReturnValue('OK'),
        listPolicies: jest.fn(),
        createPolicy: jest.fn(),
      } as unknown as SlaService,
      {
        createInitialPqrRecord: jest.fn(),
        listPqrRecords: jest.fn(),
      } as unknown as PqrService,
      {
        recordWithManager: jest.fn(),
        listTimeline: jest.fn(),
      } as unknown as TimelineService,
      {
        requestFieldService: jest.fn(),
      } as AssuranceFieldServicePort,
    );
  });

  it('uses tenant_a search_path for tenant A requests', async () => {
    activeTenantContext = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };

    await service.list({ page: 1, limit: 20 }, buildActor('tenant-a-id', 'tenant_a'));

    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('uses tenant_b search_path for tenant B requests', async () => {
    activeTenantContext = { tenantId: 'tenant-b-id', schemaName: 'tenant_b' };

    await service.list({ page: 1, limit: 20 }, buildActor('tenant-b-id', 'tenant_b'));

    expect(schemaCalls).toEqual(['tenant_b']);
  });
});
