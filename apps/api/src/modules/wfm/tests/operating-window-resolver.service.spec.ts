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
  WfmTechnicianBusinessOverride: class WfmTechnicianBusinessOverride {},
  WfmHolidayBlackout: class WfmHolidayBlackout {},
  WfmSiteBusinessHours: class WfmSiteBusinessHours {},
  WfmCompanyBusinessHours: class WfmCompanyBusinessHours {},
}));

describe('OperatingWindowResolverService', () => {
  let service: OperatingWindowResolverService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const baseInput = {
    tenantId: 'tenant-001',
    siteId: 'site-001',
    technicianId: 'tech-001',
    dateLocal: '2026-05-18',
    timezone: 'America/Bogota',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new OperatingWindowResolverService({} as DataSource);
  });

  it('prioriza override de tecnico sobre festivo y sede', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          overrides: [
            {
              tenantId: 'tenant-001',
              userId: 'tech-001',
              siteId: 'site-001',
              overrideDate: '2026-05-18',
              weekday: null,
              startTime: '10:00',
              endTime: '16:00',
              isEnabled: true,
              reason: 'Turno especial',
            },
          ],
          blackouts: [
            {
              tenantId: 'tenant-001',
              siteId: null,
              blackoutDate: '2026-05-18',
              isRecurring: false,
              name: 'Festivo nacional',
              isEnabled: true,
            },
          ],
          siteHours: {
            tenantId: 'tenant-001',
            siteId: 'site-001',
            weekday: BusinessHoursWeekday.MONDAY,
            startTime: '09:00',
            endTime: '17:00',
            isEnabled: true,
          },
        }),
      } as any),
    );

    const result = await service.resolve(baseInput);

    expect(TenantContext.getOrThrow).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'OPEN',
      source: 'TECHNICIAN_OVERRIDE',
      startTime: '10:00',
      endTime: '16:00',
      reason: 'Turno especial',
    });
  });

  it('bloquea por festivo si no existe override tecnico', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          overrides: [],
          blackouts: [
            {
              tenantId: 'tenant-001',
              siteId: null,
              blackoutDate: '2026-05-18',
              isRecurring: false,
              name: 'Festivo nacional',
              isEnabled: true,
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

  it('cae a horario de sede cuando no hay override ni festivo', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          overrides: [],
          blackouts: [],
          siteHours: {
            tenantId: 'tenant-001',
            siteId: 'site-001',
            weekday: BusinessHoursWeekday.TUESDAY,
            startTime: '09:00',
            endTime: '17:00',
            isEnabled: true,
          },
        }),
      } as any),
    );

    const result = await service.resolve({ ...baseInput, dateLocal: '2026-05-19' });

    expect(result).toEqual({
      status: 'OPEN',
      source: 'SITE_HOURS',
      startTime: '09:00',
      endTime: '17:00',
      reason: null,
    });
  });

  it('cae a horario de empresa cuando no existe regla de sede', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: buildManager({
          overrides: [],
          blackouts: [],
          siteHours: null,
          companyHours: {
            tenantId: 'tenant-001',
            weekday: BusinessHoursWeekday.WEDNESDAY,
            startTime: '08:00',
            endTime: '18:00',
            isEnabled: true,
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
          overrides: [],
          blackouts: [],
          siteHours: null,
          companyHours: null,
        }),
      } as any),
    );

    const result = await service.resolve({ ...baseInput, siteId: null, technicianId: null });

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
  overrides?: unknown[];
  blackouts?: unknown[];
  siteHours?: unknown | null;
  companyHours?: unknown | null;
}) {
  return {
    find: jest.fn().mockImplementation((entity) => {
      const name = entity?.name;
      if (name === 'WfmTechnicianBusinessOverride') {
        return Promise.resolve(data.overrides ?? []);
      }

      if (name === 'WfmHolidayBlackout') {
        return Promise.resolve(data.blackouts ?? []);
      }

      return Promise.resolve([]);
    }),
    findOne: jest.fn().mockImplementation((entity) => {
      const name = entity?.name;
      if (name === 'WfmSiteBusinessHours') {
        return Promise.resolve(data.siteHours ?? null);
      }

      if (name === 'WfmCompanyBusinessHours') {
        return Promise.resolve(data.companyHours ?? null);
      }

      return Promise.resolve(null);
    }),
  };
}
