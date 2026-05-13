import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ScheduleEventStatus, UserRole } from '@iwana/shared';
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
  WorkOrder: class {},
  WorkOrderTask: class {},
  TechnicianAvailability: class {},
}));

describe('ScheduleEventsService', () => {
  let service: ScheduleEventsService;
  let mockDataSource: Partial<DataSource>;
  let mockConflictService: jest.Mocked<ScheduleConflictService>;
  let mockWorkOrdersService: jest.Mocked<WorkOrdersService>;
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
    scheduledStartAt: '2026-06-01T09:00:00Z',
    scheduledEndAt: '2026-06-01T11:00:00Z',
    assignedUserId: '22222222-2222-2222-2222-222222222222',
  };

  beforeEach(() => {
    mockDataSource = {};
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

    mockConflictService = {
      hasConflict: jest.fn().mockResolvedValue(false),
      hasConflictWithManager: jest.fn().mockResolvedValue(false),
    } as any;

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
      mockConflictService,
      mockWorkOrdersService,
    );
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
            scheduledStartAt: '2026-06-02T09:00:00Z',
            scheduledEndAt: '2026-06-02T11:00:00Z',
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
          scheduledStartAt: '2026-06-02T09:00:00Z',
          scheduledEndAt: '2026-06-02T11:00:00Z',
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
        scheduledStartAt: '2026-06-02T09:00:00Z',
        scheduledEndAt: '2026-06-02T11:00:00Z',
        excludeEventId: 'evt-001',
      });
    });
  });
});
