import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuditAction,
  AccessPermissionKey,
  ControlParamsSchema,
  ExecutionOrderStatus,
  ExecutionOrderResult,
  WfmWorkType,
  type ActorRefDto,
  type ProvisioningInboxQueue,
  type ProvisioningInboxRowDto,
  type ProvisioningOrderContextDto,
  type ReleaseProvisioningBody,
  type ReserveProvisioningBody,
  type CertifyProvisioningBody,
  type RegularizeProvisioningBody,
  type ServiceProvisioningDto,
  type ServiceProvisioningStatus,
  type TechnicianProvisioningViewDto,
  type ListResponse,
} from '@iwana/shared';
import {
  ExecutionOrderEvidence,
  IpAssignment,
  Ipv4Network,
  NetworkPlanProfile,
  NetworkRouter,
  runInTenantSchema,
  ServiceProvisioning,
  TenantContext,
} from '@iwana/db';
import { DataSource, EntityManager, In } from 'typeorm';
import { buildPageMeta } from '../../common/pagination';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { InstalledEquipmentReadPort } from '../inventory/ports/installed-equipment-read.port';
import { SubscriberServiceContextReadPort } from '../crm/ports/subscriber-service-context-read.port';
import { IpamService } from './ipam.service';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import {
  ROUTER_PROVISIONING_PORT,
  type RouterProvisioningPort,
} from './ports/router-provisioning.port';
import {
  EXECUTION_ORDER_READ_PORT,
  type ExecutionOrderReadPort,
} from '../tasks/ports/execution-order-read.port';
import { ServiceProvisioningActivatedEvent } from './events/service-provisioning-activated.event';

