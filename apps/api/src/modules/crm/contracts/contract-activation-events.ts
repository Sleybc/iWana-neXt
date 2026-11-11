import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CRM_CONTRACT_EVENTS_QUEUE,
  ContractActivatedEnvelopeSchema,
  type ContractActivatedEnvelope,
  type ContractActivationSource,
} from '@iwana/shared';

export interface AppendContractActivatedInput {
  tenantId: string;
  contractId: string;
  subscriberId: string;
  activatedAt: Date;
  billingStartDate: string;
  source: ContractActivationSource;
}

/**
 * Escribe `crm.contract.activated` en el outbox dentro de la transacción de la activación
 * (ADR-109 D2). Un evento por contrato: si ya existe, no se duplica (CA-2) y devuelve null.
 */
export async function appendContractActivatedEvent(
  manager: Pick<EntityManager, 'query'>,
  input: AppendContractActivatedInput,
): Promise<ContractActivatedEnvelope | null> {
  const eventId = randomUUID();
  const occurredAt = input.activatedAt.toISOString();
  // Los ids son uuid de columnas uuid; el publicador valida el envelope antes de encolarlo.
  const envelope: ContractActivatedEnvelope = {
    eventId,
    eventType: CONTRACT_ACTIVATED_EVENT_TYPE,
    tenantId: input.tenantId,
    aggregateId: input.contractId,
    occurredAt,
    payload: {
      tenantId: input.tenantId,
      contractId: input.contractId,
      subscriberId: input.subscriberId,
      activatedAt: occurredAt,
      billingStartDate: input.billingStartDate,
      source: input.source,
    },
  };
  const rows = (await manager.query(
    `INSERT INTO contract_activation_events
       (id, tenant_id, contract_id, source, envelope, occurred_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (tenant_id, contract_id) DO NOTHING
     RETURNING id`,
    [eventId, input.tenantId, input.contractId, input.source, JSON.stringify(envelope), occurredAt],
  )) as Array<{ id: string }> | undefined;
  return Array.isArray(rows) && rows[0] ? envelope : null;
}

interface PendingEventRow {
  id: string;
  envelope: unknown;
}

/**
 * Publica el outbox de activación en `crm-contract-events` después del commit.
 * jobId = eventId (sin ':'): publicar dos veces no duplica el trabajo. Un fallo deja la fila
 * pendiente (published_at NULL) para el siguiente intento (repetir la firma o `publishPending`).
 */
@Injectable()
export class ContractActivationEventsPublisher {
  private readonly logger = new Logger(ContractActivationEventsPublisher.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(CRM_CONTRACT_EVENTS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Publica el evento pendiente del contrato, si lo hay. Nunca lanza. */
  async publishForContract(contractId: string): Promise<boolean> {
    return this.publishWhere('contract_id = $2', [contractId]);
  }

  /** Publica todos los pendientes del tenant actual (reintento operativo). */
  async publishPending(limit = 100): Promise<boolean> {
    return this.publishWhere('true LIMIT $2', [limit]);
  }

  private async publishWhere(condition: string, params: unknown[]): Promise<boolean> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    let published = false;
    try {
      const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
        qr.query(
          `SELECT id, envelope FROM contract_activation_events
            WHERE tenant_id = $1 AND published_at IS NULL AND ${condition}`,
          [tenantId, ...params],
        ),
      )) as PendingEventRow[];
      for (const row of rows) {
        published = (await this.publishRow(schemaName, tenantId, row)) || published;
      }
    } catch (error) {
      this.logger.warn(`crm.contract.activated.publish_scan_failed ${summarizeErrorForLog(error)}`);
    }
    return published;
  }

  private async publishRow(
    schemaName: string,
    tenantId: string,
    row: PendingEventRow,
  ): Promise<boolean> {
    try {
      const envelope = ContractActivatedEnvelopeSchema.parse(row.envelope);
      await this.queue.add(CONTRACT_ACTIVATED_EVENT_TYPE, envelope, {
        jobId: envelope.eventId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      });
      await runInTenantSchema(this.dataSource, schemaName, (qr) =>
        qr.query(
          `UPDATE contract_activation_events
              SET published_at = now(), publish_attempts = publish_attempts + 1, last_error = NULL
            WHERE id = $1 AND tenant_id = $2`,
          [row.id, tenantId],
        ),
      );
      return true;
    } catch (error) {
      const summary = summarizeErrorForLog(error).slice(0, 200);
      this.logger.warn(`crm.contract.activated.publish_failed eventId=${row.id} ${summary}`);
      await runInTenantSchema(this.dataSource, schemaName, (qr) =>
        qr.query(
          `UPDATE contract_activation_events
              SET publish_attempts = publish_attempts + 1, last_error = $3
            WHERE id = $1 AND tenant_id = $2`,
          [row.id, tenantId, summary],
        ),
      ).catch(() => undefined);
      return false;
    }
  }
}
