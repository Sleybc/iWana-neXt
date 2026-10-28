import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
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
  type ProvisioningMetaDto,
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
import { EffectivePermissionScopePort } from '../access-control/ports/effective-permission-scope.port';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { InstalledEquipmentReadPort } from '../inventory/ports/installed-equipment-read.port';
import { SubscriberServiceContextReadPort } from '../crm/ports/subscriber-service-context-read.port';
import { IpamService } from './ipam.service';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import { NetworkAuthorizationFacade } from './authorization/network-authorization.facade';
import {
  ROUTER_PROVISIONING_PORT,
  type RouterProvisioningPort,
} from './ports/router-provisioning.port';
import {
  EXECUTION_ORDER_READ_PORT,
  type ExecutionOrderReference,
  type ExecutionOrderReadPort,
  type ExecutionSnapshot,
} from '../tasks/ports/execution-order-read.port';
import { ServiceProvisioningActivatedEvent } from './events/service-provisioning-activated.event';
import { NETWORK_RESERVATIONS_PAUSED } from './network-reservations-state';

interface ProvisioningAuthorizationReference {
  id: string;
  routerId: string;
  ipv4NetworkId: string;
  organizationSiteId: string | null;
}

interface TechnicianProvisioningProjection {
  id: string;
  routerId: string;
  ipv4NetworkId: string;
  status: ServiceProvisioningStatus;
  updatedAt: Date;
}

