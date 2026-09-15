import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ExecutionOrder, runInTenantSchema } from '@iwana/db';
import { ExecutionOrderStatus, UserRole, WfmWorkType, WorkOrderSourceContext } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ScheduleConflictService } from '../../wfm/services/schedule-conflict.service';
import { ExecutionOrderInventoryService } from '../services/execution-order-inventory.service';
import { DispatchExecutionOrderSchema } from '../dto/execution-orders.dto';
import { ExecutionOrdersService } from '../services/execution-orders.service';

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

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

/**
 * MOD11 E2 — puerta de despacho (CA-05 a CA-08c + consola viva).
 *
 * - CA-05: la OT nace en CREATED sin ventana ni técnico, con sitio y origen
 *   explícitos; sin sitio o sin origen se rechaza.
 * - CA-06: verificado DESDE LA AGENDA — el chequeo de capacidad de MOD09 solo
 *   lee `schedule_events`; la OT sin cita no crea evento y no lo toca.
 * - CA-07: asignar persiste (patrón T0: se inspecciona el SET del UPDATE).
 * - CA-08: por negación, técnicos Y contratistas, en los cinco sitios de la
 *   spec §3.6.2 (S1 assert, S2 WHERE, S3 allowedActions, S4 guard por
 *   delegación, S5 superficie + oracle de test).
 * - Consola viva: con una OT sin ventana viva, lista y proyección responden
 *   sin lanzar (200 a nivel HTTP; aquí: sin throw y con nulos explícitos).
 */
