import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { isValidSchemaName, TenantContext } from '@iwana/db';
import { TenantStatus, type BillingGenerationJobPayload } from '@iwana/shared';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantLifecycleReadPort } from '../../tenant/ports/tenant-lifecycle-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { BillingGenerationService } from './billing-generation.service';
import {
  BILLING_GENERATION_JOB,
  BILLING_GENERATION_QUEUE,
  BILLING_GENERATION_RETRY_LIMIT,
} from './billing-generation.constants';
import { SanitizeFailedReason } from '../../../common/sanitize-failed-reason.decorator';
import {
  TENANT_RESTORED_EVENT,
  TENANT_RETIRED_EVENT,
  isRetiredTenant,
  type TenantLifecycleEvent,
} from '../../tenant/events/tenant-lifecycle.events';

/** Id del programador diario de facturación de una empresa. */
export function billingGenerationSchedulerId(schemaName: string): string {
  return `billing-generation:${schemaName}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function parsePayload(value: unknown): BillingGenerationJobPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnrecoverableError('El contexto del job de facturación no es válido.');
  }
  const payload = value as Partial<BillingGenerationJobPayload>;
  if (
    typeof payload.tenantId !== 'string' ||
    !UUID_PATTERN.test(payload.tenantId) ||
    typeof payload.schemaName !== 'string' ||
    !isValidSchemaName(payload.schemaName) ||
    typeof payload.localDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(payload.localDate)
  ) {
    throw new UnrecoverableError('El contexto del job de facturación no es válido.');
  }
  return {
    tenantId: payload.tenantId,
    schemaName: payload.schemaName,
    localDate: payload.localDate,
  };
}

@Injectable()
@Processor(BILLING_GENERATION_QUEUE, { concurrency: 2 })
export class BillingGenerationProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingGenerationProcessor.name);

  constructor(
    @InjectQueue(BILLING_GENERATION_QUEUE) private readonly queue: Queue,
    @Inject(TenantLifecycleReadPort) private readonly tenants: TenantLifecycleReadPort,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
    private readonly generation: BillingGenerationService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const tenants = await this.tenants.listActiveTenantContexts();
    for (const tenant of tenants) {
      if (
        tenant.status !== TenantStatus.ACTIVE ||
        tenant.deletedAt !== null ||
        !isValidSchemaName(tenant.schemaName)
      )
        continue;
      try {
        const hour = await this.generation.getGenerationSchedule(tenant.id, tenant.schemaName);
        if (hour === null) continue;
        const settings = await this.tenantSettings.getSnapshot({ tenantId: tenant.id });
        await this.queue.upsertJobScheduler(
          billingGenerationSchedulerId(tenant.schemaName),
          { pattern: `0 ${hour} * * *`, tz: settings.timezone },
          {
            name: BILLING_GENERATION_JOB,
            data: {
              tenantId: tenant.id,
              schemaName: tenant.schemaName,
              localDate: this.localDate(new Date(), settings.timezone),
            },
            opts: {
              attempts: BILLING_GENERATION_RETRY_LIMIT,
              backoff: { type: 'exponential', delay: 1_000 },
              removeOnComplete: true,
              removeOnFail: 100,
            },
          },
        );
      } catch {
        this.logger.warn('No se pudo programar la generación de un tenant.');
      }
    }
  }

  @OnEvent('billing.policy.changed', { async: true })
  async refreshSchedules(): Promise<void> {
    await this.onApplicationBootstrap();
  }

  /** Una empresa restaurada vuelve a tener su programación (si tiene horario). */
  @OnEvent(TENANT_RESTORED_EVENT, { async: true })
  async onTenantRestored(): Promise<void> {
    await this.onApplicationBootstrap();
  }

  /** Una empresa marcada para eliminación deja de generar: se retira su programador. */
  @OnEvent(TENANT_RETIRED_EVENT, { async: true })
  async onTenantRetired(event: TenantLifecycleEvent): Promise<void> {
    await this.removeTenantScheduler(event.tenantId, event.schemaName);
  }

  private async removeTenantScheduler(tenantId: string, schemaName: string): Promise<void> {
    await this.queue.removeJobScheduler(billingGenerationSchedulerId(schemaName));
    this.logger.log(`billing_generation.scheduler_removed tenantId=${tenantId}`);
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== BILLING_GENERATION_JOB)
      throw new UnrecoverableError('Job de facturación desconocido.');
    const payload = parsePayload(job.data);
    const tenant = await this.tenants.findTenantLifecycleById(payload.tenantId);
    // Defensa (K): el programador de una empresa que ya no existe o está retirada no falla en
    // cada vuelta; se retira a sí mismo y termina.
    if (isRetiredTenant(tenant)) {
      // El id del programador sale del schema de la fila si existe (no del payload).
      await this.removeTenantScheduler(payload.tenantId, tenant?.schemaName ?? payload.schemaName);
      return;
    }
    // Suspendida o inactiva: sin trabajo y sin fallar; el programador se conserva y la
    // generación se reanuda al reactivarla (AI-EM-ARCH, 2026-11-22).
    if (
      tenant &&
      (tenant.status === TenantStatus.SUSPENDED || tenant.status === TenantStatus.INACTIVE)
    ) {
      this.logger.log(`billing_generation.skipped_inactive tenantId=${payload.tenantId}`);
      return;
    }
    // PROVISIONING / PROVISIONING_FAILED con programador, o schema distinto del job (incluido uno
    // inválido en la fila): se rechaza sin reintento.
    if (
      !tenant ||
      tenant.status !== TenantStatus.ACTIVE ||
      tenant.schemaName !== payload.schemaName ||
      !isValidSchemaName(tenant.schemaName)
    ) {
      throw new UnrecoverableError('El tenant del job de facturación no está activo.');
    }
    await TenantContext.run(
      { tenantId: tenant.id, schemaName: tenant.schemaName, tenantSlug: tenant.slug },
      async () => {
        if (!(await this.generation.automaticGenerationEnabled(tenant.id, tenant.schemaName)))
          return;
        const settings = await this.tenantSettings.getSnapshot({ tenantId: tenant.id });
        const summary = await this.generation.generate({
          date: this.localDate(new Date(), settings.timezone),
        });
        this.logger.log(`Generación de facturación finalizada: ${JSON.stringify(summary)}`);
      },
    );
  }

  private localDate(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (key: string) => parts.find((value) => value.type === key)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (!year || !month || !day) throw new RangeError('No se resolvió la fecha civil del tenant.');
    return `${year}-${month}-${day}`;
  }
}
