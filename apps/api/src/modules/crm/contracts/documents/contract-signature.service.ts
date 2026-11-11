import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { QueueEvents, type Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import {
  AuditAction,
  CRM_CONTRACT_PDF_QUEUE,
  CRM_CONTRACT_SIGNED_PDF_JOB_NAME,
  ContractSignatureResponseSchema,
  ContractSignedPdfJobPayloadSchema,
  ContractSignedPdfJobResultSchema,
  contractSignatureObjectKeys,
  contractSignedPdfJobId,
  type ContractSignatureCommand,
  type ContractSignatureResponse,
} from '@iwana/shared';
import {
  ENCRYPTED_OBJECT_CONTENT_TYPE,
  STORAGE_PORT,
  decryptObjectBuffer,
  encryptObjectBuffer,
  type StoragePort,
} from '@iwana/storage';
import { encryptAes256Gcm, loadPiiAesGcmKeyPair } from '../../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../../audit/audit.service';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { ContractStatus } from '../../enums/contract-status.enum';
import {
  CONTRACT_PROVISIONING_ACTIVATION_READ_PORT,
  type ContractProvisioningActivationReadPort,
} from '../../ports/contract-provisioning-activation-read.port';
import {
  SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT,
  type ServiceProvisioningCommercialStatusPort,
} from '../../ports/service-provisioning-commercial-status.port';
import { getTenantLocalDate } from '../billing-cycle-date.util';
import { ContractActivationEventsPublisher } from '../contract-activation-events';
import { ContractPermanenceService } from '../contract-permanence.service';
import { ContractsService } from '../contracts.service';
import { ContractsTenantSettingsReadPort } from '../ports/contracts-tenant-settings-read.port';
import { ContractDocumentGenerationService } from './contract-document-generation.service';
import { ContractSignedCopyProducer } from './contract-signed-copy.producer';

/** Columnas cifradas que escribe este servicio: contract_signatures.signer_encrypted. */

/** Espera máxima del PDF firmado en el worker antes de responder 503 (se reintenta). */
export const SIGNED_PDF_WAIT_MS = 60_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_PREFIX = 'data:image/png;base64,';

interface GenerationRow {
  id: string;
  contract_id: string;
  execution_order_id: string | null;
  status: string;
  template_legal_text_id: string | null;
  template_version: string | null;
  document_object_key: string | null;
  document_sha256: string | null;
}

interface SignatureRow {
  id: string;
  contract_id: string;
  signed_at: Date | string;
  billing_start_date: string;
  signed_document_sha256: string;
  signed_document_object_key: string;
  template_version: string;
}

const SIGNATURE_COLUMNS = `id, contract_id, signed_at, billing_start_date::text AS billing_start_date,
  signed_document_sha256, signed_document_object_key, template_version`;

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } };
  return candidate?.code === '23505' || candidate?.driverError?.code === '23505';
}

/**
 * Firma del contrato en la visita (cierre de venta, bloque D; ADR-109 D1/D2; CA-2, CA-4,
 * CA-10, CA-12).
 *
 * 1. Valida acceso a la OT, idempotencia, DRAFT, titular y la generación READY con la huella
 *    que se mostró. 2. Guarda la firma cifrada en medios. 3. El worker re-renderiza el PDF con
 *    la firma incrustada y devuelve su huella. 4. En una transacción: registro de firma,
 *    DRAFT → ACTIVE con start_date = activación del aprovisionamiento, permanencia y outbox
 *    `crm.contract.activated` (SIGNATURE). 5. Publica el outbox tras el commit.
 */
