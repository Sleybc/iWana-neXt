import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { SanitizeFailedReason } from '../../../common/sanitize-failed-reason.decorator';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { isValidSchemaName, runInTenantSchema, TenantContext } from '@iwana/db';
import { AccessPermissionKey } from '@iwana/shared';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { MailerService } from '../../mailer/mailer.service';
import { IPermissionHoldersReadPort } from '../../access-control/ports/permission-holders-read.port';
import { IPrivacyRequestsReadPort } from '../requests/ports/privacy-requests-read.port';
import { PrivacyRequestsService } from '../requests/requests.service';
import {
  PRIVACY_DUE_ALERTS_CRON_PATTERN,
  PRIVACY_DUE_ALERTS_INBOX_PATH,
  PRIVACY_DUE_ALERTS_QUEUE,
  PRIVACY_DUE_ALERTS_REPEATABLE_JOB_ID,
  PRIVACY_DUE_ALERTS_SWEEP_JOB,
  PRIVACY_DUE_ALERTS_TENANT_JOB,
  PRIVACY_DUE_ALERTS_TIME_ZONE,
} from './privacy-due-alerts.constants';
import { PrivacyDueAlertsMetrics } from './privacy-due-alerts.metrics';

const TENANT_SWEEP_SQL = `
  SELECT id::text, slug, schema_name
  FROM public.tenants
  WHERE status = 'ACTIVE' AND deleted_at IS NULL
  ORDER BY schema_name
`;

const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

interface ActiveTenantRow {
  id: string;
  slug: string;
  schema_name: string;
}

export interface PrivacyDueAlertsTenantJobPayload {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  date: string;
}

interface DueCounts {
  overdue: number;
  dueSoon: number;
  overdueTasks: number;
}

export function bogotaCivilDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRIVACY_DUE_ALERTS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function makePrivacyDueAlertsTenantJobId(schemaName: string, date: string): string {
  return `${PRIVACY_DUE_ALERTS_QUEUE}:${schemaName}:${date}`;
}

function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseTenantPayload(value: unknown): PrivacyDueAlertsTenantJobPayload {
  if (!value || typeof value !== 'object') {
    throw new UnrecoverableError('El payload de alerta de privacidad no es válido.');
  }

  const payload = value as Partial<PrivacyDueAlertsTenantJobPayload>;
  if (
    typeof payload.tenantId !== 'string' ||
    !TENANT_ID_PATTERN.test(payload.tenantId) ||
    typeof payload.tenantSlug !== 'string' ||
    !TENANT_SLUG_PATTERN.test(payload.tenantSlug) ||
    typeof payload.schemaName !== 'string' ||
    !isValidSchemaName(payload.schemaName) ||
    typeof payload.date !== 'string' ||
    !isCivilDate(payload.date)
  ) {
    throw new UnrecoverableError('El payload de alerta de privacidad no es válido.');
  }

  return {
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    schemaName: payload.schemaName,
    date: payload.date,
  };
}

