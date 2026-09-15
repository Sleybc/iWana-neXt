import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  dataSourceOptions,
  ExecutionOrder,
  ExecutionOrderOriginIdentity1350000000000,
  ExecutionOrderStatusTransition,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  ExecutionOrdersService,
  type CreateExecutionOrderFromSchedulingInput,
} from '../services/execution-orders.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

if (dbAvailable && !integrationTenantSlug) {
  console.warn(
    '[E1-integration] Suite omitida: defina E2E_TENANT_SLUG para seleccionar un tenant real.',
  );
}

/**
 * MOD11 E1 — CA-02 y CA-03 contra PostgreSQL real.
 *
 * CA-03 se prueba CONCURRENTE, no secuencial: dos creaciones simultáneas para
 * el mismo origen deben producir una sola OT. El criterio discrimina la guarda
 * del safety net: la perdedora debe traer `activeExecutionOrderId` (rechazo en
 * el chequeo, serializado por el advisory lock), no el 409 sin referencia del
 * camino 23505. Sin el lock, ambos chequeos pasarían antes de que cualquiera
 * confirme y la perdedora caería al safety net —el test lo detectaría.
 *
 * La suite aplica la migración 135 sobre el schema del tenant en `beforeAll`
 * y la revierte en `afterAll` (solo crea OT agendadas completas, así que el
 * `down` con su límite declarado procede): ida y vuelta reales.
 */
describeWithDb('Execution Orders E1 — unicidad por origen contra PostgreSQL real', () => {
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

  const actor: JwtPayload = {
    sub: '00000000-0000-4000-8000-000000000001',
    email: 'e1-test@example.test',
    role: UserRole.NOC,
    tenantId: '',
    schemaName: '',
    jti: '00000000-0000-4000-8000-000000000002',
    type: 'tenant',
  };

  const buildInput = (
    originRef: string,
    scheduleEventId: string,
    workType: WfmWorkType = WfmWorkType.SUPPORT,
  ): CreateExecutionOrderFromSchedulingInput => ({
    scheduleEventId,
    assignedTechnicianId: null,
    assignedCrewId: null,
    originContext: 'ASSURANCE',
    originRefId: originRef,
    customerDisplayLabel: 'Cliente de prueba E1',
    workType,
    workSummary: 'Soporte concurrente E1',
    plannedWindowStartAt: '2030-03-01T10:00:00.000Z',
    plannedWindowEndAt: '2030-03-01T11:00:00.000Z',
  });

  const countByOrigin = (originRef: string): Promise<number> =>
    TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT COUNT(*)::int AS total FROM execution_orders
            WHERE tenant_id = $1 AND origin_context = 'ASSURANCE'
              AND TRIM(origin_ref_id) = $2
              AND status NOT IN ('CANCELLED', 'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED')`,
          [tenantId, originRef],
        )) as Array<{ total: number }>;
        return rows[0]?.total ?? 0;
      }),
    );

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [ExecutionOrder, ExecutionOrderStatusTransition],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 8, min: 2 },
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
    actor.tenantId = tenantId;
    actor.schemaName = schemaName;
    service = new ExecutionOrdersService(dataSource);

    // La guarda exige el índice 135: se aplica aquí y se revierte al cerrar.
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
            await qr.manager.delete(ExecutionOrder, createdOrderIds);
          }
          await new ExecutionOrderOriginIdentity1350000000000().down(qr);
        }),
      );
      await dataSource.destroy();
    }
  });

  it('CA-03: dos creaciones simultáneas del mismo origen dejan una sola OT y la perdedora trae referencia', async () => {
    for (let round = 0; round < 3; round += 1) {
      const originRef = `E1-CA3-${Date.now()}-${round}`;
      const settled = await TenantContext.run(tenantContext(), () =>
        Promise.allSettled([
          service.createFromScheduling(buildInput(originRef, randomUUID()), actor),
          service.createFromScheduling(buildInput(originRef, randomUUID()), actor),
        ]),
      );

      const fulfilled = settled.filter((r) => r.status === 'fulfilled');
      const rejected = settled.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const winner = (fulfilled[0] as PromiseFulfilledResult<ExecutionOrder>).value;
      createdOrderIds.push(winner.id);

      const loser = (rejected[0] as PromiseRejectedResult).reason;
      expect(loser).toBeInstanceOf(ConflictException);
      const body = loser.getResponse() as Record<string, unknown>;
      expect(body['error']).toBe('DUPLICATE_ACTIVE_WORK');
      // Discriminante del advisory lock: el rechazo salió del chequeo, no del 23505.
      expect(body['activeExecutionOrderId']).toBe(winner.id);

      expect(await countByOrigin(originRef)).toBe(1);
    }
  });

  it('CA-02: mismo origen con distinto work_type no colisiona', async () => {
    const originRef = `E1-CA2-tipo-${Date.now()}`;
    const orders = await TenantContext.run(tenantContext(), () =>
      Promise.all([
        service.createFromScheduling(
          buildInput(originRef, randomUUID(), WfmWorkType.SUPPORT),
          actor,
        ),
        service.createFromScheduling(
          buildInput(originRef, randomUUID(), WfmWorkType.INSTALLATION),
          actor,
        ),
      ]),
    );
    createdOrderIds.push(...orders.map((order) => order.id));
    expect(new Set(orders.map((order) => order.id)).size).toBe(2);
  });

  it('CA-02: tras cancelar, el origen se libera para trabajo futuro (no regresión ADR-076 regla 9)', async () => {
    const originRef = `E1-CA2-reinst-${Date.now()}`;
    const eventId = randomUUID();
    const first = await TenantContext.run(tenantContext(), () =>
      service.createFromScheduling(buildInput(originRef, eventId), actor),
    );
    createdOrderIds.push(first.id);

    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await service.cancelFromSchedulingWithManager(
          qr.manager,
          tenantId,
          first.id,
          eventId,
          'Prueba E1: libera el origen',
          actor,
        );
      }),
    );

    const second = await TenantContext.run(tenantContext(), () =>
      service.createFromScheduling(buildInput(originRef, randomUUID()), actor),
    );
    createdOrderIds.push(second.id);
    expect(second.id).not.toBe(first.id);
  });
});
