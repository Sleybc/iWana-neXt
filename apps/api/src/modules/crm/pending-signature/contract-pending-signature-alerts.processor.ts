import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { isValidSchemaName, runInTenantSchema, TenantContext } from '@iwana/db';
import { AccessPermissionKey } from '@iwana/shared';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { SanitizeFailedReason } from '../../../common/sanitize-failed-reason.decorator';
import { IPermissionHoldersReadPort } from '../../access-control/ports/permission-holders-read.port';
import { MailerService } from '../../mailer/mailer.service';
import {
  CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE,
  CONTRACT_PENDING_SIGNATURE_CRON_PATTERN,
  CONTRACT_PENDING_SIGNATURE_LIST_PATH,
  CONTRACT_PENDING_SIGNATURE_REPEATABLE_JOB_ID,
  CONTRACT_PENDING_SIGNATURE_SWEEP_JOB,
  CONTRACT_PENDING_SIGNATURE_TENANT_JOB,
  CONTRACT_PENDING_SIGNATURE_THRESHOLD_HOURS,
  CONTRACT_PENDING_SIGNATURE_TIME_ZONE,
} from './contract-pending-signature.constants';
import { ContractPendingSignatureService } from './contract-pending-signature.service';

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

/** Payload sin PII: solo el contexto tenant explícito y la fecha civil de la corrida. */
export interface ContractPendingSignatureTenantJobPayload {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  date: string;
}

export function bogotaCivilDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTRACT_PENDING_SIGNATURE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function makeContractPendingSignatureTenantJobId(schemaName: string, date: string): string {
  return `${CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE}:${schemaName}:${date}`;
}

export function parseContractPendingSignatureTenantPayload(
  value: unknown,
): ContractPendingSignatureTenantJobPayload {
  const invalid = () =>
    new UnrecoverableError('El payload del aviso de contratos pendientes de firma no es válido.');
  if (!value || typeof value !== 'object') throw invalid();
  const payload = value as Partial<ContractPendingSignatureTenantJobPayload>;
  if (
    typeof payload.tenantId !== 'string' ||
    !TENANT_ID_PATTERN.test(payload.tenantId) ||
    typeof payload.tenantSlug !== 'string' ||
    !TENANT_SLUG_PATTERN.test(payload.tenantSlug) ||
    typeof payload.schemaName !== 'string' ||
    !isValidSchemaName(payload.schemaName) ||
    typeof payload.date !== 'string' ||
    !CIVIL_DATE_PATTERN.test(payload.date)
  ) {
    throw invalid();
  }
  return {
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    schemaName: payload.schemaName,
    date: payload.date,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Trabajo diario (ADR-109 D3, spec G5, CA-5): avisa a quien tenga
 * `crm.contracts.pending_signature.notify` de los contratos con servicio activado hace 48 h o
 * más y sin firma. Un aviso por contrato y umbral (`contract_pending_signature_alerts`); el
 * correo solo lleva el conteo y el enlace, nunca datos del titular.
 */
@Injectable()
@Processor(CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE)
export class ContractPendingSignatureAlertsProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ContractPendingSignatureAlertsProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE) private readonly queue: Queue,
    private readonly pendingSignature: ContractPendingSignatureService,
    @Inject(IPermissionHoldersReadPort)
    private readonly permissionHoldersReadPort: IPermissionHoldersReadPort,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      CONTRACT_PENDING_SIGNATURE_SWEEP_JOB,
      {},
      {
        repeat: {
          pattern: CONTRACT_PENDING_SIGNATURE_CRON_PATTERN,
          tz: CONTRACT_PENDING_SIGNATURE_TIME_ZONE,
        },
        jobId: CONTRACT_PENDING_SIGNATURE_REPEATABLE_JOB_ID,
      },
    );
    this.logger.log(
      '[contract-pending-signature] Job repetible registrado (08:00 America/Bogota).',
    );
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    if (job.name === CONTRACT_PENDING_SIGNATURE_SWEEP_JOB) {
      await this.enqueueActiveTenants();
      return;
    }
    if (job.name === CONTRACT_PENDING_SIGNATURE_TENANT_JOB) {
      await this.processTenant(parseContractPendingSignatureTenantPayload(job.data), new Date());
      return;
    }
    this.logger.warn(`[contract-pending-signature] Job no reconocido omitido: ${job.name}`);
  }

  private async enqueueActiveTenants(): Promise<void> {
    const tenants = (await this.dataSource.query(TENANT_SWEEP_SQL)) as ActiveTenantRow[];
    const date = bogotaCivilDate(new Date());
    let failed = 0;

    for (const tenant of tenants) {
      if (
        !TENANT_ID_PATTERN.test(tenant.id) ||
        !TENANT_SLUG_PATTERN.test(tenant.slug) ||
        !isValidSchemaName(tenant.schema_name)
      ) {
        this.logger.warn('[contract-pending-signature] Se omitió un tenant con contexto inválido.');
        continue;
      }
      const payload: ContractPendingSignatureTenantJobPayload = {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        schemaName: tenant.schema_name,
        date,
      };
      try {
        await this.queue.add(CONTRACT_PENDING_SIGNATURE_TENANT_JOB, payload, {
          jobId: makeContractPendingSignatureTenantJobId(tenant.schema_name, date),
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: false,
        });
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      throw new Error(
        `No se pudieron encolar avisos de contratos pendientes de firma para ${failed} tenant(s).`,
      );
    }
  }

  /** Expuesto para pruebas: procesa un tenant con un instante de referencia explícito. */
  async processTenant(payload: ContractPendingSignatureTenantJobPayload, now: Date): Promise<void> {
    const threshold = CONTRACT_PENDING_SIGNATURE_THRESHOLD_HOURS;
    await TenantContext.run(
      {
        tenantId: payload.tenantId,
        schemaName: payload.schemaName,
        tenantSlug: payload.tenantSlug,
      },
      async () => {
        const due = await this.pendingSignature.listDueForAlert(threshold, now);
        if (due.length === 0) return;

        await runInTenantSchema(this.dataSource, payload.schemaName, async (queryRunner) => {
          const manager = queryRunner.manager;
          const holders = await this.permissionHoldersReadPort.holders(
            AccessPermissionKey.CRM_CONTRACTS_PENDING_SIGNATURE_NOTIFY,
            manager,
          );
          if (holders.length === 0) {
            // Sin destinatarios no se registra el aviso: sale cuando alguien tenga el permiso.
            this.logger.warn('[contract-pending-signature] Tenant sin destinatarios del aviso.');
            return;
          }

          const fresh = await this.pendingSignature.recordAlerts(
            manager,
            due,
            threshold,
            holders.length,
          );
          if (fresh.length === 0) return;

          const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3002');
          const listUrl = new URL(CONTRACT_PENDING_SIGNATURE_LIST_PATH, frontendUrl).toString();
          const summary =
            fresh.length === 1
              ? `Hay 1 contrato con servicio activo hace más de ${threshold} horas sin firmar.`
              : `Hay ${fresh.length} contratos con servicio activo hace más de ${threshold} horas sin firmar.`;
          // Si el envío falla, la transacción revierte el registro y el reintento lo repite.
          await this.mailer.sendMail({
            to: holders.map((holder) => holder.email).join(', '),
            subject: 'Contratos pendientes de firma',
            text: [summary, `Revisar suscriptores: ${listUrl}`].join('\n'),
            html: `<p>${escapeHtml(summary)}</p><p><a href="${escapeHtml(listUrl)}">Revisar suscriptores</a></p>`,
          });
        });
      },
    );
  }
}
