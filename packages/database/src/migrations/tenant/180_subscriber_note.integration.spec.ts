import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { SubscriberNote1800000000180 } from './180_subscriber_note';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 180 requiere una base de pruebas aprobada (test o iwana_it_*).');
}
jest.setTimeout(900_000);

describePg('180 — notas manuales del suscriptor (MOD05 D3)', () => {
  const schema = `tenant_it180_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const migration = new SubscriberNote1800000000180();
  let ds: DataSource;
  let qr: QueryRunner;

  const tableExists = async (): Promise<boolean> => {
    const rows = (await qr.query(
      `SELECT to_regclass('subscriber_note') IS NOT NULL AS present`,
    )) as Array<{
      present: boolean;
    }>;
    return rows[0]?.present === true;
  };

  async function insertSubscriber(): Promise<string> {
    const id = randomUUID();
    await qr.query(
      `INSERT INTO subscribers
        (id, tenant_id, person_type, customer_segment, document_type, document_number_encrypted,
         first_name, last_name, stratum, vat_treatment, address, created_by)
       VALUES ($1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado', 'Titular',
               'Sintético', 3, 'STANDARD', 'Dirección sintética', $3)`,
      [id, tenantId, actorId],
    );
    return id;
  }

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      ...resolveMigrationDbCredentials(),
      database: process.env['DB_NAME'] ?? 'test',
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    qr = ds.createQueryRunner();
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(
      `INSERT INTO public.tenants (id,name,slug,schema_name,contact_email,status)
       VALUES ($1,'Fixture 180',$2,$2,'it180@invalid.example','INACTIVE')`,
      [tenantId, schema],
    );
    await qr.query(`SET search_path TO "${schema}", public`);
    const index = TENANT_MIGRATIONS.findIndex((M) => new M().name === migration.name);
    expect(index).toBe(TENANT_MIGRATIONS.length - 1);
    for (const M of TENANT_MIGRATIONS.slice(0, index)) await new M().up(qr);
  });

  afterAll(async () => {
    delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    if (qr && !qr.isReleased) await qr.release();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('up crea la tabla con sus CHECK e índice, y es idempotente', async () => {
    await migration.up(qr);
    await migration.up(qr);
    expect(await tableExists()).toBe(true);
    const index = (await qr.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = $1 AND indexname = 'idx_subscriber_note_subscriber_created'`,
      [schema],
    )) as Array<{ indexdef: string }>;
    expect(index[0]?.indexdef).toContain('subscriber_id, created_at DESC, id DESC');

    const subscriberId = await insertSubscriber();
    const insert = (body: string, subscriber = subscriberId) =>
      qr.query(
        `INSERT INTO subscriber_note (subscriber_id, body_encrypted, created_by) VALUES ($1,$2,$3)`,
        [subscriber, body, actorId],
      );
    await insert('cifrado-sintetico');
    await expect(insert('')).rejects.toThrow(/chk_subscriber_note_body_encrypted/u);
    await expect(insert('nota', randomUUID())).rejects.toThrow(/foreign key/iu);
  });

  it('down se bloquea con notas y revierte limpio sin ellas; up vuelve a aplicar', async () => {
    await expect(migration.down(qr)).rejects.toThrow(/Rollback de SubscriberNote bloqueado/u);
    expect(await tableExists()).toBe(true);

    await qr.query('DELETE FROM subscriber_note');
    await migration.down(qr);
    expect(await tableExists()).toBe(false);
    await migration.down(qr);

    await migration.up(qr);
    expect(await tableExists()).toBe(true);
    await qr.query(
      `INSERT INTO subscriber_note (subscriber_id, body_encrypted, created_by)
       SELECT id, 'nota', $1 FROM subscribers LIMIT 1`,
      [actorId],
    );
    process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = 'true';
    await migration.down(qr);
    expect(await tableExists()).toBe(false);
  });
});
