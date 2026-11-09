import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { MailerService } from '../../mailer/mailer.service';
import { IPermissionHoldersReadPort } from '../../access-control/ports/permission-holders-read.port';
import { AuditService } from '../../audit/audit.service';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { IContractStandingReadPort } from '../requests/ports/contract-standing-read.port';
import { PrivacyRequestsReadAdapter } from '../requests/ports/privacy-requests-read.adapter';
import { PrivacyRequestsService } from '../requests/requests.service';
import { PrivacyDueAlertsMetrics } from './privacy-due-alerts.metrics';
import { PRIVACY_DUE_ALERTS_TENANT_JOB } from './privacy-due-alerts.constants';
import {
  PrivacyDueAlertsProcessor,
  PrivacyDueAlertsTenantJobPayload,
} from './privacy-due-alerts.processor';

const databaseAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDatabase = databaseAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_privacy_alerts_${randomBytes(5).toString('hex')}`;
// Distinto por corrida: identifica la fila efímera de public.tenants que exige la migración 092.
const tenantId = randomUUID();
const tenantSlug = `privacy-alerts-${schemaName.slice(-10)}`;
const desistRequestId = '70000000-0000-4000-8000-000000000002';
const dueSoonRequestId = '70000000-0000-4000-8000-000000000003';
const overdueTaskRequestId = '70000000-0000-4000-8000-000000000004';
// La cadena exige titular, identidad verificada y contrato impugnado en SUPLANTACION (146).
const impersonationPartyId = '70000000-0000-4000-8000-000000000006';
const verifierId = '70000000-0000-4000-8000-000000000007';
const disputedContractId = '70000000-0000-4000-8000-000000000008';
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

if (databaseAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración privacy alerts: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crea y elimina un schema efímero.',
  );
}

describeWithDatabase('PrivacyDueAlertsProcessor — integración PostgreSQL con Q3', () => {
  let dataSource: DataSource;
  let processor: PrivacyDueAlertsProcessor;
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const impersonationPort = { suspendForImpersonation: jest.fn() };
  const standingPort = { standing: jest.fn() };
  const permissionHolders = {
    holders: jest
      .fn()
      .mockResolvedValue([
        { userId: '70000000-0000-4000-8000-000000000005', email: 'privacy@example.test' },
      ]),
  };
  const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const configService = {
    getOrThrow: (key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') return keyHex;
      throw new Error('Clave de prueba no configurada.');
    },
    get: (key: string) => (key === 'FRONTEND_URL' ? 'https://portal.example.test' : undefined),
  };

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    // El esquema lo instala la cadena de migraciones tenant (P3-5), no un DDL escrito a mano;
    // la migración 092 exige el tenant canónico en public.tenants.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Privacy alerts sintético',
        tenantSlug,
        schemaName,
        'privacy-alerts@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    // Fixtures sobre el esquema migrado: requester_kind, "right" y received_at son NOT NULL;
    // SUPLANTACION exige titular, identidad verificada y contrato impugnado, y la tarea, su kind.
    await dataSource.query(
      `INSERT INTO "${schemaName}".party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico-alertas', 'Titular sintético')`,
      [impersonationPartyId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
        (id, requester_kind, kind, "right", status, received_at, desist_at, due_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'INCOMPLETA', '2026-03-20T17:00:00Z',
               '2026-04-01', '2026-04-10')`,
      [desistRequestId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
        (id, requester_kind, kind, "right", status, received_at, due_at)
       VALUES ($1, 'TITULAR', 'RECLAMO', 'CONOCER', 'RADICADA', '2026-03-20T17:00:00Z', '2026-04-07')`,
      [dueSoonRequestId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
        (id, party_id, requester_kind, kind, "right", status, received_at, due_at,
         identity_verification_method, identity_verified_at, identity_verified_by,
         disputed_contract_ids)
       VALUES ($1, $2, 'TITULAR', 'SUPLANTACION', 'INCUMPLIMIENTO', 'RADICADA',
               '2026-03-20T17:00:00Z', '2026-04-10', 'DOCUMENTO_PRESENCIAL',
               '2026-03-20T17:00:00Z', $3, ARRAY[$4::uuid])`,
      [overdueTaskRequestId, impersonationPartyId, verifierId, disputedContractId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_tasks (request_id, kind, due_at)
       VALUES ($1, 'SUSPENDER_COBRO_EXTERNO', '2026-03-31')`,
      [overdueTaskRequestId],
    );

    const requestsService = new PrivacyRequestsService(
      dataSource,
      configService as unknown as ConfigService,
      auditService as unknown as AuditService,
      impersonationPort as unknown as IContractImpersonationPort,
      standingPort as unknown as IContractStandingReadPort,
      { findOne: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      new PqrRetentionReadAdapter(),
    );
    processor = new PrivacyDueAlertsProcessor(
      dataSource,
      { add: jest.fn() } as never,
      requestsService,
      new PrivacyRequestsReadAdapter(dataSource),
      permissionHolders as unknown as IPermissionHoldersReadPort,
      mailer as unknown as MailerService,
      configService as unknown as ConfigService,
      { recordNoRecipients: jest.fn() } as unknown as PrivacyDueAlertsMetrics,
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  beforeEach(() => {
    auditService.log.mockClear();
    mailer.sendMail.mockClear();
    permissionHolders.holders.mockClear();
    permissionHolders.holders.mockResolvedValue([
      { userId: '70000000-0000-4000-8000-000000000005', email: 'privacy@example.test' },
    ]);
  });

  it('applies R2 and sends the real Q3 due counts across Semana Santa without PII', async () => {
    const payload: PrivacyDueAlertsTenantJobPayload = {
      tenantId,
      tenantSlug,
      schemaName,
      date: '2026-04-01',
    };

    await TenantContext.run({ tenantId, tenantSlug, schemaName }, () =>
      processor.process({ name: PRIVACY_DUE_ALERTS_TENANT_JOB, data: payload } as never),
    );

    const requestRows = (await dataSource.query(
      `SELECT id::text, status FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [desistRequestId],
    )) as Array<{ id: string; status: string }>;
    const eventRows = (await dataSource.query(
      `SELECT from_status, to_status, actor_id, reason
       FROM "${schemaName}".data_subject_request_events WHERE request_id = $1`,
      [desistRequestId],
    )) as Array<{
      from_status: string;
      to_status: string;
      actor_id: string | null;
      reason: string;
    }>;

    expect(requestRows).toEqual([{ id: desistRequestId, status: 'DESISTIDA' }]);
    expect(eventRows).toEqual([
      {
        from_status: 'INCOMPLETA',
        to_status: 'DESISTIDA',
        actor_id: null,
        reason: 'DESISTIMIENTO_AUTOMATICO',
      },
    ]);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ operation: 'REQUEST_AUTO_DESISTED' }),
      }),
    );
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const email = mailer.sendMail.mock.calls[0]?.[0] as { html: string; text?: string };
    expect(email.html).toContain('Vencen en dos días hábiles o menos: 1');
    expect(email.html).toContain('Tareas de suplantación vencidas: 1');
    expect(email.html).not.toContain('privacy@example.test');
    expect(email.text).not.toContain(desistRequestId);
    expect(email.text).not.toContain(dueSoonRequestId);
    expect(email.text).not.toContain(overdueTaskRequestId);
  });
});
