import { randomBytes } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { AnonymizeExecutionOrderTransitionRetention1340000000000 } from './134_anonymize_execution_order_transition_retention';
import { ExecutionOrderOriginIdentity1350000000000 } from './135_execution_order_origin_identity';
import { ExecutionOrderAnnulmentFlag1360000000000 } from './136_execution_order_annulment_flag';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const suffix = randomBytes(8).toString('hex');
const schema = `it_t2_annul_${suffix}`;

if (!dbAvailable) {
  console.warn(
    '[t2-annul-integration] describe.skip activo — sin PostgreSQL real; la interoperabilidad 134/135/136 no se verifica.',
  );
}

/**
 * MOD11 T2 — la 136 interoperando con la 134 y la 135 intactas, contra
 * PostgreSQL real en schema aislado.
 *
 * La tesis del mecanismo: la anulación (`status = CANCELLED` +
 * `is_annulled = true`) libera el origen por la 135 y entra en la purga por
 * la 134 sin tocar ninguna de las dos. Esta suite aplica las tres
 * migraciones reales sobre tablas mínimas y prueba el comportamiento, no el
 * texto del SQL:
 *
 * - el índice de origen (135) deja reinstalar el origen tras anular;
 * - el CHECK de la 136 impide `is_annulled` fuera de `CANCELLED`;
 * - la purga de la 134 anonimiza los asientos de la anulada vencida (y solo
 *   esos: la OT activa no se toca);
 * - el `down` de la 136 declara su límite ante anuladas vivas.
 */
