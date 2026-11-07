import { TenantContext } from '@iwana/db';
import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { CrmContractStandingReadAdapter } from '../../crm/privacy-adapters/crm-contract-standing-read.adapter';
import { PrivacyRequestsService } from './requests.service';
import { PrivacyPqrRetentionAndNullStratum1770000000177 } from '../../../../../../packages/database/src/migrations/tenant/177_privacy_pqr_retention_and_null_stratum';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
  TENANT_MIGRATIONS,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { CrmTitularErasureParticipant } from '../../crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import type { ErasureKeys } from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';

const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = process.env['DB_NAME'] ?? '';
const safeDatabaseName = /^iwana_it_g7_[a-z0-9_]+$/u;
const supportedDatabaseName = databaseName === 'test' || safeDatabaseName.test(databaseName);
const describeWithDb = integrationEnabled && supportedDatabaseName ? describe : describe.skip;

if (integrationEnabled && !supportedDatabaseName) {
  console.warn(
    `[B7] Integración omitida: DB_NAME debe ser test o iwana_it_g7_*; recibida ${databaseName || '(vacía)'}.`,
  );
}

jest.setTimeout(900_000);

describeWithDb('B7 — supresión CRM sobre migraciones tenant reales', () => {
  const schemaName = `tenant_it_g7_b7_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `privacy-g7-${randomUUID().slice(0, 8)}`;
  const actorId = randomUUID();
  const keys: ErasureKeys = {
    hashKey: Buffer.alloc(32, 1),
    activeEncryptionKey: Buffer.alloc(32, 2),
    previousEncryptionKey: null,
  };
  let baseDataSource: DataSource | undefined;
  let tenantDataSource: DataSource | undefined;
  let queryRunner: QueryRunner | undefined;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    baseDataSource = new DataSource({
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
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await baseDataSource.initialize();

    const bootstrap = baseDataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'B7 synthetic fixture', $2, $3, 'INACTIVE', 'b1c@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
    } finally {
      await bootstrap.release();
    }

    tenantDataSource = createTenantDataSource(baseDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource, {
      ...process.env,
      IWANA_APPLY_PII_CONTRACT: 'true',
    });
    queryRunner = tenantDataSource.createQueryRunner();
    await queryRunner.connect();
    const [migrationCountRow] = (await queryRunner.query(
      'SELECT COUNT(*)::int AS count FROM typeorm_migrations',
    )) as Array<{ count: number }>;
    const appliedMigrationCount = migrationCountRow?.count ?? 0;
    console.info(
      `[B7] Tenant migrations applied: ${appliedMigrationCount}/${TENANT_MIGRATIONS.length}.`,
    );
    expect(appliedMigrationCount).toBe(TENANT_MIGRATIONS.length);
  });

  afterAll(async () => {
    try {
      if (queryRunner && !queryRunner.isReleased) await queryRunner.release();
    } finally {
      if (tenantDataSource?.isInitialized) await tenantDataSource.destroy();
      if (baseDataSource?.isInitialized) {
        const cleanup = baseDataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
        } finally {
          await cleanup.release();
          await baseDataSource.destroy();
        }
      }
    }
  });

  beforeEach(async () => {
    await queryRunner!.startTransaction();
    await queryRunner!.query("SELECT set_config('iwana.titular_erasure', 'on', true)");
  });
  afterEach(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
  });

  it('CA-BT-25 instala las dos políticas de retención nuevas', async () => {
    const rows = await queryRunner!.query(
      "SELECT category, years FROM retention_policies WHERE category IN ('PQR_SOPORTES','SOLICITUDES_TITULAR') ORDER BY category",
    );
    expect(rows).toEqual([
      { category: 'PQR_SOPORTES', years: 3 },
      { category: 'SOLICITUDES_TITULAR', years: 5 },
    ]);
  });

  it('CA-BT-23 anula estrato sin falsear RESIDENTIAL ni NON_RESIDENTIAL', async () => {
    const qr = queryRunner!;
    const subscriber = randomUUID();
    const requestId = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id, tenant_id, person_type, customer_segment, document_type, document_number_encrypted, first_name, last_name, stratum, email_encrypted, phone_encrypted, vat_treatment, tax_regime, address, created_by) VALUES ($1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'synthetic', 'Fixture', 'B7', 3, 'synthetic', 'synthetic', 'STANDARD', 'SIMPLIFIED', 'Sintética', $3)`,
      [subscriber, tenantId, actorId],
    );
    await qr.query(
      `INSERT INTO contracts (tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, alias, service_usage, installation_stratum, terminated_at) VALUES ($1,$2,'fixture-plan','{}','TERMINATED','Sonda residencial','RESIDENTIAL',4,'2010-01-01'),($1,$2,'fixture-plan','{}','TERMINATED','Sonda no residencial','NON_RESIDENTIAL',NULL,'2010-01-01')`,
      [tenantId, subscriber],
    );
    const participant = new CrmTitularErasureParticipant(new ConfigService());
    const scope = {
      partyId: null,
      subscriberIds: [subscriber],
      expedienteIds: [],
      userIds: [],
      requestId,
      cryptoKeys: keys,
    };
    await participant.resolveScope(scope, qr);
    await participant.apply(scope, qr, 'apply');
    expect(
      (await qr.query('SELECT stratum FROM subscribers WHERE id=$1', [subscriber]))[0].stratum,
    ).toBeNull();
    const contracts = await qr.query(
      "SELECT installation_stratum, to_jsonb(c)->>'anonymized_at' AS anonymized_at FROM contracts c",
    );
    expect(contracts).toHaveLength(2);
    for (const contract of contracts) {
      expect(contract.installation_stratum).toBeNull();
      expect(contract.anonymized_at).toBeTruthy();
    }
  });
  function inTenant<T>(operation: () => Promise<T>): Promise<T> {
    return TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);
  }
  function serviceFor(expedienteId: string) {
    const qr = queryRunner!;
    const source = {
      createQueryRunner: () =>
        new Proxy(qr, {
          get(target, property) {
            if (property === 'release') return async () => undefined;
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
    } as unknown as DataSource;
    const key = keys.activeEncryptionKey.toString('hex');
    const erasure = {
      plan: jest
        .fn()
        .mockResolvedValue({ candidateExpedienteIds: [expedienteId], blockers: [], counts: {} }),
      anonymize: jest.fn().mockResolvedValue({ categories: [], changedRows: 0 }),
    };
    const service = new PrivacyRequestsService(
      source,
      new ConfigService({
        MFA_ENCRYPTION_KEY: key,
        PII_ENCRYPTION_KEY: key,
        PII_HASH_KEY: keys.hashKey.toString('hex'),
      }),
      { log: jest.fn(), logWithin: jest.fn() } as never,
      {} as never,
      new CrmContractStandingReadAdapter(),
      {} as never,
      { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
      erasure,
      { lastFiscalDocumentAt: jest.fn().mockResolvedValue(null) },
      new PqrRetentionReadAdapter(),
    );
    return { service, erasure };
  }
  async function prospect() {
    const qr = queryRunner!;
    const party = randomUUID(),
      expediente = randomUUID(),
      request = randomUUID(),
      ticket = randomUUID();
    const hmac = `synthetic-${randomUUID()}`;
    await qr.query(
      `INSERT INTO party (id,party_type,document_type,document_number,display_name) VALUES ($1,'NATURAL','OTHER',$2,'Sonda B7')`,
      [party, randomUUID()],
    );
    await qr.query(
      `INSERT INTO expediente_records (id,tenant_id,full_name,document_number_hmac,created_by) VALUES ($1,$2,'Sonda B7',$3,$4)`,
      [expediente, tenantId, hmac, actorId],
    );
    await qr.query(
      `INSERT INTO data_subject_requests (id,party_id,requester_kind,kind,"right",status,received_at,complete_at,due_at,identity_verification_method,identity_verified_at,identity_verified_by,requester_document_hmac) VALUES ($1,$2,'TITULAR','CONSULTA','SUPRIMIR','EN_TRAMITE',now(),now(),CURRENT_DATE + 15,'DOCUMENTO_PRESENCIAL',now(),$3,$4)`,
      [request, party, actorId, hmac],
    );
    await qr.query(
      `INSERT INTO support_tickets (id,tenant_id,ticket_number,type,subject,requester_type,subject_type,subject_ref_id,created_by_user_id) VALUES ($1,$2,$3,'PQR','Sonda PQR','EXTERNAL','EXPEDIENTE',$4,$5)`,
      [ticket, tenantId, `PQR-${ticket.slice(0, 8)}`, expediente, actorId],
    );
    return { party, expediente, request, ticket };
  }
  async function response(ticket: string, notified: Date | null, resolved: Date | null) {
    await queryRunner!.query(
      `INSERT INTO ticket_pqr_records (ticket_id,tenant_id,deadline_type,deadline_at,notified_at,resolved_at,notes) VALUES ($1,$2,'FINAL_RESOLUTION',now(),$3,$4,'Sonda soporte')`,
      [ticket, tenantId, notified, resolved],
    );
  }
  function yearsAgo(years: number, days = 0) {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() - years);
    date.setUTCDate(date.getUTCDate() - days);
    return date;
  }
  it.each(['notificada', 'respuesta sin notificación', 'sin respuesta', 'vencida'])(
    'CA-BT-20: prospecto con PQR %s',
    async (kind) => {
      const subject = await prospect();
      if (kind === 'notificada') await response(subject.ticket, yearsAgo(2), yearsAgo(4));
      if (kind === 'respuesta sin notificación') await response(subject.ticket, null, yearsAgo(2));
      if (kind === 'vencida') await response(subject.ticket, yearsAgo(3, 1), yearsAgo(4));
      const { service, erasure } = serviceFor(subject.expediente);
      const preview = await inTenant(() => service.erasurePreview(subject.request));
      if (kind === 'vencida') expect(preview.eligible).toBe(true);
      else {
        expect(preview.blockers).toContain('CONSERVATION_DUTY');
        await expect(
          inTenant(() =>
            service.transition(
              subject.request,
              'resolve',
              {
                responseText: 'Sonda',
                responseChannel: 'EMAIL',
                erasure: { confirm: true, expedienteIds: [subject.expediente] },
              },
              actorId,
            ),
          ),
        ).rejects.toThrow('deber de conservación');
        expect(erasure.anonymize).not.toHaveBeenCalled();
        await inTenant(() =>
          service.transition(
            subject.request,
            'reject',
            {
              responseText: 'Sonda de conservación',
              responseChannel: 'EMAIL',
              legalBasis: 'DEBER_LEGAL_CONSERVACION',
            },
            actorId,
          ),
        );
        expect(
          (
            await queryRunner!.query('SELECT status FROM data_subject_requests WHERE id=$1', [
              subject.request,
            ])
          )[0].status,
        ).toBe('NO_PROCEDENTE');
        expect(
          (
            await queryRunner!.query('SELECT mark FROM party_privacy_marks WHERE party_id=$1', [
              subject.party,
            ])
          ).some((row: { mark: string }) => row.mark === 'DATOS_BLOQUEADOS'),
        ).toBe(true);
      }
    },
  );
  it('CA-BT-21: no atribuye una PQR de otro titular por coincidencia del texto sin el tipo', async () => {
    const other = await prospect();
    const scope = {
      subscriberIds: [other.expediente],
      contractIds: [other.expediente],
      expedienteIds: [randomUUID()],
    };
    expect(
      await inTenant(() =>
        new PqrRetentionReadAdapter().read(scope, { manager: queryRunner!.manager }),
      ),
    ).toEqual({ hasUnanswered: false, lastResponseAt: null });
  });
  it('una respuesta inicial no sustituye la respuesta definitiva pendiente', async () => {
    const subject = await prospect();
    await queryRunner!.query(
      `INSERT INTO ticket_pqr_records (ticket_id,tenant_id,deadline_type,deadline_at,notified_at,resolved_at) VALUES ($1,$2,'INITIAL_RESPONSE',now(),now(),now())`,
      [subject.ticket, tenantId],
    );
    expect(
      (await inTenant(() => serviceFor(subject.expediente).service.erasurePreview(subject.request)))
        .blockers,
    ).toContain('CONSERVATION_DUTY');
  });
  it('CA-BT-21: excluye la PQR sin respuesta de otro titular del mismo tenant', async () => {
    const subject = await prospect();
    await response(subject.ticket, yearsAgo(4), yearsAgo(4));
    await prospect();
    const preview = await inTenant(() =>
      serviceFor(subject.expediente).service.erasurePreview(subject.request),
    );
    expect(preview.eligible).toBe(true);
    expect(preview.blockers).not.toContain('CONSERVATION_DUTY');
  });
  it.each(['SUBSCRIBER_REQUESTER', 'SUBSCRIBER', 'CONTRACT', 'EXPEDIENTE'])(
    'D-BT-14 sigue la referencia exacta %s',
    async (type) => {
      const subject = await prospect();
      const id = randomUUID();
      await queryRunner!.query(
        'UPDATE support_tickets SET requester_type=$1,requester_ref_id=$2,subject_type=$3,subject_ref_id=$4 WHERE id=$5',
        [
          type === 'SUBSCRIBER_REQUESTER' ? 'SUBSCRIBER' : 'EXTERNAL',
          type === 'SUBSCRIBER_REQUESTER' ? id : null,
          type === 'SUBSCRIBER_REQUESTER' ? null : type,
          type === 'SUBSCRIBER_REQUESTER' ? null : id,
          subject.ticket,
        ],
      );
      const scope = { subscriberIds: [id], contractIds: [id], expedienteIds: [id] };
      expect(
        (
          await inTenant(() =>
            new PqrRetentionReadAdapter().read(scope, { manager: queryRunner!.manager }),
          )
        ).hasUnanswered,
      ).toBe(true);
    },
  );
  async function rejectsCheck(sql: string, parameters: unknown[]) {
    const qr = queryRunner!;
    await qr.query('SAVEPOINT invalid_input');
    try {
      await expect(qr.query(sql, parameters)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    } finally {
      await qr.query('ROLLBACK TO SAVEPOINT invalid_input');
    }
  }
  it('CA-BT-24 rechaza estrato NULL de un suscriptor natural vivo', async () => {
    await rejectsCheck(
      `INSERT INTO subscribers (tenant_id,person_type,customer_segment,document_type,document_number_encrypted,first_name,last_name,stratum,email_encrypted,phone_encrypted,vat_treatment,tax_regime,address,created_by) VALUES ($1,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','B7',NULL,'synthetic','synthetic','STANDARD','SIMPLIFIED','Sonda',$2)`,
      [tenantId, actorId],
    );
  });
  it('CA-BT-24 rechaza contrato residencial vivo sin estrato', async () => {
    await rejectsCheck(
      `INSERT INTO contracts (tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,alias,service_usage,installation_stratum) VALUES ($1,$2,'fixture-plan','{}','DRAFT','Sonda','RESIDENTIAL',NULL)`,
      [tenantId, randomUUID()],
    );
  });
  it('CA-BT-25: up/down/up y políticas que no permiten acortar la retención', async () => {
    const qr = queryRunner!;
    const migration = new PrivacyPqrRetentionAndNullStratum1770000000177();
    await rejectsCheck("UPDATE retention_policies SET years=2 WHERE category='PQR_SOPORTES'", []);
    await rejectsCheck(
      "UPDATE retention_policies SET years=4 WHERE category='SOLICITUDES_TITULAR'",
      [],
    );
    await migration.down(qr);
    const constraints = await qr.query(
      "SELECT convalidated FROM pg_constraint WHERE conrelid IN ('contracts'::regclass,'subscribers'::regclass) AND conname IN ('chk_contract_residential_stratum','chk_subscriber_person_fields')",
    );
    expect(constraints).toEqual([{ convalidated: false }, { convalidated: false }]);
    expect(
      await qr.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='contracts' AND column_name='anonymized_at'",
      ),
    ).toEqual([]);
    await migration.up(qr);
    expect(
      (
        await qr.query(
          "SELECT count(*)::int AS n FROM retention_policies WHERE category IN ('PQR_SOPORTES','SOLICITUDES_TITULAR')",
        )
      )[0].n,
    ).toBe(2);
  });

  it('CA-BT-25: down conserva los NULL de filas anonimizadas sin inventar estratos', async () => {
    const qr = queryRunner!;
    const subscriber = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,document_type,first_name,last_name,stratum,anonymized_at,anonymized_request_id,vat_treatment,tax_regime,address,created_by) VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','ANONIMIZADO','ANONIMIZADO',NULL,now(),gen_random_uuid(),'STANDARD','SIMPLIFIED','ANONIMIZADO',$3)`,
      [subscriber, tenantId, actorId],
    );
    await qr.query(
      `INSERT INTO contracts (tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,service_usage,installation_stratum,anonymized_at) VALUES ($1,$2,'synthetic-plan','{}','DRAFT','RESIDENTIAL',NULL,now())`,
      [tenantId, subscriber],
    );
    await new PrivacyPqrRetentionAndNullStratum1770000000177().down(qr);
    expect(await qr.query('SELECT stratum FROM subscribers WHERE id=$1', [subscriber])).toEqual([
      { stratum: null },
    ]);
    expect(
      await qr.query('SELECT installation_stratum FROM contracts WHERE subscriber_id=$1', [
        subscriber,
      ]),
    ).toEqual([{ installation_stratum: null }]);
  });
});
