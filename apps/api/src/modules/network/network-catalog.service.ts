import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Ipv4Network,
  NetworkPlanProfile,
  NetworkRouter,
  NetworkSetting,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import {
  type ActorRefDto,
  type CreateIpv4NetworkBody,
  type CreateRouterBody,
  type Ipv4NetworkDto,
  type ListResponse,
  type NetworkSettingsDto,
  type PlanProfileDto,
  type RouterDto,
  type UpdateIpv4NetworkBody,
  type UpdateRouterBody,
  AuditAction,
} from '@iwana/shared';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { buildPageMeta, clampLimit, clampPage } from '../../common/pagination';
import { IpamService, type IpamOccupancy } from './ipam.service';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import { NetworkCatalogListQueryDto } from './dto/network-catalog.dto';

type CatalogStatus = 'ACTIVE' | 'INACTIVE';

interface NetworkValidationRow {
  normalized_cidr: string;
  gateway_inside: boolean;
  from_inside: boolean;
  to_inside: boolean;
  range_ordered: boolean;
}

interface CountRow {
  count: number | string;
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
  ) {}

  async listRouters(query: NetworkCatalogListQueryDto): Promise<ListResponse<RouterDto>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const limit = clampLimit(query.limit, 100);
    const { page } = clampPage(query.page, limit);
    const offset = (page - 1) * limit;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const builder = qr.manager
        .createQueryBuilder(NetworkRouter, 'router')
        .where('router.tenant_id = :tenantId', { tenantId });
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

      const data: RouterDto[] = [];
      for (const router of rows) {
        data.push(await this.toRouterDto(qr.manager, tenantId, router));
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

  async createRouter(input: CreateRouterBody, actorId: string): Promise<RouterDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
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
              name: saved.name,
              status: saved.status,
              supportedControlMethods: saved.supportedControlMethods,
              changedFields: ['name', 'managementHost', 'lanInterface', 'supportedControlMethods'],
            },
          },
          qr.manager,
        );
        return this.toRouterDto(qr.manager, tenantId, saved);
      });
    } catch (error) {
      if (this.isUniqueViolation(error, 'uq_network_routers_tenant_name')) {
        throw new ConflictException({
          code: 'VALIDATION_ERROR',
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
        const router = await qr.manager.findOne(NetworkRouter, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!router) throw new NotFoundException('No se encontró el router.');
        this.assertVersion(router.version, input.version);

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
            throw this.controlMethodNotSupported();
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
              name: saved.name,
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
          code: 'VALIDATION_ERROR',
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
      const router = await qr.manager.findOne(NetworkRouter, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!router) throw new NotFoundException('No se encontró el router.');
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
            name: saved.name,
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

  async listIpv4Networks(query: NetworkCatalogListQueryDto): Promise<ListResponse<Ipv4NetworkDto>> {
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
      if (query.routerId)
        builder.andWhere('network.router_id = :routerId', { routerId: query.routerId });
      if (query.status) builder.andWhere('network.status = :status', { status: query.status });

      const total = await builder.clone().getCount();
      const { entities, raw } = await builder
        .orderBy('network.name', 'ASC')
        .addOrderBy('network.id', 'ASC')
        .skip(offset)
        .take(limit)
        .getRawAndEntities();

      const data: Ipv4NetworkDto[] = [];
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

  async createIpv4Network(input: CreateIpv4NetworkBody, actorId: string): Promise<Ipv4NetworkDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const router = await qr.manager.findOne(NetworkRouter, {
          where: { id: input.routerId, tenantId, status: 'ACTIVE' },
        });
        if (!router) throw new NotFoundException('No se encontró un router activo.');
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
  ): Promise<Ipv4NetworkDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const network = await qr.manager.findOne(Ipv4Network, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!network) throw new NotFoundException('No se encontró la red IPv4.');
      this.assertVersion(network.version, input.version);

      const router = await qr.manager.findOne(NetworkRouter, {
        where: { id: network.routerId, tenantId },
      });
      if (!router) throw new NotFoundException('No se encontró el router de la red.');

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
              AND (a.ip < $3::inet OR a.ip > $4::inet OR a.ip = ANY($5::inet[]))
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
  ): Promise<Ipv4NetworkDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const network = await qr.manager.findOne(Ipv4Network, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!network) throw new NotFoundException('No se encontró la red IPv4.');
      this.assertVersion(network.version, version);
      network.status = status;
      network.version += 1;

      const router = await qr.manager.findOne(NetworkRouter, {
        where: { id: network.routerId, tenantId },
      });
      if (!router) throw new NotFoundException('No se encontró el router de la red.');
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

  async listPlanProfiles(): Promise<PlanProfileDto[]> {
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

  async getNetworkSettings(): Promise<NetworkSettingsDto> {
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
          ($3::inet <= $4::inet) AS range_ordered`,
      [input.cidr, input.gateway, input.assignableFrom, input.assignableTo],
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
  ): Promise<Ipv4NetworkDto> {
    const occupancy: IpamOccupancy = await this.ipamService.getOccupancy(network.id, manager);
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
      cidr: network.cidr,
      status: network.status,
      assignableFrom: this.hostAddress(network.assignableFrom),
      assignableTo: this.hostAddress(network.assignableTo),
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
