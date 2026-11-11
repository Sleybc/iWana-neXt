import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import {
  AuditAction,
  type ContractAutoCreationIssue,
  type ContractAutoCreationMissingField,
} from '@iwana/shared';
import { IActiveUserEmailReadPort } from '../../access-control/ports/active-user-email-read.port';
import { AuditService } from '../../audit/audit.service';
import { MailerService } from '../../mailer/mailer.service';
import {
  ContractAutoCreationPort,
  type ContractAutoCreationRequest,
} from '../ports/contract-auto-creation.port';
import { ContractsService } from './contracts.service';

/** Etiquetas visibles del aviso (sin datos del titular). */
export const CONTRACT_AUTO_CREATION_MISSING_LABELS: Record<
  ContractAutoCreationMissingField,
  string
> = {
  PLAN: 'plan de la oportunidad',
  INSTALLATION_ADDRESS: 'dirección del punto de servicio',
  CONTRACTUAL_AUTHORIZATION: 'autorización de tratamiento contractual',
  VAT_RESPONSIBILITY: 'responsabilidad de IVA',
  RUT_RESPONSIBILITIES: 'responsabilidades del RUT',
  NIT_VERIFICATION_DIGIT: 'dígito de verificación del NIT',
  LEGAL_REPRESENTATIVE: 'representante legal',
};

export function describeContractAutoCreationIssue(issue: ContractAutoCreationIssue): string {
  const labels = issue.missing.map((field) => CONTRACT_AUTO_CREATION_MISSING_LABELS[field]);
  return `No se pudo crear el contrato: falta ${labels.join(', ')}.`;
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
 * Contrato automático (fase 2, bloque A; D3, D-F2, CA-1 a CA-3). Tras crear el suscriptor:
 * - crea el borrador con `ContractsService.createAutomaticFromExpediente` (idempotente);
 * - si falta un dato, el aviso ya quedó en el suscriptor: lo audita y avisa por correo al
 *   responsable comercial de la oportunidad (sin datos del titular, solo qué falta y el enlace);
 * - un rechazo de negocio (titular bloqueado, suscriptor cancelado) no tumba la conversión del
 *   suscriptor: se registra y se omite. Los errores inesperados se propagan para que el
 *   pipeline los registre en `crm_conversion_failures` y se reintente.
 */
@Injectable()
export class ContractAutoCreationService implements ContractAutoCreationPort {
  private readonly logger = new Logger(ContractAutoCreationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contractsService: ContractsService,
    private readonly auditService: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    @Inject(IActiveUserEmailReadPort) private readonly userEmails: IActiveUserEmailReadPort,
  ) {}

  async createForExpediente(request: ContractAutoCreationRequest): Promise<void> {
    const { subscriberId, expedienteId, actorId } = request;
    let result: Awaited<ReturnType<ContractsService['createAutomaticFromExpediente']>>;
    try {
      result = await this.contractsService.createAutomaticFromExpediente(
        subscriberId,
        expedienteId,
        actorId,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(
          `[contract-auto] Contrato automático omitido expediente=${expedienteId} ${summarizeErrorForLog(error)}`,
        );
        return;
      }
      throw error;
    }

    if (result.outcome === 'CREATED') {
      this.logger.log(
        `[contract-auto] Contrato ${result.contract.id} creado desde expediente ${expedienteId}`,
      );
      return;
    }
    if (result.outcome === 'EXISTING') {
      this.logger.log(`[contract-auto] Expediente ${expedienteId} ya tiene contrato; se omite.`);
      return;
    }

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Subscriber',
      entityId: subscriberId,
      userId: actorId,
      newValue: {
        contractAutoCreationIssue: { missing: result.issue.missing },
        expedienteId,
      },
    });
    await this.notifyOwner(subscriberId, expedienteId, result.issue);
  }

  /** Correo al responsable comercial de la oportunidad; un fallo no revierte el aviso. */
  private async notifyOwner(
    subscriberId: string,
    expedienteId: string,
    issue: ContractAutoCreationIssue,
  ): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();
    try {
      const email = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const [row] = (await qr.query(
          `SELECT COALESCE(current_responsible_user_id, assigned_to)::text AS owner_id
             FROM expediente_records WHERE id = $1::uuid`,
          [expedienteId],
        )) as Array<{ owner_id: string | null }>;
        if (!row?.owner_id) return null;
        return this.userEmails.emailOf(row.owner_id, qr.manager);
      });
      if (!email) {
        this.logger.warn(
          `[contract-auto] Expediente ${expedienteId} sin responsable con correo; aviso solo en la ficha.`,
        );
        return;
      }
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3002');
      const url = new URL(`/dashboard/crm/subscribers/${subscriberId}`, frontendUrl).toString();
      const summary = describeContractAutoCreationIssue(issue);
      await this.mailer.sendMail({
        to: email,
        subject: 'No se pudo crear el contrato de una venta',
        text: [summary, `Revisar el suscriptor: ${url}`].join('\n'),
        html: `<p>${escapeHtml(summary)}</p><p><a href="${escapeHtml(url)}">Revisar el suscriptor</a></p>`,
      });
    } catch (error) {
      this.logger.warn(
        `[contract-auto] No se pudo avisar al responsable del expediente ${expedienteId}: ${summarizeErrorForLog(error)}`,
      );
    }
  }
}
