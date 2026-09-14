/**
 * MOD11 Ola 1 (AI-SR-FULL) — C1 responsable resuelto + C2 estado por requisito.
 *
 * - `getCompletion` publica `requirements[]` desde `evaluation.allEvaluations`
 *   con el contexto completado (CA-05), incluido COMPLIANCE satisfecho con
 *   aceptación registrada (CA-06).
 * - `GET :id` resuelve `displayLabel` del técnico (CA-01) y emite la rama
 *   CREW (CA-02); sin etiqueta resoluble, el assignee viaja con su id.
 *
 * Sin PII real: UUIDs sintéticos y etiquetas ficticias.
 */
import { DataSource } from 'typeorm';
import { ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersController } from '../execution-orders.controller';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import { ClosureGateEvaluatorService } from '../services/closure-gate-evaluator.service';
import type { ExecutionOrderProjectionConvergenceService } from '../services/execution-order-projection-convergence.service';

// requireActual conserva entidades y enums que la cadena de imports consume;
// solo se parchea el contexto de tenant y el runner de schema.
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ExecutionOrder: class ExecutionOrder {},
  ExecutionOrderActivity: class ExecutionOrderActivity {},
  ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
  ExecutionOrderEvidence: class ExecutionOrderEvidence {},
}));

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

import { runInTenantSchema } from '@iwana/db';

const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

const buildQueryBuilder = (rows: unknown[]) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(rows),
});

const runGetCompletion = async (options: {
  snapshot: unknown;
  activities?: Array<{ activityType: string }>;
  evidences?: Array<{
    evidenceType: string;
    requirementKey: string | null;
    assetStatus?: string | null;
  }>;
  itemUsages?: Array<{ itemId: string }>;
}) => {
  const service = new ExecutionOrdersService(
    {} as DataSource,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new ClosureGateEvaluatorService(),
  );
  const manager = {
    findOne: jest.fn().mockResolvedValue({
      id: 'eo-001',
      tenantId: 'tenant-001',
      templateRequirementsSnapshot: options.snapshot,
    }),
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(buildQueryBuilder(options.activities ?? []))
      .mockReturnValueOnce(buildQueryBuilder(options.evidences ?? []))
      .mockReturnValueOnce(buildQueryBuilder(options.itemUsages ?? [])),
  };
  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
  const completion = await service.getCompletion('eo-001');
  return { completion, manager };
};

