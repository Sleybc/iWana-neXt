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
  NetworkRouter,
  NetworkRouterInterface,
  NetworkRouterInterfaceIpv4Address,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import {
  AccessPermissionKey,
  AuditAction,
  type CreateRouterInterfaceConversionResponseDto,
  type CorrectRouterInterfaceIpv4AddressBody,
  type CorrectRouterInterfaceIpv4AddressResponseDto,
  type CreateRouterInterfaceIpv4AddressBody,
  type CreateRouterInterfaceBody,
  type ListResponse,
  type RouterInterfaceDto,
  type RouterInterfaceIpv4AddressDto,
  type RouterDto,
  type UpdateRouterInterfaceBody,
  type UpdateRouterInterfaceIpv4AddressBody,
} from '@iwana/shared';
import { DataSource, EntityManager } from 'typeorm';
import { buildPageMeta, clampLimit, clampPage } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { IpamService } from './ipam.service';
import { NetworkAuthorizationFacade } from './authorization/network-authorization.facade';
import { NETWORK_IP_PROTECTION_STATUS, type IpProtectionStatus } from './ip-protection-status';

type CatalogStatus = 'ACTIVE' | 'INACTIVE';

interface InterfaceCountsRow {
  id: string;
  ipv4_address_count: number | string;
  network_count: number | string;
}

interface HostRow {
  host: string;
  prefix_length: number;
  family: number;
  usable: boolean;
}

interface PoolRow {
  id: string;
}

interface CountRow {
  count: number | string;
}

interface PostgresError {
  code?: string;
  constraint?: string;
  driverError?: PostgresError;
}

const INTERFACE_NAME_CONSTRAINT = 'uq_network_router_interfaces_name';
const ADDRESS_HOST_CONSTRAINT = 'uq_network_interface_ipv4_address';

