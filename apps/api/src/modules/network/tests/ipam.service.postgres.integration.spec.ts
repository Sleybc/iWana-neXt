import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { IpamService } from '../ipam.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('IpamService — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: IpamService;
  const tenantId = randomUUID();
  const schemaName = `tenant_mod13_ipam_${randomUUID().replaceAll('-', '')}`;
  const secondTenantId = randomUUID();
  const secondSchemaName = `tenant_mod13_ipam_${randomUUID().replaceAll('-', '')}`;
  const networkId = randomUUID();
  const routerId = randomUUID();
  const inactiveRouterId = randomUUID();
  const inactiveInterfaceId = randomUUID();
  const context = { tenantId, schemaName, tenantSlug: 'mod13-ipam-it' };

  const run = <T>(operation: () => Promise<T>) => TenantContext.run(context, operation);

  async function createIpamSchema(schema: string, schemaTenantId: string, schemaRouterId: string) {
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.query(`
      CREATE TABLE "${schema}".network_routers (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        status varchar(16) NOT NULL,
        UNIQUE (tenant_id, id)
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schema}".network_router_interfaces (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL,
        status varchar(16) NOT NULL,
        created_by uuid NOT NULL,
        UNIQUE (tenant_id, router_id, id)
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schema}".network_router_interface_ipv4_addresses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL,
        interface_id uuid NOT NULL,
        address inet NOT NULL,
        created_by uuid NOT NULL,
        host_address inet GENERATED ALWAYS AS (set_masklen(address, 32)) STORED
      )
    `);
    await dataSource.query(`
      CREATE INDEX idx_interface_address_host
        ON "${schema}".network_router_interface_ipv4_addresses (tenant_id, host_address)
    `);
    await dataSource.query(`
      CREATE TABLE "${schema}".ipv4_networks (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL,
        interface_id uuid NULL,
        cidr cidr NOT NULL,
        gateway inet NOT NULL,
        assignable_from inet NOT NULL,
        assignable_to inet NOT NULL,
        excluded_ips inet[] NOT NULL DEFAULT '{}',
        status varchar(16) NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schema}".ip_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        ipv4_network_id uuid NOT NULL,
        ip inet NOT NULL,
        service_provisioning_id uuid NOT NULL,
        status varchar(16) NOT NULL,
        released_at timestamptz NULL,
        release_reason varchar(32) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE UNIQUE INDEX uq_ip_assignments_live
        ON "${schema}".ip_assignments (tenant_id, ip)
        WHERE status IN ('RESERVED', 'ACTIVE')
    `);
    await dataSource.query(
      `INSERT INTO "${schema}".network_routers (id, tenant_id, status) VALUES ($1, $2, 'ACTIVE')`,
      [schemaRouterId, schemaTenantId],
    );
  }

  async function createNetwork(
    input: {
      id?: string;
      cidr?: string;
      gateway?: string;
      assignableFrom?: string;
      assignableTo?: string;
      excludedIps?: string[];
    } = {},
  ): Promise<string> {
    const id = input.id ?? randomUUID();
    await run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO ipv4_networks
            (id, tenant_id, router_id, cidr, gateway, assignable_from, assignable_to, excluded_ips, status)
           VALUES ($1, $2, $3, $4::cidr, $5::inet, $6::inet, $7::inet, $8::inet[], 'ACTIVE')`,
          [
            id,
            tenantId,
            routerId,
            input.cidr ?? '10.31.0.0/24',
            input.gateway ?? '10.31.0.1',
            input.assignableFrom ?? '10.31.0.10',
            input.assignableTo ?? '10.31.0.250',
            input.excludedIps ?? [],
          ],
        );
      }),
    );
    return id;
  }

  async function reserve(
    targetNetworkId: string,
    provisioningId = randomUUID(),
    requestedIp?: string,
  ): Promise<string> {
    return run(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        service.reserveIp(qr.manager, {
          networkId: targetNetworkId,
          provisioningId,
          ...(requestedIp ? { requestedIp } : {}),
        }),
      ),
    );
  }

  async function addLocalAddress(host: string, prefix = 32): Promise<void> {
    await run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const otherRouterExists = (await qr.query(
          `SELECT 1 FROM network_routers WHERE id = $1 AND tenant_id = $2`,
          [inactiveRouterId, tenantId],
        )) as unknown[];
        if (otherRouterExists.length === 0) {
          await qr.query(
            `INSERT INTO network_routers (id, tenant_id, status) VALUES ($1, $2, 'INACTIVE')`,
            [inactiveRouterId, tenantId],
          );
          await qr.query(
            `INSERT INTO network_router_interfaces (id, tenant_id, router_id, status, created_by)
             VALUES ($1, $2, $3, 'INACTIVE', $4)`,
            [inactiveInterfaceId, tenantId, inactiveRouterId, tenantId],
          );
        }
        await qr.query(
          `INSERT INTO network_router_interface_ipv4_addresses
            (tenant_id, router_id, interface_id, address, created_by)
           VALUES ($1, $2, $3, $4::inet, $5)`,
          [tenantId, inactiveRouterId, inactiveInterfaceId, `${host}/${prefix}`, tenantId],
        );
      }),
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 40, min: 1 },
    });
    await dataSource.initialize();
    await createIpamSchema(schemaName, tenantId, routerId);
    await createIpamSchema(secondSchemaName, secondTenantId, randomUUID());
    await createNetwork({ id: networkId });
    service = new IpamService(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query(`DROP SCHEMA IF EXISTS "${secondSchemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('asigna desde el inicio del rango y omite gateway, red, broadcast y exclusiones', async () => {
    const id = await createNetwork({
      cidr: '10.32.0.0/24',
      gateway: '10.32.0.1',
      assignableFrom: '10.32.0.0',
      assignableTo: '10.32.0.255',
      excludedIps: ['10.32.0.2'],
    });

    await expect(reserve(id)).resolves.toBe('10.32.0.3');
  });

  it('responde NETWORK_POOL_EXHAUSTED cuando no quedan direcciones asignables', async () => {
    const id = await createNetwork({
      cidr: '10.33.0.0/24',
      gateway: '10.33.0.1',
      assignableFrom: '10.33.0.10',
      assignableTo: '10.33.0.10',
    });

    await expect(reserve(id)).resolves.toBe('10.33.0.10');
    await expect(reserve(id)).rejects.toMatchObject({
      response: { code: 'NETWORK_POOL_EXHAUSTED' },
    });
  });

  it('calcula la ocupación sobre direcciones asignables, sin red, gateway, broadcast ni exclusiones', async () => {
    const id = await createNetwork({
      cidr: '10.38.0.0/24',
      gateway: '10.38.0.1',
      assignableFrom: '10.38.0.0',
      assignableTo: '10.38.0.255',
      excludedIps: ['10.38.0.2'],
    });
    const readOccupancy = () =>
      run(() =>
        runInTenantSchema(dataSource, schemaName, (qr) => service.getOccupancy(id, qr.manager)),
      );

    await expect(readOccupancy()).resolves.toEqual({
      total: 252,
      reserved: 0,
      active: 0,
      free: 252,
    });

    await reserve(id, randomUUID(), '10.38.0.3');

    await expect(readOccupancy()).resolves.toEqual({
      total: 252,
      reserved: 1,
      active: 0,
      free: 251,
    });
  });

  it.each([
    ['fuera del rango', '10.34.0.9', 'IP_OUTSIDE_RANGE'],
    ['gateway', '10.34.0.10', 'IP_IS_GATEWAY'],
    ['excluida', '10.34.0.11', 'IP_EXCLUDED'],
  ])('rechaza la IP manual %s con su código específico', async (_label, ip, code) => {
    const id = await createNetwork({
      cidr: '10.34.0.0/24',
      gateway: '10.34.0.10',
      assignableFrom: '10.34.0.10',
      assignableTo: '10.34.0.20',
      excludedIps: ['10.34.0.11'],
    });

    await expect(reserve(id, randomUUID(), ip)).rejects.toMatchObject({
      response: { code },
    });
  });

  it.each([
    ['dirección de red', '10.37.0.0'],
    ['broadcast', '10.37.0.255'],
  ])('rechaza la IP manual %s con IP_OUTSIDE_RANGE', async (_label, ip) => {
    const id = await createNetwork({
      cidr: '10.37.0.0/24',
      gateway: '10.37.0.1',
      assignableFrom: '10.37.0.0',
      assignableTo: '10.37.0.255',
    });

    await expect(reserve(id, randomUUID(), ip)).rejects.toMatchObject({
      response: { code: 'IP_OUTSIDE_RANGE' },
    });
  });

  it('rechaza una IP manual ocupada con IP_IN_USE', async () => {
    const id = await createNetwork({
      cidr: '10.35.0.0/24',
      gateway: '10.35.0.1',
      assignableFrom: '10.35.0.10',
      assignableTo: '10.35.0.20',
    });
    await reserve(id, randomUUID(), '10.35.0.12');

    await expect(reserve(id, randomUUID(), '10.35.0.12')).rejects.toMatchObject({
      response: { code: 'IP_IN_USE' },
    });
  });

  it('protege por host una IP local de otro router/inactivo en manual, automático y ocupación', async () => {
    const id = await createNetwork({
      cidr: '10.39.0.0/24',
      gateway: '10.39.0.1',
      assignableFrom: '10.39.0.10',
      assignableTo: '10.39.0.20',
    });
    await addLocalAddress('10.39.0.12', 24);
    await addLocalAddress('10.39.0.12', 32);

    await expect(reserve(id, randomUUID(), '10.39.0.12')).rejects.toMatchObject({
      response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' },
    });
    await expect(reserve(id)).resolves.toBe('10.39.0.10');

    await expect(
      run(() =>
        runInTenantSchema(dataSource, schemaName, (qr) => service.getOccupancy(id, qr.manager)),
      ),
    ).resolves.toEqual({ total: 10, reserved: 1, active: 0, free: 9 });
  });

  it('mantiene I-1 en cero y ejecuta el plan de ocupación local para un pool /16', async () => {
    const id = await createNetwork({
      cidr: '10.64.0.0/16',
      gateway: '10.64.0.1',
      assignableFrom: '10.64.0.0',
      assignableTo: '10.64.255.255',
    });
    await addLocalAddress('10.64.255.254', 24);

    const explainRows = (await run(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
           SELECT COUNT(*)::integer AS assignable_count
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
              )`,
          [id, tenantId],
        ),
      ),
    )) as Array<{ 'QUERY PLAN': Array<{ Plan: Record<string, unknown> }> }>;
    const explain = explainRows[0]?.['QUERY PLAN'];
    expect(explain).toBeDefined();
    expect(explain?.[0]?.Plan['Node Type']).toBe('Aggregate');

    await expect(reserve(id)).resolves.toBe('10.64.0.2');
    await expect(reserve(id, randomUUID(), '10.64.255.254')).rejects.toMatchObject({
      response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' },
    });

    const conflicts = (await run(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `SELECT COUNT(*)::integer AS count
             FROM ip_assignments assignment
             JOIN network_router_interface_ipv4_addresses local_address
               ON local_address.tenant_id = assignment.tenant_id
              AND local_address.host_address = set_masklen(assignment.ip, 32)
            WHERE assignment.tenant_id = $1
              AND assignment.ipv4_network_id = $2
              AND assignment.status IN ('RESERVED', 'ACTIVE')`,
          [tenantId, id],
        ),
      ),
    )) as Array<{ count: number }>;
    expect(Number(conflicts[0]?.count)).toBe(0);

    await expect(
      run(() =>
        runInTenantSchema(dataSource, schemaName, (qr) => service.getOccupancy(id, qr.manager)),
      ),
    ).resolves.toEqual({ total: 65_532, reserved: 1, active: 0, free: 65_531 });
  });

  it('normaliza por host gateways y exclusiones de filas legacy con máscara', async () => {
    const gatewayNetworkId = await createNetwork({
      cidr: '10.40.0.0/24',
      gateway: '10.40.0.10/24',
      assignableFrom: '10.40.0.10',
      assignableTo: '10.40.0.12',
    });
    const excludedNetworkId = await createNetwork({
      cidr: '10.41.0.0/24',
      gateway: '10.41.0.1',
      assignableFrom: '10.41.0.10',
      assignableTo: '10.41.0.12',
      excludedIps: ['10.41.0.11/24'],
    });

    await expect(reserve(gatewayNetworkId, randomUUID(), '10.40.0.10')).rejects.toMatchObject({
      response: { code: 'IP_IS_GATEWAY' },
    });
    await expect(reserve(gatewayNetworkId)).resolves.toBe('10.40.0.11');
    await expect(reserve(excludedNetworkId, randomUUID(), '10.41.0.11')).rejects.toMatchObject({
      response: { code: 'IP_EXCLUDED' },
    });
  });

  it('mantiene el mismo host independiente entre schemas de tenants distintos', async () => {
    const firstNetwork = await createNetwork({
      cidr: '10.42.0.0/24',
      gateway: '10.42.0.1',
      assignableFrom: '10.42.0.10',
      assignableTo: '10.42.0.20',
    });
    await addLocalAddress('10.42.0.12');
    await expect(reserve(firstNetwork, randomUUID(), '10.42.0.12')).rejects.toMatchObject({
      response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' },
    });

    await TenantContext.run(
      {
        tenantId: secondTenantId,
        schemaName: secondSchemaName,
        tenantSlug: 'mod13-ipam-tenant-two',
      },
      () =>
        runInTenantSchema(dataSource, secondSchemaName, async (qr) => {
          const secondRouter = randomUUID();
          const secondNetwork = randomUUID();
          await qr.query(
            `INSERT INTO network_routers (id, tenant_id, status) VALUES ($1, $2, 'ACTIVE')`,
            [secondRouter, secondTenantId],
          );
          await qr.query(
            `INSERT INTO ipv4_networks
              (id, tenant_id, router_id, cidr, gateway, assignable_from, assignable_to, status)
             VALUES ($1, $2, $3, '10.42.0.0/24', '10.42.0.1', '10.42.0.10', '10.42.0.20', 'ACTIVE')`,
            [secondNetwork, secondTenantId, secondRouter],
          );
          await expect(
            service.reserveIp(qr.manager, {
              networkId: secondNetwork,
              provisioningId: randomUUID(),
              requestedIp: '10.42.0.12',
            }),
          ).resolves.toBe('10.42.0.12');
        }),
    );
  });

  it('asigna 20 IP distintas ante 20 reservas concurrentes en la misma red', async () => {
    const id = await createNetwork({
      cidr: '10.36.0.0/24',
      gateway: '10.36.0.1',
      assignableFrom: '10.36.0.10',
      assignableTo: '10.36.0.250',
    });

    const assigned = await Promise.all(Array.from({ length: 20 }, () => reserve(id, randomUUID())));

    expect(assigned).toHaveLength(20);
    expect(new Set(assigned).size).toBe(20);
    expect(assigned.sort((left, right) => left.localeCompare(right))).toEqual(
      Array.from({ length: 20 }, (_, index) => `10.36.0.${index + 10}`),
    );
  });
});
