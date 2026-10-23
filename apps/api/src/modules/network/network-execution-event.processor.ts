import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, UnrecoverableError } from 'bullmq';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  AuditAction,
  NETWORK_EXECUTION_EVENTS_QUEUE,
  NetworkExecutionEventSchema,
  SignedNetworkExecutionEventSchema,
  TenantStatus,
  canonicalizeNetworkExecutionEvent,
  type NetworkExecutionEvent,
  type NetworkInboxErrorCode,
  type SignedNetworkExecutionEvent,
} from '@iwana/shared';
import {
  IpAssignment,
  isValidSchemaName,
  NetworkInboxEvent,
  runInTenantSchema,
  ServiceProvisioning,
  TenantContext,
} from '@iwana/db';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  EXECUTION_ORDER_READ_PORT,
  type ExecutionOrderReadPort,
} from '../tasks/ports/execution-order-read.port';
import { AuditService } from '../audit/audit.service';
import { ServiceProvisioningActivatedEvent } from './events/service-provisioning-activated.event';
import { NetworkActivationListenerError } from './events/network-activation-listener.error';
import { SanitizeFailedReason } from '../../common/sanitize-failed-reason.decorator';

interface TenantRow {
  id: string;
  slug: string;
  schema_name: string;
}

interface CandidateRecord {
  [key: string]: unknown;
}

class NetworkEventProcessingError extends Error {
  constructor(
    public readonly code: NetworkInboxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NetworkEventProcessingError';
  }
}

class NetworkSignatureVerificationError extends UnrecoverableError {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkSignatureVerificationError';
  }
}

