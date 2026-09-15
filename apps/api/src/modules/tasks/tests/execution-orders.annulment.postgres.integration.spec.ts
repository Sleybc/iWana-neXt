import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  dataSourceOptions,
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderAuditIntent,
  ExecutionOrderIdempotencyRecord,
  ExecutionOrderItemUsage,
  ExecutionOrderOriginIdentity1350000000000,
  ExecutionOrderAnnulmentFlag1360000000000,
  ExecutionOrderOutboxEvent,
  ExecutionOrderStatusTransition,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { ExecutionOrderStatus, UserRole, WfmWorkType, WorkOrderSourceContext } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderReliabilityService } from '../services/execution-order-reliability.service';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import type { DispatchExecutionOrderInput } from '../dto/execution-orders.dto';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

if (dbAvailable && !integrationTenantSlug) {
  console.warn(
    '[T2-integration] Suite omitida: defina E2E_TENANT_SLUG para seleccionar un tenant real.',
  );
}

/**
 * MOD11 T2 — anulación contra PostgreSQL real: el caso que motivó el tramo.
 *
 * Una OT despachada sin cita se anula y tras anularla su origen queda libre:
 * el despacho legítimo del mismo origen funciona. La purga de retención se
 * verifica en el spec aislado de la 136 (paquete db); aquí se prueba el
 * comportamiento del servicio contra base real, con ida y vuelta de la 135
 * y la 136 (la 134 del tenant no se toca).
 */
