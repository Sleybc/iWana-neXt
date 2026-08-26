import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ScheduleEventStatus, TechnicianAvailabilityType, WfmWorkType } from '@iwana/shared';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';
import { ScheduleRecommendationsService } from '../services/schedule-recommendations.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ScheduleEvent: class {},
  TechnicianAvailability: class {},
}));

function buildQueryBuilder<T>(result: T[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result),
  };
}

describe('ScheduleRecommendationsService', () => {
  let service: ScheduleRecommendationsService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;
  let tenantSettingsReadPort: { getTimezone: jest.Mock };
  let operatingWindowResolver: { resolveWithManager: jest.Mock };

  const baseInput = {
    workType: WfmWorkType.INSTALLATION,
    durationMinutes: 60,
    windowStartAt: '2026-06-01T09:00:00.000Z',
    windowEndAt: '2026-06-01T12:00:00.000Z',
    candidateUserIds: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ],
    municipality: 'Soacha',
    sector: 'Vereda Primavera',
    latitude: 4.583,
    longitude: -74.216,
    maxResults: 4,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    tenantSettingsReadPort = {
      getTimezone: jest.fn().mockResolvedValue('America/Bogota'),
    };
    operatingWindowResolver = {
      resolveWithManager: jest.fn().mockResolvedValue({
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '00:00',
        endTime: '23:59',
        reason: null,
      }),
    };
    service = new ScheduleRecommendationsService(
      {} as DataSource,
      tenantSettingsReadPort as unknown as WfmTenantSettingsReadPort,
      operatingWindowResolver as unknown as OperatingWindowResolverService,
    );
  });

  it('prioriza franjas de tecnicos con ruta territorial cercana', async () => {
    const nearbyEvent = {
      id: 'evt-near',
      assignedUserId: '11111111-1111-4111-8111-111111111111',
      status: ScheduleEventStatus.SCHEDULED,
      scheduledStartAt: new Date('2026-06-01T08:00:00.000Z'),
      scheduledEndAt: new Date('2026-06-01T09:00:00.000Z'),
      municipality: 'Soacha',
      sector: 'Vereda Primavera',
      latitude: '4.5829000',
      longitude: '-74.2161000',
    };
    const eventsQb = buildQueryBuilder([nearbyEvent]);
    const availabilityQb = buildQueryBuilder([]);

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: {
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(eventsQb)
            .mockReturnValueOnce(availabilityQb),
        },
      } as any),
    );

    const result = await service.recommend(baseInput);

    expect(TenantContext.getOrThrow).toHaveBeenCalled();
    expect(result[0]).toEqual(
      expect.objectContaining({
        technicianId: '11111111-1111-4111-8111-111111111111',
        scheduledStartAt: '2026-06-01T09:00:00.000Z',
        nearestEventId: 'evt-near',
      }),
    );
    expect(result[0]?.labels).toEqual(
      expect.arrayContaining([
        'Recomendado',
        'Mismo sector/vereda',
        'Mismo municipio',
        'Ruta compacta',
      ]),
    );
    expect(result[0]?.scoreBreakdown.sector).toBe(20);
  });

  it('descarta franjas bloqueadas por disponibilidad del tecnico', async () => {
    const blockedAvailability = {
      userId: '11111111-1111-4111-8111-111111111111',
      type: TechnicianAvailabilityType.BLOCKED,
      startsAt: new Date('2026-06-01T09:00:00.000Z'),
      endsAt: new Date('2026-06-01T12:00:00.000Z'),
    };
    const eventsQb = buildQueryBuilder([]);
    const availabilityQb = buildQueryBuilder([blockedAvailability]);

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: {
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(eventsQb)
            .mockReturnValueOnce(availabilityQb),
        },
      } as any),
    );

    const result = await service.recommend({
      ...baseInput,
      candidateUserIds: ['11111111-1111-4111-8111-111111111111'],
      windowStartAt: '2026-06-01T09:00:00.000Z',
      windowEndAt: '2026-06-01T10:00:00.000Z',
    });

    expect(result).toEqual([]);
  });

  it('rechaza ventanas demasiado amplias', async () => {
    await expect(
      service.recommend({
        ...baseInput,
        windowStartAt: '2026-06-01T00:00:00.000Z',
        windowEndAt: '2026-06-20T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('omite franjas cuando la ventana efectiva del tecnico esta cerrada', async () => {
    const eventsQb = buildQueryBuilder([]);
    const availabilityQb = buildQueryBuilder([]);

    operatingWindowResolver.resolveWithManager.mockResolvedValueOnce({
      status: 'CLOSED',
      source: 'HOLIDAY_BLACKOUT',
      startTime: null,
      endTime: null,
      reason: 'Festivo nacional',
    });

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: {
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(eventsQb)
            .mockReturnValueOnce(availabilityQb),
        },
      } as any),
    );

    const result = await service.recommend({
      ...baseInput,
      candidateUserIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(result).toEqual([]);
  });

  it('explica cuando todas las fechas carecen de horario operativo configurado', async () => {
    const eventsQb = buildQueryBuilder([]);
    const availabilityQb = buildQueryBuilder([]);

    operatingWindowResolver.resolveWithManager.mockResolvedValue({
      status: 'CLOSED',
      source: 'MISSING_CONFIGURATION',
      startTime: null,
      endTime: null,
      reason: 'No existe una configuracion de horario operativo para la fecha consultada.',
    });

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: {
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(eventsQb)
            .mockReturnValueOnce(availabilityQb),
        },
      } as any),
    );

    await expect(
      service.recommend({
        ...baseInput,
        candidateUserIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).rejects.toThrow(
      'No existe una configuracion de horario operativo para las fechas evaluadas.',
    );
  });

  it('conserva el resultado vacio cuando el horizonte combina falta de horario y un cierre valido', async () => {
    const eventsQb = buildQueryBuilder([]);
    const availabilityQb = buildQueryBuilder([]);

    operatingWindowResolver.resolveWithManager.mockImplementation(
      async (_manager: unknown, input: { dateLocal: string }) =>
        input.dateLocal === '2026-06-01'
          ? {
              status: 'CLOSED',
              source: 'MISSING_CONFIGURATION',
              startTime: null,
              endTime: null,
              reason: 'No existe una configuracion de horario operativo para la fecha consultada.',
            }
          : {
              status: 'CLOSED',
              source: 'HOLIDAY_BLACKOUT',
              startTime: null,
              endTime: null,
              reason: 'Cierre operativo',
            },
    );

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: {
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(eventsQb)
            .mockReturnValueOnce(availabilityQb),
        },
      } as any),
    );

    const result = await service.recommend({
      ...baseInput,
      candidateUserIds: ['11111111-1111-4111-8111-111111111111'],
      windowStartAt: '2026-06-01T12:00:00.000Z',
      windowEndAt: '2026-06-03T00:00:00.000Z',
    });

    expect(result).toEqual([]);
    expect(operatingWindowResolver.resolveWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dateLocal: '2026-06-01' }),
    );
    expect(operatingWindowResolver.resolveWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dateLocal: '2026-06-02' }),
    );
  });
});
