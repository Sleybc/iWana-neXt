import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction, TenantStatus } from '@iwana/shared';
import {
  IpAssignment,
  isValidSchemaName,
  runInTenantSchema,
  ServiceProvisioning,
  TenantContext,
} from '@iwana/db';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  EXECUTION_ORDER_READ_PORT,
  type ExecutionOrderReadPort,
  type ExecutionSnapshot,
} from '../tasks/ports/execution-order-read.port';
import { AuditService } from '../audit/audit.service';
import { ServiceProvisioningActivatedEvent } from './events/service-provisioning-activated.event';
import { SanitizeFailedReason } from '../../common/sanitize-failed-reason.decorator';

export const NETWORK_PROVISIONING_RECONCILE_QUEUE = 'network-provisioning-reconcile';
export const NETWORK_PROVISIONING_RECONCILE_JOB = 'reconcile-network-provisioning';
export const NETWORK_PROVISIONING_RECONCILE_INTERVAL_MS = 15 * 60 * 1000;

interface ActiveTenantRow {
  id: string;
  slug: string;
  schema_name: string;
}

interface ReconcileTenantPayload {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function makeNetworkProvisioningReconcileJobId(schemaName: string): string {
  return `${NETWORK_PROVISIONING_RECONCILE_QUEUE}:${schemaName}`;
}

function parseTenantPayload(value: unknown): ReconcileTenantPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnrecoverableError('El contexto del tenant de reconciliación no es válido.');
  }
  const payload = value as Partial<ReconcileTenantPayload>;
  if (
    typeof payload.tenantId !== 'string' ||
    !UUID_PATTERN.test(payload.tenantId) ||
    typeof payload.tenantSlug !== 'string' ||
    !SLUG_PATTERN.test(payload.tenantSlug) ||
    typeof payload.schemaName !== 'string' ||
    !isValidSchemaName(payload.schemaName)
  ) {
    throw new UnrecoverableError('El contexto del tenant de reconciliación no es válido.');
  }
  return {
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    schemaName: payload.schemaName,
  };
}