describeWithDb('Execution Orders T2 — anulación contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let service: ExecutionOrdersService;
  const createdOrderIds: string[] = [];

  const tenantContext = () => ({
    tenantId,
    schemaName,
    tenantSlug: integrationTenantSlug!,
  });

  const supervisor: JwtPayload = {
    sub: '00000000-0000-4000-8000-000000000021',
    email: 't2-test@example.test',
    role: UserRole.NOC,
    tenantId: '',
    schemaName: '',
    jti: '00000000-0000-4000-8000-000000000022',
    type: 'tenant',
  };

  const buildDispatch = (overrides: Partial<DispatchExecutionOrderInput> = {}) => ({
    originContext: WorkOrderSourceContext.ASSURANCE,
    originRefId: `T2-ANNUL-${Date.now()}`,
    workType: WfmWorkType.SUPPORT,
    organizationSiteId: randomUUID(),
    customerDisplayLabel: 'Cliente de prueba T2',
    workSummary: 'Soporte despachado para anular T2',
    ...overrides,
  });

  const readAnnulRow = async (orderId: string) =>
    TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT status, is_annulled, close_notes, closed_at, result
             FROM execution_orders
            WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenantId],
        )) as Array<Record<string, unknown>>;
        if (rows.length !== 1) {
          throw new Error(`Se esperaba exactamente una fila para la OT ${orderId}.`);
        }
        return rows[0]!;
      }),
    );

  const readOutboxTypes = async (orderId: string): Promise<string[]> =>
    TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT event_type FROM execution_order_outbox_events
            WHERE aggregate_id = $1 AND tenant_id = $2`,
          [orderId, tenantId],
        )) as Array<{ event_type: string }>;
        return rows.map((r) => r.event_type);
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

    const tenant = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenant[0]) {
      throw new Error(`No existe el tenant de integración '${integrationTenantSlug}'.`);
    }
    tenantId = tenant[0].id;
    schemaName = tenant[0].schema_name;
    supervisor.tenantId = tenantId;
    supervisor.schemaName = schemaName;

    const reliabilityService = new ExecutionOrderReliabilityService({
      getOrThrow: () => 't2-integration-secret',
    } as never);
    const scopePort = {
      canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true),
    };
    service = new ExecutionOrdersService(
      dataSource,
      undefined,
      undefined,
      undefined,
      reliabilityService,
      undefined,
      undefined,
      undefined,
      scopePort as never,
    );

    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await new ExecutionOrderOriginIdentity1350000000000().up(qr);
        await new ExecutionOrderAnnulmentFlag1360000000000().up(qr);
      }),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await TenantContext.run(tenantContext(), () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          if (createdOrderIds.length > 0) {
            // Los intents viajan en el payload del outbox: con ellos se
            // limpian idempotencia y auditoría sin tocar filas ajenas.
            const intents = (await qr.query(
              `SELECT DISTINCT payload->>'intentId' AS intent
                 FROM execution_order_outbox_events
                WHERE aggregate_id = ANY($1::uuid[]) AND payload->>'intentId' IS NOT NULL`,
              [createdOrderIds],
            )) as Array<{ intent: string }>;
            const intentIds = intents.map((r) => r.intent).filter(Boolean);
            if (intentIds.length > 0) {
              await qr.query(
                `DELETE FROM execution_order_audit_intents WHERE intent_id = ANY($1)`,
                [intentIds],
              );
              await qr.query(
                `DELETE FROM execution_order_idempotency_records WHERE intent_id = ANY($1)`,
                [intentIds],
              );
            }
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
          // Orden inverso: la 136 declara su límite ante anuladas, pero la
          // limpieza anterior ya las eliminó; luego la 135.
          await new ExecutionOrderAnnulmentFlag1360000000000().down(qr);
          await new ExecutionOrderOriginIdentity1350000000000().down(qr);
        }),
      );
      await dataSource.destroy();
    }
  });

  it('anular una OT despachada libera su origen: el despacho legítimo funciona', async () => {
    const originRef = `T2-ORIGEN-${Date.now()}`;
    const dispatched = await TenantContext.run(tenantContext(), () =>
      service.dispatchFromCoordination(
        buildDispatch({ originRefId: originRef }) as DispatchExecutionOrderInput,
        supervisor,
      ),
    );
    createdOrderIds.push(dispatched.id);
    expect(dispatched.status).toBe(ExecutionOrderStatus.CREATED);

    await TenantContext.run(tenantContext(), () =>
      service.annul(
        dispatched.id,
        { reason: 'Despacho duplicado por error de captura' },
        supervisor,
        {
          idempotencyKey: `t2-annul-${Date.now()}`,
          correlationId: randomUUID(),
          requireIdempotency: false,
          requireIfMatch: false,
        },
      ),
    );

    const row = await readAnnulRow(dispatched.id);
    expect(row['status']).toBe(ExecutionOrderStatus.CANCELLED);
    expect(row['is_annulled']).toBe(true);
    expect(row['close_notes']).toBe('Despacho duplicado por error de captura');
    expect(row['closed_at']).not.toBeNull();
    expect(row['result']).toBeNull();

    // Hecho de dominio emitido por el camino de comandos.
    expect(await readOutboxTypes(dispatched.id)).toContain('ExecutionOrderAnnulledV1');

    // El origen queda libre: el despacho legítimo del mismo origen funciona.
    const legitimate = await TenantContext.run(tenantContext(), () =>
      service.dispatchFromCoordination(
        buildDispatch({ originRefId: originRef }) as DispatchExecutionOrderInput,
        supervisor,
      ),
    );
    createdOrderIds.push(legitimate.id);
    expect(legitimate.id).not.toBe(dispatched.id);
    expect(legitimate.status).toBe(ExecutionOrderStatus.CREATED);
  });

  it('una OT MANUAL despachada sin referencia también se anula', async () => {
    const dispatched = await TenantContext.run(tenantContext(), () =>
      service.dispatchFromCoordination(
        buildDispatch({
          originContext: WorkOrderSourceContext.MANUAL,
          originRefId: null,
        }) as DispatchExecutionOrderInput,
        supervisor,
      ),
    );
    createdOrderIds.push(dispatched.id);

    await TenantContext.run(tenantContext(), () =>
      service.annul(dispatched.id, { reason: 'Creada a mano por error' }, supervisor),
    );

    const row = await readAnnulRow(dispatched.id);
    expect(row['status']).toBe(ExecutionOrderStatus.CANCELLED);
    expect(row['is_annulled']).toBe(true);
  });
});
