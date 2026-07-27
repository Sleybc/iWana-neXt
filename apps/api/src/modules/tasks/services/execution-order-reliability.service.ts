import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHmac } from 'node:crypto';
import { EntityManager } from 'typeorm';
import {
  ExecutionOrderAuditIntent,
  ExecutionOrderIdempotencyRecord,
  ExecutionOrderOutboxEvent,
} from '@iwana/db';
import type { OperationalEventTypeV1 } from '@iwana/shared';

export interface ExecutionOrderCommandContext {
  idempotencyKey?: string;
  ifMatch?: string;
  correlationId: string;
  requireIdempotency?: boolean;
}

export interface IdempotencyReceipt {
  intentId: string;
  replay: boolean;
  resourceRef: string | null;
  resultStatus: string;
  resourceVersion: number | null;
}

export interface OutboxEventInput {
  eventId?: string;
  tenantId: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: OperationalEventTypeV1;
  payload: object;
  correlationId: string;
}

/** Infraestructura durable y fail-closed de comandos MOD11. */
@Injectable()
export class ExecutionOrderReliabilityService {
  private readonly keyId = 'v1';

  constructor(private readonly config: ConfigService) {}

  beginIdempotent(
    manager: EntityManager,
    tenantId: string,
    operation: string,
    key: string | undefined,
    payload: object,
  ): Promise<IdempotencyReceipt | null> {
    if (!key) return Promise.resolve(null);
    if (key.length < 16 || key.length > 200) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_INVALID' });
    }
    const keyHmac = this.hmac(key);
    const payloadHmac = this.hmac(this.canonicalize(payload));
    return manager
      .findOne(ExecutionOrderIdempotencyRecord, { where: { tenantId, operation, keyHmac } })
      .then(async (existing) => {
        if (existing) {
          if (existing.payloadHmac !== payloadHmac) {
            throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
          }
          if (existing.tombstonedAt || existing.expiresAt.getTime() <= Date.now()) {
            throw new ConflictException({ code: 'IDEMPOTENCY_EXPIRED' });
          }
          return {
            intentId: existing.intentId,
            replay: true,
            resourceRef: existing.resourceRef,
            resultStatus: existing.resultStatus,
            resourceVersion: existing.resourceVersion,
          };
        }
        const record = manager.create(ExecutionOrderIdempotencyRecord, {
          tenantId,
          operation,
          keyId: this.keyId,
          keyHmac,
          payloadHmac,
          intentId: randomUUID(),
          resourceRef: null,
          resultCode: null,
          resultStatus: 'PENDING',
          resourceVersion: null,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          tombstonedAt: null,
        });
        let saved: ExecutionOrderIdempotencyRecord;
        try {
          saved = await manager.save(ExecutionOrderIdempotencyRecord, record);
        } catch (error) {
          // La unicidad tenant+operación+HMAC gana la carrera concurrente;
          // leer el ganador convierte el 23505 en replay determinista.
          if (!this.isUniqueViolation(error)) throw error;
          const winner = await manager.findOne(ExecutionOrderIdempotencyRecord, {
            where: { tenantId, operation, keyHmac },
          });
          if (!winner) throw error;
          if (winner.payloadHmac !== payloadHmac)
            throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
          return {
            intentId: winner.intentId,
            replay: true,
            resourceRef: winner.resourceRef,
            resultStatus: winner.resultStatus,
            resourceVersion: winner.resourceVersion,
          };
        }
        return {
          intentId: saved.intentId,
          replay: false,
          resourceRef: saved.resourceRef,
          resultStatus: saved.resultStatus,
          resourceVersion: saved.resourceVersion,
        };
      });
  }

  async completeIdempotency(
    manager: EntityManager,
    intentId: string,
    result: {
      resourceRef: string;
      resultCode: string;
      resultStatus: string;
      resourceVersion: number;
    },
  ): Promise<void> {
    const record = await manager.findOne(ExecutionOrderIdempotencyRecord, { where: { intentId } });
    if (!record) throw new Error('IDEMPOTENCY_RECORD_MISSING');
    record.resourceRef = result.resourceRef;
    record.resultCode = result.resultCode;
    record.resultStatus = result.resultStatus;
    record.resourceVersion = result.resourceVersion;
    // La retención de sagas empieza al alcanzar un estado terminal; nunca se
    // compacta un registro pendiente por haber superado su TTL inicial.
    if (['COMPLETED', 'FAILED', 'REJECTED'].includes(result.resultStatus)) {
      record.expiresAt = new Date(
        Math.max(record.expiresAt.getTime(), Date.now() + 90 * 24 * 60 * 60 * 1000),
      );
    }
    await manager.save(ExecutionOrderIdempotencyRecord, record);
  }

  async appendOutbox(manager: EntityManager, input: OutboxEventInput): Promise<void> {
    await manager.save(
      ExecutionOrderOutboxEvent,
      manager.create(ExecutionOrderOutboxEvent, {
        eventId: input.eventId ?? randomUUID(),
        tenantId: input.tenantId,
        aggregateId: input.aggregateId,
        aggregateVersion: input.aggregateVersion,
        eventType: input.eventType,
        payload: input.payload,
        correlationId: input.correlationId,
        attemptCount: 0,
        availableAt: new Date(),
        leaseUntil: null,
        publishedAt: null,
        lastError: null,
      }),
    );
  }

  /** Inserción deliberadamente obligatoria: cualquier error aborta la transacción llamadora. */
  async appendAuditIntent(
    manager: EntityManager,
    input: {
      tenantId: string;
      intentId: string;
      actorRef?: string;
      operation: string;
      resourceRef: string;
      resultCode: string;
      correlationId: string;
    },
  ): Promise<void> {
    await manager.save(
      ExecutionOrderAuditIntent,
      manager.create(ExecutionOrderAuditIntent, {
        tenantId: input.tenantId,
        intentId: input.intentId,
        actorRef: input.actorRef ?? null,
        operation: input.operation,
        resourceRef: input.resourceRef,
        resultCode: input.resultCode,
        correlationId: input.correlationId,
        deliveredAt: null,
        attemptCount: 0,
        nextAttemptAt: new Date(),
      }),
    );
  }

  private hmac(value: string): string {
    const secret = this.config.get<string>('EXECUTION_ORDER_IDEMPOTENCY_SECRET');
    if (!secret) throw new Error('EXECUTION_ORDER_IDEMPOTENCY_SECRET is not configured');
    return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
  }

  private canonicalize(value: object): string {
    return JSON.stringify(this.sortObject(value));
  }

  private sortObject(value: object): object {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, item]) => [key, this.sortValue(item)]));
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map((item) =>
        item && typeof item === 'object' ? this.sortObject(item as object) : item,
      );
    if (value && typeof value === 'object') return this.sortObject(value as object);
    return value;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
    );
  }
}
