import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ScheduleEventStatus, UserRole, VisitRequestStatus } from '@iwana/shared';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';
import { ScheduleEventsService } from '../services/schedule-events.service';
import { ScheduleConflictService } from '../services/schedule-conflict.service';
import { WorkOrdersService } from '../services/work-orders.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ScheduleEvent: class {},
  ScheduleRescheduleLog: class {},
  VisitRequest: class {},
  WorkOrder: class {},
  WorkOrderTask: class {},
  TechnicianAvailability: class {},
}));

describe('ScheduleEventsService', () => {
  let service: ScheduleEventsService;
  let mockDataSource: Partial<DataSource>;
  let mockConflictService: jest.Mocked<ScheduleConflictService>;
  let mockWorkOrdersService: jest.Mocked<WorkOrdersService>;
  let mockTenantService: {
    getTimezone: jest.Mock;
  };
  let mockOperatingWindowResolver: {
    resolve: jest.Mock;
    resolveWithManager: jest.Mock;
  };
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const adminActor = {
    sub: 'admin-001',
    email: 'admin@test.com',
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    role: UserRole.ADMIN,
    iat: 0,
    exp: 9999999999,
  };

  const technicianActor = {
    sub: 'tech-001',
    email: 'tech@test.com',
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    role: UserRole.TECHNICIAN,
    iat: 0,
    exp: 9999999999,
  };

  const contractorActor = {
    sub: 'contractor-001',
    email: 'contractor@test.com',
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    role: UserRole.CONTRACTOR,
    iat: 0,
    exp: 9999999999,
  };

  const validCreateInput = {
    type: 'INSTALLATION' as any,
    title: 'Instalacion fibra',
    scheduledStartAt: '2026-06-01T14:00:00Z',
    scheduledEndAt: '2026-06-01T16:00:00Z',
    assignedUserId: '22222222-2222-2222-2222-222222222222',
  };

  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-01T08:00:00Z'));

    mockDataSource = {};
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

    mockConflictService = {
      hasConflict: jest.fn().mockResolvedValue(false),
      hasConflictWithManager: jest.fn().mockResolvedValue(false),
    } as any;

    mockTenantService = {
      getTimezone: jest.fn().mockResolvedValue('America/Bogota'),
    };

    mockOperatingWindowResolver = {
      resolve: jest.fn().mockResolvedValue({
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      }),
      resolveWithManager: jest.fn().mockResolvedValue({
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      }),
    };

    mockWorkOrdersService = {
      create: jest.fn(),
      createWithinManager: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      transitionStatus: jest.fn(),
      generateCode: jest.fn(),
    } as any;

    service = new ScheduleEventsService(
      mockDataSource as DataSource,
      mockTenantService as unknown as WfmTenantSettingsReadPort,
      mockOperatingWindowResolver as unknown as OperatingWindowResolverService,
      mockConflictService,
      mockWorkOrdersService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create', () => {
    it('should create an event successfully when there is no conflict', async () => {
      const savedEvent = {
        id: 'evt-001',
        tenantId: 'tenant-001',
        status: ScheduleEventStatus.DRAFT,
        ...validCreateInput,
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            create: jest.fn().mockReturnValue(savedEvent),
            save: jest.fn().mockResolvedValue(savedEvent),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.create(validCreateInput, adminActor as any);
      expect(result.id).toBe('evt-001');
      expect(mockConflictService.hasConflictWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: adminActor.tenantId,
          assignedUserId: validCreateInput.assignedUserId,
        }),
      );
    });

    it('should throw BadRequestException when conflict is detected', async () => {
      mockConflictService.hasConflictWithManager.mockResolvedValue(true);
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {},
        };
        return fn(mockQr as any);
      });

      await expect(service.create(validCreateInput, adminActor as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for event duration < 15 minutes', async () => {
      const shortInput = {
        ...validCreateInput,
        scheduledStartAt: '2026-06-01T09:00:00Z',
        scheduledEndAt: '2026-06-01T09:10:00Z', // solo 10 minutos
      };

      await expect(service.create(shortInput, adminActor as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject schedules in the past', async () => {
      jest.setSystemTime(new Date('2026-06-10T12:00:00Z'));
      mockRunInTenantSchema.mockClear();

      await expect(service.create(validCreateInput, adminActor as any)).rejects.toThrow(
        'No se pueden agendar tareas en una fecha u hora anterior al momento actual',
      );
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('should reject installation schedules outside tenant business hours', async () => {
      const outOfRangeInput = {
        ...validCreateInput,
        scheduledStartAt: '2026-06-01T11:00:00Z',
        scheduledEndAt: '2026-06-01T13:00:00Z',
      };

      mockOperatingWindowResolver.resolve.mockResolvedValueOnce({
        status: 'CLOSED',
        source: 'HOLIDAY_BLACKOUT',
        startTime: null,
        endTime: null,
        reason: 'Festivo nacional',
      });

      mockRunInTenantSchema.mockClear();

      await expect(service.create(outOfRangeInput, adminActor as any)).rejects.toThrow(
        'La instalacion debe quedar dentro del horario operativo configurado.',
      );
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('should create a WorkOrder when workOrder is embedded in input', async () => {
      const inputWithWo = {
        ...validCreateInput,
        workOrder: { summary: 'Instalacion cliente nuevo' },
      };

      const mockWo = { id: 'wo-001' };
      mockWorkOrdersService.createWithinManager.mockResolvedValue(mockWo as any);

      const savedEvent = { id: 'evt-002', ...inputWithWo, workOrderId: null };
      const linkedEvent = { ...savedEvent, workOrderId: 'wo-001', updatedBy: adminActor.sub };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            create: jest.fn().mockReturnValue(savedEvent),
            save: jest.fn().mockResolvedValueOnce(savedEvent).mockResolvedValueOnce(linkedEvent),
          },
        };
        return fn(mockQr as any);
      });

      await service.create(inputWithWo as any, adminActor as any);
      expect(mockWorkOrdersService.createWithinManager).toHaveBeenCalled();
    });

    it('should keep organizationSiteId when provided', async () => {
      const inputWithSite = {
        ...validCreateInput,
        organizationSiteId: '99999999-9999-4999-8999-999999999999',
      };
      const savedEvent = {
        id: 'evt-site',
        tenantId: 'tenant-001',
        status: ScheduleEventStatus.DRAFT,
        ...inputWithSite,
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            create: jest.fn().mockReturnValue(savedEvent),
            save: jest.fn().mockResolvedValue(savedEvent),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.create(inputWithSite, adminActor as any);

      expect(result.organizationSiteId).toBe('99999999-9999-4999-8999-999999999999');
    });
  });

  describe('list — ownership rule for TECHNICIAN', () => {
    it('should restrict the query to assigned events of the current technician', async () => {
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.list({}, technicianActor as any);

      expect(andWhereMock).toHaveBeenCalledWith('se.assigned_user_id = :uid', {
        uid: technicianActor.sub,
      });
    });
  });

  describe('list — ownership rule for CONTRACTOR', () => {
    it('should restrict the query to assigned events of the current contractor', async () => {
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.list({}, contractorActor as any);

      expect(andWhereMock).toHaveBeenCalledWith('se.assigned_user_id = :uid', {
        uid: contractorActor.sub,
      });
    });
  });

  describe('list — expediente filter', () => {
    it('should restrict the query to events linked to the requested expediente', async () => {
      const expedienteId = '5acea022-2419-453a-a324-1a762853383f';
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([{ id: 'evt-expediente', expedienteId }]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.list({ expedienteId }, adminActor as any);

      expect(andWhereMock).toHaveBeenCalledWith('se.expediente_id = :expedienteId', {
        expedienteId,
      });
      expect(result).toEqual([{ id: 'evt-expediente', expedienteId }]);
    });
  });

  describe('list — overlap range filters', () => {
    it('should include events that overlap the requested window when from and to are provided', async () => {
      const from = '2026-06-01T08:00:00Z';
      const to = '2026-06-01T18:00:00Z';
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.list({ from, to }, adminActor as any);

      expect(andWhereMock).toHaveBeenCalledWith(
        'se.scheduled_start_at < :to AND se.scheduled_end_at > :from',
        { from, to },
      );
    });

    it('should keep overlapping events that started before the lower bound', async () => {
      const from = '2026-06-01T08:00:00Z';
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.list({ from }, adminActor as any);

      expect(andWhereMock).toHaveBeenCalledWith('se.scheduled_end_at > :from', { from });
    });
  });

  describe('getById — ownership rule for TECHNICIAN', () => {
    it('should throw ForbiddenException when TECHNICIAN requests event of another user', async () => {
      const eventBelongingToOther = {
        id: 'evt-003',
        tenantId: 'tenant-001',
        assignedUserId: 'another-tech-999',
        status: ScheduleEventStatus.SCHEDULED,
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue(eventBelongingToOther),
          },
        };
        return fn(mockQr as any);
      });

      await expect(service.getById('evt-003', technicianActor as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return the event when TECHNICIAN requests their own event', async () => {
      const ownEvent = {
        id: 'evt-004',
        tenantId: 'tenant-001',
        assignedUserId: technicianActor.sub,
        status: ScheduleEventStatus.SCHEDULED,
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: { findOne: jest.fn().mockResolvedValue(ownEvent) },
        };
        return fn(mockQr as any);
      });

      const result = await service.getById('evt-004', technicianActor as any);
      expect(result.id).toBe('evt-004');
    });
  });

  describe('getById — ownership rule for CONTRACTOR', () => {
    it('should throw ForbiddenException when CONTRACTOR requests event of another user', async () => {
      const eventBelongingToOther = {
        id: 'evt-005',
        tenantId: 'tenant-001',
        assignedUserId: 'another-contractor-999',
        status: ScheduleEventStatus.SCHEDULED,
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue(eventBelongingToOther),
          },
        };
        return fn(mockQr as any);
      });

      await expect(service.getById('evt-005', contractorActor as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('reschedule', () => {
    it('should throw BadRequestException when reason is missing', async () => {
      await expect(
        service.reschedule(
          'evt-001',
          {
            scheduledStartAt: '2026-06-02T14:00:00Z',
            scheduledEndAt: '2026-06-02T16:00:00Z',
            reason: '',
          } as any,
          adminActor as any,
        ),
      ).rejects.toThrow(); // Zod o BadRequest
    });

    it('should create a reschedule log and update event', async () => {
      const existingEvent = {
        id: 'evt-001',
        tenantId: 'tenant-001',
        assignedUserId: 'tech-001',
        scheduledStartAt: new Date('2026-06-01T09:00:00Z'),
        scheduledEndAt: new Date('2026-06-01T11:00:00Z'),
        status: ScheduleEventStatus.SCHEDULED,
      };

      let logSaved = false;

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue(existingEvent),
            create: jest.fn().mockImplementation((_entity, data) => data),
            save: jest.fn().mockImplementation((_entity, data) => {
              logSaved = true;
              return Promise.resolve(data);
            }),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.reschedule(
        'evt-001',
        {
          scheduledStartAt: '2026-06-02T14:00:00Z',
          scheduledEndAt: '2026-06-02T16:00:00Z',
          reason: 'Solicitud del cliente',
        },
        adminActor as any,
      );

      expect(logSaved).toBe(true);
      expect(result.status).toBe(ScheduleEventStatus.RESCHEDULED);
      expect(mockConflictService.hasConflict).toHaveBeenCalledTimes(1);
      expect(mockConflictService.hasConflict).toHaveBeenCalledWith({
        tenantId: adminActor.tenantId,
        assignedUserId: existingEvent.assignedUserId,
        scheduledStartAt: '2026-06-02T14:00:00Z',
        scheduledEndAt: '2026-06-02T16:00:00Z',
        excludeEventId: 'evt-001',
      });
    });

    it('should reject installation reschedules outside tenant business hours', async () => {
      const existingEvent = {
        id: 'evt-010',
        tenantId: 'tenant-001',
        assignedUserId: 'tech-001',
        type: 'INSTALLATION',
        organizationSiteId: null,
        scheduledStartAt: new Date('2026-06-01T09:00:00Z'),
        scheduledEndAt: new Date('2026-06-01T11:00:00Z'),
        status: ScheduleEventStatus.SCHEDULED,
      };

      mockOperatingWindowResolver.resolveWithManager.mockResolvedValueOnce({
        status: 'CLOSED',
        source: 'HOLIDAY_BLACKOUT',
        startTime: null,
        endTime: null,
        reason: 'Festivo nacional',
      });

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue(existingEvent),
          },
        };
        return fn(mockQr as any);
      });

      await expect(
        service.reschedule(
          'evt-010',
          {
            scheduledStartAt: '2026-06-02T11:00:00Z',
            scheduledEndAt: '2026-06-02T13:00:00Z',
            reason: 'Cliente indisponible en la manana',
          },
          adminActor as any,
        ),
      ).rejects.toThrow('La instalacion debe quedar dentro del horario operativo configurado.');
      expect(mockConflictService.hasConflict).not.toHaveBeenCalled();
    });
  });

  describe('moveToPending', () => {
    it('should return the linked visit request to ready scheduling, preserve the work order, and remove the event from agenda', async () => {
      const existingEvent = {
        id: 'evt-200',
        tenantId: 'tenant-001',
        workOrderId: 'wo-200',
        status: ScheduleEventStatus.SCHEDULED,
      };
      const linkedVisitRequest = {
        id: 'vr-200',
        tenantId: 'tenant-001',
        status: VisitRequestStatus.SCHEDULED,
        scheduleEventId: 'evt-200',
        workOrderId: 'wo-200',
        scheduledByUserId: 'admin-previous',
        scheduledAt: new Date('2026-06-01T08:00:00Z'),
      };

      const updateMock = jest.fn().mockResolvedValue({ affected: 1 });
      const softDeleteMock = jest.fn().mockResolvedValue({ affected: 1 });

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest
              .fn()
              .mockResolvedValueOnce(existingEvent)
              .mockResolvedValueOnce(linkedVisitRequest),
            update: updateMock,
            softDelete: softDeleteMock,
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.moveToPending('evt-200', {}, adminActor as any);

      expect(updateMock).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        { tenantId: 'tenant-001', scheduledEventId: 'evt-200' },
        { scheduledEventId: null },
      );
      expect(updateMock).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        { id: 'vr-200', tenantId: 'tenant-001' },
        expect.objectContaining({
          status: VisitRequestStatus.READY_TO_SCHEDULE,
          scheduleEventId: null,
          workOrderId: 'wo-200',
          scheduledByUserId: null,
          scheduledAt: null,
        }),
      );
      expect(softDeleteMock).toHaveBeenCalledWith(expect.any(Function), {
        id: 'evt-200',
        tenantId: 'tenant-001',
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'vr-200',
          status: VisitRequestStatus.READY_TO_SCHEDULE,
          scheduleEventId: null,
          workOrderId: 'wo-200',
          scheduledByUserId: null,
          scheduledAt: null,
        }),
      );
    });

    it('should reject events that are already in execution', async () => {
      const existingEvent = {
        id: 'evt-201',
        tenantId: 'tenant-001',
        status: ScheduleEventStatus.IN_PROGRESS,
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue(existingEvent),
          },
        };
        return fn(mockQr as any);
      });

      await expect(service.moveToPending('evt-201', {}, adminActor as any)).rejects.toThrow(
        'El evento esta en estado IN_PROGRESS y no puede devolverse a pendiente',
      );
    });
  });
});
