import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ExecutionOrder, runInTenantSchema } from '@iwana/db';
import { ExecutionOrderResult, ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AnnulExecutionOrderSchema } from '../dto/execution-orders.dto';
import { ExecutionOrderInventoryService } from '../services/execution-order-inventory.service';
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
  ExecutionOrderStatusTransition: class ExecutionOrderStatusTransition {},
  ExecutionOrderOutboxEvent: class ExecutionOrderOutboxEvent {},
}));

/**
 * MOD11 T2 — anulación por error (ADR-090 §D3) + huecos de la cancelación
 * (spec §4.5): CA-09 a CA-13.
 *
 * Mecanismo: `status = CANCELLED` + `is_annulled = true` (migración 136),
 * sin estado terminal nuevo. Las listas de terminalidad ya contienen
 * `CANCELLED`, así que la anulada libera su origen (135) y entra en la purga
 * (134) por estado, sin tocar ninguna de las dos.
 */
describe('ExecutionOrdersService — anulación por error (T2)', () => {
  const supervisor: JwtPayload = {
    sub: 'coord-001',
    email: 'coord@example.test',
    role: UserRole.NOC,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-coord',
    type: 'tenant',
  };

  const buildOrder = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'eo-001',
    tenantId: 'tenant-001',
    executionOrderNumber: 'OTE-20250915-001',
    scheduleEventId: '33333333-3333-4333-8333-333333333333',
    plannedWindowStartAt: new Date('2030-01-01T10:00:00.000Z'),
    plannedWindowEndAt: new Date('2030-01-01T11:00:00.000Z'),
    organizationSiteId: '11111111-1111-4111-8111-111111111111',
    status: ExecutionOrderStatus.ASSIGNED,
    result: null,
    isAnnulled: false,
    version: 2,
    startedAt: null,
    closedAt: null,
    closeNotes: null,
    assignedTechnicianId: 'tech-001',
    assignedCrewId: null,
    workType: WfmWorkType.INSTALLATION,
    taskId: null,
    ticketId: null,
    templateRequirementsSnapshot: [],
    updatedByUserId: null,
    createdAt: new Date('2030-01-01T09:00:00.000Z'),
    ...overrides,
  });

  interface Harness {
    manager: {
      findOne: jest.Mock;
      query: jest.Mock;
      createQueryBuilder: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    };
    saved: Array<{ entity: unknown; payload: Record<string, unknown> }>;
    sets: Array<Record<string, unknown>>;
  }

  const buildManager = (order: Record<string, unknown> | null): Harness => {
    const saved: Harness['saved'] = [];
    const sets: Harness['sets'] = [];
    const chain: Record<string, jest.Mock> = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn((payload: Record<string, unknown>) => {
        sets.push(payload);
        return chain;
      }),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
      getOne: jest.fn().mockResolvedValue(null),
      getRawOne: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ExecutionOrder) return order ? { ...order } : null;
        return null;
      }),
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(chain),
      create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => ({ ...payload })),
      save: jest
        .fn()
        .mockImplementation(async (entity: unknown, payload: Record<string, unknown>) => {
          saved.push({ entity, payload: { ...payload } });
          return { ...payload };
        }),
    };
    return { manager, saved, sets };
  };

  const runWith = (harness: Harness) => {
    const mockRun = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    mockRun.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: harness.manager } as never),
    );
  };

  const port = (allowed: boolean) => ({
    canSuperviseExecutionOrder: jest.fn().mockResolvedValue(allowed),
  });

  const buildService = (
    reliability?: unknown,
    scopeAllowed: boolean | null = true,
  ): ExecutionOrdersService =>
    new ExecutionOrdersService(
      {} as DataSource,
      {} as unknown as ExecutionOrderInventoryService,
      undefined,
      undefined,
      reliability as never,
      undefined,
      undefined,
      undefined,
      (scopeAllowed === null ? null : scopeAllowed === true ? port(true) : port(false)) as never,
    );

  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  const errorCode = (error: unknown): string | undefined => {
    const response = (error as { getResponse: () => unknown }).getResponse();
    if (response && typeof response === 'object' && 'code' in response)
      return String((response as { code: unknown }).code);
    return undefined;
  };

  // ─── CA-09: distinguible en dato y consulta ────────────────────────────

  it('CA-09: anular deja CANCELLED + is_annulled, con motivo, asiento y resultado intacto', async () => {
    const harness = buildManager(buildOrder());
    runWith(harness);
    const service = buildService();

    const saved = await service.annul(
      'eo-001',
      { reason: 'Sitio equivocado al despachar' },
      supervisor,
    );

    expect(saved.status).toBe(ExecutionOrderStatus.CANCELLED);
    expect(saved.isAnnulled).toBe(true);
    expect(saved.closeNotes).toBe('Sitio equivocado al despachar');
    expect(saved.closedAt).toBeInstanceOf(Date);
    // La anulación no es un desenlace de ejecución: el resultado no se toca.
    expect(saved.result).toBeNull();
    // T0 opt-in: el SET del UPDATE declara la columna discriminadora.
    const annulSet = harness.sets.find((s) => 'isAnnulled' in s);
    expect(annulSet).toMatchObject({ status: ExecutionOrderStatus.CANCELLED, isAnnulled: true });
    // D5: asiento de transición en la misma transacción, con motivo.
    const seat = harness.saved.find((s) => 'toStatus' in s.payload || 'to_status' in s.payload);
    expect(seat?.payload).toMatchObject({
      toStatus: ExecutionOrderStatus.CANCELLED,
      reason: 'Sitio equivocado al despachar',
    });
  });

  it('CA-09: la cancelación operativa no marca el discriminador (dato distinto)', async () => {
    const harness = buildManager(buildOrder());
    const service = buildService();

    await service.cancelFromSchedulingWithManager(
      harness.manager as never,
      'tenant-001',
      'eo-001',
      '33333333-3333-4333-8333-333333333333',
      'El cliente canceló la visita',
      supervisor,
    );

    const persisted = harness.saved.find(
      (s) => (s.payload as Record<string, unknown>)['status'] === 'CANCELLED',
    );
    expect(persisted).toBeDefined();
    expect((persisted?.payload as Record<string, unknown>)['isAnnulled']).toBeFalsy();
    expect((persisted?.payload as Record<string, unknown>)['closeNotes']).toBe(
      'El cliente canceló la visita',
    );
  });

  it('CA-09: la bandeja excluye anuladas para todos (predicado + comportamiento)', async () => {
    const predicates: string[] = [];
    const params: Record<string, unknown> = {};
    const rows = [
      buildOrder({ id: 'a', status: ExecutionOrderStatus.CANCELLED, isAnnulled: true }),
      buildOrder({ id: 'b', status: ExecutionOrderStatus.CANCELLED, isAnnulled: false }),
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
      // Emula el WHERE real: la an ulada no sale aunque esté cancelada.
      getManyAndCount: jest.fn().mockImplementation(async () => {
        const scoped = rows.filter((r) => (r['isAnnulled'] as boolean) !== true);
        return [scoped, scoped.length];
      }),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
    );
    const service = buildService();

    const body = await service.list({}, supervisor);

    expect(params['annulledExcluded']).toBe(false);
    expect(predicates.some((p) => p.includes('order.is_annulled = :annulledExcluded'))).toBe(true);
    expect(body.data.map((r) => r.id)).toEqual(['b']);
  });

  // ─── CA-10: motivo y rol; terminal no anulable ─────────────────────────

  it('CA-10: el schema rechaza la anulación sin motivo', () => {
    expect(AnnulExecutionOrderSchema.safeParse({}).success).toBe(false);
    expect(AnnulExecutionOrderSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(
      AnnulExecutionOrderSchema.safeParse({ reason: 'Error de captura al despachar' }).success,
    ).toBe(true);
  });

  it('CA-10: el servicio rechaza motivo ausente aunque se eluda el schema', async () => {
    const harness = buildManager(buildOrder());
    runWith(harness);
    const service = buildService();

    const error = await service.annul('eo-001', { reason: '   ' }, supervisor).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(errorCode(error)).toBe('ANNULMENT_REASON_REQUIRED');
    expect(harness.manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['COMPLETED', ExecutionOrderStatus.COMPLETED],
    ['CANCELLED operativa', ExecutionOrderStatus.CANCELLED],
    ['NOT_EXECUTED', ExecutionOrderStatus.NOT_EXECUTED],
  ])('CA-10/negación: OT terminal (%s) no se puede anular', async (_label, status) => {
    const harness = buildManager(buildOrder({ status }));
    runWith(harness);
    const service = buildService();

    const error = await service
      .annul('eo-001', { reason: 'Intento tardío' }, supervisor)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(errorCode(error)).toBe('TERMINAL_EXECUTION_ORDER');
  });

  it('CA-10/negación: sin alcance de supervisión no se anula (404)', async () => {
    const harness = buildManager(buildOrder());
    runWith(harness);
    const service = buildService(undefined, false);

    await expect(
      service.annul('eo-001', { reason: 'Sin alcance' }, supervisor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.manager.save).not.toHaveBeenCalled();
  });

  it('T2: la OT despachada sin cita (CREATED sin evento) se puede anular', async () => {
    const dispatched = buildOrder({
      status: ExecutionOrderStatus.CREATED,
      scheduleEventId: null,
      plannedWindowStartAt: null,
      plannedWindowEndAt: null,
      assignedTechnicianId: null,
      result: null,
    });
    const harness = buildManager(dispatched);
    runWith(harness);
    const service = buildService();

    const saved = await service.annul(
      'eo-001',
      { reason: 'Despacho duplicado por error' },
      supervisor,
    );

    expect(saved.status).toBe(ExecutionOrderStatus.CANCELLED);
    expect(saved.isAnnulled).toBe(true);
  });

  // ─── CA-11: puerta trasera de close cerrada ────────────────────────────

  it('CA-11: close con result=CANCELLED se rechaza con 422 antes de tocar base', async () => {
    const service = buildService();

    const error = await service
      .close(
        'eo-001',
        {
          result: ExecutionOrderResult.CANCELLED,
          summary: 'Intento de cancelación por cierre',
        },
        supervisor,
      )
      .catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(errorCode(error)).toBe('CLOSE_RESULT_CANCELLED_REMOVED');
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  // ─── CA-12: terminal no reescribible ───────────────────────────────────

  it('CA-12: cancelar una OT COMPLETED se rechaza (no pisa el cierre)', async () => {
    const harness = buildManager(buildOrder({ status: ExecutionOrderStatus.COMPLETED }));
    const service = buildService();

    const error = await service
      .cancelFromSchedulingWithManager(
        harness.manager as never,
        'tenant-001',
        'eo-001',
        '33333333-3333-4333-8333-333333333333',
        'Intento tardío',
        supervisor,
      )
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(errorCode(error)).toBe('TERMINAL_EXECUTION_ORDER');
    expect(harness.manager.save).not.toHaveBeenCalled();
  });

  // ─── CA-13: evento de dominio ──────────────────────────────────────────

  it('CA-13: la cancelación emite ExecutionOrderCancelledV1 con motivo', async () => {
    const harness = buildManager(buildOrder());
    const service = buildService();

    await service.cancelFromSchedulingWithManager(
      harness.manager as never,
      'tenant-001',
      'eo-001',
      '33333333-3333-4333-8333-333333333333',
      'El cliente canceló la visita',
      supervisor,
    );

    const outbox = harness.saved.filter((s) => 'eventType' in s.payload);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.payload).toMatchObject({
      eventType: 'ExecutionOrderCancelledV1',
      aggregateId: 'eo-001',
      tenantId: 'tenant-001',
    });
    expect((outbox[0]?.payload as Record<string, unknown>)['payload']).toMatchObject({
      executionOrderId: 'eo-001',
      reason: 'El cliente canceló la visita',
    });
  });

  it('CA-13: la anulación emite ExecutionOrderAnnulledV1 por el camino de comandos', async () => {
    const harness = buildManager(buildOrder());
    runWith(harness);
    const appended: Array<Record<string, unknown>> = [];
    const reliability = {
      beginIdempotent: jest.fn().mockResolvedValue({
        intentId: 'intent-annul-1',
        replay: false,
        resourceRef: null,
        resourceVersion: null,
      }),
      completeIdempotency: jest.fn().mockResolvedValue(undefined),
      appendAuditIntent: jest.fn().mockResolvedValue(undefined),
      appendOutbox: jest
        .fn()
        .mockImplementation(async (_manager: unknown, input: Record<string, unknown>) => {
          appended.push(input);
        }),
    };
    const service = buildService(reliability);

    await service.annul('eo-001', { reason: 'Error de captura al despachar' }, supervisor, {
      idempotencyKey: 'annul-key-1',
      correlationId: '00000000-0000-4000-8000-000000000001',
      requireIdempotency: false,
      requireIfMatch: false,
    });

    expect(reliability.appendOutbox).toHaveBeenCalledTimes(1);
    expect(appended[0]).toMatchObject({
      eventType: 'ExecutionOrderAnnulledV1',
      aggregateId: 'eo-001',
      tenantId: 'tenant-001',
    });
    expect(appended[0]?.['payload']).toMatchObject({
      executionOrderId: 'eo-001',
      reason: 'Error de captura al despachar',
    });
  });

  // ─── Inercia de la anulada ─────────────────────────────────────────────

  it('T2: la anulada no admite seguimiento ni lo ofrece (supervisión incluida)', async () => {
    const harness = buildManager(
      buildOrder({ status: ExecutionOrderStatus.CANCELLED, isAnnulled: true }),
    );
    runWith(harness);
    const service = buildService();

    const error = await service
      .createFollowUp('eo-001', { reasonCode: 'REINTENTO' }, supervisor, {
        requireIdempotency: false,
        requireIfMatch: false,
        correlationId: '00000000-0000-4000-8000-000000000001',
      } as never)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(errorCode(error)).toBe('FOLLOW_UP_NOT_ALLOWED');

    const order = buildOrder({
      status: ExecutionOrderStatus.CANCELLED,
      isAnnulled: true,
    }) as never;
    expect(service.computeAllowedActions(order, supervisor)).not.toContain('CREATE_FOLLOW_UP');
  });

  it('T2: assign() no persiste el discriminador (doctrina opt-in T0)', async () => {
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
        if (entity === ExecutionOrder) return buildOrder({ status: ExecutionOrderStatus.CREATED });
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

    await service.assign(
      'eo-001',
      { assigneeType: 'TECHNICIAN', assigneeId: 'tech-002' },
      supervisor,
    );

    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      expect(set).not.toHaveProperty('isAnnulled');
    }
  });
});
