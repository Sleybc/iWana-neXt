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
  ExecutionOrderStatus,
  InventoryDisposition,
  UserRole,
  WfmWorkType,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderReliabilityService } from '../services/execution-order-reliability.service';
import {
  ExecutionOrdersService,
  type CreateExecutionOrderFromSchedulingInput,
} from '../services/execution-orders.service';

/**
 * MOD11 T0 (CA-01 / CA-02) — contra PostgreSQL real, camino `createQueryBuilder`.
 *
 * El defecto: `assign()` mutaba `assignedTechnicianId` en memoria y el UPDATE
 * de `persistOrderOptimistically` no escribía esa columna. La respuesta 200
 * mostraba el técnico nuevo mientras la base conservaba el anterior, y como
 * el control de acceso lee la base, el reasignado no podía operar.
 *
 * Estos tests NO validan el objeto devuelto (ese ya mentía en verde): releen
 * la fila desde la base con SQL crudo y ejercitan la decisión real de acceso.
 * Un mock con `manager.save()` no distingue ambos caminos y reproduce el
 * falso verde que ocultó el defecto — por eso esta suite exige base real.
 */

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

if (dbAvailable && !integrationTenantSlug) {
  console.warn(
    '[T0-integration] Suite omitida: defina E2E_TENANT_SLUG para seleccionar un tenant real.',
  );
}

// UUID fijos de prueba (sin PII): técnico original, técnico reasignado y supervisor.
const OLD_TECHNICIAN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_TECHNICIAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const buildActor = (
  sub: string,
  role: UserRole,
  tenantId: string,
  schemaName: string,
): JwtPayload => ({
  sub,
  email: 'actor-t0@example.test',
  role,
  tenantId,
  schemaName,
  jti: randomUUID(),
  type: 'tenant',
});

const buildCreateInput = (
  assignedTechnicianId: string,
): CreateExecutionOrderFromSchedulingInput => ({
  scheduleEventId: randomUUID(),
  assignedTechnicianId,
  assignedCrewId: null,
  originContext: 'T0-INTEGRATION',
  originRefId: `t0-${Date.now()}`,
  customerDisplayLabel: 'Cliente de prueba T0',
  workType: WfmWorkType.INSTALLATION,
  workSummary: 'OT de prueba para persistencia de asignacion',
  plannedWindowStartAt: '2030-02-01T10:00:00.000Z',
  plannedWindowEndAt: '2030-02-01T11:00:00.000Z',
});

