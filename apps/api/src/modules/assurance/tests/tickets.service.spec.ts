import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssuranceFieldServicePort } from '../ports/assurance-field-service.port';
import { PqrService } from '../services/pqr.service';
import { SlaService } from '../services/sla.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  SupportTicket: class SupportTicket {},
  TicketSlaPolicy: class TicketSlaPolicy {},
  TicketWorkOrderLink: class TicketWorkOrderLink {},
}));

describe('TicketsService', () => {
  let service: TicketsService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;
  let slaService: jest.Mocked<SlaService>;
  let pqrService: jest.Mocked<PqrService>;
  let timelineService: jest.Mocked<TimelineService>;
  let fieldServicePort: jest.Mocked<AssuranceFieldServicePort>;

  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

    slaService = {
      findApplicablePolicy: jest.fn().mockResolvedValue(null),
      calculateDeadlines: jest
        .fn()
        .mockReturnValue({ slaFirstResponseAt: null, slaResolveByAt: null }),
      calculatePqrDeadline: jest.fn().mockImplementation((createdAt: Date) => {
        // Implementación real para tests: calcular 15 días hábiles
        let businessDaysRemaining = 15;
        let current = new Date(createdAt);
        while (businessDaysRemaining > 0) {
          current.setDate(current.getDate() + 1);
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            businessDaysRemaining -= 1;
          }
        }
        return current;
      }),
      deriveBreachStatus: jest.fn().mockReturnValue(SlaBreachStatus.OK),
      listPolicies: jest.fn(),
      createPolicy: jest.fn(),
    } as unknown as jest.Mocked<SlaService>;

    pqrService = {
      createInitialPqrRecord: jest.fn(),
      listPqrRecords: jest.fn(),
      isPqrRecordComplete: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<PqrService>;

    timelineService = {
      recordWithManager: jest.fn().mockResolvedValue(undefined),
      listTimeline: jest.fn(),
    } as unknown as jest.Mocked<TimelineService>;

    fieldServicePort = {
      requestFieldService: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<AssuranceFieldServicePort>;

    service = new TicketsService(
      {} as DataSource,
      slaService,
      pqrService,
      timelineService,
      fieldServicePort,
    );
  });

  it('creates a typed ticket with requester and subject references', async () => {
    const createMock = jest.fn((_entity, payload) => payload);
    const saveMock = jest.fn().mockImplementation(async (_entity, payload) => ({
      id: 'ticket-001',
      ...payload,
    }));

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          createQueryBuilder: () => ({
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
          }),
          create: createMock,
          save: saveMock,
          update: jest.fn(),
        },
      };
      return fn(mockQr as any);
    });

    const result = await service.create(
      {
        type: TicketType.CUSTOMER_INCIDENT,
        priority: TicketPriority.HIGH,
        source: TicketSource.PORTAL,
        subject: 'Intermitencia en enlace principal',
        requesterType: TicketRequesterType.SUBSCRIBER,
        requesterRefId: 'subscriber-001',
        subjectType: TicketSubjectType.SERVICE,
        subjectRefId: 'service-001',
        queueName: TicketQueue.SUPPORT,
        fieldDecision: TicketFieldDecision.NEEDS_DIAGNOSIS,
      },
      actor,
    );

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requesterRefId: 'subscriber-001',
        subjectType: TicketSubjectType.SERVICE,
        subjectRefId: 'service-001',
        source: 'PORTAL',
        fieldDecision: TicketFieldDecision.NEEDS_DIAGNOSIS,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'ticket-001',
        requesterRefId: 'subscriber-001',
        subjectRefId: 'service-001',
      }),
    );
  });

  it('creates an internal ticket without a client reference', async () => {
    const createMock = jest.fn((_entity, payload) => payload);
    const saveMock = jest.fn().mockImplementation(async (_entity, payload) => ({
      id: 'ticket-internal-001',
      ...payload,
    }));

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          createQueryBuilder: () => ({
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
          }),
          create: createMock,
          save: saveMock,
          update: jest.fn(),
        },
      };
      return fn(mockQr as any);
    });

    const result = await service.create(
      {
        type: TicketType.INTERNAL_SUPPORT,
        subject: 'Solicitud interna de soporte operativo',
        requesterType: TicketRequesterType.INTERNAL_USER,
        queueName: TicketQueue.OPERATIONS,
      },
      actor,
    );

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: TicketType.INTERNAL_SUPPORT,
        requesterType: TicketRequesterType.INTERNAL_USER,
        requesterRefId: null,
        subjectRefId: null,
        queueName: TicketQueue.OPERATIONS,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'ticket-internal-001',
        requesterRefId: null,
        subjectRefId: null,
      }),
    );
  });

  it('calculates first response and resolution deadlines for non-PQR tickets with an SLA policy', async () => {
    const createdAt = new Date('2026-05-09T14:00:00Z');
    const firstResponseAt = new Date('2026-05-09T15:00:00Z');
    const resolveByAt = new Date('2026-05-09T18:00:00Z');
    const policy = {
      id: '550e8400-e29b-41d4-a716-446655440111',
      tenantId: 'tenant-001',
      firstResponseMinutes: 60,
      resolutionMinutes: 240,
    };
    const createMock = jest.fn((_entity, payload) => payload);
    const saveMock = jest.fn().mockImplementation(async (_entity, payload) => ({
      id: 'ticket-sla-001',
      ...payload,
      createdAt,
    }));

    slaService.findApplicablePolicy.mockResolvedValue(policy as any);
    slaService.calculateDeadlines.mockReturnValue({
      slaFirstResponseAt: firstResponseAt,
      slaResolveByAt: resolveByAt,
    });

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          createQueryBuilder: () => ({
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
          }),
          create: createMock,
          save: saveMock,
          update: jest.fn(),
        },
      };
      return fn(mockQr as any);
    });

    await service.create(
      {
        type: TicketType.CUSTOMER_INCIDENT,
        priority: TicketPriority.NORMAL,
        subject: 'Intermitencia con SLA estándar',
        requesterType: TicketRequesterType.SUBSCRIBER,
      },
      actor,
    );

    expect(slaService.findApplicablePolicy).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-001',
      TicketType.CUSTOMER_INCIDENT,
      TicketPriority.NORMAL,
    );
    expect(slaService.calculateDeadlines).toHaveBeenCalledWith(policy, expect.any(Date));
    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        slaPolicyId: policy.id,
        slaFirstResponseAt: firstResponseAt,
        slaResolveByAt: resolveByAt,
      }),
    );
  });

  it('applies queue and requester filters when listing tickets', async () => {
    const andWhereMock = jest.fn().mockReturnThis();

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
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

    await service.list(
      {
        queueName: TicketQueue.NOC,
        requesterRefId: 'subscriber-002',
        page: 1,
        limit: 20,
      },
      actor,
    );

    expect(andWhereMock).toHaveBeenCalledWith('st.queue_name = :queueName', {
      queueName: TicketQueue.NOC,
    });
    expect(andWhereMock).toHaveBeenCalledWith('st.requester_ref_id = :requesterRefId', {
      requesterRefId: 'subscriber-002',
    });
  });

  it('marks field decision and emits event when requesting field service', async () => {
    const updateMock = jest.fn().mockResolvedValue({ affected: 1 });
    const saveMock = jest.fn().mockImplementation(async (_entity, payload) => payload);

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-002',
            tenantId: 'tenant-001',
            assignedUserId: actor.sub,
            status: TicketStatus.IN_PROGRESS,
            subject: 'Visita técnica requerida',
            priority: TicketPriority.NORMAL,
            createdAt: new Date('2026-05-09T12:00:00Z'),
            firstRespondedAt: null,
            resolvedAt: null,
            slaFirstResponseAt: null,
            slaResolveByAt: null,
          }),
          create: jest.fn().mockImplementation((_entity, payload) => payload),
          save: saveMock,
          update: updateMock,
          findOneByOrFail: jest.fn().mockResolvedValue({
            id: 'ticket-002',
            fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
          }),
        },
      };
      return fn(mockQr as any);
    });

    await service.requestFieldService('ticket-002', { notes: 'Revisar nodo de acceso' }, actor);

    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'ticket-002', tenantId: 'tenant-001' },
      expect.objectContaining({
        status: TicketStatus.FIELD_SERVICE_REQUESTED,
        fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
      }),
    );
    expect(fieldServicePort.requestFieldService).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-002',
        tenantId: 'tenant-001',
      }),
    );
    expect(timelineService.recordWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: TicketTimelineEventType.FIELD_SERVICE_REQUESTED,
      }),
    );
  });

  it('links a logical work order without reading WFM tables', async () => {
    const updateMock = jest.fn().mockResolvedValue({ affected: 1 });

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-003',
            tenantId: 'tenant-001',
            assignedUserId: actor.sub,
          }),
          create: jest.fn().mockImplementation((_entity, payload) => payload),
          save: jest.fn().mockResolvedValue(undefined),
          update: updateMock,
          findOneByOrFail: jest.fn().mockResolvedValue({
            id: 'ticket-003',
            workOrderId: '550e8400-e29b-41d4-a716-446655440999',
          }),
        },
      };
      return fn(mockQr as any);
    });

    const result = await service.linkWorkOrder(
      'ticket-003',
      {
        workOrderId: '550e8400-e29b-41d4-a716-446655440999',
        notes: 'OT creada desde WFM',
      },
      actor,
    );

    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'ticket-003', tenantId: 'tenant-001' },
      expect.objectContaining({
        workOrderId: '550e8400-e29b-41d4-a716-446655440999',
      }),
    );
    expect(timelineService.recordWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: TicketTimelineEventType.WORK_ORDER_LINKED,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        workOrderId: '550e8400-e29b-41d4-a716-446655440999',
      }),
    );
  });

  it('rejects field service requests from invalid states', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-004',
            tenantId: 'tenant-001',
            assignedUserId: actor.sub,
            status: TicketStatus.OPEN,
          }),
        },
      };
      return fn(mockQr as any);
    });

    await expect(
      service.requestFieldService('ticket-004', { notes: 'No aplica' }, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a general invalid status transition', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-invalid-transition',
            tenantId: 'tenant-001',
            type: TicketType.CUSTOMER_INCIDENT,
            status: TicketStatus.OPEN,
            assignedUserId: actor.sub,
          }),
        },
      };
      return fn(mockQr as any);
    });

    await expect(
      service.transitionStatus(
        'ticket-invalid-transition',
        { status: TicketStatus.CLOSED, notes: 'No puede cerrarse desde abierto' },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects access to tickets not assigned to a contractor', async () => {
    const contractorActor: JwtPayload = {
      ...actor,
      sub: 'contractor-001',
      email: 'contractor@example.test',
      role: UserRole.CONTRACTOR,
      jti: 'jti-contractor',
    };

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-owned-by-other',
            tenantId: 'tenant-001',
            assignedUserId: 'contractor-999',
          }),
        },
      };
      return fn(mockQr as any);
    });

    await expect(service.getById('ticket-owned-by-other', contractorActor)).rejects.toThrow(
      ForbiddenException,
    );
  });

  describe('RESOLVED state validation', () => {
    it('rejects transition to RESOLVED without notes', async () => {
      await expect(
        service.transitionStatus(
          'ticket-005',
          { status: TicketStatus.RESOLVED, notes: null },
          actor,
        ),
      ).rejects.toThrow();
    });

    it('rejects transition to RESOLVED with empty notes', async () => {
      await expect(
        service.transitionStatus(
          'ticket-005',
          { status: TicketStatus.RESOLVED, notes: '   ' },
          actor,
        ),
      ).rejects.toThrow();
    });

    it('accepts transition to RESOLVED with valid notes', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue({
              id: 'ticket-005',
              tenantId: 'tenant-001',
              type: TicketType.CUSTOMER_INCIDENT,
              status: TicketStatus.IN_PROGRESS,
              assignedUserId: actor.sub,
              createdAt: new Date('2026-05-10T10:00:00Z'),
              firstRespondedAt: new Date('2026-05-10T10:30:00Z'),
              resolvedAt: null,
              slaFirstResponseAt: null,
              slaResolveByAt: null,
            }),
            update: jest.fn(),
            findOneByOrFail: jest.fn().mockResolvedValue({
              id: 'ticket-005',
              status: TicketStatus.RESOLVED,
            }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.transitionStatus(
        'ticket-005',
        { status: TicketStatus.RESOLVED, notes: 'Problema resuelto tras reinicio' },
        actor,
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'ticket-005',
          status: TicketStatus.RESOLVED,
        }),
      );
      expect(timelineService.recordWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: TicketTimelineEventType.STATUS_CHANGED,
          payload: expect.objectContaining({
            from: TicketStatus.IN_PROGRESS,
            to: TicketStatus.RESOLVED,
          }),
        }),
      );
    });
  });

  describe('PQR regulatory completion checks', () => {
    it('rejects PQR transition to RESOLVED when record is incomplete', async () => {
      pqrService.isPqrRecordComplete = jest.fn().mockResolvedValue(false);

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue({
              id: 'ticket-pqr-001',
              tenantId: 'tenant-001',
              type: TicketType.PQR,
              status: TicketStatus.IN_PROGRESS,
              assignedUserId: actor.sub,
              createdAt: new Date('2026-05-10T10:00:00Z'),
              firstRespondedAt: new Date('2026-05-10T11:00:00Z'),
              resolvedAt: null,
              slaFirstResponseAt: null,
              slaResolveByAt: null,
            }),
          },
        };
        return fn(mockQr as any);
      });

      await expect(
        service.transitionStatus(
          'ticket-pqr-001',
          { status: TicketStatus.RESOLVED, notes: 'Respuesta enviada al usuario' },
          actor,
        ),
      ).rejects.toThrow('No se puede cerrar un ticket PQR sin completar el registro regulatorio');
    });

    it('rejects PQR transition to CLOSED when record is incomplete', async () => {
      pqrService.isPqrRecordComplete = jest.fn().mockResolvedValue(false);

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue({
              id: 'ticket-pqr-002',
              tenantId: 'tenant-001',
              type: TicketType.PQR,
              status: TicketStatus.RESOLVED,
              assignedUserId: actor.sub,
              createdAt: new Date('2026-05-10T10:00:00Z'),
              firstRespondedAt: new Date('2026-05-10T11:00:00Z'),
              resolvedAt: new Date('2026-05-12T14:00:00Z'),
              slaFirstResponseAt: null,
              slaResolveByAt: null,
            }),
          },
        };
        return fn(mockQr as any);
      });

      await expect(
        service.transitionStatus(
          'ticket-pqr-002',
          { status: TicketStatus.CLOSED, notes: 'Cierre final' },
          actor,
        ),
      ).rejects.toThrow('No se puede cerrar un ticket PQR sin completar el registro regulatorio');
    });

    it('allows PQR transition to RESOLVED when record is complete', async () => {
      pqrService.isPqrRecordComplete = jest.fn().mockResolvedValue(true);

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue({
              id: 'ticket-pqr-003',
              tenantId: 'tenant-001',
              type: TicketType.PQR,
              status: TicketStatus.IN_PROGRESS,
              assignedUserId: actor.sub,
              createdAt: new Date('2026-05-10T10:00:00Z'),
              firstRespondedAt: new Date('2026-05-10T11:00:00Z'),
              resolvedAt: null,
              slaFirstResponseAt: null,
              slaResolveByAt: null,
            }),
            update: jest.fn(),
            findOneByOrFail: jest.fn().mockResolvedValue({
              id: 'ticket-pqr-003',
              status: TicketStatus.RESOLVED,
            }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.transitionStatus(
        'ticket-pqr-003',
        { status: TicketStatus.RESOLVED, notes: 'PQR atendida satisfactoriamente' },
        actor,
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'ticket-pqr-003',
          status: TicketStatus.RESOLVED,
        }),
      );
      expect(pqrService.isPqrRecordComplete).toHaveBeenCalledWith(
        expect.anything(),
        'ticket-pqr-003',
        'tenant-001',
      );
    });
  });

  describe('PQR business day deadline calculation', () => {
    it('calculates 15 business days correctly for PQR tickets', async () => {
      // Viernes 9 de mayo de 2026 a las 10:00
      const createdAt = new Date('2026-05-09T10:00:00Z');
      const expectedDeadline = slaService.calculatePqrDeadline(createdAt);

      // 15 días hábiles desde viernes 9 mayo:
      // Semana 1: lun 11, mar 12, mié 13, jue 14, vie 15 (5)
      // Semana 2: lun 18, mar 19, mié 20, jue 21, vie 22 (5)
      // Semana 3: lun 25, mar 26, mié 27, jue 28, vie 29 (5)
      // Total: 15 días hábiles -> viernes 29 de mayo 2026
      const expected = new Date('2026-05-29T10:00:00Z');

      expect(expectedDeadline.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    });

    it('skips weekends when calculating PQR deadline', async () => {
      // Lunes 11 de mayo de 2026 a las 08:00
      const createdAt = new Date('2026-05-11T08:00:00Z');
      const deadline = slaService.calculatePqrDeadline(createdAt);

      // 15 días hábiles desde lunes 11 mayo:
      // Semana 1: mar 12, mié 13, jue 14, vie 15 (4)
      // Semana 2: lun 18, mar 19, mié 20, jue 21, vie 22 (5)
      // Semana 3: lun 25, mar 26, mié 27, jue 28, vie 29 (5)
      // Semana 4: lun 1 jun (1)
      // Total: 15 días hábiles -> lunes 1 de junio 2026
      const expected = new Date('2026-06-01T08:00:00Z');

      expect(deadline.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    });

    it('PQR tickets are created with business-day deadline', async () => {
      const createdAt = new Date('2026-05-12T14:30:00Z'); // Martes
      slaService.calculatePqrDeadline = jest.fn().mockReturnValue(new Date('2026-06-02T14:30:00Z'));

      const createMock = jest.fn((_entity, payload) => payload);
      const saveMock = jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'ticket-pqr-100',
        ...payload,
      }));

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
            }),
            create: createMock,
            save: saveMock,
            update: jest.fn(),
          },
        };
        return fn(mockQr as any);
      });

      await service.create(
        {
          type: TicketType.PQR,
          subject: 'Queja regulatoria CRC',
          requesterType: TicketRequesterType.SUBSCRIBER,
        },
        actor,
      );

      expect(slaService.calculatePqrDeadline).toHaveBeenCalledWith(expect.any(Date));
      expect(pqrService.createInitialPqrRecord).toHaveBeenCalledWith(
        expect.anything(),
        'ticket-pqr-100',
        'tenant-001',
        expect.any(Date),
      );
    });
  });

  describe('findOrCreateInstallationTicket', () => {
    const dto = {
      expedienteId: 'exp-uuid-0001-0000-000000000001',
      expedienteFullName: 'Juan Pérez López',
    };
    const actorUserId = 'support-001';

    it('debe reutilizar ticket abierto existente', async () => {
      const existingTicket = {
        id: 'ticket-existing-001',
        type: TicketType.OPERATIONAL_TASK,
        subjectType: TicketSubjectType.EXPEDIENTE,
        subjectRefId: dto.expedienteId,
        status: TicketStatus.OPEN,
      };

      const findOneMock = jest.fn().mockResolvedValue(existingTicket);
      const createMock = jest.fn();
      const saveMock = jest.fn();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
        const mockQr = {
          manager: {
            findOne: findOneMock,
            create: createMock,
            save: saveMock,
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.findOrCreateInstallationTicket(dto, actorUserId);

      expect(result).toEqual({ ticket: existingTicket, created: false });
      expect(findOneMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: expect.objectContaining({
            subjectRefId: dto.expedienteId,
            type: TicketType.OPERATIONAL_TASK,
            subjectType: TicketSubjectType.EXPEDIENTE,
          }),
        }),
      );
      expect(createMock).not.toHaveBeenCalled();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('debe crear ticket nuevo si no existe ninguno abierto', async () => {
      const generatedTicketNumber = 'TK-20250101-001';
      const savedTicket = {
        id: 'ticket-new-001',
        ticketNumber: generatedTicketNumber,
        type: TicketType.OPERATIONAL_TASK,
        subjectType: TicketSubjectType.EXPEDIENTE,
        subjectRefId: dto.expedienteId,
        status: TicketStatus.OPEN,
        subject: `Instalación — ${dto.expedienteFullName}`,
        queueName: TicketQueue.OPERATIONS,
        requesterType: TicketRequesterType.INTERNAL_USER,
        source: TicketSource.INTERNAL,
        priority: TicketPriority.NORMAL,
        createdByUserId: actorUserId,
      };

      const findOneMock = jest.fn().mockResolvedValue(null);
      const createMock = jest.fn((_entity, payload) => payload);
      const saveMock = jest.fn().mockResolvedValue(savedTicket);

      // Mock de createQueryBuilder para generateTicketNumber
      const getRawOneMock = jest.fn().mockResolvedValue({ count: '0' });
      const qbMock = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: getRawOneMock,
      };
      const createQueryBuilderMock = jest.fn().mockReturnValue(qbMock);

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
        const mockQr = {
          manager: {
            findOne: findOneMock,
            create: createMock,
            save: saveMock,
            createQueryBuilder: createQueryBuilderMock,
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.findOrCreateInstallationTicket(dto, actorUserId);

      expect(result).toEqual({ ticket: savedTicket, created: true });
      expect(createMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TicketType.OPERATIONAL_TASK,
          subjectType: TicketSubjectType.EXPEDIENTE,
          subjectRefId: dto.expedienteId,
          ticketNumber: expect.stringMatching(/^TK-\d{8}-\d{3}$/),
          queueName: TicketQueue.OPERATIONS,
          requesterType: TicketRequesterType.INTERNAL_USER,
          source: TicketSource.INTERNAL,
          status: TicketStatus.OPEN,
          priority: TicketPriority.NORMAL,
          createdByUserId: actorUserId,
        }),
      );
      expect(saveMock).toHaveBeenCalled();
    });
  });
});
