import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { SubscriberNoteGuard1810000000181 } from './181_subscriber_note_guard';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 181 requiere una base de pruebas aprobada (test o iwana_it_*).');
}
jest.setTimeout(900_000);

describePg('181 — guarda de subscriber_note (M-1, M-2)', () => {
  const schema = `tenant_it181_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const migration = new SubscriberNoteGuard1810000000181();
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
       VALUES ($1,'Fixture 181',$2,$2,'it181@invalid.example','INACTIVE')`,
      [tenantId, schema],
    );
    await qr.query(`SET search_path TO "${schema}", public`);
    const index = TENANT_MIGRATIONS.findIndex((M) => new M().name === migration.name);
    expect(index).toBeGreaterThanOrEqual(0);
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

  const triggerCount = async (): Promise<number> => {
    const rows = (await qr.query(
      `SELECT COUNT(*)::int AS total FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND t.tgname = 'trg_subscriber_note_guard'`,
      [schema],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  };
  const insert = (subscriberId: string) =>
    qr.query(
      `INSERT INTO subscriber_note (subscriber_id, body_encrypted, created_by)
       VALUES ($1, 'cifrado-sintetico', $2) RETURNING id`,
      [subscriberId, actorId],
    ) as Promise<Array<{ id: string }>>;

  it('up es idempotente y aplica M-1, M-2 y la excepción de supresión', async () => {
    await migration.up(qr);
    await migration.up(qr);
    expect(await triggerCount()).toBe(1);

    const subscriberId = await insertSubscriber();
    const [note] = await insert(subscriberId);
    await expect(qr.query('DELETE FROM subscriber_note WHERE id = $1', [note?.id])).rejects.toThrow(
      /solo inserción/u,
    );
    await qr.query(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [subscriberId, randomUUID()],
    );
    await expect(insert(subscriberId)).rejects.toThrow(/titular anonimizado/u);

    await qr.startTransaction();
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
    await qr.query(`UPDATE subscriber_note SET body_encrypted = 'marcador' WHERE id = $1`, [
      note?.id,
    ]);
    await qr.commitTransaction();
    const rows = (await qr.query('SELECT body_encrypted FROM subscriber_note WHERE id = $1', [
      note?.id,
    ])) as Array<{ body_encrypted: string }>;
    expect(rows[0]?.body_encrypted).toBe('marcador');
  });

  it('K2: con iwana.pii_reencrypt solo pasa el UPDATE de body_encrypted; sin el GUC sigue la guarda', async () => {
    const subscriberId = await insertSubscriber();
    const [note] = await insert(subscriberId);
    const withK2 = async (sql: string): Promise<void> => {
      await qr.startTransaction();
      try {
        await qr.query(`SELECT set_config('iwana.pii_reencrypt', 'on', true)`);
        await qr.query(sql, [note?.id]);
        await qr.commitTransaction();
      } catch (error) {
        await qr.rollbackTransaction();
        throw error;
      }
    };
    await withK2(`UPDATE subscriber_note SET body_encrypted = 'recifrado' WHERE id = $1`);
    await expect(
      withK2(`UPDATE subscriber_note SET created_at = created_at - interval '1 day' WHERE id = $1`),
    ).rejects.toThrow(/solo puede cambiar body_encrypted/u);
    await expect(
      withK2(
        `UPDATE subscriber_note SET body_encrypted = 'x', created_by = gen_random_uuid() WHERE id = $1`,
      ),
    ).rejects.toThrow(/solo puede cambiar body_encrypted/u);
    await expect(withK2(`DELETE FROM subscriber_note WHERE id = $1`)).rejects.toThrow(
      /solo puede cambiar body_encrypted/u,
    );
    await expect(
      qr.query(`UPDATE subscriber_note SET body_encrypted = 'sin-guc' WHERE id = $1`, [note?.id]),
    ).rejects.toThrow(/solo inserción/u);

    await qr.query(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [subscriberId, randomUUID()],
    );
    await withK2(`UPDATE subscriber_note SET body_encrypted = 'recifrado-anon' WHERE id = $1`);
    await expect(
      qr.query(`UPDATE subscriber_note SET body_encrypted = 'sin-guc' WHERE id = $1`, [note?.id]),
    ).rejects.toThrow(/titular anonimizado/u);
    const rows = (await qr.query('SELECT body_encrypted FROM subscriber_note WHERE id = $1', [
      note?.id,
    ])) as Array<{ body_encrypted: string }>;
    expect(rows[0]?.body_encrypted).toBe('recifrado-anon');
  });

  it('down retira trigger y función; up vuelve a aplicar', async () => {
    await migration.down(qr);
    await migration.down(qr);
    expect(await triggerCount()).toBe(0);
    await qr.query('DELETE FROM subscriber_note');
    await migration.up(qr);
    expect(await triggerCount()).toBe(1);
  });
});