function isDueCounts(value: unknown): value is DueCounts {
  if (!value || typeof value !== 'object') return false;
  const counts = value as Partial<DueCounts>;
  return [counts.overdue, counts.dueSoon, counts.overdueTasks].every(
    (count) => Number.isInteger(count) && Number(count) >= 0,
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

@Injectable()
@Processor(PRIVACY_DUE_ALERTS_QUEUE)
export class PrivacyDueAlertsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(PrivacyDueAlertsProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(PRIVACY_DUE_ALERTS_QUEUE) private readonly queue: Queue,
    private readonly requestsService: PrivacyRequestsService,
    @Inject(IPrivacyRequestsReadPort) private readonly requestsReadPort: IPrivacyRequestsReadPort,
    @Inject(IPermissionHoldersReadPort)
    private readonly permissionHoldersReadPort: IPermissionHoldersReadPort,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly metrics: PrivacyDueAlertsMetrics,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      PRIVACY_DUE_ALERTS_SWEEP_JOB,
      {},
      {
        repeat: {
          pattern: PRIVACY_DUE_ALERTS_CRON_PATTERN,
          tz: PRIVACY_DUE_ALERTS_TIME_ZONE,
        },
        jobId: PRIVACY_DUE_ALERTS_REPEATABLE_JOB_ID,
      },
    );
    this.logger.log('[privacy-due-alerts] Job repetible registrado (07:00 America/Bogota).');
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    if (job.name === PRIVACY_DUE_ALERTS_SWEEP_JOB) {
      await this.enqueueActiveTenants();
      return;
    }

    if (job.name === PRIVACY_DUE_ALERTS_TENANT_JOB) {
      await this.processTenant(parseTenantPayload(job.data));
      return;
    }

    this.logger.warn(`[privacy-due-alerts] Job no reconocido omitido: ${job.name}`);
  }

  private async enqueueActiveTenants(): Promise<void> {
    const tenants = (await this.dataSource.query(TENANT_SWEEP_SQL)) as ActiveTenantRow[];
    const date = bogotaCivilDate(new Date());
    const failedSchemas: string[] = [];

    for (const tenant of tenants) {
      if (
        !TENANT_ID_PATTERN.test(tenant.id) ||
        !TENANT_SLUG_PATTERN.test(tenant.slug) ||
        !isValidSchemaName(tenant.schema_name)
      ) {
        this.logger.warn('[privacy-due-alerts] Se omitió un tenant activo con contexto inválido.');
        continue;
      }

      const payload: PrivacyDueAlertsTenantJobPayload = {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        schemaName: tenant.schema_name,
        date,
      };
      const jobId = makePrivacyDueAlertsTenantJobId(tenant.schema_name, date);

      try {
        await this.queue.add(PRIVACY_DUE_ALERTS_TENANT_JOB, payload, {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: false,
        });
      } catch {
        failedSchemas.push(tenant.schema_name);
      }
    }

    if (failedSchemas.length > 0) {
      throw new Error(
        `No se pudieron encolar alertas de privacidad para ${failedSchemas.length} tenant(s).`,
      );
    }
  }

  private async processTenant(payload: PrivacyDueAlertsTenantJobPayload): Promise<void> {
    await TenantContext.run(
      {
        tenantId: payload.tenantId,
        schemaName: payload.schemaName,
        tenantSlug: payload.tenantSlug,
      },
      async () => {
        await runInTenantSchema(this.dataSource, payload.schemaName, (queryRunner) =>
          this.requestsService.markDesisted(payload.date, queryRunner.manager),
        );

        const counts = await this.requestsReadPort.dueCounts(payload.date);
        if (!isDueCounts(counts)) {
          throw new Error('El conteo de vencimientos de privacidad no es válido.');
        }
        if (counts.overdue + counts.dueSoon + counts.overdueTasks === 0) return;

        const holders = await runInTenantSchema(
          this.dataSource,
          payload.schemaName,
          (queryRunner) =>
            this.permissionHoldersReadPort.holders(
              AccessPermissionKey.PRIVACY_MANAGE,
              queryRunner.manager,
            ),
        );

        if (holders.length === 0) {
          this.metrics.recordNoRecipients(payload.schemaName);
          return;
        }

        const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3002');
        const inboxUrl = new URL(PRIVACY_DUE_ALERTS_INBOX_PATH, frontendUrl).toString();
        const inboxUrlHtml = escapeHtml(inboxUrl);
        const text = [
          'Hay solicitudes de datos personales que requieren seguimiento.',
          `Vencidas: ${counts.overdue}`,
          `Vencen en dos días hábiles o menos: ${counts.dueSoon}`,
          `Tareas de suplantación vencidas: ${counts.overdueTasks}`,
          `Abrir bandeja: ${inboxUrl}`,
        ].join('\n');
        const html = [
          '<p>Hay solicitudes de datos personales que requieren seguimiento.</p>',
          '<ul>',
          `<li>Vencidas: ${counts.overdue}</li>`,
          `<li>Vencen en dos días hábiles o menos: ${counts.dueSoon}</li>`,
          `<li>Tareas de suplantación vencidas: ${counts.overdueTasks}</li>`,
          '</ul>',
          `<p><a href="${inboxUrlHtml}">Abrir bandeja</a></p>`,
        ].join('');

        await this.mailer.sendMail({
          to: holders.map((holder) => holder.email).join(', '),
          subject: 'Solicitudes de datos personales que requieren seguimiento',
          text,
          html,
        });
      },
    );
  }
}
