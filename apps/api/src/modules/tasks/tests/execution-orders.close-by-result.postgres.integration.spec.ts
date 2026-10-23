import { createHmac, randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import {
  dataSourceOptions,
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderAuditIntent,
  ExecutionOrderEvidence,
  ExecutionOrderIdempotencyRecord,
  ExecutionOrderItemUsage,
  ExecutionOrderOutboxEvent,
  ExecutionOrderStatusTransition,
  ExecutionOrderTemplate,
  ExecutionOrderTemplateRequirement,
  ExecutionOrderTemplateVersion,
  OperationalTask,
  TaskTimelineEvent,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  InventoryDisposition,
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskType,
  UserRole,
  WfmWorkType,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ClosureGateEvaluatorService } from '../services/closure-gate-evaluator.service';
import { ExecutionOrderReliabilityService } from '../services/execution-order-reliability.service';
import { ExecutionOrderTemplatesService } from '../services/execution-order-templates.service';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import { TaskTimelineService } from '../services/task-timeline.service';
import { TasksService } from '../services/tasks.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;
const idempotencySecret = 'mod11-close-by-result-integration-only';

if (dbAvailable && !integrationTenantSlug) {
  console.warn(
    '[MOD11-close-by-result] Suite omitida: defina E2E_TENANT_SLUG para seleccionar un tenant de pruebas.',
  );
}

describeWithDb('Execution Orders — cierre por resultado PostgreSQL real', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let templatesService: ExecutionOrderTemplatesService;
  let executionOrdersService: ExecutionOrdersService;
  const createdOrderIds: string[] = [];
  const createdTaskIds: string[] = [];

  const tenantContext = () => ({
    tenantId,
    schemaName,
    tenantSlug: integrationTenantSlug!,
  });

  const actor: JwtPayload = {
    sub: '00000000-0000-4000-8000-000000000991',
    email: 'mod11-close-result@example.test',
    role: UserRole.NOC,
    tenantId: '',
    schemaName: '',
    jti: '00000000-0000-4000-8000-000000000992',
    type: 'tenant',
  };

  beforeAll(async () => {
    if (integrationTenantSlug === 'tenant_iwana') {
      throw new Error('La integración MOD11 requiere E2E_TENANT_SLUG de pruebas.');
    }

    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        ExecutionOrder,
        ExecutionOrderActivity,
        ExecutionOrderAuditIntent,
        ExecutionOrderEvidence,
        ExecutionOrderIdempotencyRecord,
        ExecutionOrderItemUsage,
        ExecutionOrderOutboxEvent,
        ExecutionOrderStatusTransition,
        ExecutionOrderTemplate,
        ExecutionOrderTemplateRequirement,
        ExecutionOrderTemplateVersion,
        OperationalTask,
        TaskTimelineEvent,
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
    if (!tenants[0]) {
      throw new Error('No existe el tenant indicado para integración MOD11.');
    }

    tenantId = tenants[0].id;
    schemaName = tenants[0].schema_name;
    actor.tenantId = tenantId;
    actor.schemaName = schemaName;

    templatesService = new ExecutionOrderTemplatesService(dataSource);
    const tasksService = new TasksService(
      dataSource,
      new TaskTimelineService(dataSource),
      undefined as never,
    );
    const reliabilityService = new ExecutionOrderReliabilityService({
      getOrThrow: () => idempotencySecret,
    } as never);
    executionOrdersService = new ExecutionOrdersService(
      dataSource,
      undefined,
      tasksService,
      undefined,
      reliabilityService,
      templatesService,
      new ClosureGateEvaluatorService(),
      undefined,
      undefined,
      undefined,
      { getGateStatus: jest.fn().mockResolvedValue({ enforced: false, status: null }) } as never,
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (tenantId && schemaName) {
      await TenantContext.run(tenantContext(), () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          if (createdOrderIds.length > 0) {
            const intents = (await qr.query(
              `SELECT DISTINCT payload->>'intentId' AS intent
                 FROM execution_order_outbox_events
                WHERE tenant_id = $1 AND aggregate_id = ANY($2::uuid[])
                  AND payload->>'intentId' IS NOT NULL`,
              [tenantId, createdOrderIds],
            )) as Array<{ intent: string }>;
            const intentIds = intents.map((row) => row.intent).filter(Boolean);
            if (intentIds.length > 0) {
              await qr.query(
                'DELETE FROM execution_order_audit_intents WHERE tenant_id = $1 AND intent_id = ANY($2)',
                [tenantId, intentIds],
              );
              await qr.query(
                'DELETE FROM execution_order_idempotency_records WHERE tenant_id = $1 AND intent_id = ANY($2)',
                [tenantId, intentIds],
              );
            }
            await qr.query(
              `DELETE FROM execution_order_item_usage_reversals
                WHERE tenant_id = $1 AND execution_order_id = ANY($2::uuid[])`,
              [tenantId, createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_status_transitions WHERE tenant_id = $1 AND execution_order_id = ANY($2::uuid[])',
              [tenantId, createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_item_usage WHERE tenant_id = $1 AND execution_order_id = ANY($2::uuid[])',
              [tenantId, createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_evidence WHERE tenant_id = $1 AND execution_order_id = ANY($2::uuid[])',
              [tenantId, createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_activities WHERE tenant_id = $1 AND execution_order_id = ANY($2::uuid[])',
              [tenantId, createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_outbox_events WHERE tenant_id = $1 AND aggregate_id = ANY($2::uuid[])',
              [tenantId, createdOrderIds],
            );
            await qr.manager.delete(ExecutionOrder, { id: In(createdOrderIds), tenantId });
          }
          if (createdTaskIds.length > 0) {
            await qr.query(
              'DELETE FROM task_timeline_events WHERE tenant_id = $1 AND task_id = ANY($2::uuid[])',
              [tenantId, createdTaskIds],
            );
            await qr.manager.delete(OperationalTask, { id: In(createdTaskIds), tenantId });
          }
        }),
      );
    }
    await dataSource.destroy();
  });

  const createStartedInstallation = async (): Promise<{
    order: ExecutionOrder;
    taskId: string;
  }> => {
    const taskId = randomUUID();
    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const task = qr.manager.create(OperationalTask, {
          id: taskId,
          tenantId,
          taskNumber: `MOD11-RESULT-${taskId.slice(0, 8)}`,
          type: TaskType.INSTALLATION,
          status: TaskStatus.BLOCKED,
          priority: TaskPriority.NORMAL,
          title: 'Tarea sintética para cierre MOD11',
          description: null,
          originContext: TaskOriginContext.MANUAL,
          originRefId: null,
          ticketId: null,
          responsibleType: TaskResponsibleType.USER,
          responsibleRefId: actor.sub,
          recipientType: TaskRecipientType.SUBSCRIBER,
          recipientRefId: null,
          recipientLabel: null,
          queueName: null,
          executionMode: TaskExecutionMode.FIELD_SERVICE,
          dueAt: null,
          scheduledRequired: false,
          scheduleEventId: null,
          workOrderId: null,
          createdByUserId: actor.sub,
          resolvedAt: null,
          closedAt: null,
        });
        await qr.manager.save(OperationalTask, task);
      }),
    );
    createdTaskIds.push(taskId);

    const order = await TenantContext.run(tenantContext(), async () => {
      const activeVersion = await templatesService.getActiveVersionForWorkType(
        WfmWorkType.INSTALLATION,
      );
      if (
        !activeVersion ||
        activeVersion.templateKey !== 'INSTALACION_ESTANDAR' ||
        activeVersion.version !== 3
      ) {
        throw new Error('El tenant de pruebas no tiene INSTALACION_ESTANDAR v3 publicada.');
      }

      return executionOrdersService.createFromScheduling(
        {
          scheduleEventId: randomUUID(),
          assignedTechnicianId: null,
          assignedCrewId: null,
          originContext: 'MOD11_CLOSE_RESULT_TEST',
          originRefId: `close-result-${randomUUID()}`,
          taskId,
          organizationSiteId: randomUUID(),
          customerDisplayLabel: 'Cliente de prueba MOD11',
          workType: WfmWorkType.INSTALLATION,
          workSummary: 'Instalación de prueba para cierre por resultado',
          plannedWindowStartAt: new Date(Date.now() + 60_000).toISOString(),
          plannedWindowEndAt: new Date(Date.now() + 3_660_000).toISOString(),
        },
        actor,
      );
    });
    createdOrderIds.push(order.id);
    await TenantContext.run(tenantContext(), () =>
      executionOrdersService.start(order.id, {}, actor),
    );
    return { order, taskId };
  };

  const closeNotExecuted = (orderId: string, reasonCode = 'CUSTOMER_UNAVAILABLE') =>
    TenantContext.run(tenantContext(), () =>
      executionOrdersService.close(
        orderId,
        {
          result: ExecutionOrderResult.NOT_EXECUTED,
          reasonCode,
          summary: 'No fue posible realizar la instalación.',
        },
        actor,
      ),
    );

  it('cierra como NOT_EXECUTED una instalación v3 sin CPE ni evidencias y deja su tarea READY', async () => {
    const { order, taskId } = await createStartedInstallation();
    expect(order.templateKey).toBe('INSTALACION_ESTANDAR');
    expect(order.templateVersionNumber).toBe(3);

    const beforeCloseCounts = await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const usage = (await qr.query(
          'SELECT COUNT(*)::integer AS count FROM execution_order_item_usage WHERE tenant_id = $1 AND execution_order_id = $2',
          [tenantId, order.id],
        )) as Array<{ count: number }>;
        const evidence = (await qr.query(
          'SELECT COUNT(*)::integer AS count FROM execution_order_evidence WHERE tenant_id = $1 AND execution_order_id = $2',
          [tenantId, order.id],
        )) as Array<{ count: number }>;
        return { usage: usage[0]?.count, evidence: evidence[0]?.count };
      }),
    );
    expect(beforeCloseCounts).toEqual({ usage: 0, evidence: 0 });

    const closed = await closeNotExecuted(order.id);
    expect(closed.status).toBe(ExecutionOrderStatus.NOT_EXECUTED);
    expect(closed.result).toBe(ExecutionOrderResult.NOT_EXECUTED);
    const transitions = await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.manager.find(ExecutionOrderStatusTransition, {
          where: { executionOrderId: order.id, tenantId },
          order: { changedAt: 'ASC' },
        }),
      ),
    );
    expect(transitions.map((transition) => transition.toStatus)).toEqual([
      ExecutionOrderStatus.IN_PROGRESS,
      ExecutionOrderStatus.NOT_EXECUTED,
    ]);
    const task = await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.manager.findOne(OperationalTask, { where: { id: taskId, tenantId } }),
      ),
    );
    expect(task?.status).toBe(TaskStatus.READY);
  });

  it('rechaza NOT_EXECUTED sin causa antes de cambiar la orden o crear un recibo', async () => {
    const { order, taskId } = await createStartedInstallation();
    const idempotencyKey = `mod11-no-reason-${randomUUID()}`;
    const keyHmac = createHmac('sha256', idempotencySecret)
      .update(idempotencyKey, 'utf8')
      .digest('hex');

    await expect(
      TenantContext.run(tenantContext(), () =>
        executionOrdersService.close(
          order.id,
          { result: ExecutionOrderResult.NOT_EXECUTED, summary: 'Cierre sin causa' },
          actor,
          {
            idempotencyKey,
            correlationId: randomUUID(),
            requireIdempotency: true,
            requireIfMatch: false,
          },
        ),
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CLOSE_NOT_EXECUTED_REASON_REQUIRED',
        message: 'Elige una causa para cerrar como no ejecutada.',
      },
    });

    const unchanged = await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => ({
        order: await qr.manager.findOne(ExecutionOrder, { where: { id: order.id, tenantId } }),
        task: await qr.manager.findOne(OperationalTask, { where: { id: taskId, tenantId } }),
        receipt: await qr.manager.findOne(ExecutionOrderIdempotencyRecord, {
          where: { tenantId, operation: 'execution_order.close', keyHmac },
        }),
      })),
    );
    expect(unchanged.order).toMatchObject({
      status: ExecutionOrderStatus.IN_PROGRESS,
      result: null,
      version: order.version + 1,
    });
    expect(unchanged.task?.status).toBe(TaskStatus.BLOCKED);
    expect(unchanged.receipt).toBeNull();
  });

  it('rechaza equipo vigente y permite el cierre después de confirmar su reverso', async () => {
    const { order } = await createStartedInstallation();
    const usage = await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const entity = qr.manager.create(ExecutionOrderItemUsage, {
          executionOrderId: order.id,
          tenantId,
          itemId: `MOD11-RESULT-CPE-${randomUUID()}`,
          requirementKey: 'installed-equipment',
          technicianCustodyId: actor.sub,
          quantity: 1,
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          stockMovementId: null,
          inventoryRequestId: null,
          movementStatus: null,
          rejectionReasonCode: null,
          lastRequestedAt: null,
          requestAttempts: 1,
          actorUserId: actor.sub,
        });
        return qr.manager.save(ExecutionOrderItemUsage, entity);
      }),
    );

    await expect(closeNotExecuted(order.id, 'PARTIAL_EXECUTION')).rejects.toMatchObject({
      response: {
        code: 'CLOSE_NOT_EXECUTED_HAS_INSTALLED_EQUIPMENT',
        message:
          'Hay equipos registrados como instalados en el cliente. Revierte esos consumos antes de cerrar como no ejecutada.',
      },
    });

    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `INSERT INTO execution_order_item_usage_reversals (
             id, tenant_id, execution_order_id, item_usage_id, reversal_request_id,
             reason, requested_by, status, decided_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED', NOW())`,
          [
            randomUUID(),
            tenantId,
            order.id,
            usage.id,
            randomUUID(),
            'Reverso confirmado para la prueba de cierre.',
            actor.sub,
          ],
        ),
      ),
    );

    const closed = await closeNotExecuted(order.id, 'PARTIAL_EXECUTION');
    expect(closed.status).toBe(ExecutionOrderStatus.NOT_EXECUTED);
  });

  it('mantiene el gate de EXECUTED cuando faltan equipo y evidencias', async () => {
    const { order } = await createStartedInstallation();
    await expect(
      TenantContext.run(tenantContext(), () =>
        executionOrdersService.close(
          order.id,
          { result: ExecutionOrderResult.EXECUTED, summary: 'Intento ejecutado sin evidencias' },
          actor,
        ),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLOSURE_GATE_INCOMPLETE',
        missingRequirements: expect.arrayContaining([
          'Equipos instalados en el sitio del cliente',
          'Prueba de servicio en el sitio',
          'Fotos del trabajo realizado',
          'Acta de conformidad firmada por el cliente',
        ]),
      }),
    });
  });
});
