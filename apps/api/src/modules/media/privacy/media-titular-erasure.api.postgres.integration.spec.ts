import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { DataSource } from 'typeorm';
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
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('conserva activa la evidencia y sin cambios la autorización al resolver por la API', async () => {
    const schema = `tenant_media_privacy_${randomBytes(5).toString('hex')}`;
    const q = quoteIdentifier(schema);
    const partyId = randomUUID();
    const requestId = randomUUID();
    const actorId = randomUUID();
    const mediaId = randomUUID();
    await dataSource.query(`CREATE SCHEMA ${q}`);
    await dataSource.query(`
      CREATE TABLE ${q}.party (
        id uuid PRIMARY KEY,
        anonymized_at timestamptz,
        anonymized_request_id uuid
      )
    `);
    await dataSource.query(
      `CREATE TABLE ${q}.party_contact (id uuid PRIMARY KEY, party_id uuid NOT NULL)`,
    );
    await dataSource.query(`
      CREATE TABLE ${q}.data_authorizations (
        id uuid PRIMARY KEY,
        party_id uuid NOT NULL,
        evidence_media_id uuid
      )
    `);
    await dataSource.query(`INSERT INTO ${q}.party (id) VALUES ($1)`, [partyId]);
    await dataSource.query(
      `INSERT INTO ${q}.data_authorizations (id, party_id, evidence_media_id) VALUES ($1, $2, $3)`,
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
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
    }
  });
});
