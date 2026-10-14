import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
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
const tenantId = '70000000-0000-4000-8000-000000000001';
const tenantSlug = 'privacy-alerts-test';
const desistRequestId = '70000000-0000-4000-8000-000000000002';
const dueSoonRequestId = '70000000-0000-4000-8000-000000000003';
const overdueTaskRequestId = '70000000-0000-4000-8000-000000000004';
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
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_subject_requests (
        id uuid PRIMARY KEY,
        kind text NOT NULL,
        status text NOT NULL,
        desist_at date,
        extended_until date,
        due_at date NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_subject_request_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL REFERENCES "${schemaName}".data_subject_requests(id),
        from_status text,
        to_status text NOT NULL,
        actor_id uuid,
        reason text
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_subject_request_tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL REFERENCES "${schemaName}".data_subject_requests(id),
        due_at date NOT NULL,
        done_at timestamptz
      )
    `);
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests (id, kind, status, desist_at, due_at)
       VALUES ($1, 'CONSULTA', 'INCOMPLETA', '2026-04-01', '2026-04-10')`,
      [desistRequestId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests (id, kind, status, due_at)
       VALUES ($1, 'RECLAMO', 'RADICADA', '2026-04-07')`,
      [dueSoonRequestId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests (id, kind, status, due_at)
       VALUES ($1, 'SUPLANTACION', 'RADICADA', '2026-04-10')`,
      [overdueTaskRequestId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_tasks (request_id, due_at)
       VALUES ($1, '2026-03-31')`,
      [overdueTaskRequestId],
    );

    const requestsService = new PrivacyRequestsService(
      dataSource,
      configService as unknown as ConfigService,
      auditService as unknown as AuditService,
      impersonationPort as unknown as IContractImpersonationPort,
      standingPort as unknown as IContractStandingReadPort,
      { findOne: jest.fn() } as never,
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
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
