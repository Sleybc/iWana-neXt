import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions, TenantContext } from '@iwana/db';
import { ExecutionOrdersService } from '../services/execution-orders.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('ExecutionOrderReadPort — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: ExecutionOrdersService;
  let schemaName: string;
  const schemaNames: string[] = [];
  let tenantId: string;
  let secondTenantId: string;

  const context = (tenant: string, schema: string) => ({
    tenantId: tenant,
    schemaName: schema,
    tenantSlug: schema,
  });

  const createSchema = async (tenant: string): Promise<string> => {
    const schema = `tenant_b5_${randomUUID().replace(/-/g, '')}`;
    schemaNames.push(schema);
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.query(
      `CREATE TYPE "${schema}".wfm_work_type AS ENUM ('INSTALLATION', 'SUPPORT', 'RETIREMENT')`,
    );
    await dataSource.query(
      `CREATE TYPE "${schema}".execution_order_status AS ENUM (
        'CREATED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'BLOCKED',
        'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED'
      )`,
    );
    await dataSource.query(`
      CREATE TABLE "${schema}".execution_orders (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        subscriber_id varchar(160),
        assigned_technician_id uuid,
        customer_display_label varchar(160),
        work_type "${schema}".wfm_work_type NOT NULL,
        status "${schema}".execution_order_status NOT NULL,
        is_annulled boolean NOT NULL DEFAULT false
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schema}".execution_order_evidence (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        execution_order_id uuid NOT NULL,
        evidence_type varchar(32) NOT NULL,
        requirement_key varchar(160),
        created_at timestamptz NOT NULL,
        storage_key varchar(255),
        private_metadata jsonb
      )
    `);
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
    await dataSource.query(
      `INSERT INTO "${schema}".execution_orders
        (id, tenant_id, subscriber_id, work_type, status, is_annulled)
       VALUES ($1, $2, $3, $4::"${schema}".wfm_work_type,
               $5::"${schema}".execution_order_status, $6)`,
      [
        randomUUID(),
        tenant,
        values.subscriberId,
        values.workType ?? 'RETIREMENT',
        values.status ?? 'CREATED',
        values.isAnnulled ?? false,
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      for (const schema of schemaNames) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
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
        (id, tenant_id, assigned_technician_id, customer_display_label,
         work_type, status, is_annulled)
       VALUES ($1, $2, $3, $4, 'INSTALLATION', 'IN_PROGRESS', false)`,
      [orderId, tenantId, technicianId, 'Etiqueta reservada'],
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
      await dataSource.query(
        `INSERT INTO "${schemaName}".execution_order_evidence
          (id, tenant_id, execution_order_id, evidence_type, requirement_key,
           created_at, storage_key, private_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.id,
          row.tenant,
          executionOrderId,
          row.type,
          row.requirement,
          row.createdAt,
          'private/object/key',
          { internal: true },
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
