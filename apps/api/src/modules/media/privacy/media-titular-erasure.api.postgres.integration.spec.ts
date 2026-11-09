import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { DataSource } from 'typeorm';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { CrmPersonalDataErasureAdapter } from '../../crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../../crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { MediaTitularErasureParticipant } from './media-titular-erasure.participant';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schema = `tenant_media_privacy_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describeWithDb('Media erasure por el adaptador API — evidencia de autorización', () => {
  let dataSource: DataSource;
  let adapter: CrmPersonalDataErasureAdapter;

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? 'dbiw';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración Media erasure API: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crea y elimina un schema efímero.',
      );
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    // El esquema lo instala la cadena de migraciones tenant (P3-5), no un DDL escrito a mano;
    // la migración 092 exige el tenant canónico en public.tenants.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Media erasure sintético',
        `media-erasure-${tenantId.slice(0, 8)}`,
        schema,
        'media-erasure@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schema,
      `media-erasure-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const syntheticKey = randomBytes(32).toString('hex');
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') return syntheticKey;
        throw new Error('Clave sintética no configurada.');
      },
      get: (key: string) => (key === 'PII_ENCRYPTION_KEY' ? syntheticKey : undefined),
    } as unknown as ConfigService;
    adapter = new CrmPersonalDataErasureAdapter(
      new CrmTitularErasureParticipant(config),
      new PartyTitularErasureParticipant(config),
      new UserAccountErasureParticipant(config),
      new WfmTitularErasureParticipant(config),
      new ExecutionOrderTitularErasureParticipant(config),
      new OperationalTaskTitularErasureParticipant(config),
      new MediaTitularErasureParticipant(),
      new BillingTitularErasureParticipant(),
      new AssuranceTitularErasureParticipant(config),
      new NetworkTitularErasureParticipant(config),
      new SupplierProfileReadAdapter(),
    );
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('conserva activa la evidencia y sin cambios la autorización al resolver por la API', async () => {
    const q = quoteIdentifier(schema);
    const partyId = randomUUID();
    const requestId = randomUUID();
    const actorId = randomUUID();
    const mediaId = randomUUID();
    // Fixtures sobre el esquema migrado: party y data_authorizations con sus NOT NULL y CHECK reales.
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico-media', 'Titular sintético')`,
      [partyId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.data_authorizations
        (id, party_id, purpose, kind, granted, channel, evidence_media_id)
       VALUES ($1, $2, 'TRATAMIENTO_CONTRACTUAL', 'LEGACY_IMPORT', true, 'CRM_CONVERSION', $3)`,
      [randomUUID(), partyId, mediaId],
    );
    await dataSource.query(
      `INSERT INTO public.media_assets
        (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes, object_key)
       VALUES ($1, $2, 'privacy_evidence', 'fixture.bin', 'application/octet-stream',
         'bin', 1, $3)`,
      [mediaId, schema, `${schema}/privacy_evidence/${mediaId}.bin`],
    );

    try {
      const authorizationBefore = await dataSource.query(
        `SELECT id, party_id, evidence_media_id FROM ${q}.data_authorizations`,
      );
      await dataSource.transaction(async (manager) => {
        await manager.query(`SET LOCAL search_path TO ${q}, public`);
        await adapter.anonymize(
          {
            requestId,
            partyId,
            requesterDocumentHmac: null,
            expedienteIds: [],
            actorId,
          },
          { manager },
        );
      });

      expect(
        await dataSource.query(
          `SELECT deleted_at IS NULL AS active FROM public.media_assets WHERE id = $1`,
          [mediaId],
        ),
      ).toEqual([{ active: true }]);
      expect(
        await dataSource.query(
          `SELECT id, party_id, evidence_media_id FROM ${q}.data_authorizations`,
        ),
      ).toEqual(authorizationBefore);
    } finally {
      await dataSource.query(`DELETE FROM public.media_assets WHERE id = $1`, [mediaId]);
    }
  });
});