@Injectable()
export class NetworkInterfaceCatalogService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly ipamService: IpamService,
    private readonly authorization: NetworkAuthorizationFacade,
    @Optional()
    @Inject(NETWORK_IP_PROTECTION_STATUS)
    private readonly ipProtectionStatus: IpProtectionStatus = 'PENDING',
  ) {}

  async listRouterInterfaces(
    routerId: string,
    pageInput: number,
    limitInput: number,
    actorId: string,
  ): Promise<ListResponse<RouterInterfaceDto>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const limit = clampLimit(limitInput, 100);
    const { page } = clampPage(pageInput, limit);
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const router = await qr.manager.findOne(NetworkRouter, { where: { id: routerId, tenantId } });
      if (!router) throw this.resourceNotFound();
      await this.authorize(actorId, router, AccessPermissionKey.NETWORK_CATALOG_READ);

      const [interfaces, total] = await qr.manager.findAndCount(NetworkRouterInterface, {
        where: { tenantId, routerId },
        order: { name: 'ASC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      const counts = interfaces.length
        ? ((await qr.manager.query(
            `SELECT interface.id,
                    COUNT(DISTINCT address.id)::integer AS ipv4_address_count,
                    COUNT(DISTINCT network.id)::integer AS network_count
               FROM network_router_interfaces interface
               LEFT JOIN network_router_interface_ipv4_addresses address
                 ON address.tenant_id = interface.tenant_id
                AND address.router_id = interface.router_id
                AND address.interface_id = interface.id
               LEFT JOIN ipv4_networks network
                 ON network.tenant_id = interface.tenant_id
                AND network.router_id = interface.router_id
                AND network.interface_id = interface.id
              WHERE interface.tenant_id = $1 AND interface.id = ANY($2::uuid[])
              GROUP BY interface.id`,
            [tenantId, interfaces.map((item) => item.id)],
          )) as InterfaceCountsRow[])
        : [];
      const byId = new Map(counts.map((row) => [row.id, row]));
      const data = interfaces.map((item) => this.toInterfaceDto(item, byId.get(item.id)));
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

  async createRouterInterface(
    routerId: string,
    input: CreateRouterInterfaceBody,
    actorId: string,
  ): Promise<RouterInterfaceDto | CreateRouterInterfaceConversionResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const manager = qr.manager;
        await this.lockIpv4Catalog(manager, tenantId);
        const convertedLegacy = 'convertLegacyLan' in input;
        const routerSnapshot = await manager.findOne(NetworkRouter, {
          where: { id: routerId, tenantId },
        });
        if (!routerSnapshot) throw this.resourceNotFound();
        await this.authorize(actorId, routerSnapshot, AccessPermissionKey.NETWORK_CATALOG_MANAGE);
        if (routerSnapshot.status !== 'ACTIVE') throw this.catalogReferenceInactive();

        let addressFacts: HostRow | null = null;
        if (convertedLegacy) {
          if (!routerSnapshot.lanInterface?.trim()) throw this.legacyLanNotAvailable();
          if (routerSnapshot.legacyLanInterfaceId) throw this.legacyLanAlreadyConverted();
          this.assertVersion(routerSnapshot.version, input.routerVersion);
          if (input.address) {
            if (this.ipProtectionStatus !== 'ACTIVE') throw this.ipProtectionPending();
            addressFacts = await this.readAddressFacts(manager, input.address.addressWithPrefix);
            if (!addressFacts?.usable) throw this.addressNotUsable();
            const pools = await this.poolIdsContainingHost(manager, tenantId, addressFacts.host);
            await this.ipamService.lockIpv4Pools(manager, pools);
            await this.assertNoLiveAssignment(manager, tenantId, addressFacts.host);
          }
        }

        const router = await manager.findOne(NetworkRouter, {
          where: { id: routerId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!router) throw this.resourceNotFound();
        if (router.status !== 'ACTIVE') throw this.catalogReferenceInactive();
        if (convertedLegacy) {
          if (!router.lanInterface?.trim()) throw this.legacyLanNotAvailable();
          if (router.legacyLanInterfaceId) throw this.legacyLanAlreadyConverted();
          this.assertVersion(router.version, input.routerVersion);
        }

        const row = manager.create(NetworkRouterInterface, {
          tenantId,
          routerId,
          name: input.name.trim(),
          kind: input.kind,
          notes: input.notes ?? null,
          status: 'ACTIVE',
          createdBy: actorId,
          version: 1,
        });
        const saved = await manager.save(NetworkRouterInterface, row);
        let savedAddress: NetworkRouterInterfaceIpv4Address | null = null;
        if (convertedLegacy) {
          router.legacyLanInterfaceId = saved.id;
          router.version += 1;
          await manager.save(NetworkRouter, router);
          if (input.address && addressFacts) {
            savedAddress = await manager.save(
              NetworkRouterInterfaceIpv4Address,
              manager.create(NetworkRouterInterfaceIpv4Address, {
                tenantId,
                routerId,
                interfaceId: saved.id,
                address: input.address.addressWithPrefix,
                notes: null,
                createdBy: actorId,
                version: 1,
              }),
            );
          }
        }
        await this.auditService.logWithin(
          {
            tenantId,
            schemaName,
            userId: actorId,
            action: AuditAction.CREATE,
            entityType: 'NetworkRouterInterface',
            entityId: saved.id,
            newValue: {
              kind: saved.kind,
              status: saved.status,
              convertedLegacy,
              changedFields: ['name', 'kind', ...(input.notes !== undefined ? ['notes'] : [])],
            },
          },
          manager,
        );
        if (convertedLegacy) {
          await this.auditService.logWithin(
            {
              tenantId,
              schemaName,
              userId: actorId,
              action: AuditAction.UPDATE,
              entityType: 'NetworkRouter',
              entityId: router.id,
              newValue: { changedFields: ['legacyLanInterfaceId'] },
            },
            manager,
          );
        }
        if (savedAddress) {
          await this.auditService.logWithin(
            {
              tenantId,
              schemaName,
              userId: actorId,
              action: AuditAction.CREATE,
              entityType: 'NetworkRouterInterfaceIpv4Address',
              entityId: savedAddress.id,
              newValue: { changedFields: ['address'] },
            },
            manager,
          );
        }
        const interfaceDto = await this.toInterfaceDtoWithCounts(manager, tenantId, saved);
        return convertedLegacy
          ? {
              interface: interfaceDto,
              address: savedAddress ? this.toAddressDto(savedAddress) : null,
              router: await this.toRouterDto(manager, tenantId, router),
            }
          : interfaceDto;
      });
    } catch (error) {
      if (this.isUniqueViolation(error, INTERFACE_NAME_CONSTRAINT)) {
        throw new ConflictException({ code: 'INTERFACE_NAME_IN_USE' });
      }
      throw error;
    }
  }

  async updateRouterInterface(
    routerId: string,
    interfaceId: string,
    input: UpdateRouterInterfaceBody,
    actorId: string,
  ): Promise<RouterInterfaceDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const manager = qr.manager;
        await this.lockIpv4Catalog(manager, tenantId);
        const snapshot = await manager.findOne(NetworkRouterInterface, {
          where: { id: interfaceId, routerId, tenantId },
        });
        if (!snapshot) throw this.resourceNotFound();
        const poolIds = await this.poolIdsForInterface(manager, tenantId, routerId, interfaceId);
        await this.ipamService.lockIpv4Pools(manager, poolIds);
        const router = await manager.findOne(NetworkRouter, {
          where: { id: routerId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!router) throw this.resourceNotFound();
        await this.authorize(actorId, router, AccessPermissionKey.NETWORK_CATALOG_MANAGE);
        const row = await manager.findOne(NetworkRouterInterface, {
          where: { id: interfaceId, routerId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!row) throw this.resourceNotFound();
        this.assertVersion(row.version, input.version);
        const changedFields: string[] = [];
        if (input.name !== undefined) {
          row.name = input.name.trim();
          changedFields.push('name');
        }
        if (input.kind !== undefined) {
          row.kind = input.kind;
          changedFields.push('kind');
        }
        if (input.notes !== undefined) {
          row.notes = input.notes;
          changedFields.push('notes');
        }
        row.version += 1;
        const saved = await manager.save(NetworkRouterInterface, row);
        await this.auditInterface(manager, tenantId, schemaName, actorId, saved, changedFields);
        return this.toInterfaceDtoWithCounts(manager, tenantId, saved);
      });
    } catch (error) {
      if (this.isUniqueViolation(error, INTERFACE_NAME_CONSTRAINT)) {
        throw new ConflictException({ code: 'INTERFACE_NAME_IN_USE' });
      }
      throw error;
    }
  }

  async setRouterInterfaceStatus(
    routerId: string,
    interfaceId: string,
    version: number,
    status: CatalogStatus,
    actorId: string,
  ): Promise<RouterInterfaceDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      await this.lockIpv4Catalog(manager, tenantId);
      const snapshot = await manager.findOne(NetworkRouterInterface, {
        where: { id: interfaceId, routerId, tenantId },
      });
      if (!snapshot) throw this.resourceNotFound();
      const poolIds = await this.poolIdsForInterface(manager, tenantId, routerId, interfaceId);
      await this.ipamService.lockIpv4Pools(manager, poolIds);
      const router = await manager.findOne(NetworkRouter, {
        where: { id: routerId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!router) throw this.resourceNotFound();
      await this.authorize(actorId, router, AccessPermissionKey.NETWORK_CATALOG_MANAGE);
      const row = await manager.findOne(NetworkRouterInterface, {
        where: { id: interfaceId, routerId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw this.resourceNotFound();
      this.assertVersion(row.version, version);
      row.status = status;
      row.version += 1;
      const saved = await manager.save(NetworkRouterInterface, row);
      await this.auditInterface(manager, tenantId, schemaName, actorId, saved, ['status']);
      return this.toInterfaceDtoWithCounts(manager, tenantId, saved);
    });
  }

  async listInterfaceIpv4Addresses(
    routerId: string,
    interfaceId: string,
    pageInput: number,
    limitInput: number,
    actorId: string,
  ): Promise<ListResponse<RouterInterfaceIpv4AddressDto>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const limit = clampLimit(limitInput, 100);
    const { page } = clampPage(pageInput, limit);
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const router = await qr.manager.findOne(NetworkRouter, { where: { id: routerId, tenantId } });
      if (!router) throw this.resourceNotFound();
      await this.authorize(actorId, router, AccessPermissionKey.NETWORK_CATALOG_READ);
      const iface = await qr.manager.findOne(NetworkRouterInterface, {
        where: { id: interfaceId, routerId, tenantId },
      });
      if (!iface) throw this.resourceNotFound();
      const [rows, total] = await qr.manager.findAndCount(NetworkRouterInterfaceIpv4Address, {
        where: { tenantId, routerId, interfaceId },
        order: { hostAddress: 'ASC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      return {
        data: rows.map((row) => this.toAddressDto(row)),
        meta: buildPageMeta({ total, page, limit, randomAccess: true, sortableFields: [] }),
      };
    });
  }

  async createInterfaceIpv4Address(
    routerId: string,
    interfaceId: string,
    input: CreateRouterInterfaceIpv4AddressBody,
    actorId: string,
  ): Promise<RouterInterfaceIpv4AddressDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const manager = qr.manager;
        await this.lockIpv4Catalog(manager, tenantId);
        const router = await manager.findOne(NetworkRouter, { where: { id: routerId, tenantId } });
        if (!router) throw this.resourceNotFound();
        await this.authorize(actorId, router, AccessPermissionKey.NETWORK_CATALOG_MANAGE);
        const snapshot = await manager.findOne(NetworkRouterInterface, {
          where: { id: interfaceId, routerId, tenantId },
        });
        if (!snapshot) throw this.resourceNotFound();
        const addressFacts = await this.readAddressFacts(manager, input.addressWithPrefix);
        if (!addressFacts?.usable) throw this.addressNotUsable();
        const pools = await this.poolIdsContainingHost(manager, tenantId, addressFacts.host);
        await this.ipamService.lockIpv4Pools(manager, pools);
        const lockedRouter = await manager.findOne(NetworkRouter, {
          where: { id: routerId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        const iface = await manager.findOne(NetworkRouterInterface, {
          where: { id: interfaceId, routerId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedRouter || !iface) throw this.resourceNotFound();
        if (iface.status !== 'ACTIVE' || lockedRouter.status !== 'ACTIVE') {
          throw new ConflictException({ code: 'INTERFACE_NOT_AVAILABLE' });
        }
        await this.assertNoLiveAssignment(manager, tenantId, addressFacts.host);
        if (this.ipProtectionStatus !== 'ACTIVE') throw this.ipProtectionPending();
        const saved = await manager.save(
          NetworkRouterInterfaceIpv4Address,
          manager.create(NetworkRouterInterfaceIpv4Address, {
            tenantId,
            routerId,
            interfaceId,
            address: input.addressWithPrefix,
            notes: null,
            createdBy: actorId,
            version: 1,
          }),
        );
        await this.auditAddress(manager, tenantId, schemaName, actorId, saved, ['address']);
        return this.toAddressDto(saved);
      });
    } catch (error) {
      if (this.isUniqueViolation(error, ADDRESS_HOST_CONSTRAINT)) {
        throw new ConflictException({ code: 'INTERFACE_ADDRESS_DUPLICATED' });
      }
      throw error;
    }
  }

  async updateInterfaceIpv4Address(
    routerId: string,
    interfaceId: string,
    addressId: string,
    input: UpdateRouterInterfaceIpv4AddressBody,
    actorId: string,
  ): Promise<RouterInterfaceIpv4AddressDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      await this.lockIpv4Catalog(manager, tenantId);
      const snapshot = await manager.findOne(NetworkRouterInterfaceIpv4Address, {
        where: { id: addressId, tenantId, routerId, interfaceId },
      });
      if (!snapshot) throw this.resourceNotFound();
      const pools = await this.poolIdsContainingHost(manager, tenantId, snapshot.hostAddress);
      await this.ipamService.lockIpv4Pools(manager, pools);
      const router = await manager.findOne(NetworkRouter, {
        where: { id: routerId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      const iface = await manager.findOne(NetworkRouterInterface, {
        where: { id: interfaceId, routerId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!router || !iface) throw this.resourceNotFound();
      await this.authorize(actorId, router, AccessPermissionKey.NETWORK_CATALOG_MANAGE);
      const row = await manager.findOne(NetworkRouterInterfaceIpv4Address, {
        where: { id: addressId, tenantId, routerId, interfaceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw this.resourceNotFound();
      this.assertVersion(row.version, input.version);
      if (input.notes !== undefined) row.notes = input.notes;
      row.version += 1;
      const saved = await manager.save(NetworkRouterInterfaceIpv4Address, row);
      await this.auditAddress(manager, tenantId, schemaName, actorId, saved, ['notes']);
      return this.toAddressDto(saved);
    });
  }

  async correctInterfaceIpv4Address(
    routerId: string,
    interfaceId: string,
    addressId: string,
    input: CorrectRouterInterfaceIpv4AddressBody,
    actorId: string,
  ): Promise<CorrectRouterInterfaceIpv4AddressResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const manager = qr.manager;
        await this.lockIpv4Catalog(manager, tenantId);
        const snapshot = await manager.findOne(NetworkRouterInterfaceIpv4Address, {
          where: { id: addressId, tenantId, routerId, interfaceId },
        });
        if (!snapshot) throw this.resourceNotFound();
        const newFacts = await this.readAddressFacts(manager, input.newAddress);
        if (!newFacts?.usable) throw this.addressNotUsable();
        const pools = await this.poolIdsContainingHost(manager, tenantId, snapshot.hostAddress);
        pools.push(...(await this.poolIdsContainingHost(manager, tenantId, newFacts.host)));
        await this.ipamService.lockIpv4Pools(manager, pools);
        const router = await manager.findOne(NetworkRouter, {
          where: { id: routerId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        const iface = await manager.findOne(NetworkRouterInterface, {
          where: { id: interfaceId, routerId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!router || !iface) throw this.resourceNotFound();
        await this.authorize(actorId, router, AccessPermissionKey.NETWORK_CATALOG_MANAGE);
        const row = await manager.findOne(NetworkRouterInterfaceIpv4Address, {
          where: { id: addressId, tenantId, routerId, interfaceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!row) throw this.resourceNotFound();
        this.assertVersion(row.version, input.version);
        if (iface.status !== 'ACTIVE')
          throw new ConflictException({ code: 'INTERFACE_NOT_AVAILABLE' });
        const previousHost = row.hostAddress.replace(/\/\d+$/u, '');
        if (previousHost !== newFacts.host && input.confirmReleasedHost !== true) {
          throw new BadRequestException({ code: 'ADDRESS_RELEASE_CONFIRMATION_REQUIRED' });
        }
        await this.assertNoLiveAssignment(manager, tenantId, row.hostAddress);
        await this.assertNoLiveAssignment(manager, tenantId, newFacts.host);
        const gatewayUse = (await manager.query(
          `SELECT EXISTS (
             SELECT 1 FROM ipv4_networks
              WHERE tenant_id = $1
                AND set_masklen(gateway, 32) = set_masklen($2::inet, 32)
           ) AS exists`,
          [tenantId, row.hostAddress],
        )) as Array<{ exists: boolean }>;
        if (gatewayUse[0]?.exists) {
          throw new ConflictException({ code: 'INTERFACE_ADDRESS_IS_GATEWAY' });
        }
        if (this.ipProtectionStatus !== 'ACTIVE') throw this.ipProtectionPending();
        row.address = input.newAddress;
        row.version += 1;
        const saved = await manager.save(NetworkRouterInterfaceIpv4Address, row);
        await this.auditAddress(manager, tenantId, schemaName, actorId, saved, ['address']);
        return {
          address: this.toAddressDto(saved),
          releasedHost: previousHost === newFacts.host ? null : previousHost,
        };
      });
    } catch (error) {
      if (this.isUniqueViolation(error, ADDRESS_HOST_CONSTRAINT)) {
        throw new ConflictException({ code: 'INTERFACE_ADDRESS_DUPLICATED' });
      }
      throw error;
    }
  }

  private async toInterfaceDtoWithCounts(
    manager: EntityManager,
    tenantId: string,
    item: NetworkRouterInterface,
  ): Promise<RouterInterfaceDto> {
    const rows = (await manager.query(
      `SELECT COUNT(DISTINCT address.id)::integer AS ipv4_address_count,
              COUNT(DISTINCT network.id)::integer AS network_count
         FROM network_router_interfaces interface
         LEFT JOIN network_router_interface_ipv4_addresses address
           ON address.tenant_id = interface.tenant_id
          AND address.router_id = interface.router_id
          AND address.interface_id = interface.id
         LEFT JOIN ipv4_networks network
           ON network.tenant_id = interface.tenant_id
          AND network.router_id = interface.router_id
          AND network.interface_id = interface.id
        WHERE interface.tenant_id = $1 AND interface.id = $2`,
      [tenantId, item.id],
    )) as Array<{ ipv4_address_count: number | string; network_count: number | string }>;
    return this.toInterfaceDto(item, rows[0]);
  }

  private toInterfaceDto(
    item: NetworkRouterInterface,
    counts?: { ipv4_address_count: number | string; network_count: number | string },
  ): RouterInterfaceDto {
    return {
      id: item.id,
      routerId: item.routerId,
      name: item.name,
      kind: item.kind as RouterInterfaceDto['kind'],
      notes: item.notes,
      status: item.status as CatalogStatus,
      ipv4AddressCount: Number(counts?.ipv4_address_count ?? 0),
      networkCount: Number(counts?.network_count ?? 0),
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toAddressDto(item: NetworkRouterInterfaceIpv4Address): RouterInterfaceIpv4AddressDto {
    const [address, prefix] = item.address.split('/');
    const prefixLength = Number(prefix ?? 32);
    const host = item.hostAddress.replace(/\/\d+$/u, '');
    return {
      id: item.id,
      routerId: item.routerId,
      interfaceId: item.interfaceId,
      addressWithPrefix: item.address,
      host,
      prefixLength: Number.isInteger(prefixLength) ? prefixLength : 32,
      notes: item.notes,
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async poolIdsForInterface(
    manager: EntityManager,
    tenantId: string,
    routerId: string,
    interfaceId: string,
  ): Promise<string[]> {
    const rows = (await manager.query(
      `SELECT id FROM ipv4_networks
        WHERE tenant_id = $1 AND router_id = $2 AND interface_id = $3
        ORDER BY id`,
      [tenantId, routerId, interfaceId],
    )) as PoolRow[];
    return rows.map((row) => row.id);
  }

  private async poolIdsContainingHost(
    manager: EntityManager,
    tenantId: string,
    host: string,
  ): Promise<string[]> {
    const rows = (await manager.query(
      `SELECT id FROM ipv4_networks
        WHERE tenant_id = $1 AND cidr >>= $2::inet
        ORDER BY id`,
      [tenantId, host],
    )) as PoolRow[];
    return rows.map((row) => row.id);
  }

  private async readAddressFacts(manager: EntityManager, address: string): Promise<HostRow | null> {
    const rows = (await manager.query(
      `SELECT host($1::inet) AS host,
              masklen($1::inet)::integer AS prefix_length,
              family($1::inet)::integer AS family,
              (family($1::inet) = 4
                AND host($1::inet) <> '0.0.0.0'
                AND host($1::inet) <> '255.255.255.255'
                AND NOT ($1::inet << '224.0.0.0/4'::cidr)
                AND (masklen($1::inet) > 30 OR (
                  host($1::inet) <> host(network($1::inet))
                  AND host($1::inet) <> host(broadcast($1::inet))
                ))) AS usable`,
      [address],
    )) as HostRow[];
    return rows[0] ?? null;
  }

  private async assertNoLiveAssignment(
    manager: EntityManager,
    tenantId: string,
    host: string,
  ): Promise<void> {
    const rows = (await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM ip_assignments
          WHERE tenant_id = $1 AND ip = set_masklen($2::inet, 32)
            AND status IN ('RESERVED', 'ACTIVE')
       ) AS exists`,
      [tenantId, host],
    )) as Array<{ exists: boolean }>;
    if (rows[0]?.exists) throw new ConflictException({ code: 'IP_IN_USE' });
  }

  private async toRouterDto(
    manager: EntityManager,
    tenantId: string,
    router: NetworkRouter,
  ): Promise<RouterDto> {
    const rows = (await manager.query(
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
      networkCount: Number(rows[0]?.count ?? 0),
      interfaceCount: Number(
        (
          (await manager.query(
            'SELECT COUNT(*)::integer AS count FROM network_router_interfaces WHERE tenant_id = $1 AND router_id = $2',
            [tenantId, router.id],
          )) as CountRow[]
        )[0]?.count ?? 0,
      ),
      legacyLanInterfaceId: router.legacyLanInterfaceId,
      version: router.version,
      createdAt: router.createdAt.toISOString(),
      updatedAt: router.updatedAt.toISOString(),
    };
  }

  private async auditInterface(
    manager: EntityManager,
    tenantId: string,
    schemaName: string,
    actorId: string,
    row: NetworkRouterInterface,
    changedFields: string[],
  ): Promise<void> {
    await this.auditService.logWithin(
      {
        tenantId,
        schemaName,
        userId: actorId,
        action: AuditAction.UPDATE,
        entityType: 'NetworkRouterInterface',
        entityId: row.id,
        newValue: { status: row.status, kind: row.kind, changedFields },
      },
      manager,
    );
  }

  private async auditAddress(
    manager: EntityManager,
    tenantId: string,
    schemaName: string,
    actorId: string,
    row: NetworkRouterInterfaceIpv4Address,
    changedFields: string[],
  ): Promise<void> {
    await this.auditService.logWithin(
      {
        tenantId,
        schemaName,
        userId: actorId,
        action: AuditAction.UPDATE,
        entityType: 'NetworkRouterInterfaceIpv4Address',
        entityId: row.id,
        newValue: { changedFields },
      },
      manager,
    );
  }

  private async authorize(
    actorId: string,
    router: NetworkRouter,
    permission: AccessPermissionKey,
  ): Promise<void> {
    await this.authorization.requireSiteOrTenantWideAction(
      actorId,
      router.organizationSiteId,
      permission,
    );
  }

  private async lockIpv4Catalog(manager: EntityManager, tenantId: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `ipv4-catalog:${tenantId}`,
    ]);
  }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected) throw new ConflictException({ code: 'VERSION_CONFLICT' });
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as PostgresError;
    const driverError = candidate.driverError ?? candidate;
    return driverError.code === '23505' && driverError.constraint === constraint;
  }

  private resourceNotFound(): NotFoundException {
    return new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });
  }

  private catalogReferenceInactive(): ConflictException {
    return new ConflictException({ code: 'CATALOG_REFERENCE_INACTIVE' });
  }

  private legacyLanNotAvailable(): ConflictException {
    return new ConflictException({ code: 'LEGACY_LAN_NOT_AVAILABLE' });
  }

  private legacyLanAlreadyConverted(): ConflictException {
    return new ConflictException({ code: 'LEGACY_LAN_ALREADY_CONVERTED' });
  }

  private addressNotUsable(): BadRequestException {
    return new BadRequestException({ code: 'ADDRESS_NOT_USABLE' });
  }

  private ipProtectionPending(): ConflictException {
    return new ConflictException({
      code: 'IP_PROTECTION_PENDING',
      message:
        'El registro de direcciones locales se habilitará después de validar la protección IPAM.',
    });
  }
}
