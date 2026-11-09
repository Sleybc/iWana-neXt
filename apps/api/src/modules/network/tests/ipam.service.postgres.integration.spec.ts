import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { IpamService } from '../ipam.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

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
  const context = { tenantId, schemaName, tenantSlug: 'mod13-ipam-it' };

  const run = <T>(operation: () => Promise<T>) => TenantContext.run(context, operation);

  type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

  async function insertRouter(
    qr: SqlRunner,
    id: string,
    routerTenantId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<void> {
    // Columnas obligatorias de network_routers en la cadena (160).
    await qr.query(
      `INSERT INTO network_routers
        (id, tenant_id, name, management_host, supported_control_methods, status, created_by)
       VALUES ($1, $2, $3, 'router.example.invalid', ARRAY['PCQ_ADDRESS_LIST'], $4, $2)`,
      [id, routerTenantId, `Router IPAM ${id.slice(0, 8)}`, status],
    );
  }

  async function createIpamSchema(schema: string, schemaTenantId: string, schemaRouterId: string) {
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        schemaTenantId,
        'MOD13 IPAM sintético',
        `mod13-ipam-${schemaTenantId.slice(0, 8)}`,
        schema,
        'mod13-ipam@example.invalid',
      ],
    );
    // El esquema lo crea la cadena de migraciones del tenant, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schema,
      `mod13-ipam-${schemaTenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await runInTenantSchema(dataSource, schema, (qr) =>
      insertRouter(qr, schemaRouterId, schemaTenantId, 'ACTIVE'),
    );
  }

  /**
   * ip_assignments.service_provisioning_id es FK NOT NULL a service_provisionings (161): cada
   * reserva necesita su provisión sintética, creada en la misma transacción para que una reserva
   * rechazada no deje filas.
   */
  async function insertProvisioning(
    qr: SqlRunner,
    provisioningId: string,
    provisioningTenantId: string,
    targetNetworkId: string,
  ): Promise<void> {
    await qr.query(
      `INSERT INTO service_provisionings
        (id, tenant_id, subscriber_id, execution_order_id, execution_order_number,
         router_id, ipv4_network_id, control_method, control_params, status)
       SELECT $1, $2, gen_random_uuid(), gen_random_uuid(), 'OTE-IPAM-IT', n.router_id, n.id,
              'PCQ_ADDRESS_LIST', '{"method":"PCQ_ADDRESS_LIST","addressList":"subscribers"}'::jsonb,
              'RESERVED'
         FROM ipv4_networks n
        WHERE n.id = $3 AND n.tenant_id = $2`,
      [provisioningId, provisioningTenantId, targetNetworkId],
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
    const cidr = input.cidr ?? '10.31.0.0/24';
    const gateway = input.gateway ?? '10.31.0.1';
    // Gateway legado con máscara: la cadena solo lo admite como fila previa a 165, que añadió
    // ck_ipv4_gateway_host NOT VALID. Se reproduce ese estado retirando la restricción solo para
    // este INSERT y reponiéndola NOT VALID, igual que la deja la migración.
    const legacyMaskedGateway = gateway.includes('/');
    await run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        // ex_ipv4_networks_overlap (160) prohíbe redes solapadas del mismo tenant: los casos
        // parametrizados reutilizan el CIDR, así que se retira la red sintética anterior, que no
        // conserva reservas porque esos casos se rechazan.
        await qr.query('DELETE FROM ipv4_networks WHERE tenant_id = $1 AND cidr && $2::cidr', [
          tenantId,
          cidr,
        ]);
        if (legacyMaskedGateway) {
          await qr.query('ALTER TABLE ipv4_networks DROP CONSTRAINT ck_ipv4_gateway_host');
        }
        await qr.query(
          `INSERT INTO ipv4_networks
            (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
             excluded_ips, default_control_method, status, created_by)
           VALUES ($1, $2, $3, $4, $5::cidr, $6::inet, $7::inet, $8::inet, $9::inet[],
                   'PCQ_ADDRESS_LIST', 'ACTIVE', $2)`,
          [
            id,
            tenantId,
            routerId,
            `Red IPAM ${id.slice(0, 8)}`,
            cidr,
            gateway,
            input.assignableFrom ?? '10.31.0.10',
            input.assignableTo ?? '10.31.0.250',
            input.excludedIps ?? [],
          ],
        );
        if (legacyMaskedGateway) {
          await qr.query(
            `ALTER TABLE ipv4_networks
               ADD CONSTRAINT ck_ipv4_gateway_host
               CHECK (
                 masklen(gateway) = 32
                 AND host(gateway) <> host(network(cidr))
                 AND host(gateway) <> host(broadcast(cidr))
               ) NOT VALID`,
          );
        }
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
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await insertProvisioning(qr, provisioningId, tenantId, targetNetworkId);
        return service.reserveIp(qr.manager, {
          networkId: targetNetworkId,
          provisioningId,
          ...(requestedIp ? { requestedIp } : {}),
        });
      }),
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
          await insertRouter(qr, inactiveRouterId, tenantId, 'INACTIVE');
        }
        // uq_network_interface_ipv4_address (165) es único por interfaz y host: cada dirección
        // local va en su propia interfaz inactiva del router inactivo.
        const interfaceId = randomUUID();
        await qr.query(
          `INSERT INTO network_router_interfaces
            (id, tenant_id, router_id, name, kind, status, created_by)
           VALUES ($1, $2, $3, $4, 'PHYSICAL', 'INACTIVE', $5)`,
          [interfaceId, tenantId, inactiveRouterId, `ether-${interfaceId.slice(0, 8)}`, tenantId],
        );
        await qr.query(
          `INSERT INTO network_router_interface_ipv4_addresses
            (tenant_id, router_id, interface_id, address, created_by)
           VALUES ($1, $2, $3, $4::inet, $5)`,
          [tenantId, inactiveRouterId, interfaceId, `${host}/${prefix}`, tenantId],
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
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query(`DROP SCHEMA IF EXISTS "${secondSchemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
        [tenantId, secondTenantId],
      ]);
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
      gateway: '10.40.0.10/25',
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
          const secondProvisioning = randomUUID();
          await insertRouter(qr, secondRouter, secondTenantId, 'ACTIVE');
          await qr.query(
            `INSERT INTO ipv4_networks
              (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
               default_control_method, status, created_by)
             VALUES ($1, $2, $3, 'Red IPAM segundo tenant', '10.42.0.0/24', '10.42.0.1',
                     '10.42.0.10', '10.42.0.20', 'PCQ_ADDRESS_LIST', 'ACTIVE', $2)`,
            [secondNetwork, secondTenantId, secondRouter],
          );
          await insertProvisioning(qr, secondProvisioning, secondTenantId, secondNetwork);
          await expect(
            service.reserveIp(qr.manager, {
              networkId: secondNetwork,
              provisioningId: secondProvisioning,
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
