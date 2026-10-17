import { randomBytes, randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';
import { SubscriberVatResponsibility1530000000000 } from './153_subscriber_vat_responsibility';
import { SubscriberLegalRepresentativeParty1540000000000 } from './154_subscriber_legal_representative_party';
import { FiscalDocumentEncryption1550000000000 } from './155_fiscal_document_encryption';
import { SubscriberExpedienteForeignKey1560000000000 } from './156_subscriber_expediente_fk';

jest.setTimeout(600_000);

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabase = /^(test|iwana_it_[a-z0-9_]+)$/u;
if (dbAvailable && !allowedDatabase.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'MOD05 153–156: DB_NAME debe ser test o iwana_it_*; esta integración solo crea y elimina schemas efímeros.',
  );
}

const suffix = randomBytes(5).toString('hex');
const schemaNames = [`tenant_mod05_deuda_a_${suffix}`, `tenant_mod05_deuda_b_${suffix}`] as const;
const schemaCases = schemaNames.map((schema, index) => [schema, index] as const);
const tenantIds = [randomUUID(), randomUUID()] as const;
const quotedSchemas = schemaNames.map((schema) => `"${schema.replaceAll('"', '""')}"`);

type Fixture = {
  tenantId: string;
  subscriberNaturalId: string;
  subscriberJuridicaId: string;
  expedienteId: string;
  createdBy: string;
};

