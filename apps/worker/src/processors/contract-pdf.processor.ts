import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { isValidSchemaName, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import {
  CRM_CONTRACT_PDF_JOB_NAME,
  CRM_CONTRACT_PDF_QUEUE,
  CRM_CONTRACT_SIGNED_PDF_JOB_NAME,
  ContractDocumentSnapshotSchema,
  ContractPdfJobPayloadSchema,
  ContractSignedPdfJobPayloadSchema,
  contractSignatureObjectKeys,
  type ContractDocumentSnapshot,
  type ContractPdfJobPayload,
  type ContractSignedPdfJobPayload,
  type ContractSignedPdfJobResult,
} from '@iwana/shared';
import {
  ENCRYPTED_OBJECT_CONTENT_TYPE,
  STORAGE_PORT,
  decryptObjectBuffer,
  encryptObjectBuffer,
  type StoragePort,
} from '@iwana/storage';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import {
  decryptAesGcmText,
  loadContractPdfKeys,
  type ContractPdfKeys,
} from '../contracts/contract-pdf-keys';
import { ContractPdfRenderer } from '../contracts/contract-pdf-renderer';
import { embedSignature, fillContractTemplate } from '../contracts/contract-template';

export const CONTRACT_TEMPLATES_DIR_ENV = 'CONTRACT_TEMPLATES_DIR';
export const CONTRACT_TEMPLATE_FILE = 'contrato-servicio.base.html';

interface GenerationRow {
  id: string;
  contract_id: string;
  tenant_id: string;
  status: 'PENDING' | 'READY' | 'FAILED';
  snapshot_encrypted: string | null;
}

/** Plantillas: `dist/templates` en la imagen; `src/templates` en desarrollo y pruebas. */
export function resolveContractTemplatesDir(configured?: string): string {
  if (configured?.trim()) return resolve(configured.trim());
  const candidates = [
    resolve(__dirname, '../templates/contracts'),
    resolve(__dirname, '../../src/templates/contracts'),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]!;
}

export function contractPdfObjectKey(
  schemaName: string,
  contractId: string,
  generationId: string,
): string {
  return `${schemaName}/contracts/${contractId}/${generationId}.pdf.enc`;
}

/**
 * Genera el PDF del contrato (cierre de venta, bloque B; ADR-109 D5, CA-14).
 *
 * Carga el snapshot cifrado y la plantilla, rellena con escapado, renderiza con Chromium,
 * calcula la huella SHA-256 del PDF, lo guarda cifrado en medios y marca READY. Idempotente:
 * una generación READY o FAILED no se reprocesa y la clave del objeto es determinista. Agotados
 * los reintentos, marca FAILED con RENDER_FAILED. Los logs solo llevan identificadores.
 */
@Processor(CRM_CONTRACT_PDF_QUEUE, { concurrency: 1 })
export class ContractPdfProcessor extends WorkerHost {
  private readonly logger = new Logger(ContractPdfProcessor.name);
  private keys: ContractPdfKeys | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly renderer: ContractPdfRenderer,
    private readonly config: ConfigService,
  ) {
    super();
  }

  @SanitizeFailedReason()
  async process(
    job: Job<ContractPdfJobPayload | ContractSignedPdfJobPayload>,
  ): Promise<void | ContractSignedPdfJobResult> {
    if (job.name === CRM_CONTRACT_SIGNED_PDF_JOB_NAME) return this.processSigned(job);
    if (job.name !== CRM_CONTRACT_PDF_JOB_NAME) {
      throw new UnrecoverableError(`Job no soportado en ${CRM_CONTRACT_PDF_QUEUE}.`);
    }
    const parsed = ContractPdfJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Payload de contrato inválido.');
    const payload = parsed.data;
    const schemaName = await this.resolveSchema(payload.tenantId);
    const startedAt = Date.now();

    try {
      const outcome = await this.generate(payload, schemaName);
      this.logger.log(
        `contract_pdf.${outcome.result} generationId=${payload.generationId} ` +
          `attempt=${job.attemptsMade + 1} durationMs=${Date.now() - startedAt}` +
          (outcome.bytes ? ` bytes=${outcome.bytes}` : ''),
      );
    } catch (error) {
      const finalAttempt =
        error instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.warn(
        `contract_pdf.attempt_failed generationId=${payload.generationId} ` +
          `attempt=${job.attemptsMade + 1} ` +
          summarizeErrorForLog(error),
      );
      if (finalAttempt) {
        this.logger.warn(`contract_pdf.failed generationId=${payload.generationId}`);
        await this.markFailed(payload, schemaName);
      }
      throw error;
    }
  }

  /**
   * PDF firmado (bloque D; ADR-109 D1). Enfoque elegido: re-render con Chromium del mismo
   * snapshot cifrado de la generación READY, con la imagen de la firma incrustada en los
   * huecos `data-signature-slot`. Se descartó estampar el PDF ya generado porque exige una
   * dependencia nueva (pdf-lib) y la API no tiene Chromium. La API espera este resultado para
   * responder con la huella; los fallos no cambian el estado de la generación (la firma se
   * reintenta con la misma clave de idempotencia y las mismas claves de objeto).
   */
  private async processSigned(job: Job<unknown>): Promise<ContractSignedPdfJobResult> {
    const parsed = ContractSignedPdfJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Payload de firma inválido.');
    const payload = parsed.data;
    const schemaName = await this.resolveSchema(payload.tenantId);
    const startedAt = Date.now();
    const row = await this.loadGeneration(payload, schemaName);
    if (row.status !== 'READY' || !row.snapshot_encrypted) {
      throw new UnrecoverableError('La generación del contrato no está lista para firmar.');
    }
    const keys = contractSignatureObjectKeys(
      schemaName,
      payload.contractId,
      payload.generationId,
      payload.signingKey,
    );
    let png: Buffer;
    try {
      png = decryptObjectBuffer(
        await this.storage.getObject(keys.signatureImage),
        this.getKeys().readKeys,
      );
    } catch {
      throw new UnrecoverableError('Imagen de la firma ilegible.');
    }
    const snapshot = this.readSnapshot(row.snapshot_encrypted, payload.contractId);
    let html: string;
    try {
      html = embedSignature(fillContractTemplate(await this.readTemplate(), snapshot), png);
    } catch {
      throw new UnrecoverableError('No se pudo incrustar la firma en la plantilla.');
    }
    const pdf = await this.renderer.render(html);
    const signedDocumentSha256 = createHash('sha256').update(pdf).digest('hex');
    await this.storage.putObject(
      keys.signedDocument,
      encryptObjectBuffer(pdf, this.getKeys().activeKey),
      {
        contentType: ENCRYPTED_OBJECT_CONTENT_TYPE,
        metadata: { encryption: 'aes-256-gcm', kind: 'contract-signed-pdf' },
      },
    );
    this.logger.log(
      `contract_pdf.signed generationId=${payload.generationId} ` +
        `attempt=${job.attemptsMade + 1} durationMs=${Date.now() - startedAt} bytes=${pdf.length}`,
    );
    return { signedDocumentSha256, bytes: pdf.length };
  }

  private readTemplate(): Promise<string> {
    return readFile(
      resolve(
        resolveContractTemplatesDir(this.config.get<string>(CONTRACT_TEMPLATES_DIR_ENV)),
        CONTRACT_TEMPLATE_FILE,
      ),
      'utf8',
    );
  }

  private async generate(
    payload: ContractPdfJobPayload,
    schemaName: string,
  ): Promise<{ result: 'ready' | 'skipped'; bytes?: number }> {
    const row = await this.loadGeneration(payload, schemaName);
    if (row.status !== 'PENDING') return { result: 'skipped' };
    if (!row.snapshot_encrypted) throw new UnrecoverableError('Generación sin snapshot.');

    const snapshot = this.readSnapshot(row.snapshot_encrypted, payload.contractId);
    const template = await this.readTemplate();
    let html: string;
    try {
      html = fillContractTemplate(template, snapshot);
    } catch {
      throw new UnrecoverableError('La plantilla del contrato no es compatible con el snapshot.');
    }
    const pdf = await this.renderer.render(html);
    const documentSha256 = createHash('sha256').update(pdf).digest('hex');
    const objectKey = contractPdfObjectKey(schemaName, payload.contractId, payload.generationId);
    await this.storage.putObject(objectKey, encryptObjectBuffer(pdf, this.getKeys().activeKey), {
      contentType: ENCRYPTED_OBJECT_CONTENT_TYPE,
      metadata: { encryption: 'aes-256-gcm', kind: 'contract-pdf' },
    });

    await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `UPDATE contract_document_generations
            SET status = 'READY', document_object_key = $3, document_sha256 = $4,
                completed_at = now(), updated_at = now(), attempts = attempts + 1
          WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING'`,
        [payload.generationId, payload.tenantId, objectKey, documentSha256],
      ),
    );
    return { result: 'ready', bytes: pdf.length };
  }

  private readSnapshot(encrypted: string, contractId: string): ContractDocumentSnapshot {
    let snapshot: ContractDocumentSnapshot;
    try {
      snapshot = ContractDocumentSnapshotSchema.parse(
        JSON.parse(decryptAesGcmText(encrypted, this.getKeys().readKeys)),
      );
    } catch {
      throw new UnrecoverableError('Snapshot del contrato ilegible.');
    }
    if (snapshot.contractId !== contractId) {
      throw new UnrecoverableError('El snapshot no corresponde al contrato.');
    }
    return snapshot;
  }

  private async loadGeneration(
    payload: Pick<ContractPdfJobPayload, 'generationId' | 'tenantId' | 'contractId'>,
    schemaName: string,
  ): Promise<GenerationRow> {
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT id, contract_id, tenant_id, status, snapshot_encrypted
           FROM contract_document_generations
          WHERE id = $1 AND tenant_id = $2`,
        [payload.generationId, payload.tenantId],
      ),
    )) as GenerationRow[];
    const row = rows[0];
    if (!row || row.contract_id !== payload.contractId) {
      throw new UnrecoverableError('Generación de contrato no encontrada.');
    }
    return row;
  }

  private async markFailed(payload: ContractPdfJobPayload, schemaName: string): Promise<void> {
    try {
      await runInTenantSchema(this.dataSource, schemaName, (qr) =>
        qr.query(
          `UPDATE contract_document_generations
              SET status = 'FAILED', failure_reason = 'RENDER_FAILED', completed_at = now(),
                  updated_at = now(), attempts = attempts + 1
            WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING'`,
          [payload.generationId, payload.tenantId],
        ),
      );
    } catch (error) {
      this.logger.error(
        `contract_pdf.mark_failed_error generationId=${payload.generationId} ` +
          summarizeErrorForLog(error),
      );
    }
  }

  private async resolveSchema(tenantId: string): Promise<string> {
    const rows = (await this.dataSource.query(
      `SELECT schema_name FROM public.tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    )) as Array<{ schema_name: string }>;
    const schemaName = rows[0]?.schema_name;
    if (!schemaName || !isValidSchemaName(schemaName)) {
      throw new UnrecoverableError('Tenant del contrato no encontrado.');
    }
    return schemaName;
  }

  private getKeys(): ContractPdfKeys {
    this.keys ??= loadContractPdfKeys((key) => this.config.get(key));
    return this.keys;
  }
}
