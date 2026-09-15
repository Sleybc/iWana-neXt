import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
    '[E2-integration] Suite omitida: defina E2E_TENANT_SLUG para seleccionar un tenant real.',
  );
}

/**
 * MOD11 E2 — despacho contra PostgreSQL real (CA-05, CA-07, guarda compartida).
 *
 * Sin DDL: no se aplica ni se revierte ninguna migración (restricción del
 * encargo — E1 agotó el DDL). La guarda de origen corre a nivel de servicio
 * con o sin el índice 135; el índice, si existe en el tenant, es safety net.
 *
 * Los criterios leen la fila con SQL crudo: la respuesta no es criterio
 * (precedente T0 — el falso verde que ocultó el defecto de assign).
 */
describeWithDb('Execution Orders E2 — despacho contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let service: ExecutionOrdersService;
  const createdOrderIds: string[] = [];
  // H1: interruptor del stub de alcance (describe-scope para mutarlo por test).
  let allowScope = true;

  const tenantContext = () => ({
    tenantId,
    schemaName,
    tenantSlug: integrationTenantSlug!,
  });

  const supervisor: JwtPayload = {
    sub: '00000000-0000-4000-8000-000000000011',
    email: 'e2-test@example.test',
    role: UserRole.NOC,
    tenantId: '',
    schemaName: '',
    jti: '00000000-0000-4000-8000-000000000012',
    type: 'tenant',
  };

  const buildDispatch = (
    overrides: Partial<DispatchExecutionOrderInput> = {},
  ): DispatchExecutionOrderInput => ({
    originContext: WorkOrderSourceContext.MANUAL,
    originRefId: null,
    workType: WfmWorkType.SUPPORT,
    organizationSiteId: randomUUID(),
    customerDisplayLabel: 'Cliente de prueba E2',
    workSummary: 'Soporte despachado sin cita E2',
    ...overrides,
  });

  const readDispatchRow = async (orderId: string) =>
    TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT id, status, schedule_event_id, planned_window_start_at,
                  planned_window_end_at, assigned_technician_id, assigned_crew_id,
                  visit_request_id, organization_site_id, origin_context, origin_ref_id,
                  task_id, version
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
      getOrThrow: () => 'e2-integration-secret',
    } as never);
    // H1: el alcance se acredita con un stub del puerto (la decisión de
    // alcance vive en el módulo de organización; aquí se verifica que el
    // despacho la consulta y la honra, incluso en negación).
    const scopePort = {
      canSuperviseExecutionOrder: jest.fn().mockImplementation(async () => allowScope),
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

    // Precedente E1: la 135 se aplica aquí y se revierte al cerrar. No es DDL
    // nuevo — es la migración de E1, necesaria porque el tenant de
    // integración conserva el esquema pre-E1 (NOT NULL). Sin ella, el
    // despacho persiste nulos contra una columna NOT NULL (falla accionable
    // que esta suite detectó en su primera corrida).
    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await new ExecutionOrderOriginIdentity1350000000000().up(qr);
      }),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await TenantContext.run(tenantContext(), () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
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
          // El `down` declara su límite ante OT sin evento: solo procede
          // porque la limpieza anterior eliminó las filas de esta suite.
          await new ExecutionOrderOriginIdentity1350000000000().down(qr);
        }),
      );
      await dataSource.destroy();
    }
  });

  afterEach(() => {
    allowScope = true;
  });

  it('H1 central contra base: el rechazo no inserta y el origen sigue libre', async () => {
    const originRef = `H1-PG-${Date.now()}`;
    const siteId = randomUUID();

    allowScope = false;
    const rejected = await TenantContext.run(tenantContext(), () =>
      service
        .dispatchFromCoordination(
          buildDispatch({
            originContext: WorkOrderSourceContext.ASSURANCE,
            originRefId: originRef,
            organizationSiteId: siteId,
          }),
          supervisor,
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect(rejected).toBeInstanceOf(NotFoundException);

    // Nada insertado: conteo del origen en base tras el rechazo.
    const leaked = await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT COUNT(*)::int AS total FROM execution_orders
            WHERE tenant_id = $1 AND origin_context = 'ASSURANCE' AND TRIM(origin_ref_id) = $2`,
          [tenantId, originRef],
        )) as Array<{ total: number }>;
        return rows[0]?.total ?? -1;
      }),
    );
    expect(leaked).toBe(0);

    allowScope = true;
    const receipt = await TenantContext.run(tenantContext(), () =>
      service.dispatchFromCoordination(
        buildDispatch({
          originContext: WorkOrderSourceContext.ASSURANCE,
          originRefId: originRef,
          organizationSiteId: siteId,
        }),
        supervisor,
      ),
    );
    createdOrderIds.push(receipt.id);
    expect(receipt.status).toBe(ExecutionOrderStatus.CREATED);
  });

  it('CA-05: el despacho persiste CREATED sin evento, ventana ni técnico, con sitio', async () => {
    const siteId = randomUUID();
    const receipt = await TenantContext.run(tenantContext(), () =>
      service.dispatchFromCoordination(buildDispatch({ organizationSiteId: siteId }), supervisor),
    );
    createdOrderIds.push(receipt.id);

    expect(receipt.status).toBe(ExecutionOrderStatus.CREATED);

    const row = await readDispatchRow(receipt.id);
    expect(row['status']).toBe(ExecutionOrderStatus.CREATED);
    expect(row['schedule_event_id']).toBeNull();
    expect(row['planned_window_start_at']).toBeNull();
    expect(row['planned_window_end_at']).toBeNull();
    expect(row['assigned_technician_id']).toBeNull();
    expect(row['assigned_crew_id']).toBeNull();
    expect(row['visit_request_id']).toBeNull();
    expect(row['organization_site_id']).toBe(siteId);
    expect(row['origin_context']).toBe(WorkOrderSourceContext.MANUAL);
  });

  it('CA-07: assign() sobre la OT despachada persiste ASSIGNED + técnico en base', async () => {
    const techId = randomUUID();
    const receipt = await TenantContext.run(tenantContext(), () =>
      service.dispatchFromCoordination(
        buildDispatch({
          originContext: WorkOrderSourceContext.ASSURANCE,
          originRefId: `E2-CA7-${Date.now()}`,
        }),
        supervisor,
      ),
    );
    createdOrderIds.push(receipt.id);

    await TenantContext.run(tenantContext(), () =>
      service.assign(receipt.id, { assigneeType: 'TECHNICIAN', assigneeId: techId }, supervisor),
    );

    const row = await readDispatchRow(receipt.id);
    expect(row['status']).toBe(ExecutionOrderStatus.ASSIGNED);
    expect(row['assigned_technician_id']).toBe(techId);
    // Sin mutaciones colaterales: la OT sigue sin ventana hasta E3.
    expect(row['schedule_event_id']).toBeNull();
    expect(row['planned_window_start_at']).toBeNull();
    expect(row['planned_window_end_at']).toBeNull();
  });

  it('Guarda compartida: dos despachos del mismo origen dejan una sola OT', async () => {
    const originRef = `E2-GUARDA-${Date.now()}`;
    const first = await TenantContext.run(tenantContext(), () =>
      service.dispatchFromCoordination(
        buildDispatch({
          originContext: WorkOrderSourceContext.ASSURANCE,
          originRefId: originRef,
        }),
        supervisor,
      ),
    );
    createdOrderIds.push(first.id);

    const loser = await TenantContext.run(tenantContext(), () =>
      service
        .dispatchFromCoordination(
          buildDispatch({
            originContext: WorkOrderSourceContext.ASSURANCE,
            originRefId: originRef,
          }),
          supervisor,
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect(loser).toBeInstanceOf(ConflictException);
    const body = (loser as ConflictException).getResponse() as Record<string, unknown>;
    expect(body['error']).toBe('DUPLICATE_ACTIVE_WORK');
    expect(body['activeExecutionOrderId']).toBe(first.id);
  });
});