describeWithDb('Migraciones tenant MOD05 153–156 — dos schemas reales, up/down/re-up', () => {
  let dataSource: DataSource | undefined;
  const runners: QueryRunner[] = [];
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 4, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    for (let index = 0; index < schemaNames.length; index += 1) {
      const schema = schemaNames[index];
      const tenantId = tenantIds[index];
      if (!schema || !tenantId) throw new Error('Fixture de schema tenant incompleto.');
      const quoted = quotedSchemas[index];
      if (!quoted) throw new Error('Identificador de schema tenant incompleto.');

      await dataSource.query(`CREATE SCHEMA ${quoted}`);
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
        [
          tenantId,
          `MOD05 deuda sintético ${index + 1}`,
          `mod05-deuda-${suffix}-${index + 1}`,
          schema,
          `deuda-${suffix}-${index + 1}@example.invalid`,
        ],
      );

      const tenantDataSource = createTenantDataSource(dataSource, schema, `mod05-deuda-${schema}`);
      await tenantDataSource.initialize();
      try {
        // Provisiona con la cadena completa y real, incluidos los cuatro migrations bajo prueba.
        await applyTenantMigrationsInOrder(tenantDataSource);
      } finally {
        await tenantDataSource.destroy();
      }

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.query(`SET search_path TO ${quoted}`);
      runners.push(runner);

      // Deja cada schema en el estado previo a la expansión para poder sembrar filas heredadas.
      await new SubscriberExpedienteForeignKey1560000000000().down(runner);
      await new FiscalDocumentEncryption1550000000000().down(runner);
      await new SubscriberLegalRepresentativeParty1540000000000().down(runner);
      await new SubscriberVatResponsibility1530000000000().down(runner);

      const fixture: Fixture = {
        tenantId,
        subscriberNaturalId: randomUUID(),
        subscriberJuridicaId: randomUUID(),
        expedienteId: randomUUID(),
        createdBy: randomUUID(),
      };
      fixtures.push(fixture);

      await runner.query(
        `INSERT INTO expediente_records (id, tenant_id, full_name, created_by)
         VALUES ($1, $2, 'Titular sintético', $3)`,
        [fixture.expedienteId, fixture.tenantId, fixture.createdBy],
      );
      await runner.query(
        `INSERT INTO subscribers (
           id, tenant_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, vat_treatment,
           email_encrypted, phone_encrypted, tax_regime, address, created_by
         ) VALUES (
           $1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'cipher-synthetic',
           'Nombre sintético', 'Apellido sintético', 2, 'EXEMPT',
           'email-cipher-synthetic', 'phone-cipher-synthetic', 'SIMPLIFIED',
           'Dirección sintética', $3
         )`,
        [fixture.subscriberNaturalId, fixture.tenantId, fixture.createdBy],
      );
      await runner.query(
        `INSERT INTO subscribers (
           id, tenant_id, person_type, customer_segment, nit, nit_verification_digit,
           business_name, legal_representative_id, email_encrypted, phone_encrypted,
           tax_regime, vat_treatment, address, created_by, expediente_id
         ) VALUES (
           $1, $2, 'JURIDICA', 'CORPORATE', '900000001', '9',
           'Empresa sintética', $3, 'email-cipher-synthetic', 'phone-cipher-synthetic',
           'COMMON', 'STANDARD', 'Dirección sintética', $4, $5
         )`,
        [
          fixture.subscriberJuridicaId,
          fixture.tenantId,
          randomUUID(),
          fixture.createdBy,
          fixture.expedienteId,
        ],
      );
    }
  });

  afterAll(async () => {
    for (const runner of runners) {
      if (!runner.isReleased) await runner.release();
    }
    if (!dataSource?.isInitialized) return;
    try {
      for (let index = 0; index < schemaNames.length; index += 1) {
        const quoted = quotedSchemas[index];
        const tenantId = tenantIds[index];
        if (quoted) await dataSource.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`);
        if (tenantId)
          await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      }
    } finally {
      await dataSource.destroy();
    }
  });

  it.each(schemaCases)('%s traduce y revierte tax_regime', async (schema, index) => {
    const runner = runners[index];
    const fixture = fixtures[index];
    if (!runner || !fixture) throw new Error('QueryRunner o fixture del tenant no inicializado.');
    const migration = new SubscriberVatResponsibility1530000000000();

    await migration.up(runner);
    const translated = (await runner.query(
      `SELECT id, vat_responsibility::text AS vat_responsibility
         FROM subscribers WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[fixture.subscriberNaturalId, fixture.subscriberJuridicaId]],
    )) as Array<{ id: string; vat_responsibility: string }>;
    expect(translated).toHaveLength(2);
    expect(
      translated.find((row) => row.id === fixture.subscriberNaturalId)?.vat_responsibility,
    ).toBe('NO_RESPONSABLE');
    expect(
      translated.find((row) => row.id === fixture.subscriberJuridicaId)?.vat_responsibility,
    ).toBe('RESPONSABLE');

    await migration.down(runner);
    const restored = (await runner.query(
      `SELECT id, tax_regime::text AS tax_regime FROM subscribers WHERE id = ANY($1::uuid[])`,
      [[fixture.subscriberNaturalId, fixture.subscriberJuridicaId]],
    )) as Array<{ id: string; tax_regime: string }>;
    expect(restored).toContainEqual({ id: fixture.subscriberNaturalId, tax_regime: 'SIMPLIFIED' });
    expect(restored).toContainEqual({ id: fixture.subscriberJuridicaId, tax_regime: 'COMMON' });
    await migration.up(runner);
  });

  it.each(schemaCases)(
    '%s conserva el enum por schema y aplica el CHECK NOT VALID',
    async (schema, index) => {
      const runner = runners[index];
      if (!runner) throw new Error('QueryRunner del tenant no inicializado.');
      const migration = new SubscriberLegalRepresentativeParty1540000000000();

      await migration.up(runner);
      const legacyRows = (await runner.query(
        `SELECT legal_representative_party_id FROM subscribers WHERE person_type = 'JURIDICA'`,
      )) as Array<{ legal_representative_party_id: string | null }>;
      expect(legacyRows).toEqual([{ legal_representative_party_id: null }]);
      await expect(
        runner.query(
          `UPDATE subscribers SET commercial_name = 'Edición sintética' WHERE person_type = 'JURIDICA'`,
        ),
      ).rejects.toThrow();

      await migration.down(runner);
      const enumAfterDown = (await runner.query(
        `SELECT e.enumlabel
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'party_role_type'
          AND t.typnamespace = current_schema()::regnamespace
        ORDER BY e.enumsortorder`,
      )) as Array<{ enumlabel: string }>;
      expect(enumAfterDown.map((row) => row.enumlabel)).not.toContain('LEGAL_REPRESENTATIVE');
      await migration.up(runner);
    },
  );

  it.each(schemaCases)(
    '%s agrega y revierte el almacenamiento fiscal expandido',
    async (schema, index) => {
      const runner = runners[index];
      if (!runner) throw new Error('QueryRunner del tenant no inicializado.');
      const migration = new FiscalDocumentEncryption1550000000000();

      await migration.up(runner);
      const expanded = (await runner.query(
        `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name IN ('fiscal_document', 'fiscal_document_encrypted', 'fiscal_document_hmac')
        ORDER BY table_name, column_name`,
      )) as Array<{ table_name: string; column_name: string }>;
      expect(expanded).toEqual([
        { table_name: 'contracts', column_name: 'fiscal_document' },
        { table_name: 'contracts', column_name: 'fiscal_document_encrypted' },
        { table_name: 'contracts', column_name: 'fiscal_document_hmac' },
        { table_name: 'expediente_records', column_name: 'fiscal_document' },
        { table_name: 'expediente_records', column_name: 'fiscal_document_encrypted' },
        { table_name: 'expediente_records', column_name: 'fiscal_document_hmac' },
      ]);
      await migration.down(runner);
      await migration.up(runner);
    },
  );

  it.each(schemaCases)(
    '%s aborta con el reporte de huérfanos y luego crea la FK',
    async (schema, index) => {
      const runner = runners[index];
      const fixture = fixtures[index];
      if (!runner || !fixture) throw new Error('QueryRunner o fixture del tenant no inicializado.');
      const migration = new SubscriberExpedienteForeignKey1560000000000();
      const orphanExpedienteId = randomUUID();

      await runner.query(`UPDATE subscribers SET expediente_id = $1 WHERE id = $2`, [
        orphanExpedienteId,
        fixture.subscriberNaturalId,
      ]);
      await expect(migration.up(runner)).rejects.toThrow(
        new RegExp(`${fixture.subscriberNaturalId}.*${orphanExpedienteId}`),
      );
      await runner.query(`UPDATE subscribers SET expediente_id = NULL WHERE id = $1`, [
        fixture.subscriberNaturalId,
      ]);

      await migration.up(runner);
      await expect(
        runner.query(`UPDATE subscribers SET expediente_id = $1 WHERE id = $2`, [
          orphanExpedienteId,
          fixture.subscriberNaturalId,
        ]),
      ).rejects.toThrow();
      await migration.down(runner);
      await migration.up(runner);
    },
  );
});
