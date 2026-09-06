import { DataSource, QueryRunner } from 'typeorm';
import { StockIssueStatus } from '@iwana/shared';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { StockIssueLineSerial } from '../../entities/stock-issue-line-serial.entity';
import { CreateStockIssueLineSerials1260000000000 } from './126_create_stock_issue_line_serials';

/**
 * Round-trip real entidad ↔ DDL (MOD12 S2 · hallazgo C1 de la auditoría S2-backend).
 *
 * El spec unitario `stock-issue-line-serial.entity.spec.ts` fija la metadata
 * (`options.name` snake); este spec ejecuta SQL de verdad contra PostgreSQL:
 * levanta el DDL real de la migración 126 en un schema efímero (con padres
 * mínimos para las FKs y el enum de la 057) y hace save + find con el
 * repositorio/entidad. Antes del fix moría con 42703
 * (`column "issueStatus" does not exist`).
 *
 * `pnpm --filter @iwana/db test:integration`. Sin PostgreSQL alcanzable se
 * omite con banner en consola — nunca en silencio.
 */
const SCHEMA = 'it_126_serials';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ISSUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ASSET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';

if (!dbAvailable) {
  console.warn(
    '[126-integration] describe.skip activo — sin PostgreSQL alcanzable, el round-trip entidad ↔ DDL queda sin cobertura de runtime.',
  );
}

const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb(
  '126 stock_issue_line_serials — round-trip entidad ↔ DDL contra PostgreSQL real',
  () => {
    let dataSource: DataSource;
    let runner: QueryRunner;

    beforeAll(async () => {
      const credentials = resolveMigrationDbCredentials();

      dataSource = new DataSource({
        type: 'postgres',
        host: process.env['DB_HOST'] ?? 'localhost',
        port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
        username: credentials.username,
        password: credentials.password,
        database: process.env['DB_NAME'] ?? 'iwana',
        entities: [StockIssueLineSerial],
        migrations: [],
        synchronize: false,
        logging: false,
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

      // Una sola conexión fijada: el `SET search_path` de sesión sobrevive a
      // todas sus queries (DDL de la migración + DML de la entidad).
      runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.query(`SET search_path TO "${SCHEMA}"`);

      // Padres mínimos para las FKs de la 126 y el enum de la 057 (la 126 lo
      // reutiliza, no lo crea). Solo las columnas que tocan la 126: PKs para las
      // FKs, tenant_id para el pre-vuelo 0b y las columnas del SELECT del
      // backfill (incluidas created_at/updated_at, que la hija hereda).
      await runner.query(
        `CREATE TYPE stock_issue_status AS ENUM ('DRAFT','REQUESTED','APPROVED','PICKING','READY_TO_DISPATCH','DISPATCHED','RECEIVED','CANCELLED')`,
      );
      await runner.query(
        `CREATE TABLE stock_issues (id UUID PRIMARY KEY, tenant_id UUID NOT NULL, status stock_issue_status NOT NULL DEFAULT 'DRAFT')`,
      );
      await runner.query(
        `CREATE TABLE stock_issue_lines (id UUID PRIMARY KEY, tenant_id UUID NOT NULL, issue_id UUID NOT NULL REFERENCES stock_issues (id), serialized_asset_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      );
      await new CreateStockIssueLineSerials1260000000000().up(runner);

      await runner.query(
        `INSERT INTO stock_issues (id, tenant_id, status) VALUES ('${ISSUE_ID}', '${TENANT_ID}', 'DRAFT')`,
      );
      await runner.query(
        `INSERT INTO stock_issue_lines (id, tenant_id, issue_id) VALUES ('${LINE_ID}', '${TENANT_ID}', '${ISSUE_ID}')`,
      );
    });

    afterAll(async () => {
      if (runner) {
        await runner.release();
      }

      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        await cleanup.connect();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    });

    it('hace round-trip save + find con la entidad (la columna espejo es issue_status)', async () => {
      const repository = runner.manager.getRepository(StockIssueLineSerial);

      const saved = await repository.save(
        repository.create({
          tenantId: TENANT_ID,
          lineId: LINE_ID,
          issueId: ISSUE_ID,
          issueStatus: StockIssueStatus.DRAFT,
          serializedAssetId: ASSET_ID,
        }),
      );

      expect(saved.id).toBeDefined();

      const found = await repository.find({ where: { issueId: ISSUE_ID } });

      expect(found).toHaveLength(1);
      expect(found[0]?.tenantId).toBe(TENANT_ID);
      expect(found[0]?.lineId).toBe(LINE_ID);
      expect(found[0]?.issueStatus).toBe(StockIssueStatus.DRAFT);
      expect(found[0]?.serializedAssetId).toBe(ASSET_ID);
      expect(found[0]?.createdAt).toBeInstanceOf(Date);
      expect(found[0]?.updatedAt).toBeInstanceOf(Date);
    });

    it('filtra por issueStatus con el nombre snake del DDL', async () => {
      const rows = await runner.manager
        .createQueryBuilder(StockIssueLineSerial, 'serial')
        .where('serial.tenantId = :tenantId', { tenantId: TENANT_ID })
        .andWhere('serial.issueStatus = :status', { status: StockIssueStatus.DRAFT })
        .getMany();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.serializedAssetId).toBe(ASSET_ID);
    });

    it('el re-run de up hace backfill del singular nuevo sin duplicar (S2.1 · B1)', async () => {
      const lineCreatedAt = new Date('2026-01-02T03:04:05.000Z');
      const secondIssueId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      const secondLineId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      await runner.query(
        `INSERT INTO stock_issues (id, tenant_id, status) VALUES ('${secondIssueId}', '${TENANT_ID}', 'REQUESTED')`,
      );
      await runner.query(
        `INSERT INTO stock_issue_lines (id, tenant_id, issue_id, serialized_asset_id, created_at, updated_at) VALUES ('${secondLineId}', '${TENANT_ID}', '${secondIssueId}', '${ASSET_ID}', '${lineCreatedAt.toISOString()}', '${lineCreatedAt.toISOString()}')`,
      );

      // Pre-vuelo en verde (padre existe, mismo tenant, sin colisiones) y el
      // backfill idempotente inserta solo la línea nueva.
      await new CreateStockIssueLineSerials1260000000000().up(runner);

      const repository = runner.manager.getRepository(StockIssueLineSerial);
      const rows = await repository.find({ where: { tenantId: TENANT_ID } });
      expect(rows).toHaveLength(2);
      const backfilled = rows.find((row) => row.lineId === secondLineId);
      expect(backfilled?.issueStatus).toBe(StockIssueStatus.REQUESTED);
      // La hija hereda las marcas de la línea, no NOW().
      expect(backfilled?.createdAt?.getTime()).toBe(lineCreatedAt.getTime());

      // Tercer run: nada nuevo que copiar, cero duplicados, post-vuelo en verde.
      await new CreateStockIssueLineSerials1260000000000().up(runner);
      const rerun = await repository.find({ where: { tenantId: TENANT_ID } });
      expect(rerun).toHaveLength(2);
    });
  },
);