@Injectable()
export class ContractSignatureService implements OnModuleDestroy {
  private readonly logger = new Logger(ContractSignatureService.name);
  private readonly activeKey: Buffer;
  private readonly readKeys: Buffer[];
  private queueEvents: QueueEvents | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(CRM_CONTRACT_PDF_QUEUE) private readonly queue: Queue,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly contractsService: ContractsService,
    private readonly generationService: ContractDocumentGenerationService,
    private readonly permanenceService: ContractPermanenceService,
    private readonly activationEvents: ContractActivationEventsPublisher,
    @Inject(CONTRACT_PROVISIONING_ACTIVATION_READ_PORT)
    private readonly provisioningActivation: ContractProvisioningActivationReadPort,
    @Inject(SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT)
    private readonly commercialStatus: ServiceProvisioningCommercialStatusPort,
    private readonly tenantSettings: ContractsTenantSettingsReadPort,
    private readonly auditService: AuditService,
    configService: ConfigService,
    @Optional() private readonly signedCopy?: ContractSignedCopyProducer,
  ) {
    const keys = loadPiiAesGcmKeyPair(configService);
    this.activeKey = keys.activeKey;
    this.readKeys = [keys.activeKey, ...keys.previousKey];
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents?.close().catch(() => undefined);
  }

  async sign(
    contractId: string,
    command: ContractSignatureCommand,
    actor: JwtPayload,
  ): Promise<ContractSignatureResponse> {
    const contract = await this.contractsService.findOne(contractId);
    await this.generationService.assertExecutionOrderAccess(
      contract,
      command.executionOrderId,
      actor,
    );
    const replay = await this.replay(contractId, command.idempotencyKey);
    if (replay) return replay;

    if (contract.status !== ContractStatus.DRAFT) {
      throw new ConflictException({
        code: 'CONTRACT_NOT_DRAFT',
        message: 'Solo se firma un contrato pendiente de firma.',
      });
    }
    await this.contractsService.assertContractNotBlocked(contractId);
    const generation = await this.loadReadyGeneration(contractId, command);
    // Servicio activo = aprovisionamiento ACTIVE o CERTIFIED (la firma ocurre en la visita,
    // antes de que MOD13 fije activated_at al cerrar la OT).
    const serviceStart = await this.provisioningActivation.getServiceStart(contractId);
    if (!serviceStart) {
      throw new ConflictException({
        code: 'PROVISIONING_NOT_ACTIVE',
        message: 'El servicio de este contrato aún no está activado.',
      });
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const timezone = await this.tenantSettings.getTimezone(tenantId);
    const billingStartDate = getTenantLocalDate(serviceStart.at, timezone);

    const png = this.decodeSignature(command.signatureImage);
    const keys = contractSignatureObjectKeys(
      schemaName,
      contractId,
      generation.id,
      command.idempotencyKey,
    );
    await this.storage.putObject(keys.signatureImage, encryptObjectBuffer(png, this.activeKey), {
      contentType: ENCRYPTED_OBJECT_CONTENT_TYPE,
      metadata: { encryption: 'aes-256-gcm', kind: 'contract-signature' },
    });
    const { signedDocumentSha256 } = await this.renderSigned({
      tenantId,
      contractId,
      generationId: generation.id,
      signingKey: command.idempotencyKey,
    });

    const signedAt = new Date();
    let signatureId = '';
    try {
      await this.contractsService.activateFromSignature(contractId, actor.sub, {
        startDate: billingStartDate,
        within: async (manager) => {
          signatureId = await this.insertSignature(manager, {
            tenantId,
            contractId,
            generation,
            command,
            actor,
            signedAt,
            billingStartDate,
            signedDocumentSha256,
            keys,
          });
          await this.permanenceService.applyActivationDate(manager, contractId, billingStartDate);
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrent = await this.replay(contractId, command.idempotencyKey);
        if (concurrent) return concurrent;
        throw new ConflictException({
          code: 'CONTRACT_ALREADY_SIGNED',
          message: 'El contrato ya fue firmado.',
        });
      }
      throw error;
    }
    await this.activationEvents.publishForContract(contractId);
    await this.releaseUnsignedBlock(contractId);
    await this.signedCopy?.enqueue(signatureId);
    this.logger.log(`crm.contract.signed contractId=${contractId} generationId=${generation.id}`);
    return ContractSignatureResponseSchema.parse({
      contractId,
      status: 'ACTIVE',
      signedAt: signedAt.toISOString(),
      billingStartDate,
      signedDocumentSha256,
      templateVersion: generation.template_version,
      replayed: false,
    });
  }

  /**
   * CA-12: PDF sin firmar para mostrarlo durante la firma. Solo al técnico asignado o al
   * supervisor, solo mientras el contrato esté en DRAFT y sin firma; verifica la huella (CA-4)
   * y audita cada acceso.
   */
  async viewForSigning(
    contractId: string,
    generationId: string,
    executionOrderId: string,
    actor: JwtPayload,
  ): Promise<Buffer> {
    const contract = await this.contractsService.findOne(contractId);
    await this.generationService.assertExecutionOrderAccess(contract, executionOrderId, actor);
    const generation = await this.findGeneration(contractId, generationId);
    if (
      !generation ||
      generation.status !== 'READY' ||
      generation.execution_order_id !== executionOrderId ||
      !generation.document_object_key ||
      !generation.document_sha256
    ) {
      throw new NotFoundException('Documento del contrato no disponible.');
    }
    if (contract.status !== ContractStatus.DRAFT || (await this.isSigned(contractId))) {
      throw new ForbiddenException({
        code: 'CONTRACT_DOCUMENT_SIGNED',
        message: 'El contrato ya fue firmado; el documento no está disponible en la orden.',
      });
    }
    const pdf = await this.readVerified(
      generation.document_object_key,
      generation.document_sha256.trim(),
    );
    await this.auditService.log({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'ContractDocumentGeneration',
      entityId: generationId,
      userId: actor.sub,
      newValue: { contractId, executionOrderId, purpose: 'SIGNING' },
    });
    return pdf;
  }

  /** PDF firmado verificado contra su huella (CA-4). Para el bloque G (Documentos). */
  async readSignedDocument(contractId: string): Promise<Buffer> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT ${SIGNATURE_COLUMNS} FROM contract_signatures
          WHERE tenant_id = $1 AND contract_id = $2`,
        [tenantId, contractId],
      ),
    )) as SignatureRow[];
    const row = rows[0];
    if (!row) throw new NotFoundException('El contrato no tiene documento firmado.');
    return this.readVerified(row.signed_document_object_key, row.signed_document_sha256.trim());
  }

  private async readVerified(objectKey: string, expectedSha256: string): Promise<Buffer> {
    let pdf: Buffer;
    try {
      pdf = decryptObjectBuffer(await this.storage.getObject(objectKey), this.readKeys);
    } catch (error) {
      this.logger.warn(`contract_document.read_failed ${summarizeErrorForLog(error)}`);
      throw new ConflictException({
        code: 'CONTRACT_DOCUMENT_INTEGRITY_FAILED',
        message: 'El documento del contrato no supera la verificación.',
      });
    }
    if (sha256(pdf) !== expectedSha256) {
      throw new ConflictException({
        code: 'CONTRACT_DOCUMENT_INTEGRITY_FAILED',
        message: 'El documento del contrato no supera la verificación.',
      });
    }
    return pdf;
  }

  private async replay(
    contractId: string,
    idempotencyKey: string,
  ): Promise<ContractSignatureResponse | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT ${SIGNATURE_COLUMNS} FROM contract_signatures
          WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey],
      ),
    )) as SignatureRow[];
    const row = rows[0];
    if (!row) return null;
    if (row.contract_id !== contractId) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'La clave de idempotencia pertenece a otra firma.',
      });
    }
    await this.activationEvents.publishForContract(contractId);
    await this.releaseUnsignedBlock(contractId);
    await this.signedCopy?.enqueue(row.id);
    return ContractSignatureResponseSchema.parse({
      contractId,
      status: 'ACTIVE',
      signedAt: new Date(row.signed_at).toISOString(),
      billingStartDate: row.billing_start_date,
      signedDocumentSha256: row.signed_document_sha256.trim(),
      templateVersion: row.template_version,
      replayed: true,
    });
  }

  /** La firma resuelve CONTRACT_UNSIGNED: BLOCKED → DONE (puerto de estado comercial). */
  private async releaseUnsignedBlock(contractId: string): Promise<void> {
    try {
      const ids = await this.provisioningActivation.listUnsignedBlockedProvisioningIds(contractId);
      for (const id of ids) await this.commercialStatus.record(id, 'DONE', null);
    } catch (error) {
      // El contrato ya quedó ACTIVE; repetir la firma (replay) vuelve a intentarlo.
      this.logger.warn(`crm.contract.unsigned_release_failed ${summarizeErrorForLog(error)}`);
    }
  }

  private async isSigned(contractId: string): Promise<boolean> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT 1 FROM contract_signatures WHERE tenant_id = $1 AND contract_id = $2 LIMIT 1`,
        [tenantId, contractId],
      ),
    )) as unknown[];
    return rows.length > 0;
  }

  private async findGeneration(
    contractId: string,
    generationId: string,
  ): Promise<GenerationRow | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT id, contract_id, execution_order_id, status, template_legal_text_id,
                template_version, document_object_key, document_sha256
           FROM contract_document_generations
          WHERE tenant_id = $1 AND id = $2 AND contract_id = $3`,
        [tenantId, generationId, contractId],
      ),
    )) as GenerationRow[];
    return rows[0] ?? null;
  }

  private async loadReadyGeneration(
    contractId: string,
    command: ContractSignatureCommand,
  ): Promise<GenerationRow & { template_legal_text_id: string; template_version: string }> {
    const generation = await this.findGeneration(contractId, command.generationId);
    if (!generation) throw new NotFoundException('Generación del contrato no encontrada.');
    if (generation.status !== 'READY' || !generation.template_legal_text_id) {
      throw new ConflictException({
        code: 'CONTRACT_DOCUMENT_NOT_READY',
        message: 'El documento del contrato aún no está listo.',
      });
    }
    if (generation.execution_order_id !== command.executionOrderId) {
      throw new UnprocessableEntityException({
        code: 'GENERATION_EXECUTION_ORDER_MISMATCH',
        message: 'El documento no se generó para esta orden de trabajo.',
      });
    }
    if (generation.document_sha256?.trim() !== command.documentSha256) {
      throw new ConflictException({
        code: 'CONTRACT_DOCUMENT_HASH_MISMATCH',
        message: 'El documento firmado no coincide con el documento generado.',
      });
    }
    return generation as GenerationRow & {
      template_legal_text_id: string;
      template_version: string;
    };
  }

  private decodeSignature(dataUrl: string): Buffer {
    const png = Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), 'base64');
    if (png.length <= PNG_MAGIC.length || !png.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new UnprocessableEntityException({
        code: 'SIGNATURE_IMAGE_INVALID',
        message: 'La firma no es una imagen PNG válida.',
      });
    }
    return png;
  }

  /** Encola el re-render firmado y espera su huella; jobId determinista por clave de firma. */
  private async renderSigned(
    payload: Parameters<typeof ContractSignedPdfJobPayloadSchema.parse>[0],
  ): Promise<{ signedDocumentSha256: string }> {
    const data = ContractSignedPdfJobPayloadSchema.parse(payload);
    try {
      const job = await this.queue.add(CRM_CONTRACT_SIGNED_PDF_JOB_NAME, data, {
        jobId: contractSignedPdfJobId(data.signingKey),
        attempts: 2,
        backoff: { type: 'fixed', delay: 2_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: true,
      });
      const result = await job.waitUntilFinished(await this.getQueueEvents(), SIGNED_PDF_WAIT_MS);
      return ContractSignedPdfJobResultSchema.parse(result);
    } catch (error) {
      this.logger.warn(
        `contract_pdf.sign_unavailable generationId=${data.generationId} ` +
          summarizeErrorForLog(error),
      );
      throw new ServiceUnavailableException({
        code: 'SIGNED_DOCUMENT_UNAVAILABLE',
        message: 'No se pudo preparar el contrato firmado. Intenta de nuevo.',
      });
    }
  }

  protected async getQueueEvents(): Promise<QueueEvents> {
    if (!this.queueEvents) {
      this.queueEvents = new QueueEvents(CRM_CONTRACT_PDF_QUEUE, {
        connection: this.queue.opts.connection,
        ...(this.queue.opts.prefix ? { prefix: this.queue.opts.prefix } : {}),
      });
      await this.queueEvents.waitUntilReady();
    }
    return this.queueEvents;
  }

  private async insertSignature(
    manager: EntityManager,
    input: {
      tenantId: string;
      contractId: string;
      generation: GenerationRow & { template_legal_text_id: string; template_version: string };
      command: ContractSignatureCommand;
      actor: JwtPayload;
      signedAt: Date;
      billingStartDate: string;
      signedDocumentSha256: string;
      keys: { signatureImage: string; signedDocument: string };
    },
  ): Promise<string> {
    const { command, generation } = input;
    const signatureId = randomUUID();
    const signatureAssetId = randomUUID();
    const signedDocumentAssetId = randomUUID();
    await manager.query(
      `INSERT INTO contract_signatures
         (id, tenant_id, contract_id, generation_id, idempotency_key, execution_order_id,
          technician_id, signed_at, signer_encrypted, template_legal_text_id, template_version,
          unsigned_document_sha256, signed_document_sha256, signature_asset_id,
          signature_object_key, signed_document_asset_id, signed_document_object_key,
          billing_start_date, location_latitude, location_longitude, device_user_agent,
          device_platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18, $19, $20, $21, $22)`,
      [
        signatureId,
        input.tenantId,
        input.contractId,
        generation.id,
        command.idempotencyKey,
        command.executionOrderId,
        input.actor.sub,
        input.signedAt,
        encryptAes256Gcm(JSON.stringify(command.signer), this.activeKey),
        generation.template_legal_text_id,
        generation.template_version,
        command.documentSha256,
        input.signedDocumentSha256,
        signatureAssetId,
        input.keys.signatureImage,
        signedDocumentAssetId,
        input.keys.signedDocument,
        input.billingStartDate,
        command.location?.latitude ?? null,
        command.location?.longitude ?? null,
        command.device.userAgent,
        command.device.platform,
      ],
    );
    await this.auditService.logWithin(
      {
        action: AuditAction.CREATE,
        entityType: 'ContractSignature',
        entityId: signatureId,
        userId: input.actor.sub,
        newValue: {
          contractId: input.contractId,
          generationId: generation.id,
          executionOrderId: command.executionOrderId,
          templateVersion: generation.template_version,
          unsignedDocumentSha256: command.documentSha256,
          signedDocumentSha256: input.signedDocumentSha256,
          billingStartDate: input.billingStartDate,
          withLocation: command.location !== null,
        },
      },
      manager,
    );
    return signatureId;
  }
}
