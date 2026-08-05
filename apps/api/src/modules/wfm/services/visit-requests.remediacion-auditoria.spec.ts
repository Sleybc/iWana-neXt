/**
 * QA-red — Remediación auditoría MOD09 (B1, B4).
 * Tests escritos contra el contrato congelado del prompt de remediación.
 * Se espera RED hasta que AI-SR-FULL implemente B1/B4.
 */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { VisitRequestsService } from './visit-requests.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { OperatingWindowResolverService } from './operating-window-resolver.service';
import { WorkOrdersService } from './work-orders.service';
import { ExpedienteService } from '../../crm/expedientes/expediente.service';
import { EXECUTION_ORDER_SCHEDULING_PORT } from '../../tasks/ports/execution-order-scheduling.port';
import {
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import type { AttemptDecisionType, ScheduleVisitRequestInput } from '../dto';

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

const TENANT_CONTEXT = {
  tenantId: 'tenant-001',
  schemaName: 'tenant_test',
};

function buildManager(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((_entity, data) => data),
    save: jest.fn().mockImplementation(async (_entity, entity) => ({
      id: 'vr-generated',
      status: VisitRequestStatus.NEEDS_CONTEXT,
      ...entity,
    })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

function buildEntityQueryBuilder(items: unknown[], total: number) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([items, total]),
  };
}

function buildRequiresRescheduleVisit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vr-retry-001',
    tenantId: TENANT_CONTEXT.tenantId,
    status: VisitRequestStatus.REQUIRES_RESCHEDULE,
    retryCount: 2,
    originContext: WorkOrderSourceContext.CRM,
    originRef: 'exp-retry-001',
    originLabel: 'Oportunidad reintento',
    workType: WfmWorkType.TECHNICAL_VISIT,
    priority: WorkOrderPriority.NORMAL,
    title: 'Visita con reintento pendiente',
    description: null,
    organizationSiteId: null,
    address: 'Cra 10 # 20-30',
    municipality: 'Bogotá',
    sector: 'Centro',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    ticketId: null,
    contractId: null,
    scheduleEventId: null,
    ...overrides,
  };
}

