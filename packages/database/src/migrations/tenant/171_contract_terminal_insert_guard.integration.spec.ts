import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { ContractTerminalInsertGuard1710000000171 } from './171_contract_terminal_insert_guard';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(dbiw|test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 171 requiere una base de pruebas aprobada.');
}
jest.setTimeout(900_000);

describePg('171 — contratos terminales en INSERT contra PostgreSQL real', () => {
  const schema = `tenant_it171_${randomUUID().replaceAll('-', '')}`;
  const tenantId = randomUUID();
  const subscriberId = randomUUID();
  const migration = new ContractTerminalInsertGuard1710000000171();
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
    const targetIndex = TENANT_MIGRATIONS.findIndex(
      (Migration) => new Migration().name === migration.name,
    );
    expect(targetIndex).toBeGreaterThan(0);
    for (const Migration of TENANT_MIGRATIONS.slice(0, targetIndex)) {
      await new Migration().up(qr);
    }
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,
      document_type,document_number_encrypted,first_name,last_name,stratum,
      email_encrypted,phone_encrypted,vat_treatment,tax_regime,address,created_by)
      VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','O1',3,
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$3)`,
      [subscriberId, tenantId, randomUUID()],
    );
  });

  afterAll(async () => {
    if (qr && !qr.isReleased) await qr.release();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('rechaza INSERT terminal sin fecha y conserva el estado de 170 al revertir y reaplicar', async () => {
    async function insert(status: string, terminatedAt: string | null = null): Promise<string> {
      const id = randomUUID();
      await qr.query(
        `INSERT INTO contracts
          (id,tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,terminated_at)
         VALUES ($1,$2,$3,'fixture','{}',$4,$5)`,
        [id, tenantId, subscriberId, status, terminatedAt],
      );
      return id;
    }

    await migration.up(qr);

    await expect(insert('TERMINATED')).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(insert('ARCHIVED')).rejects.toMatchObject({
      driverError: { code: '23514' },
    });

    const terminalId = await insert('TERMINATED', '2026-01-02T03:04:05.000Z');
    const draftId = await insert('DRAFT');
    const anchored: Array<{ terminated_at: Date }> = await qr.query(
      'SELECT terminated_at FROM contracts WHERE id=$1',
      [terminalId],
    );
    expect(anchored[0]?.terminated_at.toISOString()).toBe('2026-01-02T03:04:05.000Z');

    await expect(
      qr.query("UPDATE contracts SET status='TERMINATED' WHERE id=$1", [draftId]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await qr.query(
      "UPDATE contracts SET status='TERMINATED',terminated_at='2026-01-03T00:00:00Z' WHERE id=$1",
      [draftId],
    );
    await expect(
      qr.query("UPDATE contracts SET terminated_at='2026-01-04T00:00:00Z' WHERE id=$1", [draftId]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });

    await migration.down(qr);
    const legacyId = await insert('ARCHIVED');
    const legacy: Array<{ status: string; terminated_at: Date | null }> = await qr.query(
      'SELECT status,terminated_at FROM contracts WHERE id=$1',
      [legacyId],
    );
    expect(legacy).toEqual([{ status: 'ARCHIVED', terminated_at: null }]);

    const afterDownDraftId = await insert('DRAFT');
    await expect(
      qr.query("UPDATE contracts SET status='ARCHIVED' WHERE id=$1", [afterDownDraftId]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await qr.query(
      "UPDATE contracts SET status='ARCHIVED',terminated_at='2026-01-05T00:00:00Z' WHERE id=$1",
      [afterDownDraftId],
    );
    await expect(
      qr.query("UPDATE contracts SET terminated_at='2026-01-06T00:00:00Z' WHERE id=$1", [
        afterDownDraftId,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });

    await migration.up(qr);
    await expect(insert('TERMINATED')).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
  });
});
