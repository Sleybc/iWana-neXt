import { DataSource } from 'typeorm';
import {
  runInTenantSchema,
  TenantContext,
  WfmCompanyBusinessHours,
  WfmOperatingSite,
  WfmSiteBusinessHours,
} from '@iwana/db';
import { BusinessHoursWeekday, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { OperatingSitesService } from './operating-sites.service';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;

  return {
    ...actual,
    runInTenantSchema: jest.fn(),
    TenantContext: {
      ...(actual.TenantContext as Record<string, unknown>),
      getOrThrow: jest.fn(),
    },
  };
});

const mockRunInTenantSchema = runInTenantSchema as jest.Mock;
const mockTenantContextGetOrThrow = TenantContext.getOrThrow as jest.Mock;

const tenantContext = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  schemaName: 'tenant_demo',
};

const actor: JwtPayload = {
  sub: 'admin-1',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
  tenantId: tenantContext.tenantId,
  schemaName: tenantContext.schemaName,
  jti: 'jti-admin-1',
  type: 'tenant',
};

describe('OperatingSitesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue(tenantContext);
  });

  it('should copy company business hours when creating an operating site', async () => {
    const companyDays = [
      {
        tenantId: tenantContext.tenantId,
        weekday: BusinessHoursWeekday.MONDAY,
        startTime: '08:00',
        endTime: '18:00',
        isEnabled: true,
      },
      {
        tenantId: tenantContext.tenantId,
        weekday: BusinessHoursWeekday.SUNDAY,
        startTime: null,
        endTime: null,
        isEnabled: false,
      },
    ];
    const manager = {
      find: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === WfmOperatingSite) {
          return Promise.resolve([]);
        }

        if (entity === WfmCompanyBusinessHours) {
          return Promise.resolve(companyDays);
        }

        return Promise.resolve([]);
      }),
      create: jest.fn().mockImplementation((_entity: unknown, payload: object) => ({ ...payload })),
      save: jest.fn().mockImplementation((entity: unknown, payload: unknown) => {
        if (entity === WfmOperatingSite) {
          return Promise.resolve({ ...(payload as object), id: 'site-1' });
        }

        return Promise.resolve(payload);
      }),
    };

    mockRunInTenantSchema.mockImplementation(
      async (
        _dataSource: DataSource,
        _schemaName: string,
        callback: (qr: { manager: typeof manager }) => Promise<unknown>,
      ) => callback({ manager }),
    );

    const service = new OperatingSitesService({} as DataSource);

    const result = await service.create(
      {
        name: 'Bogotá centro',
        code: 'bog-cen',
        isActive: true,
      },
      actor,
    );

    expect(result).toMatchObject({ id: 'site-1', name: 'Bogotá centro', code: 'BOG-CEN' });
    expect(manager.save).toHaveBeenCalledWith(
      WfmSiteBusinessHours,
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: tenantContext.tenantId,
          siteId: 'site-1',
          weekday: BusinessHoursWeekday.MONDAY,
          startTime: '08:00',
          endTime: '18:00',
          isEnabled: true,
        }),
        expect.objectContaining({
          tenantId: tenantContext.tenantId,
          siteId: 'site-1',
          weekday: BusinessHoursWeekday.SUNDAY,
          startTime: null,
          endTime: null,
          isEnabled: false,
        }),
      ]),
    );
  });
});
