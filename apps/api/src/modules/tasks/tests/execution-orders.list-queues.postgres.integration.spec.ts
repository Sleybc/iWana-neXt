import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions, ExecutionOrder, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  EXECUTION_ORDER_QUEUES,
  ExecutionOrderStatus,
  UserRole,
  WfmWorkType,
  type ExecutionOrderQueue,
  type ListExecutionOrdersResponse,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersService } from '../services/execution-orders.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

/**
 * MOD11 bandeja con colas (spec 2026-11-19 §3 H–J, CA-9, CA-11, CA-12; plan
 * R2/R3/R4/R6) contra PostgreSQL real.
 *
 * Aislamiento de datos: todas las filas sembradas comparten un prefijo de
 * número único por corrida y cada consulta lo usa en `number`, así el resto de
 * OT del tenant de integración no altera los conteos. Reloj fijado a las
 * 23:45 de Bogotá (04:45Z del día siguiente): una implementación con la zona
 * del servidor (UTC) cambiaría el contenido de «Hoy».
 */
describeWithDb('Bandeja de OT — colas y búsqueda por número contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let service: ExecutionOrdersService;
  const prefix = `OTQ${randomUUID().slice(0, 8).toUpperCase()}`;
  const otherPrefixSameRun = `${prefix}X`;
  const siteA = randomUUID();
  const siteB = randomUUID();
  const me = randomUUID();
  const otherTech = randomUUID();
  const createdIds: string[] = [];
  const ids: Record<string, string> = {};

  // 2026-11-19 23:45 en America/Bogota (UTC-5).
  const NOW = new Date('2026-11-20T04:45:00.000Z');

  const ctx = () => ({ tenantId, schemaName, tenantSlug: integrationTenantSlug! });

  const admin = (): JwtPayload => ({
    sub: me,
    email: 'colas-admin@example.test',
    role: UserRole.ADMIN,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  });
  const technician = (): JwtPayload => ({ ...admin(), role: UserRole.TECHNICIAN });

  interface Seed {
    key: string;
    status: ExecutionOrderStatus;
    tech?: string;
    crew?: string;
    window?: string;
    annulled?: boolean;
    site?: string;
    tenant?: string;
    number?: string;
  }

  const seeds: Seed[] = [
    // Hoy local 23:30 → hoy; activa, mía.
    {
      key: 'mineToday',
      status: ExecutionOrderStatus.ASSIGNED,
      tech: me,
      window: '2026-11-20T04:30:00Z',
    },
    // Activa sin ventana ni responsable.
    { key: 'pool', status: ExecutionOrderStatus.CREATED },
    // Mañana local 00:10 (mismo día UTC que NOW): NO es hoy en la zona del tenant.
    {
      key: 'crewTomorrow',
      status: ExecutionOrderStatus.IN_PROGRESS,
      crew: randomUUID(),
      window: '2026-11-20T05:10:00Z',
    },
    // Terminal con ventana hoy local 08:00 (día UTC anterior a NOW): sí es hoy.
    {
      key: 'doneToday',
      status: ExecutionOrderStatus.COMPLETED,
      tech: me,
      window: '2026-11-19T13:00:00Z',
    },
    // Terminal sin responsable ni ventana.
    { key: 'cancelled', status: ExecutionOrderStatus.CANCELLED },
    // Anulada: fuera de toda cola.
    { key: 'annulled', status: ExecutionOrderStatus.CANCELLED, annulled: true },
    // Activa de otro técnico, ayer local 23:50.
    {
      key: 'otherYesterday',
      status: ExecutionOrderStatus.BLOCKED,
      tech: otherTech,
      window: '2026-11-19T04:50:00Z',
    },
    // Otra sede (alcance de sede por filtro): activa sin asignar.
    { key: 'siteB', status: ExecutionOrderStatus.ASSIGNED, site: siteB },
    // Otro tenant en el mismo schema, mismo prefijo: nunca debe verse.
    { key: 'foreign', status: ExecutionOrderStatus.ASSIGNED, tenant: randomUUID() },
    // Número que no comparte el prefijo exacto con dígito: control de búsqueda.
    {
      key: 'searchOther',
      status: ExecutionOrderStatus.ASSIGNED,
      number: `${otherPrefixSameRun}-ZZ`,
    },
  ];

  const list = async (
    query: Record<string, unknown>,
    actor: JwtPayload = admin(),
  ): Promise<ListExecutionOrdersResponse> =>
    TenantContext.run(ctx(), () =>
      service.list({ number: prefix, organizationSiteId: siteA, limit: 100, ...query }, actor),
    );

  const idsOf = (res: ListExecutionOrdersResponse) =>
    res.data.map((row) => Object.entries(ids).find(([, id]) => id === row.id)?.[0]).sort();

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [ExecutionOrder],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 2, min: 1 },
    });
    await dataSource.initialize();
    const tenant = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenant[0])
      throw new Error(`No existe el tenant de integración '${integrationTenantSlug}'.`);
    tenantId = tenant[0].id;
    schemaName = tenant[0].schema_name;

    const args: unknown[] = [
      dataSource,
      ...Array<undefined>(10),
      { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) },
    ];
    service = new (ExecutionOrdersService as unknown as new (
      ...a: unknown[]
    ) => ExecutionOrdersService)(...args);
    jest
      .spyOn(service as unknown as { currentInstant: () => Date }, 'currentInstant')
      .mockReturnValue(NOW);

    await TenantContext.run(ctx(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        let n = 0;
        for (const seed of seeds) {
          n += 1;
          const id = randomUUID();
          const start = seed.window ? new Date(seed.window) : null;
          await qr.query(
            `INSERT INTO execution_orders (
               id, tenant_id, execution_order_number, organization_site_id,
               assigned_technician_id, assigned_crew_id, origin_context, origin_ref_id,
               customer_display_label, work_type, work_summary,
               planned_window_start_at, planned_window_end_at, status, is_annulled)
             VALUES ($1,$2,$3,$4,$5,$6,'MANUAL',$7,'Cliente colas',$8,'Prueba colas',$9,$10,$11,$12)`,
            [
              id,
              seed.tenant ?? tenantId,
              seed.number ?? `${prefix}-${String(n).padStart(2, '0')}`,
              seed.site ?? siteA,
              seed.tech ?? null,
              seed.crew ?? null,
              `${prefix}-${seed.key}`,
              WfmWorkType.SUPPORT,
              start,
              start ? new Date(start.getTime() + 3_600_000) : null,
              seed.status,
              seed.annulled ?? false,
            ],
          );
          ids[seed.key] = id;
          createdIds.push(id);
        }
      }),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (createdIds.length > 0) {
        await runInTenantSchema(dataSource, schemaName, (qr) =>
          qr.query('DELETE FROM execution_orders WHERE id = ANY($1::uuid[])', [createdIds]),
        );
      }
      await dataSource.destroy();
    }
  });

  const expectedAdmin: Record<ExecutionOrderQueue, string[]> = {
    ALL: [
      'cancelled',
      'crewTomorrow',
      'doneToday',
      'mineToday',
      'otherYesterday',
      'pool',
      'searchOther',
    ],
    ACTIVE: ['crewTomorrow', 'mineToday', 'otherYesterday', 'pool', 'searchOther'],
    TO_SCHEDULE: ['pool', 'searchOther'],
    UNASSIGNED: ['pool', 'searchOther'],
    TODAY: ['doneToday', 'mineToday'],
    MINE: ['mineToday'],
  };

  it.each(EXECUTION_ORDER_QUEUES)(
    'CA-9 cola %s: conteo = total de su lista = filas esperadas (zona del tenant en «Hoy»)',
    async (queue) => {
      const res = await list({ queue });
      expect(res.meta.total).toBe(expectedAdmin[queue].length);
      expect(res.queueCounts?.[queue]).toBe(res.meta.total);
      expect(idsOf(res)).toEqual(expectedAdmin[queue]);
    },
  );

  it('los seis conteos de una petición coinciden con los totales de cada cola', async () => {
    const { queueCounts } = await list({ queue: 'ACTIVE' });
    for (const queue of EXECUTION_ORDER_QUEUES) {
      const res = await list({ queue });
      expect(queueCounts?.[queue]).toBe(res.meta.total);
    }
  });

  it('R6: cerca de medianoche «Hoy» sigue el día del tenant, no el de UTC', async () => {
    const res = await list({ queue: 'TODAY' });
    const found = idsOf(res);
    expect(found).toContain('doneToday'); // 19-nov local, 19-nov UTC
    expect(found).toContain('mineToday'); // 19-nov local, 20-nov UTC
    expect(found).not.toContain('crewTomorrow'); // 20-nov local, 20-nov UTC
    expect(found).not.toContain('otherYesterday'); // 18-nov local
  });

  it('los filtros sueltos se combinan con la cola y con los conteos', async () => {
    const res = await list({ queue: 'ACTIVE', status: ExecutionOrderStatus.ASSIGNED });
    expect(idsOf(res)).toEqual(['mineToday', 'searchOther']);
    expect(res.queueCounts).toEqual({
      ALL: 2,
      ACTIVE: 2,
      TO_SCHEDULE: 1,
      UNASSIGNED: 1,
      TODAY: 1,
      MINE: 1,
    });
  });

  it('R3: el alcance del técnico se aplica igual a lista y conteos', async () => {
    const tech = technician();
    const expected: Record<ExecutionOrderQueue, string[]> = {
      // Suyas + pool sin asignar distinto de CREATED (cancelled y searchOther).
      ALL: ['cancelled', 'doneToday', 'mineToday', 'searchOther'],
      ACTIVE: ['mineToday', 'searchOther'],
      TO_SCHEDULE: ['searchOther'],
      UNASSIGNED: ['searchOther'],
      TODAY: ['doneToday', 'mineToday'],
      MINE: ['mineToday'],
    };
    for (const queue of EXECUTION_ORDER_QUEUES) {
      const res = await list({ queue }, tech);
      expect(idsOf(res)).toEqual(expected[queue]);
      expect(res.queueCounts?.[queue]).toBe(res.meta.total);
    }
  });

  it('alcance de sede: los conteos de la sede A no incluyen la sede B', async () => {
    const a = await list({ queue: 'ALL' });
    const b = await list({ queue: 'ALL', organizationSiteId: siteB });
    expect(idsOf(b)).toEqual(['siteB']);
    expect(b.queueCounts?.ALL).toBe(1);
    expect(idsOf(a)).not.toContain('siteB');
  });

  it('CA-11: la búsqueda no devuelve OT de otro tenant aunque compartan número y schema', async () => {
    const res = await list({ queue: 'ALL', organizationSiteId: undefined });
    expect(res.data.map((row) => row.id)).not.toContain(ids['foreign']);
    expect(idsOf(res)).toContain('siteB');
    expect(res.queueCounts?.ALL).toBe(res.meta.total);
  });

  it('CA-11: busca por número parcial sin distinguir mayúsculas y solo por número', async () => {
    const exact = await list({ number: `${prefix}-01`.toLowerCase() });
    expect(idsOf(exact)).toEqual(['mineToday']);
    const narrow = await list({ number: otherPrefixSameRun });
    expect(idsOf(narrow)).toEqual(['searchOther']);
    const byCustomer = await list({ number: 'Cliente' });
    expect(byCustomer.meta.total).toBe(0);
  });

  it('CA-12: sin cola la respuesta conserva la forma v1 y no trae conteos', async () => {
    // Estricto: sin `number` (el helper lo pone por defecto); siteA es único por corrida.
    const res = await TenantContext.run(ctx(), () =>
      service.list({ organizationSiteId: siteA, limit: 100 }, admin()),
    );
    expect(Object.keys(res).sort()).toEqual(['data', 'meta']);
    expect(res).not.toHaveProperty('queueCounts');
    expect(idsOf(res)).toEqual(expectedAdmin.ALL);
  });
});
