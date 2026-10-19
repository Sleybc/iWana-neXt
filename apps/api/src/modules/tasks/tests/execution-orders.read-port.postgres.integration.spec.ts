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
        work_type "${schema}".wfm_work_type NOT NULL,
        status "${schema}".execution_order_status NOT NULL,
        is_annulled boolean NOT NULL DEFAULT false
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
});
