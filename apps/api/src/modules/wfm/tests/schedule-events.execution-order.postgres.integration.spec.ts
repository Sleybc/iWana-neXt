import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  dataSourceOptions,
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderAuditIntent,
  ExecutionOrderIdempotencyRecord,
  ExecutionOrderItemUsage,
  ExecutionOrderOriginIdentity1350000000000,
  ExecutionOrderOutboxEvent,
  ExecutionOrderStatusTransition,
  ScheduleEvent,
  ScheduleRescheduleLog,
  TenantContext,
  VisitRequest,
  runInTenantSchema,
} from '@iwana/db';
import {
  ExecutionOrderStatus,
  ScheduleEventStatus,
  UserRole,
  WfmWorkType,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderReliabilityService } from '../../tasks/services/execution-order-reliability.service';
import { ExecutionOrdersService } from '../../tasks/services/execution-orders.service';
import { ScheduleConflictService } from '../services/schedule-conflict.service';
import { ScheduleEventsService } from '../services/schedule-events.service';
import type { DispatchExecutionOrderInput } from '../../tasks/dto/execution-orders.dto';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

if (dbAvailable && !integrationTenantSlug) {
  console.warn(
    '[E3-integration] Suite omitida: defina E2E_TENANT_SLUG para seleccionar un tenant real.',
  );
}

