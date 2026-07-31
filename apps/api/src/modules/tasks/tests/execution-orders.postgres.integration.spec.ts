import { DataSource } from 'typeorm';
import {
  dataSourceOptions,
  ExecutionOrder,
  ExecutionOrderTemplate,
  ExecutionOrderTemplateRequirement,
  ExecutionOrderTemplateVersion,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderTemplatesService } from '../services/execution-order-templates.service';
import {
  ExecutionOrdersService,
  type CreateExecutionOrderFromSchedulingInput,
} from '../services/execution-orders.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

if (dbAvailable && !integrationTenantSlug) {
  console.warn(
    '[R2.3-integration] Suite omitida: defina E2E_TENANT_SLUG para seleccionar un tenant real.',
  );
}

const actor: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000001',
  email: 'operations-test@example.test',
  role: UserRole.NOC,
  tenantId: '',
  schemaName: '',
  jti: '00000000-0000-4000-8000-000000000002',
  type: 'tenant',
};

const buildInput = (
  scheduleEventId: string,
  suffix: string,
): CreateExecutionOrderFromSchedulingInput => ({
  scheduleEventId,
  assignedTechnicianId: null,
  assignedCrewId: null,
  originContext: 'TEST',
  originRefId: `concurrency-${suffix}`,
  customerDisplayLabel: 'Cliente de prueba',
  workType: WfmWorkType.INSTALLATION,
  workSummary: `Concurrencia ${suffix}`,
  plannedWindowStartAt: '2030-01-01T10:00:00.000Z',
  plannedWindowEndAt: '2030-01-01T11:00:00.000Z',
});

describeWithDb('Execution Orders — concurrencia PostgreSQL real R2.3', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let templateService: ExecutionOrderTemplatesService;
  let executionOrdersService: ExecutionOrdersService;
  const createdOrderIds: string[] = [];
  const createdTemplateIds: string[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        ExecutionOrder,
        ExecutionOrderTemplate,
        ExecutionOrderTemplateVersion,
        ExecutionOrderTemplateRequirement,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 8, min: 1 },
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
    actor.tenantId = tenantId;
    actor.schemaName = schemaName;
    templateService = new ExecutionOrderTemplatesService(dataSource);
    executionOrdersService = new ExecutionOrdersService(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await TenantContext.run(
        { tenantId, schemaName, tenantSlug: integrationTenantSlug! },
        async () => {
          await runInTenantSchema(dataSource, schemaName, async (queryRunner) => {
            if (createdOrderIds.length > 0) {
              await queryRunner.manager.delete(ExecutionOrder, createdOrderIds);
            }
            if (createdTemplateIds.length > 0) {
              await queryRunner.query(
                'DELETE FROM execution_order_template_versions WHERE template_id = ANY($1::uuid[])',
                [createdTemplateIds],
              );
              await queryRunner.manager.delete(ExecutionOrderTemplate, createdTemplateIds);
            }
          });
        },
      );
      await dataSource.destroy();
    }
  });

  it('Promise.all con el mismo schedule_event_id deja una sola OT y no expone 23505', async () => {
    const scheduleEventId = '00000000-0000-4000-8000-000000000010';
    const result = await TenantContext.run(
      { tenantId, schemaName, tenantSlug: integrationTenantSlug! },
      () =>
        Promise.all([
          executionOrdersService.createFromScheduling(buildInput(scheduleEventId, 'a'), actor),
          executionOrdersService.createFromScheduling(buildInput(scheduleEventId, 'b'), actor),
        ]),
    );

    expect(result[0]?.id).toBe(result[1]?.id);
    createdOrderIds.push(result[0]!.id);

    const rows = (await TenantContext.run(
      { tenantId, schemaName, tenantSlug: integrationTenantSlug! },
      () =>
        runInTenantSchema(dataSource, schemaName, (queryRunner) =>
          queryRunner.query(
            'SELECT id FROM execution_orders WHERE tenant_id = $1 AND schedule_event_id = $2',
            [tenantId, scheduleEventId],
          ),
        ),
    )) as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
  });

  it('Promise.all genera versiones 1/2 y consecutivos de OT sin colisión', async () => {
    const template = await TenantContext.run(
      { tenantId, schemaName, tenantSlug: integrationTenantSlug! },
      () =>
        templateService.createTemplate({
          key: `postgres-r23-${Date.now()}`,
          label: 'Plantilla de concurrencia',
          workType: WfmWorkType.INSTALLATION,
          requirements: [],
        }),
    );
    createdTemplateIds.push(template.id);

    const versions = await TenantContext.run(
      { tenantId, schemaName, tenantSlug: integrationTenantSlug! },
      () =>
        Promise.all([
          templateService.createVersion(template.id, {
            label: 'Versión concurrente A',
            requirements: [],
          }),
          templateService.createVersion(template.id, {
            label: 'Versión concurrente B',
            requirements: [],
          }),
        ]),
    );
    expect(versions.map((version) => version.version).sort()).toEqual([1, 2]);

    const orders = await TenantContext.run(
      { tenantId, schemaName, tenantSlug: integrationTenantSlug! },
      () =>
        Promise.all([
          executionOrdersService.createFromScheduling(
            buildInput('00000000-0000-4000-8000-000000000011', 'c'),
            actor,
          ),
          executionOrdersService.createFromScheduling(
            buildInput('00000000-0000-4000-8000-000000000012', 'd'),
            actor,
          ),
        ]),
    );
    createdOrderIds.push(...orders.map((order) => order.id));

    const sequences = orders
      .map((order) => Number.parseInt(order.executionOrderNumber.split('-').at(-1) ?? '', 10))
      .sort((left, right) => left - right);
    expect(new Set(orders.map((order) => order.executionOrderNumber)).size).toBe(2);
    if (sequences.length !== 2) {
      throw new Error('La prueba de consecutivos no recibió exactamente dos OTs.');
    }
    const firstSequence = sequences[0]!;
    const secondSequence = sequences[1]!;
    expect(secondSequence - firstSequence).toBe(1);
  });
});
