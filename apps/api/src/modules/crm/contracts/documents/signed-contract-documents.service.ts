import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AccessPermissionKey,
  AuditAction,
  SIGNED_CONTRACT_DOCUMENT_RESTRICTED_CODE,
  SignedContractDocumentSchema,
  type SignedContractDocument,
} from '@iwana/shared';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { AuditService } from '../../../audit/audit.service';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { ContractsService } from '../contracts.service';
import { ContractSignatureService } from './contract-signature.service';

interface SignedRow {
  contract_id: string;
  signed_at: Date | string;
  template_version: string;
}

/**
 * Contrato firmado en la pestaña Documentos del suscriptor (bloque G; spec §5 G, CA-9).
 *
 * El PDF firmado incluye el número de documento de quien firma: solo lo descarga quien tenga
 * `crm.subscribers.document.read` (si no, 403 `SIGNED_CONTRACT_DOCUMENT_RESTRICTED`). Con el
 * titular bloqueado o anonimizado no se descarga. Cada descarga verifica la huella (CA-4) y
 * queda auditada.
 */
@Injectable()
export class SignedContractDocumentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contractsService: ContractsService,
    private readonly signatureService: ContractSignatureService,
    private readonly permissions: EffectivePermissionsService,
    private readonly auditService: AuditService,
  ) {}

  async listForSubscriber(
    subscriberId: string,
    actor: JwtPayload,
  ): Promise<SignedContractDocument[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT s.contract_id, s.signed_at, s.template_version
           FROM contract_signatures s
           JOIN contracts c ON c.id = s.contract_id
          WHERE s.tenant_id = $1 AND c.subscriber_id = $2
          ORDER BY s.signed_at DESC`,
        [tenantId, subscriberId],
      ),
    )) as SignedRow[];
    if (rows.length === 0) return [];

    const titularRestricted = await this.isTitularRestricted(subscriberId);
    const canReadDocument = await this.canReadDocument(actor);
    const restriction = titularRestricted
      ? 'TITULAR_RESTRICTED'
      : canReadDocument
        ? null
        : 'DOCUMENT_NUMBER_RESTRICTED';
    return rows.map((row) =>
      SignedContractDocumentSchema.parse({
        contractId: row.contract_id,
        signedAt: new Date(row.signed_at).toISOString(),
        templateVersion: row.template_version,
        downloadable: restriction === null,
        restriction,
      }),
    );
  }

  async download(contractId: string, actor: JwtPayload): Promise<Buffer> {
    await this.contractsService.findOne(contractId);
    if (!(await this.canReadDocument(actor))) {
      throw new ForbiddenException({
        code: SIGNED_CONTRACT_DOCUMENT_RESTRICTED_CODE,
        message:
          'No tienes autorización para descargar el contrato firmado: incluye el número de documento.',
      });
    }
    await this.contractsService.assertContractNotBlocked(contractId);
    const pdf = await this.signatureService.readSignedDocument(contractId);
    await this.auditService.log({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'ContractSignature',
      entityId: contractId,
      userId: actor.sub,
      newValue: { contractId, purpose: 'SIGNED_CONTRACT_DOWNLOAD' },
    });
    return pdf;
  }

  private async canReadDocument(actor: JwtPayload): Promise<boolean> {
    const granted = await this.permissions.getEffectivePermissionsForUser(actor.sub);
    return granted.includes(AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ);
  }

  private async isTitularRestricted(subscriberId: string): Promise<boolean> {
    try {
      await this.contractsService.assertSubscriberNotBlockedForMutation(subscriberId);
      return false;
    } catch (error) {
      if (error instanceof ConflictException) return true;
      if (error instanceof NotFoundException) return true;
      throw error;
    }
  }
}
