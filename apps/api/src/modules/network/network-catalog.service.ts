import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Ipv4Network,
  NetworkPlanProfile,
  NetworkRouter,
  NetworkRouterInterface,
  NetworkRouterInterfaceIpv4Address,
  NetworkSetting,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import {
  AccessPermissionKey,
  type ActorRefDto,
  type CreateIpv4NetworkBody,
  type CreateRouterBody,
  type AssistedCreateIpv4NetworkBody,
  type Ipv4NetworkDto,
  type Ipv4NetworkExtendedDto,
  type ListResponse,
  type RouterDetailDto,
  type RouterInterfaceDto,
  type RouterListDto,
  type RouterSiteOptionDto,
  type NetworkSettingsDto,
  type PlanProfileDto,
  type RouterDto,
  type UpdateIpv4NetworkBody,
  type UpdateRouterBody,
  AuditAction,
} from '@iwana/shared';
import { DataSource, EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { buildPageMeta, clampLimit, clampPage } from '../../common/pagination';
import { IpamService, type IpamOccupancy } from './ipam.service';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import {
  Ipv4NetworkCatalogListQueryDto,
  NetworkCatalogListQueryDto,
} from './dto/network-catalog.dto';
import { NetworkAuthorizationFacade } from './authorization/network-authorization.facade';
import { OrganizationSiteReadPort } from '../organization/ports/organization-site-read.port';
import { CommercialNodeReadPort } from '../tenant/ports/commercial-node-read.port';
import { NETWORK_IP_PROTECTION_STATUS, type IpProtectionStatus } from './ip-protection-status';
import type { AuthorizedSiteScope } from '../access-control/ports/effective-permission-scope.port';
import type { RouterSiteOptionsQueryDto } from './dto/network-interfaces.dto';

type CatalogStatus = 'ACTIVE' | 'INACTIVE';

interface NetworkValidationRow {
  normalized_cidr: string;
  gateway_inside: boolean;
  from_inside: boolean;
  to_inside: boolean;
  range_ordered: boolean;
  exclusions_inside: boolean;
}

interface CountRow {
  count: number | string;
}

interface RouterInterfaceSummaryRow {
  router_id: string;
  interface_count: number | string;
  legacy_lan_interface_id: string | null;
}

interface RouterNetworkAvailabilityRow {
  router_status: string;
  interface_id: string | null;
  interface_name: string | null;
  interface_status: string | null;
}

interface NetworkInterfaceProjectionRow {
  id: string;
  name: string;
  status: string;
}

interface NetworkRouterStatusRow {
  status: string;
}

interface RouterNameRow {
  name: string;
}

interface NetworkRawRow {
  router_name: string | null;
}

interface ActiveIpOutsideUpdatedRangeRow {
  exists: boolean;
}

interface PostgresError {
  code?: string;
  constraint?: string;
  driverError?: PostgresError;
}

@Injectable()
export class NetworkCatalogService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly actorReadPort: NetworkActorReadPort,
    private readonly ipamService: IpamService,
    private readonly authorization: NetworkAuthorizationFacade,
    private readonly organizationSiteReadPort: OrganizationSiteReadPort,
    private readonly commercialNodeReadPort: CommercialNodeReadPort,
    @Optional()
    @Inject(NETWORK_IP_PROTECTION_STATUS)
    private readonly ipProtectionStatus: IpProtectionStatus = 'PENDING',
  ) {}

  async listRouters(
    query: NetworkCatalogListQueryDto,
    actorId: string,
  ): Promise<ListResponse<RouterListDto>> {
    const authorizedScope = await this.authorization.authorizedSiteScope(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_READ,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const limit = clampLimit(query.limit, 100);
    const { page } = clampPage(query.page, limit);
    const offset = (page - 1) * limit;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const builder = qr.manager
        .createQueryBuilder(NetworkRouter, 'router')
        .where('router.tenant_id = :tenantId', { tenantId });
      this.applySiteScope(builder, 'router', authorizedScope);
      if (query.status) builder.andWhere('router.status = :status', { status: query.status });
      if (query.q?.trim()) {
        builder.andWhere('router.name ILIKE :query', { query: `%${query.q.trim()}%` });
      }

      const total = await builder.clone().getCount();
      const rows = await builder
        .orderBy('router.name', 'ASC')
        .addOrderBy('router.id', 'ASC')
        .skip(offset)
        .take(limit)
        .getMany();

      const summaries = rows.length
        ? ((await qr.manager.query(
            `SELECT router.id AS router_id,
                    router.legacy_lan_interface_id,
                    COUNT(interface.id)::integer AS interface_count
               FROM network_routers router
               LEFT JOIN network_router_interfaces interface
                 ON interface.tenant_id = router.tenant_id
                AND interface.router_id = router.id
              WHERE router.tenant_id = $1 AND router.id = ANY($2::uuid[])
              GROUP BY router.id, router.legacy_lan_interface_id`,
            [tenantId, rows.map((router) => router.id)],
          )) as RouterInterfaceSummaryRow[])
        : [];
      const summariesByRouter = new Map(summaries.map((summary) => [summary.router_id, summary]));
      const data: RouterListDto[] = [];
      for (const router of rows) {
        const summary = summariesByRouter.get(router.id);
        data.push({
          ...(await this.toRouterDto(qr.manager, tenantId, router)),
          interfaceCount: Number(summary?.interface_count ?? 0),
          legacyLanInterfaceId: summary?.legacy_lan_interface_id ?? null,
        });
      }

      return {
        data,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
  }

  async getRouterDetail(id: string, actorId: string): Promise<RouterDetailDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const router = await qr.manager.findOne(NetworkRouter, { where: { id, tenantId } });
      if (!router) throw this.resourceNotFound();
      await this.authorization.requireSiteOrTenantWideAction(
        actorId,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_CATALOG_READ,
      );

      const [organizationSite, commercialNode] = await Promise.all([
        router.organizationSiteId
          ? this.organizationSiteReadPort.findRouterSummaryById(router.organizationSiteId)
          : Promise.resolve(null),
        router.commercialNodeId
          ? this.commercialNodeReadPort.findRouterSummaryById(router.commercialNodeId)
          : Promise.resolve(null),
      ]);
      const base = await this.toRouterDto(qr.manager, tenantId, router);
      const summaries = (await qr.manager.query(
        `SELECT COUNT(*)::integer AS interface_count
           FROM network_router_interfaces
          WHERE tenant_id = $1 AND router_id = $2`,
        [tenantId, router.id],
      )) as Array<{ interface_count: number | string }>;
      return {
        ...base,
        interfaceCount: Number(summaries[0]?.interface_count ?? 0),
        legacyLanInterfaceId: router.legacyLanInterfaceId ?? null,
        organizationSite,
        commercialNode,
      };
    });
  }

  async listRouterSiteOptions(
    query: RouterSiteOptionsQueryDto,
    actorId: string,
  ): Promise<ListResponse<RouterSiteOptionDto>> {
    const scope = await this.authorization.authorizedSiteScope(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    );
    return this.organizationSiteReadPort.listRouterOptions({
      scope,
      page: query.page,
      limit: query.limit,
    });
  }

  async getCatalogMeta(actorId: string): Promise<{ ipProtection: IpProtectionStatus }> {
    await this.authorization.requireTenantWideAction(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_READ,
    );
    return { ipProtection: this.ipProtectionStatus };
  }

  async createAssistedIpv4Network(
    routerId: string,
    input: AssistedCreateIpv4NetworkBody,
    actorId: string,
  ): Promise<Ipv4NetworkExtendedDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        await this.lockIpv4Catalog(qr.manager, tenantId);
        const router = await qr.manager.findOne(NetworkRouter, {
          where: { id: routerId, tenantId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!router) throw this.resourceNotFound();
        await this.authorization.requireSiteOrTenantWideAction(
          actorId,
          router.organizationSiteId,
          AccessPermissionKey.NETWORK_CATALOG_MANAGE,
        );
        if (router.status !== 'ACTIVE') throw this.resourceNotFound();
        if (!router.supportedControlMethods.includes(input.defaultControlMethod)) {
          throw this.controlMethodNotSupported();
        }

        let cidr: string;
        let gateway: string;
        let sourceInterfaceId: string | null = null;
        if (input.source.mode === 'MANUAL_CIDR') {
          cidr = input.source.cidr;
          gateway = input.source.gateway;
        } else if (input.source.mode === 'IP_PREFIX') {
          cidr = input.source.confirmedCidr;
          gateway = input.source.confirmedGateway;
          await this.assertConfirmedPrefix(qr.manager, input.source.addressWithPrefix, cidr);
        } else {
          await this.authorization.requireSiteOrTenantWideAction(
            actorId,
            router.organizationSiteId,
            AccessPermissionKey.NETWORK_CATALOG_READ,
          );
          const address = await qr.manager.findOne(NetworkRouterInterfaceIpv4Address, {
            where: {
              id: input.source.interfaceAddressId,
              tenantId,
              routerId,
              version: input.source.interfaceAddressVersion,
            },
          });
          if (!address) throw this.resourceNotFound();
          const sourceInterface = await qr.manager.findOne(NetworkRouterInterface, {
            where: { id: address.interfaceId, tenantId, routerId },
          });
          if (!sourceInterface) throw this.resourceNotFound();
          if (sourceInterface.status !== 'ACTIVE') {
            throw new ConflictException({ code: 'INTERFACE_NOT_AVAILABLE' });
          }
          cidr = input.source.confirmedCidr;
          gateway = input.source.confirmedGateway;
          sourceInterfaceId = sourceInterface.id;
          await this.assertConfirmedPrefix(qr.manager, address.address, cidr);
        }

        const interfaceId = input.interfaceId ?? sourceInterfaceId;
        if (input.interfaceId && sourceInterfaceId && input.interfaceId !== sourceInterfaceId) {
          throw new BadRequestException({ code: 'NETWORK_CONFIRMATION_MISMATCH' });
        }
        let interfaceName: string | null = null;
        if (interfaceId) {
          const routerInterface = await qr.manager.findOne(NetworkRouterInterface, {
            where: { id: interfaceId, tenantId, routerId },
            lock: { mode: 'pessimistic_read' },
          });
          if (!routerInterface) throw this.resourceNotFound();
          if (input.interfaceId && routerInterface.version !== input.interfaceVersion) {
            this.assertVersion(routerInterface.version, input.interfaceVersion ?? 0);
          }
          if (routerInterface.status !== 'ACTIVE') {
            throw new ConflictException({ code: 'INTERFACE_NOT_AVAILABLE' });
          }
          interfaceName = routerInterface.name;
        }

        const networkInput = {
          cidr,
          gateway,
          assignableFrom: input.assignableFrom,
          assignableTo: input.assignableTo,
          excludedIps: input.excludedIps ?? [],
        };
        await this.assertNetworkRange(qr.manager, networkInput);
        const network = qr.manager.create(Ipv4Network, {
          tenantId,
          routerId,
          interfaceId: interfaceId ?? null,
          name: input.name?.trim() || interfaceName || `Red ${cidr}`,
          ...networkInput,
          defaultControlMethod: input.defaultControlMethod,
          status: 'ACTIVE',
          createdBy: actorId,
          version: 1,
        });
        const saved = await qr.manager.save(Ipv4Network, network);
        await this.auditService.logWithin(
          {
            tenantId,
            schemaName,
            userId: actorId,
            action: AuditAction.CREATE,
            entityType: 'Ipv4Network',
            entityId: saved.id,
            newValue: this.networkAuditValue(saved, ['routerId', 'interfaceId', 'name']),
          },
          qr.manager,
        );
        return this.toIpv4NetworkDto(qr.manager, saved, router.name);
      });
    } catch (error) {
      if (this.isExclusionViolation(error)) throw this.networkOverlap();
      throw error;
    }
  }

  async createRouter(input: CreateRouterBody, actorId: string): Promise<RouterDto> {
    await this.validateNewRouterReferences(input, actorId);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        await this.lockIpv4Catalog(qr.manager, tenantId);
        const router = qr.manager.create(NetworkRouter, {
          tenantId,
          name: input.name.trim(),
          managementHost: input.managementHost.trim(),
          lanInterface: input.lanInterface ?? null,
          supportedControlMethods: input.supportedControlMethods,
          organizationSiteId: input.organizationSiteId ?? null,
          commercialNodeId: input.commercialNodeId ?? null,
          notes: input.notes ?? null,
          status: 'ACTIVE',
          createdBy: actorId,
          version: 1,
        });
        const saved = await qr.manager.save(NetworkRouter, router);
        await this.auditService.logWithin(
          {
            tenantId,
            schemaName,
            userId: actorId,
            action: AuditAction.CREATE,
            entityType: 'NetworkRouter',
            entityId: saved.id,
            newValue: {
              status: saved.status,
              supportedControlMethods: saved.supportedControlMethods,
              changedFields: [
                'name',
                'managementHost',
                'supportedControlMethods',
                ...(input.lanInterface !== undefined ? ['lanInterface'] : []),
                ...(input.organizationSiteId !== undefined ? ['organizationSiteId'] : []),
                ...(input.commercialNodeId !== undefined ? ['commercialNodeId'] : []),
                ...(input.notes !== undefined ? ['notes'] : []),
              ],
            },
          },
          qr.manager,
        );
        return this.toRouterDto(qr.manager, tenantId, saved);
      });
    } catch (error) {
      if (this.isUniqueViolation(error, 'uq_network_routers_tenant_name')) {
        throw new ConflictException({
          code: 'ROUTER_NAME_IN_USE',
          message: 'Ya existe un router con ese nombre.',
        });
      }
      throw error;
    }
  }

  async updateRouter(id: string, input: UpdateRouterBody, actorId: string): Promise<RouterDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        await this.lockIpv4Catalog(qr.manager, tenantId);
        const poolRows = (await qr.manager.query(
          `SELECT id FROM ipv4_networks WHERE tenant_id = $1 AND router_id = $2 ORDER BY id`,
          [tenantId, id],
        )) as Array<{ id: string }>;
        await this.ipamService.lockIpv4Pools(
          qr.manager,
          poolRows.map((row) => row.id),
        );
        const router = await qr.manager.findOne(NetworkRouter, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!router) throw this.resourceNotFound();
        await this.authorization.requireSiteOrTenantWideAction(
          actorId,
          router.organizationSiteId,
          AccessPermissionKey.NETWORK_CATALOG_MANAGE,
        );
        this.assertVersion(router.version, input.version);
        await this.validateRouterReferenceChanges(router, input, actorId);

        const changes: string[] = [];
        for (const field of [
          'name',
          'managementHost',
          'lanInterface',
          'supportedControlMethods',
          'organizationSiteId',
          'commercialNodeId',
          'notes',
        ] as const) {
          const value = input[field];
          if (value !== undefined) {
            const normalizedValue =
              field === 'name' || field === 'managementHost' ? (value as string).trim() : value;
            Object.assign(router, { [field]: normalizedValue });
            changes.push(field);
          }
        }

        if (input.supportedControlMethods) {
          const unsupported = (await qr.manager.query(
            `SELECT 1
               FROM ipv4_networks
              WHERE tenant_id = $1 AND router_id = $2
                AND NOT (default_control_method = ANY($3::varchar[]))
              LIMIT 1`,
            [tenantId, id, input.supportedControlMethods],
          )) as unknown[];
          if (unsupported.length > 0) {
            throw this.controlMethodInUse();
          }
        }

        router.version += 1;
        const saved = await qr.manager.save(NetworkRouter, router);
        await this.auditService.logWithin(
          {
            tenantId,
            schemaName,
            userId: actorId,
            action: AuditAction.UPDATE,
            entityType: 'NetworkRouter',
            entityId: saved.id,
            newValue: {
              status: saved.status,
              supportedControlMethods: saved.supportedControlMethods,
              changedFields: changes,
            },
          },
          qr.manager,
        );
        return this.toRouterDto(qr.manager, tenantId, saved);
      });
    } catch (error) {
      if (this.isUniqueViolation(error, 'uq_network_routers_tenant_name')) {
        throw new ConflictException({
          code: 'ROUTER_NAME_IN_USE',
          message: 'Ya existe un router con ese nombre.',
        });
      }
      throw error;
    }
  }

  async setRouterStatus(
    id: string,
    version: number,
    status: CatalogStatus,
    actorId: string,
  ): Promise<RouterDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.lockIpv4Catalog(qr.manager, tenantId);
      const poolRows = (await qr.manager.query(
        `SELECT id FROM ipv4_networks WHERE tenant_id = $1 AND router_id = $2 ORDER BY id`,
        [tenantId, id],
      )) as Array<{ id: string }>;
      await this.ipamService.lockIpv4Pools(
        qr.manager,
        poolRows.map((row) => row.id),
      );
      const router = await qr.manager.findOne(NetworkRouter, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!router) throw this.resourceNotFound();
      await this.authorization.requireSiteOrTenantWideAction(
        actorId,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      );
      this.assertVersion(router.version, version);

      router.status = status;
      router.version += 1;
      const saved = await qr.manager.save(NetworkRouter, router);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actorId,
          action: AuditAction.UPDATE,
          entityType: 'NetworkRouter',
          entityId: saved.id,
          newValue: {
            status: saved.status,
            supportedControlMethods: saved.supportedControlMethods,
            changedFields: ['status'],
          },
        },
        qr.manager,
      );
      return this.toRouterDto(qr.manager, tenantId, saved);
    });
  }

  async listIpv4Networks(
    query: Ipv4NetworkCatalogListQueryDto,
    actorId: string,
  ): Promise<ListResponse<Ipv4NetworkExtendedDto>> {
    const authorizedScope = await this.authorization.authorizedSiteScope(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_READ,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const limit = clampLimit(query.limit, 100);
    const { page } = clampPage(query.page, limit);
    const offset = (page - 1) * limit;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const builder = qr.manager
        .createQueryBuilder(Ipv4Network, 'network')
        .leftJoin(
          NetworkRouter,
          'router',
          'router.id = network.router_id AND router.tenant_id = network.tenant_id',
        )
        .addSelect('router.name', 'router_name')
        .where('network.tenant_id = :tenantId', { tenantId });
      this.applySiteScope(builder, 'router', authorizedScope);
      if (query.routerId)
        builder.andWhere('network.router_id = :routerId', { routerId: query.routerId });
      if (query.interfaceId)
        builder.andWhere('network.interface_id = :interfaceId', { interfaceId: query.interfaceId });
      if (query.status) builder.andWhere('network.status = :status', { status: query.status });
      if (query.q?.trim()) {
        builder.andWhere('network.name ILIKE :query', { query: `%${query.q.trim()}%` });
      }

      const total = await builder.clone().getCount();
      const { entities, raw } = await builder
        .orderBy('network.name', 'ASC')
        .addOrderBy('network.id', 'ASC')
        .skip(offset)
        .take(limit)
        .getRawAndEntities();

      const data: Ipv4NetworkExtendedDto[] = [];
      for (let index = 0; index < entities.length; index += 1) {
        const network = entities[index];
        if (!network) continue;
        data.push(
          await this.toIpv4NetworkDto(
            qr.manager,
            network,
            (raw[index] as NetworkRawRow | undefined)?.router_name ?? '',
          ),
        );
      }

      return {
        data,
        meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
      };
    });
  }

  async createIpv4Network(
    input: CreateIpv4NetworkBody,
    actorId: string,
  ): Promise<Ipv4NetworkExtendedDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        await this.lockIpv4Catalog(qr.manager, tenantId);
        const router = await qr.manager.findOne(NetworkRouter, {
          where: { id: input.routerId, tenantId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!router) throw this.resourceNotFound();
        await this.authorization.requireSiteOrTenantWideAction(
          actorId,
          router.organizationSiteId,
          AccessPermissionKey.NETWORK_CATALOG_MANAGE,
        );
        if (router.status !== 'ACTIVE') {
          throw this.resourceNotFound();
        }
        if (!router.supportedControlMethods.includes(input.defaultControlMethod)) {
          throw this.controlMethodNotSupported();
        }
        await this.assertNetworkRange(qr.manager, input);

        const network = qr.manager.create(Ipv4Network, {
          tenantId,
          routerId: router.id,
          name: input.name.trim(),
          cidr: input.cidr,
          gateway: input.gateway,
          assignableFrom: input.assignableFrom,
          assignableTo: input.assignableTo,
          excludedIps: input.excludedIps ?? [],
          defaultControlMethod: input.defaultControlMethod,
          status: 'ACTIVE',
          createdBy: actorId,
          version: 1,
        });
        const saved = await qr.manager.save(Ipv4Network, network);
        await this.auditService.logWithin(
          {
            tenantId,
            schemaName,
            userId: actorId,
            action: AuditAction.CREATE,
            entityType: 'Ipv4Network',
            entityId: saved.id,
            newValue: this.networkAuditValue(saved, [
              'routerId',
              'name',
              'gateway',
              'defaultControlMethod',
            ]),
          },
          qr.manager,
        );
        return this.toIpv4NetworkDto(qr.manager, saved, router.name);
      });
    } catch (error) {
      if (this.isExclusionViolation(error)) throw this.networkOverlap();
      throw error;
    }
  }

  async updateIpv4Network(
    id: string,
    input: UpdateIpv4NetworkBody,
    actorId: string,
  ): Promise<Ipv4NetworkExtendedDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.lockIpv4Catalog(qr.manager, tenantId);
      const current = await qr.manager.findOne(Ipv4Network, { where: { id, tenantId } });
      if (!current) throw this.resourceNotFound();
      await this.ipamService.lockIpv4Pools(qr.manager, [current.id]);
      const router = await qr.manager.findOne(NetworkRouter, {
        where: { id: current.routerId, tenantId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!router) throw this.resourceNotFound();
      let selectedInterface: NetworkRouterInterface | null = null;
      if (input.interfaceId !== undefined && input.interfaceId !== null) {
        selectedInterface = await qr.manager.findOne(NetworkRouterInterface, {
          where: { id: input.interfaceId, routerId: current.routerId, tenantId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!selectedInterface) throw this.resourceNotFound();
        if (input.interfaceVersion !== undefined) {
          this.assertVersion(selectedInterface.version, input.interfaceVersion);
        }
      }
      const network = await qr.manager.findOne(Ipv4Network, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!network) throw this.resourceNotFound();

      await this.authorization.requireSiteOrTenantWideAction(
        actorId,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      );
      this.assertVersion(network.version, input.version);

      const next = {
        cidr: network.cidr,
        gateway: network.gateway,
        assignableFrom: input.assignableFrom ?? network.assignableFrom,
        assignableTo: input.assignableTo ?? network.assignableTo,
        excludedIps: input.excludedIps ?? network.excludedIps,
      };
      await this.assertNetworkRange(qr.manager, next);

      const excludedLiveIp = (await qr.manager.query(
        `SELECT EXISTS (
           SELECT 1 FROM ip_assignments a
            WHERE a.tenant_id = $1
              AND a.ipv4_network_id = $2
              AND a.status IN ('RESERVED', 'ACTIVE')
              AND (
                a.ip < $3::inet OR a.ip > $4::inet
                OR EXISTS (
                  SELECT 1 FROM unnest($5::inet[]) AS excluded(ip)
                   WHERE set_masklen(excluded.ip, 32) = set_masklen(a.ip, 32)
                )
              )
         ) AS exists`,
        [tenantId, id, next.assignableFrom, next.assignableTo, next.excludedIps],
      )) as ActiveIpOutsideUpdatedRangeRow[];
      if (excludedLiveIp[0]?.exists) {
        throw new ConflictException({
          code: 'IP_IN_USE',
          message: 'El cambio dejaría una dirección asignada fuera del rango disponible.',
        });
      }

      const changes: string[] = [];
      if (input.name !== undefined) {
        network.name = input.name.trim();
        changes.push('name');
      }
      if (input.assignableFrom !== undefined) {
        network.assignableFrom = input.assignableFrom;
        changes.push('assignableFrom');
      }
      if (input.assignableTo !== undefined) {
        network.assignableTo = input.assignableTo;
        changes.push('assignableTo');
      }
      if (input.excludedIps !== undefined) {
        network.excludedIps = input.excludedIps;
        changes.push('excludedIps');
      }
      if (input.defaultControlMethod !== undefined) {
        if (!router.supportedControlMethods.includes(input.defaultControlMethod)) {
          throw this.controlMethodNotSupported();
        }
        network.defaultControlMethod = input.defaultControlMethod;
        changes.push('defaultControlMethod');
      }
      if (input.interfaceId !== undefined && input.interfaceId !== network.interfaceId) {
        if (input.interfaceId !== null && selectedInterface?.status !== 'ACTIVE') {
          throw new ConflictException({ code: 'INTERFACE_NOT_AVAILABLE' });
        }
        network.interfaceId = input.interfaceId;
        changes.push('interfaceId');
      }

      network.version += 1;
      const saved = await qr.manager.save(Ipv4Network, network);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actorId,
          action: AuditAction.UPDATE,
          entityType: 'Ipv4Network',
          entityId: saved.id,
          newValue: this.networkAuditValue(saved, changes),
        },
        qr.manager,
      );
      return this.toIpv4NetworkDto(qr.manager, saved, router.name);
    });
  }

  async setIpv4NetworkStatus(
    id: string,
    version: number,
    status: CatalogStatus,
    actorId: string,
  ): Promise<Ipv4NetworkExtendedDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.lockIpv4Catalog(qr.manager, tenantId);
      const current = await qr.manager.findOne(Ipv4Network, { where: { id, tenantId } });
      if (!current) throw this.resourceNotFound();
      await this.ipamService.lockIpv4Pools(qr.manager, [current.id]);
      const router = await qr.manager.findOne(NetworkRouter, {
        where: { id: current.routerId, tenantId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!router) throw this.resourceNotFound();
      const network = await qr.manager.findOne(Ipv4Network, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!network) throw this.resourceNotFound();

      await this.authorization.requireSiteOrTenantWideAction(
        actorId,
        router.organizationSiteId,
        AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      );
      this.assertVersion(network.version, version);
      network.status = status;
      network.version += 1;
      const saved = await qr.manager.save(Ipv4Network, network);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actorId,
          action: AuditAction.UPDATE,
          entityType: 'Ipv4Network',
          entityId: saved.id,
          newValue: this.networkAuditValue(saved, ['status']),
        },
        qr.manager,
      );
      return this.toIpv4NetworkDto(qr.manager, saved, router.name);
    });
  }

  async listPlanProfiles(actorId: string): Promise<PlanProfileDto[]> {
    await this.authorization.requireTenantWideAction(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_READ,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const profiles = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.find(NetworkPlanProfile, {
        where: { tenantId },
        order: { planId: 'ASC' },
      }),
    );
    const actors = await this.resolveActors(
      schemaName,
      profiles.map((profile) => profile.createdBy),
    );
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
    return profiles.map((profile) => ({
      planId: profile.planId,
      pcqAddressList: profile.pcqAddressList,
      updatedAt: profile.updatedAt.toISOString(),
      updatedBy: actorsById.get(profile.createdBy) ?? null,
    }));
  }

  async putPlanProfile(
    planId: string,
    pcqAddressList: string,
    actorId: string,
  ): Promise<PlanProfileDto> {
    await this.authorization.requireTenantWideAction(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const profile = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `network-plan-profile:${planId}`,
      ]);
      const existing = await qr.manager.findOne(NetworkPlanProfile, {
        where: { tenantId, planId },
        lock: { mode: 'pessimistic_write' },
      });
      const isCreate = existing === null;
      const row =
        existing ??
        qr.manager.create(NetworkPlanProfile, {
          tenantId,
          planId,
          pcqAddressList,
          createdBy: actorId,
        });
      row.pcqAddressList = pcqAddressList;
      // La tabla no tiene updated_by; created_by conserva el último actor que escribió,
      // que es la fuente disponible para el updatedBy expuesto por el contrato.
      row.createdBy = actorId;
      const saved = await qr.manager.save(NetworkPlanProfile, row);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actorId,
          action: isCreate ? AuditAction.CREATE : AuditAction.UPDATE,
          entityType: 'NetworkPlanProfile',
          entityId: saved.id,
          newValue: { planId: saved.planId, pcqAddressList: saved.pcqAddressList },
        },
        qr.manager,
      );
      return saved;
    });

    const actor = await this.resolveActor(schemaName, profile.createdBy);
    return {
      planId: profile.planId,
      pcqAddressList: profile.pcqAddressList,
      updatedAt: profile.updatedAt.toISOString(),
      updatedBy: actor,
    };
  }

  async getNetworkSettings(actorId: string): Promise<NetworkSettingsDto> {
    await this.authorization.requireTenantWideAction(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_READ,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const settings = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(NetworkSetting, { where: { tenantId } }),
    );
    const updatedBy = settings?.updatedBy
      ? await this.resolveActor(schemaName, settings.updatedBy)
      : null;
    return {
      enforceProvisioningOnInstallClose: settings?.enforceProvisioningOnInstallClose ?? false,
      updatedAt: settings?.updatedAt?.toISOString() ?? null,
      updatedBy,
    };
  }

  async updateNetworkSettings(
    enforceProvisioningOnInstallClose: boolean,
    actorId: string,
  ): Promise<NetworkSettingsDto> {
    await this.authorization.requireTenantWideAction(
      actorId,
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    );
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const settings = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `network-settings:${tenantId}`,
      ]);
      const existing = await qr.manager.findOne(NetworkSetting, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      const previousValue = existing?.enforceProvisioningOnInstallClose ?? false;
      const row =
        existing ??
        qr.manager.create(NetworkSetting, { tenantId, enforceProvisioningOnInstallClose: false });
      row.enforceProvisioningOnInstallClose = enforceProvisioningOnInstallClose;
      row.updatedBy = actorId;
      const saved = await qr.manager.save(NetworkSetting, row);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: actorId,
          action: AuditAction.UPDATE,
          entityType: 'NetworkSettings',
          entityId: tenantId,
          newValue: {
            enforceProvisioningOnInstallClose: {
              before: previousValue,
              after: saved.enforceProvisioningOnInstallClose,
            },
          },
        },
        qr.manager,
      );
      return saved;
    });

    return {
      enforceProvisioningOnInstallClose: settings.enforceProvisioningOnInstallClose,
      updatedAt: settings.updatedAt.toISOString(),
      updatedBy: await this.resolveActor(schemaName, actorId),
    };
  }

  private async assertNetworkRange(
    manager: EntityManager,
    input: Pick<
      CreateIpv4NetworkBody,
      'cidr' | 'gateway' | 'assignableFrom' | 'assignableTo' | 'excludedIps'
    >,
  ): Promise<void> {
    const rows = (await manager.query(
      `SELECT
          ($1::cidr)::text AS normalized_cidr,
          ($2::inet <<= $1::cidr) AS gateway_inside,
          ($3::inet <<= $1::cidr) AS from_inside,
          ($4::inet <<= $1::cidr) AS to_inside,
          ($3::inet <= $4::inet) AS range_ordered,
          COALESCE((
            SELECT bool_and(excluded_ip <<= $1::cidr)
              FROM unnest($5::inet[]) AS excluded_ip
          ), true) AS exclusions_inside`,
      [
        input.cidr,
        input.gateway,
        input.assignableFrom,
        input.assignableTo,
        input.excludedIps ?? [],
      ],
    )) as NetworkValidationRow[];
    const row = rows[0];
    if (
      !row ||
      row.normalized_cidr !== input.cidr ||
      !row.gateway_inside ||
      !row.from_inside ||
      !row.to_inside ||
      !row.range_ordered
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'La puerta de enlace y el rango deben pertenecer a la red IPv4 indicada.',
      });
    }
    if (!row.exclusions_inside) {
      throw new BadRequestException({
        code: 'EXCLUDED_IP_OUTSIDE_BLOCK',
        message: 'Cada exclusión debe pertenecer al bloque IPv4 de la red.',
      });
    }
  }

  /** L0 serializa el catálogo tenant-local antes de tomar locks L2 o filas L3. */
  private async lockIpv4Catalog(manager: EntityManager, tenantId: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `ipv4-catalog:${tenantId}`,
    ]);
  }

  private async assertConfirmedPrefix(
    manager: EntityManager,
    addressWithPrefix: string,
    confirmedCidr: string,
  ): Promise<void> {
    const rows = (await manager.query(
      `SELECT family($1::inet) = 4
                AND masklen($1::inet) BETWEEN 16 AND 30 AS source_prefix_assignable,
              family($2::cidr) = 4
                AND masklen($2::cidr) BETWEEN 16 AND 30 AS confirmed_prefix_assignable,
              network($1::inet) = network($2::cidr) AS same_network`,
      [addressWithPrefix, confirmedCidr],
    )) as Array<{
      source_prefix_assignable: boolean;
      confirmed_prefix_assignable: boolean;
      same_network: boolean;
    }>;
    const row = rows[0];
    if (!row || row.source_prefix_assignable !== true || row.confirmed_prefix_assignable !== true) {
      throw new BadRequestException({
        code: 'NETWORK_PREFIX_NOT_ASSIGNABLE',
        message: 'El prefijo debe permitir derivar un bloque IPv4 entre /16 y /30.',
      });
    }
    if (row.same_network !== true) {
      throw new BadRequestException({
        code: 'NETWORK_CONFIRMATION_MISMATCH',
        message: 'El bloque confirmado no coincide con la dirección y el prefijo ingresados.',
      });
    }
  }

  private async validateNewRouterReferences(
    input: CreateRouterBody,
    actorId: string,
  ): Promise<void> {
    if (input.organizationSiteId) {
      const site = await this.findOrganizationSiteReference(input.organizationSiteId);
      if (!site) throw this.resourceNotFound();
      await this.authorization.requireSiteAction(
        actorId,
        site.id,
        AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      );
      if (!site.isActive) throw this.siteOrNodeInactive();
    } else {
      await this.authorization.requireCreateScope(
        actorId,
        null,
        AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      );
    }

    if (input.commercialNodeId) {
      await this.assertCommercialNodeActive(input.commercialNodeId);
    }
  }

  private async validateRouterReferenceChanges(
    router: NetworkRouter,
    input: UpdateRouterBody,
    actorId: string,
  ): Promise<void> {
    if (
      input.organizationSiteId !== undefined &&
      input.organizationSiteId !== null &&
      input.organizationSiteId !== router.organizationSiteId
    ) {
      const site = await this.findOrganizationSiteReference(input.organizationSiteId);
      if (!site) throw this.resourceNotFound();
      await this.authorization.requireSiteAction(
        actorId,
        site.id,
        AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      );
      if (!site.isActive) throw this.siteOrNodeInactive();
    }

    if (
      input.commercialNodeId !== undefined &&
      input.commercialNodeId !== null &&
      input.commercialNodeId !== router.commercialNodeId
    ) {
      await this.assertCommercialNodeActive(input.commercialNodeId);
    }
  }

  private async assertCommercialNodeActive(id: string): Promise<void> {
    const node = await this.commercialNodeReadPort.findReferenceById(id);
    if (!node) throw this.resourceNotFound();
    if (!node.isActive || node.deletedAt !== null) throw this.siteOrNodeInactive();
  }

  private findOrganizationSiteReference(id: string) {
    return this.organizationSiteReadPort.findReferenceById(id);
  }

  private applySiteScope<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    alias: string,
    scope: AuthorizedSiteScope,
  ): void {
    if (scope.kind === 'TENANT_WIDE') return;
    if (scope.siteIds.length === 0) {
      builder.andWhere('1 = 0');
      return;
    }
    builder.andWhere(`${alias}.organization_site_id IN (:...authorizedSiteIds)`, {
      authorizedSiteIds: scope.siteIds,
    });
  }

  private resourceNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'La referencia no está disponible para esta operación.',
    });
  }

  private siteOrNodeInactive(): ConflictException {
    return new ConflictException({
      code: 'SITE_OR_NODE_INACTIVE',
      message: 'La sede o el nodo comercial no está disponible para una nueva asociación.',
    });
  }

  private async toRouterDto(
    manager: EntityManager,
    tenantId: string,
    router: NetworkRouter,
  ): Promise<RouterDto> {
    const counts = (await manager.query(
      'SELECT COUNT(*)::integer AS count FROM ipv4_networks WHERE tenant_id = $1 AND router_id = $2',
      [tenantId, router.id],
    )) as CountRow[];
    return {
      id: router.id,
      name: router.name,
      managementHost: router.managementHost,
      lanInterface: router.lanInterface,
      supportedControlMethods:
        router.supportedControlMethods as RouterDto['supportedControlMethods'],
      organizationSiteId: router.organizationSiteId,
      commercialNodeId: router.commercialNodeId,
      status: router.status as CatalogStatus,
      notes: router.notes,
      networkCount: Number(counts[0]?.count ?? 0),
      version: router.version,
      createdAt: router.createdAt.toISOString(),
      updatedAt: router.updatedAt.toISOString(),
    };
  }

  private async toIpv4NetworkDto(
    manager: EntityManager,
    network: Ipv4Network,
    routerName: string,
  ): Promise<Ipv4NetworkExtendedDto> {
    const occupancy: IpamOccupancy = await this.ipamService.getOccupancy(network.id, manager);
    const routerRows = (await manager.query(
      'SELECT status FROM network_routers WHERE tenant_id = $1 AND id = $2',
      [network.tenantId, network.routerId],
    )) as NetworkRouterStatusRow[];
    const interfaceRows = network.interfaceId
      ? ((await manager.query(
          `SELECT id, name, status FROM network_router_interfaces
            WHERE tenant_id = $1 AND router_id = $2 AND id = $3`,
          [network.tenantId, network.routerId, network.interfaceId],
        )) as NetworkInterfaceProjectionRow[])
      : [];
    const interfaceRow = interfaceRows[0];
    const reason =
      routerRows[0]?.status !== 'ACTIVE'
        ? 'ROUTER_INACTIVE'
        : network.status !== 'ACTIVE'
          ? 'NETWORK_INACTIVE'
          : network.interfaceId && interfaceRow?.status !== 'ACTIVE'
            ? 'INTERFACE_INACTIVE'
            : null;
    return {
      id: network.id,
      routerId: network.routerId,
      routerName,
      name: network.name,
      cidr: network.cidr,
      gateway: this.hostAddress(network.gateway),
      assignableFrom: this.hostAddress(network.assignableFrom),
      assignableTo: this.hostAddress(network.assignableTo),
      excludedIps: network.excludedIps.map((ip) => this.hostAddress(ip)),
      interfaceId: network.interfaceId ?? null,
      interface: interfaceRow
        ? {
            id: interfaceRow.id,
            name: interfaceRow.name,
            status: interfaceRow.status as CatalogStatus,
          }
        : null,
      reservationAvailability: { available: reason === null, reason },
      defaultControlMethod: network.defaultControlMethod as Ipv4NetworkDto['defaultControlMethod'],
      status: network.status as CatalogStatus,
      occupancy,
      version: network.version,
      createdAt: network.createdAt.toISOString(),
      updatedAt: network.updatedAt.toISOString(),
    };
  }

  private async resolveActor(schemaName: string, id: string): Promise<ActorRefDto | null> {
    const actors = await this.resolveActors(schemaName, [id]);
    return actors[0] ?? null;
  }

  private async resolveActors(schemaName: string, ids: string[]): Promise<ActorRefDto[]> {
    return ids.length > 0 ? this.actorReadPort.findByIds(schemaName, ids) : [];
  }

  private networkAuditValue(
    network: Ipv4Network,
    changedFields: string[],
  ): Record<string, unknown> {
    return {
      status: network.status,
      excludedIpCount: network.excludedIps.length,
      changedFields,
    };
  }

  private hostAddress(value: string): string {
    return value.replace(/\/\d+$/u, '');
  }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message:
          'El registro cambió desde la última consulta. Actualiza la información e inténtalo de nuevo.',
      });
    }
  }

  private controlMethodNotSupported(): ConflictException {
    return new ConflictException({
      code: 'CONTROL_METHOD_NOT_SUPPORTED',
      message: 'El método de control no está habilitado en el router.',
    });
  }

  private controlMethodInUse(): ConflictException {
    return new ConflictException({
      code: 'CONTROL_METHOD_IN_USE',
      message: 'Hay redes IPv4 que usan un método que se está quitando del router.',
    });
  }

  private networkOverlap(): ConflictException {
    return new ConflictException({
      code: 'NETWORK_OVERLAP',
      message: 'La red IPv4 se solapa con otra red de la empresa.',
    });
  }

  private isExclusionViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as PostgresError;
    const driverError = candidate.driverError ?? candidate;
    return driverError.code === '23P01' && driverError.constraint === 'ex_ipv4_networks_overlap';
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as PostgresError;
    const driverError = candidate.driverError ?? candidate;
    return driverError.code === '23505' && driverError.constraint === constraint;
  }
}
