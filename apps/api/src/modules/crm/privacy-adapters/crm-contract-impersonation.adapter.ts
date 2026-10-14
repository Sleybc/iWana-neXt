import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditAction } from '@iwana/shared';
import {
  DataSource,
  EntitySubscriberInterface,
  QueryRunner,
  TransactionCommitEvent,
  TransactionRollbackEvent,
} from 'typeorm';
import { ContractStatus } from '../enums/contract-status.enum';
import { IContractImpersonationPort } from '../../privacy/ports/contract-impersonation.port';
import { AuditService } from '../../audit/audit.service';

type PendingSuspension = { partyId: string; contractId: string; requestId: string };

class ContractSuspensionCommitSubscriber implements EntitySubscriberInterface {
  constructor(
    private readonly pendingByRunner: WeakMap<QueryRunner, PendingSuspension[]>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async afterTransactionCommit(event: TransactionCommitEvent): Promise<void> {
    const pending = this.pendingByRunner.get(event.queryRunner) ?? [];
    this.pendingByRunner.delete(event.queryRunner);
    for (const suspension of pending) {
      await this.eventEmitter.emitAsync('crm.contract.suspended', {
        ...suspension,
        reason: 'SUPLANTACION',
      });
    }
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    this.pendingByRunner.delete(event.queryRunner);
  }
}

@Injectable()
export class CrmContractImpersonationAdapter implements IContractImpersonationPort {
  private readonly pendingByRunner = new WeakMap<QueryRunner, PendingSuspension[]>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {
    const subscriber = new ContractSuspensionCommitSubscriber(
      this.pendingByRunner,
      this.eventEmitter,
    );
    if (
      !this.dataSource.subscribers.some(
        (item) => item instanceof ContractSuspensionCommitSubscriber,
      )
    ) {
      this.dataSource.subscribers.push(subscriber);
    }
  }

  async suspendForImpersonation(
    input: { partyId: string; contractIds: string[]; requestId: string; actorId: string },
    ctx: { manager: import('typeorm').EntityManager },
  ): Promise<{ suspendedContractIds: string[] }> {
    const queryRunner = ctx.manager.queryRunner;
    if (!queryRunner?.isTransactionActive) {
      throw new Error('La suspensión por suplantación requiere una transacción activa.');
    }

    const selectedIds = [...new Set(input.contractIds)];
    if (selectedIds.length !== input.contractIds.length) {
      throw new UnprocessableEntityException({
        code: 'IMPERSONATION_CONTRACT_NOT_OWNED',
        message: 'Uno o más contratos no pertenecen al titular seleccionado.',
      });
    }

    const rows = (await ctx.manager.query(
      `SELECT c.id, c.status
         FROM contracts c
         JOIN subscribers s ON s.id = c.subscriber_id
        WHERE c.id = ANY($1::uuid[])
          AND s.party_id = $2
        FOR UPDATE OF c`,
      [selectedIds, input.partyId],
    )) as Array<{ id: string; status: ContractStatus }>;
    if (rows.length !== selectedIds.length) {
      throw new UnprocessableEntityException({
        code: 'IMPERSONATION_CONTRACT_NOT_OWNED',
        message: 'Uno o más contratos no pertenecen al titular seleccionado.',
      });
    }

    const suspendedContractIds: string[] = [];
    const pending = this.pendingByRunner.get(queryRunner) ?? [];
    for (const row of rows) {
      if (row.status === ContractStatus.SUSPENDED) {
        suspendedContractIds.push(row.id);
        continue;
      }
      if (row.status !== ContractStatus.ACTIVE) continue;

      const result = (await ctx.manager.query(
        `UPDATE contracts
            SET status = $2, updated_at = now()
          WHERE id = $1 AND status = $3
        RETURNING id`,
        [row.id, ContractStatus.SUSPENDED, ContractStatus.ACTIVE],
      )) as Array<{ id: string }>;
      if (!result[0]) continue;

      await this.auditService.logWithin(
        {
          userId: input.actorId,
          action: AuditAction.UPDATE,
          entityType: 'Contract',
          entityId: row.id,
          oldValue: { status: ContractStatus.ACTIVE },
          newValue: {
            status: ContractStatus.SUSPENDED,
            reason: 'SUPLANTACION',
            requestId: input.requestId,
          },
          ipAddress: null,
          userAgent: null,
          requestId: input.requestId,
        },
        ctx.manager,
      );
      suspendedContractIds.push(row.id);
      pending.push({ partyId: input.partyId, contractId: row.id, requestId: input.requestId });
    }
    this.pendingByRunner.set(queryRunner, pending);
    return { suspendedContractIds };
  }
}
