import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TenantContext } from '@iwana/db';
import {
  BILLING_INSTALLATION_CLOSED_JOB_NAME,
  BILLING_INSTALLATION_EVENTS_QUEUE,
  SignedBillingInstallationClosedEventSchema,
  TenantStatus,
  canonicalizeBillingInstallationClosedEvent,
  type SignedBillingInstallationClosedEvent,
} from '@iwana/shared';
import { SanitizeFailedReason } from '../../../common/sanitize-failed-reason.decorator';
import { TenantLifecycleReadPort } from '../../tenant/ports/tenant-lifecycle-read.port';
import {
  BillingInstallationBreakdownService,
  type InstallationCaptureOutcome,
} from './billing-installation-breakdown.service';

/**
 * H-5: intentos para un cierre cuya OT aún no encuentra contrato (`withoutContract`). El contrato
 * puede quedar visible después del cierre de la OT (firma en la instalación, ADR-109). Los
 * primeros intentos fallan de forma recuperable y BullMQ reintenta con el backoff exponencial del
 * productor (1 s, 2 s…); el último descarta con un log de advertencia. Si el trabajo trae menos
 * intentos configurados, se respeta ese límite. El registro es idempotente por OT (R5).
 */
export const WITHOUT_CONTRACT_MAX_ATTEMPTS = 3;

/** Error recuperable para que BullMQ reintente un cierre sin contrato todavía (H-5). */
export class InstallationContractPendingError extends Error {
  constructor(attempt: number, maxAttempts: number) {
    super(`Contrato de la instalación aún no visible (intento ${attempt} de ${maxAttempts}).`);
    this.name = 'InstallationContractPendingError';
  }
}

function readSigningKey(value: unknown, required: boolean): Buffer | null {
  if (typeof value !== 'string' || !value.trim()) {
    if (!required) return null;
    throw new UnrecoverableError('INTERNAL_QUEUE_SIGNING_KEY ausente.');
  }
  const encoded = value.trim();
  const key = Buffer.from(encoded, 'base64');
  if (key.byteLength < 32 || key.toString('base64') !== encoded) {
    throw new UnrecoverableError('INTERNAL_QUEUE_SIGNING_KEY inválida.');
  }
  return key;
}

/** Valida forma y HMAC (clave activa o anterior) antes de confiar en el tenant del mensaje. */
export function verifySignedBillingInstallationEvent(
  candidate: unknown,
  config: ConfigService,
): SignedBillingInstallationClosedEvent {
  const parsed = SignedBillingInstallationClosedEventSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new UnrecoverableError('Evento de cierre de instalación sin firma válida.');
  }
  const signed = parsed.data;
  const canonical = canonicalizeBillingInstallationClosedEvent(signed.tenantId, signed.envelope);
  const provided = Buffer.from(signed.signature, 'hex');
  const keys = [
    readSigningKey(config.get<string>('INTERNAL_QUEUE_SIGNING_KEY'), true),
    readSigningKey(config.get<string>('INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS'), false),
  ].filter((key): key is Buffer => key !== null);
  let matched = false;
  for (const key of keys) {
    const expected = createHmac('sha256', key).update(canonical).digest();
    matched = timingSafeEqual(expected, provided) || matched;
  }
  if (!matched) {
    throw new UnrecoverableError('Firma del evento de cierre de instalación inválida.');
  }
  return signed;
}

/**
 * Consumidor MOD14 del cierre de OT de instalación (spec 2026-11-13, bloque A). Productor: relay
 * del outbox de MOD11 en el worker, con jobId = eventId. El tenant sale del registro de tenants
 * tras verificar la firma; el payload solo aporta identificadores y la OT se relee por puerto.
 * Un fallo técnico se reintenta (8 intentos); el registro es idempotente por OT. Sin contrato
 * visible se reintenta hasta `WITHOUT_CONTRACT_MAX_ATTEMPTS` antes de descartar (H-5).
 */
@Injectable()
@Processor(BILLING_INSTALLATION_EVENTS_QUEUE, { concurrency: 2 })
export class BillingInstallationConsumptionProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingInstallationConsumptionProcessor.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(TenantLifecycleReadPort) private readonly tenants: TenantLifecycleReadPort,
    private readonly breakdowns: BillingInstallationBreakdownService,
  ) {
    super();
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<InstallationCaptureOutcome> {
    if (job.name !== BILLING_INSTALLATION_CLOSED_JOB_NAME) {
      throw new UnrecoverableError('Trabajo desconocido en la cola de consumo de instalación.');
    }
    const signed = verifySignedBillingInstallationEvent(job.data, this.config);
    const tenant = await this.tenants.findTenantLifecycleById(signed.tenantId);
    if (!tenant || tenant.status !== TenantStatus.ACTIVE || tenant.deletedAt) {
      throw new UnrecoverableError('El tenant del cierre de instalación no está activo.');
    }
    return TenantContext.run(
      { tenantId: tenant.id, schemaName: tenant.schemaName, tenantSlug: tenant.slug },
      async () => {
        const outcome = await this.breakdowns.capture(signed.envelope.executionOrderId);
        if (outcome === 'withoutContract') {
          const maxAttempts = Math.max(
            1,
            Math.min(WITHOUT_CONTRACT_MAX_ATTEMPTS, job.opts?.attempts ?? 1),
          );
          const attempt = (job.attemptsMade ?? 0) + 1;
          if (attempt < maxAttempts) {
            this.logger.warn(
              `Consumo de instalación sin contrato todavía; se reintenta (${attempt}/${maxAttempts}).`,
            );
            throw new InstallationContractPendingError(attempt, maxAttempts);
          }
          this.logger.warn(
            `Consumo de instalación descartado sin contrato tras ${attempt} intento(s).`,
          );
          return outcome;
        }
        if (outcome === 'withoutSubscriber') {
          this.logger.warn(`Consumo de instalación sin registrar: ${outcome}.`);
        } else {
          this.logger.log(`Consumo de instalación: ${outcome}.`);
        }
        return outcome;
      },
    );
  }
}