describe('getCompletion publica el estado por requisito (C2, CA-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emite un ítem por requisito con estado real y razón cuando falta', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        {
          key: 'instalacion',
          label: 'Instalación de fibra',
          required: true,
          kind: 'ACTIVITY',
          activityType: 'INSTALLATION',
        },
        {
          key: 'foto-evidencia',
          label: 'Foto de instalación',
          required: true,
          kind: 'EVIDENCE',
          evidenceType: 'PHOTO',
        },
      ],
      activities: [{ activityType: 'INSTALLATION' }],
      evidences: [],
    });

    expect(completion.progress).toBe(50);
    expect(completion.completed).toBe(1);
    expect(completion.total).toBe(2);
    expect(completion.requirements).toEqual([
      {
        requirementId: 'instalacion',
        label: 'Instalación de fibra',
        kind: 'ACTIVITY',
        satisfied: true,
      },
      {
        requirementId: 'foto-evidencia',
        label: 'Foto de instalación',
        kind: 'EVIDENCE',
        satisfied: false,
        reason: 'No se ha vinculado una foto para "Foto de instalación".',
      },
    ]);
  });

  it('marca COMPLIANCE satisfecho con aceptación registrada (CA-06)', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        {
          key: 'aceptacion',
          label: 'Aceptación del cliente',
          required: true,
          kind: 'COMPLIANCE',
          policyKey: 'CUSTOMER_ACCEPTANCE',
        },
      ],
      evidences: [
        {
          evidenceType: 'SIGNATURE',
          requirementKey: 'CUSTOMER_SIGNATURE',
          assetStatus: 'AVAILABLE',
        },
      ],
    });

    expect(completion.progress).toBe(100);
    expect(completion.requirements).toEqual([
      {
        requirementId: 'aceptacion',
        label: 'Aceptación del cliente',
        kind: 'COMPLIANCE',
        satisfied: true,
      },
    ]);
  });

  it('no satisface COMPLIANCE con firma en cuarentena (P1: PENDING_ANALYSIS)', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        {
          key: 'aceptacion',
          label: 'Aceptación del cliente',
          required: true,
          kind: 'COMPLIANCE',
          policyKey: 'CUSTOMER_ACCEPTANCE',
        },
      ],
      evidences: [
        {
          evidenceType: 'SIGNATURE',
          requirementKey: 'CUSTOMER_SIGNATURE',
          assetStatus: 'PENDING_ANALYSIS',
        },
      ],
    });

    expect(completion.progress).toBe(0);
    expect(completion.requirements?.[0]).toEqual(
      expect.objectContaining({ satisfied: false, kind: 'COMPLIANCE' }),
    );
    expect(completion.requirements?.[0]?.reason).toContain('aceptación del cliente');
  });

  it('satisface COMPLIANCE con firma AVAILABLE (P1 inverso: sin invertir el defecto)', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        {
          key: 'aceptacion',
          label: 'Aceptación del cliente',
          required: true,
          kind: 'COMPLIANCE',
          policyKey: 'CUSTOMER_ACCEPTANCE',
        },
      ],
      evidences: [
        {
          evidenceType: 'SIGNATURE',
          requirementKey: 'CUSTOMER_SIGNATURE',
          assetStatus: 'AVAILABLE',
        },
      ],
    });

    expect(completion.progress).toBe(100);
    expect(completion.requirements?.[0]).toEqual(
      expect.objectContaining({ satisfied: true, kind: 'COMPLIANCE' }),
    );
  });

  it('no confunde otra evidencia con aceptación del cliente', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        {
          key: 'aceptacion',
          label: 'Aceptación del cliente',
          required: true,
          kind: 'COMPLIANCE',
          policyKey: 'CUSTOMER_ACCEPTANCE',
        },
      ],
      evidences: [
        { evidenceType: 'PHOTO', requirementKey: 'CUSTOMER_SIGNATURE' },
        { evidenceType: 'SIGNATURE', requirementKey: 'OTRA_CLAVE' },
      ],
    });

    expect(completion.progress).toBe(0);
    expect(completion.requirements?.[0]).toEqual(
      expect.objectContaining({ satisfied: false, kind: 'COMPLIANCE' }),
    );
    expect(completion.requirements?.[0]?.reason).toContain('aceptación del cliente');
  });

  it('muestra FIELD y MEASUREMENT pendientes con razón (deuda §10.1: sin vía de captura)', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        { key: 'obs', label: 'Observaciones', required: true, kind: 'FIELD', fieldType: 'TEXT' },
        {
          key: 'potencia',
          label: 'Potencia óptica',
          required: true,
          kind: 'MEASUREMENT',
          measurement: 'NUMBER',
          unit: 'dBm',
        },
      ],
    });

    expect(completion.progress).toBe(0);
    expect(completion.requirements).toEqual([
      expect.objectContaining({ requirementId: 'obs', satisfied: false }),
      expect.objectContaining({ requirementId: 'potencia', satisfied: false }),
    ]);
  });
});

