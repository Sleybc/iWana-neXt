import { randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { HardenPurchaseRequestLineAwards1280000000000 } from './128_harden_purchase_request_line_awards';

/**
 * Integración 128 contra PostgreSQL real (patrón r2_4/126): levanta el mínimo
 * de tablas de compras (047/049) en un schema efímero y ejecuta up/down con
 * datos sembrados — dedupe trivial, fallo ruidoso multi-proveedor y backfill
 * D4 selectivo.
 *
 * `IWANA_DB_INTEGRATION_AVAILABLE=true` + `pnpm --filter @iwana/db
 * test:integration`. Sin PostgreSQL alcanzable se omite con banner — nunca en
 * silencio.
 */
const SCHEMA = `it_128_pr_awards_${randomUUID().slice(0, 8)}`;

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

if (!dbAvailable) {
  console.warn(
    '[128-integration] describe.skip activo — sin PostgreSQL real; no se ejecuta el round-trip con datos.',
  );
}

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describeWithDb('128 harden purchase_request_line_awards — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  const LINE_TRIVIAL = randomUUID();
  const LINE_CONFLICT = randomUUID();
  const PARTY_A = randomUUID();
  const PARTY_B = randomUUID();

  /** Línea de la solicitud mixta: la 1 viva (OPEN), la 2 ya ordenada. */
  const REQ_RESCUED = randomUUID();
  const REQ_RESCUED_LINE_OPEN = randomUUID();
  const REQ_RESCUED_LINE_AWARDED = randomUUID();
  const REQ_ALREADY_COVERED = randomUUID();
  const REQ_ALREADY_COVERED_LINE = randomUUID();

  async function insertAward(
    lineId: string,
    partyId: string,
    createdAt: string,
    quantity = '1.00',
  ): Promise<void> {
    await runner.query(
      `INSERT INTO purchase_request_line_awards
         (id, tenant_id, purchase_request_line_id, awarded_party_ref_id, awarded_quantity, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::timestamptz, $5::timestamptz)`,
      [TENANT, lineId, partyId, quantity, createdAt],
    );
  }

  async function insertRequest(requestId: string, status: string): Promise<void> {
    await runner.query(
      `INSERT INTO purchase_requests (id, tenant_id, status) VALUES ($1, $2, $3)`,
      [requestId, TENANT, status],
    );
  }

  async function insertRequestLine(
    lineId: string,
    requestId: string,
    lineStatus: string,
  ): Promise<void> {
    await runner.query(
      `INSERT INTO purchase_request_lines (id, tenant_id, purchase_request_id, line_status)
       VALUES ($1, $2, $3, $4)`,
      [lineId, TENANT, requestId, lineStatus],
    );
  }

  async function countAwards(lineId: string): Promise<number> {
    const rows = (await runner.query(
      `SELECT COUNT(*)::int AS total FROM purchase_request_line_awards WHERE purchase_request_line_id = $1`,
      [lineId],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async function requestStatus(requestId: string): Promise<string | null> {
    const rows = (await runner.query(
      `SELECT status::text AS status FROM purchase_requests WHERE id = $1`,
      [requestId],
    )) as Array<{ status: string | null }>;
    return rows[0]?.status ?? null;
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
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);

    // Mínimo de compras (047/049) suficiente para la migración.
    await runner.query(`
      CREATE TYPE purchase_request_status AS ENUM (
        'DRAFT', 'PENDING_QUOTES', 'PENDING_APPROVAL', 'APPROVED',
        'REJECTED', 'CANCELLED', 'CONVERTED_TO_PO'
      )
    `);
    await runner.query(`
      CREATE TYPE purchase_request_line_status AS ENUM (
        'OPEN', 'PENDING_QUOTE', 'AWARDED', 'ORDERED',
        'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'REJECTED'
      )
    `);
    await runner.query(`
      CREATE TABLE purchase_requests (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        status purchase_request_status NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`
      CREATE TABLE purchase_request_lines (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        purchase_request_id UUID NOT NULL REFERENCES purchase_requests (id),
        line_status purchase_request_line_status NOT NULL
      )
    `);
    await runner.query(`
      CREATE TABLE purchase_request_line_awards (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        purchase_request_line_id UUID NOT NULL REFERENCES purchase_request_lines (id),
        awarded_party_ref_id UUID NOT NULL,
        awarded_quantity NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_request_line_awards PRIMARY KEY (id)
      )
    `);

    // Solicitud contenedora de las líneas de adjudicación (APPROVED: el
    // backfill no la mira; sus líneas están AWARDED pero su cabecera no está
    // CONVERTED_TO_PO).
    const REQ_HOLDER = randomUUID();
    await insertRequest(REQ_HOLDER, 'APPROVED');
    await insertRequestLine(LINE_TRIVIAL, REQ_HOLDER, 'AWARDED');
    await insertRequestLine(LINE_CONFLICT, REQ_HOLDER, 'AWARDED');

    // Caso dedupe trivial: 2 filas del MISMO proveedor; gana la más antigua.
    await insertAward(LINE_TRIVIAL, PARTY_A, '2026-01-01 10:00');
    await insertAward(LINE_TRIVIAL, PARTY_A, '2026-02-01 10:00');

    // Caso ruidoso: la misma línea duplicada por DOS proveedores → debe abortar.
    await insertAward(LINE_CONFLICT, PARTY_A, '2026-01-01 10:00');
    await insertAward(LINE_CONFLICT, PARTY_A, '2026-02-01 10:00');
    await insertAward(LINE_CONFLICT, PARTY_B, '2026-01-15 10:00');
    await insertAward(LINE_CONFLICT, PARTY_B, '2026-02-15 10:00');

    // Solicitud varada: CONVERTED_TO_PO con líneas vivas → el backfill la rescata.
    await insertRequest(REQ_RESCUED, 'CONVERTED_TO_PO');
    await insertRequestLine(REQ_RESCUED_LINE_OPEN, REQ_RESCUED, 'OPEN');
    await insertRequestLine(REQ_RESCUED_LINE_AWARDED, REQ_RESCUED, 'AWARDED');

    // Solicitud legítimamente consumida: todas sus líneas ordenadas → NO se toca.
    await insertRequest(REQ_ALREADY_COVERED, 'CONVERTED_TO_PO');
    await insertRequestLine(REQ_ALREADY_COVERED_LINE, REQ_ALREADY_COVERED, 'ORDERED');
  });

  afterAll(async () => {
    await runner?.release();

    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('pre-vuelo B aborta con duplicados de distintos proveedores sobre la misma línea, sin borrar nada', async () => {
    const migration = new HardenPurchaseRequestLineAwards1280000000000();

    const error = await migration.up(runner).then(
      () => {
        throw new Error('up() debía abortar en el pre-vuelo B.');
      },
      (failure: unknown) => failure as Error,
    );

    expect(error.message).toMatch(/128 pre-vuelo B/);
    expect(error.message).toContain(`linea=${LINE_CONFLICT}`);
    expect(error.message).toContain(PARTY_A);
    expect(error.message).toContain(PARTY_B);

    // Nada fue eliminado ni transformado antes del aborto.
    expect(await countAwards(LINE_CONFLICT)).toBe(4);
    expect(await requestStatus(REQ_RESCUED)).toBe('CONVERTED_TO_PO');
  });

  it('dedupe conserva la más antigua por (línea, proveedor) y el backfill rescata solo la solicitud con líneas vivas', async () => {
    // Se retira el conflicto multi-proveedor (decisión de negocio previa a la migración):
    // quedan duplicados de un único proveedor, que el dedupe mecánico sí resuelve.
    await runner.query(
      `
      DELETE FROM purchase_request_line_awards
      WHERE purchase_request_line_id = $1 AND awarded_party_ref_id = $2
    `,
      [LINE_CONFLICT, PARTY_B],
    );

    const migration = new HardenPurchaseRequestLineAwards1280000000000();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await migration.up(runner);
    logSpy.mockRestore();

    // Dedupe trivial: 1 fila, la más antigua (enero), misma cantidad.
    expect(await countAwards(LINE_TRIVIAL)).toBe(1);
    const oldest = (await runner.query(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS created, awarded_quantity
       FROM purchase_request_line_awards WHERE purchase_request_line_id = $1`,
      [LINE_TRIVIAL],
    )) as Array<{ created: string; awarded_quantity: string }>;
    expect(oldest[0]?.created).toBe('2026-01-01');

    // Dedupe del proveedor A en la línea conflictiva: 1 fila.
    expect(await countAwards(LINE_CONFLICT)).toBe(1);

    // DDL: columnas, CHECK e índice único presentes.
    const columns = (await runner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'purchase_request_line_awards'
        AND column_name IN ('unit_cost', 'currency')
    `)) as Array<{ column_name: string }>;
    expect(columns).toHaveLength(2);

    const constraints = (await runner.query(`
      SELECT conname FROM pg_constraint
      WHERE conname = 'chk_pr_line_awards_qty_positive'
        AND conrelid = 'purchase_request_line_awards'::regclass
    `)) as Array<{ conname: string }>;
    expect(constraints).toHaveLength(1);

    const indexes = (await runner.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
        AND indexname IN ('uq_pr_line_awards_line_party', 'idx_purchase_request_line_awards_tenant_party')
    `)) as Array<{ indexname: string }>;
    expect(indexes).toHaveLength(2);

    // Backfill D4: rescata la varada; la totalmente ordenada permanece convertida.
    expect(await requestStatus(REQ_RESCUED)).toBe('APPROVED');
    expect(await requestStatus(REQ_ALREADY_COVERED)).toBe('CONVERTED_TO_PO');
  });

  it('down limpia constraints, columnas e índice propio y deja el backfill aplicado', async () => {
    const migration = new HardenPurchaseRequestLineAwards1280000000000();
    await migration.down(runner);

    const columns = (await runner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'purchase_request_line_awards'
        AND column_name IN ('unit_cost', 'currency')
    `)) as Array<{ column_name: string }>;
    expect(columns).toHaveLength(0);

    const constraints = (await runner.query(`
      SELECT conname FROM pg_constraint
      WHERE conname = 'chk_pr_line_awards_qty_positive'
        AND conrelid = 'purchase_request_line_awards'::regclass
    `)) as Array<{ conname: string }>;
    expect(constraints).toHaveLength(0);

    const uniqueIndex = (await runner.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
        AND indexname = 'uq_pr_line_awards_line_party'
    `)) as Array<{ indexname: string }>;
    expect(uniqueIndex).toHaveLength(0);

    // El índice de la 049 no se suelta.
    const partyIndex = (await runner.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
        AND indexname = 'idx_purchase_request_line_awards_tenant_party'
    `)) as Array<{ indexname: string }>;
    expect(partyIndex).toHaveLength(1);

    // El backfill NO se revierte: la solicitud rescatada sigue en APPROVED.
    expect(await requestStatus(REQ_RESCUED)).toBe('APPROVED');
  });
});
