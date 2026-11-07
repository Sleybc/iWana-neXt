import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { SubscriberDocumentNullWhenAnonymized1760000000176 } from './176_subscriber_document_null_when_anonymized';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 176 requiere una base de pruebas aprobada.');
}
jest.setTimeout(900_000);

const CONSTRAINT = 'chk_subscriber_person_fields';

interface NaturalFixture {
  document: string | null;
  anonymized: boolean;
  firstName?: string | null;
}

interface ConstraintState {
  definition: string;
  validated: boolean;
}

describePg('176 — CHECK de documento condicionado contra PostgreSQL real', () => {
  const schema = `tenant_it176_${randomUUID().replaceAll('-', '')}`;
  const tenantId = randomUUID();
  const migration = new SubscriberDocumentNullWhenAnonymized1760000000176();
  let ds: DataSource;
  let qr: QueryRunner;

  async function insertNatural(fixture: NaturalFixture): Promise<string> {
    const id = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,
        document_type,document_number_encrypted,first_name,last_name,stratum,
        email_encrypted,phone_encrypted,vat_treatment,tax_regime,address,created_by,
        anonymized_at,anonymized_request_id)
      VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC',$3,$4,'K2A',3,
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$5,$6,$7)`,
      [
        id,
        tenantId,
        fixture.document,
        fixture.firstName === undefined ? 'Fixture' : fixture.firstName,
        randomUUID(),
        fixture.anonymized ? new Date('2026-11-01T00:00:00Z') : null,
        fixture.anonymized ? randomUUID() : null,
      ],
    );
    return id;
  }

  async function insertJuridica(nit: string | null): Promise<string> {
    const id = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,nit,business_name,
        email_encrypted,phone_encrypted,vat_treatment,tax_regime,address,created_by)
      VALUES ($1,$2,'JURIDICA','CORPORATE',$3,'Fixture K2A',
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$4)`,
      [id, tenantId, nit, randomUUID()],
    );
    return id;
  }

  async function constraintState(): Promise<ConstraintState> {
    const rows: Array<{ definition: string; validated: boolean }> = await qr.query(
      `SELECT pg_get_constraintdef(c.oid) AS definition, c.convalidated AS validated
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = $1 AND t.relname = 'subscribers' AND n.nspname = $2`,
      [CONSTRAINT, schema],
    );
    expect(rows).toHaveLength(1);
    const [row] = rows;
    if (!row) throw new Error('La restricción no existe.');
    return row;
  }

  async function subscribersFingerprint(): Promise<string> {
    const rows: Array<{ fingerprint: string }> = await qr.query(
      `SELECT md5(COALESCE(string_agg(s::text, '|' ORDER BY s.id), '')) AS fingerprint
         FROM subscribers s`,
    );
    return rows[0]?.fingerprint ?? '';
  }

  async function protectionFunctionDefinition(): Promise<string> {
    const rows: Array<{ definition: string }> = await qr.query(
      `SELECT pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'titular_prevent_anonymized_mutation' AND n.nspname = $1`,
      [schema],
    );
    return rows[0]?.definition ?? '';
  }

  async function expectCheckViolation(action: Promise<unknown>): Promise<void> {
    await expect(action).rejects.toMatchObject({
      driverError: { code: '23514', constraint: CONSTRAINT },
    });
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    ds = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      ...credentials,
      database: process.env['DB_NAME'] ?? 'test',
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    qr = ds.createQueryRunner();
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(
      `INSERT INTO public.tenants (id,name,slug,schema_name,contact_email,status)
      VALUES ($1,'Fixture 176',$2,$2,'k2a@invalid.example','INACTIVE')`,
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
  });

  afterAll(async () => {
    if (qr && !qr.isReleased) await qr.release();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('CA-K2A-08: up → down → up con una fila NULL, sin tocar datos ni la 169', async () => {
    const original = await constraintState();
    expect(original.validated).toBe(true);
    const protection = await protectionFunctionDefinition();
    expect(protection).toContain('PRIVACY_TITULAR_ANONYMIZED');
    await insertNatural({ document: 'synthetic', anonymized: false });

    // Antes de la 176, ni siquiera una fila anonimizada admite el documento en NULL.
    await expectCheckViolation(insertNatural({ document: null, anonymized: true }));
    await expectCheckViolation(insertNatural({ document: null, anonymized: false }));

    const beforeUp = await subscribersFingerprint();
    await migration.up(qr);
    const relaxed = await constraintState();
    expect(relaxed.validated).toBe(true);
    expect(relaxed.definition).toContain('anonymized_at IS NOT NULL');
    expect(await subscribersFingerprint()).toBe(beforeUp);

    const nullRow = await insertNatural({ document: null, anonymized: true });
    await expectCheckViolation(insertNatural({ document: null, anonymized: false }));

    const beforeDown = await subscribersFingerprint();
    await migration.down(qr);
    const restored = await constraintState();
    expect(restored.definition).toBe(`${original.definition} NOT VALID`);
    expect(restored.validated).toBe(false);
    expect(await subscribersFingerprint()).toBe(beforeDown);
    await expectCheckViolation(
      qr.query(`ALTER TABLE subscribers VALIDATE CONSTRAINT ${CONSTRAINT}`),
    );
    await expectCheckViolation(insertNatural({ document: null, anonymized: false }));
    await expectCheckViolation(insertNatural({ document: null, anonymized: true }));

    await migration.up(qr);
    expect(await constraintState()).toEqual(relaxed);
    expect(await subscribersFingerprint()).toBe(beforeDown);
    await expectCheckViolation(insertNatural({ document: null, anonymized: false }));
    await insertNatural({ document: null, anonymized: true });

    const rows: Array<{ document_number_encrypted: string | null }> = await qr.query(
      'SELECT document_number_encrypted FROM subscribers WHERE id = $1',
      [nullRow],
    );
    expect(rows).toEqual([{ document_number_encrypted: null }]);
    expect(await protectionFunctionDefinition()).toBe(protection);

    const guc: Array<{ value: string | null }> = await qr.query(
      `SELECT current_setting('iwana.titular_erasure', true) AS value`,
    );
    expect(guc[0]?.value ?? '').toBe('');
  });

  it('solo relaja el documento: el resto de cada rama del CHECK sigue igual', async () => {
    expect((await constraintState()).validated).toBe(true);

    await expectCheckViolation(
      insertNatural({ document: null, anonymized: true, firstName: null }),
    );
    await expectCheckViolation(insertJuridica(null));
    await expect(insertJuridica('900000000')).resolves.toEqual(expect.any(String));
  });
});
