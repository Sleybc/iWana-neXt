import { TenantContext } from '@iwana/db';
import { addColombiaBusinessDays } from '@iwana/shared';
import type { Job } from 'bullmq';
import { PrivacyRequestsReadAdapter } from '../requests/ports/privacy-requests-read.adapter';
import {
  PRIVACY_DUE_ALERTS_CRON_PATTERN,
  PRIVACY_DUE_ALERTS_INBOX_PATH,
  PRIVACY_DUE_ALERTS_QUEUE,
  PRIVACY_DUE_ALERTS_REPEATABLE_JOB_ID,
  PRIVACY_DUE_ALERTS_SWEEP_JOB,
  PRIVACY_DUE_ALERTS_TENANT_JOB,
  PRIVACY_DUE_ALERTS_TIME_ZONE,
} from './privacy-due-alerts.constants';
import {
  bogotaCivilDate,
  PrivacyDueAlertsProcessor,
  PrivacyDueAlertsTenantJobPayload,
} from './privacy-due-alerts.processor';
import { PrivacyDueAlertsMetrics } from './privacy-due-alerts.metrics';

const TENANT = {
  id: '3c2c9bb9-3ba6-47c1-839a-80a880970001',
  slug: 'isp-ejemplo',
  schema_name: 'tenant_isp_ejemplo',
};

function buildQueryRunner() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
}

function buildHarness() {
  const queryRunner = buildQueryRunner();
  const dataSource = {
    query: jest.fn().mockResolvedValue([TENANT]),
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const jobs = new Map<string, { name: string; data: unknown }>();
  const queue = {
    add: jest.fn(async (name: string, data: unknown, options?: { jobId?: string }) => {
      const jobId = options?.jobId ?? `auto-${jobs.size}`;
      const existing = jobs.get(jobId);
      if (existing) return existing;
      const job = { name, data };
      jobs.set(jobId, job);
      return job;
    }),
  };
  const requestsService = { markDesisted: jest.fn().mockResolvedValue({ count: 0 }) };
  const requestsReadPort = {
    dueCounts: jest.fn().mockResolvedValue({ overdue: 0, dueSoon: 1, overdueTasks: 0 }),
  };
  const permissionHolders = {
    holders: jest.fn().mockResolvedValue([{ userId: 'user-1', email: 'privacy@example.test' }]),
  };
  const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((key: string) =>
      key === 'FRONTEND_URL' ? 'https://portal.example.test' : undefined,
    ),
  };
  const metrics = { recordNoRecipients: jest.fn() };
  const processor = new PrivacyDueAlertsProcessor(
    dataSource as never,
    queue as never,
    requestsService as never,
    requestsReadPort as never,
    permissionHolders as never,
    mailer as never,
    config as never,
    metrics as unknown as PrivacyDueAlertsMetrics,
  );
  return {
    processor,
    dataSource,
    queryRunner,
    jobs,
    queue,
    requestsService,
    requestsReadPort,
    permissionHolders,
    mailer,
    metrics,
  };
}

function job(name: string, data: unknown = {}): Job<unknown> {
  return { name, data, id: 'test-job' } as Job<unknown>;
}

