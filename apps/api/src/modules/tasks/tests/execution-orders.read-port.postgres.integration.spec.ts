import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions, TenantContext } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ExecutionOrdersService } from '../services/execution-orders.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('ExecutionOrderReadPort — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: ExecutionOrdersService;
  let schemaName: string;
  const schemaNames: string[] = [];
  const tenantIds: string[] = [];
  let tenantId: string;
  let secondTenantId: string;

  const context = (tenant: string, schema: string) => ({
    tenantId: tenant,
    schemaName: schema,
    tenantSlug: schema,
  });

  const createSchema = async (tenant: string): Promise<string> => {
    const schema = `tenant_b5_${randomUUID().replace(/-/g, '')}`;
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenant,
        'Execution order read port sintético',
        `eo-read-port-${tenant.slice(0, 8)}`,
        schema,
        'eo-read-port@example.invalid',
      ],
    );
    tenantIds.push(tenant);
    // El esquema lo crea la cadena de migraciones tenant vigente, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    schemaNames.push(schema);
    const tenantDataSource = createTenantDataSource(dataSource, schema, `eo-read-port-${schema}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    return schema;
  };

  const insertOrder = async (
    schema: string,
    tenant: string,
    values: {
      subscriberId: string;
      workType?: 'RETIREMENT' | 'INSTALLATION' | 'SUPPORT';
      status?: string;
      isAnnulled?: boolean;
    },
  ): Promise<void> => {
    const isAnnulled = values.isAnnulled ?? false;
    // chk_execution_orders_annulled_cancelled: una OT anulada solo existe en estado CANCELLED.
    // Columnas NOT NULL de la cadena (número, origen, etiqueta y resumen) con valores sintéticos.
    await dataSource.query(
      `INSERT INTO "${schema}".execution_orders
        (id, tenant_id, execution_order_number, origin_context, customer_display_label,
         work_summary, subscriber_id, work_type, status, is_annulled)
       VALUES ($1, $2, $3, 'MANUAL', 'Cliente sintético', 'Trabajo sintético', $4,
               $5::"${schema}".wfm_work_type, $6::"${schema}".execution_order_status, $7)`,
      [
        randomUUID(),
        tenant,
        `OT-${randomUUID()}`,
        values.subscriberId,
        values.workType ?? 'RETIREMENT',
        values.status ?? (isAnnulled ? 'CANCELLED' : 'CREATED'),
        isAnnulled,
      ],
    );
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 2, min: 1 },
    });
    await dataSource.initialize();
    service = new ExecutionOrdersService(dataSource);
    tenantId = randomUUID();
    secondTenantId = randomUUID();
    schemaName = await createSchema(tenantId);
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      for (const schema of schemaNames) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
      await dataSource.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [tenantIds]);
      await dataSource.destroy();
    }
  });

  it.each(['CREATED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'BLOCKED'])(
    'detecta una OT RETIREMENT abierta en estado %s',
    async (status) => {
      const subscriberId = randomUUID();
      await insertOrder(schemaName, tenantId, { subscriberId, status });

      await expect(
        TenantContext.run(context(tenantId, schemaName), () =>
          service.hasOpenWithdrawalOrders(subscriberId),
        ),
      ).resolves.toBe(true);
    },
  );

  it('ignora OT terminales, anuladas y de un tipo de trabajo distinto', async () => {
    const terminalSubscriberId = randomUUID();
    const annulledSubscriberId = randomUUID();
    const otherWorkSubscriberId = randomUUID();
    await insertOrder(schemaName, tenantId, {
      subscriberId: terminalSubscriberId,
      status: 'COMPLETED',
    });
    await insertOrder(schemaName, tenantId, {
      subscriberId: annulledSubscriberId,
      isAnnulled: true,
    });
    await insertOrder(schemaName, tenantId, {
      subscriberId: otherWorkSubscriberId,
      workType: 'INSTALLATION',
    });

    await TenantContext.run(context(tenantId, schemaName), async () => {
      await expect(service.hasOpenWithdrawalOrders(terminalSubscriberId)).resolves.toBe(false);
      await expect(service.hasOpenWithdrawalOrders(annulledSubscriberId)).resolves.toBe(false);
      await expect(service.hasOpenWithdrawalOrders(otherWorkSubscriberId)).resolves.toBe(false);
    });
  });

  it('no cuenta una orden de otro suscriptor', async () => {
    await insertOrder(schemaName, tenantId, { subscriberId: randomUUID() });

    await expect(
      TenantContext.run(context(tenantId, schemaName), () =>
        service.hasOpenWithdrawalOrders(randomUUID()),
      ),
    ).resolves.toBe(false);
  });

  it('aísla el tenant y el schema aunque el suscriptor coincida', async () => {
    const subscriberId = randomUUID();
    const secondSchema = await createSchema(secondTenantId);
    await insertOrder(secondSchema, secondTenantId, { subscriberId });

    await TenantContext.run(context(tenantId, schemaName), async () => {
      await expect(service.hasOpenWithdrawalOrders(subscriberId)).resolves.toBe(false);
    });
    await TenantContext.run(context(secondTenantId, secondSchema), async () => {
      await expect(service.hasOpenWithdrawalOrders(subscriberId)).resolves.toBe(true);
    });
  });

  it('resuelve referencia y asignación sin proyectar la etiqueta del cliente', async () => {
    const orderId = randomUUID();
    const technicianId = randomUUID();
    await dataSource.query(
      `INSERT INTO "${schemaName}".execution_orders
        (id, tenant_id, execution_order_number, origin_context, work_summary,
         assigned_technician_id, customer_display_label, work_type, status, is_annulled)
       VALUES ($1, $2, $5, 'MANUAL', 'Trabajo sintético', $3, $4, 'INSTALLATION', 'IN_PROGRESS', false)`,
      [orderId, tenantId, technicianId, 'Etiqueta reservada', `OT-${randomUUID()}`],
    );

    await expect(
      TenantContext.run(context(tenantId, schemaName), () =>
        service.getExecutionReference(orderId),
      ),
    ).resolves.toEqual({ id: orderId, assignedTechnicianId: technicianId });
  });

  it('expone solo el resumen mínimo de evidencia permitida y filtra por tenant y tipo', async () => {
    const executionOrderId = randomUUID();
    const rows = [
      {
        id: randomUUID(),
        tenant: tenantId,
        type: 'PHOTO',
        requirement: 'ROUTER_LABEL',
        createdAt: '2026-10-20T10:00:00.000Z',
      },
      {
        id: randomUUID(),
        tenant: tenantId,
        type: 'DOCUMENT',
        requirement: null,
        createdAt: '2026-10-20T11:00:00.000Z',
      },
      {
        id: randomUUID(),
        tenant: tenantId,
        type: 'VIDEO',
        requirement: 'UNSUPPORTED',
        createdAt: '2026-10-20T12:00:00.000Z',
      },
      {
        id: randomUUID(),
        tenant: secondTenantId,
        type: 'PHOTO',
        requirement: 'OTHER_TENANT',
        createdAt: '2026-10-20T13:00:00.000Z',
      },
    ];
    for (const row of rows) {
      // La cadena no tiene storage_key ni private_metadata: los datos privados de la evidencia
      // viven en media_asset_id, file_name y notes, que el resumen tampoco debe proyectar.
      await dataSource.query(
        `INSERT INTO "${schemaName}".execution_order_evidence
          (id, tenant_id, execution_order_id, evidence_type, requirement_key,
           created_at, media_asset_id, file_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.tenant,
          executionOrderId,
          row.type,
          row.requirement,
          row.createdAt,
          randomUUID(),
          'private-object.jpg',
          'Nota interna sintética',
        ],
      );
    }

    const evidence = await TenantContext.run(context(tenantId, schemaName), () =>
      service.listProvisioningEvidence(executionOrderId),
    );

    expect(evidence).toEqual([
      {
        id: rows[0]!.id,
        evidenceType: 'PHOTO',
        requirementKey: 'ROUTER_LABEL',
        createdAt: '2026-10-20T10:00:00.000Z',
      },
      {
        id: rows[1]!.id,
        evidenceType: 'DOCUMENT',
        requirementKey: null,
        createdAt: '2026-10-20T11:00:00.000Z',
      },
    ]);
    expect(evidence.every((row) => !('storageKey' in row) && !('privateMetadata' in row))).toBe(
      true,
    );
  });
});