describeWithDb('T2 migración 136 — interoperabilidad 134/135 en Postgres real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration135 = new ExecutionOrderOriginIdentity1350000000000();
  const migration136 = new ExecutionOrderAnnulmentFlag1360000000000();
  const migration134 = new AnonymizeExecutionOrderTransitionRetention1340000000000();

  const tenantId = '11111111-1111-4111-8111-111111111111';

  async function insertOrder(values: {
    number: string;
    status: string;
    originRef?: string | null;
    annulled?: boolean;
    closedAt?: string | null;
  }): Promise<string> {
    const id = `00000000-0000-4000-8000-${randomBytes(6).toString('hex')}`;
    // Evento único por fila: el índice parcial de evento (135) no es el
    // objeto bajo prueba y no debe colisionar entre siembras.
    const eventId = `11111111-1111-4111-8111-${randomBytes(6).toString('hex')}`;
    await runner.query(
      `INSERT INTO execution_orders
         (id, tenant_id, execution_order_number, schedule_event_id, origin_context,
          origin_ref_id, work_type, work_summary, planned_window_start_at,
          planned_window_end_at, status, is_annulled, closed_at)
       VALUES ($1, $2, $3, $4, 'ASSURANCE', $5, 'SUPPORT', 'Resumen T2',
         '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', $6, $7, $8)`,
      [
        id,
        tenantId,
        values.number,
        eventId,
        values.originRef ?? 'TCK-T2-001',
        values.status,
        values.annulled ?? false,
        values.closedAt ?? null,
      ],
    );
    return id;
  }

  async function insertSeat(orderId: string, changedAt: string): Promise<string> {
    const id = `00000000-0000-4000-8000-${randomBytes(6).toString('hex')}`;
    await runner.query(
      `INSERT INTO execution_order_status_transitions
         (id, tenant_id, execution_order_id, from_status, to_status,
          changed_at, changed_by, reason, correction_of_id)
       VALUES ($1, $2, $3, 'ASSIGNED', 'CANCELLED', $4,
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Motivo de prueba T2', NULL)`,
      [id, tenantId, orderId, changedAt],
    );
    return id;
  }

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
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${schema}"`);

    // Tablas mínimas con las columnas que tocan la 134, la 135 y la 136.
    await runner.query(`
      CREATE TABLE execution_orders (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        execution_order_number VARCHAR(40) NOT NULL,
        schedule_event_id UUID,
        origin_context VARCHAR(64) NOT NULL,
        origin_ref_id VARCHAR(160),
        work_type VARCHAR(32) NOT NULL,
        work_summary VARCHAR(200) NOT NULL,
        planned_window_start_at TIMESTAMPTZ,
        planned_window_end_at TIMESTAMPTZ,
        status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
        closed_at TIMESTAMPTZ
      )
    `);
    await runner.query(`
      CREATE TABLE execution_order_status_transitions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        execution_order_id UUID NOT NULL,
        from_status VARCHAR(40) NOT NULL,
        to_status VARCHAR(40) NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL,
        changed_by UUID NOT NULL,
        reason VARCHAR(255),
        correction_of_id UUID
      )
    `);
    // La purga de la 134 recorre cinco tablas antes de los asientos; sin
    // ellas la función falla por relación inexistente antes del paso 6.
    // Mínimas: solo las columnas que la función toca.
    await runner.query(`
      CREATE TABLE execution_order_idempotency_records (
        id UUID PRIMARY KEY,
        expires_at TIMESTAMPTZ,
        result_status VARCHAR(32),
        created_at TIMESTAMPTZ,
        evidence_upload_intent_id UUID
      )
    `);
    await runner.query(`
      CREATE TABLE execution_order_outbox_events (
        id UUID PRIMARY KEY,
        published_at TIMESTAMPTZ
      )
    `);
    await runner.query(`
      CREATE TABLE execution_order_inbox_events (
        id UUID PRIMARY KEY,
        processed_at TIMESTAMPTZ
      )
    `);
    await runner.query(`
      CREATE TABLE execution_order_audit_intents (
        id UUID PRIMARY KEY,
        delivered_at TIMESTAMPTZ
      )
    `);
    await runner.query(`
      CREATE TABLE execution_order_evidence_upload_intents (
        id UUID PRIMARY KEY,
        expires_at TIMESTAMPTZ
      )
    `);

    await migration135.up(runner);
    await migration136.up(runner);
    await migration134.up(runner);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        await runner.query(`SET search_path TO public`);
        await runner.release();
      }
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await dataSource.destroy();
      }
    } catch {
      // Limpieza best-effort sobre schema efímero.
    }
  });

  it('la anulada libera su origen por la 135 sin tocarla', async () => {
    await insertOrder({ number: 'OTE-T2-ACTIVA', status: 'ASSIGNED' });
    // Mismo origen activo: colisiona (la guarda vive).
    await expect(insertOrder({ number: 'OTE-T2-DUP', status: 'ASSIGNED' })).rejects.toMatchObject({
      code: '23505',
    });

    // Anular = CANCELLED + flag: el predicado la saca del índice.
    await runner.query(
      `UPDATE execution_orders SET status = 'CANCELLED', is_annulled = true
        WHERE execution_order_number = 'OTE-T2-ACTIVA'`,
    );
    // El trabajo legítimo se puede volver a crear (invariante 1).
    await insertOrder({ number: 'OTE-T2-REINSTALADA', status: 'ASSIGNED' });
    const count = (await runner.query(
      `SELECT COUNT(*)::int AS total FROM execution_orders
        WHERE origin_ref_id = 'TCK-T2-001' AND status <> 'CANCELLED'`,
    )) as Array<{ total: number }>;
    expect(count[0]?.total).toBe(1);
  });

  it('el CHECK impide is_annulled fuera de CANCELLED', async () => {
    await insertOrder({ number: 'OTE-T2-VIVA', status: 'IN_PROGRESS', originRef: 'TCK-T2-002' });
    await expect(
      runner.query(
        `UPDATE execution_orders SET is_annulled = true
          WHERE execution_order_number = 'OTE-T2-VIVA'`,
      ),
    ).rejects.toThrow(/chk_execution_orders_annulled_cancelled/);
  });

  it('la purga de la 134 alcanza a la anulada vencida y respeta a la activa (invariante 2)', async () => {
    const old = new Date(Date.now() - 30 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const annulledId = await insertOrder({
      number: 'OTE-T2-ANULADA',
      status: 'CANCELLED',
      originRef: 'TCK-T2-003',
      annulled: true,
      closedAt: old,
    });
    const seatId = await insertSeat(annulledId, old);
    const activeId = await insertOrder({
      number: 'OTE-T2-OTRA',
      status: 'IN_PROGRESS',
      originRef: 'TCK-T2-004',
    });
    const activeSeatId = await insertSeat(activeId, old);

    const purged = (await runner.query(
      `SELECT * FROM purge_execution_order_retention_batch(500)`,
    )) as Array<{ status_transitions_anonymized: string }>;
    expect(Number(purged[0]?.status_transitions_anonymized)).toBeGreaterThanOrEqual(1);

    const seats = (await runner.query(
      `SELECT id, changed_by::text AS changed_by, reason
         FROM execution_order_status_transitions WHERE id IN ($1, $2)`,
      [seatId, activeSeatId],
    )) as Array<{ id: string; changed_by: string; reason: string | null }>;
    const annulledSeat = seats.find((s) => s.id === seatId);
    const activeSeat = seats.find((s) => s.id === activeSeatId);
    expect(annulledSeat?.changed_by).toBe('00000000-0000-0000-0000-000000000000');
    expect(annulledSeat?.reason).toBeNull();
    // La OT activa no vence aunque su asiento sea viejo: el filtro es por
    // estado del padre, no por antigüedad de la fila.
    expect(activeSeat?.changed_by).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('el down de la 136 declara su límite ante anuladas vivas', async () => {
    await expect(migration136.down(runner)).rejects.toThrow(
      /Rollback de ExecutionOrderAnnulmentFlag bloqueado: [1-9]\d* OT\(s\) anulada\(s\)/,
    );
  });
});
