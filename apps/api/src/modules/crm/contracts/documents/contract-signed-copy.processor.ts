import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import type { DataSource } from 'typeorm';
import { TenantContext, isValidSchemaName, runInTenantSchema } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { SanitizeFailedReason } from '../../../../common/sanitize-failed-reason.decorator';
import { AuditService } from '../../../audit/audit.service';
import { MailerService } from '../../../mailer/mailer.service';
import { resolveRegisteredTenant } from '../../../tenant/ports/resolve-registered-tenant';
import { TenantLifecycleReadPort } from '../../../tenant/ports/tenant-lifecycle-read.port';
import {
  CONTRACT_SIGNED_COPY_FILENAME,
  contractSignedCopyTemplate,
} from '../../../mailer/templates/contract-signed-copy.template';
import { SubscribersService } from '../../subscribers/subscribers.service';
import { getTenantLocalDate } from '../billing-cycle-date.util';
import { ContractsService } from '../contracts.service';
import { ContractsTenantSettingsReadPort } from '../ports/contracts-tenant-settings-read.port';
import {
  CONTRACT_SIGNED_COPY_JOB,
  CONTRACT_SIGNED_COPY_QUEUE,
  type ContractSignedCopyJobPayload,
  type ContractSignedCopyStatus,
} from './contract-signed-copy.constants';
import { ContractSignatureService } from './contract-signature.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

interface SignatureCopyRow {
  id: string;
  contract_id: string;
  subscriber_id: string;
  signed_at: Date | string;
  copy_email_status: string | null;
}

export function parseContractSignedCopyPayload(value: unknown): ContractSignedCopyJobPayload {
  const invalid = () =>
    new UnrecoverableError('El payload de la copia del contrato firmado no es válido.');
  if (!value || typeof value !== 'object') throw invalid();
  const payload = value as Partial<ContractSignedCopyJobPayload>;
  if (
    typeof payload.tenantId !== 'string' ||
    !UUID_PATTERN.test(payload.tenantId) ||
    typeof payload.tenantSlug !== 'string' ||
    !TENANT_SLUG_PATTERN.test(payload.tenantSlug) ||
    typeof payload.schemaName !== 'string' ||
    !isValidSchemaName(payload.schemaName) ||
    typeof payload.signatureId !== 'string' ||
    !UUID_PATTERN.test(payload.signatureId)
  ) {
    throw invalid();
  }
  return {
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    schemaName: payload.schemaName,
    signatureId: payload.signatureId,
  };
}

/**
 * Copia del contrato firmado al correo del titular (bloque G; spec §5 G, CA-9).
 *
 * Idempotente por firma: bloquea la fila de `contract_signatures` y, si ya tiene
 * `copy_email_status`, no hace nada. Sin correo registrado no envía y deja `NO_EMAIL`;
 * con el titular bloqueado o anonimizado deja `TITULAR_RESTRICTED`. Si el envío falla, la
 * transacción revierte y BullMQ reintenta. El resultado queda en la fila y en auditoría;
 * los logs solo llevan identificadores.
 */
@Injectable()
@Processor(CONTRACT_SIGNED_COPY_QUEUE)
export class ContractSignedCopyProcessor extends WorkerHost {
  private readonly logger = new Logger(ContractSignedCopyProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly signatureService: ContractSignatureService,
    private readonly contractsService: ContractsService,
    private readonly subscribersService: SubscribersService,
    private readonly tenantSettings: ContractsTenantSettingsReadPort,
    private readonly mailer: MailerService,
    private readonly auditService: AuditService,
    @Inject(TenantLifecycleReadPort) private readonly tenants: TenantLifecycleReadPort,
  ) {
    super();
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== CONTRACT_SIGNED_COPY_JOB) {
      this.logger.warn(`[contract-signed-copy] Job no reconocido omitido: ${job.name}`);
      return;
    }
    await this.send(parseContractSignedCopyPayload(job.data));
  }

  /** Expuesto para pruebas. Devuelve el estado resultante o null si la firma no existe. */
  async send(untrusted: ContractSignedCopyJobPayload): Promise<ContractSignedCopyStatus | null> {
    // SEC-7: schema y slug salen del registro de tenants; el payload solo se contrasta.
    const tenant = await resolveRegisteredTenant(this.tenants, untrusted);
    const payload = { ...untrusted, schemaName: tenant.schemaName, tenantSlug: tenant.slug };
    return TenantContext.run(
      {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.slug,
      },
      () =>
        runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
          const rows = (await qr.query(
            `SELECT s.id, s.contract_id, c.subscriber_id, s.signed_at, s.copy_email_status
               FROM contract_signatures s
               JOIN contracts c ON c.id = s.contract_id
              WHERE s.tenant_id = $1 AND s.id = $2
              FOR UPDATE OF s`,
            [payload.tenantId, payload.signatureId],
          )) as SignatureCopyRow[];
          const row = rows[0];
          if (!row) {
            this.logger.warn(
              `[contract-signed-copy] Firma inexistente signatureId=${payload.signatureId}`,
            );
            return null;
          }
          if (row.copy_email_status) return row.copy_email_status as ContractSignedCopyStatus;

          const status = await this.deliver(payload.tenantId, row);
          await qr.query(
            `UPDATE contract_signatures
                SET copy_email_status = $3, copy_email_processed_at = now()
              WHERE tenant_id = $1 AND id = $2`,
            [payload.tenantId, row.id, status],
          );
          await this.auditService.logWithin(
            {
              action: AuditAction.UPDATE,
              entityType: 'ContractSignature',
              entityId: row.id,
              newValue: { contractId: row.contract_id, copyEmailStatus: status },
            },
            qr.manager,
          );
          this.logger.log(
            `crm.contract.signed_copy signatureId=${row.id} contractId=${row.contract_id} status=${status}`,
          );
          return status;
        }),
    );
  }

  private async deliver(
    tenantId: string,
    row: SignatureCopyRow,
  ): Promise<ContractSignedCopyStatus> {
    try {
      await this.contractsService.assertContractNotBlocked(row.contract_id);
    } catch (error) {
      if (error instanceof ConflictException) return 'TITULAR_RESTRICTED';
      throw error;
    }
    const subscriber = (await this.subscribersService.findById(row.subscriber_id)) as {
      email?: string | null;
    };
    const to = subscriber.email?.trim();
    if (!to) return 'NO_EMAIL';

    const pdf = await this.signatureService.readSignedDocument(row.contract_id);
    const timezone = await this.tenantSettings.getTimezone(tenantId);
    const template = contractSignedCopyTemplate({
      signedOn: getTenantLocalDate(new Date(row.signed_at), timezone),
    });
    await this.mailer.sendMail({
      to,
      ...template,
      attachments: [
        { filename: CONTRACT_SIGNED_COPY_FILENAME, content: pdf, contentType: 'application/pdf' },
      ],
    });
    return 'SENT';
  }
}
