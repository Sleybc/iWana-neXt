import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  dataSourceOptions,
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderAuditIntent,
  ExecutionOrderIdempotencyRecord,
  ExecutionOrderItemUsage,
  ExecutionOrderOutboxEvent,
  ExecutionOrderStatusTransition,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  ExecutionOrderItemAction,
  InventoryDisposition,
  UserRole,
  WfmWorkType,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderReliabilityService } from '../services/execution-order-reliability.service';
import { ExecutionOrdersService } from '../services/execution-orders.service';

const SYNTHETIC_DB = 'i4_qa_20261006_a1';
const syntheticDbAvailable =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' &&
  process.env['DB_NAME'] === SYNTHETIC_DB;
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = syntheticDbAvailable && integrationTenantSlug ? describe : describe.skip;

const buildActor = (sub: string, tenantId: string, schemaName: string): JwtPayload => ({
  sub,
  email: 'actor-projection@example.test',
  role: UserRole.TECHNICIAN,
  tenantId,
  schemaName,
  jti: randomUUID(),
  type: 'tenant',
});

describeWithDb('Execution order usage projection — PostgreSQL sintético', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let service: ExecutionOrdersService;
  const createdOrderIds: string[] = [];
  const createdIntentIds: string[] = [];

  const tenantContext = () => ({
    tenantId,
    schemaName,
    tenantSlug: integrationTenantSlug!,
  });

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== SYNTHETIC_DB) {
      throw new Error('La prueba exige la base sintética i4_qa_20261006_a1.');
    }
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
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
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();

    const tenant = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenant[0] || !tenant[0].schema_name.startsWith('tenant_i4_qa_')) {
      throw new Error('El tenant de integración no pertenece al esquema sintético permitido.');
    }
    tenantId = tenant[0].id;
    schemaName = tenant[0].schema_name;

    const reliabilityService = new ExecutionOrderReliabilityService({
      getOrThrow: () => 'projection-integration-secret',
    } as never);
    service = new ExecutionOrdersService(
      dataSource,
      undefined,
      undefined,
      undefined,
      reliabilityService,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized && createdOrderIds.length > 0) {
      await TenantContext.run(tenantContext(), () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          await qr.query(
            'DELETE FROM execution_order_item_usage WHERE execution_order_id = ANY($1::uuid[])',
            [createdOrderIds],
          );
          await qr.query(
            'DELETE FROM execution_order_activities WHERE execution_order_id = ANY($1::uuid[])',
            [createdOrderIds],
          );
          await qr.query(
            'DELETE FROM execution_order_status_transitions WHERE execution_order_id = ANY($1::uuid[])',
            [createdOrderIds],
          );
          await qr.query(
            'DELETE FROM execution_order_outbox_events WHERE aggregate_id = ANY($1::uuid[])',
            [createdOrderIds],
          );
          if (createdIntentIds.length > 0) {
            await qr.query(
              'DELETE FROM execution_order_audit_intents WHERE intent_id = ANY($1::uuid[])',
              [createdIntentIds],
            );
            await qr.query(
              'DELETE FROM execution_order_idempotency_records WHERE intent_id = ANY($1::uuid[])',
              [createdIntentIds],
            );
          }
          await qr.manager.delete(ExecutionOrder, createdOrderIds);
        }),
      );
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('listItemUsage devuelve rejectionReasonCode leído desde PostgreSQL', async () => {
    const technicianId = randomUUID();
    const actor = buildActor(technicianId, tenantId, schemaName);
    const created = await TenantContext.run(tenantContext(), () =>
      service.createFromScheduling(
        {
          scheduleEventId: randomUUID(),
          assignedTechnicianId: technicianId,
          assignedCrewId: null,
          originContext: 'R-CA04-PROJECTION',
          originRefId: `projection-${randomUUID()}`,
          customerDisplayLabel: 'Cliente de prueba',
          workType: WfmWorkType.INSTALLATION,
          workSummary: 'Prueba de proyección del rechazo',
          plannedWindowStartAt: '2030-02-01T10:00:00.000Z',
          plannedWindowEndAt: '2030-02-01T11:00:00.000Z',
        },
        actor,
      ),
    );
    createdOrderIds.push(created.id);

    await TenantContext.run(tenantContext(), () => service.start(created.id, {}, actor));
    const usage = await TenantContext.run(tenantContext(), () =>
      service.registerItemUsage(
        created.id,
        {
          itemId: 'i4-projection-item',
          technicianCustodyId: technicianId,
          quantity: 1,
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        },
        actor,
        { idempotencyKey: `projection-${randomUUID()}`, correlationId: randomUUID() },
      ),
    );
    createdIntentIds.push(usage.inventoryRequestId!);

    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `UPDATE execution_order_item_usage
              SET movement_status = 'REJECTED', rejection_reason_code = 'SUBSCRIBER_REQUIRED'
            WHERE id = $1 AND tenant_id = $2`,
          [usage.id, tenantId],
        );
      }),
    );

    const result = await TenantContext.run(tenantContext(), () =>
      service.listItemUsage(created.id, { page: 1, limit: 10 }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: usage.id,
      movementStatus: 'REJECTED',
      rejectionReasonCode: 'SUBSCRIBER_REQUIRED',
    });
  });
});
