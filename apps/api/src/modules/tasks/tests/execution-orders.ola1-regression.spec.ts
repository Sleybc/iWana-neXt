/**
 * MOD11 Consola de OT · Ola 1 · Suite de regresión C5 (AI-SR-QA).
 *
 * Fija los doce casos del prompt `PROMPT-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md` §3
 * en su vertiente backend (casos 1-6, 5-bis, 10 y 11; los casos 7-9 de portal
 * viven en `ExecutionOrderConsolaOtOla1Regression.spec.tsx` y en el E2E
 * `e2e/tests/portal-operations-consola-ot-ola1.spec.ts`).
 *
 * - Contratos congelados consumidos, no tocados:
 *   `execution-orders-completion.ts` v1 + `execution-orders.ts` v1.1.
 * - Sin PII real: UUIDs sintéticos y etiquetas ficticias.
 * - Fixtures multi-tenant con aislamiento por schema (`tenant_001` /
 *   `tenant_002`): el schema viaja desde `TenantContext` y cada consulta se
 *   filtra por `tenant_id`; el caso R-SCHEMA lo fija.
 * - No toca el test BOLA vigente (`tasks.boundary.spec.ts`,
 *   `execution-orders.controller.http.spec.ts`): el caso 10 corre esos
 *   archivos sin modificarlos y añade predicado propio en este archivo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

import { TenantContext, runInTenantSchema } from '@iwana/db';

const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
const mockGetTenantContext = TenantContext.getOrThrow as jest.Mock;

const TENANT_A = { tenantId: 'tenant-001', schemaName: 'tenant_001' };
const TENANT_B = { tenantId: 'tenant-002', schemaName: 'tenant_002' };

const supportActor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-001',
  type: 'tenant',
};
const adminActor: JwtPayload = { ...supportActor, sub: 'admin-001', role: UserRole.ADMIN };
const techActor: JwtPayload = { ...supportActor, sub: 'tech-001', role: UserRole.TECHNICIAN };
const contractorActor: JwtPayload = {
  ...supportActor,
  sub: 'contractor-001',
  role: UserRole.CONTRACTOR,
};

// ─── getCompletion ───────────────────────────────────────────────────────────

const buildCompletionQueryBuilder = (rows: unknown[]) => ({
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
      tenantId: mockGetTenantContext().tenantId,
      templateRequirementsSnapshot: options.snapshot,
    }),
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(buildCompletionQueryBuilder(options.activities ?? []))
      .mockReturnValueOnce(buildCompletionQueryBuilder(options.evidences ?? []))
      .mockReturnValueOnce(buildCompletionQueryBuilder(options.itemUsages ?? [])),
  };
  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
  const completion = await service.getCompletion('eo-001');
  return { completion, manager };
};

// ─── GET :id ─────────────────────────────────────────────────────────────────

const buildOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'eo-001',
  executionOrderNumber: 'OTE-20260828-001',
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
  plannedWindowStartAt: new Date('2026-08-28T14:00:00.000Z'),
  plannedWindowEndAt: new Date('2026-08-28T16:00:00.000Z'),
  assignedTechnicianId: null,
  assignedCrewId: null,
  municipality: 'Bogotá',
  customerDisplayLabel: 'Sitio operativo',
  startedAt: null,
  closedAt: null,
  createdAt: new Date('2026-08-28T10:00:00.000Z'),
  updatedAt: new Date('2026-08-28T10:00:00.000Z'),
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
  return { controller, usersService };
};

// ─── list() ──────────────────────────────────────────────────────────────────

type QbMock = {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
};

const buildListQb = (rows: Array<Record<string, unknown>>, total?: number): QbMock => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([rows, total ?? rows.length]),
});

const mockListSchema = (qb: QbMock): void => {
  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
    fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
  );
};

const buildListService = (findDisplayLabelsByIds: jest.Mock): ExecutionOrdersService =>
  new ExecutionOrdersService(
    {} as DataSource,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { findDisplayLabelsByIds } as never,
  );

const buildListRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: '11111111-1111-4111-8111-111111111111',
  executionOrderNumber: 'OTE-20260828-001',
  status: ExecutionOrderStatus.ASSIGNED,
  result: null,
  workType: WfmWorkType.INSTALLATION,
  scheduleEventId: '33333333-3333-4333-8333-333333333333',
  plannedWindowStartAt: new Date('2026-08-28T14:00:00.000Z'),
  plannedWindowEndAt: new Date('2026-08-28T16:00:00.000Z'),
  assignedTechnicianId: 'tech-001',
  assignedCrewId: null,
  customerDisplayLabel: 'Sitio operativo',
  municipality: 'Bogotá',
  ticketId: null,
  taskId: null,
  visitRequestId: null,
  createdAt: new Date('2026-08-28T10:00:00.000Z'),
  updatedAt: new Date('2026-08-28T10:00:00.000Z'),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTenantContext.mockReturnValue({ ...TENANT_A });
});

describe('OLA1 regresión backend — caso 1: responsable técnico con etiqueta (CA-01)', () => {
  it('R1: GET :id sobre OT con assignedTechnicianId devuelve assignee.displayLabel', async () => {
    const technicianId = '11111111-1111-4111-8111-111111111111';
    const { controller, usersService } = buildController({
      order: buildOrder({ assignedTechnicianId: technicianId }),
      labels: new Map([[technicianId, 'Técnico Operativo']]),
    });

    const result = await controller.getById('eo-001', supportActor);

    expect(result.assignee).toEqual({
      type: 'TECHNICIAN',
      id: technicianId,
      displayLabel: 'Técnico Operativo',
    });
    expect(usersService?.findDisplayLabelsByIds).toHaveBeenCalledTimes(1);
    expect(usersService?.findDisplayLabelsByIds).toHaveBeenCalledWith([technicianId]);
  });
});

describe('OLA1 regresión backend — caso 2: responsable cuadrilla (CA-02)', () => {
  it('R2: OT con assignedCrewId devuelve assignee con type CREW', async () => {
    const crewId = '33333333-3333-4333-8333-333333333333';
    const { controller, usersService } = buildController({
      order: buildOrder({ assignedCrewId: crewId }),
      labels: new Map(),
    });

    const result = await controller.getById('eo-001', supportActor);

    expect(result.assignee).toEqual({ type: 'CREW', id: crewId });
    expect(usersService?.findDisplayLabelsByIds).not.toHaveBeenCalled();
  });
});

describe('OLA1 regresión backend — caso 3: coherencia listado-detalle', () => {
  it('R3a: la misma OT no discrepa sobre el técnico entre listado y detalle', async () => {
    const technicianId = 'tech-001';
    const labels = new Map([[technicianId, 'Técnico Operativo']]);
    const qb = buildListQb([buildListRow({ assignedTechnicianId: technicianId })]);
    mockListSchema(qb);
    const service = buildListService(jest.fn().mockResolvedValue(labels));

    const listResult = await service.list({}, adminActor);

    const { controller } = buildController({
      order: buildOrder({ assignedTechnicianId: technicianId }),
      labels,
    });
    const detailResult = await controller.getById('eo-001', supportActor);

    expect(listResult.data[0]?.assignee).toEqual(detailResult.assignee);
    expect(detailResult.assignee).toEqual({
      type: 'TECHNICIAN',
      id: technicianId,
      displayLabel: 'Técnico Operativo',
    });
  });

  it('R3b: la misma OT de cuadrilla no discrepa entre listado y detalle', async () => {
    const crewId = '77777777-7777-4777-8777-777777777777';
    const qb = buildListQb([buildListRow({ assignedTechnicianId: null, assignedCrewId: crewId })]);
    mockListSchema(qb);
    const service = buildListService(jest.fn().mockResolvedValue(new Map()));

    const listResult = await service.list({}, adminActor);

    const { controller } = buildController({
      order: buildOrder({ assignedCrewId: crewId }),
      labels: new Map(),
    });
    const detailResult = await controller.getById('eo-001', supportActor);

    expect(listResult.data[0]?.assignee).toEqual({ type: 'CREW', id: crewId });
    expect(detailResult.assignee).toEqual({ type: 'CREW', id: crewId });
  });
});

describe('OLA1 regresión backend — caso 4: estado por requisito (CA-05)', () => {
  it('R4: completion.requirements[] trae un ítem por requisito con estado real y razón', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        {
          key: 'instalacion',
          label: 'Actividad de instalación',
          required: true,
          kind: 'ACTIVITY',
          activityType: 'INSTALLATION',
        },
        {
          key: 'foto-evidencia',
          label: 'Evidencia fotográfica',
          required: true,
          kind: 'EVIDENCE',
          evidenceType: 'PHOTO',
        },
      ],
      activities: [{ activityType: 'INSTALLATION' }],
      evidences: [],
    });

    expect(completion.requirements).toEqual([
      {
        requirementId: 'instalacion',
        label: 'Actividad de instalación',
        kind: 'ACTIVITY',
        satisfied: true,
      },
      {
        requirementId: 'foto-evidencia',
        label: 'Evidencia fotográfica',
        kind: 'EVIDENCE',
        satisfied: false,
        reason: 'No se ha vinculado una foto para "Evidencia fotográfica".',
      },
    ]);
  });
});

describe('OLA1 regresión backend — caso 5: COMPLIANCE satisfecho (CA-06)', () => {
  const complianceSnapshot = [
    {
      key: 'aceptacion',
      label: 'Aceptación del cliente',
      required: true,
      kind: 'COMPLIANCE',
      policyKey: 'CUSTOMER_ACCEPTANCE',
    },
  ];

  it('R5: OT con aceptación registrada muestra COMPLIANCE satisfecho y contando en el avance', async () => {
    const { completion } = await runGetCompletion({
      snapshot: complianceSnapshot,
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

  it('R5-bis/a: firma en cuarentena (PENDING_ANALYSIS) NO satisface COMPLIANCE', async () => {
    const { completion } = await runGetCompletion({
      snapshot: complianceSnapshot,
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
  });

  it('R5-bis/b: firma AVAILABLE SÍ satisface COMPLIANCE (atrapa el arreglo ingenuo del select)', async () => {
    const { completion } = await runGetCompletion({
      snapshot: complianceSnapshot,
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
});

describe('OLA1 regresión backend — caso 6: semántica del agregado', () => {
  it('R6: progress, completed y total conservan su semántica (1/3 → 33/1/3, siempre publicados)', async () => {
    const { completion } = await runGetCompletion({
      snapshot: [
        {
          key: 'installation-activity',
          label: 'Actividad de instalación',
          required: true,
          kind: 'ACTIVITY',
          activityType: 'INSTALLATION',
        },
        {
          key: 'work-photo',
          label: 'Evidencia fotográfica',
          required: true,
          kind: 'EVIDENCE',
          evidenceType: 'PHOTO',
        },
        {
          key: 'CUSTOMER_SIGNATURE',
          label: 'Firma del cliente',
          required: true,
          kind: 'EVIDENCE',
          evidenceType: 'SIGNATURE',
        },
      ],
      activities: [{ activityType: 'INSTALLATION' }],
      evidences: [],
    });

    expect(completion.total).toBe(3);
    expect(completion.completed).toBe(1);
    expect(completion.progress).toBe(33);
    expect(typeof completion.completed).toBe('number');
    expect(typeof completion.total).toBe('number');
  });
});

describe('OLA1 regresión backend — aislamiento multi-tenant por schema', () => {
  it('R-SCHEMA: getCompletion corre en el schema del tenant y filtra por tenant_id', async () => {
    mockGetTenantContext.mockReturnValue({ ...TENANT_B });
    const { manager } = await runGetCompletion({
      snapshot: [
        {
          key: 'instalacion',
          label: 'Actividad de instalación',
          required: true,
          kind: 'ACTIVITY',
          activityType: 'INSTALLATION',
        },
      ],
    });

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_002',
      expect.any(Function),
    );
    const qbMocks = (manager.createQueryBuilder as jest.Mock).mock.results.map(
      (result) => result.value,
    );
    const tenantFilters: Array<[unknown, string]> = [
      [qbMocks[0], 'activity.tenant_id = :tenantId'],
      [qbMocks[1], 'evidence.tenant_id = :tenantId'],
      [qbMocks[2], 'usage.tenant_id = :tenantId'],
    ];
    expect(qbMocks).toHaveLength(3);
    for (const [qb, predicate] of tenantFilters) {
      expect((qb as { andWhere: jest.Mock }).andWhere).toHaveBeenCalledWith(predicate, {
        tenantId: 'tenant-002',
      });
    }
    // El schema del otro tenant nunca se usa en esta llamada.
    expect(mockRunInTenantSchema).not.toHaveBeenCalledWith(
      expect.anything(),
      'tenant_001',
      expect.any(Function),
    );
  });
});

describe('OLA1 regresión backend — caso 10: BOLA del listado (sin tocar el test vigente)', () => {
  it('R10a: TECHNICIAN y CONTRACTOR listan scopeados por actor; ADMIN no', async () => {
    const techQb = buildListQb([]);
    mockListSchema(techQb);
    const techService = buildListService(jest.fn().mockResolvedValue(new Map()));
    await techService.list({}, techActor);
    const techPredicates = techQb.andWhere.mock.calls.map((call) => String(call[0]));
    expect(techPredicates.some((p) => p.includes('order.assigned_technician_id = :actorSub'))).toBe(
      true,
    );
    expect(techQb.andWhere).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorSub: 'tech-001', poolExcludedStatus: 'CREATED' }),
    );

    const contractorQb = buildListQb([]);
    mockListSchema(contractorQb);
    const contractorService = buildListService(jest.fn().mockResolvedValue(new Map()));
    await contractorService.list({}, contractorActor);
    expect(contractorQb.andWhere).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorSub: 'contractor-001' }),
    );

    const adminQb = buildListQb([]);
    mockListSchema(adminQb);
    const adminService = buildListService(jest.fn().mockResolvedValue(new Map()));
    await adminService.list({}, adminActor);
    const adminPredicates = adminQb.andWhere.mock.calls.map((call) => String(call[0]));
    expect(adminPredicates.some((p) => p.includes(':actorSub'))).toBe(false);
  });

  it('R10b: el total del listado sale de la misma consulta scopeada (sin conteo sin scopear)', async () => {
    const qb = buildListQb([buildListRow()], 1);
    mockListSchema(qb);
    const service = buildListService(jest.fn().mockResolvedValue(new Map()));

    const result = await service.list({}, techActor);

    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(1);
  });
});

describe('OLA1 regresión backend — caso 11: política de acceso sin ampliación', () => {
  const CONTROLLER_PATH = join(__dirname, '..', 'execution-orders.controller.ts');

  /** Pares @Roles/@Permissions en orden de aparición (22 rutas, Ola 1). */
  const EXPECTED_POLICY: Array<{ roles: string; permission: string }> = [
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles: 'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles:
        'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles: 'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE',
    },
    {
      roles: 'UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE',
    },
    {
      roles: 'UserRole.ADMIN, UserRole.NOC',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_EVENTS_REDRIVE',
    },
    {
      roles: 'UserRole.ADMIN, UserRole.NOC',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ',
    },
    {
      roles: 'UserRole.ADMIN, UserRole.NOC',
      permission: 'AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE',
    },
  ];

  const readPolicyPairs = (): Array<{ roles: string; permission: string }> => {
    const source = readFileSync(CONTROLLER_PATH, 'utf8');
    const pattern = /@Roles\(([^)]*)\)\s*\n\s*@Permissions\(([^)]*)\)/g;
    const pairs: Array<{ roles: string; permission: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      pairs.push({ roles: (match[1] ?? '').trim(), permission: (match[2] ?? '').trim() });
    }
    return pairs;
  };

  it('R11a: ningún endpoint amplió @Roles ni @Permissions en esta ola (22 pares exactos)', () => {
    expect(readPolicyPairs()).toEqual(EXPECTED_POLICY);
  });

  it('R11b: @Roles usa UserRole.* (sin strings literales) y SUPERVISE nunca incluye campo', () => {
    const source = readFileSync(CONTROLLER_PATH, 'utf8');
    const rolesBlocks = [...source.matchAll(/@Roles\(([^)]*)\)/g)].map((match) => match[1] ?? '');
    expect(rolesBlocks.length).toBe(EXPECTED_POLICY.length);
    for (const block of rolesBlocks) {
      expect(block).not.toMatch(/['"]/);
    }
    const pairs = readPolicyPairs();
    for (const pair of pairs) {
      if (pair.permission.endsWith('SUPERVISE') || pair.permission.endsWith('REDRIVE')) {
        expect(pair.roles).not.toContain('TECHNICIAN');
        expect(pair.roles).not.toContain('CONTRACTOR');
      }
    }
  });
});