describe('GET :id resuelve el responsable (C1, CA-01/CA-02)', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  const buildOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'eo-001',
    executionOrderNumber: 'OTE-20260914-001',
    version: 1,
    status: ExecutionOrderStatus.IN_PROGRESS,
    result: null,
    workType: WfmWorkType.INSTALLATION,
    templateId: null,
    templateKey: null,
    templateVersionNumber: null,
    templateLabel: null,
    templateRequirementsSnapshot: null,
    scheduleEventId: '33333333-3333-4333-8333-333333333333',
    plannedWindowStartAt: new Date('2026-09-14T14:00:00.000Z'),
    plannedWindowEndAt: new Date('2026-09-14T16:00:00.000Z'),
    assignedTechnicianId: null,
    assignedCrewId: null,
    municipality: 'Bogotá',
    customerDisplayLabel: 'Sitio operativo',
    startedAt: null,
    closedAt: null,
    createdAt: new Date('2026-09-14T10:00:00.000Z'),
    updatedAt: new Date('2026-09-14T10:00:00.000Z'),
    ...overrides,
  });

  const buildController = (options: {
    order: Record<string, unknown>;
    labels?: Map<string, string>;
  }) => {
    const service = {
      getById: jest.fn().mockResolvedValue(options.order),
      getCompletion: jest
        .fn()
        .mockResolvedValue({ progress: 0, completed: 0, total: 0, requirements: [] }),
      getSyncState: jest.fn().mockResolvedValue('IN_SYNC'),
      computeAllowedActions: jest.fn().mockReturnValue(null),
    } as unknown as ExecutionOrdersService;
    const usersService = options.labels
      ? { findDisplayLabelsByIds: jest.fn().mockResolvedValue(options.labels) }
      : undefined;
    const controller = new ExecutionOrdersController(
      service,
      {} as ExecutionOrderProjectionConvergenceService,
      undefined,
      usersService as never,
    );
    return { controller, service, usersService };
  };

  it('devuelve displayLabel del técnico con una sola resolución (CA-01)', async () => {
    const technicianId = '11111111-1111-4111-8111-111111111111';
    const { controller, usersService } = buildController({
      order: buildOrder({ assignedTechnicianId: technicianId }),
      labels: new Map([[technicianId, 'Técnico Operativo']]),
    });

    const result = await controller.getById('eo-001', actor);

    expect(result.assignee).toEqual({
      type: 'TECHNICIAN',
      id: technicianId,
      displayLabel: 'Técnico Operativo',
    });
    expect(usersService?.findDisplayLabelsByIds).toHaveBeenCalledTimes(1);
    expect(usersService?.findDisplayLabelsByIds).toHaveBeenCalledWith([technicianId]);
  });

  it('emite el assignee con su id cuando la etiqueta no resuelve', async () => {
    const technicianId = '22222222-2222-4222-8222-222222222222';
    const { controller } = buildController({
      order: buildOrder({ assignedTechnicianId: technicianId }),
      labels: new Map(),
    });

    const result = await controller.getById('eo-001', actor);

    expect(result.assignee).toEqual({ type: 'TECHNICIAN', id: technicianId });
    expect(result.assignee).not.toHaveProperty('displayLabel');
  });

  it('emite la rama CREW para OT de cuadrilla (CA-02)', async () => {
    const crewId = '33333333-3333-4333-8333-333333333333';
    const { controller, usersService } = buildController({
      order: buildOrder({ assignedCrewId: crewId }),
      labels: new Map(),
    });

    const result = await controller.getById('eo-001', actor);

    expect(result.assignee).toEqual({ type: 'CREW', id: crewId });
    expect(usersService?.findDisplayLabelsByIds).not.toHaveBeenCalled();
  });

  it('omite assignee cuando la OT está sin asignar', async () => {
    const { controller } = buildController({ order: buildOrder(), labels: new Map() });

    const result = await controller.getById('eo-001', actor);

    expect(result).not.toHaveProperty('assignee');
  });

  it('propaga requirements[] del completion al detalle', async () => {
    const service = {
      getById: jest.fn().mockResolvedValue(buildOrder()),
      getCompletion: jest.fn().mockResolvedValue({
        progress: 50,
        completed: 1,
        total: 2,
        requirements: [
          {
            requirementId: 'instalacion',
            label: 'Instalación de fibra',
            kind: 'ACTIVITY',
            satisfied: true,
          },
        ],
      }),
      getSyncState: jest.fn().mockResolvedValue('IN_SYNC'),
      computeAllowedActions: jest.fn().mockReturnValue(null),
    } as unknown as ExecutionOrdersService;
    const controller = new ExecutionOrdersController(
      service,
      {} as ExecutionOrderProjectionConvergenceService,
    );

    const result = await controller.getById('eo-001', actor);

    expect(result.completion.requirements).toEqual([
      {
        requirementId: 'instalacion',
        label: 'Instalación de fibra',
        kind: 'ACTIVITY',
        satisfied: true,
      },
    ]);
  });
});
