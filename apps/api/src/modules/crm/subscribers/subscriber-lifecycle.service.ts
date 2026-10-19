import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditAction, SubscriberStatus } from '@iwana/shared';
import type {
  LifecycleAction,
  LifecycleChangeRecord,
  LifecycleHistoryResponse,
  LifecyclePreviewRequest,
  LifecyclePreviewResponse,
  LifecycleReactivateCommand,
  LifecycleSuspendCommand,
  LifecycleTerminateCommand,
  SubscriberCancellationCommand,
} from '@iwana/shared';
import { DataSource, QueryRunner } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import { buildPageMeta, clampLimit, clampPage } from '../../../common/pagination';
import { ContractStatus } from '../enums/contract-status.enum';
import { deriveSubscriberStatusFromContracts } from './subscriber-lifecycle.util';
import { AssetLoanReadPort } from '../../inventory/ports/asset-loan-read.port';
import {
  EXECUTION_ORDER_READ_PORT,
  type ExecutionOrderReadPort,
} from '../../tasks/ports/execution-order-read.port';

interface SubscriberRow {
  id: string;
  status: SubscriberStatus;
  activated_at: Date | string | null;
}

interface ContractRow {
  id: string;
  status: ContractStatus;
}

interface HistoryRow {
  id: string;
  entity_type: 'SUBSCRIBER' | 'CONTRACT';
  entity_id: string;
  from_status: string;
  to_status: string;
  reason_code: string;
  note_encrypted: string | null;
  contract_scope_explicit: boolean;
  source: 'MANUAL' | 'SYSTEM' | 'BILLING';
  batch_id: string;
  actor_id: string | null;
  changed_at: Date | string;
  subscriber_id: string;
}

export interface LifecycleCommandResponse {
  action: LifecycleAction;
  batchId: string;
  affectedContracts: Array<{
    id: string;
    fromStatus: ContractStatus;
    toStatus: ContractStatus;
  }>;
  subscriberStatus: { from: SubscriberStatus; to: SubscriberStatus };
  hasLiveContracts: boolean;
}

const ACTION_TRANSITIONS: Record<
  LifecycleAction,
  { from: readonly ContractStatus[]; to: ContractStatus }
> = {
  SUSPEND: { from: [ContractStatus.ACTIVE], to: ContractStatus.SUSPENDED },
  REACTIVATE: { from: [ContractStatus.SUSPENDED], to: ContractStatus.ACTIVE },
  TERMINATE: {
    from: [ContractStatus.ACTIVE, ContractStatus.SUSPENDED],
    to: ContractStatus.TERMINATED,
  },
};

type LifecycleCommand =
  | LifecycleSuspendCommand
  | LifecycleReactivateCommand
  | LifecycleTerminateCommand;

type BeforeContractTransition = (qr: QueryRunner, contractIds: readonly string[]) => Promise<void>;

@Injectable()
export class SubscriberLifecycleService {
  private readonly logger = new Logger(SubscriberLifecycleService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly assetLoanReadPort: AssetLoanReadPort,
    @Inject(EXECUTION_ORDER_READ_PORT)
    private readonly executionOrderReadPort: ExecutionOrderReadPort,
    private readonly configService: ConfigService,
  ) {}