interface UntrustedInboxIdentity {
  tenantId: string;
  eventId: string;
  eventType: NetworkExecutionEvent['eventType'];
  executionOrderId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function readUntrustedInboxIdentity(candidate: unknown): UntrustedInboxIdentity | null {
  if (!isRecord(candidate) || !isRecord(candidate['envelope'])) return null;
  const tenantId = candidate['tenantId'];
  const envelope = candidate['envelope'];
  const eventId = envelope['eventId'];
  const eventType = envelope['eventType'];
  const executionOrderId = envelope['executionOrderId'];
  if (
    typeof tenantId !== 'string' ||
    !UUID_PATTERN.test(tenantId) ||
    typeof eventId !== 'string' ||
    !UUID_PATTERN.test(eventId) ||
    typeof executionOrderId !== 'string' ||
    !UUID_PATTERN.test(executionOrderId) ||
    (eventType !== 'ExecutionOrderClosedV1' &&
      eventType !== 'ExecutionOrderCancelledV1' &&
      eventType !== 'ExecutionOrderAnnulledV1')
  ) {
    return null;
  }
  return { tenantId, eventId, eventType, executionOrderId };
}

function isRecord(value: unknown): value is CandidateRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSigningKey(value: unknown, required: boolean): Buffer | null {
  if (typeof value !== 'string' || !value.trim()) {
    if (!required) return null;
    throw new UnrecoverableError('INTERNAL_QUEUE_SIGNING_KEY ausente.');
  }
  const encoded = value.trim();
  const key = Buffer.from(encoded, 'base64');
  if (key.byteLength < 32 || key.toString('base64') !== encoded) {
    throw new UnrecoverableError('INTERNAL_QUEUE_SIGNING_KEY inválida.');
  }
  return key;
}

/** Comprueba el HMAC sobre el contenido opaco antes de ejecutar la validación Zod. */
export function verifySignedNetworkExecutionEvent(
  candidate: unknown,
  config: ConfigService,
): unknown {
  if (!isRecord(candidate) || !isRecord(candidate['envelope'])) {
    throw new NetworkSignatureVerificationError('Evento de red sin firma válida.');
  }
  const tenantId = candidate['tenantId'];
  const signature = candidate['signature'];
  if (typeof tenantId !== 'string' || typeof signature !== 'string') {
    throw new NetworkSignatureVerificationError('Evento de red sin firma válida.');
  }

  const signatureIsHex = /^[0-9a-f]{64}$/iu.test(signature);
  const provided = signatureIsHex ? Buffer.from(signature, 'hex') : Buffer.alloc(32);
  let canonical: string;
  try {
    canonical = canonicalizeNetworkExecutionEvent(
      tenantId,
      candidate['envelope'] as NetworkExecutionEvent,
    );
  } catch {
    throw new NetworkSignatureVerificationError('Firma del evento de red inválida.');
  }
  const keys = [
    readSigningKey(config.get<string>('INTERNAL_QUEUE_SIGNING_KEY'), true),
    readSigningKey(config.get<string>('INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS'), false),
  ].filter((key): key is Buffer => key !== null);

  let matched = false;
  for (const key of keys) {
    const expected = createHmac('sha256', key).update(canonical).digest();
    const equal = timingSafeEqual(expected, provided);
    matched = equal || matched;
  }
  if (!signatureIsHex || !matched) {
    throw new NetworkSignatureVerificationError('Firma del evento de red inválida.');
  }
  return candidate;
}

@Injectable()
@Processor(NETWORK_EXECUTION_EVENTS_QUEUE, { concurrency: 4 })
export class NetworkExecutionEventProcessor extends WorkerHost {
  private readonly logger = new Logger(NetworkExecutionEventProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(EXECUTION_ORDER_READ_PORT)
    private readonly executionOrderReadPort: ExecutionOrderReadPort,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    let tenant: TenantRow | null = null;
    let signed: SignedNetworkExecutionEvent | null = null;
    try {
      const verified = verifySignedNetworkExecutionEvent(job.data, this.config);
      signed = SignedNetworkExecutionEventSchema.parse(verified);
      const event = NetworkExecutionEventSchema.parse(signed.envelope);
      tenant = await this.resolveTenant(signed.tenantId);
      const tenantContext = {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        schemaName: tenant.schema_name,
      };

      await TenantContext.run(tenantContext, async () => {
        const order = await this.executionOrderReadPort.getExecutionSnapshot(
          event.executionOrderId,
        );
        if (!order) {
          throw new NetworkEventProcessingError('ORDER_NOT_FOUND', 'No se encontró la OT.');
        }

        const activationEvent = await runInTenantSchema(
          this.dataSource,
          tenantContext.schemaName,
          (qr) => this.applyEvent(qr.manager, tenantContext, event),
        );

        if (!activationEvent) return;
        try {
          await this.eventEmitter.emitAsync(
            'network.service-provisioning.activated',
            activationEvent,
          );
        } catch (error) {
          if (error instanceof NetworkActivationListenerError) throw error;
          throw new NetworkActivationListenerError('CRM_LISTENER_FAILED', { cause: error });
        }
        await runInTenantSchema(this.dataSource, tenantContext.schemaName, async (qr) => {
          await qr.manager.update(
            NetworkInboxEvent,
            { tenantId: tenantContext.tenantId, eventId: event.eventId },
            { processedAt: new Date(), lastErrorCode: null },
          );
        });
      });
    } catch (error) {
      const errorCode = this.errorCode(error);
      let untrustedIdentity: UntrustedInboxIdentity | null = null;
      if (error instanceof NetworkSignatureVerificationError) {
        untrustedIdentity = readUntrustedInboxIdentity(job.data);
        if (untrustedIdentity) {
          try {
            tenant = await this.resolveTenant(untrustedIdentity.tenantId);
            const context = {
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              schemaName: tenant.schema_name,
            };
            await TenantContext.run(context, () =>
              this.persistInvalidSignature(
                context.schemaName,
                untrustedIdentity as UntrustedInboxIdentity,
              ),
            );
          } catch {
            // Untrusted envelope fields never replace the original signature failure.
          }
        }
      }
      if (tenant && signed) {
        const context = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          schemaName: tenant.schema_name,
        };
        try {
          await TenantContext.run(context, () =>
            this.persistInboxError(
              context.schemaName,
              signed as SignedNetworkExecutionEvent,
              errorCode,
            ),
          );
        } catch {
          this.logger.error(
            '[network-execution-events] inbox_error_persist_failed event=omitted tenant=omitted',
          );
        }
      }
      this.logger.warn(
        '[network-execution-events] retry code=omitted event=omitted tenant=omitted',
      );
      throw error;
    }
  }

  private async resolveTenant(tenantId: string): Promise<TenantRow> {
    const rows = (await this.dataSource.query(
      `SELECT id, slug, schema_name
         FROM public.tenants
        WHERE id = $1
          AND deleted_at IS NULL
          AND status <> $2`,
      [tenantId, TenantStatus.MARKED_FOR_DELETION],
    )) as TenantRow[];
    const tenant = rows[0];
    if (!tenant || !isValidSchemaName(tenant.schema_name)) {
      throw new UnrecoverableError('Tenant inexistente o schema inválido.');
    }
    return tenant;
  }

