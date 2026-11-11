import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { TenantContext } from '@iwana/db';
import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  ContractActivatedEnvelopeSchema,
  TenantStatus,
  type BillingGenerationSummary,
  type ContractActivatedEnvelope,
} from '@iwana/shared';
import { Job, UnrecoverableError } from 'bullmq';
import { TenantLifecycleReadPort } from '../../tenant/ports/tenant-lifecycle-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { SanitizeFailedReason } from '../../../common/sanitize-failed-reason.decorator';
import { BillingGenerationService } from './billing-generation.service';
import { CRM_CONTRACT_EVENTS_QUEUE } from './billing-generation.constants';

export type ContractActivatedOutcome =
  | 'generated'
  | 'blocked'
  | 'existing'
  | 'omittedImpersonation'
  | 'omittedTermination'
  | 'withoutCycle'
  | 'notDue';

function localDateFor(date: Date, timezone: string): string {
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

function outcomeOf(summary: BillingGenerationSummary): ContractActivatedOutcome | null {
  const order: ContractActivatedOutcome[] = [
    'generated',
    'blocked',
    'existing',
    'omittedImpersonation',
    'omittedTermination',
    'withoutCycle',
    'notDue',
  ];
  return order.find((key) => summary[key] > 0) ?? null;
}

/**
 * Consumidor MOD14 de `crm.contract.activated` (ADR-109 D6, spec §5 E, CA-3).
 *
 * Genera de inmediato el primer documento de cobro desde `billingStartDate`
 * reutilizando BillingGenerationService. Se ejecuta aunque la política del tenant
 * tenga `automatic_generation` apagada: esa bandera gobierna el lote diario, no el
 * primer cobro por activación (objetivo de la spec). `first_period_mode`,
 * `approval_mode`, prorrateo y vencimientos salen de la política efectiva.
 *
 * El tenant sale del registro de tenants, nunca del payload: el payload solo aporta
 * el identificador que se valida contra un tenant activo.
 */
@Injectable()
@Processor(CRM_CONTRACT_EVENTS_QUEUE, { concurrency: 2 })
export class ContractActivatedProcessor extends WorkerHost {
  private readonly logger = new Logger(ContractActivatedProcessor.name);

  constructor(
    @Inject(TenantLifecycleReadPort) private readonly tenants: TenantLifecycleReadPort,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
    private readonly generation: BillingGenerationService,
  ) {
    super();
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<ContractActivatedOutcome> {
    if (job.name !== CONTRACT_ACTIVATED_EVENT_TYPE)
      throw new UnrecoverableError('Evento de contrato desconocido para facturación.');
    const parsed = ContractActivatedEnvelopeSchema.safeParse(job.data);
    if (!parsed.success)
      throw new UnrecoverableError('El evento de contrato activado no es válido.');
    return this.handle(parsed.data);
  }

  async handle(envelope: ContractActivatedEnvelope): Promise<ContractActivatedOutcome> {
    const tenant = await this.tenants.findTenantLifecycleById(envelope.tenantId);
    if (!tenant || tenant.status !== TenantStatus.ACTIVE || tenant.deletedAt) {
      throw new UnrecoverableError('El tenant del evento de contrato no está activo.');
    }
    return TenantContext.run(
      { tenantId: tenant.id, schemaName: tenant.schemaName, tenantSlug: tenant.slug },
      async () => {
        const settings = await this.tenantSettings.getSnapshot({ tenantId: tenant.id });
        const summary = await this.generation.generate({
          date: localDateFor(new Date(), settings.timezone),
          contractId: envelope.payload.contractId,
          firstChargeFrom: envelope.payload.billingStartDate,
          actorId: null,
        });
        // Un fallo de generación se reintenta; el reintento es idempotente.
        if (summary.failed > 0) throw new Error('Falló la generación del primer cobro.');
        const outcome = outcomeOf(summary);
        // Sin resultado: el contrato aún no es legible para Billing; se reintenta.
        if (!outcome) throw new Error('El contrato activado no está disponible para facturar.');
        this.logger.log(`Primer cobro por activación: ${outcome}.`);
        return outcome;
      },
    );
  }
}