/** MOD11 E3: el evento MOD09 vincula y conserva la OT existente en PostgreSQL. */
describeWithDb('MOD11 E3 — vinculación de OT desde agenda en PostgreSQL real', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let executionOrders: ExecutionOrdersService;
  let scheduleEvents: ScheduleEventsService;
  let migration135AppliedBySuite = false;
  const createdOrderIds: string[] = [];
  const createdEventIds: string[] = [];

  const tenantContext = () => ({ tenantId, schemaName, tenantSlug: integrationTenantSlug! });

  const actor: JwtPayload = {
    sub: '00000000-0000-4000-8000-000000000031',
    email: 'e3-test@example.test',
    role: UserRole.NOC,
    tenantId: '',
    schemaName: '',
    jti: '00000000-0000-4000-8000-000000000032',
    type: 'tenant',
  };

  const buildDispatch = (siteId: string, originRefId: string): DispatchExecutionOrderInput => ({
    originContext: WorkOrderSourceContext.MANUAL,
    originRefId,
    workType: WfmWorkType.SUPPORT,
    organizationSiteId: siteId,
    customerDisplayLabel: 'Cliente de integración E3',
    workSummary: 'OT de integración E3',
  });

  const futureWindow = (daysAhead: number) => {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + daysAhead);
    start.setUTCHours(15, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const readOrder = async (orderId: string) =>
    TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT id, status, schedule_event_id, planned_window_start_at,
                  planned_window_end_at, assigned_technician_id, version
             FROM execution_orders
            WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenantId],
        )) as Array<Record<string, unknown>>;
        if (rows.length !== 1) throw new Error(`No se encontró la OT ${orderId}.`);
        return rows[0]!;
      }),
    );

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        ScheduleEvent,
        ScheduleRescheduleLog,
        VisitRequest,
        ExecutionOrder,
        ExecutionOrderActivity,
        ExecutionOrderItemUsage,
        ExecutionOrderStatusTransition,
        ExecutionOrderIdempotencyRecord,
        ExecutionOrderAuditIntent,
        ExecutionOrderOutboxEvent,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 4, min: 1 },
    });
    await dataSource.initialize();

    const tenants = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenants[0])
      throw new Error(`No existe el tenant de integración '${integrationTenantSlug}'.`);
    tenantId = tenants[0].id;
    schemaName = tenants[0].schema_name;
    actor.tenantId = tenantId;
    actor.schemaName = schemaName;

    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const columns = (await qr.query(
          `SELECT column_name, is_nullable
             FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = 'execution_orders'
              AND column_name IN ('schedule_event_id', 'planned_window_start_at', 'planned_window_end_at')`,
          [schemaName],
        )) as Array<{ column_name: string; is_nullable: string }>;
        if (columns.length !== 3)
          throw new Error('No se detectó el esquema E1 completo de execution_orders.');
        migration135AppliedBySuite = columns.some((column) => column.is_nullable !== 'YES');
        if (migration135AppliedBySuite)
          await new ExecutionOrderOriginIdentity1350000000000().up(qr);
      }),
    );

    const reliabilityService = new ExecutionOrderReliabilityService({
      getOrThrow: () => 'e3-integration-secret',
    } as never);
    executionOrders = new ExecutionOrdersService(
      dataSource,
      undefined,
      undefined,
      undefined,
      reliabilityService,
      undefined,
      undefined,
      undefined,
      { canSuperviseExecutionOrder: async () => true } as never,
    );
    scheduleEvents = new ScheduleEventsService(
      dataSource,
      { getTimezone: async () => 'UTC' } as never,
      {} as never,
      new ScheduleConflictService(dataSource),
      {} as never,
      executionOrders,
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        if (createdEventIds.length > 0) {
          await qr.query(
            'DELETE FROM schedule_reschedule_logs WHERE schedule_event_id = ANY($1::uuid[])',
            [createdEventIds],
          );
          await qr.query('DELETE FROM schedule_events WHERE id = ANY($1::uuid[])', [
            createdEventIds,
          ]);
        }
        if (createdOrderIds.length > 0) {
          await qr.query(
            'DELETE FROM execution_order_status_transitions WHERE execution_order_id = ANY($1::uuid[])',
            [createdOrderIds],
          );
          await qr.query(
            'DELETE FROM execution_order_outbox_events WHERE aggregate_id = ANY($1::uuid[])',
            [createdOrderIds],
          );
          await qr.manager.delete(ExecutionOrder, createdOrderIds);
        }
        if (migration135AppliedBySuite) {
          await new ExecutionOrderOriginIdentity1350000000000().down(qr);
        }
      }),
    );
    await dataSource.destroy();
  });

  it('CA-09/10/11: niega por conflicto y luego vincula, reagenda y propaga cancelación', async () => {
    const siteId = randomUUID();
    const technicianId = randomUUID();
    const originRefId = `E3-${randomUUID()}`;
    const order = await TenantContext.run(tenantContext(), () =>
      executionOrders.dispatchFromCoordination(buildDispatch(siteId, originRefId), actor),
    );
    createdOrderIds.push(order.id);
    expect(order.status).toBe(ExecutionOrderStatus.CREATED);

    const firstWindow = futureWindow(3);
    const conflictEvent = await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const event = qr.manager.create(ScheduleEvent, {
          tenantId,
          type: WfmWorkType.SUPPORT,
          status: ScheduleEventStatus.SCHEDULED,
          title: 'Bloqueo de agenda E3',
          description: null,
          scheduledStartAt: new Date(firstWindow.start),
          scheduledEndAt: new Date(firstWindow.end),
          assignedUserId: technicianId,
          assignedTeamId: null,
          organizationSiteId: siteId,
          address: null,
          municipality: null,
          sector: null,
          latitude: null,
          longitude: null,
          expedienteId: null,
          subscriberId: null,
          ticketId: null,
          contractId: null,
          workOrderId: null,
          executionOrderId: null,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        });
        return qr.manager.save(ScheduleEvent, event);
      }),
    );
    createdEventIds.push(conflictEvent.id);

    const conflict = await TenantContext.run(tenantContext(), () =>
      scheduleEvents
        .create(
          {
            type: WfmWorkType.SUPPORT,
            title: 'Vinculación conflictiva E3',
            scheduledStartAt: firstWindow.start,
            scheduledEndAt: firstWindow.end,
            assignedUserId: technicianId,
            organizationSiteId: siteId,
            executionOrderId: order.id,
          },
          actor,
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect(conflict).toBeInstanceOf(BadRequestException);
    expect(await readOrder(order.id)).toMatchObject({
      status: ExecutionOrderStatus.CREATED,
      schedule_event_id: null,
      planned_window_start_at: null,
      planned_window_end_at: null,
    });

    const scheduledWindow = futureWindow(5);
    const scheduleInput = {
      type: WfmWorkType.SUPPORT,
      title: 'Vinculación existente E3',
      scheduledStartAt: scheduledWindow.start,
      scheduledEndAt: scheduledWindow.end,
      assignedUserId: randomUUID(),
      organizationSiteId: siteId,
      latitude: 4.71123456,
      longitude: -74.0721,
      expedienteId: randomUUID(),
      subscriberId: randomUUID(),
      contractId: randomUUID(),
      ticketId: 'Ticket-E3-Case-Sensitive',
      executionOrderId: order.id,
    };
    const event = await TenantContext.run(tenantContext(), () =>
      scheduleEvents.create(scheduleInput, actor),
    );
    createdEventIds.push(event.id);
    expect(event.executionOrderId).toBe(order.id);
    const linked = await readOrder(order.id);
    expect(linked).toMatchObject({
      status: ExecutionOrderStatus.ASSIGNED,
      schedule_event_id: event.id,
      assigned_technician_id: event.assignedUserId,
    });
    expect(new Date(String(linked['planned_window_start_at'])).toISOString()).toBe(
      scheduledWindow.start,
    );

    const replay = await TenantContext.run(tenantContext(), () =>
      scheduleEvents.create(
        {
          ...scheduleInput,
          assignedUserId: scheduleInput.assignedUserId.toUpperCase(),
          organizationSiteId: scheduleInput.organizationSiteId.toUpperCase(),
          expedienteId: scheduleInput.expedienteId.toUpperCase(),
          subscriberId: scheduleInput.subscriberId.toUpperCase(),
          contractId: scheduleInput.contractId.toUpperCase(),
          executionOrderId: scheduleInput.executionOrderId.toUpperCase(),
        },
        actor,
      ),
    );
    expect(replay.id).toBe(event.id);
    const linkedEventRows = (await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) =>
        qr.query(
          'SELECT COUNT(*)::int AS total FROM schedule_events WHERE execution_order_id = $1',
          [order.id],
        ),
      ),
    )) as Array<{ total: number }>;
    expect(linkedEventRows[0]?.total).toBe(1);

    const differentWindow = futureWindow(8);
    const changedPayloadError = await TenantContext.run(tenantContext(), () =>
      scheduleEvents
        .create(
          {
            ...scheduleInput,
            title: 'Mismo id con payload distinto E3',
            scheduledStartAt: differentWindow.start,
            scheduledEndAt: differentWindow.end,
          },
          actor,
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect(changedPayloadError).toBeInstanceOf(ConflictException);
    expect((changedPayloadError as ConflictException).getResponse()).toMatchObject({
      code: 'EXECUTION_ORDER_ALREADY_SCHEDULED',
    });
    const eventsAfterChangedPayload = (await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) =>
        qr.query(
          'SELECT COUNT(*)::int AS total FROM schedule_events WHERE execution_order_id = $1',
          [order.id],
        ),
      ),
    )) as Array<{ total: number }>;
    expect(eventsAfterChangedPayload[0]?.total).toBe(1);
    expect((await readOrder(order.id))['schedule_event_id']).toBe(event.id);

    const movedWindow = futureWindow(7);
    await TenantContext.run(tenantContext(), () =>
      scheduleEvents.reschedule(
        event.id,
        {
          scheduledStartAt: movedWindow.start,
          scheduledEndAt: movedWindow.end,
          reason: 'Cambio de disponibilidad',
        },
        actor,
      ),
    );
    const rescheduled = await readOrder(order.id);
    expect(new Date(String(rescheduled['planned_window_start_at'])).toISOString()).toBe(
      movedWindow.start,
    );
    expect(new Date(String(rescheduled['planned_window_end_at'])).toISOString()).toBe(
      movedWindow.end,
    );

    await TenantContext.run(tenantContext(), () => scheduleEvents.cancel(event.id, actor));
    expect(await readOrder(order.id)).toMatchObject({ status: ExecutionOrderStatus.CANCELLED });

    const originRows = (await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) =>
        qr.query(
          `SELECT COUNT(*)::int AS total FROM execution_orders
            WHERE tenant_id = $1 AND origin_context = $2 AND origin_ref_id = $3`,
          [tenantId, WorkOrderSourceContext.MANUAL, originRefId],
        ),
      ),
    )) as Array<{ total: number }>;
    expect(originRows[0]?.total).toBe(1);
  });
});
