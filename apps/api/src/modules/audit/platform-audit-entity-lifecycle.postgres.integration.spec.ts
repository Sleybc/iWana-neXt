/**
 * `PlatformAuditService.countEntityLifecycleByMonth` y `listEntityStatusEvents` contra
 * PostgreSQL real (F2-D2, `TenantStatusSummary` v1.2): largo de la serie por parámetro,
 * alta = primer `CREATE` de cada entidad y eventos de estado para reconstruir las activas al
 * cierre de cada mes.
 *
 * El registro es append-only (trigger 014/024): la siembra y las lecturas corren dentro de una
 * transacción que se revierte (F2-D4). Un `entity_type` propio de la corrida aísla los datos.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js platform-audit-entity-lifecycle
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { PlatformAuditService } from './platform-audit.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const ENTITY_TYPE = `ItLife${randomBytes(4).toString('hex')}`;

/** Inicio del mes Bogotá desplazado `offset` meses + `hours` horas, como timestamptz. */
const monthStart = (offset: number, hours = 1): string =>
  `((date_trunc('month', now() AT TIME ZONE 'America/Bogota') + (${offset} * interval '1 month') + (${hours} * interval '1 hour')) AT TIME ZONE 'America/Bogota')`;

describeWithDb('PlatformAuditService — ciclo de vida por mes v1.2, PostgreSQL real', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let service: PlatformAuditService;
  let asOf: Date;
  const x = randomUUID();
  const y = randomUUID();
  const z = randomUUID();

  const insert = async (
    action: string,
    entityId: string,
    at: string,
    newValue: Record<string, unknown> | null,
  ): Promise<void> => {
    await queryRunner.query(
      `INSERT INTO public.platform_audit_logs (id, action, entity_type, entity_id, new_value, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, ${at})`,
      [randomUUID(), action, ENTITY_TYPE, entityId, newValue ? JSON.stringify(newValue) : null],
    );
  };

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    service = new PlatformAuditService(
      queryRunner.manager as unknown as DataSource,
      undefined as never,
    );

    // x: alta hace 30 meses, activa hace 28, suspendida hace 3; subida de branding (otro CREATE).
    await insert('CREATE', x, monthStart(-30), { status: 'PROVISIONING', slug: 'x' });
    await insert('UPDATE', x, monthStart(-28), { status: 'ACTIVE' });
    await insert('UPDATE', x, monthStart(-3), { status: 'SUSPENDED' });
    await insert('CREATE', x, monthStart(-2), { usage: 'logo' });
    // Cambio sin estado y lectura auditada: no son eventos de estado.
    await insert('UPDATE', x, monthStart(-1), { name: 'x' });
    await insert('LIST_ACCESS', x, monthStart(-1), { status: 'ACTIVE' });
    // y: alta hace 20 meses y baja (DELETE sin cuerpo) este mes.
    await insert('CREATE', y, monthStart(-20), { status: 'PROVISIONING', slug: 'y' });
    await insert('DELETE', y, monthStart(0), null);
    // z: evento posterior a asOf (reloj adelantado): fuera.
    await insert('CREATE', z, `(now() + interval '2 days')`, { status: 'PROVISIONING', slug: 'z' });

    // Mismo instante para todas las lecturas (C-D1), dentro de la transacción.
    const [row] = (await queryRunner.query(`SELECT now() AS now`)) as Array<{ now: Date }>;
    asOf = new Date(row!.now);
  });

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
    await queryRunner?.release();
    if (!dataSource?.isInitialized) return;
    const [left] = (await dataSource.query(
      `SELECT count(*)::int AS audit FROM public.platform_audit_logs WHERE entity_type = $1`,
      [ENTITY_TYPE],
    )) as Array<{ audit: number }>;
    await dataSource.destroy();
    expect(left).toEqual({ audit: 0 });
  });

  it.each([6, 12, 24] as const)(
    'countEntityLifecycleByMonth devuelve %i meses consecutivos',
    async (months) => {
      const series = await service.countEntityLifecycleByMonth(ENTITY_TYPE, asOf, months);

      expect(series).toHaveLength(months);
      const labels = series.map((m) => m.month);
      expect([...labels].sort()).toEqual(labels);
      expect(new Set(labels).size).toBe(months);
    },
  );

  it('el alta cuenta una vez, en el mes del primer CREATE; la serie de 24 meses alcanza la de hace 20', async () => {
    const series24 = await service.countEntityLifecycleByMonth(ENTITY_TYPE, asOf, 24);
    const series6 = await service.countEntityLifecycleByMonth(ENTITY_TYPE, asOf, 6);

    // Índice 23 = mes en curso; hace 20 meses = índice 3.
    expect(series24[3]).toEqual(expect.objectContaining({ created: 1 }));
    expect(series24[23]).toEqual(expect.objectContaining({ created: 0, removed: 1 }));
    // El CREATE de branding de hace 2 meses no es otra alta.
    expect(series6.reduce((sum, m) => sum + m.created, 0)).toBe(0);
    expect(series24.reduce((sum, m) => sum + m.created, 0)).toBe(1);
  });

  it('listEntityStatusEvents: último evento previo a la ventana + los de la ventana, hasta asOf', async () => {
    const events = await service.listEntityStatusEvents(
      ENTITY_TYPE,
      ['CREATE', 'UPDATE', 'DELETE'],
      asOf,
      6,
    );

    expect(events.map(({ entityId, action, status }) => ({ entityId, action, status }))).toEqual([
      // Previos a la ventana de 6 meses: solo el último de cada entidad.
      { entityId: x, action: 'UPDATE', status: 'ACTIVE' },
      { entityId: y, action: 'CREATE', status: 'PROVISIONING' },
      // Dentro de la ventana.
      { entityId: x, action: 'UPDATE', status: 'SUSPENDED' },
      { entityId: y, action: 'DELETE', status: null },
    ]);
    const times = events.map((event) => event.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times.every((time) => time <= asOf.getTime())).toBe(true);
  });
});