describe('VisitRequestsService — remediación auditoría MOD09 (B1/B4)', () => {
  let service: VisitRequestsService;
  let usersService: { findAll: jest.Mock };
  let operatingWindowResolver: { resolveWithManager: jest.Mock };
  let conflictService: { hasConflictWithManager: jest.Mock };

  const adminActor = {
    sub: 'admin-001',
    role: UserRole.ADMIN,
  } as never;

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-01T08:00:00Z'));

    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(TENANT_CONTEXT);

    usersService = {
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'tecnico@test.com',
            firstName: 'Tania',
            lastName: 'Técnica',
            role: UserRole.TECHNICIAN,
            status: 'ACTIVE',
            tenantId: TENANT_CONTEXT.tenantId,
            mfaEnabled: false,
            mfaRequired: false,
            isOperationalResource: true,
            emailVerified: true,
            passwordResetRequired: false,
            lastLoginAt: null,
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
            updatedAt: new Date('2026-06-01T00:00:00.000Z'),
            deletedAt: null,
            jobTitle: 'Técnica de campo',
            phone: null,
            documentType: null,
            avatarUrl: null,
            documentNumber: null,
          },
        ],
        meta: { nextCursor: null, total: 1 },
      }),
    };

    operatingWindowResolver = {
      resolveWithManager: jest.fn().mockResolvedValue({
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      }),
    };

    conflictService = {
      hasConflictWithManager: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitRequestsService,
        { provide: DataSource, useValue: {} },
        {
          provide: WfmTenantSettingsReadPort,
          useValue: { getTimezone: jest.fn().mockResolvedValue('America/Bogota') },
        },
        { provide: OperatingWindowResolverService, useValue: operatingWindowResolver },
        { provide: ScheduleConflictService, useValue: conflictService },
        { provide: WorkOrdersService, useValue: { createWithinManager: jest.fn() } },
        {
          provide: ExpedienteService,
          useValue: {
            findDisplayNameById: jest.fn().mockResolvedValue(null),
            findDisplayNameByShortCode: jest.fn().mockResolvedValue(null),
            findDisplayNamesByIds: jest.fn().mockResolvedValue(new Map()),
          },
        },
        { provide: UsersService, useValue: usersService },
        {
          provide: EXECUTION_ORDER_SCHEDULING_PORT,
          useValue: { createFromSchedulingWithManager: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<VisitRequestsService>(VisitRequestsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('B1 — preservar REQUIRES_RESCHEDULE en emisión', () => {
    it('GET por id emite REQUIRES_RESCHEDULE y retryCount visible (no degrada a READY_TO_SCHEDULE)', async () => {
      const visitRequest = buildRequiresRescheduleVisit({ retryCount: 2 });
      const manager = buildManager({
        findOne: jest.fn().mockResolvedValue(visitRequest),
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
        callback({ manager }),
      );

      const result = await service.getVisitRequestById('vr-retry-001', adminActor);

      expect(result.status).toBe(VisitRequestStatus.REQUIRES_RESCHEDULE);
      expect(result.status).not.toBe(VisitRequestStatus.READY_TO_SCHEDULE);
      expect(result.retryCount).toBe(2);
    });

    it('listado emite REQUIRES_RESCHEDULE con retryCount (no degrada en enrich)', async () => {
      const visitRequest = buildRequiresRescheduleVisit({ retryCount: 1 });
      const qb = buildEntityQueryBuilder([visitRequest], 1);
      const manager = buildManager({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
        callback({ manager }),
      );

      const result = await service.listVisitRequests({ page: 1, limit: 20 }, adminActor);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.status).toBe(VisitRequestStatus.REQUIRES_RESCHEDULE);
      expect(result.items[0]?.status).not.toBe(VisitRequestStatus.READY_TO_SCHEDULE);
      expect(result.items[0]?.retryCount).toBe(1);
    });

    it('filtro READY_TO_SCHEDULE no mezcla reintentos REQUIRES_RESCHEDULE', async () => {
      const qb = buildEntityQueryBuilder([], 0);
      const manager = buildManager({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
        callback({ manager }),
      );

      await service.listVisitRequests(
        { page: 1, limit: 20, status: VisitRequestStatus.READY_TO_SCHEDULE },
        adminActor,
      );

      const statusFilterClause = qb.andWhere.mock.calls
        .map((call) => String(call[0] ?? ''))
        .find((clause) => clause.includes(':status') || clause.includes('READY_TO_SCHEDULE'));

      expect(statusFilterClause).toBeDefined();
      // Contrato B1: prohibido degradar REQUIRES_RESCHEDULE → READY en el SQL de filtro
      expect(statusFilterClause).not.toMatch(
        new RegExp(
          `${VisitRequestStatus.REQUIRES_RESCHEDULE}[\\s\\S]*${VisitRequestStatus.READY_TO_SCHEDULE}`,
        ),
      );
      expect(statusFilterClause).not.toMatch(
        /WHEN\s+vr\.status\s*=\s*'REQUIRES_RESCHEDULE'\s*THEN\s*'READY_TO_SCHEDULE'/i,
      );
    });

    it('acepta agendar VR en REQUIRES_RESCHEDULE (agendabilidad sin degradar emisión)', async () => {
      const visitRequest = buildRequiresRescheduleVisit({ retryCount: 1 });
      const manager = buildManager({
        findOne: jest.fn().mockResolvedValue(visitRequest),
        save: jest.fn().mockImplementation(async (_entity, data) => ({
          id: 'evt-reschedule',
          status: 'SCHEDULED',
          ...data,
        })),
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
        callback({ manager }),
      );

      const result = await service.scheduleVisitRequest(
        'vr-retry-001',
        {
          assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
          scheduledStartAt: '2026-06-01T14:00:00Z',
          scheduledEndAt: '2026-06-01T15:00:00Z',
          createWorkOrder: false,
        },
        adminActor,
      );

      expect(result.status).toBe(VisitRequestStatus.SCHEDULED);
    });
  });

  describe('B4 — límite 3 intentos exige attemptDecision', () => {
    const schedulePayloadBase: ScheduleVisitRequestInput = {
      assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
      scheduledStartAt: '2026-06-01T14:00:00Z',
      scheduledEndAt: '2026-06-01T15:00:00Z',
      createWorkOrder: false,
    };

    function setupExhaustedRetriesManager() {
      const visitRequest = buildRequiresRescheduleVisit({
        id: 'vr-limit-3',
        retryCount: 3,
      });
      const manager = buildManager({
        findOne: jest.fn().mockResolvedValue(visitRequest),
        save: jest.fn().mockImplementation(async (_entity, data) => ({
          id: 'evt-limit',
          status: 'SCHEDULED',
          ...data,
        })),
      });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
        callback({ manager }),
      );
      return manager;
    }

    it('sin attemptDecision → 400 accionable que pide decisión (no muro ciego)', async () => {
      setupExhaustedRetriesManager();

      let caught: unknown;
      try {
        await service.scheduleVisitRequest('vr-limit-3', schedulePayloadBase, adminActor);
      } catch (error: unknown) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      const message = String((caught as BadRequestException).message);
      expect(message.toLowerCase()).toMatch(/decisi[oó]n|attemptdecision/);
      expect(message).toMatch(/FORCE_RESCHEDULE/);
      expect(message).toMatch(/CLOSE_CASE/);
      expect(message.toLowerCase()).not.toMatch(/no est[aá] lista para agendar/);
    });

    it('con attemptDecision FORCE_RESCHEDULE permite agendar pese a retryCount >= 3', async () => {
      const manager = setupExhaustedRetriesManager();

      const payload: ScheduleVisitRequestInput = {
        ...schedulePayloadBase,
        attemptDecision: 'FORCE_RESCHEDULE' satisfies AttemptDecisionType,
      };

      const result = await service.scheduleVisitRequest('vr-limit-3', payload, adminActor);

      expect(result.status).toBe(VisitRequestStatus.SCHEDULED);
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'vr-limit-3', tenantId: TENANT_CONTEXT.tenantId },
        expect.objectContaining({ status: VisitRequestStatus.SCHEDULED }),
      );
    });

    it('con attemptDecision CLOSE_CASE cierra el caso sin agendar en silencio', async () => {
      const manager = setupExhaustedRetriesManager();

      const payload: ScheduleVisitRequestInput = {
        ...schedulePayloadBase,
        attemptDecision: 'CLOSE_CASE' satisfies AttemptDecisionType,
      };

      const result = await service.scheduleVisitRequest('vr-limit-3', payload, adminActor);

      expect(result.status).toBe(VisitRequestStatus.CANCELLED);
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'vr-limit-3', tenantId: TENANT_CONTEXT.tenantId },
        expect.objectContaining({ status: VisitRequestStatus.CANCELLED }),
      );
    });
  });
});