describeWithDb('Execution Orders T0 — assign() persiste contra PostgreSQL real', () => {
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

  const readOrderRow = async (
    orderId: string,
  ): Promise<{
    assigned_technician_id: string | null;
    assigned_crew_id: string | null;
    status: string;
    version: number;
    started_at: Date | null;
    result: string | null;
    close_notes: string | null;
  }> =>
    TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT assigned_technician_id, assigned_crew_id, status, version,
                  started_at, result, close_notes
             FROM execution_orders
            WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenantId],
        )) as Array<{
          assigned_technician_id: string | null;
          assigned_crew_id: string | null;
          status: string;
          version: number;
          started_at: Date | null;
          result: string | null;
          close_notes: string | null;
        }>;
        if (rows.length !== 1) {
          throw new Error(`Se esperaba exactamente una fila para la OT ${orderId}.`);
        }
        return rows[0]!;
      }),
    );

  beforeAll(async () => {
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
      extra: { ...dataSourceOptions.extra, max: 4, min: 1 },
    });
    await dataSource.initialize();

    const tenantSlug = integrationTenantSlug!;
    const tenant = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [tenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenant[0]) {
      throw new Error(`No existe el tenant de integración '${tenantSlug}'.`);
    }

    tenantId = tenant[0].id;
    schemaName = tenant[0].schema_name;
    // Reliability real: el registro de consumos exige contexto de idempotencia
    // en base real (`inventory_request_id` es uuid y el recibo aporta el
    // intentId). Es el mismo camino que usan los llamadores de producción.
    const reliabilityService = new ExecutionOrderReliabilityService({
      getOrThrow: () => 't0-integration-secret',
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
      await dataSource.destroy();
    } else if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('CA-01: tras assign(), la base contiene el técnico nuevo (no solo la respuesta)', async () => {
    const supervisor = buildActor(randomUUID(), UserRole.NOC, tenantId, schemaName);

    const created = await TenantContext.run(tenantContext(), () =>
      service.createFromScheduling(buildCreateInput(OLD_TECHNICIAN_ID), supervisor),
    );
    createdOrderIds.push(created.id);
    const versionBefore = created.version;

    const response = await TenantContext.run(tenantContext(), () =>
      service.assign(
        created.id,
        { assigneeType: 'TECHNICIAN', assigneeId: NEW_TECHNICIAN_ID },
        supervisor,
      ),
    );

    // La respuesta ya mostraba el técnico nuevo antes del fix: no es criterio.
    expect(response.assignedTechnicianId).toBe(NEW_TECHNICIAN_ID);

    // El criterio es la fila en base, leída con SQL crudo (camino real).
    const row = await readOrderRow(created.id);
    expect(row.assigned_technician_id).toBe(NEW_TECHNICIAN_ID);
    expect(row.status).toBe(ExecutionOrderStatus.ASSIGNED);
    expect(row.version).toBe(versionBefore + 1);
    // Sin mutaciones colaterales: el comando solo declara técnico + estado.
    expect(row.started_at).toBeNull();
    expect(row.result).toBeNull();
    expect(row.close_notes).toBeNull();
  });

  it('CA-02: el reasignado puede iniciar y registrar consumos; el anterior no', async () => {
    const supervisor = buildActor(randomUUID(), UserRole.NOC, tenantId, schemaName);
    const newTech = buildActor(NEW_TECHNICIAN_ID, UserRole.TECHNICIAN, tenantId, schemaName);
    const oldTech = buildActor(OLD_TECHNICIAN_ID, UserRole.TECHNICIAN, tenantId, schemaName);

    const created = await TenantContext.run(tenantContext(), () =>
      service.createFromScheduling(buildCreateInput(OLD_TECHNICIAN_ID), supervisor),
    );
    createdOrderIds.push(created.id);

    await TenantContext.run(tenantContext(), () =>
      service.assign(
        created.id,
        { assigneeType: 'TECHNICIAN', assigneeId: NEW_TECHNICIAN_ID },
        supervisor,
      ),
    );

    // Decisión real de acceso (la que aplica el guard en start/consumos):
    // el reasignado pasa la ejecución técnica, el anterior es 404.
    await expect(
      TenantContext.run(tenantContext(), () =>
        service.assertActorAccess(created.id, newTech, true, true),
      ),
    ).resolves.toBeUndefined();
    await expect(
      TenantContext.run(tenantContext(), () =>
        service.assertActorAccess(created.id, oldTech, true, true),
      ),
    ).rejects.toMatchObject({ status: 404 });

    // El reasignado inicia de verdad y el estado queda en base.
    await TenantContext.run(tenantContext(), () => service.start(created.id, {}, newTech));
    const afterStart = await readOrderRow(created.id);
    expect(afterStart.status).toBe(ExecutionOrderStatus.IN_PROGRESS);
    expect(afterStart.assigned_technician_id).toBe(NEW_TECHNICIAN_ID);

    // El reasignado registra un consumo desde su custodia, con el contexto
    // de idempotencia que usan los llamadores reales.
    const usage = await TenantContext.run(tenantContext(), () =>
      service.registerItemUsage(
        created.id,
        {
          itemId: 'item-t0-001',
          technicianCustodyId: NEW_TECHNICIAN_ID,
          quantity: 1,
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        },
        newTech,
        { idempotencyKey: `t0-uso-nuevo-${randomUUID()}`, correlationId: randomUUID() },
      ),
    );
    expect(usage.itemId).toBe('item-t0-001');
    if (usage.inventoryRequestId) {
      createdIntentIds.push(usage.inventoryRequestId);
    }

    // El anterior no puede registrar consumos: la custodia ya no es suya.
    // Sin contexto de idempotencia para no dejar filas colaterales: el
    // rechazo ocurre en la validación de custodia, antes de persistir nada.
    await expect(
      TenantContext.run(tenantContext(), () =>
        service.registerItemUsage(
          created.id,
          {
            itemId: 'item-t0-002',
            technicianCustodyId: OLD_TECHNICIAN_ID,
            quantity: 1,
            action: ExecutionOrderItemAction.INSTALL,
            finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          },
          oldTech,
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