describe('PrivacyDueAlertsProcessor', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers one daily sweep at 07:00 in America/Bogota with a fixed id', async () => {
    const { processor, queue } = buildHarness();

    await processor.onApplicationBootstrap();

    expect(queue.add).toHaveBeenCalledWith(
      PRIVACY_DUE_ALERTS_SWEEP_JOB,
      {},
      {
        repeat: { pattern: PRIVACY_DUE_ALERTS_CRON_PATTERN, tz: PRIVACY_DUE_ALERTS_TIME_ZONE },
        jobId: PRIVACY_DUE_ALERTS_REPEATABLE_JOB_ID,
      },
    );
    expect(PRIVACY_DUE_ALERTS_QUEUE).toBe('privacy-due-alerts');
  });

  it('uses the Bogota civil day and stable tenant/date ids to deduplicate two sweeps', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
    const { processor, dataSource, jobs, mailer } = buildHarness();

    await processor.process(job(PRIVACY_DUE_ALERTS_SWEEP_JOB));
    await processor.process(job(PRIVACY_DUE_ALERTS_SWEEP_JOB));

    const tenantJobs = [...jobs.entries()].filter(
      ([, value]) => value.name === PRIVACY_DUE_ALERTS_TENANT_JOB,
    );
    expect(tenantJobs).toHaveLength(1);
    const [jobId, tenantJob] = tenantJobs[0] as [
      string,
      { name: string; data: PrivacyDueAlertsTenantJobPayload },
    ];
    expect(jobId).toBe('privacy-due-alerts:tenant_isp_ejemplo:2026-04-01');
    expect(tenantJob.data).toEqual({
      tenantId: TENANT.id,
      tenantSlug: TENANT.slug,
      schemaName: TENANT.schema_name,
      date: '2026-04-01',
    });
    expect(JSON.stringify(tenantJob.data)).not.toContain('@');
    expect(dataSource.query).toHaveBeenCalledTimes(2);

    await processor.process(job(tenantJob.name, tenantJob.data));

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
  });

  it('calculates the civil date in Bogota rather than UTC', () => {
    expect(bogotaCivilDate(new Date('2026-04-01T04:30:00.000Z'))).toBe('2026-03-31');
  });

  it('uses the shared calendar when the due window crosses Semana Santa', async () => {
    const queryRunner = buildQueryRunner();
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    const adapter = new PrivacyRequestsReadAdapter(dataSource as never);

    await TenantContext.run(
      { tenantId: TENANT.id, schemaName: TENANT.schema_name, tenantSlug: TENANT.slug },
      () => adapter.dueCounts('2026-04-01'),
    );

    expect(addColombiaBusinessDays('2026-04-01', 2)).toBe('2026-04-07');
    expect(queryRunner.manager.query).toHaveBeenCalledWith(expect.any(String), [
      '2026-04-01',
      '2026-04-07',
    ]);
  });

  it('reconstructs tenant context, applies R2 with a tenant manager, and sends counts without PII', async () => {
    const { processor, requestsService, requestsReadPort, permissionHolders, mailer, queryRunner } =
      buildHarness();
    const payload = {
      tenantId: TENANT.id,
      tenantSlug: TENANT.slug,
      schemaName: TENANT.schema_name,
      date: '2026-04-01',
    };

    await processor.process(job(PRIVACY_DUE_ALERTS_TENANT_JOB, payload));

    expect(requestsService.markDesisted).toHaveBeenCalledWith('2026-04-01', queryRunner.manager);
    expect(requestsReadPort.dueCounts).toHaveBeenCalledWith('2026-04-01');
    expect(permissionHolders.holders).toHaveBeenCalledWith('privacy.manage', queryRunner.manager);
    const email = mailer.sendMail.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
      text?: string;
    };
    expect(email.to).toBe('privacy@example.test');
    expect(email.html).toContain('Vencidas: 0');
    expect(email.html).toContain('Vencen en dos días hábiles o menos: 1');
    expect(email.html).toContain('Abrir bandeja');
    expect(email.html).toContain(`https://portal.example.test${PRIVACY_DUE_ALERTS_INBOX_PATH}`);
    expect(email.html).not.toContain('privacy@example.test');
    expect(email.text).not.toContain('privacy@example.test');
    expect(email.subject).not.toContain('privacy@example.test');
  });

  it('records the no-recipient metric and completes without sending when holders are absent', async () => {
    const { processor, permissionHolders, mailer, metrics } = buildHarness();
    permissionHolders.holders.mockResolvedValue([]);

    await expect(
      processor.process(
        job(PRIVACY_DUE_ALERTS_TENANT_JOB, {
          tenantId: TENANT.id,
          tenantSlug: TENANT.slug,
          schemaName: TENANT.schema_name,
          date: '2026-04-01',
        }),
      ),
    ).resolves.toBeUndefined();

    expect(metrics.recordNoRecipients).toHaveBeenCalledWith(TENANT.schema_name);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('rejects malformed child payloads before entering a tenant schema', async () => {
    const { processor, dataSource } = buildHarness();

    await expect(
      processor.process(
        job(PRIVACY_DUE_ALERTS_TENANT_JOB, {
          tenantId: TENANT.id,
          tenantSlug: TENANT.slug,
          schemaName: 'tenant_bad; DROP SCHEMA public',
          date: '2026-04-01',
        }),
      ),
    ).rejects.toThrow();

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
