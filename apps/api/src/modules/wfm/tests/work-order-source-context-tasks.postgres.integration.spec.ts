import { randomBytes, randomUUID } from 'node:crypto';
import {
  resolveMigrationDbCredentials,
  TenantContext,
  VisitRequest,
  WorkOrder,
  WorkOrderTask,
} from '@iwana/db';
import { UserRole, WfmWorkType, WorkOrderSourceContext } from '@iwana/shared';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { VisitRequestsService } from '../services/visit-requests.service';
import { WorkOrdersService } from '../services/work-orders.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * Origen TASKS de WFM contra el schema creado por la cadena real de
 * migraciones tenant. Antes de la migración 152 el tipo persistido
 * `work_order_source_context` no tenía `TASKS` y ambas escrituras fallaban
 * con 22P02, aunque el contrato compartido lo publica.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describeWithDb('WFM — origen TASKS sobre el schema tenant migrado', () => {
  const schemaName = `tenant_wfm_tasks_origin_${randomBytes(5).toString('hex')}`;
  const q = quoteIdentifier(schemaName);
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const actor = {
    sub: actorId,
    role: UserRole.ADMIN,
    tenantId,
    schemaName,
  } as unknown as JwtPayload;

  let dataSource: DataSource;
  let visitRequests: VisitRequestsService;
  let workOrders: WorkOrdersService;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'wfm-tasks-origin-it' }, operation);

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración WFM origen TASKS: DB_NAME debe ser test o iwana_it_*; nunca la base de desarrollo.',
      );
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [VisitRequest, WorkOrder, WorkOrderTask],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA ${q}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'WFM origen TASKS sintético', $2, $3, 'ACTIVE', 'wfm-it@example.invalid')`,
      [tenantId, `wfm-tasks-${schemaName.slice(-10)}`, schemaName],
    );
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `wfm-tasks-origin-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    workOrders = new WorkOrdersService(dataSource);
    visitRequests = new VisitRequestsService(
      dataSource,
      {} as never,
      {} as never,
      {} as never,
      workOrders,
      { findDisplayNamesByIds: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('crea una solicitud de visita con origen TASKS por el servicio de dominio', async () => {
    const taskRef = randomUUID();

    const created = await inTenant(() =>
      visitRequests.createVisitRequest(
        {
          originContext: WorkOrderSourceContext.TASKS,
          originRef: taskRef,
          workType: WfmWorkType.TECHNICAL_VISIT,
          title: 'Visita derivada de tarea ficticia',
        } as never,
        actor,
      ),
    );

    expect(created.originContext).toBe(WorkOrderSourceContext.TASKS);
    expect(
      await dataSource.query(
        `SELECT origin_context::text AS origin, origin_ref FROM ${q}.visit_requests WHERE id = $1`,
        [created.id],
      ),
    ).toEqual([{ origin: 'TASKS', origin_ref: taskRef }]);
  });

  it('crea una orden de trabajo con origen TASKS por el servicio de dominio', async () => {
    const taskRef = randomUUID();

    const created = await inTenant(() =>
      workOrders.create(
        {
          type: WfmWorkType.TECHNICAL_VISIT,
          sourceContext: WorkOrderSourceContext.TASKS,
          sourceRef: taskRef,
          summary: 'Orden derivada de tarea ficticia',
        } as never,
        randomUUID(),
        actorId,
      ),
    );

    expect(created.sourceContext).toBe(WorkOrderSourceContext.TASKS);
    expect(
      await dataSource.query(
        `SELECT source_context::text AS source, source_ref FROM ${q}.work_orders WHERE id = $1`,
        [created.id],
      ),
    ).toEqual([{ source: 'TASKS', source_ref: taskRef }]);
  });
});