@Injectable()
export class ServiceProvisioningService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly ipamService: IpamService,
    @Inject(EXECUTION_ORDER_READ_PORT)
    private readonly executionOrderReadPort: ExecutionOrderReadPort,
    private readonly subscriberContextPort: SubscriberServiceContextReadPort,
    private readonly installedEquipmentReadPort: InstalledEquipmentReadPort,
    private readonly actorReadPort: NetworkActorReadPort,
    private readonly effectivePermissionsService: EffectivePermissionsService,
    @Inject(ROUTER_PROVISIONING_PORT)
    private readonly routerProvisioningPort: RouterProvisioningPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async reserve(
    input: ReserveProvisioningBody,
    actor: JwtPayload,
  ): Promise<ServiceProvisioningDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const order = await this.requireEligibleOpenInstallation(input.executionOrderId);
    if (!order.assignedTechnicianId) {
      throw new UnprocessableEntityException({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' });
    }
    const subscriberId = order.subscriberId;
    if (!subscriberId) throw this.orderNotEligible();
    const commercial = await this.subscriberContextPort.getForSubscriber(subscriberId);
    if (!commercial) throw this.orderNotEligible();
    const contract = input.contractId
      ? commercial.contracts.find((item) => item.id === input.contractId)
      : (commercial.contracts.find((item) => item.status === 'ACTIVE') ?? commercial.contracts[0]);
    if (input.contractId && !contract) {
      throw new UnprocessableEntityException({ code: 'CONTRACT_NOT_OF_SUBSCRIBER' });
    }
    const equipment = await this.installedEquipmentReadPort.getFirstInstalledAtCustomer(
      input.executionOrderId,
      subscriberId,
    );

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `provisioning-order:${input.executionOrderId}`,
      ]);
      const router = await manager.findOne(NetworkRouter, {
        where: { id: input.routerId, tenantId, status: 'ACTIVE' },
      });
      const network = await manager.findOne(Ipv4Network, {
        where: { id: input.ipv4NetworkId, tenantId, status: 'ACTIVE' },
      });
      if (!router || !network)
        throw this.orderNotEligible('No se encontró un router o una red activa.');
      if (network.routerId !== router.id) {
        throw new ConflictException({ code: 'NETWORK_NOT_IN_ROUTER' });
      }
      if (!router.supportedControlMethods.includes(input.controlParams.method)) {
        throw new ConflictException({ code: 'CONTROL_METHOD_NOT_SUPPORTED' });
      }

      const existing = await manager.findOne(ServiceProvisioning, {
        where: {
          tenantId,
          executionOrderId: input.executionOrderId,
          status: In(['RESERVED', 'CERTIFIED']),
        },
        lock: { mode: 'pessimistic_write' },
        order: { createdAt: 'DESC' },
      });
      if (existing) {
        const assignment = await manager.findOne(IpAssignment, {
          where: {
            tenantId,
            serviceProvisioningId: existing.id,
            status: In(['RESERVED', 'ACTIVE']),
          },
        });
        const requestedMatches = !input.requestedIp || assignment?.ip === input.requestedIp;
        const sameRequest =
          existing.routerId === router.id &&
          existing.ipv4NetworkId === network.id &&
          ControlParamsSchema.safeParse(existing.controlParams).success &&
          JSON.stringify(existing.controlParams) === JSON.stringify(input.controlParams) &&
          requestedMatches &&
          (input.contractId === undefined || existing.contractId === input.contractId);
        if (sameRequest && assignment) {
          return {
            row: existing,
            instruction: await this.routerProvisioningPort.apply({
              routerId: router.id,
              ip: assignment.ip,
              controlParams: input.controlParams,
              ...(equipment?.macAddress ? { macAddress: equipment.macAddress } : {}),
              ...(commercial.downloadMbps !== null
                ? { downloadMbps: commercial.downloadMbps }
                : {}),
              ...(commercial.uploadMbps !== null ? { uploadMbps: commercial.uploadMbps } : {}),
            }),
          };
        }
        await this.releaseExistingWithin(manager, tenantId, existing, 'REPLACED', actor.sub);
      }

      const row = manager.create(ServiceProvisioning, {
        tenantId,
        subscriberId,
        expedienteId: commercial.expedienteId,
        contractId: contract?.id ?? null,
        executionOrderId: order.id,
        executionOrderNumber: order.executionOrderNumber,
        routerId: router.id,
        ipv4NetworkId: network.id,
        ipAssignmentId: null,
        controlMethod: input.controlParams.method,
        controlParams: input.controlParams,
        planId: commercial.planId,
        downloadMbps: commercial.downloadMbps,
        uploadMbps: commercial.uploadMbps,
        cpeSerialNumber: equipment?.serialNumber ?? null,
        cpeMacAddress: equipment?.macAddress ?? null,
        status: 'RESERVED',
        origin: 'NORMAL',
        reservedBy: actor.sub,
        reservedAt: new Date(),
        commercialActivationStatus: 'NOT_APPLICABLE',
        commercialActivationDetail: null,
        version: 1,
      });
      const saved = await manager.save(ServiceProvisioning, row);
      const ip = await this.ipamService.reserveIp(manager, {
        networkId: network.id,
        provisioningId: saved.id,
        ...(input.requestedIp ? { requestedIp: input.requestedIp } : {}),
      });
      const assignment = await manager.findOne(IpAssignment, {
        where: { tenantId, serviceProvisioningId: saved.id, status: 'RESERVED' },
      });
      saved.ipAssignmentId = assignment?.id ?? null;
      const persisted = await manager.save(ServiceProvisioning, saved);
      const instruction = await this.routerProvisioningPort.apply({
        routerId: router.id,
        ip,
        controlParams: input.controlParams,
        ...(equipment?.macAddress ? { macAddress: equipment.macAddress } : {}),
        ...(commercial.downloadMbps !== null ? { downloadMbps: commercial.downloadMbps } : {}),
        ...(commercial.uploadMbps !== null ? { uploadMbps: commercial.uploadMbps } : {}),
      });
      if (!equipment && instruction.mode === 'MANUAL') {
        instruction.steps.push('No se encontró un equipo CPE instalado en esta orden.');
      }
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actor.sub,
          action: AuditAction.CREATE,
          entityType: 'ServiceProvisioning',
          entityId: persisted.id,
          newValue: {
            action: 'RESERVE',
            executionOrderId: order.id,
            routerId: router.id,
            ipv4NetworkId: network.id,
            ip,
            controlMethod: input.controlParams.method,
            ...(existing ? { replacedId: existing.id } : {}),
          },
        },
        manager,
      );
      return { row: persisted, instruction };
    });

    return this.toServiceDto(result.row, result.instruction);
  }

  async certify(
    id: string,
    input: CertifyProvisioningBody,
    actor: JwtPayload,
  ): Promise<ServiceProvisioningDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const row = await this.requireProvisioning(qr.manager, tenantId, id, true);
      this.assertVersion(row, input.version);
      if (row.status === 'CERTIFIED' && row.certificationEvidenceId === input.evidenceId) {
        return row;
      }
      if (row.status !== 'RESERVED')
        throw new ConflictException({ code: 'PROVISIONING_STATE_INVALID' });
      const order = await this.requireEligibleOpenInstallation(row.executionOrderId);
      if (!order.assignedTechnicianId) {
        throw new UnprocessableEntityException({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' });
      }
      if (order.assignedTechnicianId === actor.sub) {
        throw new ForbiddenException({ code: 'PROVISIONING_CERTIFIER_IS_EXECUTOR' });
      }
      const evidenceExists = await this.executionOrderReadPort.hasEvidence(
        row.executionOrderId,
        input.evidenceId,
        ['PHOTO', 'DOCUMENT'],
      );
      if (!evidenceExists) {
        throw new UnprocessableEntityException({ code: 'PROVISIONING_EVIDENCE_REQUIRED' });
      }
      const fromStatus = row.status;
      row.status = 'CERTIFIED';
      row.certifiedBy = actor.sub;
      row.certifiedAt = new Date();
      row.certificationEvidenceId = input.evidenceId;
      row.version += 1;
      const saved = await qr.manager.save(ServiceProvisioning, row);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actor.sub,
          action: AuditAction.UPDATE,
          entityType: 'ServiceProvisioning',
          entityId: saved.id,
          newValue: {
            action: 'CERTIFY',
            evidenceId: input.evidenceId,
            fromStatus,
            toStatus: saved.status,
          },
        },
        qr.manager,
      );
      return saved;
    });
    return this.toServiceDto(result, null);
  }

  async release(
    id: string,
    input: ReleaseProvisioningBody,
    actor: JwtPayload,
  ): Promise<ServiceProvisioningDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const row = await this.requireProvisioning(qr.manager, tenantId, id, true);
      this.assertVersion(row, input.version);
      if (row.status !== 'RESERVED' && row.status !== 'CERTIFIED') {
        throw new ConflictException({ code: 'PROVISIONING_STATE_INVALID' });
      }
      if (
        row.status === 'CERTIFIED' &&
        !(await this.actorHasPermission(actor, AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY))
      ) {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
      const order = await this.executionOrderReadPort.getExecutionSnapshot(row.executionOrderId);
      if (!order || order.status !== ExecutionOrderStatus.IN_PROGRESS) {
        throw this.orderNotEligible();
      }
      const fromStatus = row.status;
      const ipAssignment = await qr.manager.findOne(IpAssignment, {
        where: { tenantId, serviceProvisioningId: row.id, status: In(['RESERVED', 'ACTIVE']) },
        lock: { mode: 'pessimistic_write' },
      });
      const ip = ipAssignment?.ip ? (String(ipAssignment.ip).split('/')[0] ?? null) : null;
      if (ip) {
        await this.routerProvisioningPort.remove({
          routerId: row.routerId,
          ip,
          controlParams: ControlParamsSchema.parse(row.controlParams),
        });
      }
      if (ipAssignment) {
        ipAssignment.status = 'RELEASED';
        ipAssignment.releasedAt = new Date();
        ipAssignment.releaseReason = 'MANUAL';
        await qr.manager.save(IpAssignment, ipAssignment);
      }
      row.status = 'RELEASED';
      row.releasedAt = new Date();
      row.releasedBy = actor.sub;
      row.releaseReason = 'MANUAL';
      row.version += 1;
      const saved = await qr.manager.save(ServiceProvisioning, row);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actor.sub,
          action: AuditAction.UPDATE,
          entityType: 'ServiceProvisioning',
          entityId: saved.id,
          newValue: {
            action: 'RELEASE',
            reason: input.reason,
            releaseReason: 'MANUAL',
            fromStatus,
            ip,
          },
        },
        qr.manager,
      );
      return saved;
    });
    return this.toServiceDto(result, null);
  }

  async regularize(
    input: RegularizeProvisioningBody,
    actor: JwtPayload,
  ): Promise<ServiceProvisioningDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const order = await this.executionOrderReadPort.getExecutionSnapshot(input.executionOrderId);
    if (
      !order ||
      order.workType !== WfmWorkType.INSTALLATION ||
      order.isAnnulled ||
      (order.status !== ExecutionOrderStatus.COMPLETED &&
        order.status !== ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS) ||
      (order.result !== ExecutionOrderResult.EXECUTED &&
        order.result !== ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS) ||
      !order.subscriberId
    ) {
      throw this.orderNotEligible();
    }
    if (!order.assignedTechnicianId) {
      throw new UnprocessableEntityException({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' });
    }
    if (order.assignedTechnicianId === actor.sub) {
      throw new ForbiddenException({ code: 'PROVISIONING_CERTIFIER_IS_EXECUTOR' });
    }
    const subscriberId = order.subscriberId;

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `provisioning-order:${input.executionOrderId}`,
      ]);

      let existing = await manager.findOne(ServiceProvisioning, {
        where: {
          tenantId,
          executionOrderId: input.executionOrderId,
          status: In(['ACTIVE', 'FAILED', 'RESERVED', 'CERTIFIED']),
        },
        lock: { mode: 'pessimistic_write' },
        order: { createdAt: 'DESC' },
      });

      if (existing?.status === 'ACTIVE') {
        const assignment = await manager.findOne(IpAssignment, {
          where: { tenantId, serviceProvisioningId: existing.id, status: 'ACTIVE' },
        });
        const requestMatches =
          existing.origin === 'REGULARIZED' &&
          existing.regularizationReason === input.reason &&
          existing.routerId === input.routerId &&
          existing.ipv4NetworkId === input.ipv4NetworkId &&
          JSON.stringify(existing.controlParams) === JSON.stringify(input.controlParams) &&
          (!input.requestedIp || this.ipText(assignment?.ip) === input.requestedIp) &&
          (input.contractId === undefined || existing.contractId === input.contractId);
        if (requestMatches && assignment) return { row: existing, assignment, idempotent: true };
        throw new ConflictException({ code: 'PROVISIONING_ALREADY_ACTIVE' });
      }
      if (existing && existing.status !== 'FAILED') {
        throw new ConflictException({ code: 'PROVISIONING_STATE_INVALID' });
      }

      let reusableAssignment: IpAssignment | null = null;
      if (existing?.status === 'FAILED') {
        reusableAssignment = await manager.findOne(IpAssignment, {
          where: {
            tenantId,
            serviceProvisioningId: existing.id,
            status: In(['RESERVED', 'ACTIVE']),
          },
          lock: { mode: 'pessimistic_write' },
        });
      }
      const reuseFailedRow = Boolean(
        existing?.status === 'FAILED' &&
        reusableAssignment &&
        reusableAssignment.ipv4NetworkId === input.ipv4NetworkId &&
        (!input.requestedIp || this.ipText(reusableAssignment.ip) === input.requestedIp),
      );
      if (existing?.status === 'FAILED' && !reuseFailedRow) {
        await this.releaseExistingWithin(manager, tenantId, existing, 'REPLACED', actor.sub);
        existing = null;
        reusableAssignment = null;
      }

      const router = await manager.findOne(NetworkRouter, {
        where: { id: input.routerId, tenantId, status: 'ACTIVE' },
      });
      const network = await manager.findOne(Ipv4Network, {
        where: { id: input.ipv4NetworkId, tenantId, status: 'ACTIVE' },
      });
      if (!router || !network)
        throw this.orderNotEligible('No se encontró un router o una red activa.');
      if (network.routerId !== router.id)
        throw new ConflictException({ code: 'NETWORK_NOT_IN_ROUTER' });
      if (!router.supportedControlMethods.includes(input.controlParams.method)) {
        throw new ConflictException({ code: 'CONTROL_METHOD_NOT_SUPPORTED' });
      }

      const commercial = await this.subscriberContextPort.getForSubscriber(subscriberId);
      if (!commercial) throw this.orderNotEligible();
      const contract = input.contractId
        ? commercial.contracts.find((item) => item.id === input.contractId)
        : (commercial.contracts.find((item) => item.status === 'ACTIVE') ??
          commercial.contracts[0]);
      if (input.contractId && !contract) {
        throw new UnprocessableEntityException({ code: 'CONTRACT_NOT_OF_SUBSCRIBER' });
      }
      const equipment = await this.installedEquipmentReadPort.getFirstInstalledAtCustomer(
        input.executionOrderId,
        subscriberId,
      );
      const now = new Date();
      const row: ServiceProvisioning =
        existing ??
        manager.create(ServiceProvisioning, {
          tenantId,
          subscriberId,
          executionOrderId: order.id,
          executionOrderNumber: order.executionOrderNumber,
          status: 'ACTIVE',
          version: 1,
        });
      Object.assign(row, {
        tenantId,
        subscriberId,
        expedienteId: commercial.expedienteId,
        contractId: contract?.id ?? null,
        executionOrderId: order.id,
        executionOrderNumber: order.executionOrderNumber,
        routerId: router.id,
        ipv4NetworkId: network.id,
        controlMethod: input.controlParams.method,
        controlParams: input.controlParams,
        planId: commercial.planId,
        downloadMbps: commercial.downloadMbps,
        uploadMbps: commercial.uploadMbps,
        cpeSerialNumber: equipment?.serialNumber ?? null,
        cpeMacAddress: equipment?.macAddress ?? null,
        status: 'ACTIVE',
        origin: 'REGULARIZED',
        regularizationReason: input.reason,
        regularizedBy: actor.sub,
        regularizedAt: now,
        activatedAt: now,
        failureReason: null,
        releasedAt: null,
        releasedBy: null,
        releaseReason: null,
        commercialActivationStatus: 'PENDING',
        commercialActivationDetail: null,
        version: existing ? existing.version + 1 : 1,
      });
      const savedBeforeAssignment = await manager.save(ServiceProvisioning, row);

      let assignment = reusableAssignment;
      if (assignment) {
        assignment.status = 'ACTIVE';
        assignment.releasedAt = null;
        assignment.releaseReason = null;
        assignment = await manager.save(IpAssignment, assignment);
      } else {
        await this.ipamService.reserveIp(manager, {
          networkId: network.id,
          provisioningId: savedBeforeAssignment.id,
          ...(input.requestedIp ? { requestedIp: input.requestedIp } : {}),
        });
        assignment = await manager.findOne(IpAssignment, {
          where: { tenantId, serviceProvisioningId: savedBeforeAssignment.id, status: 'RESERVED' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!assignment) throw new ConflictException({ code: 'IPAM_CONFLICT' });
        assignment.status = 'ACTIVE';
        assignment = await manager.save(IpAssignment, assignment);
      }
      savedBeforeAssignment.ipAssignmentId = assignment.id;
      const saved = await manager.save(ServiceProvisioning, savedBeforeAssignment);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actor.sub,
          action: AuditAction.CREATE,
          entityType: 'ServiceProvisioning',
          entityId: saved.id,
          newValue: {
            action: 'REGULARIZE',
            executionOrderId: order.id,
            ip: this.ipText(assignment.ip),
            routerId: router.id,
            reason: input.reason,
          },
        },
        manager,
      );
      return { row: saved, assignment, idempotent: false };
    });

    const event = new ServiceProvisioningActivatedEvent(
      tenantId,
      schemaName,
      result.row.id,
      result.row.subscriberId,
      result.row.expedienteId,
      result.row.contractId,
      result.row.executionOrderId,
      result.row.cpeSerialNumber,
    );
    await this.eventEmitter.emitAsync('network.service-provisioning.activated', event);
    const instruction = await this.routerProvisioningPort.apply({
      routerId: result.row.routerId,
      ip: this.ipText(result.assignment.ip) ?? '',
      controlParams: ControlParamsSchema.parse(result.row.controlParams),
      ...(result.row.cpeMacAddress ? { macAddress: result.row.cpeMacAddress } : {}),
      ...(result.row.downloadMbps !== null ? { downloadMbps: result.row.downloadMbps } : {}),
      ...(result.row.uploadMbps !== null ? { uploadMbps: result.row.uploadMbps } : {}),
    });
    if (!result.row.cpeSerialNumber && instruction.mode === 'MANUAL') {
      instruction.steps.push('No se encontró un equipo CPE instalado en esta orden.');
    }
    return this.toServiceDto(result.row, instruction);
  }

  async getOrderContext(
    executionOrderId: string,
    actor: JwtPayload,
  ): Promise<ProvisioningOrderContextDto | TechnicianProvisioningViewDto> {
    const permissions = await this.getActorPermissions(actor);
    const hasProvisioningRead = permissions.includes(AccessPermissionKey.NETWORK_PROVISIONING_READ);
    const hasExecutionRead = permissions.includes(
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    );
    if (!hasProvisioningRead && !hasExecutionRead)
      throw new ForbiddenException({ code: 'FORBIDDEN' });

    const order = await this.executionOrderReadPort.getExecutionSnapshot(executionOrderId);
    if (!order) throw new NotFoundException('OT de ejecución no encontrada.');
    if (!hasProvisioningRead && order.assignedTechnicianId !== actor.sub) {
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    }
    const service = await this.findLatestForOrder(executionOrderId);
    const assignment = service ? await this.findAssignment(service.id) : null;
    if (!hasProvisioningRead) {
      // Proyección construida desde cero: no extenderla con datos del contexto completo.
      return {
        executionOrderId,
        status: (service?.status as ServiceProvisioningStatus | null) ?? null,
        ip: assignment?.status === 'RELEASED' ? null : this.ipText(assignment?.ip),
        certified: service?.status === 'CERTIFIED' || service?.status === 'ACTIVE',
        updatedAt: service?.updatedAt?.toISOString() ?? null,
      };
    }

    if (!order.subscriberId) throw this.orderNotEligible();
    const commercial = await this.subscriberContextPort.getForSubscriber(order.subscriberId);
    if (!commercial) throw this.orderNotEligible();
    const equipment = await this.installedEquipmentReadPort.getFirstInstalledAtCustomer(
      executionOrderId,
      order.subscriberId,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const [planProfile, evidences] = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const profile = commercial.planId
          ? await qr.manager.findOne(NetworkPlanProfile, {
              where: { tenantId, planId: commercial.planId },
            })
          : null;
        const evidenceRows = (await qr.manager
          .createQueryBuilder(ExecutionOrderEvidence, 'evidence')
          .select([
            'evidence.id',
            'evidence.evidenceType',
            'evidence.requirementKey',
            'evidence.createdAt',
          ])
          .where('evidence.execution_order_id = :executionOrderId', { executionOrderId })
          .andWhere('evidence.tenant_id = :tenantId', { tenantId })
          .andWhere('evidence.evidence_type IN (:...types)', { types: ['PHOTO', 'DOCUMENT'] })
          .orderBy('evidence.created_at', 'ASC')
          .getMany()) as ExecutionOrderEvidence[];
        return [profile, evidenceRows] as const;
      },
    );
    const actorIds = [
      order.assignedTechnicianId,
      service?.reservedBy,
      service?.certifiedBy,
      service?.releasedBy,
    ].filter((id): id is string => Boolean(id));
    const actors = await this.actorRefs(schemaName, actorIds);
    const assignedTechnician = order.assignedTechnicianId
      ? (actors.get(order.assignedTechnicianId) ?? { id: order.assignedTechnicianId, name: null })
      : null;
    const provisioning = service
      ? await this.toServiceDto(
          service,
          assignment && service.status !== 'RELEASED'
            ? await this.routerProvisioningPort.apply({
                routerId: service.routerId,
                ip: this.ipText(assignment.ip) ?? '',
                controlParams: ControlParamsSchema.parse(service.controlParams),
                ...(service.downloadMbps !== null ? { downloadMbps: service.downloadMbps } : {}),
                ...(service.uploadMbps !== null ? { uploadMbps: service.uploadMbps } : {}),
              })
            : null,
        )
      : null;

    return {
      executionOrder: {
        id: order.id,
        executionOrderNumber: order.executionOrderNumber,
        status: order.status,
        workType: order.workType,
        assignedTechnician,
        canCertify:
          permissions.includes(AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY) &&
          order.assignedTechnicianId !== null &&
          order.assignedTechnicianId !== actor.sub,
      },
      subscriber: { id: order.subscriberId, displayLabel: order.customerDisplayLabel },
      plan: commercial.planId
        ? {
            planId: commercial.planId,
            downloadMbps: commercial.downloadMbps,
            uploadMbps: commercial.uploadMbps,
            pcqAddressList: planProfile?.pcqAddressList ?? null,
          }
        : null,
      contracts: commercial.contracts.map(({ id, alias, status }) => ({ id, alias, status })),
      cpe: equipment
        ? {
            serialNumber: equipment.serialNumber,
            macAddress: equipment.macAddress,
            model: equipment.model,
          }
        : null,
      evidences: evidences.map((evidence) => ({
        id: evidence.id,
        evidenceType: evidence.evidenceType as 'PHOTO' | 'DOCUMENT',
        requirementKey: evidence.requirementKey,
        createdAt: evidence.createdAt.toISOString(),
      })),
      provisioning,
      suggestedQueueName: order.executionOrderNumber.replace(/[^A-Za-z0-9._-]/g, '_'),
    };
  }

  async listSubscriberProvisionings(subscriberId: string): Promise<ServiceProvisioningDto[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(ServiceProvisioning, {
        where: { tenantId, subscriberId },
        order: { createdAt: 'DESC' },
      }),
    );
    return Promise.all(rows.map((row) => this.toServiceDto(row, null)));
  }

  async listInbox(input: {
    queue: ProvisioningInboxQueue;
    page: number;
    limit: number;
  }): Promise<ListResponse<ProvisioningInboxRowDto>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const page = Math.max(1, Math.trunc(input.page));
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit)));
    const offset = (page - 1) * limit;
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (input.queue === 'FAILED') {
        const [rows, total] = await qr.manager.findAndCount(ServiceProvisioning, {
          where: { tenantId, status: 'FAILED' },
          order: { updatedAt: 'DESC' },
          skip: offset,
          take: limit,
        });
        const snapshots = await this.executionOrderReadPort.getExecutionSnapshots(
          rows.map((service) => service.executionOrderId),
        );
        const serviceByOrder = new Map<string, ServiceProvisioning>();
        for (const service of rows) {
          if (!serviceByOrder.has(service.executionOrderId)) {
            serviceByOrder.set(service.executionOrderId, service);
          }
        }
        return { snapshots, total, serviceByOrder };
      }
      const statuses =
        input.queue === 'IN_EXECUTION' ? ['CERTIFIED'] : ['RESERVED', 'CERTIFIED', 'ACTIVE'];
      const excluded = await qr.manager.find(ServiceProvisioning, {
        where: { tenantId, status: In(statuses) },
        select: ['executionOrderId'],
      });
      const { rows, total } = await this.executionOrderReadPort.listInstallationOrders({
        group: input.queue === 'IN_EXECUTION' ? 'IN_PROGRESS' : 'CLOSED_EXECUTED',
        excludeIds: excluded.map((row) => row.executionOrderId),
        page,
        limit,
      });
      const rowIds = rows.map((row) => row.id);
      const services = rowIds.length
        ? await qr.manager.find(ServiceProvisioning, {
            where: { tenantId, executionOrderId: In(rowIds) },
            order: { updatedAt: 'DESC' },
          })
        : [];
      const serviceByOrder = new Map<string, ServiceProvisioning>();
      for (const service of services) {
        if (!serviceByOrder.has(service.executionOrderId))
          serviceByOrder.set(service.executionOrderId, service);
      }
      return { snapshots: rows, total, serviceByOrder };
    });

    const { snapshots, serviceByOrder } = result;
    const services = [...serviceByOrder.values()];
    const assignmentRows = services.length
      ? await runInTenantSchema(this.dataSource, schemaName, (qr) =>
          qr.manager.find(IpAssignment, {
            where: {
              tenantId,
              serviceProvisioningId: In(services.map((row) => row.id)),
              status: In(['RESERVED', 'ACTIVE']),
            },
          }),
        )
      : [];
    const assignmentByService = new Map(
      assignmentRows.map((row) => [row.serviceProvisioningId, row]),
    );
    const actors = await this.actorRefs(
      schemaName,
      snapshots
        .map((snapshot) => snapshot.assignedTechnicianId)
        .filter((id): id is string => Boolean(id)),
    );
    const data: ProvisioningInboxRowDto[] = snapshots.map((snapshot) => {
      const service = serviceByOrder.get(snapshot.id) ?? null;
      const assignment = service ? assignmentByService.get(service.id) : null;
      return {
        queue: input.queue,
        executionOrderId: snapshot.id,
        executionOrderNumber: snapshot.executionOrderNumber,
        executionOrderStatus: snapshot.status,
        subscriberId: snapshot.subscriberId,
        subscriberDisplayLabel: snapshot.customerDisplayLabel,
        assignedTechnician: snapshot.assignedTechnicianId
          ? (actors.get(snapshot.assignedTechnicianId) ?? {
              id: snapshot.assignedTechnicianId,
              name: null,
            })
          : null,
        serviceProvisioningId: service?.id ?? null,
        provisioningStatus: (service?.status as ServiceProvisioningStatus | null) ?? null,
        ip: assignment ? this.ipText(assignment.ip) : null,
        failureReason:
          service?.failureReason === 'CLOSED_WITHOUT_CERTIFICATION'
            ? 'CLOSED_WITHOUT_CERTIFICATION'
            : null,
        closedAt: snapshot.closedAt,
        updatedAt:
          service?.updatedAt.toISOString() ?? snapshot.closedAt ?? new Date(0).toISOString(),
      };
    });
    const total = result.total;
    return {
      data,
      meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
    };
  }

  private async requireEligibleOpenInstallation(executionOrderId: string) {
    const order = await this.executionOrderReadPort.getExecutionSnapshot(executionOrderId);
    if (
      !order ||
      order.workType !== WfmWorkType.INSTALLATION ||
      order.status !== ExecutionOrderStatus.IN_PROGRESS ||
      order.isAnnulled ||
      !order.subscriberId
    ) {
      throw this.orderNotEligible();
    }
    return order;
  }

  private async requireProvisioning(
    manager: EntityManager,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<ServiceProvisioning> {
    const row = await manager.findOne(ServiceProvisioning, {
      where: { id, tenantId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!row) throw new NotFoundException('Aprovisionamiento no encontrado.');
    return row;
  }

  private async releaseExistingWithin(
    manager: EntityManager,
    tenantId: string,
    row: ServiceProvisioning,
    reason: 'REPLACED',
    actorId: string,
  ): Promise<void> {
    const assignment = await manager.findOne(IpAssignment, {
      where: { tenantId, serviceProvisioningId: row.id, status: In(['RESERVED', 'ACTIVE']) },
      lock: { mode: 'pessimistic_write' },
    });
    if (assignment) {
      const ip = this.ipText(assignment.ip);
      if (ip) {
        await this.routerProvisioningPort.remove({
          routerId: row.routerId,
          ip,
          controlParams: ControlParamsSchema.parse(row.controlParams),
        });
      }
      assignment.status = 'RELEASED';
      assignment.releasedAt = new Date();
      assignment.releaseReason = reason;
      await manager.save(IpAssignment, assignment);
    }
    row.status = 'RELEASED';
    row.releasedAt = new Date();
    row.releasedBy = actorId;
    row.releaseReason = reason;
    row.version += 1;
    await manager.save(ServiceProvisioning, row);
  }

  private async findLatestForOrder(executionOrderId: string): Promise<ServiceProvisioning | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(ServiceProvisioning, {
        where: { tenantId, executionOrderId },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  private async findAssignment(serviceProvisioningId: string): Promise<IpAssignment | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(IpAssignment, {
        where: { tenantId, serviceProvisioningId },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  private async toServiceDto(
    row: ServiceProvisioning,
    routerInstruction: ServiceProvisioningDto['routerInstruction'],
  ): Promise<ServiceProvisioningDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const related = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const router = await qr.manager.findOne(NetworkRouter, {
        where: { id: row.routerId, tenantId },
      });
      const network = await qr.manager.findOne(Ipv4Network, {
        where: { id: row.ipv4NetworkId, tenantId },
      });
      const assignment = await qr.manager.findOne(IpAssignment, {
        where: { tenantId, serviceProvisioningId: row.id },
        order: { createdAt: 'DESC' },
      });
      return { router, network, assignment };
    });
    const actorIds = [row.reservedBy, row.certifiedBy, row.regularizedBy, row.releasedBy].filter(
      (id): id is string => Boolean(id),
    );
    const actors = await this.actorRefs(schemaName, actorIds);
    const getActor = (id: string | null): ActorRefDto | null =>
      id ? (actors.get(id) ?? { id, name: null }) : null;
    const controlParams = ControlParamsSchema.parse(row.controlParams);
    return {
      id: row.id,
      status: row.status as ServiceProvisioningStatus,
      origin: row.origin === 'REGULARIZED' ? 'REGULARIZED' : 'NORMAL',
      executionOrderId: row.executionOrderId,
      executionOrderNumber: row.executionOrderNumber,
      subscriberId: row.subscriberId,
      contractId: row.contractId,
      router: { id: row.routerId, name: related.router?.name ?? '' },
      network: {
        id: row.ipv4NetworkId,
        name: related.network?.name ?? '',
        cidr: related.network?.cidr ?? '',
      },
      ip: related.assignment?.status === 'RELEASED' ? null : this.ipText(related.assignment?.ip),
      controlMethod: row.controlMethod as ServiceProvisioningDto['controlMethod'],
      controlParams,
      plan: row.planId
        ? { planId: row.planId, downloadMbps: row.downloadMbps, uploadMbps: row.uploadMbps }
        : null,
      cpe: row.cpeSerialNumber
        ? { serialNumber: row.cpeSerialNumber, macAddress: row.cpeMacAddress }
        : null,
      reservedBy: getActor(row.reservedBy),
      reservedAt: row.reservedAt?.toISOString() ?? null,
      certifiedBy: getActor(row.certifiedBy),
      certifiedAt: row.certifiedAt?.toISOString() ?? null,
      certificationEvidenceId: row.certificationEvidenceId,
      regularizedBy: getActor(row.regularizedBy),
      regularizedAt: row.regularizedAt?.toISOString() ?? null,
      regularizationReason: row.regularizationReason,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      releasedBy: getActor(row.releasedBy),
      releasedAt: row.releasedAt?.toISOString() ?? null,
      releaseReason: row.releaseReason as ServiceProvisioningDto['releaseReason'],
      failureReason:
        row.failureReason === 'CLOSED_WITHOUT_CERTIFICATION'
          ? 'CLOSED_WITHOUT_CERTIFICATION'
          : null,
      commercialActivation: {
        status:
          row.commercialActivationStatus as ServiceProvisioningDto['commercialActivation']['status'],
        detail: this.activationDetail(row.commercialActivationDetail),
      },
      routerInstruction,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async actorRefs(schemaName: string, ids: string[]): Promise<Map<string, ActorRefDto>> {
    const actors = await this.actorReadPort.findByIds(schemaName, ids);
    return new Map(actors.map((actor) => [actor.id, actor]));
  }

  private async getActorPermissions(actor: JwtPayload): Promise<AccessPermissionKey[]> {
    return this.effectivePermissionsService.getEffectivePermissionsForUser(actor.sub);
  }

  private async actorHasPermission(
    actor: JwtPayload,
    permission: AccessPermissionKey,
  ): Promise<boolean> {
    return (await this.getActorPermissions(actor)).includes(permission);
  }

  private async toServiceDtoWithInstruction(
    row: ServiceProvisioning,
  ): Promise<ServiceProvisioningDto> {
    const assignment = await this.findAssignment(row.id);
    const instruction =
      assignment && row.status !== 'RELEASED'
        ? await this.routerProvisioningPort.apply({
            routerId: row.routerId,
            ip: this.ipText(assignment.ip) ?? '',
            controlParams: ControlParamsSchema.parse(row.controlParams),
            ...(row.downloadMbps !== null ? { downloadMbps: row.downloadMbps } : {}),
            ...(row.uploadMbps !== null ? { uploadMbps: row.uploadMbps } : {}),
          })
        : null;
    return this.toServiceDto(row, instruction);
  }

  private ipText(value: unknown): string | null {
    return typeof value === 'string' ? (value.split('/')[0] ?? null) : null;
  }

  private activationDetail(
    value: string | null,
  ): ServiceProvisioningDto['commercialActivation']['detail'] {
    return value === 'CONTACT_REQUIRED' ||
      value === 'FISCAL_INCOMPLETE' ||
      value === 'NO_EXPEDIENTE'
      ? value
      : null;
  }

  private assertVersion(row: ServiceProvisioning, expectedVersion: number): void {
    if (row.version !== expectedVersion) {
      throw new ConflictException({ code: 'VERSION_CONFLICT' });
    }
  }

  private orderNotEligible(message = 'La orden no es elegible para aprovisionamiento.') {
    return new UnprocessableEntityException({
      code: 'PROVISIONING_ORDER_NOT_ELIGIBLE',
      message,
    });
  }
}
