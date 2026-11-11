import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import {
  AccessPermissionKey,
  AuditAction,
  CRM_CONTRACT_PDF_JOB_NAME,
  CRM_CONTRACT_PDF_QUEUE,
  CONTRACT_DOCUMENT_SNAPSHOT_VERSION,
  ContractDocumentGenerationSchema,
  ContractDocumentSnapshotSchema,
  ContractPdfJobPayloadSchema,
  ExecutionOrderContractSchema,
  type ExecutionOrderContract,
  type ContractDocumentFailureReason,
  type ContractDocumentGeneration,
  type ContractDocumentSnapshot,
  type OperatorContractRequiredField,
} from '@iwana/shared';
import { encryptAes256Gcm, loadPiiAesGcmKeyPair } from '../../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../../audit/audit.service';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { InstalledEquipmentReadPort } from '../../../inventory/ports/installed-equipment-read.port';
import { OperatorContractProfileReadPort } from '../../../organization/ports/operator-contract-profile-read.port';
import { IPrivacyLegalTextReadPort } from '../../../privacy/ports/privacy-legal-text-read.port';
import {
  EXECUTION_ORDER_READ_PORT,
  type ExecutionOrderReadPort,
} from '../../../tasks/ports/execution-order-read.port';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { ContractStatus } from '../../enums/contract-status.enum';
import { SubscribersService } from '../../subscribers/subscribers.service';
import type { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { ContractPermanenceService } from '../contract-permanence.service';
import { ContractsService } from '../contracts.service';
import type { Contract } from '../entities/contract.entity';

const TEMPLATE_TYPE = 'CONTRATO_SERVICIO' as const;
const JOB_ATTEMPTS = 3;
const JOB_BACKOFF_MS = 5_000;

interface GenerationRow {
  id: string;
  contract_id: string;
  status: ContractDocumentGeneration['status'];
  template_legal_text_id: string | null;
  template_version: string | null;
  document_sha256: string | null;
  failure_reason: ContractDocumentFailureReason | null;
  missing_operator_fields: string[] | null;
  requested_at: Date | string;
  completed_at: Date | string | null;
}

type SubscriberWithPii = Subscriber & {
  documentNumber?: string;
  email?: string;
  phone?: string;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function toContractDocumentGeneration(row: GenerationRow): ContractDocumentGeneration {
  return ContractDocumentGenerationSchema.parse({
    generationId: row.id,
    contractId: row.contract_id,
    status: row.status,
    templateLegalTextId: row.template_legal_text_id,
    templateVersion: row.template_version,
    documentSha256: row.document_sha256?.trim() ?? null,
    requestedAt: iso(row.requested_at),
    completedAt: iso(row.completed_at),
    failureReason: row.failure_reason,
    missingOperatorFields: row.missing_operator_fields ?? [],
  });
}

/** Huella de idempotencia: mismos datos y plantilla → misma generación (sin la hora de captura). */
export function snapshotDigest(snapshot: ContractDocumentSnapshot): string {
  const { capturedAt: _capturedAt, ...stable } = snapshot;
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const GENERATION_COLUMNS = `id, contract_id, status, template_legal_text_id, template_version,
  document_sha256, failure_reason, missing_operator_fields, requested_at, completed_at`;

/**
 * Generación del PDF del contrato (cierre de venta, bloque B; ADR-109 D5, CA-6, CA-10, CA-11, CA-14).
 *
 * Valida plantilla aprobada, datos del operador y titular; toma un snapshot inmutable cifrado
 * y encola en el worker un trabajo con solo identificadores. Las validaciones fallidas quedan
 * registradas como FAILED con su motivo para que la consola de OT las muestre.
 */
@Injectable()
export class ContractDocumentGenerationService {
  private readonly logger = new Logger(ContractDocumentGenerationService.name);
  private readonly piiKey: Buffer;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(CRM_CONTRACT_PDF_QUEUE) private readonly queue: Queue,
    private readonly contractsService: ContractsService,
    private readonly subscribersService: SubscribersService,
    private readonly permanenceService: ContractPermanenceService,
    private readonly commercialCatalogPort: CommercialCatalogReadPort,
    private readonly installedEquipmentPort: InstalledEquipmentReadPort,
    private readonly operatorProfilePort: OperatorContractProfileReadPort,
    @Inject(IPrivacyLegalTextReadPort)
    private readonly legalTextReadPort: IPrivacyLegalTextReadPort,
    @Inject(EXECUTION_ORDER_READ_PORT)
    private readonly executionOrderReadPort: ExecutionOrderReadPort,
    private readonly effectivePermissionsService: EffectivePermissionsService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.piiKey = loadPiiAesGcmKeyPair(configService).activeKey;
  }

  async request(
    contractId: string,
    executionOrderId: string,
    actor: JwtPayload,
  ): Promise<ContractDocumentGeneration> {
    const contract = await this.contractsService.findOne(contractId);
    await this.assertExecutionOrderAccess(contract, executionOrderId, actor);
    if (contract.status !== ContractStatus.DRAFT) {
      throw new ConflictException({
        code: 'CONTRACT_NOT_DRAFT',
        message: 'Solo se genera el contrato de un servicio pendiente de firma.',
      });
    }

    if (await this.isTitularBlocked(contractId)) {
      return this.recordFailure(contract, executionOrderId, actor, 'SUBSCRIBER_BLOCKED', [], null);
    }

    const template = await this.legalTextReadPort.current(TEMPLATE_TYPE);
    if (!template) {
      return this.recordFailure(
        contract,
        executionOrderId,
        actor,
        'TEMPLATE_NOT_APPROVED',
        [],
        null,
      );
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const operator = await this.operatorProfilePort.getForTenant(tenantId, schemaName);
    if (operator.missingFields.length > 0) {
      return this.recordFailure(
        contract,
        executionOrderId,
        actor,
        'OPERATOR_DATA_MISSING',
        operator.missingFields,
        template,
      );
    }

    const snapshot = await this.buildSnapshot(contract, executionOrderId, template, operator);
    return this.enqueueGeneration(contract, executionOrderId, actor, snapshot);
  }

  /** Última generación del contrato para la OT; null si aún no se pidió. */
  async latest(
    contractId: string,
    executionOrderId: string,
    actor: JwtPayload,
  ): Promise<ContractDocumentGeneration | null> {
    const contract = await this.contractsService.findOne(contractId);
    await this.assertExecutionOrderAccess(contract, executionOrderId, actor);
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const rows = await runInTenantSchema(
      this.dataSource,
      schemaName,
      (qr) =>
        qr.query(
          `SELECT ${GENERATION_COLUMNS}
             FROM contract_document_generations
            WHERE tenant_id = $1 AND contract_id = $2
              AND (execution_order_id = $3 OR execution_order_id IS NULL)
            ORDER BY requested_at DESC, id DESC
            LIMIT 1`,
          [tenantId, contractId, executionOrderId],
        ) as Promise<GenerationRow[]>,
    );
    return rows[0] ? toContractDocumentGeneration(rows[0]) : null;
  }

  /**
   * El técnico solo opera la OT que tiene asignada; el supervisor cualquiera del tenant.
   * La OT debe ser del mismo titular del contrato y no estar anulada.
   */
  async assertExecutionOrderAccess(
    contract: Contract,
    executionOrderId: string,
    actor: JwtPayload,
  ): Promise<void> {
    const order = await this.loadAccessibleOrder(executionOrderId);
    if (order.subscriberId !== contract.subscriberId) {
      throw new UnprocessableEntityException({
        code: 'EXECUTION_ORDER_SUBSCRIBER_MISMATCH',
        message: 'La orden de trabajo no corresponde al titular del contrato.',
      });
    }
    await this.assertAssignedOrSupervisor(order, actor);
  }

  /**
   * Contrato de la OT para el paso «Contrato» (cierre de venta, G7). Resuelve el contrato con
   * la última generación de esta OT o, si no hay, el único contrato en DRAFT del titular de la
   * OT. Solo el técnico asignado o el supervisor. El documento del titular solo se expone
   * mientras el contrato esté en DRAFT sin firma, y cada exposición queda auditada.
   */
  async executionOrderContract(
    executionOrderId: string,
    actor: JwtPayload,
  ): Promise<ExecutionOrderContract | null> {
    const order = await this.loadAccessibleOrder(executionOrderId);
    await this.assertAssignedOrSupervisor(order, actor);
    if (!order.subscriberId) return null;

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT c.id::text AS id, c.status
           FROM contracts c
          WHERE c.tenant_id = $1 AND c.subscriber_id = $2
            AND c.id = (SELECT g.contract_id FROM contract_document_generations g
                         WHERE g.tenant_id = $1 AND g.execution_order_id = $3
                         ORDER BY g.requested_at DESC, g.id DESC LIMIT 1)
         UNION ALL
         SELECT c.id::text AS id, c.status
           FROM contracts c
          WHERE c.tenant_id = $1 AND c.subscriber_id = $2 AND c.status = 'DRAFT'
            AND NOT EXISTS (SELECT 1 FROM contract_document_generations g
                             WHERE g.tenant_id = $1 AND g.execution_order_id = $3)`,
        [tenantId, order.subscriberId, executionOrderId],
      ),
    )) as Array<{ id: string; status: string }>;
    if (rows.length !== 1) return null;
    const contract = rows[0]!;

    const subscriber = (await this.subscribersService.findById(
      order.subscriberId,
    )) as SubscriberWithPii;
    const fullName =
      subscriber.businessName?.trim() ||
      [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim();
    const signable =
      contract.status === ContractStatus.DRAFT && !(await this.hasSignature(contract.id));
    const result = ExecutionOrderContractSchema.parse({
      contractId: contract.id,
      status: contract.status,
      holder: {
        fullName,
        documentType: signable ? (subscriber.documentType ?? null) : null,
        documentNumber: signable ? (subscriber.documentNumber ?? null) : null,
      },
    });
    if (signable && result.holder.documentNumber) {
      await this.auditService.log({
        action: AuditAction.RECORD_ACCESS,
        entityType: 'Contract',
        entityId: contract.id,
        userId: actor.sub,
        newValue: { executionOrderId, purpose: 'SIGNING_HOLDER_DOCUMENT' },
      });
    }
    return result;
  }

  private async hasSignature(contractId: string): Promise<boolean> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        'SELECT 1 FROM contract_signatures WHERE tenant_id = $1 AND contract_id = $2 LIMIT 1',
        [tenantId, contractId],
      ),
    )) as unknown[];
    return rows.length > 0;
  }

  private async loadAccessibleOrder(executionOrderId: string) {
    const order = await this.executionOrderReadPort.getExecutionSnapshot(executionOrderId);
    if (!order || order.isAnnulled) {
      throw new NotFoundException('Orden de trabajo no encontrada.');
    }
    return order;
  }

  /** El técnico solo opera la OT que tiene asignada; el supervisor cualquiera del tenant. */
  private async assertAssignedOrSupervisor(
    order: { assignedTechnicianId: string | null },
    actor: JwtPayload,
  ): Promise<void> {
    if (order.assignedTechnicianId === actor.sub) return;
    const permissions = await this.effectivePermissionsService.getEffectivePermissionsForUser(
      actor.sub,
    );
    if (!permissions.includes(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE)) {
      throw new ForbiddenException({
        code: 'EXECUTION_ORDER_NOT_ASSIGNED',
        message: 'La orden de trabajo no está asignada a este usuario.',
      });
    }
  }

  private async isTitularBlocked(contractId: string): Promise<boolean> {
    try {
      await this.contractsService.assertContractNotBlocked(contractId);
      return false;
    } catch (error) {
      if (error instanceof ConflictException) return true;
      throw error;
    }
  }

  private async buildSnapshot(
    contract: Contract,
    executionOrderId: string,
    template: { id: string; version: string },
    operator: Awaited<ReturnType<OperatorContractProfileReadPort['getForTenant']>>,
  ): Promise<ContractDocumentSnapshot> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const subscriber = (await this.subscribersService.findById(
      contract.subscriberId,
    )) as SubscriberWithPii;
    const segment = contract.customerSegment ?? subscriber.customerSegment ?? undefined;
    const plan = await this.commercialCatalogPort.createSnapshot(
      tenantId,
      schemaName,
      contract.planId,
      segment,
    );
    const equipment = await this.installedEquipmentPort.listInstalledAtCustomer(
      executionOrderId,
      contract.subscriberId,
    );
    const { permanence } = await this.permanenceService.get(contract.id);

    const vatRatePercent = contract.vatSnapshot?.ratePercent ?? null;
    const monthlyPrice = round2(plan.monthlyPrice);
    const vatAmount =
      vatRatePercent === null ? null : round2((monthlyPrice * vatRatePercent) / 100);
    const profile = operator.profile;
    const holderName =
      subscriber.businessName?.trim() ||
      [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim();

    return ContractDocumentSnapshotSchema.parse({
      snapshotVersion: CONTRACT_DOCUMENT_SNAPSHOT_VERSION,
      contractId: contract.id,
      executionOrderId,
      template: { legalTextId: template.id, version: template.version },
      operator: {
        legalName: profile.legalName,
        nit: profile.nit,
        qualityAndCoverageUrl: profile.qualityAndCoverageUrl,
        customerServiceChannels: profile.customerServiceChannels,
        reconnectionFee: profile.reconnectionFee,
        annualIncreaseCapPercent: profile.annualIncreaseCapPercent,
        equipmentIncidentReportChannel: profile.equipmentIncidentReportChannel,
        otherConditions: profile.otherConditions,
      },
      holder: {
        fullName: holderName,
        documentType: subscriber.documentType ?? null,
        documentNumber: subscriber.documentNumber ?? null,
        email: subscriber.email ?? null,
        phone: subscriber.phone ?? null,
      },
      service: {
        planId: contract.planId,
        planName: plan.name,
        technology: plan.technology || null,
        downloadMbps: Number.isFinite(plan.downloadSpeed) ? plan.downloadSpeed : null,
        uploadMbps: Number.isFinite(plan.uploadSpeed) ? plan.uploadSpeed : null,
        monthlyPrice,
        vatRatePercent,
        vatAmount,
        monthlyTotal: round2(monthlyPrice + (vatAmount ?? 0)),
        stratum: contract.installationStratum ?? subscriber.stratum ?? null,
        serviceUsage: contract.serviceUsage ?? null,
      },
      installation: {
        address: contract.installationAddress ?? subscriber.address ?? null,
        city: contract.installationCity ?? subscriber.city ?? null,
        department: contract.installationDepartment ?? subscriber.department ?? null,
      },
      equipment,
      permanence:
        permanence.accepted &&
        permanence.months !== null &&
        permanence.connectionFee !== null &&
        permanence.discountedOrDeferredAmount !== null
          ? {
              months: permanence.months,
              connectionFee: permanence.connectionFee,
              discountedOrDeferredAmount: permanence.discountedOrDeferredAmount,
              startDate: permanence.startDate,
              endDate: permanence.endDate,
              schedule: permanence.schedule,
            }
          : null,
      capturedAt: new Date().toISOString(),
    });
  }

  private async enqueueGeneration(
    contract: Contract,
    executionOrderId: string,
    actor: JwtPayload,
    snapshot: ContractDocumentSnapshot,
  ): Promise<ContractDocumentGeneration> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const digest = snapshotDigest(snapshot);
    const encrypted = encryptAes256Gcm(JSON.stringify(snapshot), this.piiKey);

    const { row, created } = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const inserted = (await qr.query(
        `INSERT INTO contract_document_generations
           (tenant_id, contract_id, execution_order_id, status, template_legal_text_id,
            template_version, snapshot_encrypted, snapshot_sha256, requested_by)
         VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, contract_id, snapshot_sha256)
           WHERE status IN ('PENDING', 'READY') DO NOTHING
         RETURNING ${GENERATION_COLUMNS}`,
        [
          tenantId,
          contract.id,
          executionOrderId,
          snapshot.template.legalTextId,
          snapshot.template.version,
          encrypted,
          digest,
          actor.sub,
        ],
      )) as GenerationRow[];
      if (inserted[0]) {
        await this.audit(qr.manager, inserted[0], actor, contract.id);
        return { row: inserted[0], created: true };
      }
      const existing = (await qr.query(
        `SELECT ${GENERATION_COLUMNS} FROM contract_document_generations
          WHERE tenant_id = $1 AND contract_id = $2 AND snapshot_sha256 = $3
            AND status IN ('PENDING', 'READY')
          LIMIT 1`,
        [tenantId, contract.id, digest],
      )) as GenerationRow[];
      if (!existing[0]) throw new Error('Generación concurrente no encontrada.');
      return { row: existing[0], created: false };
    });

    if (row.status === 'PENDING') await this.dispatch(tenantId, contract.id, row.id, created);
    return toContractDocumentGeneration(row);
  }

  /** jobId = generationId: reencolar una generación pendiente no duplica el trabajo. */
  private async dispatch(
    tenantId: string,
    contractId: string,
    generationId: string,
    created: boolean,
  ): Promise<void> {
    const payload = ContractPdfJobPayloadSchema.parse({ tenantId, contractId, generationId });
    try {
      await this.queue.add(CRM_CONTRACT_PDF_JOB_NAME, payload, {
        jobId: generationId,
        attempts: JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: JOB_BACKOFF_MS },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      });
    } catch (error) {
      // La fila queda PENDING: repetir la solicitud vuelve a encolar el mismo jobId.
      this.logger.warn(
        `contract_pdf.enqueue_failed generationId=${generationId} created=${created} ` +
          summarizeErrorForLog(error),
      );
    }
  }

  private async recordFailure(
    contract: Contract,
    executionOrderId: string,
    actor: JwtPayload,
    reason: Exclude<ContractDocumentFailureReason, 'RENDER_FAILED'>,
    missingFields: OperatorContractRequiredField[],
    template: { id: string; version: string } | null,
  ): Promise<ContractDocumentGeneration> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const row = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const inserted = (await qr.query(
        `INSERT INTO contract_document_generations
           (tenant_id, contract_id, execution_order_id, status, template_legal_text_id,
            template_version, failure_reason, missing_operator_fields, requested_by, completed_at)
         VALUES ($1, $2, $3, 'FAILED', $4, $5, $6, $7::text[], $8, now())
         RETURNING ${GENERATION_COLUMNS}`,
        [
          tenantId,
          contract.id,
          executionOrderId,
          template?.id ?? null,
          template?.version ?? null,
          reason,
          missingFields,
          actor.sub,
        ],
      )) as GenerationRow[];
      const created = inserted[0]!;
      await this.audit(qr.manager, created, actor, contract.id);
      return created;
    });
    this.logger.log(`contract_pdf.rejected generationId=${row.id} reason=${reason}`);
    return toContractDocumentGeneration(row);
  }

  private async audit(
    manager: EntityManager,
    row: GenerationRow,
    actor: JwtPayload,
    contractId: string,
  ): Promise<void> {
    await this.auditService.logWithin(
      {
        action: AuditAction.CREATE,
        entityType: 'ContractDocumentGeneration',
        entityId: row.id,
        userId: actor.sub,
        newValue: {
          contractId,
          status: row.status,
          failureReason: row.failure_reason,
          templateVersion: row.template_version,
        },
      },
      manager,
    );
  }
}