  /** Calcula el efecto del comando sin bloquear filas ni escribir datos. */
  async preview(
    subscriberId: string,
    request: LifecyclePreviewRequest,
  ): Promise<LifecyclePreviewResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const action = request.action;
    const transition = ACTION_TRANSITIONS[action];
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriberRows = (await qr.query(
        `SELECT id, status::text AS status, activated_at
           FROM subscribers
          WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [subscriberId, tenantId],
      )) as SubscriberRow[];
      const subscriber = subscriberRows[0];
      if (!subscriber) throw new NotFoundException('Suscriptor no encontrado.');

      const contracts = (await qr.query(
        `SELECT id, status::text AS status
           FROM contracts
          WHERE subscriber_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
          ORDER BY id`,
        [subscriberId, tenantId],
      )) as ContractRow[];
      const requestedIds = request.contractIds;
      const selected = requestedIds
        ? contracts.filter(({ id }) => requestedIds.includes(id))
        : contracts.filter(({ status }) => transition.from.includes(status));
      if (selected.length === 0) {
        throw new BadRequestException({
          code: 'LIFECYCLE_NO_CHANGES',
          message: 'No hay servicios elegibles para este cambio.',
        });
      }
      if (
        requestedIds !== undefined &&
        (selected.length !== new Set(requestedIds).size ||
          selected.some(({ status }) => !transition.from.includes(status)))
      ) {
        throw new ConflictException({
          code: 'LIFECYCLE_CONTRACT_STATE_CHANGED',
          message:
            'El estado de uno o más servicios cambió. Actualiza la ficha e inténtalo de nuevo.',
        });
      }
      if (action === 'REACTIVATE' && subscriber.status === SubscriberStatus.CANCELLED) {
        throw this.cancelledSubscriberConflict();
      }

      const selectedIds = new Set(selected.map(({ id }) => id));
      const resultingStatuses = contracts.map(({ id, status }) =>
        selectedIds.has(id) ? transition.to : status,
      );
      return {
        affectedContracts: selected.map(({ id, status }) => ({
          id,
          fromStatus: status as LifecyclePreviewResponse['affectedContracts'][number]['fromStatus'],
          toStatus:
            transition.to as LifecyclePreviewResponse['affectedContracts'][number]['toStatus'],
        })),
        subscriberStatus: {
          from: subscriber.status,
          to: deriveSubscriberStatusFromContracts(
            subscriber.status,
            subscriber.activated_at,
            resultingStatuses,
          ),
        },
        hasLiveContracts: resultingStatuses.some((status) => this.isLiveStatus(status)),
        selectedContractIds: selected.map(({ id }) => id),
      };
    });

    const warnings: LifecyclePreviewResponse['warnings'] = [];
    if (action === 'TERMINATE') {
      const [loanContractIds, hasOpenWithdrawalOrders] = await Promise.all([
        this.assetLoanReadPort.findOpenContractIds(result.selectedContractIds),
        this.executionOrderReadPort.hasOpenWithdrawalOrders(subscriberId),
      ]);
      if (loanContractIds.length > 0) {
        warnings.push({ code: 'EQUIPMENT_ON_LOAN', contractIds: loanContractIds });
      }
      if (hasOpenWithdrawalOrders) {
        warnings.push({ code: 'OPEN_WITHDRAWAL_ORDERS', contractIds: [] });
      }
    }

    return {
      action,
      affectedContracts: result.affectedContracts,
      subscriberStatus: result.subscriberStatus,
      hasLiveContracts: result.hasLiveContracts,
      warnings,
    };
  }

  suspend(
    subscriberId: string,
    command: LifecycleSuspendCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<LifecycleCommandResponse> {
    return this.applyAction(subscriberId, 'SUSPEND', command, actorId, idempotencyKey);
  }

  reactivate(
    subscriberId: string,
    command: LifecycleReactivateCommand,
    actorId: string,
    idempotencyKey?: string,
    beforeTransition?: BeforeContractTransition,
  ): Promise<LifecycleCommandResponse> {
    return this.applyAction(
      subscriberId,
      'REACTIVATE',
      command,
      actorId,
      idempotencyKey,
      beforeTransition,
    );
  }

  terminate(
    subscriberId: string,
    command: LifecycleTerminateCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<LifecycleCommandResponse> {
    return this.applyAction(subscriberId, 'TERMINATE', command, actorId, idempotencyKey);
  }

  async cancelSubscriber(
    subscriberId: string,
    command: SubscriberCancellationCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<{ id: string; status: SubscriberStatus; fromStatus: SubscriberStatus }> {
    this.assertNoteLength(command.note);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const batchId = this.resolveBatchId(tenantId, idempotencyKey);
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (idempotencyKey) await this.lockIdempotencyKey(qr, tenantId, idempotencyKey);
      const subscriber = await this.lockSubscriber(qr, subscriberId, tenantId);
      if (idempotencyKey) {
        const existing = await this.findExistingBatch(qr, tenantId, subscriberId, batchId);
        if (existing.length > 0) {
          this.assertCancellationRetry(existing, command);
          const row = existing.find(({ entity_type }) => entity_type === 'SUBSCRIBER');
          if (row) {
            return {
              id: subscriberId,
              status: row.to_status as SubscriberStatus,
              fromStatus: row.from_status as SubscriberStatus,
            };
          }
        }
      }
      if (subscriber.status === SubscriberStatus.CANCELLED) {
        return { id: subscriberId, status: subscriber.status, fromStatus: subscriber.status };
      }

      const contracts = await this.lockContracts(qr, subscriberId, tenantId);
      const liveContracts = contracts.filter(({ status }) => this.isLiveStatus(status));
      if (liveContracts.length > 0) {
        throw new ConflictException({
          code: 'SUBSCRIBER_HAS_LIVE_CONTRACTS',
          message:
            'No puedes cancelar al suscriptor mientras tenga servicios vigentes. Termínalos primero.',
          contractIds: liveContracts.map(({ id }) => id),
        });
      }

      const drafts = contracts.filter(({ status }) => status === ContractStatus.DRAFT);
      for (const draft of drafts) {
        await qr.query(
          `UPDATE contracts
              SET deleted_at = now(), updated_at = now()
            WHERE id = $1 AND subscriber_id = $2 AND tenant_id = $3
              AND status::text = 'DRAFT' AND deleted_at IS NULL`,
          [draft.id, subscriberId, tenantId],
        );
        await this.auditService.logWithin(
          {
            action: AuditAction.DELETE,
            entityType: 'Contract',
            entityId: draft.id,
            userId: actorId,
            oldValue: { status: ContractStatus.DRAFT },
            newValue: { deleted: true },
          },
          qr.manager,
        );
      }

      await qr.query(
        `UPDATE subscribers SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
        [SubscriberStatus.CANCELLED, subscriberId, tenantId],
      );
      await this.insertHistory(qr, {
        tenantId,
        entityType: 'SUBSCRIBER',
        entityId: subscriberId,
        subscriberId,
        fromStatus: subscriber.status,
        toStatus: SubscriberStatus.CANCELLED,
        reasonCode: command.reasonCode,
        note: command.note ?? null,
        source: 'MANUAL',
        batchId,
        actorId,
      });
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'Subscriber',
          entityId: subscriberId,
          userId: actorId,
          oldValue: { status: subscriber.status },
          newValue: { status: SubscriberStatus.CANCELLED, reasonCode: command.reasonCode },
        },
        qr.manager,
      );
      return {
        id: subscriberId,
        status: SubscriberStatus.CANCELLED,
        fromStatus: subscriber.status,
      };
    });

    if (result.fromStatus !== result.status) {
      this.logger.log(
        JSON.stringify({
          event: 'crm.subscriber.lifecycle.changed',
          subscriberId,
          fromStatus: result.fromStatus,
          toStatus: result.status,
          reasonCode: command.reasonCode,
        }),
      );
    }
    return result;
  }

  async transitionContract(
    contractId: string,
    action: LifecycleAction,
    command: LifecycleCommand,
    actorId: string,
    idempotencyKey?: string,
    beforeTransition?: BeforeContractTransition,
  ): Promise<LifecycleCommandResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const batchId = this.resolveBatchId(tenantId, idempotencyKey);
    let affectedSubscriberId = '';
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (idempotencyKey) await this.lockIdempotencyKey(qr, tenantId, idempotencyKey);
      const rows = (await qr.query(
        `SELECT subscriber_id FROM contracts
          WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [contractId, tenantId],
      )) as Array<{ subscriber_id: string }>;
      const subscriberId = rows[0]?.subscriber_id;
      if (!subscriberId) throw new NotFoundException('Servicio no encontrado.');
      affectedSubscriberId = subscriberId;

      const subscriber = await this.lockSubscriber(qr, subscriberId, tenantId);
      const history = idempotencyKey
        ? await this.findExistingBatch(qr, tenantId, subscriberId, batchId)
        : [];
      if (history.length > 0) {
        this.assertIdempotentRetry(history, action, command, [contractId]);
        const contracts = await this.lockContracts(qr, subscriberId, tenantId);
        return this.resultFromHistory(subscriber, history, action, contracts);
      }

      const contracts = await this.lockContracts(qr, subscriberId, tenantId);
      const contract = contracts.find(({ id }) => id === contractId);
      const transition = ACTION_TRANSITIONS[action];
      if (!contract || !transition.from.includes(contract.status)) {
        throw new ConflictException({
          code: 'LIFECYCLE_CONTRACT_STATE_CHANGED',
          message: 'El estado del servicio cambió. Actualiza la ficha e inténtalo de nuevo.',
        });
      }
      if (action === 'REACTIVATE' && subscriber.status === SubscriberStatus.CANCELLED) {
        throw this.cancelledSubscriberConflict();
      }
      if (action === 'TERMINATE' && (command.reasonCode as string) === 'DESCARTE_EXPEDIENTE') {
        throw throwSystemOnlyReason();
      }

      const fromStatus = contract.status;
      await beforeTransition?.(qr, [contractId]);
      await this.applyContractStatus(
        qr,
        tenantId,
        subscriberId,
        contract,
        transition.to,
        command,
        batchId,
        actorId,
      );
      const subscriberStatus = await this.deriveAndPersistSubscriberStatus(
        qr,
        tenantId,
        subscriber,
        contracts,
        command,
        batchId,
        actorId,
      );
      return {
        action,
        batchId,
        affectedContracts: [{ id: contract.id, fromStatus, toStatus: transition.to }],
        subscriberStatus,
        hasLiveContracts: contracts.some(({ status }) => this.isLiveStatus(status)),
      };
    });

    this.logResult(affectedSubscriberId, result, command.reasonCode);
    return result;
  }

  async listHistory(
    subscriberId: string,
    options: { page?: number; limit?: number; canReadNote: boolean },
  ): Promise<LifecycleHistoryResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { page, limit } = clampPage(options.page ?? 1, clampLimit(options.limit));
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const countRows = (await qr.query(
        `SELECT COUNT(*)::int AS total
           FROM crm_lifecycle_changes
          WHERE tenant_id = $1 AND subscriber_id = $2`,
        [tenantId, subscriberId],
      )) as Array<{ total: number }>;
      const rows = (await qr.query(
        `SELECT id, entity_type, entity_id, subscriber_id, from_status, to_status, reason_code,
                ${options.canReadNote ? 'note_encrypted' : 'NULL::text AS note_encrypted'},
                source, batch_id, actor_id, changed_at
           FROM crm_lifecycle_changes
          WHERE tenant_id = $1 AND subscriber_id = $2
          ORDER BY changed_at DESC, id DESC
          LIMIT $3 OFFSET $4`,
        [tenantId, subscriberId, limit, (page - 1) * limit],
      )) as HistoryRow[];
      const total = countRows[0]?.total ?? 0;
      return {
        data: rows.map((row) => this.projectHistoryRow(row, options.canReadNote)),
        meta: buildPageMeta({ total, page, limit, randomAccess: true }),
      };
    });
  }

  private async applyAction(
    subscriberId: string,
    action: LifecycleAction,
    command: LifecycleCommand,
    actorId: string,
    idempotencyKey?: string,
    beforeTransition?: BeforeContractTransition,
  ): Promise<LifecycleCommandResponse> {
    this.assertNoteLength(command.note);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const batchId = this.resolveBatchId(tenantId, idempotencyKey);
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (idempotencyKey) await this.lockIdempotencyKey(qr, tenantId, idempotencyKey);
      const subscriber = await this.lockSubscriber(qr, subscriberId, tenantId);
      const history = idempotencyKey
        ? await this.findExistingBatch(qr, tenantId, subscriberId, batchId)
        : [];
      if (history.length > 0) {
        this.assertIdempotentRetry(history, action, command, command.contractIds);
        const contracts = await this.lockContracts(qr, subscriberId, tenantId);
        return this.resultFromHistory(subscriber, history, action, contracts);
      }

      const contracts = await this.lockContracts(qr, subscriberId, tenantId);
      const transition = ACTION_TRANSITIONS[action];
      let selected: ContractRow[];
      if (command.contractIds) {
        const selectedIds = new Set(command.contractIds);
        selected = contracts.filter(({ id }) => selectedIds.has(id));
        if (
          selected.length !== selectedIds.size ||
          selected.some(({ status }) => !transition.from.includes(status))
        ) {
          throw new ConflictException({
            code: 'LIFECYCLE_CONTRACT_STATE_CHANGED',
            message:
              'El estado de uno o más servicios cambió. Actualiza la ficha e inténtalo de nuevo.',
          });
        }
      } else {
        selected = contracts.filter(({ status }) => transition.from.includes(status));
      }
      if (selected.length === 0) {
        throw new BadRequestException({
          code: 'LIFECYCLE_NO_CHANGES',
          message: 'No hay servicios elegibles para este cambio.',
        });
      }
      if (action === 'REACTIVATE' && subscriber.status === SubscriberStatus.CANCELLED) {
        throw this.cancelledSubscriberConflict();
      }
      if (action === 'TERMINATE' && (command.reasonCode as string) === 'DESCARTE_EXPEDIENTE') {
        throw throwSystemOnlyReason();
      }

      const originalStatuses = new Map(selected.map(({ id, status }) => [id, status]));
      await beforeTransition?.(
        qr,
        selected.map(({ id }) => id),
      );
      for (const contract of selected) {
        await this.applyContractStatus(
          qr,
          tenantId,
          subscriberId,
          contract,
          transition.to,
          command,
          batchId,
          actorId,
        );
      }
      const subscriberStatus = await this.deriveAndPersistSubscriberStatus(
        qr,
        tenantId,
        subscriber,
        contracts,
        command,
        batchId,
        actorId,
      );
      return {
        action,
        batchId,
        affectedContracts: selected.map(({ id }) => ({
          id,
          fromStatus: originalStatuses.get(id) as ContractStatus,
          toStatus: transition.to,
        })),
        subscriberStatus,
        hasLiveContracts: contracts.some(({ status }) => this.isLiveStatus(status)),
      };
    });

    this.logResult(subscriberId, result, command.reasonCode);
    return result;
  }

  private async lockSubscriber(
    qr: QueryRunner,
    subscriberId: string,
    tenantId: string,
  ): Promise<SubscriberRow> {
    const rows = (await qr.query(
      `SELECT id, status::text AS status, activated_at
         FROM subscribers
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [subscriberId, tenantId],
    )) as SubscriberRow[];
    const subscriber = rows[0];
    if (!subscriber) throw new NotFoundException('Suscriptor no encontrado.');
    return subscriber;
  }

  private async lockContracts(
    qr: QueryRunner,
    subscriberId: string,
    tenantId: string,
  ): Promise<ContractRow[]> {
    return (await qr.query(
      `SELECT id, status::text AS status
         FROM contracts
        WHERE subscriber_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY id
        FOR UPDATE`,
      [subscriberId, tenantId],
    )) as ContractRow[];
  }

  private async applyContractStatus(
    qr: QueryRunner,
    tenantId: string,
    subscriberId: string,
    contract: ContractRow,
    toStatus: ContractStatus,
    command: LifecycleCommand,
    batchId: string,
    actorId: string,
  ): Promise<void> {
    const fromStatus = contract.status;
    await qr.query(
      `UPDATE contracts
          SET status = $1, status_reason_code = $2, status_changed_at = now(), updated_at = now()
        WHERE id = $3 AND subscriber_id = $4 AND tenant_id = $5 AND deleted_at IS NULL`,
      [toStatus, command.reasonCode, contract.id, subscriberId, tenantId],
    );
    await this.insertHistory(qr, {
      tenantId,
      entityType: 'CONTRACT',
      entityId: contract.id,
      subscriberId,
      fromStatus,
      toStatus,
      reasonCode: command.reasonCode,
      note: command.note ?? null,
      contractScopeExplicit: command.contractIds !== undefined,
      source: 'MANUAL',
      batchId,
      actorId,
    });
    await this.auditService.logWithin(
      {
        action: AuditAction.UPDATE,
        entityType: 'Contract',
        entityId: contract.id,
        userId: actorId,
        oldValue: { status: fromStatus },
        newValue: { status: toStatus, reasonCode: command.reasonCode },
      },
      qr.manager,
    );
    contract.status = toStatus;
  }

  private async deriveAndPersistSubscriberStatus(
    qr: QueryRunner,
    tenantId: string,
    subscriber: SubscriberRow,
    contracts: readonly ContractRow[],
    command: LifecycleCommand,
    batchId: string,
    actorId: string,
  ): Promise<{ from: SubscriberStatus; to: SubscriberStatus }> {
    const fromStatus = subscriber.status;
    const toStatus = deriveSubscriberStatusFromContracts(
      fromStatus,
      subscriber.activated_at,
      contracts.map(({ status }) => status),
    );
    if (toStatus !== fromStatus) {
      await qr.query(
        `UPDATE subscribers SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
        [toStatus, subscriber.id, tenantId],
      );
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'Subscriber',
          entityId: subscriber.id,
          userId: actorId,
          oldValue: { status: fromStatus },
          newValue: { status: toStatus, reasonCode: command.reasonCode },
        },
        qr.manager,
      );
      subscriber.status = toStatus;
    }
    // Cada lote registra su fila del suscriptor, incluso cuando RF-LC-03 conserva el estado.
    await this.insertHistory(qr, {
      tenantId,
      entityType: 'SUBSCRIBER',
      entityId: subscriber.id,
      subscriberId: subscriber.id,
      fromStatus,
      toStatus,
      reasonCode: command.reasonCode,
      note: command.note ?? null,
      contractScopeExplicit: command.contractIds !== undefined,
      source: 'MANUAL',
      batchId,
      actorId,
    });
    return { from: fromStatus, to: toStatus };
  }

  private async insertHistory(
    qr: QueryRunner,
    row: {
      tenantId: string;
      entityType: 'SUBSCRIBER' | 'CONTRACT';
      entityId: string;
      subscriberId: string;
      fromStatus: string;
      toStatus: string;
      reasonCode: string;
      note: string | null;
      contractScopeExplicit?: boolean;
      source: 'MANUAL' | 'SYSTEM' | 'BILLING';
      batchId: string;
      actorId: string | null;
    },
  ): Promise<void> {
    await qr.query(
      `INSERT INTO crm_lifecycle_changes
        (tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
         reason_code, note_encrypted, contract_scope_explicit, source, batch_id, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        row.tenantId,
        row.entityType,
        row.entityId,
        row.subscriberId,
        row.fromStatus,
        row.toStatus,
        row.reasonCode,
        this.encryptNote(row.note),
        row.contractScopeExplicit ?? false,
        row.source,
        row.batchId,
        row.actorId,
      ],
    );
  }

  private async lockIdempotencyKey(qr: QueryRunner, tenantId: string, key: string): Promise<void> {
    const normalized = key.trim();
    if (!normalized || normalized.length > 200) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'La Idempotency-Key debe tener entre 1 y 200 caracteres.',
      });
    }
    await qr.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${tenantId}:${normalized}`]);
  }

  private resolveBatchId(tenantId: string, key?: string): string {
    if (!key) return randomUUID();
    const digest = createHash('sha256').update(`${tenantId}:${key.trim()}`).digest('hex');
    const chars = digest.slice(0, 32).split('');
    chars[12] = '5';
    chars[16] = ((parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
    const hex = chars.join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private async findExistingBatch(
    qr: QueryRunner,
    tenantId: string,
    subscriberId: string,
    batchId: string,
  ): Promise<HistoryRow[]> {
    return (await qr.query(
      `SELECT id, entity_type, entity_id, subscriber_id, from_status, to_status,
              reason_code, note_encrypted, contract_scope_explicit,
              source, batch_id, actor_id, changed_at
         FROM crm_lifecycle_changes
        WHERE tenant_id = $1 AND subscriber_id = $2 AND batch_id = $3
        ORDER BY entity_type, entity_id`,
      [tenantId, subscriberId, batchId],
    )) as HistoryRow[];
  }

  private assertIdempotentRetry(
    history: HistoryRow[],
    action: LifecycleAction,
    command: LifecycleCommand,
    contractIds?: readonly string[],
  ): void {
    const transition = ACTION_TRANSITIONS[action];
    const contractRows = history.filter(({ entity_type }) => entity_type === 'CONTRACT');
    const subscriberRow = history.find(({ entity_type }) => entity_type === 'SUBSCRIBER');
    const requestScopeExplicit = contractIds !== undefined;
    const requestIds = contractIds ? [...contractIds].sort() : undefined;
    const previousIds = contractRows.map(({ entity_id }) => entity_id).sort();
    const matches =
      Boolean(subscriberRow) &&
      contractRows.length > 0 &&
      history.every((row) => row.contract_scope_explicit === requestScopeExplicit) &&
      contractRows.every(
        (row) =>
          row.reason_code === command.reasonCode &&
          this.decryptNote(row.note_encrypted) === (command.note ?? null) &&
          transition.from.includes(row.from_status as ContractStatus) &&
          row.to_status === transition.to,
      ) &&
      subscriberRow?.reason_code === command.reasonCode &&
      this.decryptNote(subscriberRow.note_encrypted) === (command.note ?? null) &&
      (!requestIds ||
        (requestIds.length === previousIds.length &&
          requestIds.every((id, index) => id === previousIds[index])));
    if (!matches) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'La Idempotency-Key ya se usó con otro contenido. Usa una clave nueva.',
      });
    }
  }

  private assertCancellationRetry(
    history: HistoryRow[],
    command: SubscriberCancellationCommand,
  ): void {
    const row = history.find(({ entity_type }) => entity_type === 'SUBSCRIBER');
    if (
      !row ||
      row.to_status !== SubscriberStatus.CANCELLED ||
      row.reason_code !== command.reasonCode ||
      this.decryptNote(row.note_encrypted) !== (command.note ?? null) ||
      row.contract_scope_explicit
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'La Idempotency-Key ya se usó con otro contenido. Usa una clave nueva.',
      });
    }
  }

  private resultFromHistory(
    subscriber: SubscriberRow,
    history: HistoryRow[],
    action: LifecycleAction,
    contracts: readonly ContractRow[],
  ): LifecycleCommandResponse {
    const contractRows = history.filter(({ entity_type }) => entity_type === 'CONTRACT');
    const subscriberRow = history.find(({ entity_type }) => entity_type === 'SUBSCRIBER');
    return {
      action,
      batchId: history[0]?.batch_id ?? randomUUID(),
      affectedContracts: contractRows.map((row) => ({
        id: row.entity_id,
        fromStatus: row.from_status as ContractStatus,
        toStatus: row.to_status as ContractStatus,
      })),
      subscriberStatus: {
        from: (subscriberRow?.from_status ?? subscriber.status) as SubscriberStatus,
        to: (subscriberRow?.to_status ?? subscriber.status) as SubscriberStatus,
      },
      hasLiveContracts: contracts.some(({ status }) => this.isLiveStatus(status)),
    };
  }

  private projectHistoryRow(row: HistoryRow, canReadNote: boolean): LifecycleChangeRecord {
    const record: LifecycleChangeRecord = {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reasonCode: row.reason_code,
      source: row.source,
      batchId: row.batch_id,
      actorId: row.actor_id,
      changedAt: row.changed_at instanceof Date ? row.changed_at.toISOString() : row.changed_at,
    };
    if (canReadNote) record.note = this.decryptNote(row.note_encrypted);
    return record;
  }

  private encryptNote(note: string | null): string | null {
    if (note === null) return null;
    this.assertNoteLength(note);
    const { activeKey } = loadPiiAesGcmKeyPair(this.configService);
    return encryptAes256Gcm(note, activeKey);
  }

  private assertNoteLength(note: string | null | undefined): void {
    if (note !== null && note !== undefined && note.length > 500) {
      throw new BadRequestException({
        code: 'LIFECYCLE_NOTE_TOO_LONG',
        message: 'La nota no puede superar 500 caracteres.',
      });
    }
  }

  private decryptNote(ciphertext: string | null): string | null {
    if (ciphertext === null) return null;
    const { activeKey, previousKey } = loadPiiAesGcmKeyPair(this.configService);
    return decryptAes256Gcm(ciphertext, activeKey, previousKey);
  }

  private logResult(
    subscriberId: string,
    result: LifecycleCommandResponse,
    reasonCode: string,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'crm.subscriber.lifecycle.changed',
        subscriberId,
        contractIds: result.affectedContracts.map(({ id }) => id),
        fromStatuses: result.affectedContracts.map(({ fromStatus }) => fromStatus),
        toStatuses: result.affectedContracts.map(({ toStatus }) => toStatus),
        subscriberFromStatus: result.subscriberStatus.from,
        subscriberToStatus: result.subscriberStatus.to,
        reasonCode,
      }),
    );
  }

  private isLiveStatus(status: ContractStatus): boolean {
    return status === ContractStatus.ACTIVE || status === ContractStatus.SUSPENDED;
  }

  private cancelledSubscriberConflict(): ConflictException {
    return new ConflictException({
      code: 'SUBSCRIBER_CANCELLED',
      message: 'No puedes crear ni activar servicios para un suscriptor cancelado.',
    });
  }
}

function throwSystemOnlyReason(): BadRequestException {
  return new BadRequestException({
    code: 'LIFECYCLE_SYSTEM_ONLY_REASON',
    message: 'El motivo seleccionado no está disponible para una acción manual.',
  });
}