  private async applyEvent(
    manager: EntityManager,
    context: { tenantId: string; tenantSlug: string; schemaName: string },
    event: NetworkExecutionEvent,
  ): Promise<ServiceProvisioningActivatedEvent | null> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `provisioning-order:${event.executionOrderId}`,
    ]);
    const insertedRows = (await manager.query(
      `INSERT INTO network_inbox_events
         (tenant_id, event_id, event_type, execution_order_id, processed_at, last_error_code)
       VALUES ($1, $2, $3, $4, NULL, NULL)
       ON CONFLICT (tenant_id, event_id) DO NOTHING`,
      [context.tenantId, event.eventId, event.eventType, event.executionOrderId],
    )) as Array<{ id: string }>;
    const inbox = await manager.findOne(NetworkInboxEvent, {
      where: { tenantId: context.tenantId, eventId: event.eventId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!inbox) throw new NetworkEventProcessingError('UNEXPECTED', 'No se pudo abrir el inbox.');
    if (inbox.eventType !== event.eventType || inbox.executionOrderId !== event.executionOrderId) {
      throw new NetworkEventProcessingError('UNEXPECTED', 'El evento no coincide con su inbox.');
    }
    if (inbox.processedAt) return null;
    const wasPendingRetry = insertedRows.length === 0;
    if (inbox.lastErrorCode !== null) {
      inbox.lastErrorCode = null;
      await manager.save(NetworkInboxEvent, inbox);
    }

    const provisioning = await manager.findOne(ServiceProvisioning, {
      where: {
        tenantId: context.tenantId,
        executionOrderId: event.executionOrderId,
        status: In(['RESERVED', 'CERTIFIED', 'ACTIVE']),
      },
      lock: { mode: 'pessimistic_write' },
      order: { createdAt: 'DESC' },
    });
    if (!provisioning) {
      inbox.processedAt = new Date();
      await manager.save(NetworkInboxEvent, inbox);
      return null;
    }

    if (provisioning.status === 'ACTIVE') {
      if (wasPendingRetry) return this.activationEvent(context, provisioning);
      inbox.processedAt = new Date();
      await manager.save(NetworkInboxEvent, inbox);
      return null;
    }

    const executed =
      event.eventType === 'ExecutionOrderClosedV1' &&
      (event.result === 'EXECUTED' || event.result === 'EXECUTED_WITH_OBSERVATIONS');
    if (executed && provisioning.status === 'CERTIFIED') {
      const fromStatus = provisioning.status;
      const assignment = await this.findLiveAssignment(manager, context.tenantId, provisioning);
      if (!assignment) {
        throw new NetworkEventProcessingError('IPAM_CONFLICT', 'No se encontró la IP reservada.');
      }
      const now = new Date();
      assignment.status = 'ACTIVE';
      await manager.save(IpAssignment, assignment);
      provisioning.status = 'ACTIVE';
      provisioning.activatedAt = now;
      provisioning.commercialActivationStatus = 'PENDING';
      provisioning.commercialActivationDetail = null;
      provisioning.version += 1;
      const saved = await manager.save(ServiceProvisioning, provisioning);
      await this.auditService.logWithin(
        {
          tenantId: context.tenantId,
          schemaName: context.schemaName,
          userId: null,
          action: AuditAction.UPDATE,
          entityType: 'ServiceProvisioning',
          entityId: saved.id,
          newValue: {
            action: 'ACTIVATE',
            eventId: event.eventId,
            fromStatus,
            toStatus: 'ACTIVE',
            source: 'network-worker',
          },
        },
        manager,
      );
      return this.activationEvent(context, saved);
    }

    if (executed && provisioning.status === 'RESERVED') {
      const fromStatus = provisioning.status;
      provisioning.status = 'FAILED';
      provisioning.failureReason = 'CLOSED_WITHOUT_CERTIFICATION';
      provisioning.version += 1;
      const saved = await manager.save(ServiceProvisioning, provisioning);
      await this.auditService.logWithin(
        {
          tenantId: context.tenantId,
          schemaName: context.schemaName,
          userId: null,
          action: AuditAction.UPDATE,
          entityType: 'ServiceProvisioning',
          entityId: saved.id,
          newValue: {
            action: 'FAIL',
            eventId: event.eventId,
            fromStatus,
            toStatus: 'FAILED',
            source: 'network-worker',
          },
        },
        manager,
      );
      inbox.processedAt = new Date();
      await manager.save(NetworkInboxEvent, inbox);
      return null;
    }

    const releaseReason = this.releaseReason(event);
    if (
      releaseReason &&
      (provisioning.status === 'RESERVED' || provisioning.status === 'CERTIFIED')
    ) {
      const fromStatus = provisioning.status;
      const assignment = await this.findLiveAssignment(manager, context.tenantId, provisioning);
      if (assignment) {
        assignment.status = 'RELEASED';
        assignment.releasedAt = new Date();
        assignment.releaseReason = releaseReason;
        await manager.save(IpAssignment, assignment);
      }
      provisioning.status = 'RELEASED';
      provisioning.releasedAt = new Date();
      provisioning.releaseReason = releaseReason;
      provisioning.version += 1;
      const saved = await manager.save(ServiceProvisioning, provisioning);
      await this.auditService.logWithin(
        {
          tenantId: context.tenantId,
          schemaName: context.schemaName,
          userId: null,
          action: AuditAction.UPDATE,
          entityType: 'ServiceProvisioning',
          entityId: saved.id,
          newValue: {
            action: 'RELEASE',
            eventId: event.eventId,
            fromStatus,
            toStatus: 'RELEASED',
            source: 'network-worker',
          },
        },
        manager,
      );
      inbox.processedAt = new Date();
      await manager.save(NetworkInboxEvent, inbox);
      return null;
    }

    inbox.processedAt = new Date();
    await manager.save(NetworkInboxEvent, inbox);
    return null;
  }

  private async findLiveAssignment(
    manager: EntityManager,
    tenantId: string,
    provisioning: ServiceProvisioning,
  ): Promise<IpAssignment | null> {
    return manager.findOne(IpAssignment, {
      where: {
        tenantId,
        serviceProvisioningId: provisioning.id,
        status: In(['RESERVED', 'ACTIVE']),
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private activationEvent(
    context: { tenantId: string; schemaName: string },
    provisioning: ServiceProvisioning,
  ): ServiceProvisioningActivatedEvent {
    return new ServiceProvisioningActivatedEvent(
      context.tenantId,
      context.schemaName,
      provisioning.id,
      provisioning.subscriberId,
      provisioning.expedienteId,
      provisioning.contractId,
      provisioning.executionOrderId,
      provisioning.cpeSerialNumber,
    );
  }

  private releaseReason(
    event: NetworkExecutionEvent,
  ): 'NOT_EXECUTED' | 'CANCELLED' | 'ANNULLED' | null {
    if (event.eventType === 'ExecutionOrderAnnulledV1') return 'ANNULLED';
    if (event.eventType === 'ExecutionOrderCancelledV1') return 'CANCELLED';
    if (event.eventType !== 'ExecutionOrderClosedV1') return null;
    if (event.result === 'NOT_EXECUTED') return 'NOT_EXECUTED';
    if (event.result === 'CANCELLED') return 'CANCELLED';
    return null;
  }

  private async persistInboxError(
    schemaName: string,
    signed: SignedNetworkExecutionEvent,
    errorCode: NetworkInboxErrorCode,
  ): Promise<void> {
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO network_inbox_events
           (tenant_id, event_id, event_type, execution_order_id, processed_at, last_error_code)
         VALUES ($1, $2, $3, $4, NULL, $5)
         ON CONFLICT (tenant_id, event_id)
         DO UPDATE SET processed_at = NULL, last_error_code = EXCLUDED.last_error_code`,
        [
          signed.tenantId,
          signed.envelope.eventId,
          signed.envelope.eventType,
          signed.envelope.executionOrderId,
          errorCode,
        ],
      );
    });
  }

  private async persistInvalidSignature(
    schemaName: string,
    identity: UntrustedInboxIdentity,
  ): Promise<void> {
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO network_inbox_events
           (tenant_id, event_id, event_type, execution_order_id, processed_at, last_error_code)
         VALUES ($1, $2, $3, $4, NULL, 'SIGNATURE_INVALID')
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [identity.tenantId, identity.eventId, identity.eventType, identity.executionOrderId],
      );
    });
  }

  private errorCode(error: unknown): NetworkInboxErrorCode {
    if (error instanceof NetworkActivationListenerError) return error.code;
    if (error instanceof NetworkEventProcessingError) return error.code;
    if (error instanceof NetworkSignatureVerificationError) {
      return 'SIGNATURE_INVALID';
    }
    return 'UNEXPECTED';
  }
}
