import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { BusinessHoursWeekday } from '@iwana/shared';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  OrganizationBusinessHoursException: class OrganizationBusinessHoursException {},
  OrganizationCompanyBusinessHours: class OrganizationCompanyBusinessHours {},
  WfmSiteBusinessHours: class WfmSiteBusinessHours {},
}));

describe('OperatingWindowResolverService', () => {
  let service: OperatingWindowResolverService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const baseInput = {
    tenantId: 'tenant-001',
    organizationSiteId: 'site-001',
    technicianId: null,
    dateLocal: '2026-05-18',
    timezone: 'America/Bogota',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new OperatingWindowResolverService({} as DataSource);
  });

  it('bloquea por festivo cuando hay cierre especial aplicable (maxima prioridad)', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          blackouts: [
            {
              tenantId: 'tenant-001',
              organizationSiteId: null,
              exceptionDate: '2026-05-18',
              isRecurring: false,
              name: 'Festivo nacional',
              isOpen: false,
            },
          ],
          companyHours: {
            tenantId: 'tenant-001',
            weekday: BusinessHoursWeekday.SUNDAY,
            opensAt: '09:00',
            closesAt: '17:00',
            isOpen: true,
          },
        }),
      } as any),
    );

    const result = await service.resolve(baseInput);

    expect(TenantContext.getOrThrow).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'CLOSED',
      source: 'HOLIDAY_BLACKOUT',
      startTime: null,
      endTime: null,
      reason: 'Festivo nacional',
    });
  });

  it('bloquea por festivo si no existe cierre en otra fecha', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          blackouts: [
            {
              tenantId: 'tenant-001',
              organizationSiteId: null,
              exceptionDate: '2026-05-18',
              isRecurring: false,
              name: 'Festivo nacional',
              isOpen: false,
            },
          ],
        }),
      } as any),
    );

    const result = await service.resolve(baseInput);

    expect(result).toEqual({
      status: 'CLOSED',
      source: 'HOLIDAY_BLACKOUT',
      startTime: null,
      endTime: null,
      reason: 'Festivo nacional',
    });
  });

  it('devuelve SITE_HOURS cuando existe configuracion de sede para la fecha', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          blackouts: [],
          siteHours: {
            tenantId: 'tenant-001',
            organizationSiteId: 'site-001',
            weekday: BusinessHoursWeekday.MONDAY,
            startTime: '07:30',
            endTime: '16:30',
            isEnabled: true,
          },
          companyHours: {
            tenantId: 'tenant-001',
            weekday: BusinessHoursWeekday.MONDAY,
            opensAt: '08:00',
            closesAt: '18:00',
            isOpen: true,
          },
        }),
      } as any),
    );

    const result = await service.resolve({ ...baseInput, dateLocal: '2026-05-18' });

    expect(result).toEqual({
      status: 'OPEN',
      source: 'SITE_HOURS',
      startTime: '07:30',
      endTime: '16:30',
      reason: null,
    });
  });

  it('cae a horario de empresa cuando no hay festivo', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          blackouts: [],
          companyHours: {
            tenantId: 'tenant-001',
            weekday: BusinessHoursWeekday.TUESDAY,
            opensAt: '09:00',
            closesAt: '17:00',
            isOpen: true,
          },
        }),
      } as any),
    );

    const result = await service.resolve({ ...baseInput, dateLocal: '2026-05-19' });

    expect(result).toEqual({
      status: 'OPEN',
      source: 'COMPANY_HOURS',
      startTime: '09:00',
      endTime: '17:00',
      reason: null,
    });
  });

  it('cae a horario de empresa cuando no existe regla de sede', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          blackouts: [],
          siteHours: null,
          companyHours: {
            tenantId: 'tenant-001',
            weekday: BusinessHoursWeekday.WEDNESDAY,
            opensAt: '08:00',
            closesAt: '18:00',
            isOpen: true,
          },
        }),
      } as any),
    );

    const result = await service.resolve({ ...baseInput, dateLocal: '2026-05-20' });

    expect(result).toEqual({
      status: 'OPEN',
      source: 'COMPANY_HOURS',
      startTime: '08:00',
      endTime: '18:00',
      reason: null,
    });
  });

  it('devuelve cerrado por configuracion faltante cuando no hay reglas aplicables', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          blackouts: [],
          siteHours: null,
          companyHours: null,
        }),
      } as any),
    );

    const result = await service.resolve({
      ...baseInput,
      organizationSiteId: null,
      technicianId: null,
    });

    expect(result).toEqual({
      status: 'CLOSED',
      source: 'MISSING_CONFIGURATION',
      startTime: null,
      endTime: null,
      reason: 'No existe una configuracion de horario operativo para la fecha consultada.',
    });
  });
});

function buildManager(data: {
  blackouts?: unknown[];
  siteHours?: unknown | null;
  companyHours?: unknown | null;
}) {
  return {
    find: jest.fn().mockImplementation((entity) => {
      const name = entity?.name;

      if (name === 'OrganizationBusinessHoursException') {
        return Promise.resolve(data.blackouts ?? []);
      }

      return Promise.resolve([]);
    }),
    findOne: jest.fn().mockImplementation((entity) => {
      const name = entity?.name;
      if (name === 'WfmSiteBusinessHours') {
        return Promise.resolve(data.siteHours ?? null);
      }
      if (name === 'OrganizationCompanyBusinessHours') {
        return Promise.resolve(data.companyHours ?? null);
      }

      return Promise.resolve(null);
    }),
  };
}