interface TechnicianAssignmentProjection {
  ip: string;
  status: string;
}

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
    private readonly effectivePermissionScope: EffectivePermissionScopePort,
    private readonly networkAuthorization: NetworkAuthorizationFacade,
    @Inject(ROUTER_PROVISIONING_PORT)
    private readonly routerProvisioningPort: RouterProvisioningPort,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @Inject(NETWORK_RESERVATIONS_PAUSED)
    private readonly reservationsPaused = false,
  ) {}

  async getProvisioningMeta(actor: JwtPayload): Promise<ProvisioningMetaDto> {
    await this.networkAuthorization.requireTenantWideAction(
      actor.sub,
      AccessPermissionKey.NETWORK_PROVISIONING_READ,
    );
    return { reservationsPaused: this.reservationsPaused };
  }

  async reserve(
    input: ReserveProvisioningBody,
    actor: JwtPayload,
  ): Promise<ServiceProvisioningDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const order = await this.authorizeTargetAndLoadExecutionOrder(
      input.executionOrderId,
      input.routerId,
      input.ipv4NetworkId,
      actor,
      AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
    );

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      const initialParent = await this.requireNetworkParent(
        manager,
        tenantId,
        input.routerId,
        input.ipv4NetworkId,
        false,
      );
      await this.networkAuthorization.requireSiteOrTenantWideAction(
        actor.sub,
        initialParent.router.organizationSiteId,
        AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
      );
      this.assertNetworkParentActive(initialParent.router, initialParent.network);
      this.assertEligibleOpenInstallation(order);
      if (!order.assignedTechnicianId) {
        throw new UnprocessableEntityException({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' });
      }
      const subscriberId = order.subscriberId;
      if (!subscriberId) throw this.orderNotEligible();
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
      this.assertReservationsOpen();
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `provisioning-order:${input.executionOrderId}`,
      ]);
      const existingSnapshot = await manager.findOne(ServiceProvisioning, {
        where: {
          tenantId,
          executionOrderId: input.executionOrderId,
          status: In(['RESERVED', 'CERTIFIED']),
        },
        order: { createdAt: 'DESC' },
      });
      // La reserva conserva L1 → L2 → filas; el catálogo usa L0 → L2 → filas.
      await this.ipamService.lockIpv4Pools(manager, [
        input.ipv4NetworkId,
        ...(existingSnapshot ? [existingSnapshot.ipv4NetworkId] : []),
      ]);
      const { router, network } = await this.requireNetworkParent(
        manager,
        tenantId,
        input.routerId,
        input.ipv4NetworkId,
      );
      await this.networkAuthorization.requireSiteOrTenantWideAction(
        actor.sub,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
      );
      this.assertNetworkParentActive(router, network);
      if (!router.supportedControlMethods.includes(input.controlParams.method)) {
        throw new ConflictException({ code: 'CONTROL_METHOD_NOT_SUPPORTED' });
      }
      await this.ipamService.assertActiveNetwork(manager, tenantId, network.id);

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
          lock: { mode: 'pessimistic_write' },
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
          await this.ipamService.assertAssignmentNotLocallyProtected(
            manager,
            tenantId,
            assignment.ip,
          );
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
        await this.releaseExistingWithin(
          manager,
          tenantId,
          schemaName,
          existing,
          'REPLACED',
          actor.sub,
        );
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
    const order = await this.authorizeProvisioningAndLoadExecutionOrder(
      id,
      actor,
      AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    );
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `provisioning-order:${order.id}`,
      ]);
      const row = await this.requireProvisioning(qr.manager, tenantId, id, true);
      const { router, network } = await this.requireProvisioningNetworkParent(
        qr.manager,
        tenantId,
        row,
      );
      await this.networkAuthorization.requireSiteOrTenantWideAction(
        actor.sub,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
      );
      this.assertNetworkParentActive(router, network);
      this.assertVersion(row, input.version);
      if (row.status === 'CERTIFIED' && row.certificationEvidenceId === input.evidenceId) {
        return row;
      }
      this.assertEligibleOpenInstallation(order);
      if (row.status !== 'RESERVED')
        throw new ConflictException({ code: 'PROVISIONING_STATE_INVALID' });
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
    const order = await this.authorizeProvisioningAndLoadExecutionOrder(
      id,
      actor,
      AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
      true,
    );
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `provisioning-order:${order.id}`,
      ]);
      const rowSnapshot = await this.requireProvisioning(qr.manager, tenantId, id, false);
      await this.ipamService.lockIpv4Pools(qr.manager, [rowSnapshot.ipv4NetworkId]);
      const row = await this.requireProvisioning(qr.manager, tenantId, id, true);
      const { router, network } = await this.requireProvisioningNetworkParent(
        qr.manager,
        tenantId,
        row,
      );
      await this.networkAuthorization.requireSiteOrTenantWideAction(
        actor.sub,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
      );
      this.assertNetworkParentActive(router, network);
      if (row.status === 'CERTIFIED') {
        if (router.organizationSiteId === null) {
          await this.networkAuthorization.requireTenantWideAction(
            actor.sub,
            AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
          );
        } else {
          await this.networkAuthorization.requireSiteAction(
            actor.sub,
            router.organizationSiteId,
            AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
          );
        }
      }
      this.assertVersion(row, input.version);
      if (row.status !== 'RESERVED' && row.status !== 'CERTIFIED') {
        throw new ConflictException({ code: 'PROVISIONING_STATE_INVALID' });
      }
      if (order.status !== ExecutionOrderStatus.IN_PROGRESS) {
        throw this.orderNotEligible();
      }
      await this.ipamService.assertActiveNetwork(qr.manager, tenantId, row.ipv4NetworkId);
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
            releaseReason: 'MANUAL',
            fromStatus,
            toStatus: saved.status,
            reasonProvided: input.reason.trim().length > 0,
            changedFields: ['status', 'ipAssignment'],
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
    const order = await this.authorizeTargetAndLoadExecutionOrder(
      input.executionOrderId,
      input.routerId,
      input.ipv4NetworkId,
      actor,
      AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
    );

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      const initialParent = await this.requireNetworkParent(
        manager,
        tenantId,
        input.routerId,
        input.ipv4NetworkId,
        false,
      );
      await this.networkAuthorization.requireSiteOrTenantWideAction(
        actor.sub,
        initialParent.router.organizationSiteId,
        AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
      );
      this.assertNetworkParentActive(initialParent.router, initialParent.network);
      this.assertEligibleClosedInstallation(order);
      if (!order.assignedTechnicianId) {
        throw new UnprocessableEntityException({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' });
      }
      if (order.assignedTechnicianId === actor.sub) {
        throw new ForbiddenException({ code: 'PROVISIONING_CERTIFIER_IS_EXECUTOR' });
      }
      const subscriberId = order.subscriberId;
      if (!subscriberId) throw this.orderNotEligible();
      this.assertReservationsOpen();

      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `provisioning-order:${input.executionOrderId}`,
      ]);

      const existingSnapshot = await manager.findOne(ServiceProvisioning, {
        where: {
          tenantId,
          executionOrderId: input.executionOrderId,
          status: In(['ACTIVE', 'FAILED', 'RESERVED', 'CERTIFIED']),
        },
        order: { createdAt: 'DESC' },
      });

      await this.ipamService.lockIpv4Pools(manager, [
        input.ipv4NetworkId,
        ...(existingSnapshot ? [existingSnapshot.ipv4NetworkId] : []),
      ]);
      const { router, network } = await this.requireNetworkParent(
        manager,
        tenantId,
        input.routerId,
        input.ipv4NetworkId,
      );
      await this.networkAuthorization.requireSiteOrTenantWideAction(
        actor.sub,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
      );
      this.assertNetworkParentActive(router, network);
      await this.ipamService.assertActiveNetwork(manager, tenantId, network.id);
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
          lock: { mode: 'pessimistic_write' },
        });
        const requestMatches =
          existing.origin === 'REGULARIZED' &&
          existing.regularizationReason === input.reason &&
          existing.routerId === input.routerId &&
          existing.ipv4NetworkId === input.ipv4NetworkId &&
          JSON.stringify(existing.controlParams) === JSON.stringify(input.controlParams) &&
          (!input.requestedIp || this.ipText(assignment?.ip) === input.requestedIp) &&
          (input.contractId === undefined || existing.contractId === input.contractId);
        if (requestMatches && assignment) {
          await this.ipamService.assertAssignmentNotLocallyProtected(
            manager,
            tenantId,
            assignment.ip,
          );
          return { row: existing, assignment, idempotent: true };
        }
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
        if (reusableAssignment) {
          await this.ipamService.assertAssignmentNotLocallyProtected(
            manager,
            tenantId,
            reusableAssignment.ip,
          );
        }
      }
      const reuseFailedRow = Boolean(
        existing?.status === 'FAILED' &&
        reusableAssignment &&
        reusableAssignment.ipv4NetworkId === input.ipv4NetworkId &&
        (!input.requestedIp || this.ipText(reusableAssignment.ip) === input.requestedIp),
      );
      if (existing?.status === 'FAILED' && !reuseFailedRow) {
        await this.releaseExistingWithin(
          manager,
          tenantId,
          schemaName,
          existing,
          'REPLACED',
          actor.sub,
        );
        existing = null;
        reusableAssignment = null;
      }

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
        if (!assignment) throw new ConflictException({ code: 'IP_IN_USE' });
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
            routerId: router.id,
            status: saved.status,
            reasonProvided: input.reason.trim().length > 0,
            changedFields: ['status', 'ipAssignment'],
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
    const reference = await this.requireExecutionReference(executionOrderId);
    const provisioningReference =
      await this.findLatestProvisioningAuthorizationReferenceForOrder(executionOrderId);
    const [hasTenantProvisioningRead, hasExecutionRead] = await Promise.all([
      this.effectivePermissionScope.authorizeTenantWide({
        actorId: actor.sub,
        permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
      }),
      this.effectivePermissionScope.authorizeTenantWide({
        actorId: actor.sub,
        permissionKey: AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      }),
    ]);
    let siteReadDecision: 'OUT_OF_SCOPE' | 'IN_SCOPE_NO_ACTION' | 'ALLOWED' | null = null;
    let hasProvisioningRead = hasTenantProvisioningRead;
    if (provisioningReference?.organizationSiteId) {
      siteReadDecision = await this.effectivePermissionScope.evaluateSite({
        actorId: actor.sub,
        siteId: provisioningReference.organizationSiteId,
        permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
      });
      hasProvisioningRead ||= siteReadDecision === 'ALLOWED';
    }

    if (!hasProvisioningRead) {
      if (!hasExecutionRead || reference.assignedTechnicianId !== actor.sub) {
        throw siteReadDecision === 'OUT_OF_SCOPE' ? this.resourceNotFound() : this.forbidden();
      }
      const service = provisioningReference
        ? await this.findTechnicianProvisioningProjection(provisioningReference.id)
        : null;
      if (
        service &&
        (service.routerId !== provisioningReference?.routerId ||
          service.ipv4NetworkId !== provisioningReference?.ipv4NetworkId)
      ) {
        throw this.resourceNotFound();
      }
      const assignment = service ? await this.findTechnicianAssignmentProjection(service.id) : null;
      // Proyección construida desde cero: no extenderla con datos del contexto completo.
      return {
        executionOrderId,
        status: service?.status ?? null,
        ip: assignment?.status === 'RELEASED' ? null : this.ipText(assignment?.ip),
        certified: service?.status === 'CERTIFIED' || service?.status === 'ACTIVE',
        updatedAt: service?.updatedAt?.toISOString() ?? null,
      };
    }

    const service = provisioningReference
      ? await this.findProvisioningByIdForOrderContext(provisioningReference.id)
      : null;
    if (
      service &&
      (service.routerId !== provisioningReference?.routerId ||
        service.ipv4NetworkId !== provisioningReference?.ipv4NetworkId)
    ) {
      throw this.resourceNotFound();
    }
    const order = await this.requireExecutionSnapshot(executionOrderId);
    const assignment = service ? await this.findAssignment(service.id) : null;

    let hasProvisioningCertify = await this.effectivePermissionScope.authorizeTenantWide({
      actorId: actor.sub,
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    });
    if (provisioningReference?.organizationSiteId && !hasProvisioningCertify) {
      hasProvisioningCertify =
        (await this.effectivePermissionScope.evaluateSite({
          actorId: actor.sub,
          siteId: provisioningReference.organizationSiteId,
          permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
        })) === 'ALLOWED';
    }

    if (!order.subscriberId) throw this.orderNotEligible();
    const commercial = await this.subscriberContextPort.getForSubscriber(order.subscriberId);
    if (!commercial) throw this.orderNotEligible();
    const equipment = await this.installedEquipmentReadPort.getFirstInstalledAtCustomer(
      executionOrderId,
      order.subscriberId,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const planId = commercial.planId;
    const planProfile = planId
      ? await runInTenantSchema(this.dataSource, schemaName, (qr) =>
          qr.manager.findOne(NetworkPlanProfile, {
            where: { tenantId, planId },
          }),
        )
      : null;
    const evidences = await this.executionOrderReadPort.listProvisioningEvidence(executionOrderId);
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
    let provisioning: ServiceProvisioningDto | null = null;
    if (service) {
      let routerInstruction: ServiceProvisioningDto['routerInstruction'] = null;
      if (assignment && service.status !== 'RELEASED') {
        this.assertReservationsOpen();
        routerInstruction = await this.routerProvisioningPort.apply({
          routerId: service.routerId,
          ip: this.ipText(assignment.ip) ?? '',
          controlParams: ControlParamsSchema.parse(service.controlParams),
          ...(service.downloadMbps !== null ? { downloadMbps: service.downloadMbps } : {}),
          ...(service.uploadMbps !== null ? { uploadMbps: service.uploadMbps } : {}),
        });
      }
      provisioning = await this.toServiceDto(service, routerInstruction);
    }

    return {
      executionOrder: {
        id: order.id,
        executionOrderNumber: order.executionOrderNumber,
        status: order.status,
        workType: order.workType,
        assignedTechnician,
        canCertify:
          hasProvisioningCertify &&
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
        evidenceType: evidence.evidenceType,
        requirementKey: evidence.requirementKey,
        createdAt: evidence.createdAt,
      })),
      provisioning,
      suggestedQueueName: order.executionOrderNumber.replace(/[^A-Za-z0-9._-]/g, '_'),
    };
  }
  async listSubscriberProvisionings(
    subscriberId: string,
    actor: JwtPayload,
  ): Promise<ServiceProvisioningDto[]> {
    await this.requireTenantPermission(actor, AccessPermissionKey.NETWORK_PROVISIONING_READ);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(ServiceProvisioning, {
        where: { tenantId, subscriberId },
        order: { createdAt: 'DESC' },
      }),
    );
    return Promise.all(rows.map((row) => this.toServiceDto(row, null)));
  }

  async listInbox(
    input: {
      queue: ProvisioningInboxQueue;
      page: number;
      limit: number;
    },
    actor: JwtPayload,
  ): Promise<ListResponse<ProvisioningInboxRowDto>> {
    await this.requireTenantPermission(actor, AccessPermissionKey.NETWORK_PROVISIONING_READ);
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

  private async requireExecutionReference(
    executionOrderId: string,
  ): Promise<ExecutionOrderReference> {
    const reference = await this.executionOrderReadPort.getExecutionReference(executionOrderId);
    if (!reference) throw this.resourceNotFound();
    return reference;
  }

  private async requireExecutionSnapshot(executionOrderId: string): Promise<ExecutionSnapshot> {
    const order = await this.executionOrderReadPort.getExecutionSnapshot(executionOrderId);
    if (!order) throw this.resourceNotFound();
    return order;
  }

  private async authorizeTargetAndLoadExecutionOrder(
    executionOrderId: string,
    routerId: string,
    networkId: string,
    actor: JwtPayload,
    permissionKey: AccessPermissionKey,
  ): Promise<ExecutionSnapshot> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const { router, network } = await this.requireNetworkParent(
        qr.manager,
        tenantId,
        routerId,
        networkId,
        false,
      );
      await this.networkAuthorization.requireSiteOrTenantWideAction(
        actor.sub,
        router.organizationSiteId,
        permissionKey,
      );
      this.assertNetworkParentActive(router, network);
    });
    await this.requireExecutionReference(executionOrderId);
    return this.requireExecutionSnapshot(executionOrderId);
  }

  private async authorizeProvisioningAndLoadExecutionOrder(
    provisioningId: string,
    actor: JwtPayload,
    permissionKey: AccessPermissionKey,
    requireCertifyWhenAlreadyCertified = false,
  ): Promise<ExecutionSnapshot> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { row, router, network } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const row = await this.requireProvisioning(qr.manager, tenantId, provisioningId, false);
        const { router, network } = await this.requireNetworkParent(
          qr.manager,
          tenantId,
          row.routerId,
          row.ipv4NetworkId,
          false,
        );
        return { row, router, network };
      },
    );
    await this.networkAuthorization.requireSiteOrTenantWideAction(
      actor.sub,
      router.organizationSiteId,
      permissionKey,
    );
    this.assertNetworkParentActive(router, network);
    await this.requireExecutionReference(row.executionOrderId);
    if (requireCertifyWhenAlreadyCertified && row.status === 'CERTIFIED') {
      if (router.organizationSiteId === null) {
        await this.networkAuthorization.requireTenantWideAction(
          actor.sub,
          AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
        );
      } else {
        await this.networkAuthorization.requireSiteAction(
          actor.sub,
          router.organizationSiteId,
          AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
        );
      }
    }
    return this.requireExecutionSnapshot(row.executionOrderId);
  }

  private assertEligibleOpenInstallation(order: ExecutionSnapshot): void {
    if (
      order.workType !== WfmWorkType.INSTALLATION ||
      order.status !== ExecutionOrderStatus.IN_PROGRESS ||
      order.isAnnulled ||
      !order.subscriberId
    ) {
      throw this.orderNotEligible();
    }
  }

  private assertEligibleClosedInstallation(order: ExecutionSnapshot): void {
    if (
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
  }

  private async requireNetworkParent(
    manager: EntityManager,
    tenantId: string,
    routerId: string,
    networkId: string,
    lock = true,
  ): Promise<{ router: NetworkRouter; network: Ipv4Network }> {
    const router = await manager.findOne(NetworkRouter, {
      where: { id: routerId, tenantId },
      ...(lock ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    const network = await manager.findOne(Ipv4Network, {
      where: { id: networkId, tenantId },
      ...(lock ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    if (!router || !network || network.routerId !== router.id) {
      throw this.resourceNotFound();
    }
    return { router, network };
  }

  private requireProvisioningNetworkParent(
    manager: EntityManager,
    tenantId: string,
    row: ServiceProvisioning,
  ): Promise<{ router: NetworkRouter; network: Ipv4Network }> {
    return this.requireNetworkParent(manager, tenantId, row.routerId, row.ipv4NetworkId);
  }

  private async findLatestProvisioningAuthorizationReferenceForOrder(
    executionOrderId: string,
  ): Promise<ProvisioningAuthorizationReference | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Solo proyecta las claves necesarias para resolver el scope persistido antes de autorizar.
      const provisioning = await qr.manager.findOne(ServiceProvisioning, {
        where: { tenantId, executionOrderId },
        order: { createdAt: 'DESC' },
        select: { id: true, routerId: true, ipv4NetworkId: true },
      });
      if (!provisioning) return null;

      const router = await qr.manager.findOne(NetworkRouter, {
        where: { tenantId, id: provisioning.routerId },
        select: { id: true, organizationSiteId: true },
      });
      if (!router) throw this.resourceNotFound();
      const network = await qr.manager.findOne(Ipv4Network, {
        where: { tenantId, id: provisioning.ipv4NetworkId },
        select: { id: true, routerId: true },
      });
      if (!network || network.routerId !== router.id) throw this.resourceNotFound();

      return {
        id: provisioning.id,
        routerId: router.id,
        ipv4NetworkId: network.id,
        organizationSiteId: router.organizationSiteId,
      };
    });
  }

  private async findProvisioningByIdForOrderContext(
    provisioningId: string,
  ): Promise<ServiceProvisioning | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(ServiceProvisioning, { where: { id: provisioningId, tenantId } }),
    );
  }

  private async findTechnicianProvisioningProjection(
    provisioningId: string,
  ): Promise<TechnicianProvisioningProjection | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(
      this.dataSource,
      schemaName,
      (qr) =>
        qr.manager.findOne(ServiceProvisioning, {
          where: { id: provisioningId, tenantId },
          select: {
            id: true,
            routerId: true,
            ipv4NetworkId: true,
            status: true,
            updatedAt: true,
          },
        }) as Promise<TechnicianProvisioningProjection | null>,
    );
  }

  private async findTechnicianAssignmentProjection(
    serviceProvisioningId: string,
  ): Promise<TechnicianAssignmentProjection | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(
      this.dataSource,
      schemaName,
      (qr) =>
        qr.manager.findOne(IpAssignment, {
          where: { tenantId, serviceProvisioningId },
          order: { createdAt: 'DESC' },
          select: { ip: true, status: true },
        }) as Promise<TechnicianAssignmentProjection | null>,
    );
  }

  private assertNetworkParentActive(router: NetworkRouter, network: Ipv4Network): void {
    if (router.status !== 'ACTIVE' || network.status !== 'ACTIVE') {
      throw this.orderNotEligible('No se encontró un router o una red activa.');
    }
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
    if (!row) throw this.resourceNotFound();
    return row;
  }

  private async releaseExistingWithin(
    manager: EntityManager,
    tenantId: string,
    schemaName: string,
    row: ServiceProvisioning,
    reason: 'REPLACED',
    actorId: string,
  ): Promise<void> {
    const fromStatus = row.status;
    const assignment = await manager.findOne(IpAssignment, {
      where: { tenantId, serviceProvisioningId: row.id, status: In(['RESERVED', 'ACTIVE']) },
      lock: { mode: 'pessimistic_write' },
    });
    let ip: string | null = null;
    if (assignment) {
      ip = this.ipText(assignment.ip);
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
    const released = await manager.save(ServiceProvisioning, row);
    await this.auditService.logWithin(
      {
        tenantId,
        schemaName,
        userId: actorId,
        action: AuditAction.UPDATE,
        entityType: 'ServiceProvisioning',
        entityId: released.id,
        newValue: {
          action: 'RELEASE',
          releaseReason: reason,
          fromStatus,
          toStatus: released.status,
          changedFields: ['status', 'ipAssignment'],
        },
      },
      manager,
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

  private async requireTenantPermission(
    actor: JwtPayload,
    permissionKey: AccessPermissionKey,
  ): Promise<void> {
    if (
      !(await this.effectivePermissionScope.authorizeTenantWide({
        actorId: actor.sub,
        permissionKey,
      }))
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      });
    }
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

  private resourceNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'La referencia no está disponible para esta operación.',
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'No tienes autorización para esta operación.',
    });
  }

  private assertReservationsOpen(): void {
    if (!this.reservationsPaused) return;
    throw new ConflictException({
      code: 'RESERVATIONS_PAUSED',
      message: 'La pausa temporal de aprovisionamiento impide crear o reemitir asignaciones.',
    });
  }
}
