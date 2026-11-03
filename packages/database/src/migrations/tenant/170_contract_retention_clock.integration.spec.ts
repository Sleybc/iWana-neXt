import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { ContractRetentionClock1700000000170 } from './170_contract_retention_clock';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(dbiw|test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 170 requiere una base de pruebas aprobada.');
}
jest.setTimeout(900_000);

describePg('170 — reloj de retención contra PostgreSQL real', () => {
  const schema = `tenant_it170_${randomUUID().replaceAll('-', '')}`;
  const tenantId = randomUUID();
  const healthy = randomUUID();
  const anonymized = randomUUID();
  const migration = new ContractRetentionClock1700000000170();
  let ds: DataSource;
  let qr: QueryRunner;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    ds = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      ...credentials,
      database: process.env['DB_NAME'] ?? 'dbiw',
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    qr = ds.createQueryRunner();
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(
      `INSERT INTO public.tenants (id,name,slug,schema_name,contact_email,status)
      VALUES ($1,'Fixture O1',$2,$2,'o1@invalid.example','INACTIVE')`,
      [tenantId, schema],
    );
    await qr.query(`SET search_path TO "${schema}", public`);
    const last = TENANT_MIGRATIONS.findIndex(
      (Migration) => new Migration().name === migration.name,
    );
    expect(last).toBeGreaterThan(0);
    for (const Migration of TENANT_MIGRATIONS.slice(0, last)) {
      await new Migration().up(qr);
    }
    for (const id of [healthy, anonymized]) {
      await qr.query(
        `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,
        document_type,document_number_encrypted,first_name,last_name,stratum,
        email_encrypted,phone_encrypted,vat_treatment,tax_regime,address,created_by)
        VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','O1',3,
          'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$3)`,
        [id, tenantId, randomUUID()],
      );
    }
  });

  afterAll(async () => {
    if (qr && !qr.isReleased) await qr.release();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('CA-O1-07: backfill por candidato, anonimizado excluido y up → down → up', async () => {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    for (let i = 0; i < ids.length; i++) {
      await qr.query(
        `INSERT INTO contracts (id,tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,status_changed_at,updated_at)
        VALUES ($1,$2,$3,'fixture','{}',$4,$5,'2026-01-04Z')`,
        [
          ids[i],
          tenantId,
          i === 4 ? anonymized : healthy,
          i === 2 ? 'ARCHIVED' : 'TERMINATED',
          i === 3 ? null : '2026-01-03Z',
        ],
      );
    }
    for (const date of ['2026-01-02Z', '2026-01-01Z']) {
      await qr.query(
        `INSERT INTO crm_lifecycle_changes
        (tenant_id,entity_type,entity_id,subscriber_id,from_status,to_status,reason_code,source,batch_id,changed_at)
        VALUES ($1,'CONTRACT',$2,$3,'ACTIVE','TERMINATED','SOLICITUD_TITULAR','MANUAL',$4,$5)`,
        [tenantId, ids[0], healthy, randomUUID(), date],
      );
    }
    await qr.query(
      'UPDATE subscribers SET anonymized_at=now(),anonymized_request_id=$2 WHERE id=$1',
      [anonymized, randomUUID()],
    );
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const expected = ['2026-01-01', '2026-01-03', '2026-01-03', '2026-01-04', null];
    for (let round = 0; round < 2; round++) {
      await migration.up(qr);
      for (let i = 0; i < ids.length; i++) {
        const rows: Array<{ anchor: string | null }> = await qr.query(
          "SELECT to_char(terminated_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS anchor FROM contracts WHERE id=$1",
          [ids[i]],
        );
        expect(rows[0]?.anchor).toBe(expected[i]);
      }
      for (const candidate of [1, 2, 3, 4])
        expect(log).toHaveBeenCalledWith(`[170] O1 backfill candidate=${candidate} count=1`);
      const emitted = log.mock.calls.map(([message]) => String(message));
      const backfillLines = emitted.filter((message) => message.startsWith('[170]'));
      expect(backfillLines).toHaveLength(4);
      for (const line of backfillLines)
        expect(line).toMatch(/^\[170\] O1 backfill candidate=[1-4] count=\d+$/u);
      log.mockClear();
      if (round === 0) await migration.down(qr);
    }
    log.mockRestore();
  });

  it('CA-O1-05/06: SQL directo exige fecha, la conserva y convive con la 169', async () => {
    const id = randomUUID();
    await qr.query(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,plan_id,plan_snapshot_json,status)
      VALUES ($1,$2,$3,'fixture','{}','SUSPENDED')`,
      [id, tenantId, healthy],
    );
    for (const status of ['TERMINATED', 'ARCHIVED']) {
      await expect(
        qr.query('UPDATE contracts SET status=$2 WHERE id=$1', [id, status]),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    }
    await qr.query(
      "UPDATE contracts SET status='TERMINATED',terminated_at='2020-01-01Z' WHERE id=$1",
      [id],
    );
    for (const anchor of [null, '2021-01-01Z'])
      await expect(
        qr.query('UPDATE contracts SET terminated_at=$2 WHERE id=$1', [id, anchor]),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await qr.query('UPDATE contracts SET subscriber_id=$2 WHERE id=$1', [id, anonymized]);
    await qr.query("UPDATE contracts SET status='ARCHIVED' WHERE id=$1", [id]);
    const rows: Array<{ anchor: Date }> = await qr.query(
      'SELECT terminated_at AS anchor FROM contracts WHERE id=$1',
      [id],
    );
    expect(rows[0]?.anchor.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    await qr.query(
      "UPDATE contracts SET status='ARCHIVED' WHERE subscriber_id=$1 AND terminated_at IS NULL",
      [anonymized],
    );
    const legacy: Array<{ status: string; terminated_at: Date | null }> = await qr.query(
      'SELECT status,terminated_at FROM contracts WHERE subscriber_id=$1 AND terminated_at IS NULL',
      [anonymized],
    );
    expect(legacy).toEqual([{ status: 'ARCHIVED', terminated_at: null }]);
  });
});