describe('ExecutionOrdersService — puerta de despacho (E2)', () => {
  const SITE_ID = '11111111-1111-4111-8111-111111111111';

  const supervisor: JwtPayload = {
    sub: 'coord-001',
    email: 'coord@example.test',
    role: UserRole.NOC,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-coord',
    type: 'tenant',
  };
  const techActor: JwtPayload = {
    sub: 'tech-001',
    email: 'tech@example.test',
    role: UserRole.TECHNICIAN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-tech',
    type: 'tenant',
  };
  const contractorActor: JwtPayload = {
    sub: 'contractor-001',
    email: 'contractor@example.test',
    role: UserRole.CONTRACTOR,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-contractor',
    type: 'tenant',
  };

  const buildDispatchInput = (overrides: Record<string, unknown> = {}) => ({
    originContext: WorkOrderSourceContext.ASSURANCE,
    originRefId: 'E2-TICKET-001',
    workType: WfmWorkType.SUPPORT,
    organizationSiteId: SITE_ID,
    customerDisplayLabel: 'Cliente de prueba E2',
    workSummary: 'Soporte despachado sin cita',
    ...overrides,
  });

  interface DispatchHarness {
    manager: {
      findOne: jest.Mock;
      query: jest.Mock;
      createQueryBuilder: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    };
    savedEntities: unknown[];
    lockKeys: string[];
  }

  // Réplica el builder de origin-identity: 1ª QB = guarda de origen, 2ª =
  // numeración. `originDuplicate` resuelve el getOne de la guarda.
  const buildDispatchManager = (options: { originDuplicate?: unknown } = {}): DispatchHarness => {
    const savedEntities: unknown[] = [];
    const lockKeys: string[] = [];
    let qbCalls = 0;
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        if (typeof params?.[0] === 'string') lockKeys.push(params[0]);
        return [];
      }),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        qbCalls += 1;
        const isOriginCheck = qbCalls === 1;
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest
            .fn()
            .mockResolvedValue(isOriginCheck ? (options.originDuplicate ?? null) : null),
        };
      }),
      create: jest.fn((_entity: unknown, payload: unknown) => payload),
      save: jest.fn().mockImplementation(async (entity: unknown, payload: unknown) => {
        savedEntities.push(entity);
        return {
          id: 'eo-dispatch-001',
          version: 1,
          createdAt: new Date('2026-09-15T10:00:00.000Z'),
          updatedAt: new Date('2026-09-15T10:00:00.000Z'),
          ...(payload as Record<string, unknown>),
        };
      }),
    };
    return { manager, savedEntities, lockKeys };
  };

  const runDispatch = async (
    service: ExecutionOrdersService,
    harness: DispatchHarness,
    input: Record<string, unknown>,
  ) => {
    // Solo `mockImplementation` (reemplazo), nunca `mockImplementationOnce`:
    // un despacho que rechaza antes de tocar base (p. ej. PROVISIONING)
    // dejaría el Once sin consumir y contaminaría al test siguiente.
    const mockRun = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    mockRun.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: harness.manager } as never),
    );
    return service.dispatchFromCoordination(input as never, supervisor);
  };

  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  // MOD11 H1: el puerto de alcance va siempre inyectado; por defecto autoriza
  // (equivale a "quien supervisa la sede despacha igual que antes"). Los casos
  // de negación lo deniegan explícitamente. Sin puerto, fail-closed (404).
  const buildService = (port?: { canSuperviseExecutionOrder: jest.Mock } | null) =>
    new ExecutionOrdersService(
      {} as DataSource,
      {} as unknown as ExecutionOrderInventoryService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (port === undefined
        ? { canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true) }
        : port) as never,
    );

  // ─── CA-05 ─────────────────────────────────────────────────────────────

  it('CA-05: despacha OT en CREATED sin ventana ni técnico, con sitio y origen explícitos', async () => {
    const harness = buildDispatchManager();
    const service = buildService();
    let savedPayload: Record<string, unknown> = {};
    harness.manager.save.mockImplementation(async (entity: unknown, payload: unknown) => {
      savedPayload = payload as Record<string, unknown>;
      return {
        id: 'eo-dispatch-001',
        version: 1,
        createdAt: new Date('2026-09-15T10:00:00.000Z'),
        updatedAt: new Date('2026-09-15T10:00:00.000Z'),
        ...(payload as Record<string, unknown>),
      };
    });

    const receipt = await runDispatch(service, harness, buildDispatchInput());

    expect(receipt.status).toBe(ExecutionOrderStatus.CREATED);
    expect(receipt.originContext).toBe(WorkOrderSourceContext.ASSURANCE);
    expect(receipt.originRefId).toBe('E2-TICKET-001');
    expect(receipt.organizationSiteId).toBe(SITE_ID);
    // Sin ventana, sin técnico, sin evento: el acto de despachar no agenda.
    expect(savedPayload['scheduleEventId']).toBeNull();
    expect(savedPayload['plannedWindowStartAt']).toBeNull();
    expect(savedPayload['plannedWindowEndAt']).toBeNull();
    expect(savedPayload['assignedTechnicianId']).toBeNull();
    expect(savedPayload['assignedCrewId']).toBeNull();
    expect(savedPayload['visitRequestId']).toBeNull();
    expect(savedPayload['status']).toBe(ExecutionOrderStatus.CREATED);
  });

  it('CA-05: el despacho comparte la guarda de origen con la agenda (mismo lock, sin duplicar)', async () => {
    const harness = buildDispatchManager();
    const service = buildService();

    await runDispatch(service, harness, buildDispatchInput());

    // Orden de locks fijo número → origen, misma clave que el camino de agenda.
    expect(harness.lockKeys[0]).toMatch(/^execution-order-number:tenant-001:/);
    expect(harness.lockKeys).toContain(
      'execution-order-origin:tenant-001|ASSURANCE|E2-TICKET-001|SUPPORT',
    );
  });

  it('CA-05: segundo despacho del mismo origen se rechaza con 409 y referencia a la OT activa', async () => {
    const harness = buildDispatchManager({
      originDuplicate: {
        id: 'eo-activa',
        executionOrderNumber: 'OTE-20250915-001',
        status: ExecutionOrderStatus.CREATED,
      },
    });
    const service = buildService();

    const error = await runDispatch(service, harness, buildDispatchInput()).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    const body = (error as ConflictException).getResponse() as Record<string, unknown>;
    expect(body['error']).toBe('DUPLICATE_ACTIVE_WORK');
    expect(body['activeExecutionOrderId']).toBe('eo-activa');
  });

  it('CA-05: el schema rechaza despachar sin sitio y sin originContext explícito', () => {
    const withoutSite: Record<string, unknown> = { ...buildDispatchInput() };
    delete withoutSite['organizationSiteId'];
    expect(DispatchExecutionOrderSchema.safeParse(withoutSite).success).toBe(false);

    const withoutContext: Record<string, unknown> = { ...buildDispatchInput() };
    delete withoutContext['originContext'];
    expect(DispatchExecutionOrderSchema.safeParse(withoutContext).success).toBe(false);

    // Nada de heredar MANUAL: ausente no equivale a MANUAL.
    const parsed = DispatchExecutionOrderSchema.safeParse(buildDispatchInput());
    expect(parsed.success).toBe(true);
  });

  it('CA-05: el schema estricto rechaza ventana, evento o responsable en el despacho', () => {
    for (const extra of [
      { plannedWindowStartAt: '2030-01-01T10:00:00.000Z' },
      { scheduleEventId: '22222222-2222-4222-8222-222222222222' },
      { assignedTechnicianId: 'tech-001' },
    ]) {
      expect(DispatchExecutionOrderSchema.safeParse(buildDispatchInput(extra)).success).toBe(false);
    }
  });

  // ─── CA-06 (desde la agenda) ───────────────────────────────────────────

  it('CA-06: el despacho no crea ningún evento de agenda (no reserva capacidad)', async () => {
    const harness = buildDispatchManager();
    const service = buildService();

    await runDispatch(service, harness, buildDispatchInput());

    expect(harness.savedEntities.length).toBeGreaterThan(0);
    for (const entity of harness.savedEntities) {
      expect(entity).toBe(ExecutionOrder);
    }
  });

  it('CA-06: el chequeo de capacidad de la agenda solo lee schedule_events (la OT sin cita es invisible)', async () => {
    const seenTables: string[] = [];
    const seenPredicates: string[] = [];
    const chain = {
      where: jest.fn().mockImplementation((text: string) => {
        seenPredicates.push(text);
        return chain;
      }),
      andWhere: jest.fn().mockImplementation((text: string) => {
        seenPredicates.push(text);
        return chain;
      }),
      getRawOne: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockImplementation((table: string) => {
          seenTables.push(table);
          return chain;
        }),
      })),
    };
    const conflictService = new ScheduleConflictService({} as DataSource);

    const hasConflict = await conflictService.hasConflictWithManager(manager as never, {
      tenantId: 'tenant-001',
      assignedUserId: 'tech-001',
      scheduledStartAt: new Date('2030-04-01T10:00:00.000Z'),
      scheduledEndAt: new Date('2030-04-01T11:00:00.000Z'),
    });

    // El técnico sigue pudiendo recibir un evento en ese rango: sin filas en
    // schedule_events no hay conflicto, y la OT sin cita no aporta ninguna.
    expect(hasConflict).toBe(false);
    expect(seenTables).toEqual(['schedule_events']);
    expect(seenPredicates.join(' ')).not.toContain('execution_order');
  });

  // ─── CA-07 ─────────────────────────────────────────────────────────────

  it('CA-07: asignar la OT despachada la lleva a ASSIGNED y persiste técnico + estado en el UPDATE', async () => {
    const windowlessCreated = {
      id: 'eo-dispatch-001',
      tenantId: 'tenant-001',
      scheduleEventId: null,
      plannedWindowStartAt: null,
      plannedWindowEndAt: null,
      organizationSiteId: SITE_ID,
      status: ExecutionOrderStatus.CREATED,
      result: null,
      version: 2,
      startedAt: null,
      closedAt: null,
      closeNotes: null,
      assignedTechnicianId: null,
      assignedCrewId: null,
      templateRequirementsSnapshot: [],
      updatedByUserId: null,
    };
    const sets: Array<Record<string, unknown>> = [];
    const chain: Record<string, jest.Mock> = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn((payload: Record<string, unknown>) => {
        sets.push(payload);
        return chain;
      }),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ExecutionOrder) return { ...windowlessCreated };
        return null;
      }),
      save: jest
        .fn()
        .mockImplementation(async (_e: unknown, p: Record<string, unknown>) => ({ ...p })),
      create: jest.fn((_e: unknown, p: Record<string, unknown>) => ({ ...p })),
      createQueryBuilder: jest.fn().mockReturnValue(chain),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = buildService();

    const saved = await service.assign(
      'eo-dispatch-001',
      { assigneeType: 'TECHNICIAN', assigneeId: 'tech-001' },
      supervisor,
    );

    expect(saved.status).toBe(ExecutionOrderStatus.ASSIGNED);
    const assignmentSet = sets.find((s) => 'assignedTechnicianId' in s);
    expect(assignmentSet).toMatchObject({
      assignedTechnicianId: 'tech-001',
      status: ExecutionOrderStatus.ASSIGNED,
    });
  });

  // ─── CA-08 (por negación, técnicos Y contratistas) ─────────────────────

  const windowlessRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    executionOrderNumber: 'OTE-20250915-002',
    status: ExecutionOrderStatus.CREATED,
    result: null,
    workType: WfmWorkType.SUPPORT,
    scheduleEventId: null,
    plannedWindowStartAt: null,
    plannedWindowEndAt: null,
    assignedTechnicianId: null,
    assignedCrewId: null,
    organizationSiteId: SITE_ID,
    customerDisplayLabel: 'Cliente de prueba E2',
    municipality: null,
    ticketId: null,
    taskId: null,
    visitRequestId: null,
    createdAt: new Date('2026-09-15T10:00:00.000Z'),
    updatedAt: new Date('2026-09-15T10:00:00.000Z'),
    ...overrides,
  });

  it.each([
    ['TECHNICIAN', techActor],
    ['CONTRACTOR', contractorActor],
  ])(
    'CA-08 S1: %s no lee la OT en CREATED sin asignar (404 por negación)',
    async (_role, actor) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(windowlessRow()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      const service = buildService();

      await expect(
        service.assertActorAccess(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          actor as JwtPayload,
          false,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('CA-08 S1: el supervisor sí lee la OT en CREATED (la bolsa es de supervisión)', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(windowlessRow()),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = buildService();

    await expect(
      service.assertActorAccess('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', supervisor, false),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['TECHNICIAN', techActor],
    ['CONTRACTOR', contractorActor],
  ])(
    'CA-08 S2+S5+oracle: %s no lista la OT en CREATED y el predicado la excluye con parámetro ligado',
    async (_role, actor) => {
      const predicates: string[] = [];
      const params: Record<string, unknown> = {};
      const rows = [
        windowlessRow(),
        windowlessRow({
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          executionOrderNumber: 'OTE-20250915-003',
          status: ExecutionOrderStatus.ASSIGNED,
        }),
      ];
      const qb: Record<string, jest.Mock> = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockImplementation((p: string, ps?: Record<string, unknown>) => {
          predicates.push(p);
          Object.assign(params, ps ?? {});
          return qb;
        }),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        // Emula el WHERE real (oracle del test, igual que tasks.boundary.spec).
        getManyAndCount: jest.fn().mockImplementation(async () => {
          const scoped = rows.filter((row) => {
            const sub = (actor as JwtPayload).sub;
            if (row['assignedTechnicianId'] === sub) return true;
            return (
              row['assignedTechnicianId'] == null &&
              row['assignedCrewId'] == null &&
              row['status'] !== ExecutionOrderStatus.CREATED
            );
          });
          return [scoped, scoped.length];
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
      );
      const service = buildService();

      const body = await service.list({}, actor as JwtPayload);

      expect(params['poolExcludedStatus']).toBe(ExecutionOrderStatus.CREATED);
      expect(predicates.some((p) => p.includes('status <> :poolExcludedStatus'))).toBe(true);
      expect(body.data.map((row) => row.id)).not.toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(body.data.map((row) => row.id)).toContain('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    },
  );

  it.each([
    ['TECHNICIAN', techActor],
    ['CONTRACTOR', contractorActor],
  ])(
    'CA-08 S3: %s no recibe START sobre CREATED sin asignar; el supervisor recibe ASSIGN',
    async (_role, actor) => {
      const service = buildService();
      const order = windowlessRow() as never;

      expect(service.computeAllowedActions(order, actor as JwtPayload)).not.toContain('START');

      expect(service.computeAllowedActions(order, supervisor)).toContain('ASSIGN');
    },
  );

  // ─── CA-08b ────────────────────────────────────────────────────────────

  it('CA-08b: la OT con sitio es asignable con alcance de supervisión y 404 sin él', async () => {
    const withScope = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true),
    });
    const withoutScope = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(false),
    });
    const scopedManager = {
      findOne: jest.fn().mockResolvedValue(windowlessRow()),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: scopedManager } as never),
    );

    // Ruta de coordinación (assign): POST + SUPERVISE ⇒ write=true,
    // requiresTechnicalExecution=false, requiresSupervisionScope=true.
    await expect(
      withScope.assertActorAccess(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        supervisor,
        true,
        false,
        true,
      ),
    ).resolves.toBeUndefined();
    await expect(
      withoutScope.assertActorAccess(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        supervisor,
        true,
        false,
        true,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('CA-08b: sin sitio, la supervisión falla cerrada aunque el port autorice', async () => {
    const service = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true),
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(windowlessRow({ organizationSiteId: null })),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.assertActorAccess(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        supervisor,
        true,
        false,
        true,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── CA-08c ────────────────────────────────────────────────────────────

  it('CA-08c: PROVISIONING se rechaza como origen sin camino (servicio y schema)', async () => {
    const harness = buildDispatchManager();
    const service = buildService();

    const error = await runDispatch(service, harness, {
      ...buildDispatchInput(),
      originContext: WorkOrderSourceContext.PROVISIONING,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'ORIGIN_WITHOUT_PATH',
    });

    expect(
      DispatchExecutionOrderSchema.safeParse(
        buildDispatchInput({ originContext: WorkOrderSourceContext.PROVISIONING }),
      ).success,
    ).toBe(false);
  });

  it('CA-08c: TASKS sin referencia se rechaza y con referencia conserva taskId como trazabilidad', async () => {
    expect(
      DispatchExecutionOrderSchema.safeParse(
        buildDispatchInput({ originContext: WorkOrderSourceContext.TASKS, originRefId: null }),
      ).success,
    ).toBe(false);

    const harness = buildDispatchManager();
    const service = buildService();
    let savedPayload: Record<string, unknown> = {};
    harness.manager.save.mockImplementation(async (_e: unknown, p: unknown) => {
      savedPayload = p as Record<string, unknown>;
      return { id: 'eo-tasks-001', version: 1, ...(p as Record<string, unknown>) };
    });

    const receipt = await runDispatch(
      service,
      harness,
      buildDispatchInput({
        originContext: WorkOrderSourceContext.TASKS,
        originRefId: 'task-operativa-77',
        ticketId: 'TK-100',
      }),
    );

    // Pérdida aceptada a un salto (§3.8): el origen de primer nivel
    // (BILLING/SYSTEM) vive en la tarea; la OT apunta a la tarea.
    expect(receipt.originContext).toBe(WorkOrderSourceContext.TASKS);
    expect(savedPayload['taskId']).toBe('task-operativa-77');
    expect(savedPayload['originRefId']).toBe('task-operativa-77');
    expect(savedPayload['ticketId']).toBe('TK-100');
  });

  // ─── Consola viva ──────────────────────────────────────────────────────

  it('Consola viva: la lista proyecta la OT sin ventana con nulos explícitos (sin tripwire)', async () => {
    const rows = [windowlessRow()];
    const qb: Record<string, jest.Mock> = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
    );
    const service = buildService();

    const body = await service.list({}, supervisor);

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: ExecutionOrderStatus.CREATED,
      schedule: { eventId: null, window: null },
    });
  });

  // ─── H1: alcance de supervisión sobre la sede ──────────────────────────

  it('H1 por negación: supervisor sin alcance sobre la sede no despacha (404 fail-closed, sin insertar)', async () => {
    const harness = buildDispatchManager();
    const denied = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(false),
    });

    const error = await runDispatch(denied, harness, buildDispatchInput()).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    // Nada se persistió: el rechazo ocurre antes de delegar en el núcleo.
    expect(harness.manager.save).not.toHaveBeenCalled();
    expect(harness.savedEntities).toHaveLength(0);
  });

  it('H1 central: tras el rechazo, el origen sigue libre para el despacho legítimo', async () => {
    const harness = buildDispatchManager();
    const denied = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(false),
    });
    const allowed = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true),
    });
    const input = buildDispatchInput({
      originContext: WorkOrderSourceContext.ASSURANCE,
      originRefId: 'H1-ORIGEN-001',
    });

    const rejected = await runDispatch(denied, harness, input).catch((e) => e);
    expect(rejected).toBeInstanceOf(NotFoundException);
    expect(harness.manager.save).not.toHaveBeenCalled();

    const receipt = await runDispatch(allowed, harness, input);
    expect(receipt.status).toBe(ExecutionOrderStatus.CREATED);
    expect(receipt.originRefId).toBe('H1-ORIGEN-001');
    expect(harness.manager.save).toHaveBeenCalledTimes(1);
  });

  it('H1 sin oráculo: sin alcance, un origen existente responde 404 (no 409)', async () => {
    // Sugerencia del dictamen sec-eng H1: el orden alcance-antes-que-guarda
    // garantiza que un actor sin alcance no distinga "origen ocupado" de
    // "sin alcance". Se sella con test: duplicado activo + sin alcance → 404.
    const harness = buildDispatchManager({
      originDuplicate: {
        id: 'eo-activa',
        executionOrderNumber: 'OTE-20250915-009',
        status: ExecutionOrderStatus.CREATED,
      },
    });
    const denied = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(false),
    });

    const error = await runDispatch(denied, harness, buildDispatchInput()).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).not.toBeInstanceOf(ConflictException);
    expect(harness.manager.save).not.toHaveBeenCalled();
  });

  it('H1: sin puerto de alcance el despacho falla cerrado (404)', async () => {
    const harness = buildDispatchManager();
    const withoutPort = buildService(null);

    const error = await runDispatch(withoutPort, harness, buildDispatchInput()).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(harness.manager.save).not.toHaveBeenCalled();
  });

  it('H1 sin regresión: con alcance, el despacho emite el mismo recibo y persiste la misma fila', async () => {
    const harness = buildDispatchManager();
    const allowed = buildService({
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true),
    });
    let savedPayload: Record<string, unknown> = {};
    harness.manager.save.mockImplementation(async (_e: unknown, p: unknown) => {
      savedPayload = p as Record<string, unknown>;
      return {
        id: 'eo-h1-001',
        version: 1,
        createdAt: new Date('2026-09-15T10:00:00.000Z'),
        updatedAt: new Date('2026-09-15T10:00:00.000Z'),
        ...(p as Record<string, unknown>),
      };
    });

    const receipt = await runDispatch(allowed, harness, buildDispatchInput());

    expect(receipt.status).toBe(ExecutionOrderStatus.CREATED);
    expect(receipt.organizationSiteId).toBe(SITE_ID);
    expect(savedPayload['organizationSiteId']).toBe(SITE_ID);
    expect(savedPayload['scheduleEventId']).toBeNull();
  });
});