@Injectable()
@Processor(NETWORK_PROVISIONING_RECONCILE_QUEUE, { concurrency: 2 })
export class NetworkProvisioningReconcilerProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(NetworkProvisioningReconcilerProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(NETWORK_PROVISIONING_RECONCILE_QUEUE) private readonly queue: Queue,
    @Inject(EXECUTION_ORDER_READ_PORT)
    private readonly executionOrderReadPort: ExecutionOrderReadPort,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const tenants = (await this.dataSource.query(
      `SELECT id::text AS id, slug, schema_name
         FROM public.tenants
        WHERE status = $1 AND deleted_at IS NULL
        ORDER BY schema_name`,
      [TenantStatus.ACTIVE],
    )) as ActiveTenantRow[];
    for (const tenant of tenants) {
      if (
        !UUID_PATTERN.test(tenant.id) ||
        !SLUG_PATTERN.test(tenant.slug) ||
        !isValidSchemaName(tenant.schema_name)
      ) {
        this.logger.warn(
          '[network-provisioning-reconcile] Se omitió un tenant activo con contexto inválido.',
        );
        continue;
      }
      await this.queue.add(
        NETWORK_PROVISIONING_RECONCILE_JOB,
        { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schema_name },
        {
          jobId: makeNetworkProvisioningReconcileJobId(tenant.schema_name),
          repeat: { every: NETWORK_PROVISIONING_RECONCILE_INTERVAL_MS },
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== NETWORK_PROVISIONING_RECONCILE_JOB) {
      throw new UnrecoverableError('Job de reconciliación desconocido.');
    }
    const payload = parseTenantPayload(job.data);
    const tenant = await this.resolveActiveTenant(payload.tenantId);
    if (tenant.slug !== payload.tenantSlug || tenant.schema_name !== payload.schemaName) {
      throw new UnrecoverableError('El tenant del job no coincide con el tenant activo.');
    }

    await TenantContext.run(
      { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schema_name },
      async () => {
        const candidates = await runInTenantSchema(this.dataSource, tenant.schema_name, (qr) =>
          qr.manager.find(ServiceProvisioning, {
            where: { tenantId: tenant.id, status: In(['RESERVED', 'CERTIFIED']) },
            order: { createdAt: 'ASC' },
          }),
        );
        const snapshots = candidates.length
          ? await this.executionOrderReadPort.getExecutionSnapshots(
              candidates.map((service) => service.executionOrderId),
            )
          : [];
        const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));

        for (const candidate of candidates) {
          const snapshot = snapshotsById.get(candidate.executionOrderId);
          if (!snapshot || snapshot.status === 'IN_PROGRESS') continue;
          const activation = await runInTenantSchema(this.dataSource, tenant.schema_name, (qr) =>
            this.reconcileOne(qr.manager, tenant, candidate.id, snapshot),
          );
          if (activation) {
            await this.eventEmitter.emitAsync('network.service-provisioning.activated', activation);
          }
        }
      },
    );
  }

  private async resolveActiveTenant(tenantId: string): Promise<ActiveTenantRow> {
    const rows = (await this.dataSource.query(
      `SELECT id::text AS id, slug, schema_name
         FROM public.tenants
        WHERE id = $1 AND status = $2 AND deleted_at IS NULL`,
      [tenantId, TenantStatus.ACTIVE],
    )) as ActiveTenantRow[];
    const tenant = rows[0];
    if (!tenant || !isValidSchemaName(tenant.schema_name)) {
      throw new UnrecoverableError('Tenant activo inexistente o schema inválido.');
    }
    return tenant;
  }

  private async reconcileOne(
    manager: EntityManager,
    tenant: ActiveTenantRow,
    serviceId: string,
    snapshot: ExecutionSnapshot,
  ): Promise<ServiceProvisioningActivatedEvent | null> {
    if (!snapshot) return null;
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `provisioning-order:${snapshot.id}`,
    ]);
    const service = await manager.findOne(ServiceProvisioning, {
      where: { id: serviceId, tenantId: tenant.id, status: In(['RESERVED', 'CERTIFIED']) },
      lock: { mode: 'pessimistic_write' },
    });
    if (!service) return null;

    const executed =
      (snapshot.status === 'COMPLETED' || snapshot.status === 'COMPLETED_WITH_OBSERVATIONS') &&
      (snapshot.result === 'EXECUTED' || snapshot.result === 'EXECUTED_WITH_OBSERVATIONS') &&
      !snapshot.isAnnulled;
    if (executed && service.status === 'CERTIFIED') {
      const assignment = await this.findLiveAssignment(manager, tenant.id, service.id);
      if (!assignment) throw new Error('No se encontró la IP reservada para reconciliar.');
      const fromStatus = service.status;
      assignment.status = 'ACTIVE';
      await manager.save(IpAssignment, assignment);
      service.status = 'ACTIVE';
      service.activatedAt = new Date();
      service.commercialActivationStatus = 'PENDING';
      service.commercialActivationDetail = null;
      service.version += 1;
      const saved = await manager.save(ServiceProvisioning, service);
      await this.audit(manager, tenant, saved, 'ACTIVATE', fromStatus, 'ACTIVE');
      return new ServiceProvisioningActivatedEvent(
        tenant.id,
        tenant.schema_name,
        saved.id,
        saved.subscriberId,
        saved.expedienteId,
        saved.contractId,
        saved.executionOrderId,
        saved.cpeSerialNumber,
      );
    }

    if (executed && service.status === 'RESERVED') {
      const fromStatus = service.status;
      service.status = 'FAILED';
      service.failureReason = 'CLOSED_WITHOUT_CERTIFICATION';
      service.version += 1;
      const saved = await manager.save(ServiceProvisioning, service);
      await this.audit(manager, tenant, saved, 'FAIL', fromStatus, 'FAILED');
      return null;
    }

    const eventReleaseReason = snapshot.isAnnulled
      ? 'ANNULLED'
      : snapshot.status === 'CANCELLED' || snapshot.result === 'CANCELLED'
        ? 'CANCELLED'
        : snapshot.result === 'NOT_EXECUTED'
          ? 'NOT_EXECUTED'
          : null;
    if (!eventReleaseReason) return null;

    const fromStatus = service.status;
    const assignment = await this.findLiveAssignment(manager, tenant.id, service.id);
    if (assignment) {
      assignment.status = 'RELEASED';
      assignment.releasedAt = new Date();
      assignment.releaseReason = 'RECONCILED';
      await manager.save(IpAssignment, assignment);
    }
    service.status = 'RELEASED';
    service.releasedAt = new Date();
    service.releaseReason = 'RECONCILED';
    service.version += 1;
    const saved = await manager.save(ServiceProvisioning, service);
    await this.audit(manager, tenant, saved, 'RELEASE', fromStatus, 'RELEASED');
    return null;
  }

  private findLiveAssignment(
    manager: EntityManager,
    tenantId: string,
    serviceProvisioningId: string,
  ): Promise<IpAssignment | null> {
    return manager.findOne(IpAssignment, {
      where: {
        tenantId,
        serviceProvisioningId,
        status: In(['RESERVED', 'ACTIVE']),
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private audit(
    manager: EntityManager,
    tenant: ActiveTenantRow,
    service: ServiceProvisioning,
    action: 'ACTIVATE' | 'FAIL' | 'RELEASE',
    fromStatus: string,
    toStatus: string,
  ): Promise<void> {
    return this.auditService.logWithin(
      {
        tenantId: tenant.id,
        schemaName: tenant.schema_name,
        userId: null,
        action: AuditAction.UPDATE,
        entityType: 'ServiceProvisioning',
        entityId: service.id,
        newValue: {
          action,
          eventId: 'RECONCILED',
          fromStatus,
          toStatus,
          source: 'network-worker',
        },
      },
      manager,
    );
  }
}
