import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';

export interface ReserveIpInput {
  networkId: string;
  provisioningId: string;
  requestedIp?: string;
}

export interface IpamOccupancy {
  total: number;
  reserved: number;
  active: number;
  free: number;
}

interface ActiveNetworkRow {
  id: string;
  router_id?: string;
  interface_id?: string | null;
}

interface CatalogStatusRow {
  status: string;
}

interface InterfaceStatusRow {
  router_id: string;
  status: string;
}

interface CandidateIpRow {
  ip: string;
}

interface ManualIpValidationRow {
  is_outside_range: boolean;
  is_gateway: boolean;
  is_excluded: boolean;
  is_protected: boolean;
  is_in_use: boolean;
}

interface OccupancyRow {
  total: number | string;
  reserved: number | string;
  active: number | string;
  free: number | string;
}

interface IpamOccupancyRow extends OccupancyRow {
  has_protection_conflict: boolean;
}

interface PostgresConstraintError {
  code?: string;
  constraint?: string;
  driverError?: PostgresConstraintError;
}

const IP_ASSIGNMENTS_LIVE_CONSTRAINT = 'uq_ip_assignments_live';

@Injectable()
export class IpamService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Reserva una IP dentro de la transacción del comando que creó el servicio.
   * El advisory lock serializa asignaciones de una red y el índice parcial es
   * la última defensa ante escritores que no usen este servicio.
   */
  async reserveIp(manager: EntityManager, input: ReserveIpInput): Promise<string> {
    const { tenantId } = TenantContext.getOrThrow();

    await this.lockIpv4Pools(manager, [input.networkId]);
    await this.assertActiveNetwork(manager, tenantId, input.networkId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ip = input.requestedIp
        ? await this.validateRequestedIp(manager, tenantId, input.networkId, input.requestedIp)
        : await this.findNextAvailableIp(manager, tenantId, input.networkId);

      if (!ip) {
        throw new ConflictException({
          code: 'NETWORK_POOL_EXHAUSTED',
          message: 'La red no tiene direcciones IPv4 disponibles.',
        });
      }

      await manager.query('SAVEPOINT ipam_insert_attempt');
      try {
        const insertedRows = (await manager.query(
          `INSERT INTO ip_assignments
            (tenant_id, ipv4_network_id, ip, service_provisioning_id, status)
           VALUES ($1, $2, $3::inet, $4, 'RESERVED')
           RETURNING host(ip) AS ip`,
          [tenantId, input.networkId, ip, input.provisioningId],
        )) as CandidateIpRow[];
        await manager.query('RELEASE SAVEPOINT ipam_insert_attempt');
        return insertedRows[0]?.ip ?? ip;
      } catch (error) {
        await manager.query('ROLLBACK TO SAVEPOINT ipam_insert_attempt');
        await manager.query('RELEASE SAVEPOINT ipam_insert_attempt');

        if (!this.isLiveIpUniqueViolation(error)) {
          throw error;
        }
        if (attempt === 1) {
          throw this.ipInUseException();
        }
      }
    }

    throw this.ipInUseException();
  }

  async getOccupancy(networkId: string, manager?: EntityManager): Promise<IpamOccupancy> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    if (manager) {
      return this.readOccupancy(manager, tenantId, networkId);
    }

    return runInTenantSchema(this.dataSource, schemaName, (qr) =>
      this.readOccupancy(qr.manager, tenantId, networkId),
    );
  }

  /** Serializa las escrituras del IPAM en L2 y siempre toma pools por UUID ascendente. */
  async lockIpv4Pools(manager: EntityManager, networkIds: readonly string[]): Promise<void> {
    for (const networkId of [...new Set(networkIds)].sort()) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `ipv4:${networkId}`,
      ]);
    }
  }

  /** Revalida router, pool e asociación bajo L2 antes de reservar o reemitir una instrucción. */
  async assertActiveNetwork(
    manager: EntityManager,
    tenantId: string,
    networkId: string,
  ): Promise<void> {
    const networkRows = (await manager.query(
      `SELECT id, router_id, interface_id
         FROM ipv4_networks
        WHERE id = $1 AND tenant_id = $2 AND status = 'ACTIVE'
        FOR SHARE`,
      [networkId, tenantId],
    )) as ActiveNetworkRow[];
    const network = networkRows[0];
    if (!network) throw this.networkNotAvailable();

    const routerRows = (await manager.query(
      `SELECT status FROM network_routers WHERE id = $1 AND tenant_id = $2 FOR SHARE`,
      [network.router_id, tenantId],
    )) as CatalogStatusRow[];
    if (routerRows[0]?.status !== 'ACTIVE') throw this.networkNotAvailable();

    if (!network.interface_id) return;
    const interfaceRows = (await manager.query(
      `SELECT router_id, status
         FROM network_router_interfaces
        WHERE id = $1 AND tenant_id = $2
        FOR SHARE`,
      [network.interface_id, tenantId],
    )) as InterfaceStatusRow[];
    if (
      interfaceRows[0]?.status !== 'ACTIVE' ||
      interfaceRows[0]?.router_id !== network.router_id
    ) {
      throw this.networkNotAvailable();
    }
  }

  async assertAssignmentNotLocallyProtected(
    manager: EntityManager,
    tenantId: string,
    ip: string,
  ): Promise<void> {
    const rows = (await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM network_router_interface_ipv4_addresses
          WHERE tenant_id = $1 AND host_address = set_masklen($2::inet, 32)
       ) AS protected`,
      [tenantId, ip],
    )) as Array<{ protected: boolean }>;
    if (rows[0]?.protected) {
      throw new ConflictException({
        code: 'IP_PROTECTED_BY_INFRASTRUCTURE',
        message: 'La dirección está protegida por infraestructura de la empresa.',
      });
    }
  }

  private async validateRequestedIp(
    manager: EntityManager,
    tenantId: string,
    networkId: string,
    requestedIp: string,
  ): Promise<string> {
    const rows = (await manager.query(
      `SELECT
          ($3::inet < n.assignable_from OR $3::inet > n.assignable_to
            OR host($3::inet) = host(network(n.cidr))
            OR host($3::inet) = host(broadcast(n.cidr))) AS is_outside_range,
          (set_masklen($3::inet, 32) = set_masklen(n.gateway, 32)) AS is_gateway,
          EXISTS (
            SELECT 1 FROM unnest(n.excluded_ips) AS excluded(ip)
             WHERE set_masklen(excluded.ip, 32) = set_masklen($3::inet, 32)
          ) AS is_excluded,
          EXISTS (
            SELECT 1
              FROM network_router_interface_ipv4_addresses local_address
             WHERE local_address.tenant_id = n.tenant_id
               AND local_address.host_address = set_masklen($3::inet, 32)
               AND local_address.host_address >= set_masklen(n.assignable_from, 32)
               AND local_address.host_address <= set_masklen(n.assignable_to, 32)
          ) AS is_protected,
          EXISTS (
            SELECT 1 FROM ip_assignments a
             WHERE a.tenant_id = n.tenant_id
               AND a.ip = $3::inet
               AND a.status IN ('RESERVED', 'ACTIVE')
          ) AS is_in_use
         FROM ipv4_networks n
        WHERE n.id = $1 AND n.tenant_id = $2 AND n.status = 'ACTIVE'`,
      [networkId, tenantId, requestedIp],
    )) as ManualIpValidationRow[];

    const validation = rows[0];
    if (!validation || validation.is_outside_range) {
      throw new ConflictException({
        code: 'IP_OUTSIDE_RANGE',
        message: 'La dirección no pertenece al rango asignable de la red.',
      });
    }
    if (validation.is_gateway) {
      throw new ConflictException({
        code: 'IP_IS_GATEWAY',
        message: 'La dirección configurada como puerta de enlace no se puede asignar.',
      });
    }
    if (validation.is_excluded) {
      throw new ConflictException({
        code: 'IP_EXCLUDED',
        message: 'La dirección está excluida del rango asignable.',
      });
    }
    if (validation.is_protected) {
      throw new ConflictException({
        code: 'IP_PROTECTED_BY_INFRASTRUCTURE',
        message: 'La dirección está protegida por infraestructura de la empresa.',
      });
    }
    if (validation.is_in_use) {
      throw this.ipInUseException();
    }

    return requestedIp;
  }

  private async findNextAvailableIp(
    manager: EntityManager,
    tenantId: string,
    networkId: string,
  ): Promise<string | null> {
    const rows = (await manager.query(
      `SELECT host(n.assignable_from + candidate.ip_offset)::text AS ip
         FROM ipv4_networks n
         CROSS JOIN LATERAL generate_series(
           0,
           (n.assignable_to - n.assignable_from)
         ) AS candidate(ip_offset)
        WHERE n.id = $1
          AND n.tenant_id = $2
          AND n.status = 'ACTIVE'
          AND set_masklen((n.assignable_from + candidate.ip_offset)::inet, 32)
                <> set_masklen(n.gateway, 32)
          AND host((n.assignable_from + candidate.ip_offset)::inet) <> host(network(n.cidr))
          AND host((n.assignable_from + candidate.ip_offset)::inet) <> host(broadcast(n.cidr))
          AND NOT EXISTS (
            SELECT 1 FROM unnest(n.excluded_ips) AS excluded(ip)
             WHERE set_masklen(excluded.ip, 32) = set_masklen(
               (n.assignable_from + candidate.ip_offset)::inet, 32
             )
          )
          AND NOT EXISTS (
            SELECT 1
              FROM network_router_interface_ipv4_addresses local_address
             WHERE local_address.tenant_id = n.tenant_id
               AND local_address.host_address = set_masklen(
                 (n.assignable_from + candidate.ip_offset)::inet, 32
               )
               AND local_address.host_address >= set_masklen(n.assignable_from, 32)
               AND local_address.host_address <= set_masklen(n.assignable_to, 32)
          )
          AND NOT EXISTS (
            SELECT 1 FROM ip_assignments a
             WHERE a.tenant_id = n.tenant_id
               AND a.ip = (n.assignable_from + candidate.ip_offset)::inet
               AND a.status IN ('RESERVED', 'ACTIVE')
          )
        ORDER BY candidate.ip_offset
        LIMIT 1`,
      [networkId, tenantId],
    )) as CandidateIpRow[];

    return rows[0]?.ip ?? null;
  }

  private async readOccupancy(
    manager: EntityManager,
    tenantId: string,
    networkId: string,
  ): Promise<IpamOccupancy> {
    const rows = (await manager.query(
      `WITH eligible_ips AS (
         SELECT (n.assignable_from + candidate.ip_offset)::inet AS ip
           FROM ipv4_networks n
           CROSS JOIN LATERAL generate_series(
             0,
             (n.assignable_to - n.assignable_from)
           ) AS candidate(ip_offset)
          WHERE n.id = $1
            AND n.tenant_id = $2
            AND set_masklen((n.assignable_from + candidate.ip_offset)::inet, 32)
                  <> set_masklen(n.gateway, 32)
            AND host((n.assignable_from + candidate.ip_offset)::inet) <> host(network(n.cidr))
            AND host((n.assignable_from + candidate.ip_offset)::inet) <> host(broadcast(n.cidr))
            AND NOT EXISTS (
              SELECT 1 FROM unnest(n.excluded_ips) AS excluded(ip)
               WHERE set_masklen(excluded.ip, 32) = set_masklen(
                 (n.assignable_from + candidate.ip_offset)::inet, 32
               )
            )
            AND NOT EXISTS (
              SELECT 1
                FROM network_router_interface_ipv4_addresses local_address
               WHERE local_address.tenant_id = n.tenant_id
                 AND local_address.host_address = set_masklen(
                   (n.assignable_from + candidate.ip_offset)::inet, 32
                 )
                 AND local_address.host_address >= set_masklen(n.assignable_from, 32)
                 AND local_address.host_address <= set_masklen(n.assignable_to, 32)
            )
       ), pool AS (
         SELECT COUNT(*)::integer AS total FROM eligible_ips
       ), usage AS (
         SELECT
           COUNT(*) FILTER (WHERE a.status = 'RESERVED')::integer AS reserved,
           COUNT(*) FILTER (WHERE a.status = 'ACTIVE')::integer AS active
         FROM ip_assignments a
         WHERE a.tenant_id = $2
           AND a.ipv4_network_id = $1
       ), protection_conflict AS (
         SELECT EXISTS (
           SELECT 1
             FROM ip_assignments a
             JOIN network_router_interface_ipv4_addresses local_address
               ON local_address.tenant_id = a.tenant_id
              AND local_address.host_address = set_masklen(a.ip, 32)
            WHERE a.tenant_id = $2
              AND a.ipv4_network_id = $1
              AND a.status IN ('RESERVED', 'ACTIVE')
         ) AS has_conflict
       )
       SELECT pool.total,
              usage.reserved,
              usage.active,
              GREATEST(pool.total - usage.reserved - usage.active, 0)::integer AS free,
              protection_conflict.has_conflict AS has_protection_conflict
         FROM pool CROSS JOIN usage CROSS JOIN protection_conflict`,
      [networkId, tenantId],
    )) as IpamOccupancyRow[];

    const row = rows[0];
    if (row?.has_protection_conflict) {
      throw new ConflictException({
        code: 'IP_PROTECTED_BY_INFRASTRUCTURE',
        message: 'La ocupación presenta un conflicto con infraestructura registrada.',
      });
    }
    return {
      total: Number(row?.total ?? 0),
      reserved: Number(row?.reserved ?? 0),
      active: Number(row?.active ?? 0),
      free: Number(row?.free ?? 0),
    };
  }

  private isLiveIpUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as PostgresConstraintError;
    const driverError = candidate.driverError ?? candidate;
    return (
      driverError.code === '23505' && driverError.constraint === IP_ASSIGNMENTS_LIVE_CONSTRAINT
    );
  }

  private ipInUseException(): ConflictException {
    return new ConflictException({
      code: 'IP_IN_USE',
      message: 'La dirección ya está asignada a otro servicio.',
    });
  }

  private networkNotAvailable(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'NETWORK_NOT_IN_ROUTER',
      message: 'No se encontró una red IPv4 activa para la operación.',
    });
  }
}
